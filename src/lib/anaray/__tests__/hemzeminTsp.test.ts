import { describe, it, expect } from "vitest";
import { hemzeminBeklemeSn, type Hemzemin } from "../ring";

// Gerçek TSP modeli: karayolu sinyal gecikmesi (Webster üniform: kırmızı²/2·devir),
// öncelik etkin kırmızıyı kısar (pasif ~%50, aktif ~%95). "elle" = girilen değer.
const hz = (p: Partial<Hemzemin>): Hemzemin => ({ id: "x", ad: "", tip: "karayolu", konum: 0, hiz: 25 / 3.6, ...p });

describe("hemzeminBeklemeSn — TSP sinyal önceliği modeli", () => {
  it("yaya geçidinde her zaman 0 (durma yok)", () => {
    expect(hemzeminBeklemeSn(hz({ tip: "yaya", bekleme: 30, tsp: "aktif", sinyalDevri: 90 }))).toBe(0);
  });

  it("“elle” mod (varsayılan) → girilen beklemeyi döndürür", () => {
    expect(hemzeminBeklemeSn(hz({ bekleme: 18 }))).toBe(18);
    expect(hemzeminBeklemeSn(hz({ tsp: "elle", bekleme: 25 }))).toBe(25);
  });

  it("“öncelik yok” → tam Webster gecikmesi (kırmızı²/2C)", () => {
    // C=90, g=45 → kırmızı=45 → 45²/180 = 11.25 → 11
    expect(hemzeminBeklemeSn(hz({ tsp: "yok", sinyalDevri: 90, yesilSure: 45 }))).toBe(11);
  });

  it("pasif TSP etkin kırmızıyı ~%50 kısar", () => {
    // kırmızıEtkin=22.5 → 22.5²/180 = 2.8125 → 3
    expect(hemzeminBeklemeSn(hz({ tsp: "pasif", sinyalDevri: 90, yesilSure: 45 }))).toBe(3);
  });

  it("aktif TSP etkin kırmızıyı ~%95 kısar → beklemeyi ~0'a indirir", () => {
    expect(hemzeminBeklemeSn(hz({ tsp: "aktif", sinyalDevri: 90, yesilSure: 45 }))).toBe(0);
  });

  it("sinyal modu ama devir girilmemiş → elle beklemeye düşer (uydurma yok)", () => {
    expect(hemzeminBeklemeSn(hz({ tsp: "yok", bekleme: 12 }))).toBe(12);
  });

  it("daha iyi öncelik → daha düşük bekleme (monotonluk)", () => {
    const d = { sinyalDevri: 100, yesilSure: 40 } as const;
    const yok = hemzeminBeklemeSn(hz({ tsp: "yok", ...d }));
    const pasif = hemzeminBeklemeSn(hz({ tsp: "pasif", ...d }));
    const aktif = hemzeminBeklemeSn(hz({ tsp: "aktif", ...d }));
    expect(yok).toBeGreaterThan(pasif);
    expect(pasif).toBeGreaterThanOrEqual(aktif);
  });
});
