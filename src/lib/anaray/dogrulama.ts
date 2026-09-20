// raysim — DOĞRULAMA & GEÇERLEME (Verification & Validation).
//
// Motorun çıktılarını BAĞIMSIZ kapalı-form (analitik) referanslara karşı sınar. Bu,
// mühendislik yazılımı V&V'sinin standart yöntemidir ("analytical benchmark / method
// of manufactured solutions"): dış lisanslı araca ya da uydurma "eşleştik" iddiasına
// GEREK YOK — fizik zaten kapalı-formda bilindiği için motorun sayısal entegrasyonu
// doğrudan doğrulanır.
//
// DÜRÜSTLÜK: her kontrol `bagimsiz` bayrağı taşır. true = motordan BAĞIMSIZ analitik
// referans (gerçek doğrulama). false = iç tutarlılık / tasarım değişmezi (motorun kendi
// tanımıyla uyumu — güvenilirlik göstergesi ama bağımsız kanıt değil). İkisi ayrı sunulur.

import { stepMotion, allowedSpeed } from "./signalling";
import { kurpHizi, kurpYanalIvme, yeniKurp } from "./ring";
import { maksimumTren } from "./kapasite";
import { varsayilanConfig, varsayilanIsletme, type SimConfig, type Isletme } from "./config";
import { varsayilanArac } from "./vehicles";
import type { Line, RollingStock } from "./types";
import type { DurakArasiRing } from "./ring";

export interface DogrulamaSonuc {
  ad: string;
  kategori: "Kinematik" | "Direnç" | "Kurp" | "Kapasite";
  /** true: motordan BAĞIMSIZ analitik referans (gerçek doğrulama). false: iç tutarlılık/değişmez. */
  bagimsiz: boolean;
  referans: number;
  hesaplanan: number;
  birim: string;
  sapmaYuzde: number;
  tolerans: number;
  gecti: boolean;
  yontem: string;
}

/** Sabit-ivmeli analitik araç: çekiş/güç bol, Davis=0 → ivme = aCap (sabit), fren = b (sabit). */
function analitikArac(V: number, a0: number, b: number): RollingStock {
  return {
    id: "vv", name: "Analitik", mass: 40_000, rotatingMassFactor: 0, length: 30,
    maxSpeed: V, startingTractiveEffort: 1e9, power: 1e12, maxBraking: b,
    davisA: 0, davisB: 0, davisC: 0, aCap: a0,
  };
}

function duzHat(L: number, V: number): Line {
  return {
    id: "vv", name: "Analitik hat", length: L,
    stations: [{ id: "a", name: "A", position: 0, dwell: 0 }, { id: "b", name: "B", position: L, dwell: 0 }],
    segments: [{ start: 0, end: L, vmax: V, gradient: 0 }],
  };
}

/** 0→L, sonda duracak şekilde stepMotion+allowedSpeed ile entegre eder. Süre, hızlanma
 *  mesafesi (V'ye ulaşma) ve fren başlangıç konumunu ölçer. dt küçük → analitikle kıyas. */
function profilKos(line: Line, stock: RollingStock, V: number, b: number) {
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  const L = line.length, dt = 0.05;
  let s = 0, v = 0, t = 0, hizlanmaMesafe = -1, frenBasla = -1;
  let onceki = 0;
  while (s < L - 1e-3 && t < 1e6) {
    const vAllowed = allowedSpeed(line, stock, Math.min(s, L - 1e-6), L, b);
    const { vNew } = stepMotion(stock, v, vAllowed, 0, dt, meff, b);
    if (hizlanmaMesafe < 0 && vNew >= V - 1e-2) hizlanmaMesafe = s;         // seyir hızına ulaştı
    if (frenBasla < 0 && hizlanmaMesafe >= 0 && vNew < onceki - 1e-4) frenBasla = s; // fren başladı
    s += ((v + vNew) / 2) * dt; onceki = v; v = vNew; t += dt;
  }
  return { sure: t, hizlanmaMesafe, frenMesafe: frenBasla >= 0 ? L - frenBasla : -1 };
}

