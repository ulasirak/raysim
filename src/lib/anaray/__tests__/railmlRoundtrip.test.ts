import { describe, it, expect } from "vitest";
import { railmlIhrac, railmlHatKur } from "@/lib/anaray/railml";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";

describe("railML export → import round-trip", () => {
  it("birleşik hat: dışa aktar → içe aktar → durak sayısı + mesafeler korunur", () => {
    const h = hazirHatlar().find((x) => x.key === "birlesik")!;
    const rings = h.veri.rings ?? [];
    const xml = railmlIhrac(rings, h.ad);
    // Geçerli railML + ocp'ler
    expect(xml).toContain("<railml");
    expect(xml).toContain("<operationControlPoints>");
    expect(xml).toContain("ocpRef=");
    // Round-trip
    const geri = railmlHatKur(xml);
    // İstasyon sayısı = ring+1
    expect(geri.durakSayisi).toBe(rings.length + 1);
    // Toplam km ~ aynı (yuvarlama toleransı)
    const beklenenKm = rings.reduce((s, r) => s + r.uzunluk, 0) / 1000;
    expect(Math.abs(geri.toplamKm - beklenenKm)).toBeLessThan(0.05);
    // İlk ring mesafesi korunmuş
    expect(Math.abs(geri.rings[0].uzunluk - rings[0].uzunluk)).toBeLessThanOrEqual(1);
  });
  it("XML özel karakter kaçışı (& < >)", () => {
    const h = hazirHatlar().find((x) => x.key === "mevcut")!;
    const xml = railmlIhrac(h.veri.rings ?? [], "A & B <test>");
    expect(xml).toContain("A &amp; B &lt;test&gt;");
    expect(xml).not.toContain("A & B <test>");
  });
});
