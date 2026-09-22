import { describe, it, expect } from "vitest";
import { osmHatKur, type OsmSegment } from "../osmHat";

// ~111 m ≈ 0.001° enlem. Basit doğu-batı segmentler (sabit enlem) → mesafeler öngörülebilir.
const seg = (adlar: string[], lat = 41.3, lon0 = 36.30, dlon = 0.01): OsmSegment => ({
  ad: adlar[0] + " hattı",
  duraklar: adlar.map((ad, i) => ({ ad, lat, lon: +(lon0 + i * dlon).toFixed(6) })),
  geometri: adlar.map((_, i) => [lat, +(lon0 + i * dlon).toFixed(6)] as [number, number]),
});

describe("osmHatKur", () => {
  it("tek segmentten ring zinciri kurar (n durak → n-1 ring)", () => {
    const s = seg(["A", "B", "C", "D"]);
    const r = osmHatKur([s]);
    expect(r.rings).toHaveLength(3);
    expect(r.durakSayisi).toBe(4);
    expect(r.duraklar.map((d) => d.ad)).toEqual(["A", "B", "C", "D"]);
    // 0.01° boylam @41.3° ≈ 836 m → makul aralık
    for (const ring of r.rings) expect(ring.uzunluk).toBeGreaterThan(700);
    expect(r.toplamKm).toBeGreaterThan(2);
    expect(r.geometri.length).toBeGreaterThanOrEqual(2);
  });

  it("koordinatları ve önizlemeyi taşır", () => {
    const r = osmHatKur([seg(["A", "B"])]);
    expect(r.duraklar[0]).toMatchObject({ ad: "A", lat: 41.3 });
    expect(r.onizleme[0].km).toBe(0);
    expect(r.onizleme[1].km).toBeGreaterThan(0);
  });

  it("iki segmenti ortak uç durağından birleştirir (stitch)", () => {
    // Seg1: A..C (Gar=C). Seg2: C..E (Gar=C başta). Ortak C bir kez.
    const s1 = seg(["A", "B", "Gar"], 41.3, 36.30, 0.01);
    const s2: OsmSegment = {
      ad: "doğu",
      duraklar: [
        { ad: "Gar", lat: 41.3, lon: 36.32 },   // s1'in son durağıyla aynı ad
        { ad: "D", lat: 41.3, lon: 36.33 },
        { ad: "E", lat: 41.3, lon: 36.34 },
      ],
      geometri: [[41.3, 36.32], [41.3, 36.33], [41.3, 36.34]],
    };
    const r = osmHatKur([s1, s2], "Birleşik");
    expect(r.duraklar.map((d) => d.ad)).toEqual(["A", "B", "Gar", "D", "E"]);
    expect(r.rings).toHaveLength(4);
    expect(r.ad).toBe("Birleşik");
  });

  it("ters yönlü segmenti otomatik çevirerek birleştirir", () => {
    // Hat A..Gar (doğuya). İkinci segment E..Gar (Gar sonda) → ters çevrilip eklenmeli.
    const s1 = seg(["A", "B", "Gar"], 41.3, 36.30, 0.01); // A(36.30) B(36.31) Gar(36.32)
    const s2: OsmSegment = {
      ad: "ters",
      duraklar: [
        { ad: "E", lat: 41.3, lon: 36.34 },
        { ad: "D", lat: 41.3, lon: 36.33 },
        { ad: "Gar", lat: 41.3, lon: 36.32 }, // son durak = hat sonu
      ],
      geometri: [[41.3, 36.34], [41.3, 36.33], [41.3, 36.32]],
    };
    const r = osmHatKur([s1, s2]);
    expect(r.duraklar.map((d) => d.ad)).toEqual(["A", "B", "Gar", "D", "E"]);
  });

  it("2 duraktan az → hata", () => {
    expect(() => osmHatKur([{ ad: "x", duraklar: [{ ad: "A", lat: 41, lon: 36 }], geometri: [] }])).toThrow();
  });
});
