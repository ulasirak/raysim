// raysim — MAKSİMUM TRAMVAY KAPASİTESİ (bottleneck modeli).
//
// MODEL KURALI: hat DAİMA çift hat, gidiş-dönüş çalışır. Tramvay terminale gider,
// ters döner, geri gelir, tekrar gider — durmadan bir çevrim. Tek işletim modeli.
//
//   N_max = ⌊ T_çevrim ÷ h_min ⌋        (Vuchic: filo = çevrim ÷ headway)
//
// T_çevrim = tam gidiş-dönüş = 2 × tek-yön NOMİNAL seyir + tüm dwell'ler + her
//            durakta kalkış ölü zamanı + iki terminalde (dwell + ters dönüş).
//            (ÖNEMLİ: nominal seyir — worst-case DEĞİL — h_min ile aynı zaman tabanı.)
// h_min    = iki trenin birbirini yakalamadan takip edebileceği EN KISA aralık;
//            şu kısıtların EN BÜYÜĞÜdür (bottleneck):
//   1) Kritik durak/hat bloğu Sperrzeit — blockingtime.ts (dwell + kalkış ölü zamanı + temizleme)
//   2) Terminal dönüş kapasitesi        — (terminal dwell + ters dönüş) ÷ peron, boğaz paylaşımlıysa boğaz işgali
//   3) Tek hat kesimi                   — çift yön aynı hattı paylaşır → 2 × kesim işgali
//   4) Düz kavşak (flat junction)       — karşı-yön çakışması → 2 × kavşak işgali
//
// N_teorik mutlak tavan; N_sürdürülebilir = h_min'e UIC 406 doluluk tamponu eklenmiş
// güvenli günlük değer.

import type { RollingStock } from "./types";
import { type SimConfig, type Isletme, type TerminalConfig, VARSAYILAN_DOLULUK_TAVANI } from "./config";
import { blockingTimeHesap } from "./blockingtime";
import { loopToHat } from "./hatsim";
import { ringSenaryo, ringTimingEk, type DurakArasiRing } from "./ring";

export type KisitAnahtar = "blok" | "terminal" | "tekhat" | "kavsak";

export interface KapasiteKisit {
  anahtar: KisitAnahtar;
  ad: string;        // insan-okur etiket ("Kritik durak bloğu — Alaaddin")
  headway: number;   // s — bu kısıtın dayattığı minimum aralık
  aktif: boolean;    // bağlayan (en büyük) kısıt mı?
  aciklama: string;  // kullanıcıya kısa gerekçe
}

export interface MaksimumTrenSonuc {
  gecerli: boolean;              // hesap yapılabildi mi (ring var mı)?
  hMin: number;                  // s — bağlayıcı minimum headway
  cevrimSuresi: number;          // s — tam gidiş-dönüş çevrimi (nominal)
  nTeorik: number;               // mutlak maksimum tramvay (tamponsuz)
  nSurdurulebilir: number;       // UIC 406 tamponlu güvenli maksimum
  dolulukTavani: number;         // uygulanan doluluk tavanı (0..1)
  baglayanAnahtar: KisitAnahtar; // hangi kısıt bağladı
  baglayanAd: string;            // bağlayan kısıtın etiketi
  teorikKapasiteTrenSaat: number;// 3600 / hMin (bilgi)
  kisitlar: KapasiteKisit[];     // tüm terimlerin şeffaf dökümü
}

/** Bir terminalin dayattığı minimum aralık. Peron işgali = terminal dwell + ters dönüş;
 *  peron başına bölünür. Boğaz (lead/crossover) paylaşımlıysa boğaz işgali de bağlar. */
function terminalHeadway(t: TerminalConfig): number {
  if (t.tip === "dongu") return 0; // balon döngü → dönüş beklemesi yok
  // `|| 0` — eski kayıtta eksik alanlara karşı NaN koruması.
  const peronBasi = (t.peronIsgali || 0) / Math.max(1, t.peronSayisi || 1);
  // Paylaşımlı boğaz: peron sayısı artsa da ardışık trenler tek boğazdan geçer →
  // boğaz işgali alt sınır olur (peron paralelliği boğazla tavanlanır).
  return t.bogazPaylasimli ? Math.max(peronBasi, t.bogazIsgali || 0) : peronBasi;
}

/** Düz kavşakta (karşı-yön çakışmalı makas) tek geçiş işgali (setup + geçiş + release). */
function kavsakIsgali(m: DurakArasiRing["makaslar"][number], cfg: SimConfig): number {
  const gecis = cfg.kisitGenisligi / Math.max(0.1, m.gecisHizi); // bölge genişliği / geçiş hızı
  const setup = Math.max(1, m.makasSayisi) * m.makasAdimSuresi;
  return setup + gecis + m.routeRelease;
}

