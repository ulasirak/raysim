"use client";

// raysim — interaktif çalışma alanı (Faz 1 editörü + Firebase senaryolar).
// Ağ + araç düzenlenir; her değişiklikte flattenRoute→simulate→paneller anında güncellenir.
// Senaryolar Firestore'a kaydedilir/yüklenir. İstasyon ekle/sil grafı düzenler.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RailNetwork, Route } from "@/lib/anaray/types";
import { flattenRoute, ringlerdenSebeke, hemzeminDuruslari, duruslariEkle } from "@/lib/anaray/network";
import { simulate } from "@/lib/anaray/sim";
import { simulateSignalled, reverseRoute, monteCarlo, planDepotDispatch, type MonteCarloResult } from "@/lib/anaray/signalling";
import { tramvaylar } from "@/lib/anaray/vehicles";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { kmh, km, sure } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { BosHat } from "@/components/BosHat";
import { LiveNetwork } from "@/components/LiveNetwork";
import { NetworkDiagram } from "@/components/NetworkDiagram";

const KMH = 1 / 3.6;

// MODEL KURALI: sinyal blok uzunluğu TEK KAYNAK = cfg.blokMaxUzunluk (Sistem Merkezi).
// Canlı sim, grafikler ve kapasite/blocking AYNI blok düzenini kullanır → sinyaller
// capacity ile birebir hizalı, kayma yok. Aralık ayarlanınca sinyaller sıklaşır/seyrelir.

// Proje hattı boşsa (kullanıcı Ringler'de tüm hücreleri sildiyse) motorlar çökmesin
// diye geçerli ama boş bir iskelet; ekranda uyarı gösterilir.
const BOS_SEBEKE: RailNetwork = {
  id: "sebeke_bos",
  name: "Hat tanımlı değil",
  nodes: [
    { id: "bos_a", name: "—", type: "istasyon", x: 60, y: 70, dwell: 0 },
    { id: "bos_b", name: "—", type: "istasyon", x: 760, y: 70, dwell: 0 },
  ],
  edges: [{ id: "bos_e", from: "bos_a", to: "bos_b", length: 1000, segments: [{ start: 0, end: 1000, vmax: 40 * KMH, gradient: 0 }] }],
};
const BOS_ROTA: Route = { id: "rota_bos", name: "—", edgeIds: ["bos_e"], startNodeId: "bos_a" };

export function Studio() {
  const { rings } = useProje();
  // Proje hattı boşken sahte bir örnek şebeke göstermek yanıltıcı olur.
  if (rings.length === 0) return <BosHat modul="Sefer simülasyonu" />;
  return <StudioIc />;
}

