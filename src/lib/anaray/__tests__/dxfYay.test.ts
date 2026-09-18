import { describe, it, expect } from "vitest";
import { dxfAyristir } from "@/lib/anaray/dxf";
import { ucNoktaYaricap, kurplariBul } from "@/lib/anaray/kurpBul";

// Bir polyline'ın orta üçlüsünden yarıçap (yay üzerindeki noktalar → tam R).
function ortaYaricap(pts: { x: number; y: number }[]): number {
  const i = Math.floor(pts.length / 2);
  return ucNoktaYaricap(pts[i - 1], pts[i], pts[i + 1]).R;
}

describe("dxf ARC + bulge → yarıçap kesin çıkar", () => {
  it("LWPOLYLINE bulge (çeyrek yay R=100) noktalara açılır, R≈100", () => {
    const b = Math.tan((90 / 4) * Math.PI / 180); // ≈0.41421
    const dxf = ["0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "RAY", "90", "2", "70", "0",
      "10", "100.0", "20", "0.0", "42", `${b}`,
      "10", "0.0", "20", "100.0",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    const geo = dxfAyristir(dxf);
    const pl = geo.polylines.find((p) => p.layer === "RAY")!;
    expect(pl.pts.length).toBeGreaterThan(8);          // yay açıldı (2 değil)
    expect(ortaYaricap(pl.pts)).toBeCloseTo(100, 0);
  });

  it("ARC varlığı (R=80) noktalara açılır, R≈80", () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES",
      "0", "ARC", "8", "RAY", "10", "200.0", "20", "0.0", "40", "80.0", "50", "90.0", "51", "180.0",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    const geo = dxfAyristir(dxf);
    const pl = geo.polylines.find((p) => p.layer === "RAY")!;
    expect(pl.pts.length).toBeGreaterThan(8);
    expect(ortaYaricap(pl.pts)).toBeCloseTo(80, 0);
    // kurplariBul da bu yayı R≈80 kurp olarak bulmalı
    const k = kurplariBul(pl.pts);
    expect(k.length).toBe(1);
    expect(k[0].yaricap).toBeCloseTo(80, 0);
  });

  it("düz polyline (bulge yok) aynen kalır", () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "RAY", "90", "3", "70", "0",
      "10", "0", "20", "0", "10", "50", "20", "0", "10", "100", "20", "0",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    const geo = dxfAyristir(dxf);
    const pl = geo.polylines.find((p) => p.layer === "RAY")!;
    expect(pl.pts.length).toBe(3);
  });
});
