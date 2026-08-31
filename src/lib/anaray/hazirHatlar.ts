// raysim — HAZIR KONYA HATLARI (sunum taslakları).
//
// Üç gerçek Konya tramvay hattının, uygulamanın tüm modüllerine (Ringler / Sefer /
// Sistem / Belgeler) doğrudan hizmet edecek KALICI veri kümeleri. Yönetici
// hesabına `/api/proje/hazir` üzerinden (Admin SDK, idempotent) seed edilir.
//
// Veri kaynağı ve doğruluk düzeyi:
//   ① Mevcut Hat (T1 · Alaaddin–Selçuk Üniv.): duraklar arası mesafeler GERÇEKTİR —
//      OpenStreetMap istasyon koordinatlarından (haversine) hesaplandı (~19,4 km,
//      yayımlanan ~21 km hat uzunluğuyla uyumlu; fark ray eğrilerinden).
//   ② 1. Etap (Yeni Sanayi–Şehir Hastanesi) ve ③ 2. Etap (Yeni Sanayi–Stadyum):
//      istasyon ADLARI ve TOPLAM uzunluk gerçektir (Konya Büyükşehir / AYGM);
//      duraklar arası mesafeler kamuya açık DEĞİLDİR → toplam uzunluk durak
//      sayısına eşit paylaştırılmıştır ("planlanan"; resmî projeden teyit edilecek).
//
// Sinyalizasyon öğeleri (makas/geçit) mühendislik varsayılanlarıyla
// (MAZ-VA-AKS-001 türevleri) mantıklı noktalara yerleştirilir: uçlarda U-dönüş,
// başlangıçta depo bağlantısı, aktarma/kavşak duraklarında makas, seçili
// kesimlerde hemzemin karayolu geçidi.

import {
  yeniRing, yeniMakas, yeniHemzemin, yeniSinyal,
  type DurakArasiRing, type MakasTip, type HemzeminTip,
} from "./ring";
import { varsayilanConfig, varsayilanMeta, varsayilanIsletme, VARSAYILAN_TERMINAL, type ProjeMeta, type TerminalConfig } from "./config";
import type { RollingStock } from "./types";
import type { ProjeVerisi } from "../projeler";

const KMH = 1 / 3.6;

/** Konya filosu — Škoda ForCity Classic 28T (32,52 m, 364 yolcu, 70 km/h, 750V DC). */
const SKODA_28T: RollingStock = {
  id: "skoda-28t",
  name: "Škoda ForCity Classic 28T",
  mass: 41_500,              // kg (tam yükte ~ tare 41,5 t)
  rotatingMassFactor: 0.08,
  length: 32.52,             // m (üretici verisi)
  maxSpeed: 70 * KMH,        // 70 km/h
  startingTractiveEffort: 46_000, // N
  power: 480_000,            // W (4×120 kW)
  maxBraking: 1.2,           // m/s²
  davisA: 2500, davisB: 30, davisC: 6,
};

// ————————————————————————————————————————————————
// Ring zinciri kurucu
// ————————————————————————————————————————————————

interface RingEk {
  /** Bu ring hangi durağa GİDİYOR (index). Uç/kavşak/depo işaretleri buradan.
   *  `sayi`: CAD'deki ardışık makas (point machine) adedi — ör. Alaaddin yelpazesi
   *  4 (PM1/PM2/PM3/PM80). `hizKmh`: CAD geometrisinden/şartnameden geçiş hızı. */
  makas?: { tip: MakasTip; konumOran: number; sayi?: number; hizKmh?: number; crossover?: "s" | "x" }[];
  hemzemin?: { tip: HemzeminTip; konumOran: number }[];
  dwell?: number;
  depot?: boolean;
  fromDepot?: boolean;
}

/**
 * Sıralı durak adları + ardışık mesafelerden (m) ring zinciri kurar.
 * `ekler[i]` = i. ringe (i. duraktan i+1. durağa) eklenecek sinyalizasyon öğeleri.
 */
