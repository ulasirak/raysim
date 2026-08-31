// raysim — DUYARLILIK ANALİZİ (tornado). Bir hattın hedef metriğini (işletme kapasitesi
// veya teorik maks tramvay) hangi parametrenin en çok oynattığını ölçer: her parametre
// ±delta oynatılıp diğerleri sabit tutulur; metriğin alt/üst değeri ve SALINIMI kaydedilir.
// Salınıma göre sıralı → "en güçlü kaldıraç" tepede. Motorla (maksimumTren) hesaplanır.

import { maksimumTren } from "./kapasite";
import { dwellUygulanmisRings } from "./yolcu";
import type { DurakArasiRing } from "./ring";
import type { RollingStock } from "./types";
import type { SimConfig, Isletme } from "./config";

export type DuyarlilikHedef = "isletmeKap" | "nTeorik";

export interface DuyarlilikSatir {
  ad: string;         // parametre adı
  eksi: number;       // metrik @ -delta
  arti: number;       // metrik @ +delta
  salinim: number;    // |arti - eksi|
  yon: 1 | -1 | 0;    // parametre ARTINCA metrik artıyor(1)/azalıyor(-1)/etkisiz(0)
}
export interface DuyarlilikSonuc { taban: number; hedefAd: string; deltaYuzde: number; satirlar: DuyarlilikSatir[]; }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function duyarlilikAnaliz(
  ringsHam: DurakArasiRing[], stock: RollingStock, cfg: SimConfig, isletme: Isletme,
  hedef: DuyarlilikHedef = "isletmeKap", deltaYuzde = 20,
): DuyarlilikSonuc {
  const d = Math.max(1, deltaYuzde) / 100;
  const metrik = (c: SimConfig, s: RollingStock, isl: Isletme): number => {
    const m = maksimumTren(dwellUygulanmisRings(ringsHam, s, isl), s, c, isl);
    if (!m.gecerli) return 0;
    return hedef === "nTeorik" ? m.nTeorik : (m.hMin > 0 ? 3600 / m.hMin : 0) * (m.dolulukTavani || 1);
  };
  const taban = metrik(cfg, stock, isletme);

  // Her parametre: (faktör) → değiştirilmiş {cfg,stock,isletme} üçlüsü.
  const PARAM: { ad: string; uy: (f: number) => { c: SimConfig; s: RollingStock; isl: Isletme } }[] = [
    { ad: "Blok uzunluğu", uy: (f) => ({ c: { ...cfg, blokMaxUzunluk: clamp(cfg.blokMaxUzunluk * f, 100, 1500) }, s: stock, isl: isletme }) },
    { ad: "Doluluk tavanı", uy: (f) => ({ c: { ...cfg, dolulukTavani: clamp((cfg.dolulukTavani ?? 0.7) * f, 0.4, 0.95) }, s: stock, isl: isletme }) },
    { ad: "Azami hız", uy: (f) => ({ c: cfg, s: { ...stock, maxSpeed: clamp(stock.maxSpeed * f, 1, 150) }, isl: isletme }) },
    { ad: "Fren (ivme)", uy: (f) => ({ c: cfg, s: { ...stock, maxBraking: clamp(stock.maxBraking * f, 0.3, 5) }, isl: isletme }) },
    { ad: "Tren boyu", uy: (f) => ({ c: cfg, s: { ...stock, length: clamp(stock.length * f, 5, 1000) }, isl: isletme }) },
    { ad: "Kalkış ölü zamanı", uy: (f) => ({ c: cfg, s: stock, isl: { ...isletme, kalkisOluZamaniSn: clamp((isletme.kalkisOluZamaniSn || 0) * f, 0, 60) } }) },
    { ad: "Min duruş süresi", uy: (f) => ({ c: cfg, s: stock, isl: { ...isletme, minDurusSuresi: clamp((isletme.minDurusSuresi || 0) * f, 0, 300) } }) },
  ];

  const satirlar: DuyarlilikSatir[] = PARAM.map((p) => {
    const e = p.uy(1 - d), a = p.uy(1 + d);
    const eksi = metrik(e.c, e.s, e.isl), arti = metrik(a.c, a.s, a.isl);
    const salinim = Math.abs(arti - eksi);
    const yon: 1 | -1 | 0 = salinim < 1e-6 ? 0 : arti > eksi ? 1 : -1;
    return { ad: p.ad, eksi: Math.round(eksi * 10) / 10, arti: Math.round(arti * 10) / 10, salinim: Math.round(salinim * 10) / 10, yon };
  }).sort((x, y) => y.salinim - x.salinim);

  return {
    taban: Math.round(taban * 10) / 10,
    hedefAd: hedef === "nTeorik" ? "Teorik maks tramvay" : "İşletme kapasitesi (tren/saat)",
    deltaYuzde: Math.round(d * 100),
    satirlar,
  };
}
