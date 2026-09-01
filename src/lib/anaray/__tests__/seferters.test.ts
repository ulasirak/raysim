import { describe, it, expect } from "vitest";
import { seferTersEntegre } from "../seferters";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

describe("Sefer ↔ Ters İşletme entegre algoritma", () => {
  const h = hazirHatlar().find((x) => x.key === "birlesik")!;
  const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
  const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
  const stock = h.veri.arac ?? varsayilanArac;
  const rings = h.veri.rings ?? [];

  it("verilen headway'de araç konumlarını + filoyu üretir", () => {
    const s = seferTersEntegre(rings, stock, cfg, isletme, 5 * 60, 0); // 5 dk aralık
    expect(s.gecerli).toBe(true);
    expect(s.filo).toBeGreaterThan(0);
    expect(s.araclar.length).toBe(s.filo);
    // konumlar 0..L(km) aralığında
    for (const a of s.araclar) expect(a.km).toBeGreaterThanOrEqual(0);
    expect(s.bilgi.length).toBeGreaterThan(0);
  });

  it("headway küçüldükçe filo artar (dinamik)", () => {
    const az = seferTersEntegre(rings, stock, cfg, isletme, 10 * 60, 0);
    const cok = seferTersEntegre(rings, stock, cfg, isletme, 3 * 60, 0);
    expect(cok.filo).toBeGreaterThan(az.filo);
  });

  it("öneri üretirse dönüş kararı bir araca bağlanır + gerçek ulaşım süresi taşır", () => {
    const s = seferTersEntegre(rings, stock, cfg, isletme, 4 * 60, 300);
    for (const o of s.oneriler) {
      expect(o.aracNo).toBeGreaterThan(0);
      expect(o.ulasimSn).toBeGreaterThanOrEqual(0);
      expect(o.gerekce).toContain("makas");
    }
  });
});