function hatKur(
  duraklar: string[],
  mesafeler: number[],
  ekler: Record<number, RingEk> = {},
): DurakArasiRing[] {
  const rings: DurakArasiRing[] = [];
  for (let i = 0; i < duraklar.length - 1; i++) {
    const uz = Math.max(50, Math.round(mesafeler[i] ?? 800));
    const r = yeniRing(duraklar[i], duraklar[i + 1]);
    r.uzunluk = uz;
    r.worstUzunluk = Math.max(uz, Math.round(uz * 1.25));
    r.bestUzunluk = Math.max(50, Math.min(uz, Math.round(uz * 0.7)));
    const ek = ekler[i];
    if (ek) {
      if (ek.dwell != null) r.dwell = ek.dwell;
      if (ek.depot) r.depot = true;
      if (ek.fromDepot) { r.fromDepot = true; r.fromQueued = 2; }
      for (const m of ek.makas ?? []) {
        const konum = Math.round(Math.min(uz, Math.max(0, uz * m.konumOran)));
        const mk = yeniMakas(m.tip, konum);
        if (m.sayi != null) mk.makasSayisi = m.sayi;               // CAD point-machine adedi
        if (m.hizKmh != null) mk.gecisHizi = m.hizKmh / 3.6;       // km/h → m/s
        if (m.crossover != null) mk.crossover = m.crossover;       // S (tek) / X (scissors)
        r.makaslar.push(mk);
      }
      for (const h of ek.hemzemin ?? []) {
        const konum = Math.round(Math.min(uz, Math.max(0, uz * h.konumOran)));
        r.hemzeminler.push(yeniHemzemin(h.tip, konum));
      }
    }
    rings.push(r);
  }
  return rings;
}

/** Terminal dönüş makası sayıları override'ı — gerçek CAD/kullanıcı verisinden.
 *  Her S (tek crossover) = 1 dönüş yolu; her X (scissors) = 2 yol. Ör. term(2,1) = 2 S + 1 X. */
function term(sMakas: number, xMakas: number): TerminalConfig {
  return { ...VARSAYILAN_TERMINAL, sMakas, xMakas };
}

function meta(p: Partial<ProjeMeta>): ProjeMeta {
  return { ...varsayilanMeta, ...p };
}

/**
 * Bir ring zincirini TERS yönde kurar (A→B→C  ⇒  C→B→A). Bütünleşik hat için:
 * Etap1 (Aslım→Adliye) ve Etap2 (Stadyum→Aslım) ters çevrilip Mevcut hattın
 * (Alaaddin→Adliye) ucuna eklenir. Ring başına ölçülen konumlar (makas/geçit)
 * ring içinde aynalanır (konum → uzunluk − konum); depo/başlangıç bayrakları
 * düşer (birleşik hatta yalnız uçlar terminüstür). Yeni id'lerle klonlanır —
 * kaynak etap taslakları BOZULMAZ.
 */
function tersRingZinciri(rings: DurakArasiRing[]): DurakArasiRing[] {
  return rings.slice().reverse().map((r) => {
    const ayna = <T extends { id: string; konum: number }>(x: T): T =>
      ({ ...x, id: x.id + "-r", konum: Math.max(0, Math.min(r.uzunluk, Math.round(r.uzunluk - x.konum))) });
    return {
      ...r,
      id: r.id + "-r",
      fromStationId: r.toStationId, toStationId: r.fromStationId,
      fromAd: r.toAd, toAd: r.fromAd,
      depot: false, fromDepot: false, queued: 0, fromQueued: 0,
      makaslar: r.makaslar.map(ayna),
      hemzeminler: r.hemzeminler.map(ayna),
      tehlikeNoktalari: r.tehlikeNoktalari.map(ayna),
      // Sinyaller: konum aynalanır + yön ters çevrilir (giden↔gelen) çünkü hat ters kuruluyor.
      sinyaller: (r.sinyaller ?? []).map((s) => ({ ...ayna(s), yon: s.yon === "giden" ? "gelen" as const : "giden" as const })),
    };
  });
}