function StudioIc() {
  const { cfg, patch: patchCfg } = useSimConfig();
  // Sinyal blok uzunluğu — canlı sim + kapasite + sinyaller tek kaynak.
  const BLOK_MAXLEN = cfg.blokMaxUzunluk;
  const { rings, meta } = useProje();
  // Araç ve işletme parametreleri KALICI (projeye kayıtlı) — tek kaynak, uçucu değil.
  const { arac: stock, patchArac, setArac } = useArac();
  const { isletme, patchIsletme } = useIsletme();

  // Sefer modülünün hattı = PAYLAŞILAN proje hattı (Ringler/Tam Hat/Belgeler ile
  // aynı kaynak). Ring zinciri graf şebekesine çevrilir; ayrı örnek şebeke yok.
  const proje = useMemo(
    () => ringlerdenSebeke(rings, cfg, meta.hatAdi || "Proje Hattı"),
    [rings, cfg, meta.hatAdi]
  );

  // Sefer artık hattı DÜZENLEMEZ — yalnız simüle eder. Ağ/rota doğrudan proje
  // hattından türetilir (tek düzenleme yeri Ringler). Yerel senaryo/sandbox yok →
  // "kaydedilmemiş düzenleme" karmaşası ortadan kalktı.
  const network: RailNetwork = proje?.network ?? BOS_SEBEKE;
  const route: Route = proje?.route ?? BOS_ROTA;
  // Kalıcı sefer parametreleri (context → projeye kayıtlı).
  const headwayDk = isletme.seferHeadwayDk;
  const setHeadwayDk = (v: number) => patchIsletme({ seferHeadwayDk: v });
  const seferSayisi = isletme.seferSayisi;
  // Elle giriş → manuel moda geç (oto kapanır) ve değeri sakla.
  const setSeferSayisiManuel = (v: number) => patchIsletme({ seferSayisi: v, seferSayisiOto: false });
  const turnaroundDk = isletme.turnaroundDk;
  const setTurnaroundDk = (v: number) => patchIsletme({ turnaroundDk: v });

  // MAKSİMUM TRAMVAY — tek, kesin kaynak (bottleneck: kritik blok / terminal / tek hat).
  // Ringler'deki "Maksimum Tramvay Kapasitesi" ile birebir aynı sonuç.
  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  // Oto tren sayısı: seçilen işletme aralığında çevrime sığan filo, KAPASİTE tavanıyla
  // sınırlı (maksimum tramvayı aşamaz). Hat uzarsa / aralık sıklaşırsa otomatik artar.
  const gerekenFilo = headwayDk > 0
    ? Math.min(maks.nTeorik || 1, Math.max(1, Math.floor(maks.cevrimSuresi / (headwayDk * 60))))
    : 1;
  // Panellerin fiilen kullandığı sayı: oto ise türetilen, değilse elle girilen.
  const etkinSeferSayisi = isletme.seferSayisiOto ? gerekenFilo : seferSayisi;
  // İstenen işletme aralığı, fiziksel min. aralığın (h_min) altındaysa uygulanamaz.
  const headwayUygulanamaz = maks.gecerli && headwayDk * 60 < maks.hMin - 1e-6;
  const [ariza, setAriza] = useState<number[]>([]); // dispatcher: arızalı bloklar (gidiş hattı) — geçici what-if
  // Monte-Carlo senaryo parametreleri KALICI (projeye kayıtlı) — tek kaynak isletme.
  const meanEntry = isletme.mcMeanEntrySn;
  const setMeanEntry = (v: number) => patchIsletme({ mcMeanEntrySn: v });
  const meanDwell = isletme.mcMeanDwellSn;
  const setMeanDwell = (v: number) => patchIsletme({ mcMeanDwellSn: v });
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);
  // Hat Şeması sefer başlangıç saati KALICI (projeye kayıtlı); buton istasyon istasyon gösterir.
  const baslangicSaati = isletme.seferBaslangicSaati;
  const setBaslangicSaati = (v: string) => patchIsletme({ seferBaslangicSaati: v });
  const [saatlerGoster, setSaatlerGoster] = useState(false);

  // Hemzemin geçit koruma duruşları (bekleme>0 karayolu geçitleri) — hem gidiş hem
  // dönüş hattına eklenir: tren orada durur+bekler ve o nokta blok sınırı/sinyal olur.
  const gecitDuruslari = useMemo(() => hemzeminDuruslari(rings, cfg), [rings, cfg]);
  const { line, result } = useMemo(() => {
    const l = duruslariEkle(flattenRoute(network, route), gecitDuruslari, false);
    return { line: l, result: simulate(l, stock, 0.5) };
  }, [network, stock, route, gecitDuruslari]);

  const reverseLine = useMemo(
    () => duruslariEkle(flattenRoute(network, reverseRoute(route)), gecitDuruslari, true),
    [network, route, gecitDuruslari]
  );

  const gidisSim = useMemo(
    () => simulateSignalled(line, stock, { headway: headwayDk * 60, count: etkinSeferSayisi, maxBlockLen: BLOK_MAXLEN, blocked: ariza }),
    [line, stock, headwayDk, etkinSeferSayisi, ariza, BLOK_MAXLEN]
  );
  const arizaToggle = (i: number) => setAriza((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]));
  // Depo (parklanma) planı: depo istasyonlarındaki bekleyen trenler gidiş servisini
  // besler. Depo tanımlıysa Canlı Ağ gidiş sim'i trenleri depolardan SIRAYLA çıkarır
  // (origins); depo yoksa varsayılan davranış (etkin sefer sayısı tren, hat başından) korunur.
  // Yalnız Canlı Ağ depo planından etkilenir; diğer paneller etkinSeferSayisi'yle çalışır.
  const depotPlan = useMemo(() => planDepotDispatch(line, headwayDk * 60), [line, headwayDk]);
  // PARK TRENİ = FİLO (tek kaynak). Depo (parklanma) tanımlıysa filo = toplam park
  // treni, maksimum tramvay (N_max) ile TAVANLANIR (fazlası depoda bekler); depo
  // yoksa oto/elle sefer sayısı. Filo hem gidişi hem dönüşü hem Monte-Carlo'yu
  // besler → gidiş/dönüş kopukluğu biter, park ekle/çıkar sistemi sürükler.
  const parkToplam = depotPlan.total;
  const depoVar = parkToplam > 0;
  const nMax = maks.gecerli ? maks.nTeorik : Infinity;
  const filoParktan = Math.min(parkToplam, nMax);
  const filo = depoVar ? filoParktan : etkinSeferSayisi;
  const parkAsim = depoVar && parkToplam > nMax; // park > kapasite → fazlası depoda bekler
  const gidisOrigins = useMemo(() => depotPlan.origins.slice(0, filoParktan), [depotPlan, filoParktan]);
  const canliGidis = useMemo(
    () =>
      depoVar
        ? simulateSignalled(line, stock, { headway: headwayDk * 60, count: filoParktan, maxBlockLen: BLOK_MAXLEN, blocked: ariza, origins: gidisOrigins })
        : gidisSim,
    [depoVar, filoParktan, gidisOrigins, gidisSim, line, stock, headwayDk, ariza, BLOK_MAXLEN]
  );
  const donusSim = useMemo(
    () => simulateSignalled(reverseLine, stock, { headway: headwayDk * 60, count: filo, maxBlockLen: BLOK_MAXLEN }),
    [reverseLine, stock, headwayDk, filo, BLOK_MAXLEN]
  );

  const monteCarloCalistir = () => {
    setMcRunning(true);
    // Ağır hesap; "hesaplanıyor" görünsün diye bir sonraki tik'e ertele.
    setTimeout(() => {
      const r = monteCarlo(
        line, stock,
        { headway: headwayDk * 60, count: filo, maxBlockLen: BLOK_MAXLEN },
        { trials: 150, meanEntry, meanDwell, threshold: 120 }
      );
      setMc(r);
      setMcRunning(false);
    }, 20);
  };

  // Araç (çeken) düzenlemesi — anında kalıcı (patchArac). Hat düzenlemesi Sefer'de
  // YAPILMAZ; Ringler'de yapılır (ikili düzenleme sadeleştirildi).
  const patchStock = patchArac;

  const vmax = Math.max(...result.points.map((p) => p.v));
  const ortHiz = line.length / result.totalTime;
  const durusSuresi = line.stations.reduce((a, s) => a + s.dwell, 0);
  const teknikHiz = line.length / (result.totalTime - durusSuresi || 1);
  const stationById = Object.fromEntries(line.stations.map((s) => [s.id, s]));
  // Girilen "SS:DD" başlangıç saatini saniyeye çevir (sefer saatleri bunun üstüne eklenir).
  const baslangicSn = (() => {
    const [h, m] = baslangicSaati.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
  })();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Rapor başlığı */}
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Sefer Simülasyon Raporu</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{network.name}</h1>
        <div className="mt-1 text-xs" style={{ color: brand.muted }}>
          Kaynak: <b>paylaşılan proje hattı</b> ({line.stations.filter((s) => s.tip !== "gecit").length} durak · {km(line.length)} km). Hattı düzenlemek için{" "}
          <Link href="/#ringler" className="underline">Ringler (KUR)</Link> bölümüne gidin — değişiklikler burada anında yansır.
        </div>
      </div>

      {/* Canlı ağ simülasyonu (kahraman) */}
      <Panel baslik="Canlı Ağ Simülasyonu" aciklama="Tüm trenler (gidiş + dönüş) aynı anda hat üzerinde hareket eder. Sinyaller blok sınırlarında 3-aspekt yanar (yeşil/sarı/kırmızı) — önündeki blok doluysa otomatik kırmızı; renk elle ayarlanmaz, gerçek sabit-blok mantığı budur. Blok aralığını aşağıdan değiştir → sinyaller sıklaşır/seyrelir (kapasite ile aynı düzen). Dispatcher: bir sinyale tıkla → blok arızalanır. Parklanma (🅿) trenleri sırayla servise çıkar. Oynat ▶">
        <LiveNetwork network={network} route={route} line={line} blocks={canliGidis.blocks}
          up={canliGidis.trains} down={donusSim.trains} tMax={Math.max(canliGidis.tMax, donusSim.tMax)} trainLen={stock.length}
          faultBlocks={ariza} onBlockClick={arizaToggle} depots={depotPlan.depots} />
        {/* Sinyal blok aralığı — sinyaller bu aralıkta dizilir (kapasite ile aynı) */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: brand.inkSoft }}>
          <span>🚦 Sinyal blok aralığı</span>
          <button type="button" onClick={() => patchCfg({ blokMaxUzunluk: Math.max(100, Math.round((cfg.blokMaxUzunluk - 50) / 50) * 50) })}
            className="flex h-5 w-5 items-center justify-center rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }} title="Sıklaştır (kısa blok = daha çok sinyal)">−</button>
          <input type="number" min={100} max={1500} step={50} value={Math.round(cfg.blokMaxUzunluk)}
            onChange={(e) => patchCfg({ blokMaxUzunluk: Math.max(100, Math.min(1500, parseFloat(e.target.value) || 100)) })}
            className="w-16 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} />
          <button type="button" onClick={() => patchCfg({ blokMaxUzunluk: Math.min(1500, Math.round((cfg.blokMaxUzunluk + 50) / 50) * 50) })}
            className="flex h-5 w-5 items-center justify-center rounded border font-semibold text-white" style={{ background: brand.ink, borderColor: brand.ink }} title="Seyrelt (uzun blok = az sinyal)">+</button>
          <span style={{ color: brand.muted }}>m · sinyaller bu aralıkta dizilir; kapasite (h_min) ile aynı düzen</span>
        </div>
        {/* Filo kaynağı + kapasite bağlantısı */}
        <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>
          {depoVar ? (
            <>🅿 Filo <b>{filo}</b> tren (parktan{parkAsim ? `, ${parkToplam} girildi` : ""}) · her yön aynı filoyla koşar
              {maks.gecerli && <> · hat kapasitesi <b>{maks.nTeorik}</b></>}</>
          ) : (
            <>Filo <b>{filo}</b> tren (Sefer Sayısı) · parklanma tanımlarsan filo parktan gelir{maks.gecerli && <> · hat kapasitesi <b>{maks.nTeorik}</b></>}</>
          )}
        </div>
        {parkAsim && (
          <div className="mt-1 text-xs" style={{ color: brand.red }}>
            ⚠ Parkta {parkToplam} tren var ama bu hatta en fazla {nMax} sığar — fazlası depoda bekler, simülasyon {filo} trenle koşuyor.
          </div>
        )}
        {ariza.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span style={{ color: brand.red }}>⚠ {ariza.length} blok arızalı (gidiş) — trenler kuyruklanıyor.</span>
            <button onClick={() => setAriza([])} className="rounded border px-2 py-1 font-medium" style={{ borderColor: brand.border, color: brand.ink }}>Arızayı temizle</button>
          </div>
        )}
      </Panel>

      {/* Sefer sıklığı */}
      <section className="mt-6">
        <Panel baslik="Sefer Sıklığı" aciklama="Hat çift hat, gidiş-dönüş çalışır. Sabit blok sinyal sistemi — tren dolu bloğa giremez (kırmızı sinyalde durur). Dönüş Bekleme çevrim süresini ve gereken filoyu besler.">

          {/* TEK SONUÇ — bu hatta en fazla kaç tramvay (Ringler ile birebir aynı) */}
          {maks.gecerli && (
            <div className="mb-4 rounded-md border-l-4 px-4 py-3" style={{ background: CK.goodBgSoft, borderColor: brand.ink }}>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <div>
                  <span className="text-3xl font-semibold" style={{ color: brand.ink }}>{maks.nTeorik}</span>
                  <span className="ml-1 text-xs" style={{ color: brand.muted }}>tramvay — teorik maksimum</span>
                </div>
                <div>
                  <span className="text-2xl font-semibold" style={{ color: CK.good }}>{maks.nSurdurulebilir}</span>
                  <span className="ml-1 text-xs" style={{ color: brand.muted }}>sürdürülebilir (UIC 406 tamponlu)</span>
                </div>
              </div>
              <p className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                Bu hatta aynı anda en fazla <b>{maks.nTeorik}</b> tramvay sığar. Darboğaz: <b>{maks.baglayanAd}</b> · min. aralık {sure(maks.hMin)} · çevrim {sure(maks.cevrimSuresi)}. Kısıt dökümü ve terminal girdileri <Link href="/#ringler" className="underline">Ringler</Link>’de.
              </p>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Num label="Sefer Aralığı" suffix="dk" step={0.5} value={headwayDk} onChange={(v) => setHeadwayDk(Math.max(0.5, v))} />
            <div className="block">
              <span className="field-label">Sefer Sayısı {depoVar && <span style={{ color: brand.muted }}>(filo)</span>}</span>
              <div className="mt-1 flex items-center gap-1">
                <input type="number" value={depoVar ? filo : etkinSeferSayisi} step={1} min={0} max={60}
                  disabled={depoVar}
                  onChange={(e) => setSeferSayisiManuel(Math.min(60, Math.max(1, Math.round(parseFloat(e.target.value) || 0))))}
                  className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink, background: depoVar ? "#F2F4F6" : undefined }} />
                <span className="text-xs" style={{ color: brand.muted }}>tren</span>
              </div>
              <div className="mt-1 text-xs">
                {depoVar ? (
                  <span style={{ color: parkAsim ? brand.red : CK.good }}>
                    🅿 Parktan: {parkToplam} tren{parkAsim ? ` · ${filo} sığar (fazlası depoda)` : ""} — <Link href="/#ringler" className="underline">parkı düzenle</Link>
                  </span>
                ) : isletme.seferSayisiOto ? (
                  <span style={{ color: CK.good }}>⚙ Oto · aralığa göre türetildi (kapasite tavanıyla sınırlı)</span>
                ) : (
                  <button type="button" onClick={() => patchIsletme({ seferSayisiOto: true })}
                    className="underline" style={{ color: brand.red }}>
                    ↻ Oto’ya dön — gereken {gerekenFilo}
                  </button>
                )}
              </div>
            </div>
            <Num label="Dönüş Bekleme" suffix="dk" step={0.5} value={turnaroundDk} onChange={(v) => setTurnaroundDk(Math.max(0, v))} />
          </div>

          {/* İşletme aralığı fiziksel minimumun altında mı? */}
          {headwayUygulanamaz && (
            <div className="mb-2 text-sm" style={{ color: brand.red }}>
              ⚠ İstenen sefer aralığı ({headwayDk} dk) fiziksel minimum aralığın ({sure(maks.hMin)}) altında — bu sıklık uygulanamaz, trenler kaçınılmaz kuyruklanır. En sık güvenli aralık ≈ {sure(maks.hMin)}.
            </div>
          )}

          {/* Bekleme durumu */}
          <div className="text-sm">
            {gidisSim.anyDelay ? (
              <span style={{ color: brand.red }}>⚠ Bu aralıkta trenler birbirini bekliyor — en fazla {sure(gidisSim.maxDelay)} gecikme.</span>
            ) : (
              <span style={{ color: CK.good }}>✓ Bu aralıkta bekleme yok — trenler serbest akıyor.</span>
            )}
          </div>
        </Panel>
      </section>

      {/* ÇEKEN ARAÇ — Sefer'in tek düzenleme yüzeyi. Hat (istasyon/mesafe/hız/makas/
          depo) düzenlemesi Ringler'de (KUR) → ikili düzenleme sadeleştirildi. */}
      <div className="mt-6">
        <Panel baslik="Çeken Araç" aciklama="Simülasyonda kullanılan aracı seç veya özelliklerini ayarla — değişiklik anında projeye kaydedilir. İstasyon, mesafe, hız limiti, makas ve parklanma düzenlemesi Ringler (KUR) bölümünde yapılır.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="field-label">Araç</span>
              <select
                value={tramvaylar.some((a) => a.id === stock.id) ? stock.id : ""}
                onChange={(e) => {
                  const v = tramvaylar.find((a) => a.id === e.target.value);
                  if (v) setArac({ ...v });
                }}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: brand.border, color: brand.ink }}
              >
                {!tramvaylar.some((a) => a.id === stock.id) && <option value="">Özel araç</option>}
                {tramvaylar.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <Num label="Azami Hız" suffix="km/h" step={5} max={400} value={round(kmh(stock.maxSpeed))} onChange={(v) => patchStock({ maxSpeed: Math.max(5, Math.min(400, v)) * KMH })} />
            <Num label="Kütle" suffix="t" step={1} value={round(stock.mass / 1000)} onChange={(v) => patchStock({ mass: v * 1000 })} />
            <Num label="Fren" suffix="m/s²" step={0.1} value={round(stock.maxBraking, 1)} onChange={(v) => patchStock({ maxBraking: v })} />
          </div>
          <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: brand.border, color: brand.muted }}>
            Hattı düzenlemek mi istiyorsun? İstasyon / mesafe / hız / makas / parklanma alanı{" "}
            <Link href="/#ringler" className="underline" style={{ color: brand.red }}>Ringler (KUR)</Link> bölümünde — orada yapılan değişiklikler burada anında yansır.
          </p>
        </Panel>
      </div>

      {/* Hat şeması — statik topoloji (rota dışı kollar). Canlı Ağ zaten hattı
          gösterdiği için katlanır detay olarak tutulur. */}
      <div className="mt-6">
        <Panel katlanir baslik="Hat Şeması (statik topoloji)" aciklama="Seçili rota (kalın); istasyon adları üstte, kilometre altta. Rota dışı kollar (varsa) soluk çizilir.">
          <NetworkDiagram network={network} route={route} line={line} />

          {/* Sefer saatleri — başlangıç saati girilir, buton istasyon istasyon saatleri gösterir */}
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: brand.border }}>
            <label className="flex items-center gap-2 text-sm" style={{ color: brand.inkSoft }}>
              <span className="field-label">Başlangıç saati</span>
              <input type="time" value={baslangicSaati} onChange={(e) => setBaslangicSaati(e.target.value)}
                className="rounded border px-2 py-1 text-sm tabular-nums" style={{ borderColor: brand.border, color: brand.ink }} />
            </label>
            <button onClick={() => setSaatlerGoster((v) => !v)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90" style={{ background: brand.ink }}>
              {saatlerGoster ? "Saatleri gizle" : "🕐 Saatleri göster"}
            </button>
            <span className="text-xs" style={{ color: brand.muted }}>
              Simülasyondan hesaplanan varış / kalkış saatleri — girilen başlangıç saatinden itibaren.
            </span>
          </div>
          {saatlerGoster && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
                    <th className="py-2 font-medium">İstasyon</th>
                    <th className="py-2 font-medium">Kilometre</th>
                    <th className="py-2 font-medium">Varış</th>
                    <th className="py-2 font-medium">Kalkış</th>
                    <th className="py-2 font-medium">Bekleme</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  <Satir ad={line.stations[0].name} konum={km(0)} varis="—" kalkis={saatBicim(baslangicSn)} dwell={0} />
                  {result.stationEvents.map((ev) => {
                    const st = stationById[ev.stationId];
                    return (
                      <Satir key={ev.stationId} ad={st.name} konum={km(st.position)}
                        varis={saatBicim(baslangicSn + ev.arrival)}
                        kalkis={saatBicim(baslangicSn + ev.departure)}
                        dwell={st.dwell} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Özet künye */}
      <section className="mt-6 overflow-hidden rounded-lg border bg-white" style={{ borderColor: brand.border }}>
        <div className="grid grid-cols-2 divide-x divide-y divide-[#DCE1E7] sm:grid-cols-3 lg:grid-cols-6">
          <Field etiket="Hat Uzunluğu" deger={`${km(line.length)} km`} />
          <Field etiket="Toplam Süre" deger={sure(result.totalTime)} alt="duruşlar dahil" />
          <Field etiket="Seyahat Hızı" deger={`${kmh(ortHiz).toFixed(1)}`} birim="km/h" alt="bekleme dahil" />
          <Field etiket="Teknik Hız" deger={`${kmh(teknikHiz).toFixed(1)}`} birim="km/h" alt="bekleme hariç" />
          <Field etiket="Azami Hız" deger={`${kmh(vmax).toFixed(0)}`} birim="km/h" />
          <Field etiket="Durak" deger={`${result.stationEvents.length}`} alt={`${sure(durusSuresi)} bekleme`} />
        </div>
      </section>

      {/* Monte-Carlo gecikme analizi */}
      <section className="mt-6">
        <Panel baslik="Monte-Carlo Gecikme Analizi (Robustluk / sağlamlık)" aciklama="Rastgele giriş gecikmesi + durak sapmalarıyla çok sayıda sefer simüle edilir; birincil gecikmelerin sonraki trenlere yayılımı ölçülür.">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="w-36"><Num label="Ort. Giriş Gecikmesi" suffix="sn" step={5} value={meanEntry} onChange={(v) => setMeanEntry(Math.max(0, v))} /></div>
            <div className="w-36"><Num label="Ort. Durak Sapması" suffix="sn" step={1} value={meanDwell} onChange={(v) => setMeanDwell(Math.max(0, v))} /></div>
            <button onClick={monteCarloCalistir} disabled={mcRunning}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: brand.ink }}>
              {mcRunning ? "Hesaplanıyor…" : "150 sefer simüle et"}
            </button>
          </div>
          {mc ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat etiket="Dakiklik (≤2 dk)" deger={`%${mc.onTimePct.toFixed(0)}`} alt={`${mc.trials} deneme`} />
                <MiniStat etiket="Ort. Gecikme" deger={sure(mc.meanDelay)} />
                <MiniStat etiket="P90 Gecikme" deger={sure(mc.p90Delay)} alt="%90 bunun altında" />
                <MiniStat etiket="En Kötü" deger={sure(mc.maxDelay)} />
              </div>
              <MonteCarloGrafik mc={mc} />
            </>
          ) : (
            <p className="text-sm" style={{ color: brand.muted }}>Analizi başlatmak için butona basın.</p>
          )}
        </Panel>
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        <span className="flex items-center gap-3">
          <span>RaySim · Demiryolu Ağı Simülasyon Sistemi</span>
          <VeritabaniDurumu />
        </span>
        <span className="font-mono">Sürüm 0.2 · tam simülatör</span>
      </footer>
    </div>
  );
}

