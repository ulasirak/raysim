import { describe, it, expect } from "vitest";
import { haritaKisitlari, yeniRing, yeniMakas, yeniKurp } from "../ring";
import { varsayilanConfig } from "@/lib/anaray/config";

// haritaKisitlari: makas/geçit/tehlike/kurp → mutlak km + hız sınırı (km/h) + kurp konfor önerisi.
describe("haritaKisitlari (harita hız sınırı işaretleri)", () => {
  const cfg = varsayilanConfig;
  function ringMakasli(uz: number, from: string, to: string) {
    const r = yeniRing(from, to); r.uzunluk = uz;
    const m = yeniMakas("karsilasmali", Math.round(uz * 0.5));
    r.makaslar = [m];
    return r;
  }

  it("her makas için km/h'lı kısıt üretir; konum MUTLAK (ring offset dâhil)", () => {
    const r1 = ringMakasli(1000, "A", "B");
    const r2 = ringMakasli(800, "B", "C");
    const k = haritaKisitlari([r1, r2], cfg);
    const makaslar = k.filter((x) => x.tur === "makas");
    expect(makaslar.length).toBe(2);
    // ikinci ring'in makası mutlak km ~1000+400 = 1400
    expect(makaslar[1].konum).toBeGreaterThan(1000);
    expect(makaslar[0].vmax).toBeGreaterThan(0); // makas geçiş hızı km/h
    expect(makaslar.every((x) => /km\/h/.test(x.detay))).toBe(true);
  });

  it("kurp: yüksek doluluk → konfor önerisi (oneriVKmh + kalabalik seviye)", () => {
    const r = yeniRing("A", "B"); r.uzunluk = 1000;
    r.kurplar = [{ ...yeniKurp(500), uzunluk: 80, yaricap: 300 }];
    const dol = { [r.id]: 0.95 }; // %95 doluluk (kalabalık)
    const k = haritaKisitlari([r], cfg, dol);
    const kurp = k.find((x) => x.tur === "kurp");
    expect(kurp).toBeDefined();
    expect(kurp!.seviye).toBe("kalabalik");
    expect(kurp!.oneriVKmh).toBeGreaterThan(0);
    expect(kurp!.vmax).toBeGreaterThan(0);
  });

  it("kısıt yoksa boş; sıralı (konuma göre)", () => {
    const r = yeniRing("A", "B"); r.uzunluk = 500;
    expect(haritaKisitlari([r], cfg).length).toBe(0);
  });
});