// ————————————————————————————————————————————————
// SİNYAL LAMBASI (SG) METRAJLARI — Sinyalizasyon Projesi V0808 (Aslan Sinyalizasyon)
// ————————————————————————————————————————————————
// Kaynak: "Sinyalizasyon Projesi V0808.pdf" saha yerleşim çizimleri (SG = Signal Lamp).
// Her değer hat başından MUTLAK kilometraj (m); PDF kilometrajı mevcut CAD
// kilometrajıyla birebir örtüşür (aynı proje CAD'i). Sinyaller istasyon başına çift
// gelir (iki yön home sinyali) + kavşaklarda makas koruma sinyalleri; yerleştirmede
// km'ye göre sıralanıp DÖNÜŞÜMLÜ giden/gelen atanır. Bütünleşik hat, sinyalleri etap
// ringlerinden `tersRingZinciri` ile AYNALAYARAK + yön çevirerek otomatik devralır.
//
// Mevcut hat (Alaattin 0 → Adliye 5200):
const SG_MEVCUT_KM = [
  0, 54, 265, 330, 340,          // Hükümet (SG1–5)
  1018, 1115, 1201, 1211,        // Mevlana (SG6–9)
  1840, 1905, 2025, 2085,        // Mevlana Kültür Merkezi (SG10–13)
  2840, 2890,                    // Fetih (SG14–15)
  3710, 3748,                    // Spor ve Kongre Merkezi (SG16–17)
  4252, 4332,                    // Karşehir (SG18–19)
  4920, 4980, 5138, 5148,        // Adliye (SG20,21,24,23)
];
// Etap hattı MUTLAK km (Stadyum 0 → Aslım Sanayi 8621 → Adliye ~20354):
const SG_ETAP_KM = [
  78, 83,                        // İst1  Stadyum (SG78–79)
  462, 542, 552,                 // İst2  (SG75–77)
  1199, 1280, 1542,              // İst3  (SG72–74)
  2172, 2256,                    // İst4  (SG70–71)
  2971, 3178,                    // İst5  (SG68–69)
  3655, 3987, 4141,              // İst6  (SG65–67)
  5322, 5410,                    // İst7  (SG63–64)
  6505, 6592,                    // İst8  (SG61–62)
  7463, 7593, 7608, 7665, 7883,  // İst9  (SG56–60)
  8510, 8708,                    // İst10 Aslım Sanayi (SG54–55)
  9793, 9865, 10060,             // İst11 Ravza (SG51–53)
  11115, 11315,                  // İst12 (SG49–50)
  11905, 12095,                  // İst13 (SG47–48)
  13343, 13555,                  // İst14 (SG45–46)
  14620, 14835,                  // İst16 (SG43–44)  [İst15 sinyalsiz]
  15734, 16664, 16669,           // İst17 Depo (SG40–42)
  16620, 16820, 16830,           // İst18 (SG37–39)
  17692, 17889,                  // İst19 (SG35–36)
  18505, 18515, 18575,           // İst20 (SG32–34)
  19375, 19412, 19412, 19501, 19545, 19692, 19735, // İst21 Şehir Hastanesi (SG25–31)
  20683,                         // Adliye kavşağı HAT1 tarafı (SG22)
];
const ASLIM_KM = 8621; // Etap2 (0..8621) / Etap1 (8621..) sınırı = Aslım Sanayi mutlak km

/**
 * Verilen ring zincirine, MUTLAK kilometraj listesindeki sinyalleri yerleştirir.
 * Her km, düştüğü ringe (istasyon-arası hücre) atanır; ring içi konum = km − ringBaşı.
 * Hat dışına düşen km atlanır (segment filtreleme çağrı tarafında). Sinyaller km'ye
 * göre sıralanıp dönüşümlü giden/gelen atanır (istasyon çifti = 2 yön home sinyali).
 */
function sinyalYerlestir(rings: DurakArasiRing[], kmListesi: number[]): void {
  if (rings.length === 0) return;
  const baslangic: number[] = [];
  let acc = 0;
  for (const r of rings) { baslangic.push(acc); acc += r.uzunluk; }
  const toplamUz = acc;
  [...kmListesi].sort((a, b) => a - b).forEach((km, i) => {
    if (km < -1 || km > toplamUz + 1) return; // segment dışı → atla
    let ri = 0;
    for (let k = 0; k < rings.length; k++) { if (km >= baslangic[k] - 1e-6) ri = k; }
    const konum = Math.max(0, Math.min(rings[ri].uzunluk, Math.round(km - baslangic[ri])));
    const yon = i % 2 === 0 ? "giden" as const : "gelen" as const;
    (rings[ri].sinyaller ??= []).push(yeniSinyal(yon, konum));
  });
}

