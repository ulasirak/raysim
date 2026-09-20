// COĞRAFİ / ÖLÇEKLİ GEOMETRİ (Büyük sıçrama D) — projeksiyon + kilometraj→nokta kilidi.
import { describe, it, expect } from "vitest";
import { cografiGeometri } from "../cografi";
import type { Line, Station } from "@/lib/anaray/types";

function ist(id: string, name: string, position: number): Station {
  return { id, name, position, dwell: 20 };
}
const line: Line = {
  id: "L", name: "Test", length: 2000,
  stations: [ist("a", "A", 0), ist("b", "B", 1000), ist("c", "C", 2000)],
  segments: [],
};

describe("cografiGeometri — ölçekli plan (koordinatsız)", () => {
  const g = cografiGeometri(line, undefined, 900);
  it("koordluMu=false", () => expect(g.coordluMu).toBe(false));
  it("istasyonlar soldan sağa kilometraja orantılı", () => {
    const [a, b, c] = g.istasyonlar.map((s) => s.nokta.x);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // Orta istasyon (1000/2000) tam ortada
    expect(b).toBeCloseTo((a + c) / 2, 5);
  });
  it("konum(chain) düz hatta y sabit + x monoton", () => {
    const p0 = g.konum(0), pm = g.konum(1000), pe = g.konum(2000);
    expect(p0.y).toBeCloseTo(pm.y, 5);
    expect(pm.y).toBeCloseTo(pe.y, 5);
    expect(p0.x).toBeLessThan(pm.x);
    expect(pm.x).toBeLessThan(pe.x);
  });
  it("konum kilometraj sınırlarını kıskaçlar", () => {
    expect(g.konum(-500).x).toBeCloseTo(g.konum(0).x, 5);
    expect(g.konum(9999).x).toBeCloseTo(g.konum(2000).x, 5);
  });
});

describe("cografiGeometri — gerçek koordinat kipi", () => {
  const koord = { A: { lat: 37.870, lon: 32.480 }, B: { lat: 37.880, lon: 32.500 }, C: { lat: 37.890, lon: 32.520 } };
  const g = cografiGeometri(line, koord, 900);
  it("koordluMu=true (tüm istasyonlarda lat/lon var)", () => expect(g.coordluMu).toBe(true));
  it("noktalar viewBox içinde", () => {
    for (const s of g.istasyonlar) {
      expect(s.nokta.x).toBeGreaterThanOrEqual(0);
      expect(s.nokta.x).toBeLessThanOrEqual(g.vb.w);
      expect(s.nokta.y).toBeGreaterThanOrEqual(0);
      expect(s.nokta.y).toBeLessThanOrEqual(g.vb.h);
    }
  });
  it("kuzey yukarı: daha yüksek enlem daha küçük ekran-y", () => {
    // C (en yüksek lat) ekranda A'dan yukarıda (küçük y) olmalı
    const yA = g.istasyonlar[0].nokta.y, yC = g.istasyonlar[2].nokta.y;
    expect(yC).toBeLessThan(yA);
  });
  it("konum(1000) orta istasyona yakın", () => {
    const p = g.konum(1000), b = g.istasyonlar[1].nokta;
    expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeLessThan(1);
  });
  it("koordinat eksikse ölçekli plana düşer", () => {
    const eksik = cografiGeometri(line, { A: { lat: 37.87, lon: 32.48 } }, 900);
    expect(eksik.coordluMu).toBe(false);
  });
});