export function maksimumTren(
  rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig, isletme: Isletme,
): MaksimumTrenSonuc {
  const dolulukTavani = cfg.dolulukTavani ?? VARSAYILAN_DOLULUK_TAVANI;
  if (rings.length === 0) {
    return {
      gecerli: false, hMin: 0, cevrimSuresi: 0, nTeorik: 0, nSurdurulebilir: 0, dolulukTavani,
      baglayanAnahtar: "blok", baglayanAd: "—", teorikKapasiteTrenSaat: 0, kisitlar: [],
    };
  }
  const globalSu = Math.max(0, isletme.kalkisOluZamaniSn);
  // Ring başına etkin kalkış ölü zamanı (ring.kalkisOlu > hat varsayılanı).
  const ringSu = (r: DurakArasiRing) => Math.max(0, r.kalkisOlu ?? globalSu);

  // 1) Kritik durak/hat bloğu Sperrzeit (dwell + kalkış ölü zamanı + temizleme dâhil).
  // Durak-başı kalkış ölü zamanı: her istasyon (station[i]) ring[i] üzerinden kalkar.
  const model = loopToHat(rings, false, cfg);
  const suByPos = model.line.stations.map((s, i) => ({
    pos: s.position,
    su: i < rings.length ? ringSu(rings[i]) : globalSu,
  }));
  const suResolver = (pos: number) => {
    const hit = suByPos.find((x) => Math.abs(x.pos - pos) < 1);
    return hit ? hit.su : globalSu;
  };
  const bt = blockingTimeHesap(model, stock, cfg, suResolver);
  const hBlok = bt.minHeadway;
  const kb = bt.bloklar[bt.kritikBlok];
  const kbMerkez = kb ? (kb.start + kb.end) / 2 : 0;
  const yakinDurak = model.line.stations.length
    ? model.line.stations.reduce((best, s) =>
        Math.abs(s.position - kbMerkez) < Math.abs(best.position - kbMerkez) ? s : best,
        model.line.stations[0])
    : null;
  const blokAd = `Kritik blok${yakinDurak ? ` — ${yakinDurak.name}` : ""}`;

  // 2) Terminal dönüş kapasitesi — iki uç da her zaman ters döner (gidiş-dönüş)
  const hBas = terminalHeadway(isletme.terminalBas);
  const hSon = terminalHeadway(isletme.terminalSon);
  const hTerminal = Math.max(hBas, hSon);
  const terminalAd = hBas >= hSon ? "Başlangıç terminali dönüşü" : "Bitiş terminali dönüşü";

  // 3) Tek hat kesimi (çift yön aynı hattı paylaşır → 2 × kesim işgali)
  let hTekhat = 0;
  let tekhatAd = "Tek hat kesimi";
  for (const r of rings) {
    if (!r.tekHat) continue;
    const isgal = 2 * ringSenaryo(r, stock, cfg).worstToplam;
    if (isgal > hTekhat) { hTekhat = isgal; tekhatAd = `Tek hat — ${r.ad || `${r.fromAd}–${r.toAd}`}`; }
  }

  // 4) Düz kavşak — karşı-yön çakışmalı makaslar (yüz yüze / barınma) → 2 × işgal
  let hKavsak = 0;
  let kavsakAd = "Düz kavşak çakışması";
  for (const r of rings) {
    for (const m of r.makaslar) {
      if (m.tip !== "karsilasmali" && m.tip !== "barinma") continue;
      const isgal = 2 * kavsakIsgali(m, cfg);
      if (isgal > hKavsak) { hKavsak = isgal; kavsakAd = `Kavşak — ${m.ad || r.ad || `${r.fromAd}–${r.toAd}`}`; }
    }
  }

  // Bağlayıcı h_min = kısıtların en büyüğü
  const hMin = Math.max(hBlok, hTerminal, hTekhat, hKavsak);

  // Çevrim süresi — NOMİNAL seyir (h_min ile aynı taban) + dwell + her durakta kalkış
  // ölü zamanı (ring başına); iki yön (×2) + iki terminalde peron işgal süresi.
  let tekYon = 0;
  for (const r of rings) {
    const sn = ringSenaryo(r, stock, cfg);
    tekYon += sn.nominalSeyir + ringTimingEk(r) + r.dwell + ringSu(r);
  }
  const terminalCevrim = (t: TerminalConfig) => (t.tip === "dongu" ? 0 : (t.peronIsgali || 0));
  const terminalToplam = terminalCevrim(isletme.terminalBas) + terminalCevrim(isletme.terminalSon);
  const cevrimSuresi = 2 * tekYon + terminalToplam;

  const nTeorik = hMin > 0 ? Math.max(1, Math.floor(cevrimSuresi / hMin)) : 1;
  const hMinSurd = dolulukTavani > 0 ? hMin / dolulukTavani : hMin;
  const nSurdurulebilir = hMinSurd > 0 ? Math.max(1, Math.floor(cevrimSuresi / hMinSurd)) : 1;

  const kisitlar: KapasiteKisit[] = [
    { anahtar: "blok", ad: blokAd, headway: hBlok, aktif: hMin === hBlok,
      aciklama: "En sıkışık durak/hat bloğunun rezerve süresi (Sperrzeit) — dwell + kalkış ölü zamanı + temizleme dâhil." },
    { anahtar: "terminal", ad: terminalAd, headway: hTerminal, aktif: hMin === hTerminal && hTerminal > 0,
      aciklama: "Terminalde peron başına ardışık dönüş = peron işgal süresi ÷ peron; boğaz paylaşımlıysa boğaz işgali de bağlar." },
  ];
  if (hTekhat > 0) {
    kisitlar.push({ anahtar: "tekhat", ad: tekhatAd, headway: hTekhat, aktif: hMin === hTekhat,
      aciklama: "Tek hatlı kesimde çift yön aynı hattı paylaşır → tek anda tek tren (2 × kesim işgali)." });
  }
  if (hKavsak > 0) {
    kisitlar.push({ anahtar: "kavsak", ad: kavsakAd, headway: hKavsak, aktif: hMin === hKavsak,
      aciklama: "Düz kavşakta karşı-yön hareketleri çakışır → kavşak sırayla kullanılır (2 × kavşak işgali)." });
  }
  const baglayan = kisitlar.find((k) => k.aktif) ?? kisitlar[0];

  return {
    gecerli: true,
    hMin,
    cevrimSuresi,
    nTeorik,
    nSurdurulebilir,
    dolulukTavani,
    baglayanAnahtar: baglayan.anahtar,
    baglayanAd: baglayan.ad,
    teorikKapasiteTrenSaat: hMin > 0 ? 3600 / hMin : 0,
    kisitlar,
  };
}