/** Direnç denge hızı: P/v = davisA+davisB·v+davisC·v² kökü (ikiye bölme). */
function dengeHizi(stock: RollingStock): number {
  const f = (v: number) => stock.power / v - (stock.davisA + stock.davisB * v + stock.davisC * v * v);
  let lo = 0.5, hi = 200;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * Tüm V&V kontrollerini çalıştırır. Motor-sertifikasyon kontrolleri (kinematik/direnç/
 * kurp) hat-bağımsızdır; UIC 406 kapasite kimliği verilen hatta (yoksa atlanır) koşar.
 */
export function dogrulamaCalistir(
  rings?: DurakArasiRing[], stock: RollingStock = varsayilanArac,
  cfg: SimConfig = varsayilanConfig, isletme: Isletme = varsayilanIsletme,
): { sonuclar: DogrulamaSonuc[]; toplam: number; gecen: number; maxSapma: number } {
  const sonuclar: DogrulamaSonuc[] = [];
  const ekle = (s: Omit<DogrulamaSonuc, "sapmaYuzde" | "gecti">) => {
    const sapma = s.referans !== 0 ? Math.abs(s.hesaplanan - s.referans) / Math.abs(s.referans) * 100 : Math.abs(s.hesaplanan) * 100;
    sonuclar.push({ ...s, sapmaYuzde: sapma, gecti: sapma <= s.tolerans });
  };

  // — Analitik profil: V=20 m/s, a=1,0 m/s², b=1,2 m/s², L=2000 m —
  const V = 20, a0 = 1.0, b = 1.2, L = 2000;
  const line = duzHat(L, V), arac = analitikArac(V, a0, b);
  const dAcc = (V * V) / (2 * a0), dBrake = (V * V) / (2 * b);
  const tAcc = V / a0, tBrake = V / b, tCruise = (L - dAcc - dBrake) / V;
  const tRef = tAcc + tCruise + tBrake;
  const p = profilKos(line, arac, V, b);

  ekle({ ad: "Kalkış–seyir–fren süresi", kategori: "Kinematik", bagimsiz: true,
    referans: tRef, hesaplanan: p.sure, birim: "s", tolerans: 2,
    yontem: "Trapez hız profili: t = V/a + (L−V²/2a−V²/2b)/V + V/b (V=72 km/h, a=1,0, b=1,2, L=2000 m)" });
  ekle({ ad: "Kalkış (hızlanma) mesafesi", kategori: "Kinematik", bagimsiz: true,
    referans: dAcc, hesaplanan: p.hizlanmaMesafe, birim: "m", tolerans: 2,
    yontem: "d = V² / (2a) — sabit ivmeli hızlanma" });
  ekle({ ad: "Fren mesafesi", kategori: "Kinematik", bagimsiz: true,
    referans: dBrake, hesaplanan: p.frenMesafe, birim: "m", tolerans: 2,
    yontem: "d = V² / (2b) — sabit yavaşlamalı fren; motorun ön-görüşlü fren eğrisi (√(2b·d)) ile" });

  // — Direnç denge hızı: gerçekçi araç, sınırsız maxSpeed → oturduğu hız = analitik denge —
  const dArac: RollingStock = { ...stock, maxSpeed: 1000, aCap: undefined };
  const vb = dengeHizi(dArac);
  const meffD = dArac.mass * (1 + dArac.rotatingMassFactor);
  // MOTORUN stepMotion'ıyla, tavansız (vAllowed=1000) düz hatta hızlan; ivme ihmal
  // edilebilir olana dek → oturduğu (terminal) hız. Bu, denge/direnç modelini doğrular.
  let v = 0, iter = 0;
  while (iter++ < 2_000_000) {
    const { vNew, a } = stepMotion(dArac, v, 1000, 0, 0.1, meffD, dArac.maxBraking);
    v = vNew;
    if (v > 1 && a < 1e-4) break;
  }
  ekle({ ad: "Direnç denge (terminal) hızı", kategori: "Direnç", bagimsiz: true,
    referans: vb, hesaplanan: v, birim: "m/s", tolerans: 2,
    yontem: "Çekiş = direnç dengesi: P/v = davisA + davisB·v + davisC·v² (Škoda Davis katsayıları)" });

  // — Kurp: yarıçaptan türeyen hızda yanal ivme = konfor tavanı (tasarım değişmezi) —
  const k = { ...yeniKurp(0), yaricap: 300, dever: 0, uzunluk: 60 };
  ekle({ ad: "Kurp yanal ivmesi = konfor tavanı", kategori: "Kurp", bagimsiz: false,
    referans: cfg.aYanalKonfor, hesaplanan: kurpYanalIvme(k, cfg), birim: "m/s²", tolerans: 1,
    yontem: `v=√(R·a) hızında a_yanal = v²/R = a_konfor (R=300 m, dever=0); tanım gereği eşit. Kurp hızı ${(kurpHizi(k, cfg) * 3.6).toFixed(1)} km/h` });

  // — UIC 406 kapasite kimliği: nTeorik = ⌊çevrim ÷ min headway⌋ (verilen hatta) —
  if (rings && rings.length >= 2) {
    const m = maksimumTren(rings, stock, cfg, isletme);
    if (m.gecerli && m.hMin > 0) {
      const nRef = Math.floor(m.cevrimSuresi / m.hMin);
      ekle({ ad: "UIC 406 kapasite kimliği (bu hat)", kategori: "Kapasite", bagimsiz: false,
        referans: nRef, hesaplanan: m.nTeorik, birim: "tren", tolerans: 0,
        yontem: `Teorik tren sayısı = ⌊çevrim (${Math.round(m.cevrimSuresi)} s) ÷ min headway (${Math.round(m.hMin)} s)⌋` });
    }
  }

  const gecen = sonuclar.filter((x) => x.gecti).length;
  const maxSapma = sonuclar.reduce((a2, x) => Math.max(a2, x.sapmaYuzde), 0);
  return { sonuclar, toplam: sonuclar.length, gecen, maxSapma };
}
