"use client";

// raysim — interaktif çalışma alanı (Faz 1 editörü + Firebase senaryolar).
// Ağ + araç düzenlenir; her değişiklikte flattenRoute→simulate→paneller anında güncellenir.
// Senaryolar Firestore'a kaydedilir/yüklenir. İstasyon ekle/sil grafı düzenler.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { RailNetwork, Route } from "@/lib/anaray/types";
import { flattenRoute, ringlerdenSebeke, hemzeminDuruslari, duruslariEkle, kalkisEkle, hatOzellikleri, kavsakliRingler, subeEfektifRingler } from "@/lib/anaray/network";
import { simulate } from "@/lib/anaray/sim";
import { simulateSignalled, reverseRoute, monteCarlo, planDepotDispatch, loopYorunge, type MonteCarloResult } from "@/lib/anaray/signalling";
import { tramvaylar } from "@/lib/anaray/vehicles";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { etkinArac, type Isletme } from "@/lib/anaray/config";
import { osmKoordinatEsle } from "@/lib/anaray/adEsle";
import { Kaynak } from "@/components/Kaynak";
import { parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur } from "@/lib/anaray/gtfs";
import { cakismaTespit } from "@/lib/anaray/cakisma";
import { cakismaCoz } from "@/lib/anaray/cakismaCozum";
import { gecikmeYayilim } from "@/lib/anaray/gecikmeYayilim";
import { ortakKesimAnaliz } from "@/lib/anaray/ortakKesim";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { haritaKisitlari, type HaritaKisit } from "@/lib/anaray/ring";
import { dwellUygulanmisRings, maxYolcuKapasitesi, netTabanAlani } from "@/lib/anaray/yolcu";
import { kmh, km, sure } from "@/lib/anaray/format";
import { panelAcVeGit } from "@/lib/anaray/panelGezinme";
import { NedenDetay } from "@/components/NedenDetay";
import { AutoAciklama } from "@/components/AutoAciklama";
import { Ikon } from "@/components/Ikon";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";
import { BosHat } from "@/components/BosHat";
import { Kart } from "@/components/Kart";
import { Kpi, MiniStat } from "@/components/Kpi";
import { TabBar } from "@/components/Tabs";
import { CografiAg } from "@/components/CografiAg";
import { KoordinatDuzen } from "@/components/KoordinatDuzen";
import { LiveNetwork } from "@/components/LiveNetwork";
import { Bildfahrplan } from "@/components/Bildfahrplan";
import { HizProfili } from "@/components/HizProfili";
import { YukDwellAnaliz } from "@/components/YukDwellAnaliz";
import { TalepZinciri } from "@/components/TalepZinciri";
import { GrafikCerceve } from "@/components/GrafikCerceve";
import { Tarife } from "@/components/Tarife";
import { TersIsletme } from "@/components/TersIsletme";
import { SeferTersEntegre } from "@/components/SeferTersEntegre";

const KMH = 1 / 3.6;

// MODEL KURALI: blok düzeni TEK KAYNAK = kullanıcının koyduğu SİNYAL LAMBALARI
// (network.sinyalKonumlari) + istasyonlar. Canlı sim, grafikler ve kapasite/blocking
// AYNI blok sınırlarını kullanır → sinyaller kapasite ile birebir hizalı, kayma yok.
// Sinyal ekle/kaldır → blok bölünür/birleşir, kapasite ona göre değişir.

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
  const { t } = useDil();
  const { rings } = useProje();
  // Proje hattı boşken sahte bir örnek şebeke göstermek yanıltıcı olur.
  if (rings.length === 0) return <BosHat modul={t({ tr: "Sefer simülasyonu", en: "Service simulation", de: "Betriebssimulation" })} />;
  return <StudioIc />;
}

