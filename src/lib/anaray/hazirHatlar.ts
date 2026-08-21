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
  /** Bu ring hangi durağa GİDİYOR (index). Uç/kavşak/depo işaretleri buradan. */
  makas?: { tip: MakasTip; konumOran: number }[];
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
        r.makaslar.push(yeniMakas(m.tip, konum));
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
//   Fetih 2+847 · Üniversite 3+718 · Samanpazarı 4+282 · Adliye 5+200
const T1_DURAK = [
  "Alaattin", "Hükümet", "Mevlana", "Mevlana Kültür Merkezi",
  "Fetih", "Üniversite", "Samanpazarı", "Adliye",
];
// GERÇEK durak arası mesafeler (m) — CAD kilometrajı farklarından.
const T1_MESAFE = [261, 881, 699, 1006, 871, 564, 918];

// Alaaddin kavşağı (çok makaslı yelpaze — CAD'de T/O 1/6 R50 & R100 makaslar) ve
// Adliye ucu U-dönüşü. Makas tipleri projeden: 1/6 tanjant, R50/R100 yarıçap.
const T1_EK: Record<number, RingEk> = {
  0: { fromDepot: true, makas: [{ tip: "karsilasmali", konumOran: 0.3 }], dwell: 40 }, // Alaaddin kavşağı
  3: { hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },
  6: { makas: [{ tip: "udonus", konumOran: 0.75 }], dwell: 45 },                        // Adliye ucu
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
        revizyon: "v2.0 — GERÇEK CAD kilometrajı (Alaaddin-Etap1-2-depo_v11); makas T/O 1/6 R50/R100",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
      }),
    },
  };

  // ② 1. Etap — U10..U22 (Aslım Sanayi → Şehir Hastanesi → Adliye)
  const etap1Ek: Record<number, RingEk> = {
    0: { fromDepot: true, makas: [{ tip: "karsilasmali", konumOran: 0.2 }], dwell: 40 }, // Aslım/TÜMOSAN kavşağı (Etap2 ile bağ)
    6: { hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },                               // Sedirler Kavşağı
    7: { makas: [{ tip: "depo", konumOran: 0.6 }] },                                      // U17 DEPO girişi
    11: { makas: [{ tip: "udonus", konumOran: 0.75 }], dwell: 45 },                       // Adliye ucu
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
        revizyon: "v2.0 — GERÇEK CAD adları (U10–U22) + kilometrajı; U21→U22 tahmini",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
      }),
    },
  };

  // ③ 2. Etap — U1..U10 (Stadyum → Aslım Sanayi)
  const etap2Ek: Record<number, RingEk> = {
    0: { makas: [{ tip: "udonus", konumOran: 0.3 }], dwell: 50 },                         // U1 Stadyum ucu
    6: { makas: [{ tip: "barinma", konumOran: 0.8 }], dwell: 30 },                        // U7 Banliyö Aktarma (KONYARAY)
    3: { hemzemin: [{ tip: "karayolu", konumOran: 0.5 }] },                               // U4 Otogar
    8: { fromDepot: false, makas: [{ tip: "karsilasmali", konumOran: 0.8 }], dwell: 40 }, // U9 TÜMOSAN kavşağı (Etap1 ile bağ)
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
        revizyon: "v2.0 — GERÇEK CAD adları (U1–U10) + kilometrajı",
        hazirlayan: "Tasarım Mühendisi",
        onaylayan: "Firma Yetkilisi",
      }),
    },
  };

  return [mevcut, etap1, etap2];
}
