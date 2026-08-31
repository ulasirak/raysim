"use client";

// raysim — interaktif çalışma alanı (Faz 1 editörü + Firebase senaryolar).
// Ağ + araç düzenlenir; her değişiklikte flattenRoute→simulate→paneller anında güncellenir.
// Senaryolar Firestore'a kaydedilir/yüklenir. İstasyon ekle/sil grafı düzenler.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RailNetwork, Route } from "@/lib/anaray/types";
import { flattenRoute, ringlerdenSebeke, hemzeminDuruslari, duruslariEkle, kalkisEkle, hatOzellikleri } from "@/lib/anaray/network";
import { simulate } from "@/lib/anaray/sim";
import { simulateSignalled, reverseRoute, monteCarlo, planDepotDispatch, loopYorunge, type MonteCarloResult } from "@/lib/anaray/signalling";
import { tramvaylar } from "@/lib/anaray/vehicles";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { servisProfili, type ServisProfil } from "@/lib/anaray/servis";
import { dwellUygulanmisRings, maxYolcuKapasitesi, netTabanAlani } from "@/lib/anaray/yolcu";
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
  const { rings: ringsHam, meta } = useProje();
  // Araç ve işletme parametreleri KALICI (projeye kayıtlı) — tek kaynak, uçucu değil.
  const { arac: stock, patchArac, setArac } = useArac();
  const { isletme, patchIsletme } = useIsletme();

  // Yolcu dinamiği: dwell OTO ringlerin dwell'i fiziksel akıştan hesaplanır → canlı
  // sim ve kapasite AYNI hesaplı dwell'i kullanır (tutarlı).
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);

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
  const turnaroundDk = isletme.turnaroundDk;
  const setTurnaroundDk = (v: number) => patchIsletme({ turnaroundDk: v });

  // MAKSİMUM TRAMVAY — tek, kesin kaynak (bottleneck: kritik blok / terminal / tek hat).
  // Ringler'deki "Maksimum Tramvay Kapasitesi" ile birebir aynı sonuç.
  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  // Gün içi servis profili + depo kapasitesi (tüm parklanma alanları: origin + varış).
  const depoKapasiteler = useMemo(() => {
    const caps: number[] = [];
    if (rings[0]?.fromDepot) caps.push(rings[0].fromDepoKapasite ?? 0);
    for (const r of rings) if (r.depot) caps.push(r.depoKapasite ?? 0);
    return caps;
  }, [rings]);
  const depoSayisi = depoKapasiteler.length;
  const depoKapasiteToplam = useMemo(() => {
    if (depoKapasiteler.length === 0) return 0;
    return depoKapasiteler.every((c) => c > 0) ? depoKapasiteler.reduce((s, c) => s + c, 0) : 0; // 0 = sınırsız/tanımsız
  }, [depoKapasiteler]);
  const servisProfil = useMemo(() => servisProfili(isletme, depoKapasiteToplam), [isletme, depoKapasiteToplam]);
  // İstenen işletme aralığı, fiziksel min. aralığın (h_min) altındaysa uygulanamaz.
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
  const [talepPopup, setTalepPopup] = useState(false); // yolcu verisi yokken talep-öneri uyarısı

  // Hemzemin geçit koruma duruşları (bekleme>0 karayolu geçitleri) — hem gidiş hem
  // dönüş hattına eklenir: tren orada durur+bekler ve o nokta blok sınırı/sinyal olur.
  const gecitDuruslari = useMemo(() => hemzeminDuruslari(rings, cfg), [rings, cfg]);
  // Canlı sim görsel işaretleri: tüm hat özellikleri (yaya/karayolu geçidi + makas).
  const hatOzellik = useMemo(() => hatOzellikleri(rings, cfg), [rings, cfg]);
  // Elle konan sinyaller (ters işletme hariç) blok sınırı olur → sim + kapasite aynı düzen.
  const sinyalSimKonum = useMemo(() => hatOzellik.filter((f) => f.kind === "sinyal" && !f.tersIsletme).map((f) => f.pos), [hatOzellik]);
  const kalkisSu = isletme.kalkisOluZamaniSn; // canlı simde kalkış ölü zamanı (tutarlılık)
  const { line, result } = useMemo(() => {
    const l = kalkisEkle(duruslariEkle(flattenRoute(network, route), gecitDuruslari, false), kalkisSu);
    return { line: l, result: simulate(l, stock, 0.5) };
  }, [network, stock, route, gecitDuruslari, kalkisSu]);

  const reverseLine = useMemo(
    () => kalkisEkle(duruslariEkle(flattenRoute(network, reverseRoute(route)), gecitDuruslari, true), kalkisSu),
    [network, route, gecitDuruslari, kalkisSu]
  );

  const arizaToggle = (i: number) => setAriza((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]));
  // ——— TEK FİLO modeli ———
  // Filo = parklanma alanındaki araç sayısı (toplam=pik=pik-dışı senkron tek sayı).
  // Tramvay bir anda alınmaz → filo, sistemin verdiği ÖNERİYE eşlenmesi gereken tek
  // değerdir. Onaylayınca öneriye eşitlenir; sonra elle oynanır.
  const nMax = maks.gecerli ? maks.nTeorik : 999;
  const filoTek = Math.max(1, isletme.toplamFilo || 1);
  const setFilo = (v: number) => { const n = Math.max(1, Math.min(99, Math.round(v))); patchIsletme({ toplamFilo: n, pikFilo: n, pikDisiFilo: n }); };
  const filo = Math.min(nMax, filoTek);               // simde koşan (kapasiteyle tavanlı)
  const filoAsim = maks.gecerli && filoTek > nMax;    // filo > hat kapasitesi
  // HEDEF headway = tasarım kuralı (240 s vars.) → ÖNERİ bundan. ULAŞILAN = RTT/filo.
  const hedefHeadwaySn = Math.max(1, headwayDk * 60);
  const ulasilanHeadwaySn = maks.gecerli ? maks.cevrimSuresi / Math.max(1, filo) : hedefHeadwaySn;
  // Yolcu (talep) verisi girili mi? Girilmişse öneri/tıkanma ona göre; değilse pop-up.
  const yolcuVeriVar = !!isletme.istasyonYolcu && Object.keys(isletme.istasyonYolcu).length > 0;
  const tersRapor = useMemo(() => tersIsletmeAnaliz(rings, stock, isletme, cfg, yolcuVeriVar ? "istasyon" : "toplam"), [rings, stock, isletme, cfg, yolcuVeriVar]);
  const talepFilosu = yolcuVeriVar && tersRapor ? tersRapor.filo.gerekenArac : 0;
  // Önerilen tramvay = ⌈RTT ÷ hedef headway⌉ (kural); yolcu girildiyse talep de artırabilir.
  const oneriTramvay = maks.gecerli ? Math.max(1, Math.ceil(maks.cevrimSuresi / hedefHeadwaySn), talepFilosu) : 0;
  const filoOneriUyum = filoTek === oneriTramvay;
  const depotPlan = useMemo(() => planDepotDispatch(line, ulasilanHeadwaySn), [line, ulasilanHeadwaySn]);
  const depoVar = depotPlan.depots.length > 0;
  // Canlı sim'i başlatmak için GEREKLİ iki şey: (1) parklanma alanı (depo) seçili, (2) filo onaylı.
  const filoHazir = !!isletme.filoOnaylandi;
  const simHazir = depoVar && filoHazir;
  // Parklanma dizilimi (elle): her depoya konan araç. Boşsa depolara sırayla (geriye-uyum).
  const parkAnahtar = (pos: number) => `d${Math.round(pos)}`;
  const parkDizili = useMemo(() => {
    const dz = isletme.parklanmaDagilim;
    return !!dz && depotPlan.depots.some((d) => (dz[parkAnahtar(d.position)] ?? 0) > 0);
  }, [isletme.parklanmaDagilim, depotPlan]);
  const parkToplam = useMemo(() => {
    const dz = isletme.parklanmaDagilim || {};
    return depotPlan.depots.reduce((s, d) => s + Math.max(0, Math.round(dz[parkAnahtar(d.position)] ?? 0)), 0);
  }, [isletme.parklanmaDagilim, depotPlan]);
  const gidisOrigins = useMemo(() => {
    const depolar = depotPlan.depots;
    if (depolar.length === 0) return undefined;
    const dz = isletme.parklanmaDagilim;
    if (dz && depolar.some((d) => (dz[parkAnahtar(d.position)] ?? 0) > 0)) {
      const out: number[] = [];
      depolar.forEach((d) => { const n = Math.max(0, Math.round(dz[parkAnahtar(d.position)] ?? 0)); for (let k = 0; k < n; k++) out.push(d.position); });
      return out.length > 0 ? out.slice(0, filo) : Array.from({ length: filo }, (_, k) => depolar[k % depolar.length].position);
    }
    return Array.from({ length: filo }, (_, k) => depolar[k % depolar.length].position);
  }, [depotPlan, filo, isletme.parklanmaDagilim]);
  const canliGidis = useMemo(
    () => simulateSignalled(line, stock, { headway: ulasilanHeadwaySn, count: filo, maxBlockLen: BLOK_MAXLEN, blocked: ariza, origins: gidisOrigins, sinyaller: sinyalSimKonum }),
    [line, stock, ulasilanHeadwaySn, filo, gidisOrigins, ariza, BLOK_MAXLEN, sinyalSimKonum]
  );
  const donusSim = useMemo(
    () => simulateSignalled(reverseLine, stock, { headway: ulasilanHeadwaySn, count: filo, maxBlockLen: BLOK_MAXLEN, sinyaller: sinyalSimKonum.map((p) => reverseLine.length - p) }),
    [reverseLine, stock, ulasilanHeadwaySn, filo, BLOK_MAXLEN, sinyalSimKonum]
  );
  // DÖNGÜ (git-gel): tek-tren tam tur yörüngesi — uçlarda turnback (peron işgali) + durum izleme.
  const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSon = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopY = useMemo(
    () => loopYorunge(line, reverseLine, stock, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon }),
    [line, reverseLine, stock, peronBas, peronSon]
  );
  // Depo dağıtımı: her tren parklanma alanından çıkar; depoDagilim'e göre bir kısmı DÜZ
  // (gidiş) bir kısmı MAKASTAN karşı şeride geçip TERS (dönüş) yönde başlar. Trenler
  // dispatchT'ye (headway aralıklı) kadar parkta bekler, sonra döngüye girer.
  const dagitim = useMemo(() => {
    const origins = gidisOrigins ?? [];
    let gKalan = tersRapor ? tersRapor.depoDagilim.gidis : Math.ceil(filo / 2);
    let tKalan = filo - gKalan;
    const orn = loopY.ornekler;
    const sToT = (hedefS: number) => { let en = 0, bd = Infinity; for (const o of orn) { const dd = Math.abs(o.s - hedefS); if (dd < bd) { bd = dd; en = o.t; } } return en; };
    return Array.from({ length: filo }, (_, k) => {
      const parkPos = origins.length > 0 ? origins[k % origins.length] : 0;
      // Gidiş/ters HARMANLA (iki şerit birlikte dolsun): çift k→gidiş, tek k→ters (sayı bitince öbürü).
      const wantG = k % 2 === 0;
      let gidis: boolean;
      if (wantG && gKalan > 0) { gKalan--; gidis = true; }
      else if (!wantG && tKalan > 0) { tKalan--; gidis = false; }
      else if (gKalan > 0) { gKalan--; gidis = true; }
      else { tKalan--; gidis = false; }
      const startS = gidis ? Math.min(loopY.L, parkPos) : Math.max(0, loopY.loopLen - parkPos); // ters → karşı şerit (makastan geçmiş)
      return { parkPos, gidis, dispatchT: k * ulasilanHeadwaySn, startPhase: sToT(startS) };
    });
  }, [gidisOrigins, tersRapor, filo, loopY, ulasilanHeadwaySn]);
  const loopVeri = useMemo(
    () => ({ ...loopY, count: filo, offset: loopY.periyot / Math.max(1, filo), dagitim }),
    [loopY, filo, dagitim]
  );

  const monteCarloCalistir = () => {
    setMcRunning(true);
    // Ağır hesap; "hesaplanıyor" görünsün diye bir sonraki tik'e ertele.
    setTimeout(() => {
      const r = monteCarlo(
        line, stock,
        { headway: ulasilanHeadwaySn, count: filo, maxBlockLen: BLOK_MAXLEN },
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
      {/* Talebe göre öneri için yolcu verisi gerekli — pop-up (tahmin YOK) */}
      {talepPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setTalepPopup(false)}>
          <div className="max-w-md rounded-lg p-5 shadow-xl" style={{ background: "#fff", border: `1px solid ${brand.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold" style={{ color: brand.ink }}>Talebe göre öneri için yolcu verisi gerekli</div>
            <p className="mt-2 text-xs" style={{ color: brand.inkSoft }}>Tıkanma, dönüş ihtiyacı ve talep-filosu <b>tahmin edilmez</b> — gerçek yolcu sayılarını girmelisin. Şu bölümlerde giriş yap:</p>
            <ul className="mt-2 ml-4 list-disc text-xs" style={{ color: brand.inkSoft }}>
              <li><Link href="/#tersisletme" className="font-semibold underline" style={{ color: brand.ink }}>Ters İşletme → &quot;Her İstasyon&quot;</Link> sekmesinde her durağa iniş/biniş gir.</li>
              <li>Sonra bu panele dön — öneri ve tıkanma talebe göre güncellenir.</li>
            </ul>
            <div className="mt-3 text-right"><button type="button" onClick={() => setTalepPopup(false)} className="rounded px-3 py-1.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>Anladım</button></div>
          </div>
        </div>
      )}
      {/* Rapor başlığı */}
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Sefer Simülasyon Raporu</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{network.name}</h1>
        <div className="mt-1 text-xs" style={{ color: brand.muted }}>
          Kaynak: <b>paylaşılan proje hattı</b> ({line.stations.filter((s) => s.tip !== "gecit").length} durak · {km(line.length)} km). Hattı düzenlemek için{" "}
          <Link href="/#ringler" className="underline">Ringler (KUR)</Link> bölümüne gidin — değişiklikler burada anında yansır.
        </div>
      </div>

      {/* ①②③ FİLO & ÖNERİ — akışın ilk adımı: öneri → onayla → filo → parklanma */}
      {maks.gecerli && (
      <div id="filo-paneli">
      <Panel baslik="Filo & Öneri" aciklama="Sistem, girdiğin tüm verilere göre gereken tramvay sayısını önerir. Onaylayınca filo öneriye eşitlenir; sonra filoyu elle oynarsın. Filo = parklanma alanına dizdiğin araç sayısıdır; ulaşılan sefer aralığı = çevrim ÷ filo.">
        {/* ① Önerilen tramvay + Onayla */}
        <div className="rounded-lg border-2 p-4" style={{ borderColor: brand.ink, background: CK.goodBgSoft }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: brand.inkSoft }}>Önerilen tramvay</div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums" style={{ color: brand.ink }}>{oneriTramvay}</span>
                <span className="text-sm" style={{ color: brand.inkSoft }}>araç · ⌈çevrim {sure(maks.cevrimSuresi)} ÷ hedef {Math.round(hedefHeadwaySn)} s⌉{talepFilosu > 0 && talepFilosu >= oneriTramvay ? " · talep de bunu gerektiriyor" : ""}</span>
              </div>
            </div>
            <button type="button" onClick={() => { setFilo(oneriTramvay); patchIsletme({ filoOnaylandi: true }); }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>✓ Onayla — filoyu öneriye eşitle</button>
          </div>
          <div className="mt-2 text-xs" style={{ color: brand.muted }}>
            {yolcuVeriVar
              ? "✓ Yolcu verisi girili — öneri talebe göre de kontrol edildi (tıkanma/dönüş ihtiyacı aşağıda)."
              : <>Öneri hedef headway kuralından ({Math.round(hedefHeadwaySn)} s = tasarım). Talebe göre (tıkanma/dönüş ihtiyacı) kontrol için <button type="button" className="font-semibold underline" style={{ color: brand.ink }} onClick={() => setTalepPopup(true)}>yolcu verisi gir</button>.</>}
          </div>
        </div>

        {/* ② Filo (oynanır) + ulaşılan/hedef headway + kapasite */}
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span className="field-label">Filo (parktaki araç)</span>
            <div className="mt-1 flex items-center gap-1.5">
              <button type="button" onClick={() => setFilo(filoTek - 1)} className="h-7 w-7 rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }}>−</button>
              <input type="number" min={1} max={99} value={filoTek} onChange={(e) => setFilo(parseFloat(e.target.value) || 1)}
                className="w-14 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <button type="button" onClick={() => setFilo(filoTek + 1)} className="h-7 w-7 rounded border font-semibold text-white" style={{ background: brand.ink, borderColor: brand.ink }}>+</button>
            </div>
            <span className="mt-0.5 block text-[0.6rem]" style={{ color: filoOneriUyum ? "#16794C" : CK.amberInk }}>{filoOneriUyum ? "✓ öneriyle eşleşiyor" : `öneri ${oneriTramvay} · fark ${filoTek - oneriTramvay > 0 ? "+" : ""}${filoTek - oneriTramvay}`}</span>
          </div>
          <div>
            <span className="field-label">Ulaşılan sefer aralığı</span>
            <div className="mt-1 text-lg font-bold tabular-nums" style={{ color: brand.ink }}>{sure(ulasilanHeadwaySn)}</div>
            <span className="text-[0.6rem]" style={{ color: brand.muted }}>çevrim ÷ filo · filo↑→aralık↓</span>
          </div>
          <div>
            <span className="field-label">Hedef headway (kural)</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={0.5} step={0.5} value={headwayDk} onChange={(e) => setHeadwayDk(Math.max(0.5, parseFloat(e.target.value) || 4))}
                className="w-14 rounded border px-2 py-1 text-sm" style={{ borderColor: CK.amber, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>dk</span>
            </div>
            <span className="mt-0.5 block text-[0.6rem]" style={{ color: CK.amberInk }}>⚠ değiştirilmesi önerilmez (240 s tasarım kuralı)</span>
          </div>
          <div title="Aynı anda bu hatta sığabilen EN FAZLA tramvay (darboğazın izin verdiği fiziksel üst sınır). Filon bu sayıyı aşamaz — aşarsa trenler kaçınılmaz kuyruklanır.">
            <span className="field-label">Hat kapasitesi</span>
            <div className="mt-1 text-lg font-bold tabular-nums" style={{ color: filoAsim ? brand.red : brand.ink }}>{nMax}</div>
            <span className="text-[0.6rem]" style={{ color: filoAsim ? brand.red : brand.muted }}>{filoAsim ? `⚠ filo ${filoTek} > kapasite ${nMax}` : "araç · üst sınır (darboğaz)"}</span>
          </div>
        </div>

        {/* ③ Parklanma dizilimi (elle) */}
        {depoVar ? (
          <div className="mt-4 rounded border p-3" style={{ borderColor: parkDizili && parkToplam === filoTek ? "#16794C" : CK.amber, background: "#FBFCFD" }}>
            <div className="field-label">Parklanma Dizilimi — araçları depolara ELLE yerleştir</div>
            <p className="mb-2 text-xs" style={{ color: brand.muted }}>Rastgele dağıtılmaz: her depoya kaç araç park edeceğini sen gir (toplam = filo {filoTek}). Canlı simde trenler bu depolardan çıkar.</p>
            <div className="flex flex-wrap items-end gap-3">
              {depotPlan.depots.map((d, i) => {
                const k = parkAnahtar(d.position);
                const val = Math.max(0, Math.round((isletme.parklanmaDagilim || {})[k] ?? 0));
                return (
                  <div key={i} className="w-28">
                    <span className="text-[0.6rem]" style={{ color: brand.inkSoft }}>🅿 Depo @ {km(d.position)}</span>
                    <input type="number" min={0} max={99} value={val}
                      onChange={(e) => patchIsletme({ parklanmaDagilim: { ...(isletme.parklanmaDagilim || {}), [k]: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) } })}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                  </div>
                );
              })}
              <button type="button" onClick={() => { const dep = depotPlan.depots; const per = Math.floor(filoTek / dep.length); let kalan = filoTek - per * dep.length; const yeni: Record<string, number> = {}; dep.forEach((d) => { yeni[parkAnahtar(d.position)] = per + (kalan-- > 0 ? 1 : 0); }); patchIsletme({ parklanmaDagilim: yeni }); }}
                className="rounded border px-2 py-1 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>eşit dağıt ({filoTek})</button>
            </div>
            <div className="mt-2 text-xs" style={{ color: parkToplam === filoTek ? "#16794C" : CK.amberInk }}>
              {parkToplam === filoTek ? `✓ ${parkToplam}/${filoTek} araç dizildi` : parkToplam < filoTek ? `⚠ ${filoTek - parkToplam} araç daha yerleştir (${parkToplam}/${filoTek}) — parklanma alanını doldur` : `⚠ ${parkToplam - filoTek} fazla (${parkToplam}/${filoTek})`}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded border-l-4 px-3 py-2 text-xs" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
            🅿 Bu hatta parklanma alanı (depo) tanımlı değil — Ringler'de bir durağı <b>depo</b> işaretlersen araçlarını oraya dizersin. Şimdilik trenler hat başından çıkar.
          </div>
        )}
      </Panel>
      </div>
      )}

      {/* Canlı ağ simülasyonu (kahraman) */}
      <Panel baslik="Canlı Ağ Simülasyonu" aciklama="Trenler PARKLANMA ALANINDAN çıkar: Depo Çıkışı yöntemine göre bir kısmı DÜZ (gidiş), bir kısmı MAKASTAN karşı şeride geçip TERS (dönüş) yönde başlar; sıra bekleyenler ⏸ parkta durur. Hat DÖNGÜdür (lastik): tren gidiş şeridini yürür → terminalde peron işgali süresi kadar DÖNER (turnback) → dönüş şeridinden geri gelir → başta döner → tekrar. Her trenin üstünde o an ne yaşadığı (⤵ hız kısıtı · ⏸ istasyon duruşu · 🔄 terminal dönüşü · ↗ hızlanma · → seyir) rozetle görünür; bir trene TIKLA → bir tam turda hangi nedene kaç saniye geçirdiğinin dökümü açılır. Sinyaller blok sınırlarında 3-aspekt yanar. Oynat ▶">
        {simHazir ? (
        <LiveNetwork network={network} route={route} line={line} blocks={canliGidis.blocks}
          up={canliGidis.trains} down={donusSim.trains} tMax={Math.max(canliGidis.tMax, donusSim.tMax)} trainLen={stock.length}
          faultBlocks={ariza} onBlockClick={arizaToggle} depots={depotPlan.depots} features={hatOzellik} loop={loopVeri}
          terminalBas={isletme.terminalBas} terminalSon={isletme.terminalSon} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center" style={{ borderColor: CK.amber, background: CK.amberBg }}>
            <div className="text-2xl">🚋</div>
            <div className="mt-1 text-sm font-bold" style={{ color: CK.amberInk }}>Canlı Ağ Simülasyonunu başlatmak için iki şey gerekli</div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {!depoVar && (
                <div className="flex items-center gap-2">
                  <span style={{ color: brand.red }}>✗</span>
                  <span style={{ color: brand.inkSoft }}>Parklanma alanı seçilmemiş — trenler nereden çıkacak?</span>
                  <Link href="/#ringler" className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>→ Duraklar & Mesafeler'de parklanma alanı seç</Link>
                </div>
              )}
              {depoVar && <div className="flex items-center gap-2"><span style={{ color: "#16794C" }}>✓</span><span style={{ color: brand.muted }}>Parklanma alanı seçili.</span></div>}
              {!filoHazir && (
                <div className="flex items-center gap-2">
                  <span style={{ color: brand.red }}>✗</span>
                  <span style={{ color: brand.inkSoft }}>Tramvay sayısı belirlenmemiş — kaç tren koşacak?</span>
                  <a href="#" onClick={(e) => { e.preventDefault(); document.querySelector('[data-filo-paneli]')?.scrollIntoView({ behavior: "smooth" }); }} className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>↑ Filo & Öneri'de filo sayınızı onaylayın</a>
                </div>
              )}
              {filoHazir && <div className="flex items-center gap-2"><span style={{ color: "#16794C" }}>✓</span><span style={{ color: brand.muted }}>Filo onaylı ({filoTek} araç).</span></div>}
            </div>
            <div className="mt-3 text-xs" style={{ color: brand.muted }}>Bu ikisi girilince simülasyon otomatik açılır — trenler parklanma alanından çıkıp döngüye girer.</div>
          </div>
        )}
        {/* Otomatik blok bölme — elle sinyal KOYMADIĞIN açık kesimleri doldurur */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: brand.inkSoft }}>
          <span>▦ Otomatik blok bölme (boş kesim · sinyal değil)</span>
          <button type="button" onClick={() => patchCfg({ blokMaxUzunluk: Math.max(100, Math.round((cfg.blokMaxUzunluk - 50) / 50) * 50) })}
            className="flex h-5 w-5 items-center justify-center rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }} title="Sıklaştır (kısa blok = daha çok sinyal)">−</button>
          <input type="number" min={100} max={1500} step={50} value={Math.round(cfg.blokMaxUzunluk)}
            onChange={(e) => patchCfg({ blokMaxUzunluk: Math.max(100, Math.min(1500, parseFloat(e.target.value) || 100)) })}
            className="w-16 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} />
          <button type="button" onClick={() => patchCfg({ blokMaxUzunluk: Math.min(1500, Math.round((cfg.blokMaxUzunluk + 50) / 50) * 50) })}
            className="flex h-5 w-5 items-center justify-center rounded border font-semibold text-white" style={{ background: brand.ink, borderColor: brand.ink }} title="Seyrelt (uzun blok = az sinyal)">+</button>
          <span style={{ color: brand.muted }}>m · <b>elle koyduğun sinyaller zaten blok sınırıdır</b> ({sinyalSimKonum.length} sinyal); bu aralık yalnız sinyalsiz açık kesimleri böler. Kapasite (h_min) bu bloklardan hesaplanır — sim ile birebir aynı.</span>
        </div>
        {/* Filo kaynağı + kapasite bağlantısı */}
        <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>
          🚋 Canlı Ağ filosu <b>{filo}</b> tren = <b>Filo Paneli</b>'nden (yukarıda){depoVar ? " · parklanma dizilimine göre depolardan çıkar" : " · hat başından"} · her yön aynı filoyla · ulaşılan aralık <b>{sure(ulasilanHeadwaySn)}</b>
          {maks.gecerli && <> · hat kapasitesi <b>{maks.nTeorik}</b></>}
        </div>
        {filoAsim && (
          <div className="mt-1 text-xs" style={{ color: brand.red }}>
            ⚠ Filo ({filoTek}) bu hattın kapasitesini ({nMax}) aşıyor — simülasyon {filo} trenle koşuyor (fazlası sığmaz, kuyruklanır).
          </div>
        )}
        {ariza.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span style={{ color: brand.red }}>⚠ {ariza.length} blok arızalı (gidiş) — trenler kuyruklanıyor.</span>
            <button onClick={() => setAriza([])} className="rounded border px-2 py-1 font-medium" style={{ borderColor: brand.border, color: brand.ink }}>Arızayı temizle</button>
          </div>
        )}
      </Panel>

      {/* ⑤ CANLI ETKİLER — filo oynadıkça bağlı olduğu her durum canlı güncellenir */}
      {maks.gecerli && (
      <Panel baslik="Canlı Etkiler & Öneriler" aciklama="Filoyu oynattıkça bağlı olduğu her durum burada canlı güncellenir — ulaşılan sıklık, kapasite/park aşımı, tıkanan duraklar/dönüş ihtiyacı ve makaslarda ters işletme ihtiyacı.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
            <div className="text-[0.6rem] uppercase" style={{ color: brand.muted }}>Ulaşılan sıklık</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: brand.ink }}>{sure(ulasilanHeadwaySn)}</div>
            <div className="text-[0.6rem]" style={{ color: brand.muted }}>{(3600 / Math.max(1, ulasilanHeadwaySn)).toFixed(1)} tren/saat · filo {filoTek}</div>
          </div>
          <div className="rounded border p-2.5" style={{ borderColor: filoAsim ? brand.red : brand.border }}>
            <div className="text-[0.6rem] uppercase" style={{ color: brand.muted }}>Kapasite</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: filoAsim ? brand.red : brand.ink }}>{filoTek} / {nMax}</div>
            <div className="text-[0.6rem]" style={{ color: filoAsim ? brand.red : brand.muted }}>{filoAsim ? "⚠ aşıldı, sığmaz" : "araç / üst sınır ✓"}</div>
          </div>
          <div className="rounded border p-2.5" style={{ borderColor: depoVar && parkToplam !== filoTek ? CK.amber : brand.border }}>
            <div className="text-[0.6rem] uppercase" style={{ color: brand.muted }}>Parklanma</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: brand.ink }}>{depoVar ? `${parkToplam}/${filoTek}` : "—"}</div>
            <div className="text-[0.6rem]" style={{ color: depoVar && parkToplam !== filoTek ? CK.amberInk : brand.muted }}>{!depoVar ? "depo yok" : parkToplam === filoTek ? "✓ dizildi" : "⚠ eksik/fazla"}</div>
          </div>
          <div className="rounded border p-2.5" style={{ borderColor: yolcuVeriVar && tersRapor && tersRapor.donusIhtiyaclari.length > 0 ? brand.red : brand.border }}>
            <div className="text-[0.6rem] uppercase" style={{ color: brand.muted }}>Tıkanma / dönüş</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: yolcuVeriVar && tersRapor && tersRapor.donusIhtiyaclari.length > 0 ? brand.red : brand.ink }}>{yolcuVeriVar && tersRapor ? tersRapor.donusIhtiyaclari.length : "—"}</div>
            <div className="text-[0.6rem]" style={{ color: brand.muted }}>{yolcuVeriVar ? "tıkanan durak" : <button type="button" className="underline" style={{ color: brand.ink }} onClick={() => setTalepPopup(true)}>yolcu gir</button>}</div>
          </div>
        </div>
        {yolcuVeriVar && tersRapor && (tersRapor.donusIhtiyaclari.length > 0 || tersRapor.makaslar.some((m) => m.kisaDonusOnerilir)) && (
          <div className="mt-3 space-y-1 text-xs">
            {tersRapor.donusIhtiyaclari.slice(0, 4).map((d, i) => (
              <div key={i} style={{ color: brand.inkSoft }}>🔴 <b>{d.durak}</b> doluluk %{Math.round(d.doluluk * 100)} → <b>{d.oneriMakas}</b> makasından kısa dönüş gerekir.</div>
            ))}
            {tersRapor.makaslar.filter((m) => m.kisaDonusOnerilir).slice(0, 3).map((m, i) => (
              <div key={`m${i}`} style={{ color: brand.muted }}>⟲ <b>{m.ad}</b> kısa dönüş adayı (%{m.kisaDonusYuzde}).{m.crossover === "x" ? "" : " S makas — ters işletme sinyali gerekebilir."}</div>
            ))}
            <div className="mt-1"><Link href="/#tersisletme" className="underline" style={{ color: brand.ink }}>→ Ters İşletme'de detaylı analiz</Link></div>
          </div>
        )}
      </Panel>
      )}

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
              <p className="mt-1 text-[0.7rem]" style={{ color: brand.muted }}>
                <b>Teorik maksimum</b>: darboğazın izin verdiği fiziksel tavan — sıfır pay, her tren sürekli tam kapasite. <b>Sürdürülebilir</b>: UIC 406 doluluk tavanıyla (blok başına ~%60–75 kullanım) <b>her gün güvenle</b> çalıştırılabilen sayı — küçük gecikmeler birbirini tetiklemesin, toparlanma payı kalsın diye teorikten düşüktür (gerçek işletme bu değeri hedefler).
              </p>
              <p className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                Bu hatta aynı anda en fazla <b>{maks.nTeorik}</b> tramvay sığar. Darboğaz: <b>{maks.baglayanAd}</b> · min. aralık {sure(maks.hMin)} · çevrim {sure(maks.cevrimSuresi)}. Kısıt dökümü ve terminal girdileri <Link href="/#ringler" className="underline">Ringler</Link>’de.
              </p>
              {/* Gereken tren = ⌈RTT ÷ hedef headway⌉ — kullanıcının hedef sıklığı için filo */}
              <p className="mt-1 text-xs" style={{ color: brand.ink }}>
                📐 Tur süresi (RTT) <b>{sure(maks.cevrimSuresi)}</b> (2×seyir + tüm durak dwell'leri + terminaller). {headwayDk} dk sefer sıklığı için <b>gereken tren = {Math.ceil(maks.cevrimSuresi / Math.max(1, headwayDk * 60))}</b> (⌈RTT ÷ headway⌉) — <span style={{ color: brand.muted }}>seçtiğin sıklıkta çalışmak için hatta bulunması gereken tramvay: bir tren tam turu (RTT) tamamlayana dek arkasından kaç tren dolması gerektiği (tur süresi ÷ sefer aralığı).</span>
              </p>
            </div>
          )}

          <div className="mb-3 rounded border-l-4 px-3 py-2 text-xs" style={{ borderColor: brand.ink, background: CK.goodBgSoft, color: brand.inkSoft }}>
            ℹ️ Filo, ulaşılan sefer aralığı ve hedef headway artık yukarıdaki <b>Filo Paneli</b>'nde (öneri → onayla → filo → parklanma). Burada yalnız <b>Dönüş Bekleme</b> ayarlanır (çevrim süresini ve öneriyi besler).
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Num label="Dönüş Bekleme" suffix="dk" step={0.5} value={turnaroundDk} onChange={(v) => setTurnaroundDk(Math.max(0, v))} />
          </div>

          {/* Ulaşılan aralık fiziksel minimumun altında mı? (filo kapasiteyi aşıyorsa) */}
          {maks.gecerli && ulasilanHeadwaySn < maks.hMin - 1e-6 && (
            <div className="mb-2 text-sm" style={{ color: brand.red }}>
              ⚠ Ulaşılan sefer aralığı ({sure(ulasilanHeadwaySn)}) fiziksel minimum aralığın ({sure(maks.hMin)}) altında — filo çok yüksek, trenler kaçınılmaz kuyruklanır. En sık güvenli aralık ≈ {sure(maks.hMin)} (≈ {nMax} araç).
            </div>
          )}

          {/* Bekleme durumu */}
          <div className="text-sm">
            {canliGidis.anyDelay ? (
              <span style={{ color: brand.red }}>⚠ Bu aralıkta trenler birbirini bekliyor — en fazla {sure(canliGidis.maxDelay)} gecikme.</span>
            ) : (
              <span style={{ color: CK.good }}>✓ Bu aralıkta bekleme yok — trenler serbest akıyor.</span>
            )}
          </div>
        </Panel>
      </section>

      {/* YOLCU DİNAMİĞİ & DURUŞ — dwell fiziksel yolcu akışından hesaplanır. */}
      <section className="mt-6">
        <Panel baslik="Yolcu Dinamiği & Duruş Süresi" aciklama="İstasyon duruş süresi (dwell) keyfi değil, yolcu akışından hesaplanır: araç kapı sayısı/genişliği + konfor + istasyon başına inen/binen → yolcu akış süresi → dwell. Duraklarda inen/binen sayısını Ringler'de girersin; her durak ayrı hesaplanıp tur süresine (RTT) kümülatif eklenir.">
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><Num label="Kapı sayısı" suffix="kapı" step={1} max={12} value={stock.kapiSayisi ?? 4}
              onChange={(v) => patchArac({ kapiSayisi: Math.max(1, Math.round(v)) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>araç başı iniş-biniş kapısı</span></div>
            <div><Num label="Kapı genişliği" suffix="m" step={0.1} value={stock.kapiGenisligi ?? 1.3}
              onChange={(v) => patchArac({ kapiGenisligi: Math.max(0.5, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>tek kapı açıklığı</span></div>
            <div><Num label="Araç genişliği" suffix="m" step={0.05} value={stock.aracGenisligi ?? 2.65}
              onChange={(v) => patchArac({ aracGenisligi: Math.max(2, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>net taban alanı için</span></div>
            <div><Num label="Kullanılabilir alan" suffix="oran" step={0.05} value={stock.kullanilabilirAlanOrani ?? 0.35}
              onChange={(v) => patchArac({ kullanilabilirAlanOrani: Math.max(0.1, Math.min(1, v)) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>ayakta alan / toplam (0..1)</span></div>
            <div><Num label="Konfor indeksi" suffix="yolcu/m²" step={0.5} value={isletme.konforIndeksi}
              onChange={(v) => patchIsletme({ konforIndeksi: Math.max(0, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>ayakta yoğunluk tasarımı</span></div>
            <div><Num label="Yolcu akış hızı" suffix="yolcu/m·s" step={0.1} value={isletme.yolcuAkisHizi}
              onChange={(v) => patchIsletme({ yolcuAkisHizi: Math.max(0.1, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>kapı metresi başına akış (~1.2)</span></div>
            <div title="Bir durakta yolcu az olsa bile en kısa duruş (alt sınır). TÜM duraklara uygulanır — burada değiştirince her durağın oto dwell'i bu tabana göre güncellenir.">
              <Num label="Min duruş süresi" suffix="s" step={1} value={isletme.minDurusSuresi}
              onChange={(v) => patchIsletme({ minDurusSuresi: Math.max(0, Math.round(v)) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>tüm duraklara uygulanır — oto dwell alt sınırı</span></div>
          </div>
          <div className="rounded border-l-4 px-3 py-2 text-xs" style={{ background: CK.goodBgSoft, borderColor: brand.ink, color: brand.inkSoft }}>
            Net taban alanı <b>{netTabanAlani(stock).toFixed(1)} m²</b> · maksimum yolcu kapasitesi <b>{maxYolcuKapasitesi(stock, isletme.konforIndeksi)} yolcu</b>.
            <br />Dwell = max(<b>min duruş</b>, <i>(inen+binen) ÷ (kapı×genişlik×akış)</i>) + kapı aç + kapı kapa. Her durakta ayrı → RTT'ye kümülatif.
            <br />ℹ️ Dwell <b>otomatik</b> (yolcu akışından) gelir ama zorunlu değil — istersen her durakta <b>elle</b> de girebilirsin: <Link href="/#ringler" className="underline">Ringler → Duraklar &amp; Mesafeler</Link>’de o durağın <b>“oto dwell”</b> kutusunu kapatıp değeri yaz. Oto açıkken alt sınır yukarıdaki <b>min duruş süresi</b>dir.
          </div>
        </Panel>
      </section>

      {/* GÜN İÇİ SERVİS & PARKLANMA — filo gün boyu sabit değil: pik saatte hepsi
          hatta, pik-dışında fazlası depoya döner (parklanma), gece hepsi depoda. */}
      <section className="mt-6">
        <Panel baslik="Gün İçi Servis & Parklanma" aciklama="Filo gün boyu sabit değildir: pik saatte tüm filo hatta, pik-dışında bir kısmı depoya döner (mola/parklanma), gece hepsi depoda bekler. Depo kapasitesi bunu barındırabiliyor mu görürsün.">
          <div className="mb-3 rounded border-l-4 px-3 py-2 text-xs" style={{ borderColor: brand.ink, background: CK.goodBgSoft, color: brand.inkSoft }}>
            ℹ️ Filo = <b>{filoTek} araç</b> (yukarıdaki Filo Paneli'nden — tek sayı, parklanma dizilimine göre depolara konur). Aşağıdaki grafik gün içi parklanma doluluğunu, saatler ise servis penceresini gösterir.
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block"><span className="field-label">Servis başlangıç</span>
              <input type="time" value={isletme.servisBas} onChange={(e) => patchIsletme({ servisBas: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} /></label>
            <label className="block"><span className="field-label">Servis bitiş</span>
              <input type="time" value={isletme.servisBit === "24:00" ? "23:59" : isletme.servisBit} onChange={(e) => patchIsletme({ servisBit: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} /></label>
            <label className="block"><span className="field-label">Sabah pik baş.</span>
              <input type="time" value={isletme.pikSabahBas} onChange={(e) => patchIsletme({ pikSabahBas: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} /></label>
            <label className="block"><span className="field-label">Sabah pik bit.</span>
              <input type="time" value={isletme.pikSabahBit} onChange={(e) => patchIsletme({ pikSabahBit: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} /></label>
            <label className="block"><span className="field-label">Akşam pik baş.</span>
              <input type="time" value={isletme.pikAksamBas} onChange={(e) => patchIsletme({ pikAksamBas: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} /></label>
            <label className="block"><span className="field-label">Akşam pik bit.</span>
              <input type="time" value={isletme.pikAksamBit} onChange={(e) => patchIsletme({ pikAksamBit: e.target.value })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} /></label>
          </div>

          <ServisGrafik profil={servisProfil} />

          {isletme.toplamFilo < isletme.pikFilo && (
            <div className="mt-2 text-xs" style={{ color: brand.red }}>
              ⚠ Toplam filo ({isletme.toplamFilo}) pik filodan ({isletme.pikFilo}) küçük olamaz — servis için en az pik filo kadar araç gerekir. Toplam filoyu en az {isletme.pikFilo} yap.
            </div>
          )}
          <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>
            En fazla <b>{servisProfil.maxDepoda}</b> tren aynı anda depoda bekler (gece/servis dışı). Toplam depo kapasitesi:{" "}
            {depoKapasiteToplam > 0 ? (
              <b style={{ color: servisProfil.kapasiteYeterli ? CK.good : brand.red }}>{depoKapasiteToplam} tren {servisProfil.kapasiteYeterli ? "✓ yeterli" : "✗ yetersiz"}</b>
            ) : (
              <span style={{ color: brand.muted }}>tanımsız/sınırsız — Ringler'de parklanma alanına kapasite gir</span>
            )}
            {depoSayisi === 0 && <span style={{ color: CK.amber }}> · henüz parklanma alanı yok (Ringler → 🅿)</span>}
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

function ServisGrafik({ profil }: { profil: ServisProfil }) {
  const W = 480, H = 132, padL = 22, padB = 18, padT = 8;
  const cw = (W - padL) / 24;
  const maxV = Math.max(1, profil.toplamFilo);
  const h0 = H - padB;
  const y = (v: number) => padT + (h0 - padT) * (1 - v / maxV);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 150 }} role="img" aria-label="Gün içi servis/depo profili">
        {[0, Math.round(maxV / 2), maxV].map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W} y2={y(v)} stroke={brand.border} strokeWidth={0.5} />
            <text x={padL - 3} y={y(v) + 3} textAnchor="end" fontSize={7} fill={CK.muted}>{v}</text>
          </g>
        ))}
        {profil.saatler.map((s) => {
          const x = padL + s.saat * cw;
          return (
            <g key={s.saat}>
              {s.depoda > 0 && <rect x={x + 0.8} y={y(s.serviste + s.depoda)} width={cw - 1.4} height={y(s.serviste) - y(s.serviste + s.depoda)} fill={CK.muted} opacity={0.32} />}
              {s.serviste > 0 && <rect x={x + 0.8} y={y(s.serviste)} width={cw - 1.4} height={h0 - y(s.serviste)} fill={CK.blue} opacity={s.pik ? 1 : 0.55} />}
              <title>{`${s.saat}:00 — hatta ${s.serviste}, depoda ${s.depoda}${s.pik ? " (pik)" : s.aktif ? "" : " (servis dışı)"}`}</title>
              {s.saat % 3 === 0 && <text x={x + cw / 2} y={H - 6} textAnchor="middle" fontSize={7} fill={CK.muted}>{s.saat}</text>}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[0.65rem]" style={{ color: CK.muted }}>
        <span><span style={{ color: CK.blue }}>■</span> hatta (koyu = pik)</span>
        <span><span style={{ color: CK.muted }}>■</span> depoda bekleyen</span>
        <span>· saat →</span>
      </div>
    </div>
  );
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
