// raysim — çeken araç veritabanı (hazır tipler).
// Kalkış çekiş kuvveti ~ etkin kütle × ~1.0 m/s² (gerçekçi kalkış ivmesi).

import type { RollingStock } from "./types";

const KMH = 1 / 3.6;

export const araclar: RollingStock[] = [
  {
    id: "tramvay", name: "Düşük Tabanlı Tramvay (5 modül)",
    mass: 41000, rotatingMassFactor: 0.08, length: 33, maxSpeed: 70 * KMH,
    startingTractiveEffort: 46000, power: 500_000, maxBraking: 1.2,
    davisA: 1500, davisB: 40, davisC: 3,
    kapiSayisi: 6, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "hizli-tramvay", name: "Hızlı Tramvay (LRV)",
    mass: 55000, rotatingMassFactor: 0.08, length: 42, maxSpeed: 80 * KMH,
    startingTractiveEffort: 62000, power: 720_000, maxBraking: 1.2,
    davisA: 2000, davisB: 50, davisC: 4,
    kapiSayisi: 8, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "hafif-metro", name: "Hafif Metro",
    mass: 90000, rotatingMassFactor: 0.09, length: 60, maxSpeed: 80 * KMH,
    startingTractiveEffort: 100_000, power: 1_200_000, maxBraking: 1.3,
    davisA: 3000, davisB: 60, davisC: 5,
    kapiSayisi: 8, kapiGenisligi: 1.4, aracGenisligi: 2.8, kullanilabilirAlanOrani: 0.4,
  },
  {
    id: "metro", name: "Metro (B tipi, 4 vagon)",
    mass: 200000, rotatingMassFactor: 0.1, length: 110, maxSpeed: 90 * KMH,
    startingTractiveEffort: 230_000, power: 2_600_000, maxBraking: 1.3,
    davisA: 6000, davisB: 90, davisC: 8,
    kapiSayisi: 16, kapiGenisligi: 1.4, aracGenisligi: 2.9, kullanilabilirAlanOrani: 0.4,
  },
];

export const varsayilanArac = araclar[0];

// Tramvay tipleri — Loop Özeti/Ölçeklenme (RingEditor) ve Studio "Çeken Araç"
// seçicileri bu ürün kapsamında YALNIZCA tramvayları listeler: düşük tabanlı
// tramvay + hızlı tramvay (LRV). Metro/hafif metro seçicilerde gösterilmez.
export const tramvaylar: RollingStock[] = araclar.filter(
  (a) => a.id === "tramvay" || a.id === "hizli-tramvay",
);
