"use client";

// raysim — SİSTEM MERKEZİ.
// (1) Paylaşılan simülasyon parametreleri — buradan değiştir, tüm modüllere canlı
//     yansır (localStorage'da kalıcı). (2) Canlı sistem durumu — mevcut config +
//     örnek seed'le ring loop + anklaşman bölgeleri anlık çözülür. (3) Bilgi /
//     challenge referansı — sistemin karşıladığı gerçek-hayat durumları.

import { useMemo } from "react";
import Link from "next/link";
import { brand } from "@/lib/anaray/brand";
import { sure, kmh } from "@/lib/anaray/format";
import { useSimConfig, useProje, useArac } from "@/components/SimConfigProvider";
import { blockingTimeRing, type BlokSperr } from "@/lib/anaray/blockingtime";
import { loopToHat } from "@/lib/anaray/hatsim";
import { BlockingStairChart } from "@/components/BlockingStairChart";
import { CK, RAMP_BLUE, SERI } from "@/lib/anaray/chartkit";

const OK = CK.good;
// Blocking-time 6 bileşeni ZAMAN SIRALI → kategorik değil ordinal rampa (raporla aynı).
const BT_PARCA: [string, string][] = [
  ["Setup (rota kurma)", RAMP_BLUE[0]], ["Görme", RAMP_BLUE[1]], ["Yaklaşma", RAMP_BLUE[2]],
  ["Seyir", RAMP_BLUE[3]], ["Temizleme", RAMP_BLUE[4]], ["Release (serbest)", RAMP_BLUE[5]],
];

// Bir bloğun blocking-time'ını NE tıkıyor? 6 bileşeni 3 düzeltilebilir gruba
// indirger, baskın olanı bulur ve KULLANICININ nereden düzelteceğini söyler.
// hedef: hangi modül bölümüne yönlendirileceği (#slug ankoru).
type BlokNeden = { grup: string; icon: string; neden: string; cozum: string; hedef: "ringler" | "sefer" };
function blokNeden(b: BlokSperr): BlokNeden {
  const seyir = b.tRunning + b.tApproach;   // mesafe + hız
  const manevra = b.tSetup + b.tRelease;    // makas tanzim + route release
  const temizle = b.tClearing;              // tren boyu / çıkış hızı
  const en = Math.max(seyir, manevra, temizle);
  if (en === manevra && b.makasBlok && manevra > 0) return {
    grup: "Makas tanzim + release", icon: "⑂",
    neden: "Makas rotası kurma (tanzim) ve serbest bırakma süresi bu bloğu tıkıyor.",
    cozum: "Ringler'de bu durak-arasındaki makasın adım sayısını/süresini ya da route release'i azalt.",
    hedef: "ringler",
  };
  if (en === temizle) return {
    grup: "Tren boyu", icon: "▭",
    neden: "Tren boyunun bloğu terk süresi baskın (uzun araç veya düşük çıkış hızı).",
    cozum: "Sefer modülünde daha kısa araç seç ya da bu kesimde sahasal hızı artır.",
    hedef: "sefer",
  };
  return {
    grup: "Mesafe / hız", icon: "↔",
    neden: "Durak arası mesafe uzun veya sahasal hız düşük → seyir + yaklaşma süresi baskın.",
    cozum: "Ring Ekle bölümünde bu durak-arasının MESAFESİNİ kısalt (ya da sahasal hızı artır).",
    hedef: "ringler",
  };
}

