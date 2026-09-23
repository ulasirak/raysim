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
import { simulate } from "./sim";
import { kurpHizi, kurpYanalIvme, yeniKurp, yeniRing } from "./ring";
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

  // — UÇTAN-UCA ① (ÇOK-SEGMENT ENTEGRASYON, integrator izolasyonu): ideal araç 2 ardışık
  //   durak-arasını (her biri L) geçer; ara istasyonda TAM durup yeniden kalkar. Motorun
  //   sayısal entegrasyonu (simulate, dt=0,05) kapalı-form 2×trapez ile kıyaslanır →
  //   çok-duraklı seyahati doğru zincirlediğini BAĞIMSIZ doğrular. —
  const eeLine: Line = {
    id: "vv2", name: "Analitik 2-segment", length: 2 * L,
    stations: [
      { id: "a", name: "A", position: 0, dwell: 0 },
      { id: "m", name: "M", position: L, dwell: 0 },
      { id: "b", name: "B", position: 2 * L, dwell: 0 },
    ],
    segments: [
      { start: 0, end: L, vmax: V, gradient: 0 },
      { start: L, end: 2 * L, vmax: V, gradient: 0 },
    ],
  };
  const eeT = simulate(eeLine, arac, 0.05).totalTime;
  ekle({ ad: "Çok-segment seyir süresi (uçtan-uca)", kategori: "Kinematik", bagimsiz: true,
    referans: 2 * tRef, hesaplanan: eeT, birim: "s", tolerans: 2,
    yontem: `2 ardışık durak-arası (ideal araç, her biri ${L} m); ara istasyonda tam durup yeniden kalkar. Motorun sayısal entegrasyonu (simulate) kapalı-form 2×trapez ile kıyaslanır — çok-duraklı seyahatin doğru zincirlendiğini bağımsız sınar.` });

  // — UÇTAN-UCA ② (TAM İŞLETME ÇEVRİMİ): en üst-seviye pipeline. İdeal araçla N ring'lik
  //   bir hattın maksimumTren çevrim süresini (per-ring seyir ×N + ara dwell + iki yön ×2,
  //   döngü terminal → 0) kapalı-form ile kıyaslar. ring.vmax=V verilerek cruise sabittir →
  //   çevrim kâğıt üstünde tam hesaplanabilir. Motorun tüm çevrim-kurulum aritmetiğinin
  //   (rings → line → simulate → çevrim) fizikle uyumunu BAĞIMSIZ sınar. Sapma ~%2 =
  //   simulate dt=0,5 sayısal doğruluğu (motorun üretim ayarı), model hatası değil. —
  const cN = 3, cDwell = 30, cL = 2000;
  const cCfg: SimConfig = { ...varsayilanConfig, vAnahat: V, ivme: a0, yavaslama: b };
  const cIsl: Isletme = {
    ...varsayilanIsletme, kalkisOluZamaniSn: 0,
    terminalBas: { ...varsayilanIsletme.terminalBas, tip: "dongu" },
    terminalSon: { ...varsayilanIsletme.terminalSon, tip: "dongu" },
  };
  const cRings: DurakArasiRing[] = Array.from({ length: cN }, (_, i) => ({
    ...yeniRing(`C${i}`, `C${i + 1}`), uzunluk: cL, worstUzunluk: cL, bestUzunluk: cL, vmax: V, dwell: cDwell,
  }));
  const cMaks = maksimumTren(cRings, arac, cCfg, cIsl);
  const cTrap = V / a0 + (cL - (V * V) / (2 * a0) - (V * V) / (2 * b)) / V + V / b;
  const cCevrimRef = 2 * (cN * cTrap + (cN - 1) * cDwell); // döngü terminal → +0
  ekle({ ad: "Tam işletme çevrimi (uçtan-uca)", kategori: "Kapasite", bagimsiz: true,
    referans: cCevrimRef, hesaplanan: cMaks.cevrimSuresi, birim: "s", tolerans: 3,
    yontem: `Çevrim = 2 × [${cN} ring × trapez(${cL} m) + ${cN - 1} × dwell(${cDwell} s)]; döngü terminal → 0. İdeal araç + ring.vmax=${Math.round(V * 3.6)} km/h → kapalı-form. Motorun tam çevrim-kurulum aritmetiğini (rings → çevrim) bağımsız sınar; ~%2 sapma = üretim entegrasyonu dt=0,5 doğruluğu.` });

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
