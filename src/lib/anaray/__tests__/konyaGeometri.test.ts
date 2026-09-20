// Konya gerçek track geometrisi (Büyük sıçrama D) — bütünlük + projeksiyon.
import { describe, it, expect } from "vitest";
import { KONYA_GEOMETRI } from "../konyaGeometri";
import { cografiGeometri } from "../cografi";
import type { Line, Station } from "@/lib/anaray/types";

describe("KONYA_GEOMETRI bütünlük (OSM, uydurma yok)", () => {
  it("96 yol · 374 nokta · tram+inşaat", () => {
    expect(KONYA_GEOMETRI.length).toBe(96);
    const pts = KONYA_GEOMETRI.reduce((a, w) => a + w.noktalar.length, 0);
    expect(pts).toBe(374);
    expect(KONYA_GEOMETRI.filter((w) => !w.insaat).length).toBe(63);
    expect(KONYA_GEOMETRI.filter((w) => w.insaat).length).toBe(33);
  });
  it("tüm noktalar Konya bbox içinde", () => {
    for (const w of KONYA_GEOMETRI) for (const [lat, lon] of w.noktalar) {
      expect(lat).toBeGreaterThan(37.7); expect(lat).toBeLessThan(38.1);
      expect(lon).toBeGreaterThan(32.3); expect(lon).toBeLessThan(32.7);
    }
  });
});

describe("cografiGeometri projekteEt", () => {
  const ist = (id: string, name: string, position: number, lat: number, lon: number) => ({ st: { id, name, position, dwell: 20 } as Station, lat, lon });
  const a = ist("a", "A", 0, 37.87, 32.49), b = ist("b", "B", 1000, 37.88, 32.50), c = ist("c", "C", 2000, 37.89, 32.51);
  const line: Line = { id: "L", name: "T", length: 2000, stations: [a.st, b.st, c.st], segments: [] };
  const koord = { A: { lat: a.lat, lon: a.lon }, B: { lat: b.lat, lon: b.lon }, C: { lat: c.lat, lon: c.lon } };
  const g = cografiGeometri(line, koord, 900);
  it("koordinatlı kipte projekteEt tanımlı + istasyon noktasıyla tutarlı", () => {
    expect(g.projekteEt).toBeDefined();
    const p = g.projekteEt!(b.lat, b.lon);
    const bN = g.istasyonlar[1].nokta;
    expect(Math.hypot(p.x - bN.x, p.y - bN.y)).toBeLessThan(1);
  });
  it("koordinatsız kipte projekteEt undefined", () => {
    expect(cografiGeometri(line, undefined, 900).projekteEt).toBeUndefined();
  });
});
