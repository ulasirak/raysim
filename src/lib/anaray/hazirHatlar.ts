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
  yeniRing, yeniMakas, yeniHemzemin,
  type DurakArasiRing, type MakasTip, type HemzeminTip,
} from "./ring";
import { varsayilanConfig, varsayilanMeta, varsayilanIsletme, type ProjeMeta } from "./config";
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
  makas?: { tip: MakasTip; konumOran: number; sayi?: number; hizKmh?: number }[];
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

function meta(p: Partial<ProjeMeta>): ProjeMeta {
  return { ...varsayilanMeta, ...p };
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
//   Hükümet/Fetih/Spor ve Kongre/Karşehir → makas YOK (şemada PM yok). EKSİKSİZ.
// Geçiş hızı 15 km/h = Şartname 3.4.8.2 (varsayılan vMakas) — R50 en dar yarıçapı
// yönetir; CAD hız sayısı vermez, geometri (R50/R100·1/6) verir.
const T1_EK: Record<number, RingEk> = {
  0: { fromDepot: true, makas: [{ tip: "karsilasmali", konumOran: 0.3, sayi: 4 }], dwell: 40 }, // Alaaddin dönüş yelpazesi (4 makas)
  2: { makas: [{ tip: "karsilasmali", konumOran: 0.08, sayi: 2 }] },                            // Mevlana crossover (PM4/PM5)
  3: { makas: [{ tip: "karsilasmali", konumOran: 0.08, sayi: 2 }],
       hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },                                       // MKM crossover (PM6/PM7) + karayolu geçidi
  6: { makas: [{ tip: "udonus", konumOran: 0.75, sayi: 2 }], dwell: 45 },                       // Adliye U-dönüş (PM8/PM9)
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
export const HAZIR_VERI_SURUM = 4;

export interface HazirHat {
  key: "mevcut" | "etap1" | "etap2";
  ad: string;
  veri: ProjeVerisi;
}

export function hazirHatlar(): HazirHat[] {
  const cfg = { ...varsayilanConfig };

  // ① Mevcut Hat
  const mevcutRings = hatKur(T1_DURAK, T1_MESAFE, T1_EK);
  const mevcut: HazirHat = {
    key: "mevcut",
    ad: "Konya Mevcut Hat — Alaaddin–Adliye (CAD)",
    veri: {
      rings: mevcutRings, cfg, arac: SKODA_28T,
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 8, turnaroundDk: 4 },
      meta: meta({
        projeAdi: "Konya Tramvay — Mevcut Hat (Alaaddin–Adliye) Sinyalizasyon",
        hatAdi: "Alaaddin – Adliye (5,2 km · 8 istasyon)",
        idare: "Konya Büyükşehir Belediyesi",
        yuklenici: "—",
        musavir: "—",
        sinyalizasyonFirmasi: "RaySim",
        dokumanNo: "KNY-MEV-AKS-001",
        revizyon: "v4.0 — GERÇEK CAD kilometrajı + makas enterlok denetimi (PM1–PM9: Alaaddin yelpaze/Mevlana/MKM/Adliye, diğer duraklarda makas yok); durak adları işletme (Spor ve Kongre M., Karşehir)",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
      }),
    },
  };

  // ② 1. Etap — U10..U22 (Aslım Sanayi → Şehir Hastanesi → Adliye)
  // Makaslar enterlok şeması point-machine'lerinden (PM) doğrulandı:
  //   U10 Aslım/TÜMOSAN kavşağı  PM26–29 · U11 Ravza Camii crossover PM24/PM25 ·
  //   U17 DEPO merdiveni PM18–23+PM38–41 · U21/U22 Şehir Hast.–Adliye dönüş fanı PM10–17.
  const etap1Ek: Record<number, RingEk> = {
    0: { fromDepot: true, makas: [{ tip: "karsilasmali", konumOran: 0.2, sayi: 2 }], dwell: 40 }, // U10 Aslım/TÜMOSAN kavşağı (PM26–29)
    1: { makas: [{ tip: "karsilasmali", konumOran: 0.06, sayi: 2 }] },                            // U11 Ravza Camii crossover (PM24/PM25)
    6: { hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },                                       // U16 Sedirler Kavşağı
    7: { makas: [{ tip: "depo", konumOran: 0.6, sayi: 3 }] },                                     // U17 DEPO merdiveni (PM18–23, PM38–41)
    11: { makas: [{ tip: "udonus", konumOran: 0.75, sayi: 2 }], dwell: 45 },                      // U21/U22 dönüş fanı (PM10–17)
  };
  const etap1: HazirHat = {
    key: "etap1",
    ad: "Konya Tramvay 1. Etap — Aslım Sanayi–Şehir Hastanesi (CAD)",
    veri: {
      rings: hatKur(ETAP1_DURAK, ETAP1_MESAFE, etap1Ek), cfg, arac: SKODA_28T,
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 6, turnaroundDk: 4 },
      meta: meta({
        projeAdi: "Konya Tramvay 1. Etap Sinyalizasyon (Aslım Sanayi–Şehir Hastanesi–Adliye)",
        hatAdi: "1. Etap · U10 Aslım Sanayi – U22 Adliye (~10,8 km · 13 istasyon)",
        idare: "Konya Büyükşehir Belediyesi",
        yuklenici: "Uğursal Elektrik – ABU Yapı İş Ortaklığı",
        musavir: "—",
        sinyalizasyonFirmasi: "RaySim",
        dokumanNo: "KNY-E1-AKS-001",
        revizyon: "v4.0 — CAD adları (U10–U22) + kilometrajı + makas PM denetimi (Aslım kavşağı/Ravza/Depo merdiveni/dönüş fanı; U12–U16, U18–U20 makassız); U21→U22 tahmini",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
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
    0: { makas: [{ tip: "udonus", konumOran: 0.3, sayi: 3 }], dwell: 50 },                        // U1 Stadyum terminus yelpazesi (M1–M8)
    3: { makas: [{ tip: "karsilasmali", konumOran: 0.12, sayi: 2 }],
         hemzemin: [{ tip: "karayolu", konumOran: 0.55 }] },                                      // U4 Otogar kavşağı (M9/M10) + karayolu
    5: { makas: [{ tip: "karsilasmali", konumOran: 0.06, sayi: 2 }] },                            // U6 Betoncular crossover (PM30–32)
    6: { dwell: 30 },                                                                             // U7 Banliyö Aktarma — makas YOK, aktarma beklemesi
    8: { fromDepot: false, makas: [{ tip: "karsilasmali", konumOran: 0.8, sayi: 2 }], dwell: 40 },// U9 TÜMOSAN kavşağı (M11–14/PM26–29)
  };
  const etap2: HazirHat = {
    key: "etap2",
    ad: "Konya Tramvay 2. Etap — Stadyum–Aslım Sanayi (CAD)",
    veri: {
      rings: hatKur(ETAP2_DURAK, ETAP2_MESAFE, etap2Ek), cfg, arac: SKODA_28T,
      isletme: { ...varsayilanIsletme, kapali: false, seferSayisi: 6, turnaroundDk: 4 },
      meta: meta({
        projeAdi: "Konya Tramvay 2. Etap Sinyalizasyon (Stadyum–Aslım Sanayi)",
        hatAdi: "2. Etap · U1 Stadyum – U10 Aslım Sanayi (~8,6 km · 10 istasyon)",
        idare: "T.C. Ulaştırma ve Altyapı Bakanlığı · AYGM",
        yuklenici: "—",
        musavir: "—",
        sinyalizasyonFirmasi: "RaySim",
        dokumanNo: "KNY-E2-AKS-001",
        revizyon: "v4.0 — CAD adları (U1–U10) + kilometrajı + makas denetimi (M-kod+PM: Stadyum/Otogar/Betoncular/TÜMOSAN kavşağı; Banliyö-TÜYAP makassız)",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
      }),
    },
  };

  return [mevcut, etap1, etap2];
}
