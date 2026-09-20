// Genel istasyon-adı eşleştirici (gömülü değil) — OSM listesiyle.
import { describe, it, expect } from "vitest";
import { adEsleKoordinat, osmKoordinatEsle } from "../adEsle";

const osm = [
  { ad: "Alaaddin", lat: 37.8716, lon: 32.4935 },
  { ad: "Fetih Caddesi", lat: 37.8700, lon: 32.5260 },
  { ad: "Belediye", lat: 37.8767, lon: 32.4885 },
  { ad: "Mevlana", lat: 37.8706, lon: 32.5066 },
];

describe("adEsleKoordinat", () => {
  it("tam eşleşme", () => expect(adEsleKoordinat("Mevlana", osm)?.lat).toBeCloseTo(37.8706, 3));
  it("Türkçe/büyük-küçük toleransı", () => expect(adEsleKoordinat("  MEVLANA ", osm)).toBeDefined());
  it("alias: Alaattin → Alaaddin", () => expect(adEsleKoordinat("Alaattin", osm)?.lat).toBeCloseTo(37.8716, 3));
  it("substring: Fetih → Fetih Caddesi", () => expect(adEsleKoordinat("Fetih", osm)).toBeDefined());
  it("substring: Selçuklu Belediyesi → Belediye", () => expect(adEsleKoordinat("Selçuklu Belediyesi", osm)).toBeDefined());
  it("bilinmeyen → undefined", () => expect(adEsleKoordinat("Olmayan Durak", osm)).toBeUndefined());
});
describe("osmKoordinatEsle", () => {
  it("hat durakları → eşleşen koordinatlar", () => {
    const r = osmKoordinatEsle(["Alaattin", "Mevlana", "Fetih", "Yok"], osm);
    expect(Object.keys(r).length).toBe(3);
    expect(r["Alaattin"]).toBeDefined();
  });
});