// ————— ortak yardımcılar —————
function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/**
 * Monte-Carlo çıktısının GÖRSELİ (iki grafik):
 *  1) Gecikme DAĞILIMI histogramı — eşik altı (dakik, mavi) / üstü (geç, kırmızı);
 *     ortalama · P90 · eşik dikey işaretleri. Kuyruk riskini tek bakışta gösterir.
 *  2) Tren SIRASINA göre yayılım — medyan (nokta+çizgi) + P90 bıyığı; birincil
 *     gecikmenin sonraki trenlere kademelenmesini gösterir.
 * Renkler projenin doğrulanmış paletinden (chartkit CK). Tek seri/durum kodlaması.
 */
function MonteCarloGrafik({ mc }: { mc: MonteCarloResult }) {
  // — 1) Dağılım histogramı —
  const W = 720, H = 196, L = 40, R = 14, T = 12, B = 30;
  const PW = W - L - R, PH = H - T - B;
  const maxD = Math.max(1, mc.maxDelay);
  const maxOran = Math.max(1, ...mc.histogram.map((h) => h.oran));
  const px = (d: number) => L + (Math.min(Math.max(d, 0), maxD) / maxD) * PW;
  const py = (o: number) => T + PH - (o / maxOran) * PH;
  const bw = PW / Math.max(1, mc.histogram.length);
  const yTicks = [0, 0.5, 1].map((f) => ({ oran: f * maxOran, y: py(f * maxOran) }));
  // Etiketler farklı YÜKSEKLİKLERE dizilir → yakın x'lerde çakışmaz (dataviz kontrolü).
  const isaret = (d: number, ad: string, renk: string, yLabel: number) => (
    <g>
      <line x1={px(d)} x2={px(d)} y1={T} y2={T + PH} stroke={renk} strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={px(d) + 3} y={yLabel} textAnchor="start" fontSize={9} fontWeight={600} fill={renk} style={{ fontVariantNumeric: "tabular-nums" }}>{ad}</text>
    </g>
  );

  // — 2) Yayılım şeridi —
  const W2 = 720, H2 = 128, L2 = 40, R2 = 14, T2 = 12, B2 = 24;
  const PW2 = W2 - L2 - R2, PH2 = H2 - T2 - B2;
  const n = mc.perTren.length;
  const maxY = Math.max(1, mc.threshold, ...mc.perTren.map((p) => p.p90));
  const sx = (i: number) => L2 + (n <= 1 ? PW2 / 2 : (i / (n - 1)) * PW2);
  const sy = (v: number) => T2 + PH2 - (Math.min(Math.max(v, 0), maxY) / maxY) * PH2;
  const y2Ticks = [0, 0.5, 1].map((f) => ({ v: f * maxY, y: sy(f * maxY) }));

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Histogram */}
      <div>
        <div className="field-label mb-1">Gecikme dağılımı — {mc.trials} sefer × {n} tren örneği</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} role="img" aria-label="Gecikme dağılımı histogramı">
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={L + PW} y1={t.y} y2={t.y} stroke={CK.grid} strokeWidth={1} />
              <text x={L - 5} y={t.y + 3} textAnchor="end" fontSize={9} fill={CK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>%{t.oran.toFixed(0)}</text>
            </g>
          ))}
          {mc.histogram.map((h, i) => {
            const x = L + i * bw + 1;
            const y = py(h.oran);
            const hgt = Math.max(0, T + PH - y);
            const gec = h.alt >= mc.threshold;
            return (
              <rect key={i} x={x} y={y} width={Math.max(0.5, bw - 2)} height={hgt} rx={3} fill={gec ? CK.red : CK.blue} opacity={0.88}>
                <title>{sure(h.alt)}–{sure(h.ust)}: %{h.oran.toFixed(1)}{gec ? " · geç" : ""}</title>
              </rect>
            );
          })}
          {isaret(mc.meanDelay, "ort", CK.ink2, T + 10)}
          {isaret(mc.threshold, "eşik", CK.amber, T + 22)}
          {isaret(mc.p90Delay, "P90", CK.red, T + 34)}
          <line x1={L} x2={L + PW} y1={T + PH} y2={T + PH} stroke={CK.muted} strokeWidth={1} />
          <text x={L} y={H - 5} textAnchor="start" fontSize={9} fill={CK.muted}>0</text>
          <text x={L + PW / 2} y={H - 5} textAnchor="middle" fontSize={9} fill={CK.muted}>varış gecikmesi →</text>
          <text x={L + PW} y={H - 5} textAnchor="end" fontSize={9} fill={CK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>{sure(maxD)}</text>
        </svg>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.65rem]" style={{ color: brand.muted }}>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: CK.blue }} /> dakik (eşik altı)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: CK.red }} /> geç (eşik üstü)</span>
          <span>· çubuk = o gecikme aralığına düşen sefer oranı</span>
        </div>
      </div>

      {/* Yayılım şeridi (tren sırasına göre kademe) */}
      <div>
        <div className="field-label mb-1">Tren sırasına göre yayılım — medyan ● + P90 bıyığı</div>
        <svg viewBox={`0 0 ${W2} ${H2}`} className="w-full" style={{ maxHeight: 150 }} role="img" aria-label="Tren sırasına göre gecikme yayılımı">
          {y2Ticks.map((t, i) => (
            <g key={i}>
              <line x1={L2} x2={L2 + PW2} y1={t.y} y2={t.y} stroke={CK.grid} strokeWidth={1} />
              <text x={L2 - 5} y={t.y + 3} textAnchor="end" fontSize={9} fill={CK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>{sure(t.v)}</text>
            </g>
          ))}
          {/* eşik */}
          <line x1={L2} x2={L2 + PW2} y1={sy(mc.threshold)} y2={sy(mc.threshold)} stroke={CK.amber} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={L2 + PW2} y={sy(mc.threshold) - 3} textAnchor="end" fontSize={9} fontWeight={600} fill={CK.amber}>eşik</text>
          {/* medyan trend çizgisi */}
          {n > 1 && <polyline points={mc.perTren.map((p, i) => `${sx(i)},${sy(p.p50)}`).join(" ")} fill="none" stroke={CK.blue} strokeWidth={2} />}
          {/* her tren: p50→p90 bıyık + noktalar */}
          {mc.perTren.map((p, i) => (
            <g key={i}>
              <line x1={sx(i)} x2={sx(i)} y1={sy(p.p50)} y2={sy(p.p90)} stroke={CK.blue} strokeWidth={2} opacity={0.3} />
              <circle cx={sx(i)} cy={sy(p.p90)} r={2.5} fill={CK.blue} opacity={0.5} />
              <circle cx={sx(i)} cy={sy(p.p50)} r={3.5} fill={CK.blue}>
                <title>Tren {i + 1}: medyan {sure(p.p50)} · P90 {sure(p.p90)}</title>
              </circle>
            </g>
          ))}
          <line x1={L2} x2={L2 + PW2} y1={T2 + PH2} y2={T2 + PH2} stroke={CK.muted} strokeWidth={1} />
          <text x={L2} y={H2 - 4} textAnchor="start" fontSize={9} fill={CK.muted}>tren 1</text>
          <text x={L2 + PW2} y={H2 - 4} textAnchor="end" fontSize={9} fill={CK.muted}>tren {n}</text>
          <text x={L2 + PW2 / 2} y={H2 - 4} textAnchor="middle" fontSize={9} fill={CK.muted}>sefer sırası →</text>
        </svg>
      </div>
    </div>
  );
}