export function SistemMerkezi() {
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const { arac: stock } = useArac();

  // Hat boşken (yeni hesap / yeni proje) çözülecek bir şey yoktur: canlı durum ve
  // blocking-time panelleri gizlenir, parametre girişi açık kalır.
  const bosHat = rings.length === 0;
  const bt = useMemo(() => (rings.length ? blockingTimeRing(rings, stock, cfg) : null), [rings, stock, cfg]);

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
          <div className="field-label">Sistem Merkezi — Canlı Durum & Kapasite Analizi</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>RaySim Canlı Durum & Bilgi Merkezi</h1>
        </div>
      </div>

      {bosHat && (
        <div className="mb-6 rounded border-l-4 px-4 py-3 text-sm" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
          ▲ Bu hatta henüz ring (durak arası hücre) yok — canlı durum ve kapasite panelleri gizlendi.
          Parametreleri header&apos;daki (üst çubuk) <b>⚙ Parametreler</b> butonundan, hattı{" "}
          <Link href="/ringler" className="underline">Ringler modülünden</Link> kurabilirsiniz.
        </div>
      )}

      {/* Blocking-Time (Sperrzeitentreppe) + UIC 406 */}
      {bt && (
      <Panel baslik="Blocking-Time / Sperrzeitentreppe (blok işgal süresi) & UIC 406 Kapasite" aciklama="Her sinyal bloğunun rezerve süresi = 6 bileşen (rota kurma + görme + yaklaşma + seyir + temizleme + release). En yüksek blocking-time'lı blok min headway'i belirler; UIC 406 doluluk = min headway / hedef headway.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat etiket="Min headway (kritik blok)" deger={sure(bt.minHeadway)} alt={`blok #${bt.kritikBlok}${bt.bloklar[bt.kritikBlok]?.makasBlok ? " (makas)" : ""}`} vurgu={brand.red} />
          <MiniStat etiket="Teorik kapasite" deger={`${bt.teorikKapasite.toFixed(0)}/sa`} alt="tren/saat üst sınır" />
          <MiniStat etiket="UIC 406 doluluk" deger={`%${bt.dolulukHedef.toFixed(0)}`} alt={`hedef ${bt.hedefHeadway} s`} vurgu={bt.dolulukHedef > 80 ? CK.red : bt.dolulukHedef > 60 ? CK.amber : OK} />
          <MiniStat etiket="Hedef headway" deger={bt.hedefUygun ? "UYGUN" : "İHLAL"} vurgu={bt.hedefUygun ? OK : brand.red} />
        </div>

        {/* Sperrzeitentreppe — GERÇEK zaman-mesafe merdiveni (kanonik) */}
        <div className="mt-4">
          <div className="field-label mb-2">Sperrzeitentreppe — zaman-mesafe merdiveni (iki ardışık tren)</div>
          <div className="rounded border p-2" style={{ borderColor: brand.border }}>
            <BlockingStairChart bloklar={bt.bloklar} L={bt.toplamUzunluk} minHeadway={bt.minHeadway} kritikBlok={bt.kritikBlok} yorunge={bt.yorunge} />
          </div>
          <p className="mt-1.5 text-xs" style={{ color: brand.muted }}>
            Her dikdörtgen bir sinyal bloğunun rezerve süresi (blocking-time); dikey = blok uzunluğu, yatay = süre.
            İki merdiven <span style={{ color: brand.red }}>kritik blokta</span> tam değer → o an sürdürülebilir min headway.
            <span style={{ color: SERI.duzBlok }}> ■</span> düz blok · <span style={{ color: SERI.makasBlok }}>■</span> makas bloğu.
          </p>
        </div>

        {/* Blok başına bileşen dökümü (yardımcı görünüm) */}
        <div className="mt-4">
          <div className="field-label mb-2">Blok başına blocking-time bileşenleri (6 parça yığını)</div>
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
                <div key={b.i} className="flex h-full flex-1 flex-col items-center gap-0.5" title={`Blok #${b.i}: ${b.toplam.toFixed(0)} s${b.makasBlok ? " (makas)" : ""}`}>
                  <div className="flex w-full min-h-0 flex-1 flex-col justify-end">
                    <div className="flex w-full flex-col justify-end overflow-hidden rounded-t" style={{ height: `${(b.toplam / mx) * 100}%`, minHeight: 3, outline: kritik ? `2px solid ${CK.red}` : "none" }}>
                      {parcalar.map(([v, c], j) => v > 0 && <div key={j} style={{ height: `${(v / b.toplam) * 100}%`, background: c }} />)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.55rem]" style={{ color: kritik ? CK.red : CK.faint }}>{b.i}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[0.6rem]" style={{ color: brand.muted }}>
            {BT_PARCA.map(([ad, c]) => (
              <span key={ad} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{ad}</span>
            ))}
            <span className="ml-1" style={{ color: CK.faint }}>(açıktan koyuya = zaman sırası)</span>
          </div>
        </div>

        {/* Blok teşhisi & çözüm — her blok hangi durak-arasına düşüyor, darboğazın
            nedeni ne ve nereden düzeltilir; buton doğrudan o ring'e/bölüme götürür. */}
        <div className="mt-5 border-t pt-4" style={{ borderColor: brand.border }}>
          <div className="field-label mb-1">🔧 Blok Teşhisi & Çözüm</div>
          <p className="mb-2.5 text-xs" style={{ color: brand.muted }}>
            Her blok, düştüğü <b>durak-arası (ring)</b> ile adlandırılır; en kritik blok en üstte.
            Darboğazın nedeni ve nereden düzelteceğin yanında — <b>buton doğrudan o ring&apos;e/bölüme götürür</b>.
          </p>
          {teshis.length === 0 ? (
            <p className="text-xs" style={{ color: brand.muted }}>Değerlendirilecek blok yok.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {teshis.map((t) => {
                const kritik = bt && t.b.i === bt.kritikBlok;
                const asiyor = bt ? t.b.toplam > bt.hedefHeadway : false;
                const renk = kritik || asiyor ? CK.red : brand.border;
                const href = t.hedef === "ringler" && t.ring ? `/#ring-${t.ring.id}` : "/#sefer";
                return (
                  <div key={t.b.i} className="rounded border p-2.5 text-xs" style={{ borderColor: renk, background: kritik ? CK.badBgSoft : "transparent" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 font-mono font-semibold" style={{ background: kritik ? CK.red : CK.track, color: kritik ? "#fff" : brand.inkSoft }}>Blok {t.b.i}</span>
                      <span className="font-medium" style={{ color: brand.ink }}>{t.ad}</span>
                      <span className="font-mono" style={{ color: asiyor ? CK.red : brand.muted }}>{sure(t.b.toplam)}</span>
                      {kritik && <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold" style={{ background: CK.red, color: "#fff" }}>KRİTİK — min headway</span>}
                      {asiyor && !kritik && <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold" style={{ background: CK.amberBg, color: CK.amberInk }}>hedefi aşıyor</span>}
                      <a href={href} className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90" style={{ background: brand.ink }}>
                        {t.hedef === "ringler" ? "→ Ringler'de düzelt" : "→ Sefer'de düzelt"}
                      </a>
                    </div>
                    <div className="mt-1.5" style={{ color: brand.inkSoft }}>
                      <b>{t.icon} {t.grup}:</b> {t.neden} <span style={{ color: brand.muted }}>· Çözüm: {t.cozum}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
      )}

      {/* Parametre düzenleme TEK yerde: header'daki ⚙ Parametreler. Burada tekrar
          gösterilmez (çift giriş kafa karıştırıyordu) — yalnız yönlendirme. */}
      <div className="mt-6 rounded-lg border border-dashed px-4 py-3 text-sm" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
        ⚙ Simülasyon parametreleri header&apos;daki <b style={{ color: brand.ink }}>“⚙ Parametreler”</b> butonundan düzenlenir — tek kaynak, her sayfadan erişilir. Yukarıdaki canlı durum ve kapasite panelleri bu değerlerle anlık çözülür.
      </div>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Sistem Merkezi — parametreler tek kaynaktır; Sefer / Ringler / Anklaşman modülleri buradan okur. Değerler tarayıcıda saklanır (localStorage). Referans hızlar: {kmh(cfg.vAnahat).toFixed(0)}/{kmh(cfg.vSahasal).toFixed(0)}/{kmh(cfg.vMakas).toFixed(0)}/{kmh(cfg.vHemzemin).toFixed(0)} km/h.
      </footer>
    </div>
  );
}

// ————— yardımcılar —————
function MiniStat({ etiket, deger, alt, vurgu }: { etiket: string; deger: string; alt?: string; vurgu?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: vurgu ?? brand.ink }}>{deger}</div>
      {alt && <div className="truncate text-xs" style={{ color: brand.faint }} title={alt}>{alt}</div>}
    </div>
  );
}
function Panel({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
