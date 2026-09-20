import { describe, it, expect } from "vitest";
import { hazirHatlar } from "../hazirHatlar";
import { ETAP1_KOORDINAT } from "../etapKoordinat";

// 1. Etap demoya-özel YAKLAŞIK koordinat gömülü seed'i (CAD HAT1 + kilometraj, OSM-hizalı).
describe("etap1 demo koordinat seed", () => {
  const hatlar = hazirHatlar();
  const etap1 = hatlar.find((h) => h.key === "etap1")!;
  const mevcut = hatlar.find((h) => h.key === "mevcut")!;

  it("etap1 hattının HER istasyonu (ring from/to) koordinat sözlüğünde var — harita modu TAM şart", () => {
    const koord = etap1.veri.isletme?.istasyonKoordinat ?? {};
    // Ring'ler ardışık durakları bağlar (yeniRing(from,to)); tüm from/to adları = istasyonlar.
    const adlar = new Set<string>();
    for (const r of etap1.veri.rings) {
      const rr = r as unknown as { fromAd?: string; toAd?: string };
      if (rr.fromAd) adlar.add(rr.fromAd);
      if (rr.toAd) adlar.add(rr.toAd);
    }
    expect(adlar.size).toBeGreaterThanOrEqual(13);
    for (const ad of adlar) {
      expect(koord[ad], `koordinat eksik: ${ad}`).toBeDefined();
      expect(Number.isFinite(koord[ad].lat) && Number.isFinite(koord[ad].lon)).toBe(true);
    }
    expect(Object.keys(ETAP1_KOORDINAT).length).toBe(13);
  });

  it("etap1 koordinatYaklasik=true (harita uyarısı için), mevcut hat değil", () => {
    expect(etap1.veri.isletme?.koordinatYaklasik).toBe(true);
    expect(mevcut.veri.isletme?.koordinatYaklasik).toBeFalsy();
  });

  it("koordinatlar Konya tram bölgesinde (makul lat/lon aralığı)", () => {
    for (const { lat, lon } of Object.values(ETAP1_KOORDINAT)) {
      expect(lat).toBeGreaterThan(37.84);
      expect(lat).toBeLessThan(37.95);
      expect(lon).toBeGreaterThan(32.53);
      expect(lon).toBeLessThan(32.58);
    }
  });

  it("mevcut hat gömülü koordinat taşımaz (OSM'den canlı gelir)", () => {
    expect(mevcut.veri.isletme?.istasyonKoordinat).toBeUndefined();
    expect(mevcut.veri.isletme?.osmBbox).toBeDefined();
  });
});