/** Toplam saniyeyi (başlangıç saati + geçen süre) "SS:DD" 24-saat gösterimine çevirir. */
function saatBicim(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function Num({ label, value, onChange, step, suffix, max }: { label: string; value: number; onChange: (v: number) => void; step: number; suffix: string; max?: number }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input type="number" value={value} step={step} min={0} max={max} onChange={(e) => { let v = Math.max(0, parseFloat(e.target.value) || 0); if (max != null) v = Math.min(max, v); onChange(v); }}
          className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
        <span className="text-xs" style={{ color: brand.muted }}>{suffix}</span>
      </div>
    </label>
  );
}

function VeritabaniDurumu() {
  const ok = isFirebaseConfigured();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={ok ? { background: CK.goodBg, color: CK.good } : { background: CK.badBg, color: CK.red }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      Veritabanı: {ok ? "yapılandırıldı" : "yapılandırma bekleniyor"}
    </span>
  );
}

function MiniStat({ etiket, deger, alt }: { etiket: string; deger: string; alt?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>{deger}</div>
      {alt && <div className="text-xs" style={{ color: brand.faint }}>{alt}</div>}
    </div>
  );
}

function Field({ etiket, deger, birim, alt }: { etiket: string; deger: string; birim?: string; alt?: string }) {
  return (
    <div className="bg-white p-4">
      <div className="field-label">{etiket}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold" style={{ color: brand.ink }}>{deger}</span>
        {birim && <span className="text-xs" style={{ color: brand.muted }}>{birim}</span>}
      </div>
      {alt && <div className="mt-0.5 text-xs" style={{ color: brand.faint }}>{alt}</div>}
    </div>
  );
}