// ————————————————————————————————————————————————
// ① MEVCUT HAT — Alaaddin – Adliye koridoru (GERÇEK CAD kilometrajı)
// ————————————————————————————————————————————————
// Kaynak: karşı tarafın AutoCAD projesi (Alaaddin-Etap1-2-depo_v11 "Mevcut Hat").
// İstasyon İSTASYONU markörlerinin gerçek UTM konumları, CAD'in km-stationing
// grid'ine (C-ROAD-STAN) izdüşürülerek her istasyonun GERÇEK kilometrajı çıkarıldı
// (izdüşüm sapması iç istasyonlarda ≤ 10 m). Mesafeler bu kilometrajların farkıdır.
//   Alaattin 0+000 · Hükümet 0+261 · Mevlana 1+142 · Mevlana K.M. 1+841 ·
//   Fetih 2+847 · Spor ve Kongre Merkezi 3+718 · Karşehir 4+282 · Adliye 5+200
// NOT: 6. ve 7. durak adları işletme adlarıyla (Spor ve Kongre Merkezi / Karşehir)
// kullanılır; CAD İSTASYONU markörleri bu iki noktada "Üniversite"/"Samanpazarı"
// yazsa da işletmede güncel adlar bunlardır (kilometraj/konum aynı).
const T1_DURAK = [
  "Alaattin", "Hükümet", "Mevlana", "Mevlana Kültür Merkezi",
  "Fetih", "Spor ve Kongre Merkezi", "Karşehir", "Adliye",
];
// GERÇEK durak arası mesafeler (m) — CAD kilometrajı farklarından.
const T1_MESAFE = [261, 881, 699, 1006, 871, 564, 918];

// Alaaddin kavşağı (çok makaslı yelpaze — CAD'de T/O 1/6 R50 & R100 makaslar) ve
// Adliye ucu U-dönüşü. Makas tipleri projeden: 1/6 tanjant, R50/R100 yarıçap.
// Mevlana ve Mevlana Kültür Merkezi'nde de karşılaşmalı makas (crossover) vardır —
// CAD'de her ikisinde de T/O 1/6 R100 LH makas çifti: Mevlana ~(456461/456502),
// MKM ~(457473/457513). Bu makaslar, Fetih notundaki "makas üzerinden U dönüşüyle
// Alaaddin bölgesine dönüş" manevrasını sağlar.
// CAD İki bağımsız katmanla DOĞRULANDI: (a) geometrik T/O makas markörleri,
// (b) enterlok şemasındaki point-machine'ler (PM). Eşleşme:
//   Alaaddin  → 4 makas (2×T/O R50 + 2×T/O R100) · PM1/PM2/PM3/PM80 — dönüş yelpazesi
//   Mevlana   → 2×T/O R100 LH · PM4/PM5 — crossover
//   MKM       → 2×T/O R100 LH · PM6/PM7 — crossover
//   Adliye    → 2×T/O R100 (RH+LH) · PM8/PM9 — U-dönüş crossover
//   Hükümet   → 1 S-makas (kullanıcı teyidi: orada makas VAR — şema PM'i göstermese de kalıyor)
//   Fetih/Spor ve Kongre/Karşehir → makas YOK (şemada PM yok). EKSİKSİZ.
// Geçiş hızı 15 km/h = Şartname 3.4.8.2 (varsayılan vMakas) — R50 en dar yarıçapı
// yönetir; CAD hız sayısı vermez, geometri (R50/R100·1/6) verir.
const T1_EK: Record<number, RingEk> = {
  0: { fromDepot: true, makas: [{ tip: "karsilasmali", konumOran: 0.3, sayi: 2, crossover: "s" }, { tip: "karsilasmali", konumOran: 0.33, sayi: 1, crossover: "x" }], dwell: 40 }, // Alaaddin dönüş yelpazesi — 2 S + 1 X (kullanıcı)
  1: { makas: [{ tip: "karsilasmali", konumOran: 0.06, sayi: 1, crossover: "s" }] },             // Hükümet — 1 S-makas (kullanıcı teyidi: makas VAR)
  2: { makas: [{ tip: "karsilasmali", konumOran: 0.08, sayi: 1, crossover: "s" }] },             // Mevlana — 1 S-makas (CAD: PM4/PM5 = S-makasın 2 motoru)
  3: { makas: [{ tip: "karsilasmali", konumOran: 0.08, sayi: 1, crossover: "s" }],
       hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },                                       // MKM — 1 S-makas (CAD: PM6/PM7 = S-makasın 2 motoru) + karayolu
  6: { makas: [{ tip: "udonus", konumOran: 0.75, sayi: 1, crossover: "s" }], dwell: 45 },        // Adliye U-dönüş — 1 S (kullanıcı)
};

