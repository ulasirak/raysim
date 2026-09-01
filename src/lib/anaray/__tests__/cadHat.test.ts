import { describe, it, expect } from "vitest";
import { dxfAyristir } from "../dxf";
import { cadHatKur, katmanTahmini, type CadGeometri } from "../cadHat";

// Sentetik DXF: RAY katmanında iki parçalı bir polyline (0,0)->(1000,0)->(2000,0),
// DURAK katmanında 3 nokta + adları için 3 metin. Birim = metre ($INSUNITS=6).
const DXF = `0
SECTION
2
HEADER
9
$INSUNITS
70
6
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
RAY
90
2
70
0
10
0
20
0
10
1000
20
0
0
LINE
8
RAY
10
1000
20
0
11
2000
21
0
0
POINT
8
DURAK
10
0
20
0
0
POINT
8
DURAK
10
1000
20
0
0
POINT
8
DURAK
10
2000
20
0
0
TEXT
8
ADLAR
10
0
20
5
1
Merkez
0
TEXT
8
ADLAR
10
1000
20
5
1
Sanayi
0
TEXT
8
ADLAR
10
2000
20
5
1
Terminal
0
ENDSEC
0
EOF`;

describe("DXF → CAD hat kurma", () => {
  const geo = dxfAyristir(DXF);

  it("varlıkları ve katmanları çıkarır", () => {
    expect(geo.polylines.length).toBe(2);       // 1 LWPOLYLINE + 1 LINE
    expect(geo.points.length).toBe(3);
    expect(geo.labels.length).toBe(3);
    expect(geo.katmanlar).toContain("RAY");
    expect(geo.katmanlar).toContain("DURAK");
    expect(geo.birimOlcek).toBe(1);             // metre
  });

  it("katman rollerini tahmin eder", () => {
    const t = katmanTahmini(geo as unknown as CadGeometri);
    expect(t.guzergahKatman).toContain("RAY");
    expect(t.durakKatman).toContain("DURAK");
  });

  it("parçaları diker, durakları izdüşürür, doğru mesafeli ring kurar", () => {
    const s = cadHatKur(geo as unknown as CadGeometri, { guzergahKatman: ["RAY"], durakKatman: ["DURAK"] }, "Test Hattı");
    expect(s.rings.length).toBe(2);
    expect(s.durakSayisi).toBe(3);
    expect(s.rings[0].fromAd).toBe("Merkez");
    expect(s.rings[0].toAd).toBe("Sanayi");
    expect(s.rings[0].uzunluk).toBe(1000);       // 0→1000 m
    expect(s.rings[1].uzunluk).toBe(1000);       // 1000→2000 m
    expect(s.toplamKm).toBeCloseTo(2, 3);
    // Zorunlu makas/sinyal uyarısı düşer.
    expect(s.uyarilar.some((u) => /Makas ve sinyaller içe AKTARILMADI/i.test(u))).toBe(true);
  });
});
