// KONYA KOORDİNAT eşleştirici (Büyük sıçrama D) — tam + normalize-substring yedeği.
import { describe, it, expect } from "vitest";
import { konyaKoordinatBul, KONYA_TRAM_KOORDINAT } from "../konyaKoordinat";

describe("konyaKoordinatBul", () => {
  it("tam ad eşleşir", () => {
    const c = konyaKoordinatBul("Alaaddin");
    expect(c).toBeDefined();
    expect(c!.lat).toBeCloseTo(37.871634, 4);
  });
  it("Türkçe/büyük-küçük/noktalama toleransı", () => {
    expect(konyaKoordinatBul("  MEVLANA ")).toBeDefined();
    expect(konyaKoordinatBul("fırat caddesi")).toBeDefined();
  });
  it("substring yedeği: hazır-hat adı ↔ OSM adı farkı", () => {
    // OSM "Karşehir Caddesi" ↔ hazır "Karşehir"
    expect(konyaKoordinatBul("Karşehir")).toBeDefined();
    // OSM "Belediye" ↔ hazır "Selçuklu Belediyesi"
    expect(konyaKoordinatBul("Selçuklu Belediyesi")).toBeDefined();
  });
  it("bilinmeyen ad → undefined", () => {
    expect(konyaKoordinatBul("Olmayan İstasyon XYZ")).toBeUndefined();
  });
  it("41 istasyon kayıtlı", () => {
    expect(Object.keys(KONYA_TRAM_KOORDINAT).length).toBe(41);
  });
});