// ————————————————————————————————————————————————
// Birleşik hat GERÇEK verisi (CAD) — U1..U22 · Stadyum → Adliye
// ————————————————————————————————————————————————
// Kaynak: karşı tarafın AutoCAD projesi + resmi istasyon adı cetveli (U1–U22).
// İstasyon adları cetvelden; kilometrajlar CAD enterlok diyagramının MK_KM
// (sinyal-eleman kilometrajı) katmanından, her istasyonun diyagram konumuna
// izdüşürülerek çıkarıldı. Doğrulama: cetvelde U17=DEPO, diyagramda "istasyon 17
// = depo girişi" → numaralandırma birebir (istasyon N = U-N).
//
// Etap sınırı TÜMOSAN/Aslım kavşağı (Yeni Sanayi bölgesi): Etap2 = U1..U10
// (Stadyum→Aslım Sanayi, ~8,6 km), Etap1 = U10..U22 (Aslım→Şehir Hastanesi→Adliye).

// ② 1. ETAP — Aslım Sanayi → Şehir Hastanesi → Adliye (Konya Büyükşehir)
const ETAP1_DURAK = [
  "Aslım Sanayi", "Ravza Camii", "Gülistan Caddesi", "Motorlu Taşıtlar Sanayisi",
  "Büsan Sanayi", "Hüdai", "Sedirler Kavşağı", "Depo", "Şehir Parkı",
  "Ereğli Kavşağı", "Rezerv İstasyonu", "Şehir Hastanesi", "Adliye (Lise/Okullar)",
];
// GERÇEK durak arası mesafeler (m) — CAD kilometrajı (U10→U21). Son (U21→U22 Adliye)
// diyagramda ayrı kol olduğundan ~900 m tahmini.
const ETAP1_MESAFE = [1344, 1232, 787, 1444, 459, 767, 1050, 1008, 1068, 637, 1037, 900];

// ③ 2. ETAP — Stadyum → Aslım Sanayi (AYGM)
const ETAP2_DURAK = [
  "Stadyum", "Barış Caddesi", "Selçuklu Belediyesi", "Otogar", "Yurtlar Bölgesi",
  "Betoncular", "Banliyö Aktarma", "TÜYAP", "TÜMOSAN", "Aslım Sanayi",
];
// GERÇEK durak arası mesafeler (m) — CAD kilometrajı (U1→U10).
const ETAP2_MESAFE = [413, 762, 880, 853, 1011, 1446, 1137, 1062, 1057];

// ————————————————————————————————————————————————
// Kamu API'si
// ————————————————————————————————————————————————

// Hazır-hat verisinin SÜRÜMÜ. Resmî taslak verisi (durak adı, kilometraj, makas…)
// her düzeltildiğinde ARTIRILIR → seed, yöneticinin hesabındaki mevcut hazır
// taslakları bu yeni sürüme bir kez tazeler (kullanıcının kendi oluşturduğu
// projelere DOKUNMAZ; yalnız `hazir_<key>_<uid>` taslakları).
// v3: mevcut hat 6/7. durak işletme adları + Mevlana/MKM crossover.
// v4: tam CAD makas denetimi — Alaaddin yelpaze sayı=4; Etap1'e Ravza (U11),
//     Etap2'ye Otogar (U4)+Betoncular (U6) makası; CAD'de olmayan Banliyö (U7)
//     barınması kaldırıldı; makas point-machine sayıları CAD'den.
// v5: künye düzeltmesi — üç hatta da İdare = AYGM, Müşavir = EMAY, Yüklenici =
//     Uğursal–ABU İş Ortaklığı (gerçek proje tarafları).
// v6: sunum modu — üç hat da onaylı/kesinleşmiş tasarım olarak sunulur (rapor ve
//     arayüzde challenge/risk bayrakları, denge sapması ve "ihlal" işaretleri gizli).
// v7: sinyalizasyon firması = Aslan Sinyalizasyon (üç hatta da).
// v8: 4. hat — Bütünleşik Hat (Alaaddin–Stadyum), üç etap tek sürekli hatta birleşik.
// v9: makas S/X crossover geometrisi + terminal makas sayıları (gerçek CAD/kullanıcı verisi).
export const HAZIR_VERI_SURUM = 11; // v11: makas dizilimi kullanıcı teyidiyle güncellendi (Alaattin 2S+1X, Adliye 1S, Ravza/Otogar/Betoncular 1S, Depo 2S) → kayıtlı projeler yeniden seed'lenir
// NOT (model): makasSayisi = MAKAS ADEDİ (S/X), makas MOTORU değil. Her makas ya S-makas (2 motor)
// ya X-makas (4 motor); motor sayısı içseldir, raporda gösterilmez. CAD'den okurken yakın 2 motor
// = 1 S-makas, yakın 4 motor = 1 X-makas.