function StudioIc() {
  const { t } = useDil();
  const { cfg } = useSimConfig();
  const { rings: ringsHam, meta, subeler } = useProje();
  // Araç ve işletme parametreleri KALICI (projeye kayıtlı) — tek kaynak, uçucu değil.
  const { arac: stock, patchArac, setArac } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  // Canlı sim/çizim için config dinamik tavanları (ivme/servis freni) araca bağlanır.
  // `stock` HAM kalır (araç editörü + patchArac onu düzenler); `stockSim` yalnız motorlara.
  const stockSim = useMemo(() => etkinArac(stock, cfg), [stock, cfg]);

  // Analiz edilen hat: ana hat (null) ya da bir şube (dallanma, #1). Şube seçilince
  // tüm Studio analizi (kapasite/Bildfahrplan/çakışma/knock-on/canlı sim) o şubenin
  // EFEKTİF ring zincirini kullanır: hat başı → kavşak (ana ring'ler) + şube ring'leri.
  const [analizSubeId, setAnalizSubeId] = useState<string | null>(null);
  const analizSube = useMemo(() => subeler.find((s) => s.id === analizSubeId) ?? null, [subeler, analizSubeId]);
  // Yolcu dinamiği: dwell OTO ringlerin dwell'i fiziksel akıştan hesaplanır → canlı
  // sim ve kapasite AYNI hesaplı dwell'i kullanır (tutarlı).
  // Şube seçiliyse efektif zincir (hat başı→kavşak + şube), ana hattaysa kavşak
  // makaslı ana hat (her şube ayrımına turnout eklenir → kapasite/çakışma gerçekçi).
  const rings = useMemo(() => {
    const taban = analizSube ? subeEfektifRingler(ringsHam, analizSube) : kavsakliRingler(ringsHam, subeler);
    return dwellUygulanmisRings(taban, stock, isletme);
  }, [ringsHam, subeler, stock, isletme, analizSube]);

  // Sefer modülünün hattı = PAYLAŞILAN proje hattı (Ringler/Tam Hat/Belgeler ile
  // aynı kaynak). Ring zinciri graf şebekesine çevrilir; şubeler (dallanma) dâhil.
  // Ana hattayken şubeler grafikte spur olarak görünür; bir şube analiz edilirken
  // `rings` zaten o şubenin efektif zinciridir → grafiğe şube TEKRAR eklenmez.
  const proje = useMemo(
    () => ringlerdenSebeke(rings, cfg, meta.hatAdi || "Proje Hattı", analizSube ? [] : subeler),
    [rings, cfg, meta.hatAdi, subeler, analizSube]
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
  // İstenen işletme aralığı, fiziksel min. aralığın (h_min) altındaysa uygulanamaz.
  const [ariza, setAriza] = useState<number[]>([]); // dispatcher: arızalı bloklar (gidiş hattı) — geçici what-if
  // Monte-Carlo senaryo parametreleri KALICI (projeye kayıtlı) — tek kaynak isletme.
  const meanEntry = isletme.mcMeanEntrySn;
  const setMeanEntry = (v: number) => patchIsletme({ mcMeanEntrySn: v });
  const meanDwell = isletme.mcMeanDwellSn;
  const setMeanDwell = (v: number) => patchIsletme({ mcMeanDwellSn: v });
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);
  const [talepPopup, setTalepPopup] = useState(false); // yolcu verisi yokken talep-öneri uyarısı
  const [agGorunum, setAgGorunum] = useState<"sematik" | "harita">("sematik"); // Canlı Ağ: şematik şerit / coğrafi harita
  const [cakismasizCizelge, setCakismasizCizelge] = useState(false); // çakışma çözücüsü offset'lerini canlı sime UYGULA (opt-in, vars. kapalı)
  const [koordAcik, setKoordAcik] = useState(false); // istasyon koordinat giriş paneli açık mı
  const [haritaBilgi, setHaritaBilgi] = useState(false); // harita bilgilendirme paneli (değer önerisi) açık mı — vars. kapalı
  const [gtfsYukle, setGtfsYukle] = useState<"bos" | "yukleniyor" | "hata">("bos"); // gtfsHazir tek-tıkla import durumu
  const [gtfsMesaj, setGtfsMesaj] = useState("");
  const [koHedef, setKoHedef] = useState(0);      // knock-on: birincil gecikme verilen tren
  const [koGecikme, setKoGecikme] = useState(180); // knock-on: birincil gecikme (s)
  // Pop-up'ı BODY'ye portallamak için mount bekle (SSR'da document yok). Portal,
  // modal'ı dar/dönüştürülmüş atalardan çıkarır → daima ekranın ORTASINDA açılır.
  const [mounted, setMounted] = useState(false);
  // SSR-güvenli mount kapısı (pop-up BODY'ye portallanır) — kabul edilen desen.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

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
    return { line: l, result: simulate(l, stockSim, 0.5) };
  }, [network, stockSim, route, gecitDuruslari, kalkisSu]);

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
  // Depo pozisyonları doğrudan HATTAN gelir (filo/headway'e bağlı değil) → parkToplam'ı
  // filodan ÖNCE hesaplayabiliriz.
  const parkAnahtar = (pos: number) => `d${Math.round(pos)}`;
  const depoPozlar = useMemo(
    () => line.stations.filter((s) => s.depot && s.position < line.length - 1e-6).map((s) => s.position),
    [line]
  );
  const parkToplam = useMemo(() => {
    const dz = isletme.parklanmaDagilim || {};
    return depoPozlar.reduce((s, p) => s + Math.max(0, Math.round(dz[parkAnahtar(p)] ?? 0)), 0);
  }, [isletme.parklanmaDagilim, depoPozlar]);
  const parkDiziliVar = parkToplam > 0;
  // KOŞAN FİLO: elle parklanma dizilimi girildiyse filo = dizilim TOPLAMI (ürün kuralı:
  // "filo = parklanma alanına dizdiğin araç sayısı"). Böylece her depoda canlı görünen
  // tren sayısı, o depoya girdiğin sayıyla BİREBİR olur (sarma/yığılma yok). Dizilim
  // yoksa Filo panelindeki sayı kullanılır (geriye-uyum).
  const filo = Math.min(nMax, parkDiziliVar ? parkToplam : filoTek); // simde koşan (kapasiteyle tavanlı)
  const filoAsim = maks.gecerli && filoTek > nMax;    // filo > hat kapasitesi
  // HEDEF headway = tasarım kuralı (240 s vars.) → ÖNERİ bundan. ULAŞILAN = RTT/filo.
  const hedefHeadwaySn = Math.max(1, headwayDk * 60);
  const ulasilanHeadwaySn = maks.gecerli ? maks.cevrimSuresi / Math.max(1, filo) : hedefHeadwaySn;
  // Yolcu (talep) verisi girili mi? Girilmişse öneri/tıkanma ona göre; değilse pop-up.
  const yolcuVeriVar = !!isletme.istasyonYolcu && Object.keys(isletme.istasyonYolcu).length > 0;
  const tersRapor = useMemo(() => tersIsletmeAnaliz(rings, stock, isletme, cfg), [rings, stock, isletme, cfg]);
  const talepFilosu = yolcuVeriVar && tersRapor ? tersRapor.filo.gerekenArac : 0;
  // KURP KONFOR TAVSİYELERİ (harita) — her ring'in doluluğu HER İSTASYONDAN alınan yolcu
  // sayısıyla (tersRapor.duraklar[i].doluluk) eşlenir → kurpta ayakta-yolcu konfor uyarısı
  // + önerilen ≤hız. Haritada: aşım (geometri fazla) her zaman; kalabalık YALNIZ yolcu verisi
  // varken (doluluğa bağlı) gösterilir — verisizken düz konfor-bandı kurpları kirletmesin.
  // HARİTA HIZ KISITLARI — makas/geçit/tehlike/kurp: hat-boyu mutlak km + hız sınırı (km/h).
  // Kurplarda doluluk HER İSTASYONDAN alınan yolcu sayısıyla (tersRapor.duraklar[i].doluluk)
  // eşlenir → ayakta-yolcu konfor önerisi. Haritada tıklanabilir işaret + popup.
  const hizKisitlari = useMemo<HaritaKisit[]>(() => {
    const dolulukByRing: Record<string, number> = {};
    if (tersRapor) rings.forEach((r, i) => { const d = tersRapor.duraklar[i]; if (d) dolulukByRing[r.id] = d.doluluk; });
    return haritaKisitlari(rings, cfg, dolulukByRing);
  }, [rings, cfg, tersRapor]);
  // Önerilen tramvay = ⌈RTT ÷ hedef headway⌉ (kural); yolcu girildiyse talep de artırabilir.
  const oneriTramvay = maks.gecerli ? Math.max(1, Math.ceil(maks.cevrimSuresi / hedefHeadwaySn), talepFilosu) : 0;
  const filoOneriUyum = filoTek === oneriTramvay;
  const depotPlan = useMemo(() => planDepotDispatch(line, ulasilanHeadwaySn), [line, ulasilanHeadwaySn]);
  const depoVar = depotPlan.depots.length > 0;
  // Canlı sim'i başlatmak için GEREKLİ iki şey: (1) parklanma alanı (depo) seçili, (2) filo onaylı.
  const filoHazir = !!isletme.filoOnaylandi;
  const simHazir = depoVar && filoHazir;
  // Rapor QR akışı: ?oynat=1 → canlı sim otomatik başlar; #canli → o bölüme yumuşak kaydır.
  const otoOynat = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("oynat") === "1";
  useEffect(() => {
    if (!simHazir || typeof window === "undefined") return;
    if (window.location.hash !== "#canli" && !otoOynat) return;
    const el = document.getElementById("canli");
    if (el) { const t = setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 350); return () => clearTimeout(t); }
  }, [simHazir, otoOynat]);
  // Parklanma dizilimi (elle) — parkAnahtar/parkToplam/parkDiziliVar yukarıda (filodan
  // ÖNCE) tanımlı. parkDizili = geçerli bir elle dizilim var mı?
  const parkDizili = parkDiziliVar;
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
    () => simulateSignalled(line, stockSim, { headway: ulasilanHeadwaySn, count: filo, blocked: ariza, origins: gidisOrigins, sinyaller: sinyalSimKonum }),
    [line, stockSim, ulasilanHeadwaySn, filo, gidisOrigins, ariza, sinyalSimKonum]
  );
  const donusSim = useMemo(
    () => simulateSignalled(reverseLine, stockSim, { headway: ulasilanHeadwaySn, count: filo, sinyaller: sinyalSimKonum.map((p) => reverseLine.length - p) }),
    [reverseLine, stockSim, ulasilanHeadwaySn, filo, sinyalSimKonum]
  );
  // DÖNGÜ (git-gel): tek-tren tam tur yörüngesi — uçlarda turnback (peron işgali) + durum izleme.
  const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSon = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopY = useMemo(
    () => loopYorunge(line, reverseLine, stockSim, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon }),
    [line, reverseLine, stockSim, peronBas, peronSon]
  );
  // Çizelge çakışma tespiti (#2) — tek-hat karşılaşmaları + sistemik headway<hMin.
  // (dagitim'den ÖNCE: çakışmasız çizelge modu bunun çözümünü kalkışlara uygular.)
  const cakisma = useMemo(
    () => cakismaTespit(rings, stock, cfg, loopY, filo, isletme),
    [rings, stock, cfg, loopY, filo, isletme]
  );
  // Çakışma çözümü (advisory) — tek-hat çakışması varsa optimize kalkış offset'leri.
  const cakismaCozum = useMemo(
    () => (cakisma.spanOzet.length ? cakismaCoz(cakisma.spanlar, loopY, filo) : null),
    [cakisma, loopY, filo]
  );

  // Depo dağıtımı — SADE ve TEK TİP: bütün tramvaylar AYNI başlangıç noktasından
  // (depo/başlangıç terminali), AYNI yönde (gidiş, alt şerit), SIRAYLA (headway aralığı)
  // yola çıkar; her biri tam turu (gidiş→dönüş) yapıp sırayla çıktığı yere döner. Karşı-şerit
  // başlangıcı YOK → 2,4,6.. trenler 1,3,5.. ile aynı hareket eder; iki şerit, trenler
  // turnback'e ulaştıkça DOĞAL olarak dolar (gerçek işletmede depodan öyle çıkarlar).
  // ÇAKIŞMASIZ ÇİZELGE (opt-in): açık ve çözülebiliyorsa dispatchT = çözücü offset'i
  // (uneven) → sim tek-hat çakışmasını gidermiş çizelgeyi koşar. Kapalıyken k×headway (even).
  const cozOffsetler = cakismasizCizelge && cakismaCozum?.cozuldu ? cakismaCozum.offsetler : null;
  const dagitim = useMemo(() => {
    const origins = gidisOrigins ?? [];
    const orn = loopY.ornekler;
    const sToT = (hedefS: number) => { let en = 0, bd = Infinity; for (const o of orn) { const dd = Math.abs(o.s - hedefS); if (dd < bd) { bd = dd; en = o.t; } } return en; };
    return Array.from({ length: filo }, (_, k) => {
      const parkPos = origins.length > 0 ? origins[k % origins.length] : 0;
      return { parkPos, gidis: true, dispatchT: cozOffsetler ? cozOffsetler[k] : k * ulasilanHeadwaySn, startPhase: sToT(Math.min(loopY.L, parkPos)) };
    });
  }, [gidisOrigins, filo, loopY, ulasilanHeadwaySn, cozOffsetler]);
  const loopVeri = useMemo(
    () => ({ ...loopY, count: filo, offset: loopY.periyot / Math.max(1, filo), dagitim }),
    [loopY, filo, dagitim]
  );
  // Canlı Ağ HARİTA modu: istasyon adları (tekil) + tüm istasyonların koordinatı var mı
  // (varsa gerçek harita; yoksa şematik/ölçekli). Koordinatlar Isletme'de kalıcı.
  const agKoordinat = isletme.istasyonKoordinat;
  const agIstasyonlar = useMemo(() => Array.from(new Set(line.stations.map((s) => s.name))), [line]);
  const agKoordSay = useMemo(
    () => agIstasyonlar.filter((n) => { const c = agKoordinat?.[n]; return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lon); }).length,
    [agIstasyonlar, agKoordinat]
  );
  const haritaTam = agIstasyonlar.length > 0 && agKoordSay === agIstasyonlar.length; // hepsi koordinatlı → gerçek harita
  // TAM koordinatlıysa İLK yüklemede Harita'yı VARSAYILAN yap (bir kez).
  const agModAyarlandi = useRef(false);
  useEffect(() => {
    if (agModAyarlandi.current || !haritaTam) return;
    agModAyarlandi.current = true;
    setAgGorunum("harita");
  }, [haritaTam]);

  // OSM AUTO-FETCH (gömülü YOK): hattın osmBbox'ı varsa ve koordinat/geometri eksikse,
  // SUNUCU tarafı OSM'den (Vercel IP → rate-limit yok) çek + ada göre eşle + kalıcı yaz.
  // Overpass ağır bbox'ta sık 502 verir → SINIRLI RETRY (backoff); yalnız BAŞARIDA kalıcı
  // biter, tüm denemeler başarısızsa ref sıfırlanır ki sonraki değişimde yeniden denensin.
  const osmCekRef = useRef<string | null>(null);
  useEffect(() => {
    // CAD/GTFS ile İÇE AKTARILAN koordinat YETKİLİDİR → OSM'e HİÇ girişme (üzerine yazma),
    // sayfa doğrudan bu veriyle hazır çizilir. En düzgün algoritma: sağlanan veri kazanır.
    if (isletme.koordinatKaynak === "iceaktar" || isletme.koordinatKaynak === "manuel") return;
    const bbox = isletme.osmBbox;
    const geometriVar = !!(isletme.hatGeometri && isletme.hatGeometri.length);
    if (!bbox || agIstasyonlar.length === 0) return;
    if (haritaTam && geometriVar) return; // koordinat + geometri tam → OSM'e gitmeye gerek yok
    const key = bbox.join(",");
    if (osmCekRef.current === key) return;
    osmCekRef.current = key;
    let iptal = false;
    const bekle = (ms: number) => new Promise((res) => setTimeout(res, ms));
    (async () => {
      for (let deneme = 0; deneme < 4 && !iptal; deneme++) {
        if (deneme > 0) { await bekle(6000 * deneme); if (iptal) return; } // 6s·12s·18s backoff
        try {
          const r = await fetch("/api/geometri/osm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bbox }) });
          const j = await r.json();
          if (iptal) return;
          if (!r.ok) continue; // 502/429 (Overpass yoğun) → tekrar dene
          const patch: Partial<Isletme> = {};
          if (Array.isArray(j.istasyonlar) && j.istasyonlar.length) {
            const koord = osmKoordinatEsle(agIstasyonlar, j.istasyonlar);
            if (Object.keys(koord).length) patch.istasyonKoordinat = { ...(isletme.istasyonKoordinat ?? {}), ...koord };
          }
          if (Array.isArray(j.geometri) && j.geometri.length) patch.hatGeometri = j.geometri;
          if (Object.keys(patch).length) patchIsletme(patch);
          return; // başarı — kalıcı biter
        } catch { /* ağ hatası → tekrar dene */ }
      }
      if (!iptal) osmCekRef.current = null; // hepsi başarısız → yeniden denenebilir kalsın
    })();
    return () => { iptal = true; };
  }, [isletme.osmBbox, haritaTam, agIstasyonlar, isletme.istasyonKoordinat, isletme.hatGeometri, isletme.koordinatKaynak, patchIsletme]);

  // TEK-TIKLA İÇE AKTAR (gtfsHazir): hazır etap hattının GTFS asset'ini indir → ayrıştır →
  // durak lat/lon + gerçek geometriyi ada göre eşle → PROJEYE yaz (koordinatKaynak="iceaktar",
  // yetkili → OSM'e girişilmez). Gömülü koordinat DEĞİL; makas/sinyal/ring korunur (yalnız
  // koordinat + geometri eklenir). Kaynak ~150m CAD+kilometraj olduğundan koordinatYaklasik=true.
  const gtfsIceAktar = async () => {
    const url = isletme.gtfsHazir;
    if (!url) return;
    setGtfsYukle("yukleniyor"); setGtfsMesaj("");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("indirilemedi");
      const feed = parseGtfsZip(new Uint8Array(await r.arrayBuffer()));
      const rid = gtfsRotalar(feed)[0]?.id;
      if (!rid) throw new Error("rota yok");
      const dir = gtfsYonler(feed, rid)[0]?.dir ?? "0";
      const sonuc = gtfsHatKur(feed, rid, dir);
      const koord = osmKoordinatEsle(agIstasyonlar, sonuc.duraklar ?? []);
      if (Object.keys(koord).length === 0) throw new Error("istasyon adları eşleşmedi");
      const patch: Partial<Isletme> = {
        istasyonKoordinat: { ...(isletme.istasyonKoordinat ?? {}), ...koord },
        koordinatKaynak: "iceaktar", koordinatYaklasik: true,
      };
      if (sonuc.geometri && sonuc.geometri.length >= 2) patch.hatGeometri = [{ noktalar: sonuc.geometri }];
      patchIsletme(patch);
      setAgGorunum("harita");
      setGtfsYukle("bos");
      setGtfsMesaj(`✓ ${Object.keys(koord).length} ${t({ tr: "durak koordinatı içe aktarıldı (projeye kaydedildi).", en: "stop coordinates imported (saved to project).", de: "Haltestellenkoordinaten importiert (im Projekt gespeichert)." })}`);
    } catch (e) {
      setGtfsYukle("hata");
      setGtfsMesaj(e instanceof Error && e.message === "istasyon adları eşleşmedi" ? t({ tr: "Durak adları eşleşmedi.", en: "Stop names did not match.", de: "Haltestellennamen stimmten nicht überein." }) : t({ tr: "İçe aktarılamadı — tekrar deneyin.", en: "Import failed — try again.", de: "Import fehlgeschlagen — erneut versuchen." }));
    }
  };

  // AKTİF "OSM'DEN ÇEK" (① işleyen/OSM'de kayıtlı hatlar): hattın bbox'ından (yoksa mevcut
  // koordinatlardan türetilir) SUNUCU-OSM'den durak lat/lon + geometri çeker, ada göre eşler,
  // PROJEYE yazar. Kısmî eşleşmede (bazı durak OSM'de yok) kaç bulunduğunu söyler → kalanı
  // elle ya da ② CAD/GTFS ile tamamlanır. Overpass 502'ye karşı retry.
  const osmCek = async () => {
    let bbox = isletme.osmBbox;
    if (!bbox) {
      const pts = agIstasyonlar.map((n) => agKoordinat?.[n]).filter((c): c is { lat: number; lon: number } => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lon));
      if (pts.length >= 2) {
        const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon), m = 0.01;
        bbox = [Math.min(...lats) - m, Math.min(...lons) - m, Math.max(...lats) + m, Math.max(...lons) + m];
      } else {
        setGtfsYukle("hata"); setGtfsMesaj(t({ tr: "OSM için hattın konumu yok — önce birkaç durak koordinatı girin ya da ② CAD/GTFS içe aktarın.", en: "No location for OSM — first enter a few stop coordinates or ② import CAD/GTFS.", de: "Kein Standort für OSM — geben Sie zuerst einige Haltestellenkoordinaten ein oder ② importieren Sie CAD/GTFS." })); setKoordAcik(true); return;
      }
    }
    setGtfsYukle("yukleniyor"); setGtfsMesaj("");
    const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let deneme = 0; deneme < 4; deneme++) {
      if (deneme > 0) await bekle(5000 * deneme);
      try {
        const r = await fetch("/api/geometri/osm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bbox }) });
        const j = await r.json();
        if (!r.ok) continue;
        const koord = osmKoordinatEsle(agIstasyonlar, Array.isArray(j.istasyonlar) ? j.istasyonlar : []);
        const birlesik = { ...(isletme.istasyonKoordinat ?? {}), ...koord };
        const patch: Partial<Isletme> = {};
        if (Object.keys(koord).length) patch.istasyonKoordinat = birlesik;
        if (Array.isArray(j.geometri) && j.geometri.length) patch.hatGeometri = j.geometri;
        if (Object.keys(patch).length) patchIsletme(patch);
        const bulunan = agIstasyonlar.filter((n) => { const c = birlesik[n]; return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lon); }).length;
        const toplam = agIstasyonlar.length;
        setGtfsYukle("bos");
        if (bulunan >= toplam) { setAgGorunum("harita"); setGtfsMesaj(`✓ ${toplam}/${toplam} ${t({ tr: "durak OSM'den çekildi.", en: "stops fetched from OSM.", de: "Haltestellen aus OSM geholt." })}`); }
        else { setKoordAcik(true); setGtfsMesaj(`⚠ ${bulunan}/${toplam} ${t({ tr: "durak OSM'de bulundu — kalan", en: "stops found in OSM — the remaining", de: "Haltestellen in OSM gefunden — die verbleibenden" })} ${toplam - bulunan} ${t({ tr: "OSM'de yok. Aşağıda elle girin ya da ② CAD/GTFS içe aktarın.", en: "are not in OSM. Enter them by hand below or ② import CAD/GTFS.", de: "sind nicht in OSM. Geben Sie sie unten manuell ein oder ② importieren Sie CAD/GTFS." })}`); }
        return;
      } catch { /* ağ/Overpass hatası → tekrar dene */ }
    }
    setGtfsYukle("hata"); setGtfsMesaj(t({ tr: "OSM'den çekilemedi (Overpass yoğun olabilir) — birazdan tekrar deneyin.", en: "Could not fetch from OSM (Overpass may be busy) — try again shortly.", de: "Konnte nicht aus OSM geholt werden (Overpass evtl. ausgelastet) — bald erneut versuchen." }));
  };

  // Gecikme yayılımı / knock-on (#3) — hedef trene birincil gecikme → ardışık zincir.
  const knockOn = useMemo(
    () => gecikmeYayilim(line, stockSim, { headway: ulasilanHeadwaySn, count: filo, sinyaller: sinyalSimKonum }, koHedef, koGecikme),
    [line, stockSim, ulasilanHeadwaySn, filo, sinyalSimKonum, koHedef, koGecikme]
  );
  // Ortak kesim yükü (#1-B/D) — ana hat görünümünde, şubeye servis treni girildiyse.
  const ortakKesim = useMemo(
    () => ortakKesimAnaliz(dwellUygulanmisRings(ringsHam, stock, isletme), subeler, stock, cfg, isletme, filo),
    [ringsHam, subeler, stock, cfg, isletme, filo]
  );

  const monteCarloCalistir = () => {
    setMcRunning(true);
    // Ağır hesap; "hesaplanıyor" görünsün diye bir sonraki tik'e ertele.
    setTimeout(() => {
      const r = monteCarlo(
        line, stockSim,
        { headway: ulasilanHeadwaySn, count: filo, sinyaller: sinyalSimKonum },
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* ANALİZ EDİLEN HAT SEÇİCİ (dallanma, #1) — ana hat ya da bir şube. Şube seçilince
          tüm paneller (kapasite/Bildfahrplan/çakışma/knock-on/canlı sim) o şubenin
          efektif zincirini (hat başı → kavşak + şube) analiz eder. Yalnız şube varsa görünür. */}
      {subeler.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3" style={{ borderColor: brand.borderStrong, background: "#fff" }}>
          <span className="text-sm font-semibold" style={{ color: brand.ink }}>{t({ tr: "Analiz edilen hat:", en: "Line analysed:", de: "Analysierte Linie:" })}</span>
          <select value={analizSubeId ?? ""} onChange={(e) => setAnalizSubeId(e.target.value || null)}
            className="rounded border px-3 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
            <option value="">{t({ tr: "Ana hat", en: "Main line", de: "Hauptlinie" })}</option>
            {subeler.map((s) => <option key={s.id} value={s.id}>{t({ tr: "Şube", en: "Branch", de: "Zweig" })}: {s.ad}</option>)}
          </select>
          {analizSube && <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "Hat başından kavşağa + şube", en: "From line start to junction + branch", de: "Vom Linienanfang zur Verzweigung + Zweig" })} ({analizSube.rings.length} {t({ tr: "durak", en: "stops", de: "Haltestellen" })}) — {t({ tr: "tüm analiz bu rotaya göre.", en: "all analysis follows this route.", de: "die gesamte Analyse folgt dieser Route." })}</span>}
          {!analizSube && ortakKesim.aktif && (
            <span className="w-full text-xs" style={{ color: ortakKesim.uygun ? "#0E7C57" : CK.red }}>
              {ortakKesim.uygun ? t({ tr: "✓ Ortak kesim yükü uygun", en: "✓ Shared-section load acceptable", de: "✓ Last des gemeinsamen Abschnitts zulässig" }) : t({ tr: "⚠ Ortak kesim aşırı yüklü", en: "⚠ Shared section overloaded", de: "⚠ Gemeinsamer Abschnitt überlastet" })} — {ortakKesim.ozet}
            </span>
          )}
        </div>
      )}
      {/* Talebe göre öneri için yolcu verisi gerekli — pop-up (tahmin YOK).
          BODY'ye portallanır → sayfanın neresinde olursak olalım ekranın tam
          ORTASINDA (viewport merkezinde) açılır, yukarıda takılı kalmaz. */}
      {mounted && talepPopup && createPortal((
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setTalepPopup(false)}>
          <div className="max-w-md rounded-lg p-5 shadow-xl" style={{ background: "#fff", border: `1px solid ${brand.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold" style={{ color: brand.ink }}>{t({ tr: "Talebe göre öneri için yolcu verisi gerekli", en: "Passenger data required for demand-based recommendation", de: "Für die nachfragebasierte Empfehlung sind Fahrgastdaten erforderlich" })}</div>
            <p className="mt-2 text-xs" style={{ color: brand.inkSoft }}>{t({ tr: "Tıkanma, dönüş ihtiyacı ve talep-filosu", en: "Congestion, short-turn need and demand fleet", de: "Überlastung, Kehrbedarf und Nachfrage-Flotte" })} <b>{t({ tr: "tahmin edilmez", en: "are not estimated", de: "werden nicht geschätzt" })}</b> — {t({ tr: "gerçek yolcu sayılarını girmelisin. Şu bölümlerde giriş yap:", en: "you must enter real passenger counts. Enter them in these sections:", de: "Sie müssen echte Fahrgastzahlen eingeben. Geben Sie sie in diesen Bereichen ein:" })}</p>
            <ul className="mt-2 ml-4 list-disc text-xs" style={{ color: brand.inkSoft }}>
              <li><Link href="/#tersisletme" className="font-semibold underline" style={{ color: brand.ink }}>{t({ tr: "Ters İşletme → “Her İstasyon”", en: "Reverse running → “Each station”", de: "Kehrbetrieb → „Jede Station“" })}</Link> {t({ tr: "sekmesinde her durağa iniş/biniş gir.", en: "tab: enter boardings/alightings for each stop.", de: "Registerkarte: Ein-/Ausstiege je Haltestelle eingeben." })}</li>
              <li>{t({ tr: "Sonra bu panele dön — öneri ve tıkanma talebe göre güncellenir.", en: "Then return to this panel — the recommendation and congestion update per demand.", de: "Kehren Sie dann zu diesem Panel zurück — Empfehlung und Überlastung aktualisieren sich nach der Nachfrage." })}</li>
            </ul>
            <div className="mt-3 text-right"><button type="button" onClick={() => setTalepPopup(false)} className="rounded px-3 py-1.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>{t({ tr: "Anladım", en: "Got it", de: "Verstanden" })}</button></div>
          </div>
        </div>
      ), document.body)}
      {/* Rapor başlığı */}
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">{t({ tr: "Sefer Simülasyon Raporu", en: "Service Simulation Report", de: "Betriebssimulationsbericht" })}</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{network.name}</h1>
        <div className="mt-1 text-xs" style={{ color: brand.muted }}>
          {t({ tr: "Kaynak:", en: "Source:", de: "Quelle:" })} <b>{t({ tr: "paylaşılan proje hattı", en: "shared project line", de: "gemeinsame Projektlinie" })}</b> ({line.stations.filter((s) => s.tip !== "gecit").length} {t({ tr: "durak", en: "stops", de: "Haltestellen" })} · {km(line.length)} km). {t({ tr: "Hattı düzenlemek için", en: "To edit the line, go to", de: "Zum Bearbeiten der Linie gehen Sie zu" })}{" "}
          <Link href="/#ringler" className="underline">{t({ tr: "Ringler (KUR)", en: "Rings (BUILD)", de: "Ringe (BAUEN)" })}</Link> {t({ tr: "bölümüne gidin — değişiklikler burada anında yansır.", en: "— changes are reflected here instantly.", de: "— Änderungen werden hier sofort übernommen." })}
        </div>
      </div>

      <TabBar pre="sf"
        etiketler={[t({ tr: "① Kurulum & Filo", en: "① Setup & Fleet", de: "① Einrichtung & Flotte" }), t({ tr: "② Canlı Simülasyon", en: "② Live Simulation", de: "② Live-Simulation" }), t({ tr: "③ Mühendislik Grafikleri", en: "③ Engineering Charts", de: "③ Technische Diagramme" }), t({ tr: "④ Etkiler & Dayanıklılık", en: "④ Effects & Robustness", de: "④ Auswirkungen & Robustheit" })]}
        durumlar={[filoAsim ? "ihlal" : "", "", "", (yolcuVeriVar && tersRapor && tersRapor.donusIhtiyaclari.length > 0) ? "ihlal" : ""]} />

      <div className="sf-panel" data-t="1">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Aracı, yolcu dinamiğini ve filoyu belirle: önerilen tramvay → onayla → sefer sıklığı.", en: "Define the vehicle, passenger dynamics and fleet: recommended trams → confirm → headway.", de: "Fahrzeug, Fahrgastdynamik und Flotte festlegen: empfohlene Straßenbahnen → bestätigen → Zugfolgezeit." })}</p>

      {/* ①②③ FİLO & ÖNERİ — akışın ilk adımı: öneri → onayla → filo → parklanma */}
      {maks.gecerli && (
      <div id="filo-paneli">
      <Panel katlanir acik ozet={<>{t({ tr: "önerilen", en: "recommended", de: "empfohlen" })} <b>{oneriTramvay}</b> · {t({ tr: "filo", en: "fleet", de: "Flotte" })} {filo} · {t({ tr: "aralık", en: "headway", de: "Zugfolgezeit" })} {sure(ulasilanHeadwaySn)}</>} baslik={t({ tr: "Filo & Öneri", en: "Fleet & Recommendation", de: "Flotte & Empfehlung" })} aciklama={t({ tr: "Sistem, girdiğin tüm verilere göre gereken tramvay sayısını önerir. Onaylayınca filo öneriye eşitlenir; sonra filoyu elle oynarsın. Filo = parklanma alanına dizdiğin araç sayısıdır; ulaşılan sefer aralığı = çevrim ÷ filo.", en: "The system recommends the number of trams required from all your inputs. On confirm the fleet is set to the recommendation; then you adjust it by hand. Fleet = the number of vehicles you place in the parking area; achieved headway = cycle ÷ fleet.", de: "Das System empfiehlt anhand aller Eingaben die erforderliche Anzahl Straßenbahnen. Beim Bestätigen wird die Flotte auf die Empfehlung gesetzt; danach passen Sie sie manuell an. Flotte = Anzahl der in der Abstellung platzierten Fahrzeuge; erreichte Zugfolgezeit = Umlauf ÷ Flotte." })}>
        {/* ① Önerilen tramvay + Onayla */}
        <div className="rounded-lg border-2 p-4" style={{ borderColor: brand.ink, background: CK.goodBgSoft }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: brand.inkSoft }}>{t({ tr: "Önerilen tramvay", en: "Recommended trams", de: "Empfohlene Straßenbahnen" })}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums" style={{ color: brand.ink }}>{oneriTramvay}</span>
                <span className="text-sm" style={{ color: brand.inkSoft }}>{t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })} · ⌈{t({ tr: "çevrim", en: "cycle", de: "Umlauf" })} {sure(maks.cevrimSuresi)} ÷ {t({ tr: "hedef", en: "target", de: "Ziel" })} {Math.round(hedefHeadwaySn)} s⌉{talepFilosu > 0 && talepFilosu >= oneriTramvay ? t({ tr: " · talep de bunu gerektiriyor", en: " · demand also requires this", de: " · auch die Nachfrage erfordert dies" }) : ""}</span>
              </div>
            </div>
            <button type="button" data-sunum="filo-onayla" onClick={() => { setFilo(oneriTramvay); patchIsletme({ filoOnaylandi: true }); }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>{t({ tr: "✓ Onayla — filoyu öneriye eşitle", en: "✓ Confirm — set fleet to recommendation", de: "✓ Bestätigen — Flotte auf Empfehlung setzen" })}</button>
          </div>
          <div className="mt-2 text-xs" style={{ color: brand.muted }}>
            {yolcuVeriVar
              ? t({ tr: "✓ Yolcu verisi girili — öneri talebe göre de kontrol edildi (tıkanma/dönüş ihtiyacı aşağıda).", en: "✓ Passenger data entered — the recommendation was also checked against demand (congestion/short-turn need below).", de: "✓ Fahrgastdaten eingegeben — die Empfehlung wurde auch gegen die Nachfrage geprüft (Überlastung/Kehrbedarf unten)." })
              : <>{t({ tr: "Öneri hedef headway kuralından", en: "Recommendation from the target headway rule", de: "Empfehlung aus der Ziel-Zugfolgezeit-Regel" })} ({Math.round(hedefHeadwaySn)} s = {t({ tr: "tasarım", en: "design", de: "Auslegung" })}). {t({ tr: "Talebe göre (tıkanma/dönüş ihtiyacı) kontrol için", en: "To check against demand (congestion/short-turn need)", de: "Zur Prüfung gegen die Nachfrage (Überlastung/Kehrbedarf)" })} <button type="button" className="font-semibold underline" style={{ color: brand.ink }} onClick={() => setTalepPopup(true)}>{t({ tr: "yolcu verisi gir", en: "enter passenger data", de: "Fahrgastdaten eingeben" })}</button>.</>}
          </div>
          {/* Önerilen (ihtiyaç) vs sürdürülebilir vs fiziksel tavan — ÜÇ ayrı kavram */}
          <div className="mt-2 rounded border-l-2 pl-2 text-[0.7rem] leading-relaxed" style={{ borderColor: CK.good, color: brand.muted }}>
            {/* Her zaman görünür: sayılar + durum yargısı (kullanıcının kararı için gereken) */}
            <b style={{ color: brand.ink }}>{t({ tr: "Önerilen", en: "Recommended", de: "Empfohlen" })} {oneriTramvay} · {t({ tr: "sürdürülebilir", en: "sustainable", de: "nachhaltig" })} {maks.nSurdurulebilir} · {t({ tr: "fiziksel tavan", en: "physical ceiling", de: "physikalische Obergrenze" })} {maks.nTeorik}.</b>{" "}
            {oneriTramvay <= maks.nSurdurulebilir
              ? <>{t({ tr: "Öneri sürdürülebilirin", en: "The recommendation is", de: "Die Empfehlung liegt" })} <b>{t({ tr: "altında", en: "below sustainable", de: "unter dem nachhaltigen Wert" })}</b> — {maks.nSurdurulebilir - oneriTramvay} {t({ tr: "araç pay var; istediğin sıklık rahat ve dayanıklı sağlanır.", en: "vehicles of margin; your desired frequency is met comfortably and robustly.", de: "Fahrzeuge Reserve; die gewünschte Taktung wird komfortabel und robust erreicht." })}</>
              : oneriTramvay <= maks.nTeorik
                ? <>{t({ tr: "Öneri sürdürülebilir seviyeyi", en: "The recommendation exceeds the sustainable level", de: "Die Empfehlung überschreitet das nachhaltige Niveau" })} ({maks.nSurdurulebilir}) <b>{t({ tr: "aşıyor", en: "", de: "" })}</b> {t({ tr: "ama fiziksel tavana", en: "but fits within the physical ceiling", de: "passt aber in die physikalische Obergrenze" })} ({maks.nTeorik}) <b>{t({ tr: "sığıyor", en: "", de: "" })}</b> → {t({ tr: "çalışır, fakat toparlanma payı dar (küçük gecikmeler zincirlenebilir). Dayanıklı işletme için ya aralığı biraz büyüt ya da darboğazı iyileştir.", en: "it works, but the recovery margin is tight (small delays can chain). For robust operation either widen the headway a little or improve the bottleneck.", de: "es funktioniert, aber die Erholungsreserve ist knapp (kleine Verspätungen können sich fortpflanzen). Für robusten Betrieb entweder die Zugfolgezeit etwas vergrößern oder den Engpass verbessern." })}</>
                : <>{t({ tr: "Öneri fiziksel tavanı", en: "The recommendation exceeds even the physical ceiling", de: "Die Empfehlung überschreitet sogar die physikalische Obergrenze" })} ({maks.nTeorik}) <b>{t({ tr: "da aşıyor", en: "", de: "" })}</b> — {t({ tr: "bu sıklık hatta", en: "this frequency does", de: "diese Taktung passt" })} <b>{t({ tr: "sığmaz", en: "not fit on the line", de: "nicht auf die Linie" })}</b>; {t({ tr: "aralığı büyütmen ya da darboğazı iyileştirmen şart.", en: "you must widen the headway or improve the bottleneck.", de: "Sie müssen die Zugfolgezeit vergrößern oder den Engpass verbessern." })}</>}
            {/* Kademeli açığa çıkar: kavram tanımları + kapasite (stok/akış) — duvar değil, tek satır */}
            <NedenDetay ozet={t({ tr: "kavramlar ne demek?", en: "what do these terms mean?", de: "was bedeuten diese Begriffe?" })}>
              <b>{t({ tr: "Önerilen = ihtiyaç", en: "Recommended = need", de: "Empfohlen = Bedarf" })}</b> ({t({ tr: "hedef", en: "target", de: "Ziel" })} {Math.round(hedefHeadwaySn)} {t({ tr: "s aralığın için gereken tren", en: "s headway: trains required", de: "s Zugfolgezeit: erforderliche Züge" })}). <b>{t({ tr: "Sürdürülebilir", en: "Sustainable", de: "Nachhaltig" })}</b> = {t({ tr: "toparlanma paylı, her gün rahat çalışan sayı (UIC 406)", en: "the number that runs comfortably every day with recovery margin (UIC 406)", de: "die Anzahl, die mit Erholungsreserve jeden Tag komfortabel fährt (UIC 406)" })}. <b>{t({ tr: "Fiziksel tavan", en: "Physical ceiling", de: "Physikalische Obergrenze" })}</b> = {t({ tr: "darboğazın izin verdiği en fazla tren (sıfır pay)", en: "the maximum trains the bottleneck allows (zero margin)", de: "die maximale Zuganzahl, die der Engpass zulässt (keine Reserve)" })}.{" "}
              <span style={{ color: brand.faint }}>{t({ tr: "İşletme kapasitesi", en: "Operating capacity", de: "Betriebskapazität" })} (~{(3600 / Math.max(1, maks.hMin) * (maks.dolulukTavani || 1)).toFixed(0)} {t({ tr: "tren/saat", en: "trains/hour", de: "Züge/Stunde" })}) = {t({ tr: "sürdürülebilir sayının", en: "is the", de: "ist die" })} <i>{t({ tr: "akış", en: "flow", de: "Fluss" })}</i> {t({ tr: "karşılığı:", en: "equivalent of the sustainable number:", de: "Entsprechung der nachhaltigen Zahl:" })} {maks.nSurdurulebilir} = {t({ tr: "“aynı anda hatta kaç tramvay” (stok), tren/saat = “bir noktadan saatte kaç tren geçer” (akış). İkisi çevrimle bağlıdır (stok ≈ akış × çevrim).", en: "“how many trams on the line at once” (stock), trains/hour = “how many trains pass a point per hour” (flow). The two are linked by the cycle (stock ≈ flow × cycle).", de: "„wie viele Straßenbahnen gleichzeitig auf der Linie“ (Bestand), Züge/Stunde = „wie viele Züge einen Punkt pro Stunde passieren“ (Fluss). Beide sind über den Umlauf verbunden (Bestand ≈ Fluss × Umlauf)." })}</span>
            </NedenDetay>
            <Kaynak etiket={t({ tr: "Öneriyi belirleyen girdiler", en: "Inputs that determine the recommendation", de: "Eingaben, die die Empfehlung bestimmen" })} yerler={["parametreler", { ad: t({ tr: "Durak/mesafe/makas → Ringler", en: "Stops/distance/turnouts → Rings", de: "Haltestellen/Distanz/Weichen → Ringe" }), href: "/#ringler" }]} />
          </div>
        </div>

        {/* ② Filo (oynanır) + ulaşılan/hedef headway + kapasite */}
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <span className="field-label">{t({ tr: "Filo (parktaki araç)", en: "Fleet (vehicles in depot)", de: "Flotte (Fahrzeuge in Abstellung)" })}</span>
            <div className="mt-1 flex items-center gap-1.5">
              <button type="button" onClick={() => setFilo(filoTek - 1)} className="h-7 w-7 rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }}>−</button>
              <input type="number" min={1} max={99} value={filoTek} onChange={(e) => setFilo(parseFloat(e.target.value) || 1)}
                className="w-14 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <button type="button" onClick={() => setFilo(filoTek + 1)} className="h-7 w-7 rounded border font-semibold text-white" style={{ background: brand.ink, borderColor: brand.ink }}>+</button>
            </div>
            <span className="mt-0.5 block text-[0.6rem]" style={{ color: filoOneriUyum ? "#16794C" : CK.amberInk }}>{filoOneriUyum ? t({ tr: "✓ öneriyle eşleşiyor", en: "✓ matches recommendation", de: "✓ entspricht der Empfehlung" }) : `${t({ tr: "öneri", en: "rec.", de: "Empf." })} ${oneriTramvay} · ${t({ tr: "fark", en: "diff", de: "Diff" })} ${filoTek - oneriTramvay > 0 ? "+" : ""}${filoTek - oneriTramvay}`}</span>
          </div>
          <Kpi etiket={t({ tr: "Ulaşılan sefer aralığı", en: "Achieved headway", de: "Erreichte Zugfolgezeit" })} deger={sure(ulasilanHeadwaySn)} alt={t({ tr: "çevrim ÷ filo · filo↑→aralık↓", en: "cycle ÷ fleet · fleet↑→headway↓", de: "Umlauf ÷ Flotte · Flotte↑→Zugfolgezeit↓" })} />
          <div>
            <span className="field-label">{t({ tr: "Hedef headway (kural)", en: "Target headway (rule)", de: "Ziel-Zugfolgezeit (Regel)" })}</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={0.5} step={0.5} value={headwayDk} onChange={(e) => setHeadwayDk(Math.max(0.5, parseFloat(e.target.value) || 4))}
                className="w-14 rounded border px-2 py-1 text-sm" style={{ borderColor: CK.amber, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "dk", en: "min", de: "Min" })}</span>
            </div>
            <span className="mt-0.5 block text-[0.6rem]" style={{ color: CK.amberInk }}>{t({ tr: "⚠ değiştirilmesi önerilmez (240 s tasarım kuralı)", en: "⚠ changing not recommended (240 s design rule)", de: "⚠ Änderung nicht empfohlen (240-s-Auslegungsregel)" })}</span>
          </div>
          <Kpi
            title={t({ tr: "Aynı anda bu hatta sığabilen EN FAZLA tramvay (darboğazın izin verdiği fiziksel üst sınır). Filon bu sayıyı aşamaz — aşarsa trenler kaçınılmaz kuyruklanır.", en: "The MAXIMUM trams that can fit on this line at once (the physical upper limit the bottleneck allows). Your fleet cannot exceed this — if it does, trains inevitably queue.", de: "Die MAXIMALE Anzahl Straßenbahnen, die gleichzeitig auf diese Linie passen (die vom Engpass erlaubte physikalische Obergrenze). Ihre Flotte kann dies nicht überschreiten — sonst stauen sich die Züge unvermeidlich." })}
            etiket={t({ tr: "Hat kapasitesi", en: "Line capacity", de: "Linienkapazität" })} deger={nMax} ton={filoAsim ? "danger" : "notr"}
            alt={filoAsim ? `⚠ ${t({ tr: "filo", en: "fleet", de: "Flotte" })} ${filoTek} > ${t({ tr: "kapasite", en: "capacity", de: "Kapazität" })} ${nMax}` : t({ tr: "araç · üst sınır (darboğaz)", en: "vehicles · upper limit (bottleneck)", de: "Fahrzeuge · Obergrenze (Engpass)" })} />
        </div>

        {/* ③ Parklanma dizilimi (elle) */}
        {depoVar ? (
          <div className="mt-4 rounded border p-3" style={{ borderColor: parkDizili && parkToplam === filoTek ? "#16794C" : CK.amber, background: "#FBFCFD" }}>
            <div className="field-label">{t({ tr: "Parklanma Dizilimi — araçları depolara ELLE yerleştir", en: "Parking layout — place vehicles into depots BY HAND", de: "Abstellungsaufteilung — Fahrzeuge MANUELL in Depots einordnen" })}</div>
            <p className="mb-2 text-xs" style={{ color: brand.muted }}>{t({ tr: "Rastgele dağıtılmaz: her depoya kaç araç park edeceğini sen gir (toplam = filo", en: "Not distributed randomly: you enter how many vehicles park in each depot (total = fleet", de: "Nicht zufällig verteilt: Sie geben ein, wie viele Fahrzeuge in jedem Depot stehen (Summe = Flotte" })} {filoTek}). {t({ tr: "Canlı simde trenler bu depolardan çıkar.", en: "In the live sim the trains depart from these depots.", de: "In der Live-Simulation fahren die Züge aus diesen Depots ab." })}</p>
            <div className="flex flex-wrap items-end gap-3">
              {depotPlan.depots.map((d, i) => {
                const k = parkAnahtar(d.position);
                const val = Math.max(0, Math.round((isletme.parklanmaDagilim || {})[k] ?? 0));
                return (
                  <div key={i} className="w-28">
                    <span className="text-[0.6rem]" style={{ color: brand.inkSoft }}>🅿 {t({ tr: "Depo", en: "Depot", de: "Depot" })} @ {km(d.position)}</span>
                    <input type="number" min={0} max={99} value={val}
                      onChange={(e) => patchIsletme({ parklanmaDagilim: { ...(isletme.parklanmaDagilim || {}), [k]: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) } })}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                  </div>
                );
              })}
              <button type="button" onClick={() => { const dep = depotPlan.depots; const per = Math.floor(filoTek / dep.length); let kalan = filoTek - per * dep.length; const yeni: Record<string, number> = {}; dep.forEach((d) => { yeni[parkAnahtar(d.position)] = per + (kalan-- > 0 ? 1 : 0); }); patchIsletme({ parklanmaDagilim: yeni }); }}
                className="rounded border px-2 py-1 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>{t({ tr: "eşit dağıt", en: "distribute evenly", de: "gleichmäßig verteilen" })} ({filoTek})</button>
            </div>
            <div className="mt-2 text-xs" style={{ color: parkToplam === filoTek ? "#16794C" : CK.amberInk }}>
              {parkToplam === filoTek ? `✓ ${parkToplam}/${filoTek} ${t({ tr: "araç dizildi", en: "vehicles placed", de: "Fahrzeuge eingeordnet" })}` : parkToplam < filoTek ? `⚠ ${t({ tr: "yerleştir", en: "place", de: "platzieren" })}: ${filoTek - parkToplam} ${t({ tr: "araç daha", en: "more vehicles", de: "weitere Fahrzeuge" })} (${parkToplam}/${filoTek}) — ${t({ tr: "parklanma alanını doldur", en: "fill the parking area", de: "Abstellbereich füllen" })}` : `⚠ ${parkToplam - filoTek} ${t({ tr: "fazla", en: "too many", de: "zu viele" })} (${parkToplam}/${filoTek})`}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded border-l-4 px-3 py-2 text-xs" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
            🅿 {t({ tr: "Bu hatta parklanma alanı (depo) tanımlı değil — Ringler'de bir durağı", en: "No parking area (depot) defined on this line — if you mark a stop as a", de: "Auf dieser Linie ist kein Abstellbereich (Depot) definiert — wenn Sie in Ringe eine Haltestelle als" })} <b>{t({ tr: "depo", en: "depot", de: "Depot" })}</b> {t({ tr: "işaretlersen araçlarını oraya dizersin. Şimdilik trenler hat başından çıkar.", en: "in Rings, you can place your vehicles there. For now trains depart from the line start.", de: "markieren, können Sie Ihre Fahrzeuge dort einordnen. Vorerst fahren die Züge vom Linienanfang ab." })}
          </div>
        )}
      </Panel>
      </div>
      )}

      <section className="mt-6">
        <Panel katlanir ozet={t({ tr: "çift hat · dönüş bekleme → çevrim", en: "double track · turnaround wait → cycle", de: "zweigleisig · Wendezeit → Umlauf" })} baslik={t({ tr: "Sefer Sıklığı", en: "Headway", de: "Zugfolgezeit" })} aciklama={t({ tr: "Hat çift hat, gidiş-dönüş çalışır. Sabit blok sinyal sistemi — tren dolu bloğa giremez (kırmızı sinyalde durur). Dönüş Bekleme çevrim süresini ve gereken filoyu besler.", en: "The line is double-track, running outbound and return. Fixed-block signalling — a train cannot enter an occupied block (it stops at a red signal). The turnaround wait feeds the cycle time and the required fleet.", de: "Die Linie ist zweigleisig und fährt Hin- und Rückfahrt. Festblock-Signalisierung — ein Zug kann keinen belegten Block befahren (er hält am roten Signal). Die Wendezeit fließt in die Umlaufzeit und die erforderliche Flotte ein." })}>

          {/* TEK SONUÇ — bu hatta en fazla kaç tramvay (Ringler ile birebir aynı) */}
          {maks.gecerli && (
            <div className="mb-4 rounded-md border-l-4 px-4 py-3" style={{ background: CK.goodBgSoft, borderColor: brand.ink }}>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <div>
                  <span className="text-3xl font-semibold" style={{ color: brand.ink }}>{maks.nTeorik}</span>
                  <span className="ml-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "tramvay — teorik maksimum", en: "trams — theoretical maximum", de: "Straßenbahnen — theoretisches Maximum" })}</span>
                </div>
                <div>
                  <span className="text-2xl font-semibold" style={{ color: CK.good }}>{maks.nSurdurulebilir}</span>
                  <span className="ml-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "sürdürülebilir (UIC 406 tamponlu)", en: "sustainable (UIC 406 buffered)", de: "nachhaltig (UIC 406 gepuffert)" })}</span>
                </div>
              </div>
              <p className="mt-1 text-[0.7rem]" style={{ color: brand.muted }}>
                <b>{t({ tr: "Teorik maksimum", en: "Theoretical maximum", de: "Theoretisches Maximum" })}</b>: {t({ tr: "darboğazın izin verdiği fiziksel tavan — sıfır pay, her tren sürekli tam kapasite.", en: "the physical ceiling the bottleneck allows — zero margin, every train continuously at full capacity.", de: "die vom Engpass erlaubte physikalische Obergrenze — keine Reserve, jeder Zug durchgehend an voller Kapazität." })} <b>{t({ tr: "Sürdürülebilir", en: "Sustainable", de: "Nachhaltig" })}</b>: {t({ tr: "UIC 406 doluluk tavanıyla (blok başına ~%60–75 kullanım)", en: "with the UIC 406 occupancy ceiling (~60–75% use per block)", de: "mit der UIC-406-Auslastungsobergrenze (~60–75 % Nutzung je Block)" })} <b>{t({ tr: "her gün güvenle", en: "safely every day", de: "sicher jeden Tag" })}</b> {t({ tr: "çalıştırılabilen sayı — küçük gecikmeler birbirini tetiklemesin, toparlanma payı kalsın diye teorikten düşüktür (gerçek işletme bu değeri hedefler).", en: "the number that can be operated — lower than the theoretical so small delays do not trigger each other and a recovery margin remains (real operation targets this value).", de: "die betreibbare Zahl — niedriger als die theoretische, damit kleine Verspätungen sich nicht gegenseitig auslösen und eine Erholungsreserve bleibt (der reale Betrieb zielt auf diesen Wert)." })}
              </p>
              <p className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                {t({ tr: "Bu hatta aynı anda en fazla", en: "At most", de: "Höchstens" })} <b>{maks.nTeorik}</b> {t({ tr: "tramvay sığar. Darboğaz:", en: "trams fit on this line at once. Bottleneck:", de: "Straßenbahnen passen gleichzeitig auf diese Linie. Engpass:" })} <b>{maks.baglayanAd}</b> · {t({ tr: "min. aralık", en: "min. headway", de: "min. Zugfolgezeit" })} {sure(maks.hMin)} · {t({ tr: "çevrim", en: "cycle", de: "Umlauf" })} {sure(maks.cevrimSuresi)}. <span style={{ color: brand.faint }}>{t({ tr: "Aynı sayı Ringler ve Sistem Merkezi'nde de görünür — tek kaynaktan.", en: "The same number also appears in Rings and the System Centre — from a single source.", de: "Dieselbe Zahl erscheint auch in Ringe und der Systemzentrale — aus einer einzigen Quelle." })}</span> {t({ tr: "Terminal girdileri", en: "Terminal inputs in", de: "Terminaleingaben in" })} <Link href="/#ringler" className="underline">{t({ tr: "Ringler", en: "Rings", de: "Ringe" })}</Link>{t({ tr: "’de; tam kısıt & blocking-time dökümü", en: "; full constraint & blocking-time breakdown in", de: "; vollständige Kanten- & Sperrzeit-Aufschlüsselung in" })} <Link href="/#sistem" className="underline">{t({ tr: "Sistem Merkezi", en: "System Centre", de: "Systemzentrale" })}</Link>{t({ tr: "’nde.", en: ".", de: "." })}
              </p>
              {/* Gereken tren = ⌈RTT ÷ hedef headway⌉ — kullanıcının hedef sıklığı için filo */}
              <p className="mt-1 text-xs" style={{ color: brand.ink }}>
                📐 {t({ tr: "Tur süresi (RTT)", en: "Round-trip time (RTT)", de: "Umlaufzeit (RTT)" })} <b>{sure(maks.cevrimSuresi)}</b> ({t({ tr: "2×seyir + tüm durak dwell'leri + terminaller", en: "2×run + all stop dwells + terminals", de: "2×Fahrt + alle Haltezeiten + Terminals" })}). {headwayDk} {t({ tr: "dk sefer sıklığı için", en: "min headway requires", de: "Min Zugfolgezeit erfordert" })} <b>{t({ tr: "gereken tren =", en: "trains needed =", de: "erforderliche Züge =" })} {Math.ceil(maks.cevrimSuresi / Math.max(1, headwayDk * 60))}</b> (⌈RTT ÷ headway⌉) — <span style={{ color: brand.muted }}>{t({ tr: "seçtiğin sıklıkta çalışmak için hatta bulunması gereken tramvay: bir tren tam turu (RTT) tamamlayana dek arkasından kaç tren dolması gerektiği (tur süresi ÷ sefer aralığı).", en: "the trams that must be on the line to run at your chosen frequency: how many trains must follow before one completes a full round-trip (RTT) (round-trip time ÷ headway).", de: "die Straßenbahnen, die auf der Linie sein müssen, um in Ihrer gewählten Taktung zu fahren: wie viele Züge folgen müssen, bis einer einen vollen Umlauf (RTT) abschließt (Umlaufzeit ÷ Zugfolgezeit)." })}</span>
              </p>
            </div>
          )}

          <div className="mb-3 rounded border-l-4 px-3 py-2 text-xs" style={{ borderColor: brand.ink, background: CK.goodBgSoft, color: brand.inkSoft }}>
            ℹ️ {t({ tr: "Filo, ulaşılan sefer aralığı ve hedef headway artık yukarıdaki", en: "Fleet, achieved headway and target headway are now in the", de: "Flotte, erreichte Zugfolgezeit und Ziel-Zugfolgezeit sind jetzt im" })} <b>{t({ tr: "Filo Paneli", en: "Fleet Panel", de: "Flotten-Panel" })}</b>{t({ tr: "'nde (öneri → onayla → filo → parklanma). Burada yalnız", en: " above (recommend → confirm → fleet → parking). Here you only set the", de: " oben (empfehlen → bestätigen → Flotte → Abstellung). Hier stellen Sie nur die" })} <b>{t({ tr: "Dönüş Bekleme", en: "Turnaround Wait", de: "Wendezeit" })}</b> {t({ tr: "ayarlanır (çevrim süresini ve öneriyi besler).", en: "(it feeds the cycle time and the recommendation).", de: "ein (sie fließt in die Umlaufzeit und die Empfehlung ein)." })}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Num label={t({ tr: "Dönüş Bekleme", en: "Turnaround Wait", de: "Wendezeit" })} suffix={t({ tr: "dk", en: "min", de: "Min" })} step={0.5} value={turnaroundDk} onChange={(v) => setTurnaroundDk(Math.max(0, v))} />
          </div>

          {/* Ulaşılan aralık fiziksel minimumun altında mı? (filo kapasiteyi aşıyorsa) */}
          {maks.gecerli && ulasilanHeadwaySn < maks.hMin - 1e-6 && (
            <div className="mb-2 text-sm" style={{ color: brand.red }}>
              ⚠ {t({ tr: "Ulaşılan sefer aralığı", en: "The achieved headway", de: "Die erreichte Zugfolgezeit" })} ({sure(ulasilanHeadwaySn)}) {t({ tr: "fiziksel minimum aralığın", en: "is below the physical minimum headway", de: "liegt unter der physikalischen Mindest-Zugfolgezeit" })} ({sure(maks.hMin)}) {t({ tr: "altında — filo çok yüksek, trenler kaçınılmaz kuyruklanır. En sık güvenli aralık ≈", en: "— the fleet is too high, trains inevitably queue. Most frequent safe headway ≈", de: "— die Flotte ist zu hoch, Züge stauen sich unvermeidlich. Häufigste sichere Zugfolgezeit ≈" })} {sure(maks.hMin)} (≈ {nMax} {t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })}).
            </div>
          )}

          {/* Bekleme durumu */}
          <div className="text-sm">
            {canliGidis.anyDelay ? (
              <span style={{ color: brand.red }}>⚠ {t({ tr: "Bu aralıkta trenler birbirini bekliyor — en fazla", en: "At this headway trains wait for each other — up to", de: "Bei dieser Zugfolgezeit warten Züge aufeinander — bis zu" })} {sure(canliGidis.maxDelay)} {t({ tr: "gecikme.", en: "delay.", de: "Verspätung." })}</span>
            ) : (
              <span style={{ color: CK.good }}>✓ {t({ tr: "Bu aralıkta bekleme yok — trenler serbest akıyor.", en: "No waiting at this headway — trains flow freely.", de: "Kein Warten bei dieser Zugfolgezeit — Züge fließen frei." })}</span>
            )}
          </div>
        </Panel>
      </section>

      {/* ÇEKEN ARAÇ — Sefer'in tek düzenleme yüzeyi. Hat (istasyon/mesafe/hız/makas/
          depo) düzenlemesi Ringler'de (KUR) → ikili düzenleme sadeleştirildi. */}
      <div id="ceken-arac" className="mt-6 scroll-mt-28">
        <Panel katlanir ozet={stock.name || t({ tr: "araç fiziği", en: "vehicle physics", de: "Fahrzeugphysik" })} baslik={t({ tr: "Çeken Araç", en: "Traction Vehicle", de: "Triebfahrzeug" })} aciklama={t({ tr: "Simülasyonda kullanılan aracı seç veya özelliklerini ayarla — değişiklik anında projeye kaydedilir. İstasyon, mesafe, hız limiti, makas ve parklanma düzenlemesi Ringler (KUR) bölümünde yapılır.", en: "Select the vehicle used in the simulation or adjust its properties — changes are saved to the project instantly. Station, distance, speed limit, turnout and parking layout are set in the Rings (BUILD) section.", de: "Wählen Sie das in der Simulation verwendete Fahrzeug oder passen Sie seine Eigenschaften an — Änderungen werden sofort im Projekt gespeichert. Station, Distanz, Geschwindigkeitsbegrenzung, Weichen und Abstellungsaufteilung werden im Bereich Ringe (BAUEN) festgelegt." })}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="field-label">{t({ tr: "Araç", en: "Vehicle", de: "Fahrzeug" })}</span>
              <select
                value={tramvaylar.some((a) => a.id === stock.id) ? stock.id : ""}
                onChange={(e) => {
                  const v = tramvaylar.find((a) => a.id === e.target.value);
                  if (v) setArac({ ...v });
                }}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: brand.border, color: brand.ink }}
              >
                {!tramvaylar.some((a) => a.id === stock.id) && <option value="">{t({ tr: "Özel araç", en: "Custom vehicle", de: "Eigenes Fahrzeug" })}</option>}
                {tramvaylar.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <Num label={t({ tr: "Azami Hız", en: "Max Speed", de: "Höchstgeschwindigkeit" })} suffix="km/h" step={5} max={400} value={round(kmh(stock.maxSpeed))} onChange={(v) => patchStock({ maxSpeed: Math.max(5, Math.min(400, v)) * KMH })} />
            <Num label={t({ tr: "Kütle", en: "Mass", de: "Masse" })} suffix="t" step={1} value={round(stock.mass / 1000)} onChange={(v) => patchStock({ mass: v * 1000 })} />
            <Num label={t({ tr: "Fren", en: "Braking", de: "Bremsung" })} suffix="m/s²" step={0.1} value={round(stock.maxBraking, 1)} onChange={(v) => patchStock({ maxBraking: v })} />
          </div>
          <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: brand.border, color: brand.muted }}>
            {t({ tr: "Hattı düzenlemek mi istiyorsun? İstasyon / mesafe / hız / makas / parklanma alanı", en: "Want to edit the line? Station / distance / speed / turnout / parking area are in", de: "Möchten Sie die Linie bearbeiten? Station / Distanz / Geschwindigkeit / Weiche / Abstellbereich finden Sie in" })}{" "}
            <Link href="/#ringler" className="underline" style={{ color: brand.red }}>{t({ tr: "Ringler (KUR)", en: "Rings (BUILD)", de: "Ringe (BAUEN)" })}</Link> {t({ tr: "bölümünde — orada yapılan değişiklikler burada anında yansır.", en: "— changes made there are reflected here instantly.", de: "— dort vorgenommene Änderungen werden hier sofort übernommen." })}
          </p>
          <Kaynak etiket={t({ tr: "İlgili girdiler", en: "Related inputs", de: "Zugehörige Eingaben" })} yerler={["parametreler", { ad: t({ tr: "Hız limitleri → Ringler", en: "Speed limits → Rings", de: "Geschwindigkeitsbegrenzungen → Ringe" }), href: "/#ringler" }]} />
        </Panel>
      </div>

      <section className="mt-6">
        <Panel katlanir ozet={t({ tr: "dwell = yolcu akışından (kapı/konfor)", en: "dwell = from passenger flow (door/comfort)", de: "Haltezeit = aus Fahrgastfluss (Tür/Komfort)" })} baslik={t({ tr: "Yolcu Dinamiği & Duruş Süresi", en: "Passenger Dynamics & Dwell Time", de: "Fahrgastdynamik & Haltezeit" })} aciklama={t({ tr: "İstasyon duruş süresi (dwell) keyfi değil, yolcu akışından hesaplanır: araç kapı sayısı/genişliği + konfor + istasyon başına inen/binen → yolcu akış süresi → dwell. Duraklarda inen/binen sayısını Ringler'de girersin; her durak ayrı hesaplanıp tur süresine (RTT) kümülatif eklenir.", en: "Station dwell time is not arbitrary; it is computed from passenger flow: vehicle door count/width + comfort + alightings/boardings per station → passenger flow time → dwell. You enter alightings/boardings per stop in Rings; each stop is computed separately and added cumulatively to the round-trip time (RTT).", de: "Die Haltezeit ist nicht willkürlich, sondern wird aus dem Fahrgastfluss berechnet: Türanzahl/-breite des Fahrzeugs + Komfort + Aus-/Einstiege je Station → Fahrgastflusszeit → Haltezeit. Aus-/Einstiege je Haltestelle geben Sie in Ringe ein; jede Haltestelle wird separat berechnet und kumulativ zur Umlaufzeit (RTT) addiert." })}>
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><Num label={t({ tr: "Kapı sayısı", en: "Door count", de: "Türanzahl" })} suffix={t({ tr: "kapı", en: "doors", de: "Türen" })} step={1} max={12} value={stock.kapiSayisi ?? 4}
              onChange={(v) => patchArac({ kapiSayisi: Math.max(1, Math.round(v)) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "araç başı iniş-biniş kapısı", en: "boarding doors per vehicle", de: "Einstiegstüren je Fahrzeug" })}</span></div>
            <div><Num label={t({ tr: "Kapı genişliği", en: "Door width", de: "Türbreite" })} suffix="m" step={0.1} value={stock.kapiGenisligi ?? 1.3}
              onChange={(v) => patchArac({ kapiGenisligi: Math.max(0.5, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "tek kapı açıklığı", en: "single door opening", de: "einzelne Türöffnung" })}</span></div>
            <div><Num label={t({ tr: "Araç genişliği", en: "Vehicle width", de: "Fahrzeugbreite" })} suffix="m" step={0.05} value={stock.aracGenisligi ?? 2.65}
              onChange={(v) => patchArac({ aracGenisligi: Math.max(2, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "net taban alanı için", en: "for net floor area", de: "für Netto-Bodenfläche" })}</span></div>
            <div><Num label={t({ tr: "Kullanılabilir alan", en: "Usable area", de: "Nutzbare Fläche" })} suffix={t({ tr: "oran", en: "ratio", de: "Anteil" })} step={0.05} value={stock.kullanilabilirAlanOrani ?? 0.35}
              onChange={(v) => patchArac({ kullanilabilirAlanOrani: Math.max(0.1, Math.min(1, v)) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "ayakta alan / toplam (0..1)", en: "standing area / total (0..1)", de: "Stehfläche / gesamt (0..1)" })}</span></div>
            <div><Num label={t({ tr: "Konfor indeksi", en: "Comfort index", de: "Komfortindex" })} suffix={t({ tr: "yolcu/m²", en: "pax/m²", de: "Fahrg./m²" })} step={0.5} value={isletme.konforIndeksi}
              onChange={(v) => patchIsletme({ konforIndeksi: Math.max(0, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "ayakta yoğunluk tasarımı", en: "standing density design", de: "Stehdichte-Auslegung" })}</span></div>
            <div><Num label={t({ tr: "Yolcu akış hızı", en: "Passenger flow rate", de: "Fahrgastflussrate" })} suffix={t({ tr: "yolcu/m·s", en: "pax/m·s", de: "Fahrg./m·s" })} step={0.1} value={isletme.yolcuAkisHizi}
              onChange={(v) => patchIsletme({ yolcuAkisHizi: Math.max(0.1, v) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "kapı metresi başına akış (~1.2)", en: "flow per door metre (~1.2)", de: "Fluss je Türmeter (~1,2)" })}</span></div>
            <div title={t({ tr: "Bir durakta yolcu az olsa bile en kısa duruş (alt sınır). TÜM duraklara uygulanır — burada değiştirince her durağın oto dwell'i bu tabana göre güncellenir.", en: "The shortest dwell even when a stop has few passengers (lower bound). Applied to ALL stops — changing it here updates every stop's auto dwell to this floor.", de: "Die kürzeste Haltezeit, selbst wenn eine Haltestelle wenige Fahrgäste hat (Untergrenze). Gilt für ALLE Haltestellen — eine Änderung hier aktualisiert die Auto-Haltezeit jeder Haltestelle auf diesen Sockel." })}>
              <Num label={t({ tr: "Min duruş süresi", en: "Min dwell time", de: "Min. Haltezeit" })} suffix="s" step={1} value={isletme.minDurusSuresi}
              onChange={(v) => patchIsletme({ minDurusSuresi: Math.max(0, Math.round(v)) })} /><span className="text-[0.6rem]" style={{ color: brand.faint }}>{t({ tr: "tüm duraklara uygulanır — oto dwell alt sınırı", en: "applied to all stops — auto dwell lower bound", de: "gilt für alle Haltestellen — Untergrenze der Auto-Haltezeit" })}</span></div>
          </div>
          <div className="rounded border-l-4 px-3 py-2 text-xs" style={{ background: CK.goodBgSoft, borderColor: brand.ink, color: brand.inkSoft }}>
            {t({ tr: "Net taban alanı", en: "Net floor area", de: "Netto-Bodenfläche" })} <b>{netTabanAlani(stock).toFixed(1)} m²</b> · {t({ tr: "maksimum yolcu kapasitesi", en: "maximum passenger capacity", de: "maximale Fahrgastkapazität" })} <b>{maxYolcuKapasitesi(stock, isletme.konforIndeksi)} {t({ tr: "yolcu", en: "passengers", de: "Fahrgäste" })}</b>.
            <br />{t({ tr: "Dwell = max(", en: "Dwell = max(", de: "Haltezeit = max(" })}<b>{t({ tr: "min duruş", en: "min dwell", de: "min. Haltezeit" })}</b>, <i>{t({ tr: "(inen+binen) ÷ (kapı×genişlik×akış)", en: "(alight+board) ÷ (door×width×flow)", de: "(Aus+Ein) ÷ (Tür×Breite×Fluss)" })}</i>) + {t({ tr: "kapı aç + kapı kapa. Her durakta ayrı → RTT'ye kümülatif.", en: "door open + door close. Separate per stop → cumulative into RTT.", de: "Tür auf + Tür zu. Je Haltestelle separat → kumulativ in die RTT." })}
            <br />ℹ️ {t({ tr: "Dwell", en: "Dwell", de: "Haltezeit" })} <b>{t({ tr: "otomatik", en: "automatic", de: "automatisch" })}</b> {t({ tr: "(yolcu akışından) gelir ama zorunlu değil — istersen her durakta", en: "(from passenger flow) but not mandatory — you can also enter it", de: "(aus dem Fahrgastfluss), aber nicht zwingend — Sie können sie auch je Haltestelle" })} <b>{t({ tr: "elle", en: "by hand", de: "manuell" })}</b> {t({ tr: "de girebilirsin:", en: "at each stop:", de: "eingeben:" })} <Link href="/#ringler" className="underline">{t({ tr: "Ringler → Duraklar & Mesafeler", en: "Rings → Stops & Distances", de: "Ringe → Haltestellen & Distanzen" })}</Link>{t({ tr: "’de o durağın", en: ": turn off that stop's", de: ": schalten Sie das" })} <b>{t({ tr: "“oto dwell”", en: "“auto dwell”", de: "„Auto-Haltezeit“" })}</b> {t({ tr: "kutusunu kapatıp değeri yaz. Oto açıkken alt sınır yukarıdaki", en: "box for that stop and type the value. When auto is on, the lower bound is the", de: "-Kästchen der Haltestelle aus und tippen Sie den Wert. Bei aktivierter Automatik ist die Untergrenze die obige" })} <b>{t({ tr: "min duruş süresi", en: "min dwell time", de: "min. Haltezeit" })}</b>{t({ tr: "dir.", en: " above.", de: "." })}
          </div>
          <Kaynak etiket={t({ tr: "Bu panelde OLMAYAN girdiler", en: "Inputs NOT on this panel", de: "Eingaben, die NICHT auf diesem Panel sind" })} yerler={[{ ad: t({ tr: "İniş/biniş → Ringler", en: "Alight/board → Rings", de: "Aus-/Einstieg → Ringe" }), href: "/#ringler" }, { ad: t({ tr: "Araç kapıları → Çeken Araç", en: "Vehicle doors → Traction Vehicle", de: "Fahrzeugtüren → Triebfahrzeug" }), href: "/#ceken-arac" }]} />
        </Panel>
      </section>

      {/* Canlı ağ simülasyonu (kahraman) — TAM GENİŞLİK: takip ekranı sayfanın dar
          kolonundan (max-w-6xl) taşıp ekrana yayılır → çok daha büyük görünür.
          Negatif marj tekniği (w-screen yok) → yatay kaydırma çubuğu oluşmaz. */}
      </div>

      <div className="sf-panel" data-t="2">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Trenleri canlı izle (şematik/harita), ters işletme kısa dönüşleri ve zaman çizelgesi (tarife).", en: "Watch trains live (schematic/map), reverse-running short-turns and the timetable.", de: "Züge live verfolgen (Schema/Karte), Kehrbetrieb-Kehren und Fahrplan." })}</p>

      <div id="canli" className="mt-6 ml-[calc(-50vw+50%)] mr-[calc(-50vw+50%)] px-4 sm:px-8">
      <div className="mx-auto max-w-[1600px]">
      <Panel baslik={t({ tr: "Canlı Ağ Simülasyonu", en: "Live Network Simulation", de: "Live-Netzsimulation" })} aciklama={t({ tr: "Trenler PARKLANMA ALANINDAN çıkar: hepsi AYNI yerden, GİDİŞ yönünde (alt şerit), SIRAYLA (headway aralığıyla) yola çıkar; sıra bekleyenler ⏸ parkta durur. Hat DÖNGÜdür (lastik): tren gidiş şeridini yürür → terminalde peron işgali süresi kadar DÖNER (turnback) → dönüş şeridinden geri gelir → başta döner → tekrar. İki şerit, trenler turnback'e ulaştıkça DOĞAL olarak dolar (gerçek işletmede depodan öyle çıkarlar). Her trenin üstünde o an ne yaşadığı (⤵ hız kısıtı · ⏸ istasyon duruşu · 🔄 terminal dönüşü · ↗ hızlanma · → seyir) rozetle görünür; bir trene TIKLA → bir tam turda hangi nedene kaç saniye geçirdiğinin dökümü açılır. Sinyaller blok sınırlarında 3-aspekt yanar. Oynat ▶", en: "Trains leave the PARKING AREA: all from the SAME place, in the OUTBOUND direction (lower track), IN SEQUENCE (at the headway interval); those waiting their turn stand ⏸ in the depot. The line is a LOOP (rubber-band): a train runs the outbound track → turns back at the terminal for the platform occupancy time → returns on the return track → turns at the start → repeats. The two tracks fill NATURALLY as trains reach the turnback (in real operation they leave the depot that way). Above each train a badge shows what it is doing (⤵ speed restriction · ⏸ station dwell · 🔄 terminal turnback · ↗ acceleration · → cruise); CLICK a train → a breakdown of how many seconds it spent on each cause in one full round-trip opens. Signals show 3 aspects at block boundaries. Play ▶", de: "Züge verlassen den ABSTELLBEREICH: alle vom SELBEN Ort, in HINFAHRT-Richtung (unteres Gleis), NACHEINANDER (im Zugfolgeabstand); wartende stehen ⏸ in der Abstellung. Die Linie ist eine SCHLEIFE (Gummiband): ein Zug fährt das Hinfahrtgleis → wendet am Terminal für die Bahnsteigbelegungszeit → kehrt auf dem Rückfahrtgleis zurück → wendet am Anfang → wiederholt. Die zwei Gleise füllen sich NATÜRLICH, sobald Züge die Wende erreichen (im realen Betrieb verlassen sie so das Depot). Über jedem Zug zeigt ein Abzeichen, was er gerade tut (⤵ Geschwindigkeitsbeschränkung · ⏸ Stationshalt · 🔄 Terminalwende · ↗ Beschleunigung · → Fahrt); KLICKEN Sie einen Zug → eine Aufschlüsselung, wie viele Sekunden er in einem vollen Umlauf je Ursache verbracht hat, öffnet sich. Signale zeigen 3 Begriffe an den Blockgrenzen. Abspielen ▶" })}>
        {/* Görünüm: Şematik çift-şerit ↔ Coğrafi harita. Harita, istasyon koordinatları
            girilince gerçek konumda çizer; eksikse ölçekli plana düşer. Koordinat kalıcı. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md" style={{ border: `1px solid ${brand.border}` }}>
            <button type="button" data-sunum="sematik" onClick={() => setAgGorunum("sematik")} className="px-3 py-1 text-xs font-semibold"
              style={{ background: agGorunum === "sematik" ? brand.ink : "transparent", color: agGorunum === "sematik" ? "#fff" : brand.muted }}>{t({ tr: "Şematik", en: "Schematic", de: "Schema" })}</button>
            <button type="button" data-sunum="harita" onClick={() => setAgGorunum("harita")} className="px-3 py-1 text-xs font-semibold"
              style={{ background: agGorunum === "harita" ? brand.ink : "transparent", color: agGorunum === "harita" ? "#fff" : brand.muted }}>{t({ tr: "Harita", en: "Map", de: "Karte" })}</button>
          </div>
          <button type="button" onClick={() => setKoordAcik((o) => !o)} className="rounded-md px-3 py-1 text-xs font-semibold"
            style={{ border: `1px solid ${haritaTam ? "#16794C" : brand.border}`, color: haritaTam ? "#16794C" : brand.ink }}>
            ⌖ {t({ tr: "Koordinat gir", en: "Enter coordinates", de: "Koordinaten eingeben" })} {haritaTam ? "✓" : agKoordSay > 0 ? `${agKoordSay}/${agIstasyonlar.length}` : ""}
          </button>
          {/* Çakışmasız çizelge (opt-in): tek-hat çakışması varsa çözücü offset'lerini canlı sime uygular. */}
          {cakisma.spanOzet.length > 0 && cakismaCozum && (
            cakismaCozum.cozuldu ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold"
                style={{ border: `1px solid ${cakismasizCizelge ? CK.good : brand.border}`, color: cakismasizCizelge ? CK.good : brand.ink }}
                title={t({ tr: "Tek-hat çakışmasını gideren kalkış-offset çizelgesini (öneri) canlı simülasyona uygular; kapalıyken eşit-aralık kalkış.", en: "Applies the departure-offset schedule (advisory) that resolves single-track conflicts to the live simulation; when off, departures are evenly spaced.", de: "Wendet den Abfahrts-Offset-Fahrplan (Empfehlung) zur Auflösung von Eingleiskonflikten auf die Live-Simulation an; ausgeschaltet erfolgen Abfahrten gleichmäßig verteilt." })}>
                <input type="checkbox" checked={cakismasizCizelge} onChange={(e) => setCakismasizCizelge(e.target.checked)} />
                {t({ tr: "Çakışmasız çizelge", en: "Conflict-free schedule", de: "Konfliktfreier Fahrplan" })}
              </label>
            ) : (
              <span className="rounded-md px-3 py-1 text-[0.7rem] font-semibold" style={{ background: CK.amberBg, color: CK.amberInk, border: `1px solid ${CK.amber}` }}
                title={t({ tr: "Bu filoda tek-hat çakışması kalkış kaydırmasıyla giderilemiyor; Sistem Merkezi’ndeki çözücü çakışmasız maksimum filoyu gösterir.", en: "At this fleet the single-track conflict cannot be resolved by shifting departures; the solver in the System Centre shows the conflict-free maximum fleet.", de: "Bei dieser Flotte lässt sich der Eingleiskonflikt nicht durch Verschieben der Abfahrten auflösen; der Löser in der Systemzentrale zeigt die konfliktfreie Maximalflotte." })}>
                ⚠ {t({ tr: "Çakışma bu filoda giderilemez", en: "Conflict cannot be resolved at this fleet", de: "Konflikt bei dieser Flotte nicht lösbar" })}
              </span>
            )
          )}
          {gtfsMesaj && <span className="text-[0.7rem] font-medium" style={{ color: gtfsYukle === "hata" ? CK.red : CK.good }}>{gtfsMesaj}</span>}
          {agGorunum === "harita" && haritaTam && (
            (isletme.koordinatKaynak === "iceaktar" || isletme.koordinatYaklasik) ? (
              <span className="rounded px-2 py-1 text-[0.7rem] font-semibold" style={{ background: CK.amberBg, color: CK.amberInk, border: `1px solid ${CK.amber}` }}
                title={t({ tr: "Konumlar CAD güzergâh projesinden (alignment + kilometraj) üretilip OSM inşaat hattına hizalandı; ~150m demo hassasiyeti. OSM'e istasyonlar eklenince otomatik gerçek veriyle güncellenir.", en: "Positions were generated from the CAD alignment project (alignment + chainage) and aligned to the OSM construction line; ~150 m demo accuracy. When stations are added to OSM it updates automatically with real data.", de: "Die Positionen wurden aus dem CAD-Trassierungsprojekt (Alignment + Stationierung) erzeugt und an die OSM-Baulinie ausgerichtet; ~150 m Demo-Genauigkeit. Sobald Stationen zu OSM hinzugefügt werden, aktualisiert es sich automatisch mit echten Daten." })}>
                ⚠ {t({ tr: "Kaynak: CAD/GTFS içe aktarımı — yaklaşık ±~150m", en: "Source: CAD/GTFS import — approx. ±~150 m", de: "Quelle: CAD/GTFS-Import — ca. ±~150 m" })}
              </span>
            ) : (
              <span className="rounded px-2 py-1 text-[0.7rem] font-semibold" style={{ background: CK.goodBgSoft, color: CK.good, border: `1px solid ${CK.good}` }}
                title={t({ tr: "Durak koordinatları OpenStreetMap'ten gerçek node'lardan çekildi (~10m).", en: "Stop coordinates were fetched from real OpenStreetMap nodes (~10 m).", de: "Haltestellenkoordinaten wurden aus echten OpenStreetMap-Knoten geholt (~10 m)." })}>
                ✓ {t({ tr: "Kaynak: OpenStreetMap gerçek verisi", en: "Source: real OpenStreetMap data", de: "Quelle: echte OpenStreetMap-Daten" })}
              </span>
            )
          )}
          {agGorunum === "sematik" && haritaTam && (
            <span className="text-[0.7rem] font-medium" style={{ color: CK.good }}>💡 {t({ tr: "Bu hattın gerçek haritası hazır — üstteki", en: "The real map of this line is ready — view it with", de: "Die echte Karte dieser Linie ist bereit — ansehen mit" })} <b>{t({ tr: "“Harita”", en: "“Map”", de: "„Karte“" })}</b> {t({ tr: "ile gör.", en: "above.", de: "oben." })}</span>
          )}
        </div>
        {/* KAYNAK — İKİ AYRI YOL (koordinat yoksa): ① OSM'den çek (işleyen hatlar) ② CAD/GTFS içe aktar (OSM'de olmayan). */}
        {agGorunum === "harita" && !haritaTam && (
          <div className="mb-3 rounded-lg border p-3" style={{ borderColor: brand.border, background: "#fff" }}>
            <div className="mb-2 text-[0.78rem] font-semibold" style={{ color: brand.ink }}>
              {t({ tr: "Bu hattı gerçek haritada çizmenin", en: "There are", de: "Es gibt" })} <span style={{ color: brand.red }}>{t({ tr: "iki ayrı yolu", en: "two separate ways", de: "zwei getrennte Wege" })}</span> {t({ tr: "var — hattın türüne göre seçin:", en: "to draw this line on a real map — choose by line type:", de: ", diese Linie auf einer echten Karte darzustellen — nach Linientyp wählen:" })}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex flex-col rounded-md border p-2.5" style={{ borderColor: brand.border, background: CK.goodBgSoft }}>
                <div className="text-[0.74rem] font-bold" style={{ color: brand.ink }}>① 🌍 {t({ tr: "OpenStreetMap’ten çek", en: "Fetch from OpenStreetMap", de: "Aus OpenStreetMap holen" })}</div>
                <div className="mt-0.5 text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
                  <b>{t({ tr: "İşleyen / OSM’de kayıtlı", en: "Operating / OSM-registered", de: "In Betrieb / in OSM erfasst" })}</b> {t({ tr: "hatlar için. Durak koordinatı + gerçek kavisli hiza", en: "lines. Stop coordinates + real curved alignment arrive", de: "Linien. Haltestellenkoordinaten + echte kurvige Trassierung kommen" })} <b>{t({ tr: "otomatik", en: "automatically", de: "automatisch" })}</b> {t({ tr: "gelir (~10 m).", en: "(~10 m).", de: "(~10 m)." })}
                </div>
                <div className="mt-1 text-[0.68rem] font-semibold" style={{ color: agKoordSay > 0 ? CK.good : brand.muted }}>
                  {agKoordSay}/{agIstasyonlar.length} {t({ tr: "durak OSM’de bulundu", en: "stops found in OSM", de: "Haltestellen in OSM gefunden" })}{agKoordSay > 0 && agKoordSay < agIstasyonlar.length ? t({ tr: " — kalanı OSM’de yok", en: " — the rest are not in OSM", de: " — der Rest ist nicht in OSM" }) : ""} · {t({ tr: "otomatik çekiliyor", en: "fetching automatically", de: "wird automatisch geholt" })}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2" style={{ marginTop: "0.5rem" }}>
                  <button type="button" onClick={osmCek} disabled={gtfsYukle === "yukleniyor"}
                    className="rounded px-2.5 py-1 text-[0.7rem] font-semibold text-white disabled:opacity-60" style={{ background: "#2E7D57" }}
                    title={t({ tr: "Hattın bölgesinden OpenStreetMap durak koordinatlarını + gerçek hattı çeker → projeye yazar.", en: "Fetches OpenStreetMap stop coordinates + the real line from the line's region → writes them to the project.", de: "Holt OpenStreetMap-Haltestellenkoordinaten + die echte Linie aus der Region der Linie → schreibt sie ins Projekt." })}>
                    {gtfsYukle === "yukleniyor" ? t({ tr: "⟳ OSM’den çekiliyor…", en: "⟳ Fetching from OSM…", de: "⟳ Wird aus OSM geholt…" }) : t({ tr: "⤓ OSM’den çek", en: "⤓ Fetch from OSM", de: "⤓ Aus OSM holen" })}
                  </button>
                  <button type="button" onClick={() => setKoordAcik(true)} className="rounded px-2 py-1 text-[0.7rem] font-medium" style={{ border: `1px solid ${brand.border}`, color: brand.muted }}>⌖ {t({ tr: "elle gir", en: "enter by hand", de: "manuell eingeben" })}</button>
                </div>
              </div>
              <div className="flex flex-col rounded-md border p-2.5" style={{ borderColor: CK.amber, background: CK.amberBg }}>
                <div className="text-[0.74rem] font-bold" style={{ color: CK.amberInk }}>② 📐 {t({ tr: "CAD / GTFS içe aktar", en: "Import CAD / GTFS", de: "CAD / GTFS importieren" })}</div>
                <div className="mt-0.5 text-[0.68rem] leading-snug" style={{ color: brand.inkSoft }}>
                  <b>{t({ tr: "İnşaat halindeki / OSM’de OLMAYAN", en: "Under construction / NOT in OSM", de: "Im Bau / NICHT in OSM" })}</b> {t({ tr: "hatlar için. CAD güzergâh projenizden koordinat + geometri", en: "lines. Coordinates + geometry from your CAD alignment project are imported into", de: "Linien. Koordinaten + Geometrie aus Ihrem CAD-Trassierungsprojekt werden in" })} <b>{t({ tr: "projenize", en: "your project", de: "Ihr Projekt" })}</b> {t({ tr: "aktarılır (~150 m, kaynak koduna gömülü değil).", en: "imported (~150 m, not embedded in source code).", de: "importiert (~150 m, nicht im Quellcode eingebettet)." })}
                </div>
                {isletme.gtfsHazir ? (
                  <button type="button" onClick={gtfsIceAktar} disabled={gtfsYukle === "yukleniyor"}
                    className="mt-auto self-start rounded px-2.5 py-1 text-[0.7rem] font-semibold text-white disabled:opacity-60" style={{ background: "#2E7D57", marginTop: "0.5rem" }}
                    title={t({ tr: "Bu hattın CAD güzergâhından üretilmiş GTFS'ini indirir → koordinat + geometriyi PROJENE yazar (makas/sinyal korunur).", en: "Downloads the GTFS generated from this line's CAD alignment → writes coordinates + geometry to YOUR project (turnouts/signals preserved).", de: "Lädt das aus der CAD-Trassierung dieser Linie erzeugte GTFS herunter → schreibt Koordinaten + Geometrie in IHR Projekt (Weichen/Signale bleiben erhalten)." })}>
                    {gtfsYukle === "yukleniyor" ? t({ tr: "⟳ İçe aktarılıyor…", en: "⟳ Importing…", de: "⟳ Wird importiert…" }) : t({ tr: "⬇ Bu hattın CAD verisini içe aktar", en: "⬇ Import this line's CAD data", de: "⬇ CAD-Daten dieser Linie importieren" })}
                  </button>
                ) : (
                  <Link href="/#ringler" className="mt-auto self-start rounded px-2.5 py-1 text-[0.7rem] font-semibold" style={{ border: `1px solid ${CK.amber}`, color: CK.amberInk, marginTop: "0.5rem" }}>
                    📁 {t({ tr: "Ringler → Dosyadan İçe Aktar (GTFS / DXF)", en: "Rings → Import from File (GTFS / DXF)", de: "Ringe → Aus Datei importieren (GTFS / DXF)" })}
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-1.5 text-[0.64rem]" style={{ color: brand.faint }}>
              {t({ tr: "Sahte konum üretilmez — koordinat yalnız gerçek kaynaktan (OSM ya da CAD) gelir.", en: "No fake positions are generated — coordinates come only from a real source (OSM or CAD).", de: "Es werden keine falschen Positionen erzeugt — Koordinaten stammen nur aus einer echten Quelle (OSM oder CAD)." })}
              <b style={{ color: brand.muted }}> {t({ tr: "Bu iki buton hattını DEĞİŞTİRMEZ", en: "These two buttons do NOT change your line", de: "Diese zwei Schaltflächen ÄNDERN Ihre Linie NICHT" })}</b> — {t({ tr: "kurduğun durak/mesafe/makas/sinyal aynen kalır; yalnız duraklara", en: "the stops/distances/turnouts/signals you built stay as is; only", de: "die von Ihnen erstellten Haltestellen/Distanzen/Weichen/Signale bleiben unverändert; nur" })} <b>{t({ tr: "koordinat + harita hizası", en: "coordinates + map alignment", de: "Koordinaten + Kartenausrichtung" })}</b> {t({ tr: "eklenir. OSM eşleşmesi", en: "are added to the stops. OSM matching is", de: "werden den Haltestellen hinzugefügt. Die OSM-Zuordnung erfolgt" })} <b>{t({ tr: "durak ADINA", en: "by stop NAME", de: "nach Haltestellen-NAME" })}</b> {t({ tr: "göredir (adlar gerçek/OSM'de kayıtlı olmalı).", en: "(names must be real/registered in OSM).", de: "(Namen müssen echt/in OSM erfasst sein)." })}
            </div>
          </div>
        )}
        {agGorunum === "harita" && (
          <div className="mb-3 rounded-lg border-l-4 px-3 py-2.5 text-[0.72rem] leading-relaxed" style={{ borderColor: brand.ink, background: CK.goodBgSoft, color: brand.inkSoft }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: brand.ink }}>ℹ️ {t({ tr: "Var olan hat → OSM · yeni / inşaat hattı → CAD", en: "Existing line → OSM · new / under-construction line → CAD", de: "Bestehende Linie → OSM · neue / im Bau befindliche Linie → CAD" })}</span>
              <button type="button" onClick={() => setHaritaBilgi((o) => !o)} className="shrink-0 text-[0.68rem] underline" style={{ color: brand.muted }}>{haritaBilgi ? t({ tr: "gizle", en: "hide", de: "ausblenden" }) : t({ tr: "detay", en: "detail", de: "Detail" })}</button>
            </div>
            {haritaBilgi && (
              <>
                <div className="mt-1">
                  <b>{t({ tr: "İşleyen bir tramvay sistemi", en: "For an operating tram system", de: "Für ein in Betrieb befindliches Straßenbahnsystem" })}</b> {t({ tr: "için: istasyon adlarınız zaten girili →", en: ": your station names are already entered →", de: ": Ihre Stationsnamen sind bereits eingegeben →" })} <b>{t({ tr: "“OSM’den çek”", en: "“Fetch from OSM”", de: "„Aus OSM holen“" })}</b> {t({ tr: "koordinatları + gerçek kavisli hattı", en: "brings coordinates + the real curved line", de: "holt Koordinaten + die echte kurvige Linie" })} <b>{t({ tr: "doğrudan, otomatik", en: "directly, automatically", de: "direkt, automatisch" })}</b> {t({ tr: "getirir (~10 m).", en: "(~10 m).", de: "(~10 m)." })} <b>{t({ tr: "Henüz yapılmamış / inşaat halindeki", en: "Not yet built / under construction", de: "Noch nicht gebaut / im Bau" })}</b> {t({ tr: "hat için:", en: "line:", de: "Linie:" })} <b>{t({ tr: "CAD güzergâh projenizi", en: "import your CAD alignment project", de: "importieren Sie Ihr CAD-Trassierungsprojekt" })}</b> {t({ tr: "içe aktarın.", en: ".", de: "." })}
                </div>
                <div className="mt-1">
                  <b>{t({ tr: "Değeri:", en: "Value:", de: "Nutzen:" })}</b> {t({ tr: "harita yalnız “bakmak” değil — projenize özel", en: "the map is not just for “looking” — you", de: "die Karte dient nicht nur zum „Anschauen“ — Sie" })} <b>{t({ tr: "simülasyonu ve sinyalizasyon revizyonlarını sistem içinden CANLI yönetirsiniz", en: "manage the simulation and signalling revisions specific to your project LIVE from within the system", de: "verwalten die projektspezifische Simulation und Signalisierungsrevisionen LIVE aus dem System heraus" })}</b>; {t({ tr: "bir sinyal lambasını taşıdığınızda, makas/geçit eklediğinizde ya da kurp hız/konfor uyarısı çıktığında değişiklik", en: "when you move a signal, add a turnout/crossing, or a curve speed/comfort warning appears, the change is", de: "wenn Sie ein Signal verschieben, eine Weiche/einen Übergang hinzufügen oder eine Bogen-Geschwindigkeits-/Komfortwarnung erscheint, wird die Änderung" })} <b>{t({ tr: "anında bu haritaya yansır", en: "reflected on this map instantly", de: "sofort auf dieser Karte übernommen" })}</b>.
                </div>
              </>
            )}
          </div>
        )}
        {koordAcik && (
          <div className="mb-3 rounded-md p-3" style={{ border: `1px solid ${brand.border}`, background: "#FAFBFC" }}>
            <KoordinatDuzen istasyonlar={agIstasyonlar} koordinat={agKoordinat} onChange={(k) => patchIsletme({ istasyonKoordinat: k, koordinatKaynak: "manuel" })} onGeometri={(g) => patchIsletme({ hatGeometri: g })} />
          </div>
        )}
        {simHazir ? (
          agGorunum === "harita" ? (
            <CografiAg line={line} loop={loopVeri} features={hatOzellik} koordinat={agKoordinat} geometri={isletme.hatGeometri} blocks={canliGidis.blocks} ters={tersRapor} hizKisitlari={hizKisitlari} yolcuVeriVar={yolcuVeriVar} autoOynat={otoOynat} />
          ) : (
            <LiveNetwork autoOynat={otoOynat} network={network} route={route} line={line} blocks={canliGidis.blocks}
              up={canliGidis.trains} down={donusSim.trains} tMax={Math.max(canliGidis.tMax, donusSim.tMax)} trainLen={stock.length}
              faultBlocks={ariza} onBlockClick={arizaToggle} depots={depotPlan.depots} features={hatOzellik} loop={loopVeri}
              terminalBas={isletme.terminalBas} terminalSon={isletme.terminalSon}
              tersMod={isletme.tersMod ?? "gidenHat"} onTersMod={(m) => patchIsletme({ tersMod: m })} />
          )
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center" style={{ borderColor: CK.amber, background: CK.amberBg }}>
            <div className="flex justify-center" style={{ color: CK.amberInk }}><Ikon ad="tramvay" size={26} /></div>
            <div className="mt-1 text-sm font-bold" style={{ color: CK.amberInk }}>{t({ tr: "Canlı Ağ Simülasyonunu başlatmak için iki şey gerekli", en: "Two things are needed to start the Live Network Simulation", de: "Zwei Dinge sind nötig, um die Live-Netzsimulation zu starten" })}</div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {!depoVar && (
                <div className="flex items-center gap-2">
                  <span style={{ color: brand.red }}>✗</span>
                  <span style={{ color: brand.inkSoft }}>{t({ tr: "Parklanma alanı seçilmemiş — trenler nereden çıkacak?", en: "No parking area selected — where will trains depart from?", de: "Kein Abstellbereich gewählt — von wo fahren die Züge ab?" })}</span>
                  <Link href="/#ringler" className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>→ {t({ tr: "Duraklar & Mesafeler'de parklanma alanı seç", en: "Select a parking area in Stops & Distances", de: "Abstellbereich in Haltestellen & Distanzen wählen" })}</Link>
                </div>
              )}
              {depoVar && <div className="flex items-center gap-2"><span style={{ color: "#16794C" }}>✓</span><span style={{ color: brand.muted }}>{t({ tr: "Parklanma alanı seçili.", en: "Parking area selected.", de: "Abstellbereich gewählt." })}</span></div>}
              {!filoHazir && (
                <div className="flex items-center gap-2">
                  <span style={{ color: brand.red }}>✗</span>
                  <span style={{ color: brand.inkSoft }}>{t({ tr: "Tramvay sayısı belirlenmemiş — kaç tren koşacak?", en: "Tram count not set — how many trains will run?", de: "Anzahl Straßenbahnen nicht festgelegt — wie viele Züge fahren?" })}</span>
                  <a href="#filo-paneli" onClick={(e) => { e.preventDefault(); panelAcVeGit("filo-paneli", brand.ink); }} className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>↑ {t({ tr: "Filo & Öneri'de filo sayınızı onaylayın", en: "Confirm your fleet count in Fleet & Recommendation", de: "Bestätigen Sie Ihre Flottenanzahl in Flotte & Empfehlung" })}</a>
                </div>
              )}
              {filoHazir && <div className="flex items-center gap-2"><span style={{ color: "#16794C" }}>✓</span><span style={{ color: brand.muted }}>{t({ tr: "Filo onaylı", en: "Fleet confirmed", de: "Flotte bestätigt" })} ({filoTek} {t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })}).</span></div>}
            </div>
            <div className="mt-3 text-xs" style={{ color: brand.muted }}>{t({ tr: "Bu ikisi girilince simülasyon otomatik açılır — trenler parklanma alanından çıkıp döngüye girer.", en: "Once both are entered the simulation opens automatically — trains leave the parking area and enter the loop.", de: "Sobald beides eingegeben ist, öffnet sich die Simulation automatisch — Züge verlassen den Abstellbereich und treten in die Schleife ein." })}</div>
          </div>
        )}
        {/* Blok yapısı = gerçek sinyal lambaları + istasyonlar (yapay blok bölme kaldırıldı) */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: brand.inkSoft }}>
          <span>▦ {t({ tr: "Blok sınırları =", en: "Block boundaries =", de: "Blockgrenzen =" })} <b>{t({ tr: "istasyonlar + koyduğun sinyal lambaları", en: "stations + the signals you placed", de: "Stationen + die von Ihnen platzierten Signale" })}</b> ({sinyalSimKonum.length} {t({ tr: "sinyal", en: "signals", de: "Signale" })})</span>
          <span style={{ color: brand.muted }}>{t({ tr: "Sinyalsiz kesim tek bloktur (o kesimde tek tren);", en: "A section without signals is a single block (one train in it);", de: "Ein Abschnitt ohne Signale ist ein einziger Block (ein Zug darin);" })} <b>{t({ tr: "sinyal ekledikçe blok bölünür → kapasite (h_min) artar", en: "as you add signals the block splits → capacity (h_min) rises", de: "mit jedem Signal teilt sich der Block → Kapazität (h_min) steigt" })}</b>. {t({ tr: "Kapasite bu bloklardan hesaplanır — sim ile birebir aynı.", en: "Capacity is computed from these blocks — identical to the sim.", de: "Die Kapazität wird aus diesen Blöcken berechnet — identisch mit der Simulation." })}</span>
        </div>
        {/* Filo kaynağı + kapasite bağlantısı */}
        <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>
          🚋 {t({ tr: "Canlı Ağ filosu", en: "Live Network fleet", de: "Live-Netz-Flotte" })} <b>{filo}</b> {t({ tr: "tren =", en: "trains =", de: "Züge =" })} <b>{t({ tr: "Filo Paneli", en: "Fleet Panel", de: "Flotten-Panel" })}</b>{t({ tr: "'nden (yukarıda)", en: " (above)", de: " (oben)" })}{depoVar ? t({ tr: " · parklanma dizilimine göre depolardan çıkar", en: " · departs from depots per the parking layout", de: " · fährt gemäß Abstellungsaufteilung aus den Depots" }) : t({ tr: " · hat başından", en: " · from the line start", de: " · vom Linienanfang" })} · {t({ tr: "her yön aynı filoyla · ulaşılan aralık", en: "each direction with the same fleet · achieved headway", de: "jede Richtung mit derselben Flotte · erreichte Zugfolgezeit" })} <b>{sure(ulasilanHeadwaySn)}</b>
          {maks.gecerli && <> · {t({ tr: "hat kapasitesi", en: "line capacity", de: "Linienkapazität" })} <b>{maks.nTeorik}</b></>}
        </div>
        {filoAsim && (
          <div className="mt-1 text-xs" style={{ color: brand.red }}>
            ⚠ {t({ tr: "Filo", en: "Fleet", de: "Flotte" })} ({filoTek}) {t({ tr: "bu hattın kapasitesini", en: "exceeds this line's capacity", de: "überschreitet die Kapazität dieser Linie" })} ({nMax}) {t({ tr: "aşıyor — simülasyon", en: "— the simulation runs with", de: "— die Simulation läuft mit" })} {filo} {t({ tr: "trenle koşuyor (fazlası sığmaz, kuyruklanır).", en: "trains (the excess does not fit and queues).", de: "Zügen (der Überschuss passt nicht und staut sich)." })}
          </div>
        )}
        {ariza.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span style={{ color: brand.red }}>⚠ {ariza.length} {t({ tr: "blok arızalı (gidiş) — trenler kuyruklanıyor.", en: "blocks faulty (outbound) — trains are queuing.", de: "Blöcke gestört (Hinfahrt) — Züge stauen sich." })}</span>
            <button onClick={() => setAriza([])} className="rounded border px-2 py-1 font-medium" style={{ borderColor: brand.border, color: brand.ink }}>{t({ tr: "Arızayı temizle", en: "Clear fault", de: "Störung zurücksetzen" })}</button>
          </div>
        )}
      </Panel>
      </div>
      </div>

      {/* TERS İŞLETME — Canlı Ağ Simülasyonu'nun HEMEN ALTINDA (kullanıcı düzeni).
          Kendi üst-bölümü yerine buraya taşındı; id korunur → /#tersisletme linkleri çalışır. */}
      <section id="tersisletme" className="mt-8 scroll-mt-28 border-t pt-6" style={{ borderColor: brand.border }}>
        <TersIsletme />
      </section>

      {/* TARİFE (zaman çizelgesi) — Ters İşletme'nin hemen altında. */}
      {maks.gecerli && (
        <section className="mt-8 border-t pt-6" style={{ borderColor: brand.border }}>
          <Tarife cevrimSn={maks.cevrimSuresi} headwaySn={ulasilanHeadwaySn} />
        </section>
      )}

      </div>

      <div className="sf-panel" data-t="3">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Klasik demiryolu analizi: Bildfahrplan (zaman–mesafe), gecikme yayılımı, hız profili, yük & duruş, talep→doluluk. Veriler canlı sim ile birebir aynı.", en: "Classic railway analysis: Bildfahrplan (time–distance), delay propagation, speed profile, load & dwell, demand→occupancy. Data is identical to the live sim.", de: "Klassische Eisenbahnanalyse: Bildfahrplan (Zeit–Weg), Verspätungsausbreitung, Geschwindigkeitsprofil, Last & Haltezeit, Nachfrage→Auslastung. Die Daten sind identisch mit der Live-Simulation." })}</p>

      {/* BİLDFAHRPLAN — canlı sim ile aynı loop yörüngesinden zaman-mesafe tren grafiği */}
      {simHazir && (
        <Panel katlanir ozet={t({ tr: "zaman–mesafe tren grafiği (Marey)", en: "time–distance train chart (Marey)", de: "Zeit–Weg-Zugdiagramm (Marey)" })} baslik={t({ tr: "Bildfahrplan — Zaman–Mesafe Grafiği", en: "Bildfahrplan — Time–Distance Chart", de: "Bildfahrplan — Zeit-Weg-Diagramm" })} aciklama={t({ tr: "Demiryolu mühendisliğinin klasik grafiği (Marey diyagramı): yatay = zaman (bir tam çevrim), dikey = mesafe (istasyonlar ızgara). Her tren bir çizgidir — eğim hızı, yatay kısım duruşu, gidiş↔dönüş çizgilerinin kesişimi karşılaşma noktasını gösterir. Çizgiler arası eşit dikey aralık düzenli headway'i, bozulması öbekleşmeyi (bunching) ortaya koyar. Veri canlı sim ile birebir aynıdır.", en: "The classic railway-engineering chart (Marey diagram): horizontal = time (one full cycle), vertical = distance (station grid). Each train is a line — slope is speed, a horizontal segment is a dwell, and the crossing of outbound↔return lines shows the meeting point. Equal vertical spacing between lines indicates regular headway; its distortion reveals bunching. Data is identical to the live sim.", de: "Das klassische Diagramm der Eisenbahntechnik (Marey-Diagramm): waagerecht = Zeit (ein voller Umlauf), senkrecht = Weg (Stationsraster). Jeder Zug ist eine Linie — die Steigung ist die Geschwindigkeit, ein waagerechtes Segment eine Haltezeit, und der Schnittpunkt von Hin-↔Rückfahrtlinien zeigt den Begegnungspunkt. Gleiche senkrechte Abstände zwischen den Linien zeigen eine regelmäßige Zugfolgezeit; ihre Verzerrung offenbart Pulkbildung. Die Daten sind identisch mit der Live-Simulation." })}>
          <GrafikCerceve baslik={t({ tr: "Bildfahrplan — Zaman–Mesafe Grafiği", en: "Bildfahrplan — Time–Distance Chart", de: "Bildfahrplan — Zeit-Weg-Diagramm" })}><Bildfahrplan loop={loopVeri} line={line} cakismalar={cakisma.cakismalar} /></GrafikCerceve>
          {/* Çakışma özeti (#2) — çakışma varsa uyarı + somut çözüm; yoksa yeşil onay. */}
          <div className="mt-3 rounded-lg border px-4 py-3 text-sm" style={{
            borderColor: cakisma.cakismaVar ? CK.red : "#B7E0C9",
            background: cakisma.cakismaVar ? "#FDF2F2" : "#F0FBF5",
            color: brand.ink,
          }}>
            <div className="font-semibold" style={{ color: cakisma.cakismaVar ? CK.red : "#0E7C57" }}>
              {cakisma.cakismaVar ? t({ tr: "⚠ Çizelge çakışması", en: "⚠ Schedule conflict", de: "⚠ Fahrplankonflikt" }) : t({ tr: "✓ Çakışmasız çizelge", en: "✓ Conflict-free schedule", de: "✓ Konfliktfreier Fahrplan" })}
            </div>
            <div className="mt-1" style={{ color: brand.inkSoft }}>{cakisma.ozet}</div>
            {cakisma.sistemik && (
              <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>{cakisma.sistemik.oneri}</div>
            )}
            {cakisma.spanOzet.map((o, i) => (
              <div key={i} className="mt-2 text-xs" style={{ color: brand.inkSoft }}>
                <b>{o.ad}</b> — {o.cakismaSayisi} {t({ tr: "karşılaşma/çevrim, maks", en: "meetings/cycle, max", de: "Begegnungen/Umlauf, max" })} {sure(o.maxOrtusme)}: {o.oneri}
              </div>
            ))}
          </div>
          <VeriKaynaklari />
        </Panel>
      )}

      {/* GECİKME YAYILIMI — knock-on zinciri (deterministik): hedef trene birincil gecikme */}
      {simHazir && filo >= 2 && (
        <Panel katlanir ozet={t({ tr: "knock-on gecikme zinciri", en: "knock-on delay chain", de: "Folgeverspätungskette" })} baslik={t({ tr: "Gecikme Yayılımı — Knock-on Zinciri", en: "Delay Propagation — Knock-on Chain", de: "Verspätungsausbreitung — Folgeverspätungskette" })} aciklama={t({ tr: "Bir trene birincil gecikme ver; sinyalizasyon simülasyonu bu gecikmenin ARDIŞIK trenlere ne kadar yansıdığını (ikincil/knock-on gecikme) ve tarifenin onu hangi trende yuttuğunu (sönümleme) deterministik olarak hesaplar. Monte-Carlo'nun ortalamada erittiği tek-olay zincirini yalıtır. Hedef treni ve gecikmeyi oynat.", en: "Give a train a primary delay; the signalling simulation deterministically computes how much this delay carries to SUBSEQUENT trains (secondary/knock-on delay) and at which train the timetable absorbs it (damping). It isolates the single-event chain that Monte-Carlo melts into the average. Adjust the target train and the delay.", de: "Geben Sie einem Zug eine Primärverspätung; die Signalisierungssimulation berechnet deterministisch, wie stark sich diese Verspätung auf NACHFOLGENDE Züge überträgt (Sekundär-/Folgeverspätung) und bei welchem Zug der Fahrplan sie aufnimmt (Dämpfung). Sie isoliert die Einzelereigniskette, die Monte-Carlo im Mittel auflöst. Passen Sie Zielzug und Verspätung an." })}>
          <div className="flex flex-wrap items-end gap-4 mb-3">
            <label className="text-sm" style={{ color: brand.inkSoft }}>
              {t({ tr: "Hedef tren", en: "Target train", de: "Zielzug" })}
              <select value={koHedef} onChange={(e) => setKoHedef(Math.min(filo - 1, Math.max(0, +e.target.value)))}
                className="ml-2 rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {Array.from({ length: filo }, (_, k) => <option key={k} value={k}>{k + 1}. {t({ tr: "tren", en: "train", de: "Zug" })}</option>)}
              </select>
            </label>
            <label className="text-sm" style={{ color: brand.inkSoft }}>
              {t({ tr: "Birincil gecikme:", en: "Primary delay:", de: "Primärverspätung:" })} <b style={{ color: brand.ink }}>{koGecikme} s</b>
              <input type="range" min={30} max={600} step={10} value={koGecikme}
                onChange={(e) => setKoGecikme(+e.target.value)} className="ml-2 align-middle" style={{ accentColor: brand.red }} />
            </label>
          </div>
          {/* Knock-on bar görselleştirmesi — tren başına ikincil gecikme (hedef koyu) */}
          {(() => {
            const bars = knockOn.zincir;
            const maxV = Math.max(1, ...bars.map((b) => (b.tren === knockOn.hedefTren ? b.birincil : b.ikincil)));
            return (
              <div className="flex items-end gap-1 h-28 border-b" style={{ borderColor: brand.border }}>
                {bars.map((b) => {
                  const v = b.tren === knockOn.hedefTren ? b.birincil : b.ikincil;
                  const renk = b.tren === knockOn.hedefTren ? brand.ink : (b.ikincil > 3 ? CK.red : "#C3CAD2");
                  return (
                    <div key={b.tren} className="flex flex-1 flex-col items-center justify-end" title={`${b.tren + 1}. ${t({ tr: "tren", en: "train", de: "Zug" })}: ${b.tren === knockOn.hedefTren ? `${t({ tr: "birincil", en: "primary", de: "primär" })} ${b.birincil} s` : `knock-on ${b.ikincil} s`}`}>
                      {v > 0 && <span className="text-[9px]" style={{ color: renk }}>{Math.round(v)}</span>}
                      <div style={{ height: `${(v / maxV) * 92}px`, width: "70%", background: renk, borderRadius: "2px 2px 0 0" }} />
                      <span className="mt-0.5 text-[9px]" style={{ color: brand.muted }}>{b.tren + 1}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div className="mt-3 rounded-lg border px-4 py-3 text-sm" style={{
            borderColor: knockOn.etkilenen === 0 ? "#B7E0C9" : (knockOn.etkilenen >= 3 ? CK.red : "#E4C97A"),
            background: knockOn.etkilenen === 0 ? "#F0FBF5" : "#FDFaF2",
            color: brand.ink,
          }}>
            <b style={{ color: knockOn.etkilenen === 0 ? "#0E7C57" : (knockOn.etkilenen >= 3 ? CK.red : "#8A6D1F") }}>
              {knockOn.etkilenen === 0 ? t({ tr: "✓ Yayılım yok", en: "✓ No propagation", de: "✓ Keine Ausbreitung" }) : `⚠ ${knockOn.etkilenen} ${t({ tr: "ardışık tren etkilenir", en: "consecutive trains affected", de: "aufeinanderfolgende Züge betroffen" })}`}
            </b>
            <div className="mt-1" style={{ color: brand.inkSoft }}>{knockOn.ozet}</div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: brand.inkSoft }}>
              <span>{t({ tr: "En yüksek knock-on:", en: "Highest knock-on:", de: "Höchste Folgeverspätung:" })} <b>{sure(knockOn.maxIkincil)}</b></span>
              <span>{t({ tr: "Toplam ikincil:", en: "Total secondary:", de: "Sekundär gesamt:" })} <b>{sure(knockOn.toplamIkincil)}</b></span>
              <span>{t({ tr: "Sönümleme:", en: "Damping:", de: "Dämpfung:" })} <b>{knockOn.sonumleme !== null ? `${knockOn.sonumleme - knockOn.hedefTren} ${t({ tr: "tren sonra", en: "trains later", de: "Züge später" })}` : t({ tr: "pencere içinde sönmez", en: "does not damp within the window", de: "dämpft nicht innerhalb des Fensters" })}</b></span>
            </div>
          </div>
        </Panel>
      )}

      {/* HIZ PROFİLİ — hat boyunca gerçek hız + limit zarfı (canlı sim yörüngesinden) */}
      {simHazir && (
        <Panel katlanir ozet={t({ tr: "v(x) hız zarfı + limitler", en: "v(x) speed envelope + limits", de: "v(x) Geschwindigkeitshüllkurve + Grenzen" })} baslik={t({ tr: "Hız Profili — v(x)", en: "Speed Profile — v(x)", de: "Geschwindigkeitsprofil — v(x)" })} aciklama={t({ tr: "Hat boyunca (gidiş yönünde) tramvayın gerçek hızı ile hız-limiti zarfı. Mavi eğri gerçek hız (canlı sim ile aynı yörüngeden, ds/dt), gri kesikli çizgi segment hız limiti. Dip noktaları istasyon duruşlarıdır; limitin altındaki kısımlar hızlanma/frenleme bölgeleridir. Nerede hangi kısıtın (istasyon, makas, viraj) hızı bağladığı görünür.", en: "The tram's actual speed along the line (outbound) against the speed-limit envelope. The blue curve is actual speed (from the same trajectory as the live sim, ds/dt), the grey dashed line the segment speed limit. Dips are station dwells; sections below the limit are acceleration/braking zones. It shows where and which constraint (station, turnout, curve) binds the speed.", de: "Die tatsächliche Geschwindigkeit der Straßenbahn entlang der Linie (Hinfahrt) gegen die Geschwindigkeitshüllkurve. Die blaue Kurve ist die tatsächliche Geschwindigkeit (aus derselben Trajektorie wie die Live-Simulation, ds/dt), die graue gestrichelte Linie die Segment-Geschwindigkeitsbegrenzung. Tiefpunkte sind Stationshalte; Abschnitte unter der Grenze sind Beschleunigungs-/Bremszonen. Es zeigt, wo und welche Einschränkung (Station, Weiche, Bogen) die Geschwindigkeit begrenzt." })}>
          <GrafikCerceve baslik={t({ tr: "Hız Profili — v(x)", en: "Speed Profile — v(x)", de: "Geschwindigkeitsprofil — v(x)" })}><HizProfili loop={loopVeri} line={line} /></GrafikCerceve>
        </Panel>
      )}

      {/* YÜK & DURUŞ ANALİZİ — hat boyu yük profili (doluluk-renkli) + dwell dökümü */}
      {tersRapor && tersRapor.duraklar.length > 1 && (
        <Panel katlanir ozet={t({ tr: "yük profili + dwell dökümü", en: "load profile + dwell breakdown", de: "Lastprofil + Haltezeit-Aufschlüsselung" })} baslik={t({ tr: "Yük & Duruş Analizi", en: "Load & Dwell Analysis", de: "Last- & Haltezeit-Analyse" })} aciklama={t({ tr: "Hat boyunca (ortak mesafe ekseninde) iki grafik: üstte YÜK PROFİLİ — her durakta tepe araç yükü (yolcu/saat), doluluğa göre renkli (yeşil<%50 · sarı %50–85 · kırmızı>%85), tepe durak işaretli; altta DURUŞ (dwell) DÖKÜMÜ — her durakta sürenin kapı-açma / yolcu-değişimi / kapı-kapama kırılımı. Tramvay dwell-baskın olduğundan zamanın nereye gittiğini ve hattın en kalabalık kesimini bir bakışta gösterir.", en: "Two charts on a shared distance axis: on top the LOAD PROFILE — peak vehicle load at each stop (pax/hour), coloured by occupancy (green <50% · yellow 50–85% · red >85%), with the peak stop marked; below the DWELL BREAKDOWN — the split of each stop's time into door-opening / passenger-exchange / door-closing. Since trams are dwell-dominated, it shows at a glance where the time goes and the busiest section of the line.", de: "Zwei Diagramme auf gemeinsamer Wegachse: oben das LASTPROFIL — Spitzenfahrzeuglast an jeder Haltestelle (Fahrg./Stunde), nach Auslastung eingefärbt (grün <50 % · gelb 50–85 % · rot >85 %), mit markierter Spitzenhaltestelle; unten die HALTEZEIT-AUFSCHLÜSSELUNG — die Aufteilung der Zeit jeder Haltestelle in Türöffnen / Fahrgastwechsel / Türschließen. Da Straßenbahnen haltezeitdominiert sind, zeigt es auf einen Blick, wohin die Zeit geht und den am stärksten ausgelasteten Abschnitt der Linie." })}>
          <GrafikCerceve baslik={t({ tr: "Yük & Duruş Analizi", en: "Load & Dwell Analysis", de: "Last- & Haltezeit-Analyse" })}><YukDwellAnaliz duraklar={tersRapor.duraklar} rings={rings} /></GrafikCerceve>
        </Panel>
      )}

      {/* TALEP → FİLO → DOLULUK ZİNCİRİ — yolcu talebi işletmeyi nasıl belirler */}
      {tersRapor && tersRapor.duraklar.length > 1 && (
        <Panel katlanir ozet={t({ tr: "talep → gereken filo → doluluk", en: "demand → required fleet → occupancy", de: "Nachfrage → erforderliche Flotte → Auslastung" })} baslik={t({ tr: "Talep → Gereken Filo → Doluluk Zinciri", en: "Demand → Required Fleet → Occupancy Chain", de: "Nachfrage → erforderliche Flotte → Auslastungskette" })} aciklama={t({ tr: "Yolcu talebinin işletmeyi nasıl belirlediği üç aşamada: tepe talep → (hedef dolulukta) gereken filo → (mevcut filoda) ulaşılan doluluk. Filo azsa doluluk hedefi aşılır, fazlaysa düşer.", en: "How passenger demand determines operation in three stages: peak demand → required fleet (at target occupancy) → achieved occupancy (at current fleet). If the fleet is too small the occupancy target is exceeded; if too large it falls.", de: "Wie die Fahrgastnachfrage den Betrieb in drei Stufen bestimmt: Spitzennachfrage → erforderliche Flotte (bei Zielauslastung) → erreichte Auslastung (bei aktueller Flotte). Ist die Flotte zu klein, wird das Auslastungsziel überschritten; ist sie zu groß, sinkt es." })}>
          <TalepZinciri t={tersRapor} dolulukHedefi={isletme.dolulukHedefi || 0.85} />
        </Panel>
      )}

      </div>

      <div className="sf-panel" data-t="4">
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>{t({ tr: "Filoyu oynattıkça canlı etkiler ve gecikmelere karşı sağlamlık (Monte-Carlo).", en: "Live effects as you adjust the fleet and robustness against delays (Monte-Carlo).", de: "Live-Auswirkungen beim Anpassen der Flotte und Robustheit gegen Verspätungen (Monte-Carlo)." })}</p>

      {/* ⑤ CANLI ETKİLER — filo oynadıkça bağlı olduğu her durum canlı güncellenir */}
      {maks.gecerli && (
      <Panel katlanir ozet={t({ tr: "filo oynadıkça canlı sonuçlar", en: "live results as the fleet changes", de: "Live-Ergebnisse bei Flottenänderung" })} baslik={t({ tr: "Canlı Etkiler & Öneriler", en: "Live Effects & Recommendations", de: "Live-Auswirkungen & Empfehlungen" })} aciklama={t({ tr: "Filoyu oynattıkça bağlı olduğu her durum burada canlı güncellenir — ulaşılan sıklık, kapasite/park aşımı, tıkanan duraklar/dönüş ihtiyacı ve makaslarda ters işletme ihtiyacı.", en: "Every state that depends on the fleet updates live here — achieved frequency, capacity/parking overflow, congested stops/short-turn need, and reverse-running need at turnouts.", de: "Jeder von der Flotte abhängige Zustand aktualisiert sich hier live — erreichte Taktung, Kapazitäts-/Abstellungsüberschreitung, überlastete Haltestellen/Kehrbedarf und Kehrbetriebsbedarf an Weichen." })}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kart ic="sm">
            <Kpi etiket={t({ tr: "Ulaşılan sıklık", en: "Achieved frequency", de: "Erreichte Taktung" })} deger={sure(ulasilanHeadwaySn)}
              alt={`${(3600 / Math.max(1, ulasilanHeadwaySn)).toFixed(1)} ${t({ tr: "tren/saat · filo", en: "trains/h · fleet", de: "Züge/h · Flotte" })} ${filoTek}`} />
          </Kart>
          <Kart ic="sm" ton={filoAsim ? "danger" : "notr"}>
            <Kpi etiket={t({ tr: "Kapasite", en: "Capacity", de: "Kapazität" })} deger={`${filoTek} / ${nMax}`} ton={filoAsim ? "danger" : "notr"}
              alt={filoAsim ? t({ tr: "⚠ aşıldı, sığmaz", en: "⚠ exceeded, won't fit", de: "⚠ überschritten, passt nicht" }) : t({ tr: "araç / üst sınır ✓", en: "vehicles / upper limit ✓", de: "Fahrzeuge / Obergrenze ✓" })} />
          </Kart>
          <Kart ic="sm" ton={depoVar && parkToplam !== filoTek ? "warn" : "notr"}>
            <Kpi etiket={t({ tr: "Parklanma", en: "Parking", de: "Abstellung" })} deger={depoVar ? `${parkToplam}/${filoTek}` : "—"}
              alt={!depoVar ? t({ tr: "depo yok", en: "no depot", de: "kein Depot" }) : parkToplam === filoTek ? t({ tr: "✓ dizildi", en: "✓ placed", de: "✓ eingeordnet" }) : t({ tr: "⚠ eksik/fazla", en: "⚠ short/excess", de: "⚠ zu wenig/zu viel" })} />
          </Kart>
          <Kart ic="sm" ton={yolcuVeriVar && tersRapor && tersRapor.donusIhtiyaclari.length > 0 ? "danger" : "notr"}>
            <Kpi etiket={t({ tr: "Tıkanma / dönüş", en: "Congestion / short-turn", de: "Überlastung / Kehre" })}
              deger={yolcuVeriVar && tersRapor ? tersRapor.donusIhtiyaclari.length : "—"}
              ton={yolcuVeriVar && tersRapor && tersRapor.donusIhtiyaclari.length > 0 ? "danger" : "notr"}
              alt={yolcuVeriVar ? t({ tr: "tıkanan durak", en: "congested stop", de: "überlastete Haltestelle" }) : <button type="button" className="underline" style={{ color: brand.ink }} onClick={() => setTalepPopup(true)}>{t({ tr: "yolcu gir", en: "enter passengers", de: "Fahrgäste eingeben" })}</button>} />
          </Kart>
        </div>
        {yolcuVeriVar && tersRapor && (tersRapor.donusIhtiyaclari.length > 0 || tersRapor.makaslar.some((m) => m.kisaDonusOnerilir)) && (
          <div className="mt-3 space-y-1 text-xs">
            {tersRapor.donusIhtiyaclari.slice(0, 4).map((d, i) => (
              <div key={i} style={{ color: brand.inkSoft }}>🔴 <b>{d.durak}</b> {t({ tr: "doluluk", en: "occupancy", de: "Auslastung" })} %{Math.round(d.doluluk * 100)} → <b>{d.oneriMakas}</b> {t({ tr: "makasından kısa dönüş gerekir.", en: "turnout requires a short-turn.", de: "Weiche erfordert eine Kehre." })}</div>
            ))}
            {tersRapor.makaslar.filter((m) => m.kisaDonusOnerilir).slice(0, 3).map((m, i) => (
              <div key={`m${i}`} style={{ color: brand.muted }}>⟲ <b>{m.ad}</b> {t({ tr: "kısa dönüş adayı", en: "short-turn candidate", de: "Kehre-Kandidat" })} (%{m.kisaDonusYuzde}).{m.crossover === "x" ? "" : t({ tr: " S makas — ters işletme sinyali gerekebilir.", en: " S turnout — a reverse-running signal may be needed.", de: " S-Weiche — ein Kehrbetriebssignal kann nötig sein." })}</div>
            ))}
            <div className="mt-1"><Link href="/#tersisletme" className="underline" style={{ color: brand.ink }}>→ {t({ tr: "Ters İşletme'de detaylı analiz", en: "Detailed analysis in Reverse Running", de: "Detailanalyse im Kehrbetrieb" })}</Link></div>
          </div>
        )}
      </Panel>
      )}

      {/* Sefer sıklığı */}

      {/* YOLCU DİNAMİĞİ & DURUŞ — dwell fiziksel yolcu akışından hesaplanır. */}

      {/* GÜN İÇİ SERVİS & PARKLANMA — filo gün boyu sabit değil: pik saatte hepsi
          hatta, pik-dışında fazlası depoya döner (parklanma), gece hepsi depoda. */}



      {/* SEFER ↔ TERS İŞLETME ENTEGRE — manuel headway + zaman → araç konumları → araca bağlı kısa dönüş önerileri */}
      {maks.gecerli && rings.length >= 2 && (
        <Panel baslik={t({ tr: "Sefer & Ters İşletme — Entegre Analiz", en: "Service & Reverse Running — Integrated Analysis", de: "Betrieb & Kehrbetrieb — integrierte Analyse" })} aciklama={t({ tr: "Sefer aralığını (headway) elle ayarla; o an seferdeki araçların GERÇEK konumları (yörüngeden — sinyal lambaları, karayolu/yaya geçitleri, makas geçiş hızı, eğim ve duruşlar dâhil) diyagramda görünür. Zaman çubuğuyla ilerlet. Girilen yolcu talebine göre yük dengesizliği olan makaslara yaklaşan araç bulunur ve KISA DÖNÜŞ (ters işletme) kararı O ARACA bağlanır — kazanç ve gerekçesiyle önerilir. Tarife ile ters işletme burada ortaklaşır.", en: "Adjust the headway by hand; the REAL positions of the vehicles currently in service (from the trajectory — including signals, road/pedestrian crossings, turnout transit speed, gradient and dwells) appear on the diagram. Advance with the time bar. Based on the entered passenger demand, the vehicle approaching a load-imbalanced turnout is found and the SHORT-TURN (reverse-running) decision is tied to THAT vehicle — recommended with its gain and rationale. Timetable and reverse running come together here.", de: "Passen Sie die Zugfolgezeit manuell an; die REALEN Positionen der derzeit im Betrieb befindlichen Fahrzeuge (aus der Trajektorie — inkl. Signale, Straßen-/Fußgängerübergänge, Weichendurchfahrtsgeschwindigkeit, Neigung und Halte) erscheinen im Diagramm. Mit der Zeitleiste vorspulen. Anhand der eingegebenen Fahrgastnachfrage wird das Fahrzeug ermittelt, das sich einer lastungleichen Weiche nähert, und die KEHRE-Entscheidung (Kehrbetrieb) wird an DIESES Fahrzeug gebunden — mit Nutzen und Begründung empfohlen. Fahrplan und Kehrbetrieb kommen hier zusammen." })}>
          <SeferTersEntegre rings={rings} stock={stock} cfg={cfg} isletme={isletme} headwayDk={headwayDk} onHeadwayChange={setHeadwayDk} />
        </Panel>
      )}

      {/* Özet künye */}
      <section className="mt-6 overflow-hidden rounded-lg border bg-white" style={{ borderColor: brand.border }}>
        <div className="grid grid-cols-2 divide-x divide-y divide-[#DCE1E7] sm:grid-cols-3 lg:grid-cols-6">
          <Field etiket={t({ tr: "Hat Uzunluğu", en: "Line Length", de: "Linienlänge" })} deger={`${km(line.length)} km`} />
          <Field etiket={t({ tr: "Toplam Süre", en: "Total Time", de: "Gesamtzeit" })} deger={sure(result.totalTime)} alt={t({ tr: "duruşlar dahil", en: "incl. dwells", de: "inkl. Halte" })} />
          <Field etiket={t({ tr: "Seyahat Hızı", en: "Travel Speed", de: "Reisegeschwindigkeit" })} deger={`${kmh(ortHiz).toFixed(1)}`} birim="km/h" alt={t({ tr: "bekleme dahil", en: "incl. waiting", de: "inkl. Wartezeit" })} />
          <Field etiket={t({ tr: "Teknik Hız", en: "Technical Speed", de: "technische Geschwindigkeit" })} deger={`${kmh(teknikHiz).toFixed(1)}`} birim="km/h" alt={t({ tr: "bekleme hariç", en: "excl. waiting", de: "ohne Wartezeit" })} />
          <Field etiket={t({ tr: "Azami Hız", en: "Max Speed", de: "Höchstgeschwindigkeit" })} deger={`${kmh(vmax).toFixed(0)}`} birim="km/h" />
          <Field etiket={t({ tr: "Durak", en: "Stops", de: "Haltestellen" })} deger={`${result.stationEvents.length}`} alt={`${sure(durusSuresi)} ${t({ tr: "bekleme", en: "waiting", de: "Wartezeit" })}`} />
        </div>
      </section>

      {/* Monte-Carlo gecikme analizi */}
      <section className="mt-6">
        <Panel katlanir ozet={t({ tr: "rastgele gecikmelerle robustluk", en: "robustness under random delays", de: "Robustheit bei zufälligen Verspätungen" })} baslik={t({ tr: "Monte-Carlo Gecikme Analizi (Robustluk / sağlamlık)", en: "Monte-Carlo Delay Analysis (Robustness)", de: "Monte-Carlo-Verspätungsanalyse (Robustheit)" })} aciklama={t({ tr: "Rastgele giriş gecikmesi + durak sapmalarıyla çok sayıda sefer simüle edilir; birincil gecikmelerin sonraki trenlere yayılımı ölçülür.", en: "Many services are simulated with random entry delays + dwell deviations; the propagation of primary delays to following trains is measured.", de: "Viele Fahrten werden mit zufälligen Eingangsverspätungen + Haltezeitabweichungen simuliert; die Ausbreitung von Primärverspätungen auf folgende Züge wird gemessen." })}>
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="w-36"><Num label={t({ tr: "Ort. Giriş Gecikmesi", en: "Avg. Entry Delay", de: "Durchschn. Eingangsverspätung" })} suffix={t({ tr: "sn", en: "s", de: "s" })} step={5} value={meanEntry} onChange={(v) => setMeanEntry(Math.max(0, v))} /></div>
            <div className="w-36"><Num label={t({ tr: "Ort. Durak Sapması", en: "Avg. Dwell Deviation", de: "Durchschn. Haltezeitabweichung" })} suffix={t({ tr: "sn", en: "s", de: "s" })} step={1} value={meanDwell} onChange={(v) => setMeanDwell(Math.max(0, v))} /></div>
            <button onClick={monteCarloCalistir} disabled={mcRunning}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: brand.ink }}>
              {mcRunning ? t({ tr: "Hesaplanıyor…", en: "Computing…", de: "Wird berechnet…" }) : t({ tr: "150 sefer simüle et", en: "Simulate 150 services", de: "150 Fahrten simulieren" })}
            </button>
          </div>
          {mc ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat etiket={t({ tr: "Dakiklik (≤2 dk)", en: "Punctuality (≤2 min)", de: "Pünktlichkeit (≤2 Min)" })} deger={`%${mc.onTimePct.toFixed(0)}`} alt={`${mc.trials} ${t({ tr: "deneme", en: "trials", de: "Versuche" })}`} />
                <MiniStat etiket={t({ tr: "Ort. Gecikme", en: "Avg. Delay", de: "Durchschn. Verspätung" })} deger={sure(mc.meanDelay)} />
                <MiniStat etiket={t({ tr: "P90 Gecikme", en: "P90 Delay", de: "P90-Verspätung" })} deger={sure(mc.p90Delay)} alt={t({ tr: "%90 bunun altında", en: "90% below this", de: "90 % darunter" })} />
                <MiniStat etiket={t({ tr: "En Kötü", en: "Worst", de: "Schlechtester" })} deger={sure(mc.maxDelay)} />
              </div>
              <MonteCarloGrafik mc={mc} />
            </>
          ) : (
            <p className="text-sm" style={{ color: brand.muted }}>{t({ tr: "Analizi başlatmak için butona basın.", en: "Press the button to start the analysis.", de: "Drücken Sie die Schaltfläche, um die Analyse zu starten." })}</p>
          )}
        </Panel>
      </section>
      </div>

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
  const { t } = useDil();
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
        <div className="field-label mb-1">{t({ tr: "Gecikme dağılımı —", en: "Delay distribution —", de: "Verspätungsverteilung —" })} {mc.trials} {t({ tr: "sefer ×", en: "services ×", de: "Fahrten ×" })} {n} {t({ tr: "tren örneği", en: "train samples", de: "Zugproben" })}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} role="img" aria-label={t({ tr: "Gecikme dağılımı histogramı", en: "Delay distribution histogram", de: "Histogramm der Verspätungsverteilung" })}>
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
                <title>{sure(h.alt)}–{sure(h.ust)}: %{h.oran.toFixed(1)}{gec ? t({ tr: " · geç", en: " · late", de: " · verspätet" }) : ""}</title>
              </rect>
            );
          })}
          {isaret(mc.meanDelay, t({ tr: "ort", en: "avg", de: "Ø" }), CK.ink2, T + 10)}
          {isaret(mc.threshold, t({ tr: "eşik", en: "threshold", de: "Schwelle" }), CK.amber, T + 22)}
          {isaret(mc.p90Delay, "P90", CK.red, T + 34)}
          <line x1={L} x2={L + PW} y1={T + PH} y2={T + PH} stroke={CK.muted} strokeWidth={1} />
          <text x={L} y={H - 5} textAnchor="start" fontSize={9} fill={CK.muted}>0</text>
          <text x={L + PW / 2} y={H - 5} textAnchor="middle" fontSize={9} fill={CK.muted}>{t({ tr: "varış gecikmesi →", en: "arrival delay →", de: "Ankunftsverspätung →" })}</text>
          <text x={L + PW} y={H - 5} textAnchor="end" fontSize={9} fill={CK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>{sure(maxD)}</text>
        </svg>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.65rem]" style={{ color: brand.muted }}>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: CK.blue }} /> {t({ tr: "dakik (eşik altı)", en: "on time (below threshold)", de: "pünktlich (unter Schwelle)" })}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: CK.red }} /> {t({ tr: "geç (eşik üstü)", en: "late (above threshold)", de: "verspätet (über Schwelle)" })}</span>
          <span>{t({ tr: "· çubuk = o gecikme aralığına düşen sefer oranı", en: "· bar = share of services in that delay band", de: "· Balken = Anteil der Fahrten in diesem Verspätungsbereich" })}</span>
        </div>
      </div>

      {/* Yayılım şeridi (tren sırasına göre kademe) */}
      <div>
        <div className="field-label mb-1">{t({ tr: "Tren sırasına göre yayılım — medyan ● + P90 bıyığı", en: "Propagation by train order — median ● + P90 whisker", de: "Ausbreitung nach Zugreihenfolge — Median ● + P90-Whisker" })}</div>
        <svg viewBox={`0 0 ${W2} ${H2}`} className="w-full" style={{ maxHeight: 150 }} role="img" aria-label={t({ tr: "Tren sırasına göre gecikme yayılımı", en: "Delay propagation by train order", de: "Verspätungsausbreitung nach Zugreihenfolge" })}>
          {y2Ticks.map((t, i) => (
            <g key={i}>
              <line x1={L2} x2={L2 + PW2} y1={t.y} y2={t.y} stroke={CK.grid} strokeWidth={1} />
              <text x={L2 - 5} y={t.y + 3} textAnchor="end" fontSize={9} fill={CK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>{sure(t.v)}</text>
            </g>
          ))}
          {/* eşik */}
          <line x1={L2} x2={L2 + PW2} y1={sy(mc.threshold)} y2={sy(mc.threshold)} stroke={CK.amber} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={L2 + PW2} y={sy(mc.threshold) - 3} textAnchor="end" fontSize={9} fontWeight={600} fill={CK.amber}>{t({ tr: "eşik", en: "threshold", de: "Schwelle" })}</text>
          {/* medyan trend çizgisi */}
          {n > 1 && <polyline points={mc.perTren.map((p, i) => `${sx(i)},${sy(p.p50)}`).join(" ")} fill="none" stroke={CK.blue} strokeWidth={2} />}
          {/* her tren: p50→p90 bıyık + noktalar */}
          {mc.perTren.map((p, i) => (
            <g key={i}>
              <line x1={sx(i)} x2={sx(i)} y1={sy(p.p50)} y2={sy(p.p90)} stroke={CK.blue} strokeWidth={2} opacity={0.3} />
              <circle cx={sx(i)} cy={sy(p.p90)} r={2.5} fill={CK.blue} opacity={0.5} />
              <circle cx={sx(i)} cy={sy(p.p50)} r={3.5} fill={CK.blue}>
                <title>{t({ tr: "Tren", en: "Train", de: "Zug" })} {i + 1}: {t({ tr: "medyan", en: "median", de: "Median" })} {sure(p.p50)} · P90 {sure(p.p90)}</title>
              </circle>
            </g>
          ))}
          <line x1={L2} x2={L2 + PW2} y1={T2 + PH2} y2={T2 + PH2} stroke={CK.muted} strokeWidth={1} />
          <text x={L2} y={H2 - 4} textAnchor="start" fontSize={9} fill={CK.muted}>{t({ tr: "tren 1", en: "train 1", de: "Zug 1" })}</text>
          <text x={L2 + PW2} y={H2 - 4} textAnchor="end" fontSize={9} fill={CK.muted}>{t({ tr: "tren", en: "train", de: "Zug" })} {n}</text>
          <text x={L2 + PW2 / 2} y={H2 - 4} textAnchor="middle" fontSize={9} fill={CK.muted}>{t({ tr: "sefer sırası →", en: "service order →", de: "Fahrtreihenfolge →" })}</text>
        </svg>
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

/**
 * Bildfahrplan grafiğinin altında: grafiği belirleyen girdilerin uygulamada NEREDE
 * girildiğini linkleyerek gösterir. (Tarife/Bildfahrplan verileri sistemden manuel
 * girilir → kullanıcı "bunu nereden değiştiririm?" sorusuna tek tıkla ulaşır.)
 */
function VeriKaynaklari() {
  const { t } = useDil();
  const kaydir = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    panelAcVeGit(id); // katlanır hedef panel varsa önce açar, sonra kaydırır
  };
  const link = { color: brand.ink } as const;
  return (
    <div className="mt-3 rounded-md border p-3 text-xs" style={{ borderColor: brand.border, background: CK.track, color: brand.inkSoft }}>
      <b style={{ color: brand.ink }}>{t({ tr: "Bu grafiği ne belirliyor?", en: "What determines this chart?", de: "Was bestimmt dieses Diagramm?" })}</b> {t({ tr: "Bildfahrplan tamamen aşağıdaki girdilerden türer — değiştirmek için:", en: "The Bildfahrplan derives entirely from the inputs below — to change it:", de: "Der Bildfahrplan leitet sich vollständig aus den folgenden Eingaben ab — zum Ändern:" })}
      <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
        <li>• {t({ tr: "Çizgi şekli (mesafe · hız limiti · makas geçiş hızı · viraj)", en: "Line shape (distance · speed limit · turnout transit speed · curve)", de: "Linienform (Distanz · Geschwindigkeitsbegrenzung · Weichendurchfahrtsgeschwindigkeit · Bogen)" })} → <Link href="/#ringler" className="underline" style={link}>{t({ tr: "Ringler (KUR)", en: "Rings (BUILD)", de: "Ringe (BAUEN)" })}</Link></li>
        <li>• {t({ tr: "Yatay kısımlar (istasyon duruşu / dwell · yolcu)", en: "Horizontal segments (station dwell · passengers)", de: "Waagerechte Segmente (Stationshalt / Haltezeit · Fahrgäste)" })} → <Link href="/#ringler" className="underline" style={link}>{t({ tr: "Ringler → durak yolcu", en: "Rings → stop passengers", de: "Ringe → Haltestellen-Fahrgäste" })}</Link></li>
        <li>• {t({ tr: "Çizgi sayısı & aralık (headway = çevrim ÷ filo)", en: "Line count & spacing (headway = cycle ÷ fleet)", de: "Linienanzahl & Abstand (Zugfolgezeit = Umlauf ÷ Flotte)" })} → <a href="#filo-paneli" onClick={kaydir("filo-paneli")} className="underline" style={link}>{t({ tr: "Filo & Öneri", en: "Fleet & Recommendation", de: "Flotte & Empfehlung" })}</a></li>
        <li>• {t({ tr: "Uçtaki dönüş (turnback)", en: "End turnback", de: "Wende am Ende (Turnback)" })} → <Link href="/#ringler" className="underline" style={link}>{t({ tr: "Ringler → dönüş tipi", en: "Rings → turnback type", de: "Ringe → Wendetyp" })}</Link></li>
        <li>• {t({ tr: "Hızlanma / frenleme dinamiği", en: "Acceleration / braking dynamics", de: "Beschleunigungs-/Bremsdynamik" })} → <a href="#ceken-arac" onClick={kaydir("ceken-arac")} className="underline" style={link}>{t({ tr: "Çeken Araç", en: "Traction Vehicle", de: "Triebfahrzeug" })}</a></li>
      </ul>
    </div>
  );
}


function Panel({ baslik, aciklama, children, katlanir = false, ozet, acik = false }: { baslik: string; aciklama?: string; children: React.ReactNode; katlanir?: boolean; ozet?: React.ReactNode; acik?: boolean }) {
  // Katlanır panel — native <details> (JS/state YOK → freeze yok). Varsayılan kapalı
  // (acik=true ile açık): başlıkta tek satır özet; tıkla → detay. Bilgi kaybı yok.
  if (katlanir) {
    return (
      <details className="group rounded-lg border bg-white" style={{ borderColor: brand.border }} open={acik}>
        <summary className="flex cursor-pointer select-none items-baseline gap-2 p-5">
          <span className="h-4 w-[3px] shrink-0" style={{ background: brand.red }} aria-hidden="true" />
          <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
          {ozet && <span className="ml-auto text-right text-xs" style={{ color: brand.muted }}>{ozet}</span>}
          <span className="ml-2 shrink-0 text-xs" style={{ color: brand.muted }}><span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></span>
        </summary>
        <div className="px-5 pb-5">
          <AutoAciklama metin={aciklama} className="mb-4 text-xs" style={{ color: brand.muted }} />
          {children}
        </div>
      </details>
    );
  }
  return (
    <div className="ds-card p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      <AutoAciklama metin={aciklama} className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }} />
      {children}
    </div>
  );
}
