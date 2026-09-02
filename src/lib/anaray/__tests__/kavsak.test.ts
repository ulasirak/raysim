// Düz kavşak (flat junction) blocking-time fiziği — kavsakSperr.
// Eski model tren boyunu YOK SAYIYORDU (bölge_genişliği / geçiş_hızı). Yeni model
// fouling bölgesini + TREN BOYUNU geçiş hızında temizler → uzun araç kavşağı daha
// uzun işgal eder. Bu testler o fiziği ve bileşen tutarlılığını kilitler.

import { describe, it, expect } from "vitest";
import { kavsakSperr } from "@/lib/anaray/kapasite";
import { varsayilanConfig } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import type { DurakArasiRing } from "@/lib/anaray/ring";

type Makas = DurakArasiRing["makaslar"][number];
const makas = (over: Partial<Makas> = {}): Makas => ({
  id: "m1", ad: "test makas", tip: "karsilasmali", konum: 100,
  gecisHizi: 15 / 3.6, tccZorunlu: true, makasAdimSuresi: 5, makasSayisi: 2, routeRelease: 5,
  ...over,
} as Makas);

const cfg = { ...varsayilanConfig, kisitGenisligi: 40 };

describe("kavsakSperr — düz kavşak blocking-time", () => {
  it("bileşenler toplama tutarlı (tekGecis = setup + görme + geçiş + release)", () => {
    const d = kavsakSperr(makas(), varsayilanArac, cfg);
    expect(d.tekGecis).toBeCloseTo(d.tSetup + d.tGorme + d.tGecis + d.tRelease, 6);
    expect(d.isgal).toBeCloseTo(d.faktor * d.tekGecis, 6);
  });

  it("geçiş süresi (bölge + tren boyu) / geçiş hızı", () => {
    const d = kavsakSperr(makas(), varsayilanArac, cfg);
    const beklenen = (cfg.kisitGenisligi + varsayilanArac.length) / (15 / 3.6);
    expect(d.tGecis).toBeCloseTo(beklenen, 6);
    expect(d.foulUzunluk).toBeCloseTo(cfg.kisitGenisligi + varsayilanArac.length, 6);
  });

  it("UZUN araç kavşağı daha uzun işgal eder (tren-boyu duyarlılığı)", () => {
    const kisa = kavsakSperr(makas(), { ...varsayilanArac, length: 30 }, cfg);
    const uzun = kavsakSperr(makas(), { ...varsayilanArac, length: 110 }, cfg);
    expect(uzun.isgal).toBeGreaterThan(kisa.isgal);
    // Fark yalnız boy farkından gelir: (110-30)/v × faktor
    const df = ((110 - 30) / (15 / 3.6)) * kisa.faktor;
    expect(uzun.isgal - kisa.isgal).toBeCloseTo(df, 4);
  });

  it("daha yüksek geçiş hızı kavşağı daha kısa işgal eder", () => {
    const yavas = kavsakSperr(makas({ gecisHizi: 10 / 3.6 }), varsayilanArac, cfg);
    const hizli = kavsakSperr(makas({ gecisHizi: 25 / 3.6 }), varsayilanArac, cfg);
    expect(hizli.isgal).toBeLessThan(yavas.isgal);
  });

  it("daha çok makas (tanzim) işgali artırır", () => {
    const az = kavsakSperr(makas({ makasSayisi: 1 }), varsayilanArac, cfg);
    const cok = kavsakSperr(makas({ makasSayisi: 3 }), varsayilanArac, cfg);
    expect(cok.tSetup).toBeGreaterThan(az.tSetup);
    expect(cok.isgal).toBeGreaterThan(az.isgal);
  });

  it("geçiş hızı 0 girilirse Infinity üretmez (koruma)", () => {
    const d = kavsakSperr(makas({ gecisHizi: 0 }), varsayilanArac, cfg);
    expect(Number.isFinite(d.isgal)).toBe(true);
  });
});
