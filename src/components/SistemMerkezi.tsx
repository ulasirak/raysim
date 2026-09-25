"use client";

// raysim — SİSTEM MERKEZİ.
// (1) Paylaşılan simülasyon parametreleri — buradan değiştir, tüm modüllere canlı
//     yansır (localStorage'da kalıcı). (2) Canlı sistem durumu — mevcut config +
//     örnek seed'le ring loop anlık çözülür. (3) Bilgi /
//     challenge referansı — sistemin karşıladığı gerçek-hayat durumları.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { brand } from "@/lib/anaray/brand";
import { sure, kmh } from "@/lib/anaray/format";
import { AutoAciklama } from "@/components/AutoAciklama";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { Duyarlilik } from "@/components/Duyarlilik";
import { DogrulamaPaneli } from "@/components/DogrulamaPaneli";
import { KilitlemePaneli } from "@/components/KilitlemePaneli";
import { KararDestekPaneli } from "@/components/KararDestekPaneli";
import { RobustFiloPaneli } from "@/components/RobustFiloPaneli";
import { CakismaCozumPaneli } from "@/components/CakismaCozumPaneli";
import { Kart } from "@/components/Kart";
import { MiniStat, Durum } from "@/components/Kpi";
import { TabBar } from "@/components/Tabs";
import { Kaynak } from "@/components/Kaynak";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { blockingTimeRing, type BlokSperr } from "@/lib/anaray/blockingtime";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { loopToHat } from "@/lib/anaray/hatsim";
import { BlockingStairChart } from "@/components/BlockingStairChart";
import { KisitKarsilastirma } from "@/components/KisitKarsilastirma";
import { TurnbackKapasite } from "@/components/TurnbackKapasite";
import { HemzeminAnaliz } from "@/components/HemzeminAnaliz";
import { GrafikCerceve } from "@/components/GrafikCerceve";
import { CK, RAMP_BLUE, SERI } from "@/lib/anaray/chartkit";
import { useDil } from "@/components/DilProvider";

const OK = CK.good;

// Sekmeli gruplar — paylaşılan TabBar (saf CSS, freeze-güvenli, önek "sm"). Bkz. Tabs.tsx.
// TabBar radioları + .sm-bar ile .sm-panel'ler AYNI kapsayıcının kardeşidir; biri
// seçiliyken ilgili panel görünür. Başlık/parametre/footer sarmalanmadığı için her
// zaman görünür. (Kapalı panel içerikleri DOM'da render olur; hesap yükü değişmez.)
// Blocking-time 6 bileşeni ZAMAN SIRALI → kategorik değil ordinal rampa (raporla aynı).
const BT_PARCA: [string, string][] = [
  ["Setup (rota kurma)", RAMP_BLUE[0]], ["Görme", RAMP_BLUE[1]], ["Yaklaşma", RAMP_BLUE[2]],
  ["Seyir", RAMP_BLUE[3]], ["Temizleme", RAMP_BLUE[4]], ["Release (serbest)", RAMP_BLUE[5]],
];

// Bir bloğun blocking-time'ını NE tıkıyor? 6 bileşeni 3 düzeltilebilir gruba
// indirger, baskın olanı bulur ve KULLANICININ nereden düzelteceğini söyler.
// hedef: hangi modül bölümüne yönlendirileceği (#slug ankoru).
// `nedenSunum`: bloğun rezerve süresini "tıkıyor/baskın/darboğaz" sorun diliyle değil,
// olağan tasarım bilgisi olarak anlatan NÖTR ifade — müşteri sunumu (PDF) için saklanır.
type BlokNeden = { grup: string; icon: string; neden: string; nedenSunum: string; cozum: string; hedef: "ringler" | "sefer" };
function blokNeden(b: BlokSperr): BlokNeden {
  const seyir = b.tRunning + b.tApproach;   // mesafe + hız
  const manevra = b.tSetup + b.tRelease;    // makas tanzim + route release
  const temizle = b.tClearing;              // tren boyu / çıkış hızı
  const en = Math.max(seyir, manevra, temizle);
  if (en === manevra && b.makasBlok && manevra > 0) return {
    grup: "Makas tanzim + release", icon: "⑂",
    neden: "Makas rotası kurma (tanzim) ve serbest bırakma süresi bu bloğu tıkıyor.",
    nedenSunum: "Bu bloğun rezerve süresini makas tanzim + serbest bırakma adımları belirliyor.",
    cozum: "Ringler'de bu durak-arasındaki makasın adım sayısını/süresini ya da route release'i azalt.",
    hedef: "ringler",
  };
  if (en === temizle) return {
    grup: "Tren boyu", icon: "▭",
    neden: "Tren boyunun bloğu terk süresi baskın (uzun araç veya düşük çıkış hızı).",
    nedenSunum: "Bu bloğun rezerve süresini tren boyunun bloğu terk süresi belirliyor.",
    cozum: "Sefer modülünde daha kısa araç seç ya da bu kesimde sahasal hızı artır.",
    hedef: "sefer",
  };
  return {
    grup: "Mesafe / hız", icon: "↔",
    neden: "Durak arası mesafe uzun veya sahasal hız düşük → seyir + yaklaşma süresi baskın.",
    nedenSunum: "Bu bloğun rezerve süresini durak arası seyir + yaklaşma süresi belirliyor.",
    cozum: "Ring Ekle bölümünde bu durak-arasının MESAFESİNİ kısalt (ya da sahasal hızı artır).",
    hedef: "ringler",
  };
}