function Satir({ ad, konum, varis, kalkis, dwell }: { ad: string; konum: string; varis: string; kalkis: string; dwell: number }) {
  return (
    <tr className="border-b" style={{ borderColor: brand.border }}>
      <td className="py-2 font-sans" style={{ color: brand.ink }}>{ad}</td>
      <td className="py-2" style={{ color: brand.muted }}>{konum}</td>
      <td className="py-2" style={{ color: brand.inkSoft }}>{varis}</td>
      <td className="py-2" style={{ color: brand.red }}>{kalkis}</td>
      <td className="py-2">
        {dwell > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: CK.badBg, color: CK.red }}>⏱ {dwell} sn</span>
        ) : (
          <span style={{ color: brand.faint }}>—</span>
        )}
      </td>
    </tr>
  );
}

function Panel({ baslik, aciklama, children, katlanir = false }: { baslik: string; aciklama?: string; children: React.ReactNode; katlanir?: boolean }) {
  // Katlanır panel: örtüşen/ikincil görünümler (kapsamlı olanın alt kümesi)
  // varsayılan kapalı durur — akış sadeleşir, bilgi kaybı olmaz (açınca tam görünür).
  if (katlanir) {
    return (
      <details className="group rounded-lg border bg-white" style={{ borderColor: brand.border }}>
        <summary className="flex cursor-pointer select-none items-baseline gap-2 p-5">
          <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
          <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
          <span className="ml-auto text-xs" style={{ color: brand.muted }}>detay <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></span>
        </summary>
        <div className="px-5 pb-5">
          {aciklama && <p className="mb-4 text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
          {children}
        </div>
      </details>
    );
  }
  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
