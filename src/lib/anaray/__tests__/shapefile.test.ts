import { describe, it, expect } from "vitest";
import { zipSync } from "fflate";
import { shapefileGeometri } from "../shapefile";
import { cadHatKur, katmanTahmini, type CadGeometri } from "../cadHat";

// — Sentetik shapefile binary kurucuları (parser'ı round-trip doğrulamak için) —

function pointShp(pts: { x: number; y: number }[]): Uint8Array {
  const recBytes = 20; // type(4)+X(8)+Y(8)
  const total = 100 + pts.length * (8 + recBytes);
  const b = new Uint8Array(total); const dv = new DataView(b.buffer);
  dv.setInt32(0, 9994, false);            // file code
  dv.setInt32(24, total / 2, false);      // file length (words)
  dv.setInt32(28, 1000, true);            // version
  dv.setInt32(32, 1, true);               // shape type Point
  let o = 100;
  pts.forEach((p, i) => {
    dv.setInt32(o, i + 1, false);         // record number (BE)
    dv.setInt32(o + 4, recBytes / 2, false); // content length words (BE)
    dv.setInt32(o + 8, 1, true);          // shape type
    dv.setFloat64(o + 12, p.x, true);
    dv.setFloat64(o + 20, p.y, true);
    o += 8 + recBytes;
  });
  return b;
}

function polylineShp(pts: { x: number; y: number }[]): Uint8Array {
  const content = 4 + 32 + 4 + 4 + 4 + pts.length * 16; // type+box+nParts+nPts+parts(1)+points
  const total = 100 + 8 + content;
  const b = new Uint8Array(total); const dv = new DataView(b.buffer);
  dv.setInt32(0, 9994, false);
  dv.setInt32(24, total / 2, false);
  dv.setInt32(28, 1000, true);
  dv.setInt32(32, 3, true);               // PolyLine
  const o = 100;
  dv.setInt32(o, 1, false);               // record number
  dv.setInt32(o + 4, content / 2, false); // content length words
  let p = o + 8;
  dv.setInt32(p, 3, true); p += 4;        // shape type
  p += 32;                                 // box (0)
  dv.setInt32(p, 1, true); p += 4;        // numParts
  dv.setInt32(p, pts.length, true); p += 4; // numPoints
  dv.setInt32(p, 0, true); p += 4;        // parts[0]
  pts.forEach((q) => { dv.setFloat64(p, q.x, true); dv.setFloat64(p + 8, q.y, true); p += 16; });
  return b;
}

function dbf(field: string, values: string[]): Uint8Array {
  const flen = 16;
  const headerSize = 32 + 32 + 1;
  const recordSize = 1 + flen;
  const total = headerSize + values.length * recordSize + 1;
  const b = new Uint8Array(total); const dv = new DataView(b.buffer);
  b[0] = 0x03;
  dv.setInt32(4, values.length, true);
  dv.setInt16(8, headerSize, true);
  dv.setInt16(10, recordSize, true);
  // Alan tanımı @32
  for (let i = 0; i < field.length && i < 11; i++) b[32 + i] = field.charCodeAt(i);
  b[32 + 11] = "C".charCodeAt(0);   // tip C
  b[32 + 16] = flen;                // uzunluk
  b[64] = 0x0d;                     // terminator
  let o = headerSize;
  for (const v of values) {
    b[o] = 0x20; // silme bayrağı
    for (let i = 0; i < flen; i++) b[o + 1 + i] = i < v.length ? v.charCodeAt(i) : 0x20;
    o += recordSize;
  }
  b[total - 1] = 0x1a; // dosya sonu
  return b;
}

const PRJ = 'PROJCS["WGS_1984_UTM_Zone_36N",UNIT["Metre",1.0]]';

describe("Shapefile → CAD hat kurma", () => {
  const zip = zipSync({
    "hat.shp": polylineShp([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }]),
    "hat.prj": new TextEncoder().encode(PRJ),
    "duraklar.shp": pointShp([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 2000, y: 0 }]),
    "duraklar.dbf": dbf("AD", ["Merkez", "Sanayi", "Terminal"]),
    "duraklar.prj": new TextEncoder().encode(PRJ),
  });

  const geo = shapefileGeometri(zip) as CadGeometri & { adAlanlari: string[] };

  it("shp + dbf + prj çıkarır (projeksiyonlu metre korunur)", () => {
    expect(geo.polylines.length).toBe(1);
    expect(geo.points.length).toBe(3);
    expect(geo.labels.length).toBe(3);
    expect(geo.birimOlcek).toBe(1);
    expect(geo.adAlanlari).toContain("AD");
    expect(geo.labels[0].metin).toBe("Merkez");
  });

  it("katman tahmini + ring kurma doğru mesafeli", () => {
    const t = katmanTahmini(geo);
    const s = cadHatKur(geo, t, "SHP Hattı");
    expect(s.rings.length).toBe(2);
    expect(s.durakSayisi).toBe(3);
    expect(s.rings[0].uzunluk).toBe(1000);
    expect(s.duraklar.map((d) => d.ad).join(">")).toBe("Merkez>Sanayi>Terminal");
  });
});
