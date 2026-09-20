// Hazır Konya hatlarına gerçek OSM koordinatı seed edildi mi (Büyük sıçrama D).
import { describe, it, expect } from "vitest";
import { hazirHatlar } from "../hazirHatlar";
import { konyaKoordinatBul } from "../konyaKoordinat";

describe("hazır hatlar — Konya koordinat seed", () => {
  const hatlar = hazirHatlar();
  it("mevcut hat TAM koordinatlı (8/8) → Harita hazır gelir", () => {
    const mevcut = hatlar.find((h) => h.key === "mevcut")!;
    const k = mevcut.veri.isletme?.istasyonKoordinat ?? {};
    expect(Object.keys(k).length).toBeGreaterThanOrEqual(8);
  });
  it("birleşik hat çoğunlukla koordinatlı (≥10)", () => {
    const b = hatlar.find((h) => h.key === "birlesik")!;
    expect(Object.keys(b.veri.isletme?.istasyonKoordinat ?? {}).length).toBeGreaterThanOrEqual(10);
  });
  it("tüm seed koordinatları Konya bbox içinde (uydurma yok)", () => {
    for (const h of hatlar) {
      for (const v of Object.values(h.veri.isletme?.istasyonKoordinat ?? {})) {
        expect(v.lat).toBeGreaterThan(37.7); expect(v.lat).toBeLessThan(38.1);
        expect(v.lon).toBeGreaterThan(32.3); expect(v.lon).toBeLessThan(32.7);
      }
    }
  });
  it("alias: CAD 'Alaattin' → OSM 'Alaaddin' çözülür", () => {
    const c = konyaKoordinatBul("Alaattin");
    expect(c).toBeDefined();
    expect(c!.lat).toBeCloseTo(37.871634, 3);
  });
});