export interface HazirHat {
  key: "mevcut" | "etap1" | "etap2" | "birlesik";
  ad: string;
  veri: ProjeVerisi;
}

export function hazirHatlar(): HazirHat[] {
  const cfg = { ...varsayilanConfig };

  // ① Mevcut Hat
  const mevcutRings = hatKur(T1_DURAK, T1_MESAFE, T1_EK);
  sinyalYerlestir(mevcutRings, SG_MEVCUT_KM); // SG1–24 (V0808)
  const mevcut: HazirHat = {
    key: "mevcut",
    ad: "Konya Mevcut Hat — Alaaddin–Adliye (CAD)",
    veri: {
      rings: mevcutRings, cfg, arac: SKODA_28T,
      // Alaaddin dönüş yelpazesi (2 S crossover) · Adliye U-dönüş 2 S (kullanıcı: Adliye 2 tane S)
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 8, turnaroundDk: 4, terminalBas: term(2, 1), terminalSon: term(2, 0) },
      meta: meta({
        projeAdi: "Konya Tramvay — Mevcut Hat (Alaaddin–Adliye) Sinyalizasyon",
        hatAdi: "Alaaddin – Adliye (5,2 km · 8 istasyon)",
        idare: "T.C. Ulaştırma ve Altyapı Bakanlığı · AYGM",
        yuklenici: "Uğursal Elektrik – ABU Yapı İş Ortaklığı",
        musavir: "EMAY Uluslararası Mühendislik ve Müşavirlik A.Ş.",
        sinyalizasyonFirmasi: "Aslan Sinyalizasyon",
        dokumanNo: "KNY-MEV-AKS-001",
        revizyon: "v5.0 — GERÇEK CAD kilometrajı + makas enterlok denetimi (PM1–PM9); durak adları işletme (Spor ve Kongre M., Karşehir) + SG sinyal lambaları (Sinyalizasyon Projesi V0808, gerçek metraj)",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
        sunumModu: true,
      }),
    },
  };

  // ② 1. Etap — U10..U22 (Aslım Sanayi → Şehir Hastanesi → Adliye)
  // Makaslar enterlok şeması point-machine'lerinden (PM) doğrulandı:
  //   U10 Aslım/TÜMOSAN kavşağı  PM26–29 · U11 Ravza Camii crossover PM24/PM25 ·
  //   U17 DEPO merdiveni PM18–23+PM38–41 · U21/U22 Şehir Hast.–Adliye dönüş fanı PM10–17.
  const etap1Ek: Record<number, RingEk> = {
    0: { fromDepot: true, makas: [{ tip: "karsilasmali", konumOran: 0.2, sayi: 2, crossover: "s" }], dwell: 40 }, // U10 Aslım/TÜMOSAN kavşağı (2 S)
    1: { makas: [{ tip: "karsilasmali", konumOran: 0.06, sayi: 1, crossover: "s" }] },            // U11 Ravza Camii — 1 S (kullanıcı)
    6: { hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },                                       // U16 Sedirler Kavşağı
    7: { makas: [{ tip: "depo", konumOran: 0.6, sayi: 2, crossover: "s" }] },                     // U17 DEPO — 2 S (kullanıcı)
    // U21/U22 Şehir Hastanesi–Adliye dönüş fanı (PM10–17): Şehir Hastanesi 2 S + 1 X (kullanıcı) + Adliye 2 S
    11: { makas: [
      { tip: "udonus", konumOran: 0.08, sayi: 1, crossover: "x" },   // Şehir Hastanesi scissors (1 X)
      { tip: "udonus", konumOran: 0.14, sayi: 1, crossover: "s" },   // Şehir Hastanesi S #1
      { tip: "udonus", konumOran: 0.20, sayi: 1, crossover: "s" },   // Şehir Hastanesi S #2
      // Adliye makası mevcut hat tarafında (T1_EK[6], 1 S) — Bütünleşik'te tek sayılır (kullanıcı: Adliye 1)
    ], dwell: 45 },
  };
  const etap1Rings = hatKur(ETAP1_DURAK, ETAP1_MESAFE, etap1Ek);
  // Etap1 = Aslım(8621)→Adliye; MUTLAK km'yi Aslım offset'iyle yerele çevir (İst10–İst22 + SG22).
  sinyalYerlestir(etap1Rings, SG_ETAP_KM.filter((km) => km >= ASLIM_KM - 200).map((km) => km - ASLIM_KM));
  const etap1: HazirHat = {
    key: "etap1",
    ad: "Konya Tramvay 1. Etap — Aslım Sanayi–Şehir Hastanesi (CAD)",
    veri: {
      rings: etap1Rings, cfg, arac: SKODA_28T,
      // Aslım/TÜMOSAN kavşağı (2 S) · U21/U22 Şehir Hastanesi–Adliye dönüş fanı = 2 S + 1 X (kullanıcı: Hastane 2 S + 1 X)
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 6, turnaroundDk: 4, terminalBas: term(2, 0), terminalSon: term(2, 1) },
      meta: meta({
        projeAdi: "Konya Tramvay 1. Etap Sinyalizasyon (Aslım Sanayi–Şehir Hastanesi–Adliye)",
        hatAdi: "1. Etap · U10 Aslım Sanayi – U22 Adliye (~10,8 km · 13 istasyon)",
        idare: "T.C. Ulaştırma ve Altyapı Bakanlığı · AYGM",
        yuklenici: "Uğursal Elektrik – ABU Yapı İş Ortaklığı",
        musavir: "EMAY Uluslararası Mühendislik ve Müşavirlik A.Ş.",
        sinyalizasyonFirmasi: "Aslan Sinyalizasyon",
        dokumanNo: "KNY-E1-AKS-001",
        revizyon: "v5.0 — CAD adları (U10–U22) + kilometrajı + makas PM denetimi; U21→U22 tahmini + SG sinyal lambaları (V0808, İst11–İst21 gerçek metraj)",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
        sunumModu: true,
      }),
    },
  };

  // ③ 2. Etap — U1..U10 (Stadyum → Aslım Sanayi)
  // Makaslar İKİ CAD katmanıyla eşlendi — geometrik MAKAS_KOD (M1–M28) + enterlok PM:
  //   U1 Stadyum terminus yelpazesi M1–M8 · U4 Otogar kavşağı M9/M10 ·
  //   U6 Betoncular crossover PM30–32 · U9 TÜMOSAN/Aslım kavşağı M11–14/PM26–29.
  //   U7 Banliyö ve U8 TÜYAP'ta makas YOK (ne M-kod ne PM) → önceki barınma kaldırıldı;
  //   Banliyö yalnız aktarma beklemesi (dwell) taşır (KONYARAY ile yaya aktarması).
  const etap2Ek: Record<number, RingEk> = {
    // U1 Stadyum terminus yelpazesi M1–M8 — büyük fan: 2 S + 1 X
    0: { makas: [
      { tip: "udonus", konumOran: 0.22, sayi: 1, crossover: "x" },  // Stadyum scissors (1 X)
      { tip: "udonus", konumOran: 0.28, sayi: 1, crossover: "s" },  // Stadyum S #1
      { tip: "udonus", konumOran: 0.34, sayi: 1, crossover: "s" },  // Stadyum S #2
    ], dwell: 50 },
    3: { makas: [{ tip: "karsilasmali", konumOran: 0.12, sayi: 1, crossover: "s" }],
         hemzemin: [{ tip: "karayolu", konumOran: 0.55 }] },                                      // U4 Otogar kavşağı (M9/M10) + karayolu
    5: { makas: [{ tip: "karsilasmali", konumOran: 0.06, sayi: 1, crossover: "s" }] },            // U6 Betoncular — 1 S (kullanıcı)
    6: { dwell: 30 },                                                                             // U7 Banliyö Aktarma — makas YOK, aktarma beklemesi
    8: { fromDepot: false, makas: [{ tip: "karsilasmali", konumOran: 0.8, sayi: 2, crossover: "s" }], dwell: 40 },// U9 TÜMOSAN kavşağı (M11–14/PM26–29)
  };
  const etap2Rings = hatKur(ETAP2_DURAK, ETAP2_MESAFE, etap2Ek);
  // Etap2 = Stadyum(0)→Aslım(8621); MUTLAK km = yerel (İst1–İst10).
  sinyalYerlestir(etap2Rings, SG_ETAP_KM.filter((km) => km <= 8750));
  const etap2: HazirHat = {
    key: "etap2",
    ad: "Konya Tramvay 2. Etap — Stadyum–Aslım Sanayi (CAD)",
    veri: {
      rings: etap2Rings, cfg, arac: SKODA_28T,
      // U1 Stadyum terminus yelpazesi M1-M8 (büyük fan) = 2 S + 1 X · U9 TÜMOSAN/Aslım kavşağı = 2 S
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 6, turnaroundDk: 4, terminalBas: term(2, 1), terminalSon: term(2, 0) },
      meta: meta({
        projeAdi: "Konya Tramvay 2. Etap Sinyalizasyon (Stadyum–Aslım Sanayi)",
        hatAdi: "2. Etap · U1 Stadyum – U10 Aslım Sanayi (~8,6 km · 10 istasyon)",
        idare: "T.C. Ulaştırma ve Altyapı Bakanlığı · AYGM",
        yuklenici: "Uğursal Elektrik – ABU Yapı İş Ortaklığı",
        musavir: "EMAY Uluslararası Mühendislik ve Müşavirlik A.Ş.",
        sinyalizasyonFirmasi: "Aslan Sinyalizasyon",
        dokumanNo: "KNY-E2-AKS-001",
        revizyon: "v5.0 — CAD adları (U1–U10) + kilometrajı + makas denetimi (M-kod+PM; Banliyö-TÜYAP makassız) + SG sinyal lambaları (V0808, İst1–İst10 gerçek metraj)",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
        sunumModu: true,
      }),
    },
  };

  // ④ BÜTÜNLEŞİK HAT — Alaaddin → Stadyum (üç etabı tek sürekli hatta birleştirir).
  // Güzergâh: Mevcut (Alaaddin→Adliye) + 1.Etap TERS (Adliye→Aslım) + 2.Etap TERS
  // (Aslım→Stadyum). Adliye ve Aslım Sanayi KAVŞAK istasyonları tek kez görünür
  // (ringDuraklari uç istasyonu paylaşır → çift yok). İki uçta dönüş yelpazesi
  // (Alaaddin başlangıç, Stadyum terminüs U-dönüşü); ara kavşaklarda crossover.
  // Gerçek CAD kilometrajı korunur (etap mesafeleri ters sırayla eklenir).
  const birlesikRings = [...mevcutRings, ...tersRingZinciri(etap1Rings), ...tersRingZinciri(etap2Rings)];
  const birlesik: HazirHat = {
    key: "birlesik",
    ad: "Konya Tramvay — Bütünleşik Hat (Alaaddin–Stadyum) (CAD)",
    veri: {
      rings: birlesikRings, cfg, arac: SKODA_28T,
      // Alaaddin yelpaze (2 S) · Stadyum terminus yelpazesi = 2 S + 1 X (Adliye & Aslım artık ara kavşak)
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 10, turnaroundDk: 5, terminalBas: term(2, 1), terminalSon: term(2, 1) },
      meta: meta({
        projeAdi: "Konya Tramvay — Bütünleşik Hat (Alaaddin–Stadyum) Sinyalizasyon",
        hatAdi: "Alaaddin – Stadyum (~25,5 km · 29 istasyon · Adliye & Aslım kavşaklı)",
        idare: "T.C. Ulaştırma ve Altyapı Bakanlığı · AYGM",
        yuklenici: "Uğursal Elektrik – ABU Yapı İş Ortaklığı",
        musavir: "EMAY Uluslararası Mühendislik ve Müşavirlik A.Ş.",
        sinyalizasyonFirmasi: "Aslan Sinyalizasyon",
        dokumanNo: "KNY-BUT-AKS-001",
        revizyon: "v2.0 — Mevcut + 1.Etap (ters) + 2.Etap (ters) bütünleşik; Adliye & Aslım kavşak birleşimi; CAD kilometrajı korunur + SG sinyal lambaları etaplardan aynalanarak devralınır (V0808, ~78 sinyal)",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
        sunumModu: true,
      }),
    },
  };

  return [mevcut, etap1, etap2, birlesik];
}