export function SistemMerkezi() {
  const { t } = useDil();
  const tt = t; // teshis.map((t)=>…) yerel gölgelemesi için alias (o blokta tt kullan)
  const { cfg } = useSimConfig();
  const { rings: ringsHam } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();
  // Yolcu dinamiği: dwell OTO ringlerin dwell'i hesaplanır → blocking-time / teşhis
  // panelleri de hesaplı dwell'i kullanır (kapasite ile tutarlı).
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  const maks = useMemo(() => (rings.length ? maksimumTren(rings, stock, cfg, isletme) : null), [rings, stock, cfg, isletme]);
  // Ekran HER ZAMAN gerçek değerleri gösterir (mod yok): İHLAL/aşım işaretleri ve
  // min headway'i belirleyen "KRİTİK" blok kırmızıyla açıkça gösterilir. Müşteriye
  // "onaylı tasarım" olarak sunma (greenwashing) yalnız PDF dışa-aktarımına özgüdür
  // ve Belgeler'deki "müşteri sunumu" seçeneğiyle rapor.ts içinde uygulanır.
  const kritikRenk = CK.red;
  const kritikAd = t({ tr: "kritik", en: "critical", de: "kritisch" });
  const kritikBg = CK.badBgSoft;

  // Hat boşken (yeni hesap / yeni proje) çözülecek bir şey yoktur: canlı durum ve
  // blocking-time panelleri gizlenir, parametre girişi açık kalır.
  const bosHat = rings.length === 0;
  const bt = useMemo(() => (rings.length ? blockingTimeRing(rings, stock, cfg, isletme.kalkisOluZamaniSn) : null), [rings, stock, cfg, isletme.kalkisOluZamaniSn]);
  // Blok analizi ağır alt-bölümleri çekmecede (drawer) — tıklayınca açılır/kapanır.
  const [blokAcik, setBlokAcik] = useState({ merdiven: false, bilesen: false, teshis: false });
  const blokTopla = (k: "merdiven" | "bilesen" | "teshis") => setBlokAcik((a) => ({ ...a, [k]: !a[k] }));

  // Blok → durak-arası (ring) eşlemesi + neden analizi. Her blok, hangi ring'in
  // içine düştüğüyle adlandırılır; blokNeden ile darboğazın sebebi ve çözüm yeri
  // bulunur. Süreye göre azalan sıralı (en kritik blok en üstte).
  const btModel = useMemo(() => (rings.length ? loopToHat(rings, true, cfg) : null), [rings, cfg]);
  const teshis = useMemo(() => {
    if (!bt || !btModel) return [];
    const rb = btModel.ringBounds;
    const ringAt = (s: number) => { for (let r = 0; r < rb.length - 1; r++) if (s < rb[r + 1] - 1e-6) return r; return Math.max(0, rb.length - 2); };
    return bt.bloklar
      .map((b) => {
        const ri = ringAt((b.start + b.end) / 2);
        const ring = rings[ri];
        return { b, ri, ring, ad: ring ? `${ring.fromAd} → ${ring.toAd}` : `Blok #${b.i}`, ...blokNeden(b) };
      })
      .sort((a, z) => z.b.toplam - a.b.toplam);
  }, [bt, btModel, rings]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">{t({ tr: "Sistem Merkezi — Canlı Durum & Kapasite Analizi", en: "System Center — Live Status & Capacity Analysis", de: "Systemzentrale — Live-Status & Kapazitätsanalyse" })}</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{t({ tr: "RaySim Canlı Durum & Bilgi Merkezi", en: "RaySim Live Status & Information Center", de: "RaySim Live-Status- & Informationszentrale" })}</h1>
        </div>
      </div>

      {bosHat && (
        <div className="mb-6 rounded border-l-4 px-4 py-3 text-sm" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
          {t({ tr: "▲ Bu hatta henüz ring (durak arası hücre) yok — canlı durum ve kapasite panelleri gizlendi. Parametreleri header'daki (üst çubuk) ", en: "▲ This line has no rings (inter-stop cells) yet — live status and capacity panels are hidden. Set the parameters from the ", de: "▲ Diese Linie hat noch keine Ringe (Zwischenhaltstellen-Zellen) — Live-Status- und Kapazitätspanels sind ausgeblendet. Stellen Sie die Parameter über die Schaltfläche " })}<b>⚙ {t({ tr: "Parametreler", en: "Parameters", de: "Parameter" })}</b>{t({ tr: " butonundan, hattı ", en: " in the header (top bar), and build the line from the ", de: " in der Kopfzeile (obere Leiste) ein und bauen Sie die Linie über das " })}
          <Link href="/ringler" className="underline">{t({ tr: "Ringler modülünden", en: "Ringler module", de: "Ringler-Modul" })}</Link>{t({ tr: " kurabilirsiniz.", en: ".", de: " auf." })}
        </div>
      )}

      {!bosHat && (<>
      <TabBar pre="sm"
        etiketler={[
          t({ tr: "① Kapasite & Kısıt", en: "① Capacity & Constraint", de: "① Kapazität & Engpass" }),
          t({ tr: "② Terminal & Yol", en: "② Terminal & Track", de: "② Endstelle & Strecke" }),
          t({ tr: "③ Motor Doğruluğu", en: "③ Engine Accuracy", de: "③ Engine-Genauigkeit" }),
          t({ tr: "④ Filo Kararı", en: "④ Fleet Decision", de: "④ Flottenentscheidung" }),
        ]}
        durumlar={[bt ? (!bt.hedefUygun ? "ihlal" : bt.dolulukHedef > 80 ? "uyari" : "") : "", "", "", ""]} />

      <section className="sm-panel" data-t="1">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Hattı fiziksel olarak hangi kısıt bağlıyor — blok işgali (Sperrzeit), rakip headway kısıtları, sinyal ve kilitleme.", en: "Which constraint physically governs the line — block occupancy (Sperrzeit), competing headway constraints, signalling and interlocking.", de: "Welcher Engpass die Linie physisch bestimmt — Blockbelegung (Sperrzeit), konkurrierende Zugfolgezeit-Engpässe, Signalisierung und Verschluss (Interlocking)." })}</p>

      {/* Blocking-Time (Sperrzeitentreppe) + UIC 406 */}
      {bt && (
      <Panel baslik={t({ tr: "Blocking-Time / Sperrzeitentreppe (blok işgal süresi) & UIC 406 Kapasite", en: "Blocking-Time / Sperrzeitentreppe (block occupancy time) & UIC 406 Capacity", de: "Sperrzeit / Sperrzeitentreppe (Blockbelegungszeit) & UIC 406 Kapazität" })} aciklama={t({ tr: "Her sinyal bloğunun rezerve süresi = 6 bileşen (rota kurma + görme + yaklaşma + seyir + temizleme + release). En yüksek blocking-time'lı blok min headway'i belirler; UIC 406 doluluk = min headway / hedef headway.", en: "Each signal block's reserved time = 6 components (route setup + sighting + approach + running + clearing + release). The block with the highest blocking-time sets the min headway; UIC 406 utilization = min headway / target headway.", de: "Die Sperrzeit jedes Signalblocks = 6 Komponenten (Fahrstraßenbildung + Sicht + Annäherung + Fahrt + Räumung + Auflösung). Der Block mit der höchsten Sperrzeit bestimmt die Zugfolgezeit; UIC-406-Auslastung = Zugfolgezeit / Ziel-Zugfolgezeit." })}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat etiket={`${t({ tr: "Min headway (", en: "Min headway (", de: "Zugfolgezeit (" })}${kritikAd}${t({ tr: " blok)", en: " block)", de: " Block)" })}`} deger={sure(bt.minHeadway)} alt={`${t({ tr: "blok #", en: "block #", de: "Block #" })}${bt.kritikBlok}${bt.bloklar[bt.kritikBlok]?.makasBlok ? t({ tr: " (makas)", en: " (switch)", de: " (Weiche)" }) : ""}`} vurgu={kritikRenk} />
          <MiniStat etiket={t({ tr: "Teorik kapasite", en: "Theoretical capacity", de: "Theoretische Kapazität" })} deger={`${bt.teorikKapasite.toFixed(0)}/sa`} alt={t({ tr: "tren/saat üst sınır", en: "trains/hour upper bound", de: "Züge/Stunde Obergrenze" })} />
          <MiniStat etiket={t({ tr: "İşletme kapasitesi", en: "Operating capacity", de: "Betriebskapazität" })} deger={`${bt.pratikKapasite.toFixed(0)}/sa`} alt={`UIC 406 ${t({ tr: "%", en: "", de: "" })}${(bt.dolulukTavani * 100).toFixed(0)}${t({ tr: " tavan", en: "% cap", de: " % Obergrenze" })}`} vurgu={OK} />
          <MiniStat etiket={t({ tr: "UIC 406 doluluk", en: "UIC 406 utilization", de: "UIC 406 Auslastung" })} deger={`%${bt.dolulukHedef.toFixed(0)}`} alt={`${t({ tr: "hedef ", en: "target ", de: "Ziel " })}${bt.hedefHeadway} s`} vurgu={bt.dolulukHedef > 80 ? CK.red : bt.dolulukHedef > 60 ? CK.amber : OK} />
          <MiniStat etiket={t({ tr: "Hedef headway", en: "Target headway", de: "Ziel-Zugfolgezeit" })} deger={<Durum tip={bt.hedefUygun ? "uygun" : "ihlal"} />} />
        </div>

        {/* Sperrzeitentreppe — GERÇEK zaman-mesafe merdiveni (kanonik) */}
        <BlokCekmece baslik={t({ tr: "Sperrzeitentreppe — zaman-mesafe merdiveni (iki ardışık tren)", en: "Sperrzeitentreppe — time-distance staircase (two consecutive trains)", de: "Sperrzeitentreppe — Zeit-Weg-Treppe (zwei aufeinanderfolgende Züge)" })} acik={blokAcik.merdiven} onToggle={() => blokTopla("merdiven")}
          ozet={<span>{t({ tr: "min headway ", en: "min headway ", de: "Zugfolgezeit " })}{sure(bt.minHeadway)}</span>}>
          <div className="rounded border p-2" style={{ borderColor: brand.border }}>
            <BlockingStairChart bloklar={bt.bloklar} L={bt.toplamUzunluk} minHeadway={bt.minHeadway} kritikBlok={bt.kritikBlok} yorunge={bt.yorunge} kritikRenk={kritikRenk} kritikAd={kritikAd} />
          </div>
          <p className="mt-1.5 text-xs" style={{ color: brand.muted }}>
            {t({ tr: "Her dikdörtgen bir sinyal bloğunun rezerve süresi (blocking-time); dikey = blok uzunluğu, yatay = süre. İki merdiven ", en: "Each rectangle is a signal block's reserved time (blocking-time); vertical = block length, horizontal = duration. Two staircases ", de: "Jedes Rechteck ist die Sperrzeit eines Signalblocks; vertikal = Blocklänge, horizontal = Dauer. Zwei Treppen " })}
            <span style={{ color: kritikRenk }}>{kritikAd}{t({ tr: " blokta", en: " block", de: " Block" })}</span>{t({ tr: " tam değer → o an sürdürülebilir min headway.", en: " touch fully → the sustainable min headway at that point.", de: " berühren sich vollständig → die dort nachhaltige Zugfolgezeit." })}
            <span style={{ color: SERI.duzBlok }}> ■</span>{t({ tr: " düz blok · ", en: " plain block · ", de: " Block · " })}<span style={{ color: SERI.makasBlok }}>■</span>{t({ tr: " makas bloğu.", en: " switch block.", de: " Weichenblock." })}
          </p>
        </BlokCekmece>

        {/* Blok başına bileşen dökümü (yardımcı görünüm) */}
        <BlokCekmece baslik={t({ tr: "Blok başına blocking-time bileşenleri (6 parça yığını)", en: "Blocking-time components per block (6-part stack)", de: "Sperrzeit-Komponenten je Block (6-teiliger Stapel)" })} acik={blokAcik.bilesen} onToggle={() => blokTopla("bilesen")}
          ozet={<span>{bt.bloklar.length}{t({ tr: " blok", en: " blocks", de: " Blöcke" })}</span>}>
          {/* Yükseklik zinciri: h-40 (kesin) → sütun h-full → bar alanı flex-1 (kesin)
              → bar `%`. Ara sarmalayıcı olmadan yüzde yükseklik çözülmez (barlar
              minHeight'a düşer, grafik boş görünür). */}
          <div className="flex h-40 items-stretch gap-1">
            {bt.bloklar.map((b) => {
              const mx = Math.max(1, ...bt.bloklar.map((x) => x.toplam));
              const sureler = [b.tSetup, b.tSighting, b.tApproach, b.tRunning, b.tClearing, b.tRelease];
              const parcalar: [number, string][] = BT_PARCA.map(([, c], j) => [sureler[j], c]);
              const kritik = b.i === bt.kritikBlok;
              return (
                <div key={b.i} className="flex h-full flex-1 flex-col items-center gap-0.5" title={`${t({ tr: "Blok #", en: "Block #", de: "Block #" })}${b.i}: ${b.toplam.toFixed(0)} s${b.makasBlok ? t({ tr: " (makas)", en: " (switch)", de: " (Weiche)" }) : ""}`}>
                  <div className="flex w-full min-h-0 flex-1 flex-col justify-end">
                    <div className="flex w-full flex-col justify-end overflow-hidden rounded-t" style={{ height: `${(b.toplam / mx) * 100}%`, minHeight: 3, outline: kritik ? `2px solid ${kritikRenk}` : "none" }}>
                      {parcalar.map(([v, c], j) => v > 0 && <div key={j} style={{ height: `${(v / b.toplam) * 100}%`, background: c }} />)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.55rem]" style={{ color: kritik ? kritikRenk : CK.faint }}>{b.i}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[0.6rem]" style={{ color: brand.muted }}>
            {BT_PARCA.map(([ad, c]) => (
              <span key={ad} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{ad}</span>
            ))}
            <span className="ml-1" style={{ color: CK.faint }}>{t({ tr: "(açıktan koyuya = zaman sırası)", en: "(light to dark = time order)", de: "(hell zu dunkel = zeitliche Reihenfolge)" })}</span>
          </div>
        </BlokCekmece>

        {/* Blok teşhisi & çözüm — her blok hangi durak-arasına düşüyor, darboğazın
            nedeni ne ve nereden düzeltilir; buton doğrudan o ring'e/bölüme götürür. */}
        <BlokCekmece baslik={t({ tr: "🔧 Blok Teşhisi & Çözüm", en: "🔧 Block Diagnosis & Fix", de: "🔧 Blockdiagnose & Lösung" })} acik={blokAcik.teshis} onToggle={() => blokTopla("teshis")}
          ozet={<span>{teshis.length}{t({ tr: " blok", en: " blocks", de: " Blöcke" })}{bt && teshis.some((t) => t.b.toplam > bt.hedefHeadway) ? t({ tr: " · aşım", en: " · exceeded", de: " · Überschreitung" }) : ""}</span>}>
          <p className="mb-2.5 text-xs" style={{ color: brand.muted }}>
            {t({ tr: "Her blok, düştüğü ", en: "Each block is named by the ", de: "Jeder Block wird nach dem " })}<b>{t({ tr: "durak-arası (ring)", en: "inter-stop (ring)", de: "Zwischenhaltstellen-Abschnitt (Ring)" })}</b>{t({ tr: " ile adlandırılır; en kritik blok en üstte. Darboğazın nedeni ve nereden düzelteceğin yanında — ", en: " it falls into; the most critical block is at the top. The bottleneck's cause and where to fix it are shown alongside — ", de: ", in den er fällt, benannt; der kritischste Block steht oben. Ursache des Engpasses und wo er zu beheben ist stehen daneben — " })}<b>{t({ tr: "buton doğrudan o ring'e/bölüme götürür", en: "the button takes you straight to that ring/section", de: "die Schaltfläche führt direkt zu diesem Ring/Abschnitt" })}</b>.
          </p>
          {teshis.length === 0 ? (
            <p className="text-xs" style={{ color: brand.muted }}>{t({ tr: "Değerlendirilecek blok yok.", en: "No blocks to evaluate.", de: "Keine Blöcke zu bewerten." })}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {teshis.map((t) => {
                const kritik = bt && t.b.i === bt.kritikBlok;
                const asiyor = bt ? t.b.toplam > bt.hedefHeadway : false;
                const renk = kritik || asiyor ? kritikRenk : brand.border;
                const href = t.hedef === "ringler" && t.ring ? `/#ring-${t.ring.id}` : "/#sefer";
                return (
                  <div key={t.b.i} className="rounded border p-2.5 text-xs" style={{ borderColor: renk, background: kritik ? kritikBg : "transparent" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 font-mono font-semibold" style={{ background: kritik ? kritikRenk : CK.track, color: kritik ? "#fff" : brand.inkSoft }}>{tt({ tr: "Blok ", en: "Block ", de: "Block " })}{t.b.i}</span>
                      <span className="font-medium" style={{ color: brand.ink }}>{t.ad}</span>
                      <span className="font-mono" style={{ color: asiyor ? CK.red : brand.muted }}>{sure(t.b.toplam)}</span>
                      {kritik && <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold" style={{ background: kritikRenk, color: "#fff" }}>{tt({ tr: "KRİTİK — min headway", en: "CRITICAL — min headway", de: "KRITISCH — Zugfolgezeit" })}</span>}
                      {asiyor && !kritik && <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold" style={{ background: CK.amberBg, color: CK.amberInk }}>{tt({ tr: "hedefi aşıyor", en: "exceeds target", de: "überschreitet Ziel" })}</span>}
                      <a href={href} className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90" style={{ background: brand.ink }}>
                        {t.hedef === "ringler" ? tt({ tr: "→ Ringler'de düzelt", en: "→ Fix in Ringler", de: "→ In Ringler korrigieren" }) : tt({ tr: "→ Sefer'de düzelt", en: "→ Fix in Sefer", de: "→ In Sefer korrigieren" })}
                      </a>
                    </div>
                    <div className="mt-1.5" style={{ color: brand.inkSoft }}>
                      <b>{t.icon} {t.grup}:</b> {t.neden}<span style={{ color: brand.muted }}> · Çözüm: {t.cozum}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BlokCekmece>
      </Panel>
      )}

      {/* BELİRLEYİCİ KISIT — hMin'i oluşturan rakip headway kısıtları yan yana (hangisi bağlar) */}
      {maks && maks.gecerli && maks.kisitlar.length > 0 && (
        <Panel ozet={<><b>{maks.baglayanAd}</b>{t({ tr: " bağlıyor · ", en: " governs · ", de: " bestimmt · " })}{sure(maks.hMin)}</>} baslik={t({ tr: "Belirleyici Kısıt — Rakip Headway Kısıtları", en: "Governing Constraint — Competing Headway Constraints", de: "Maßgebender Engpass — Konkurrierende Zugfolgezeit-Engpässe" })} aciklama={t({ tr: "Min headway (hMin) beş rakip kısıdın EN YÜKSEĞİdir: blok (Sperrzeit) · terminal turnback (makas geometrisi) · tek hat · kavşak · sinyal. En uzun çubuk hattı bağlar. Diğerlerinin ne kadar geride olduğu, o kısıtta ne kadar pay (headway marjı) olduğunu gösterir — bir kısıt iyileştirilirse sıradaki bağlar. Tramvay hatlarında çoğu kez terminal turnback bağlar.", en: "The min headway (hMin) is the HIGHEST of five competing constraints: block (Sperrzeit) · terminal turnback (switch geometry) · single track · junction · signal. The longest bar governs the line. How far the others trail shows how much margin (headway slack) remains in that constraint — if one constraint is improved, the next one governs. On tram lines terminal turnback usually governs.", de: "Die Zugfolgezeit (hMin) ist die HÖCHSTE von fünf konkurrierenden Engpässen: Block (Sperrzeit) · Endstellen-Wende (Weichengeometrie) · Eingleis · Kreuzung · Signal. Der längste Balken bestimmt die Linie. Wie weit die anderen zurückliegen, zeigt, wie viel Reserve (Zugfolgezeit-Spielraum) in diesem Engpass verbleibt — wird ein Engpass verbessert, bestimmt der nächste. Auf Straßenbahnlinien bestimmt meist die Endstellen-Wende." })}>
          <KisitKarsilastirma kisitlar={maks.kisitlar} kritikRenk={kritikRenk} />
          <Kaynak etiket={t({ tr: "Bağlayan kısıtı nereden iyileştirirsin", en: "Where to improve the governing constraint", de: "Wo Sie den maßgebenden Engpass verbessern" })} yerler={[{ ad: t({ tr: "Ringler (makas/terminal/sinyal)", en: "Ringler (switch/terminal/signal)", de: "Ringler (Weiche/Endstelle/Signal)" }), href: "/#ringler" }, "parametreler"]} />

          {/* KAVŞAK SPERRZEIT DÖKÜMÜ — kritik düz kavşağın blocking-time bileşenleri.
              Kavşak kısıtı varsa gösterilir: neden bu kadar? Tren boyu kavşağı ne kadar
              işgal ediyor (eski model bunu yok sayıyordu). */}
          {maks.kavsakDetay && (
            <div className="mt-4 rounded-md border p-3" style={{ borderColor: brand.border, background: brand.paper }}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold" style={{ color: brand.ink }}>
                  {t({ tr: "Kritik kavşak blocking-time — ", en: "Critical junction blocking-time — ", de: "Kritische Kreuzungs-Sperrzeit — " })}{maks.kavsakDetay.ad.replace(/^Kavşak — /, "")}
                </span>
                <span className="text-xs tabular-nums" style={{ color: maks.baglayanAnahtar === "kavsak" ? kritikRenk : brand.muted }}>
                  {Math.round(maks.kavsakDetay.isgal)} s
                  <span style={{ color: brand.faint }}> (×{maks.kavsakDetay.faktor})</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem]" style={{ color: brand.inkSoft }}>
                <span>{t({ tr: "tanzim ", en: "setup ", de: "Bildung " })}<b>{Math.round(maks.kavsakDetay.tSetup)} s</b></span>
                <span>{t({ tr: "görme ", en: "sighting ", de: "Sicht " })}<b>{maks.kavsakDetay.tGorme} s</b></span>
                <span>{t({ tr: "geçiş + ", en: "transit + ", de: "Durchfahrt + " })}<b>{Math.round(stock.length)} m</b>{t({ tr: " tren temizleme ", en: " train clearing ", de: " Zugräumung " })}<b>{Math.round(maks.kavsakDetay.tGecis)} s</b></span>
                <span>{t({ tr: "release ", en: "release ", de: "Auflösung " })}<b>{Math.round(maks.kavsakDetay.tRelease)} s</b></span>
                <span style={{ color: brand.muted }}>{t({ tr: "= tek geçiş ", en: "= single transit ", de: "= Einzeldurchfahrt " })}{Math.round(maks.kavsakDetay.tekGecis)} s</span>
              </div>
              <div className="mt-1.5 text-[0.7rem]" style={{ color: brand.muted }}>
                {t({ tr: "Fouling bölgesi ", en: "The fouling zone ", de: "Der Gefahrraum " })}{Math.round(maks.kavsakDetay.foulUzunluk)}{t({ tr: " m (kısıt bölgesi + tren boyu) ", en: " m (constraint zone + train length) ", de: " m (Engpassbereich + Zuglänge) " })}{Math.round(maks.kavsakDetay.gecisHizi * 3.6)}{t({ tr: " km/h geçiş hızında temizlenir; karşı-yön varış+kalkış crossover'ı sırayla kullandığından ×", en: " km/h transit speed clears it; since the opposing-direction arrival+departure use the crossover in sequence, ×", de: " km/h Durchfahrtsgeschwindigkeit räumt ihn; da Ankunft+Abfahrt der Gegenrichtung den Crossover nacheinander nutzen, ×" })}{maks.kavsakDetay.faktor}{t({ tr: ". Uzun araç kavşağı daha uzun işgal eder.", en: ". A longer vehicle occupies the junction longer.", de: ". Ein längeres Fahrzeug belegt die Kreuzung länger." })}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Kilitleme (Interlocking) Kontrol Tablosu — sinyalizasyon kümesinde (rota/makas/kilit). */}
      <Kapanir baslik={t({ tr: "Kilitleme (Interlocking) Kontrol Tablosu", en: "Interlocking Control Table", de: "Verschluss-(Interlocking-)Verschlusstabelle" })} ozet={t({ tr: "rota tesisi · makas konumu · kilit", en: "route setting · switch position · lock", de: "Fahrstraße · Weichenlage · Verschluss" })}><KilitlemePaneli /></Kapanir>
      </section>

      <section className="sm-panel" data-t="2">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Terminal dönüş (turnback) kapasitesi ve sokak geçitlerinin (hemzemin/TSP) tur süresine katkısı.", en: "Terminal turnback capacity and street crossings' (level crossing/TSP) contribution to round-trip time.", de: "Endstellen-Wendekapazität und der Beitrag der Straßenübergänge (Bahnübergang/ÖPNV-Bevorrechtigung) zur Umlaufzeit." })}</p>

      {/* TERMİNAL TURNBACK KAPASİTESİ — iki ucun makas geometrisi → dönüş kapasitesi */}
      {rings.length > 0 && (<>
      <Panel ozet={t({ tr: "iki uç · makas/peron → dönüş kapasitesi", en: "two ends · switch/platform → turnback capacity", de: "zwei Enden · Weiche/Bahnsteig → Wendekapazität" })} baslik={t({ tr: "Terminal Turnback Kapasitesi", en: "Terminal Turnback Capacity", de: "Endstellen-Wendekapazität" })} aciklama={t({ tr: "Her uçtaki dönüş (turnback) kapasitesi, makas geometrisinden (S/X sayısı), peron sayısından ve boğaz işgalinden hesaplanır. Tramvay hatlarında hattın kapasitesini çoğu kez terminal dönüşü bağlar; iki uç yan yana, hangisinin ve hangi alt-etkenin (peron mu boğaz/makas mı) bağladığı gösterilir.", en: "The turnback capacity at each end is computed from switch geometry (S/X count), platform count and throat occupancy. On tram lines the terminal turnback usually governs the line's capacity; the two ends are shown side by side, revealing which one — and which sub-factor (platform or throat/switch) — governs.", de: "Die Wendekapazität an jedem Ende ergibt sich aus der Weichengeometrie (S/X-Anzahl), der Bahnsteiganzahl und der Halsbereichsbelegung. Auf Straßenbahnlinien bestimmt meist die Endstellen-Wende die Kapazität der Linie; die beiden Enden stehen nebeneinander und zeigen, welches — und welcher Teilfaktor (Bahnsteig oder Halsbereich/Weiche) — bestimmt." })}>
        <TurnbackKapasite terminalBas={isletme.terminalBas} terminalSon={isletme.terminalSon} cfg={cfg} />
        <Kaynak etiket={t({ tr: "Terminal girdileri", en: "Terminal inputs", de: "Endstellen-Eingaben" })} yerler={[{ ad: t({ tr: "Makas/peron → Ringler (Maksimum Tramvay)", en: "Switch/platform → Ringler (Maximum Tram)", de: "Weiche/Bahnsteig → Ringler (Maximale Straßenbahn)" }), href: "/#ringler" }, "parametreler"]} />
      </Panel>

      {/* HEMZEMİN GEÇİT & TSP GECİKME — sokak geçitlerinin tur süresine katkısı */}
      <Panel ozet={t({ tr: "geçit yavaşlama + bekleme (TSP) → tur süresi", en: "crossing slowdown + wait (TSP) → round-trip time", de: "Übergangs-Verlangsamung + Wartezeit (TSP) → Umlaufzeit" })} baslik={t({ tr: "Hemzemin Geçit & Sinyal Önceliği (TSP) Gecikmesi", en: "Level Crossing & Signal Priority (TSP) Delay", de: "Bahnübergang & ÖPNV-Bevorrechtigung (TSP) Verzögerung" })} aciklama={t({ tr: "Tramvay sokakta çok geçitli çalışır. Her geçit iki gecikme üretir: yavaşlama (geçit hızına düşme) ve karayolu geçidinde bekleme (trafik/sinyal önceliği). Bekleme, TSP'nin doğrudan ölçüsüdür — iyi öncelik düşük bekleme demektir. Grafik geçitlerin tur süresine katkısını hat boyunca gösterir.", en: "Trams run on the street with many crossings. Each crossing creates two delays: slowdown (dropping to the crossing speed) and, at road crossings, waiting (traffic/signal priority). The wait is a direct measure of TSP — good priority means low waiting. The chart shows each crossing's contribution to round-trip time along the line.", de: "Straßenbahnen fahren mit vielen Übergängen auf der Straße. Jeder Übergang erzeugt zwei Verzögerungen: Verlangsamung (Absenken auf die Übergangsgeschwindigkeit) und, an Bahnübergängen, Wartezeit (Verkehr/ÖPNV-Bevorrechtigung). Die Wartezeit ist ein direktes Maß der TSP — gute Bevorrechtigung bedeutet geringe Wartezeit. Das Diagramm zeigt den Beitrag jedes Übergangs zur Umlaufzeit entlang der Linie." })}>
        <GrafikCerceve baslik={t({ tr: "Hemzemin Geçit & TSP Gecikmesi", en: "Level Crossing & TSP Delay", de: "Bahnübergang & TSP-Verzögerung" })}><HemzeminAnaliz rings={rings} cfg={cfg} cevrimSn={maks?.gecerli ? maks.cevrimSuresi : 0} /></GrafikCerceve>
        <Kaynak etiket={t({ tr: "Geçit girdileri", en: "Crossing inputs", de: "Übergangs-Eingaben" })} yerler={[{ ad: t({ tr: "Geçit yeri/tipi → Ringler", en: "Crossing location/type → Ringler", de: "Übergangsort/-typ → Ringler" }), href: "/#ringler" }, "parametreler"]} />
      </Panel>
      </>)}
      </section>

      <section className="sm-panel" data-t="3">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Sonuçların hangi girdiye ne kadar duyarlı olduğu (tornado) ve motorun analitik referanslara karşı doğrulanması (V&V). Derin analiz — açılır bloklarda.", en: "How sensitive the results are to each input (tornado) and validation of the engine against analytical references (V&V). Deep analysis — in the expandable blocks.", de: "Wie empfindlich die Ergebnisse auf jede Eingabe reagieren (Tornado) und die Verifikation der Engine gegen analytische Referenzen (V&V). Tiefenanalyse — in den aufklappbaren Blöcken." })}</p>

        {/* Duyarlılık (tornado) — hangi parametre kapasiteyi en çok oynatıyor. */}
        <Kapanir baslik={t({ tr: "Duyarlılık (Tornado)", en: "Sensitivity (Tornado)", de: "Empfindlichkeit (Tornado)" })} ozet={t({ tr: "hangi girdi kapasiteyi en çok oynatıyor", en: "which input moves capacity the most", de: "welche Eingabe die Kapazität am stärksten bewegt" })}>
          <Duyarlilik ringsHam={ringsHam} stock={stock} cfg={cfg} isletme={isletme} />
        </Kapanir>

        {/* Doğrulama & Geçerleme — motorun analitik referanslara karşı doğruluk sertifikasyonu. */}
        <Kapanir baslik={t({ tr: "Doğrulama & Geçerleme (V&V)", en: "Verification & Validation (V&V)", de: "Verifikation & Validierung (V&V)" })} ozet={t({ tr: "motor analitik referanslara karşı sertifikasyon", en: "engine certification against analytical references", de: "Engine-Zertifizierung gegen analytische Referenzen" })}><DogrulamaPaneli /></Kapanir>

      </section>

      <section className="sm-panel" data-t="4">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Aynı temel kapasiteden iki karar: operasyonel (istenen aralık) ve risk (dayanıklılık) — ve tek-hat çakışma çözümü.", en: "Two decisions from the same base capacity: operational (desired headway) and risk (robustness) — plus single-track conflict resolution.", de: "Zwei Entscheidungen aus derselben Grundkapazität: betrieblich (gewünschte Zugfolgezeit) und Risiko (Robustheit) — sowie Eingleis-Konfliktauflösung." })}</p>

      {/* FİLO & KAPASİTE KARARI — iki panelin ORTAK temeli tek yerde (tekrarı önler). */}
      {maks?.gecerli && (
        <div className="mt-8 rounded-lg border px-4 py-3" style={{ borderColor: brand.border, background: "#F8FAFC" }}>
          <div className="field-label">{t({ tr: "Filo & Kapasite kararı — temel kapasite (aşağıdaki iki panel bunu farklı açıdan kullanır)", en: "Fleet & Capacity decision — base capacity (the two panels below use it from different angles)", de: "Flotten- & Kapazitätsentscheidung — Grundkapazität (die beiden Panels unten nutzen sie aus verschiedenen Blickwinkeln)" })}</div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat etiket={t({ tr: "Çevrim (RTT)", en: "Cycle (RTT)", de: "Umlauf (RTT)" })} deger={sure(maks.cevrimSuresi)} />
            <MiniStat etiket={t({ tr: "Min headway (duvar)", en: "Min headway (wall)", de: "Zugfolgezeit (Grenze)" })} deger={sure(maks.hMin)} />
            <MiniStat etiket={t({ tr: "Kapasite duvarı", en: "Capacity wall", de: "Kapazitätsgrenze" })} deger={`${maks.nTeorik} araç`} />
            <MiniStat etiket={t({ tr: "Önerilen (sürdürülebilir)", en: "Recommended (sustainable)", de: "Empfohlen (nachhaltig)" })} deger={`${maks.nSurdurulebilir} araç`} vurgu={OK} />
          </div>
          <div className="mt-1.5 text-[0.68rem]" style={{ color: brand.muted }}>
            {t({ tr: "Aynı temel → iki farklı karar: ", en: "Same base → two different decisions: ", de: "Dieselbe Grundlage → zwei verschiedene Entscheidungen: " })}<b style={{ color: "#2350B8" }}>{t({ tr: "Operasyonel", en: "Operational", de: "Betrieblich" })}</b>{t({ tr: " (istenen aralığı hangi filo verir) · ", en: " (which fleet delivers the desired headway) · ", de: " (welche Flotte die gewünschte Zugfolgezeit liefert) · " })}<b>{t({ tr: "Risk", en: "Risk", de: "Risiko" })}</b>{t({ tr: " (gecikmeye rağmen güvenilirlik+konfor için min filo).", en: " (min fleet for reliability+comfort despite delays).", de: " (Mindestflotte für Zuverlässigkeit+Komfort trotz Verzögerungen)." })}
          </div>
          <Kaynak etiket={t({ tr: "Bu kapasiteyi belirleyen girdiler", en: "Inputs that set this capacity", de: "Eingaben, die diese Kapazität bestimmen" })} yerler={["parametreler", { ad: t({ tr: "Ringler (durak/makas/sinyal)", en: "Ringler (stop/switch/signal)", de: "Ringler (Haltestelle/Weiche/Signal)" }), href: "/#ringler" }]} />
        </div>
      )}

      {/* Karar Destek & Optimizasyon — OPERASYONEL: filo↔headway ödünleşimi + hedef-arama (F). */}
      <Kapanir baslik={t({ tr: "Operasyonel — Filo ↔ Sefer Aralığı", en: "Operational — Fleet ↔ Headway", de: "Betrieblich — Flotte ↔ Zugfolgezeit" })} ozet={t({ tr: "istenen aralığı hangi filo verir + hedef-arama", en: "which fleet delivers the desired headway + goal-seek", de: "welche Flotte die gewünschte Zugfolgezeit liefert + Zielsuche" })}><KararDestekPaneli /></Kapanir>

      {/* Robustluk-Kısıtlı Filo — RİSK: kapasite × Monte-Carlo; %X güvenilirlik + konfor altında min filo. */}
      <Kapanir baslik={t({ tr: "Risk — Robustluk-Kısıtlı Filo", en: "Risk — Robustness-Constrained Fleet", de: "Risiko — Robustheitsbeschränkte Flotte" })} ozet={t({ tr: "gecikmeye rağmen güvenilirlik+konfor için min filo", en: "min fleet for reliability+comfort despite delays", de: "Mindestflotte für Zuverlässigkeit+Komfort trotz Verzögerungen" })}><RobustFiloPaneli /></Kapanir>

      {/* Çakışma Çözücüsü — tek-hat meet/pass; kalkış-offset optimizasyonuyla çakışmasız çizelge. */}
      <Kapanir baslik={t({ tr: "Çakışma Çözücüsü (tek hat)", en: "Conflict Resolver (single track)", de: "Konfliktlöser (Eingleis)" })} ozet={t({ tr: "kalkış-offset ile çakışmasız çizelge", en: "conflict-free schedule via departure offset", de: "konfliktfreier Fahrplan über Abfahrts-Offset" })}><CakismaCozumPaneli /></Kapanir>
      </section>
      </>)}

      {/* Parametre düzenleme TEK yerde: header'daki ⚙ Parametreler. Burada tekrar
          gösterilmez (çift giriş kafa karıştırıyordu) — yalnız yönlendirme. */}
      <div className="mt-6 rounded-lg border border-dashed px-4 py-3 text-sm" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
        {t({ tr: "⚙ Simülasyon parametreleri header'daki ", en: "⚙ Simulation parameters are edited from the ", de: "⚙ Simulationsparameter werden über die " })}<b style={{ color: brand.ink }}>{t({ tr: "“⚙ Parametreler”", en: "“⚙ Parameters”", de: "„⚙ Parameter“" })}</b>{t({ tr: " butonundan düzenlenir — tek kaynak, her sayfadan erişilir. Yukarıdaki canlı durum ve kapasite panelleri bu değerlerle anlık çözülür.", en: " button in the header — a single source, reachable from every page. The live status and capacity panels above resolve instantly from these values.", de: " Schaltfläche in der Kopfzeile bearbeitet — eine einzige Quelle, von jeder Seite erreichbar. Die Live-Status- und Kapazitätspanels oben lösen sich sofort aus diesen Werten auf." })}
      </div>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        {t({ tr: "RaySim · Sistem Merkezi — parametreler tek kaynaktır; Ringler / Sefer / Sistem modülleri buradan okur. Değerler tarayıcıda saklanır (localStorage). Referans hızlar: ", en: "RaySim · System Center — parameters are the single source; the Ringler / Sefer / Sistem modules read from here. Values are stored in the browser (localStorage). Reference speeds: ", de: "RaySim · Systemzentrale — Parameter sind die einzige Quelle; die Module Ringler / Sefer / Sistem lesen von hier. Werte werden im Browser gespeichert (localStorage). Referenzgeschwindigkeiten: " })}{kmh(cfg.vAnahat).toFixed(0)}/{kmh(cfg.vSahasal).toFixed(0)}/{kmh(cfg.vMakas).toFixed(0)}/{kmh(cfg.vHemzemin).toFixed(0)} km/h.
      </footer>
    </div>
  );
}

// ————— yardımcılar —————
/** Bileşen paneli çekmecesi — ayrı bileşenleri (kendi kartı olanlar: Kilitleme, karar
 *  panelleri, V&V, tornado…) native <details> ile katlar. Kenarlıksız: kapalıyken yalnız
 *  başlık çubuğu, açıkken bileşenin kendi kartı altında görünür. JS/state YOK → freeze yok. */
function Kapanir({ baslik, ozet, children }: { baslik: string; ozet?: ReactNode; children: ReactNode }) {
  return (
    <details className="group mt-6">
      <summary className="flex cursor-pointer select-none items-baseline gap-2 rounded-lg border bg-white p-4" style={{ borderColor: brand.border }}>
        <span className="h-4 w-[3px] shrink-0" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-base font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
        {ozet && <span className="ml-auto text-right text-xs" style={{ color: brand.muted }}>{ozet}</span>}
        <span className="ml-2 shrink-0 text-xs" style={{ color: brand.faint }}><span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></span>
      </summary>
      {children}
    </details>
  );
}

/** Çekmece (drawer) — blok analizi ağır alt-bölümleri; tek tuşla aşağı açılıp kapanır. */
function BlokCekmece({ baslik, ozet, acik, onToggle, children }: { baslik: string; ozet?: ReactNode; acik: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="mt-4 rounded-md border" style={{ borderColor: brand.border, background: brand.surface }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="field-label" style={{ marginBottom: 0 }}>{baslik}</span>
        <span className="flex items-center gap-2 text-xs" style={{ color: brand.muted }}>{ozet}<span style={{ color: brand.inkSoft }}>{acik ? "▲" : "▼"}</span></span>
      </button>
      {acik && <div className="border-t px-3 py-3" style={{ borderColor: brand.border }}>{children}</div>}
    </div>
  );
}

function Panel({ baslik, aciklama, children, katlanir = false, ozet }: { baslik: string; aciklama?: string; children: React.ReactNode; katlanir?: boolean; ozet?: ReactNode }) {
  // Katlanır (çekmece) panel — native <details> (JS/state YOK → freeze riski yok).
  // Varsayılan KAPALI: başlıkta tek satır sonuç özeti; tıkla → detay açılır. Sistem
  // Merkezi'ni kısa tutar; bilgi kaybı yok (açınca tam görünür).
  if (katlanir) {
    return (
      <details className="group mt-6 ds-card" style={{ overflow: "hidden" }}>
        <summary className="flex cursor-pointer select-none items-baseline gap-2 p-4">
          <span className="h-4 w-[3px] shrink-0" style={{ background: brand.red }} aria-hidden="true" />
          <h2 className="font-brand text-base font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
          {ozet && <span className="ml-auto text-right text-xs" style={{ color: brand.muted }}>{ozet}</span>}
          <span className="ml-2 shrink-0 text-xs" style={{ color: brand.faint }}><span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></span>
        </summary>
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
          <AutoAciklama metin={aciklama} className="mb-4 text-xs" style={{ color: brand.muted }} />
          {children}
        </div>
      </details>
    );
  }
  return (
    <Kart ic="lg" className="mt-6">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      <AutoAciklama metin={aciklama} className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }} />
      {children}
    </Kart>
  );
}
