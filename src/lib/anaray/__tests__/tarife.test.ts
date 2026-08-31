// Tarife (zaman çizelgesi) çekirdeği testi.

import { describe, it, expect } from "vitest";
import { tarifeUret, aracDiyagrami } from "@/lib/anaray/tarife";

describe("Tarife üretimi", () => {
  // çevrim 600 s, headway 300 s → filo 2; pencere 0..900 → 0,300,600,900 (4 sefer).
  const t = tarifeUret(600, 300, 0, 900);

  it("filo = ⌈çevrim ÷ headway⌉ = 2", () => expect(t.filo).toBe(2));
  it("4 sefer, headway aralıklı", () => {
    expect(t.seferSayisi).toBe(4);
    expect(t.seferler.map((s) => s.kalkisSn)).toEqual([0, 300, 600, 900]);
  });
  it("araç dönüşümlü atanır (1,2,1,2)", () => {
    expect(t.seferler.map((s) => s.aracNo)).toEqual([1, 2, 1, 2]);
  });
  it("varış = kalkış + çevrim", () => expect(t.seferler[0].varisSn).toBe(600));
  it("layover = headway×filo − çevrim = 0", () => expect(t.layoverSn).toBe(0));

  it("araç diyagramı: her araç kendi kalkışları", () => {
    const d = aracDiyagrami(t);
    expect(d).toHaveLength(2);
    expect(d[0]).toEqual({ aracNo: 1, kalkislar: [0, 600] });
    expect(d[1]).toEqual({ aracNo: 2, kalkislar: [300, 900] });
  });

  it("gerçekçi: çevrim 8000 s, headway 240 s → filo 34, layover 160 s", () => {
    const b = tarifeUret(8000, 240, 21600, 86400); // 06:00–24:00
    expect(b.filo).toBe(34);
    expect(b.layoverSn).toBe(34 * 240 - 8000);
    expect(b.seferler[0].aracNo).toBe(1);
    expect(b.seferler[34].aracNo).toBe(1); // 35. sefer → 1. araca döner
  });

  it("geçersiz girdi → boş", () => {
    expect(tarifeUret(0, 300, 0, 900).gecerli).toBe(false);
    expect(tarifeUret(600, 300, 900, 0).gecerli).toBe(false);
  });

  it("tur başı mola çevrime eklenir → filo artar, layover mola'yı düşer", () => {
    // çevrim 600, headway 300, mola 120 → (600+120)/300 = 2.4 → filo 3
    const m = tarifeUret(600, 300, 0, 900, 120);
    expect(m.filo).toBe(3);
    expect(m.molaSn).toBe(120);
    // layover = filo×headway − çevrim − mola = 3×300 − 600 − 120 = 180
    expect(m.layoverSn).toBe(180);
    // varış hâlâ trip süresi kadar (mola varıştan SONRA); kalkışlar headway aralıklı
    expect(m.seferler[0].varisSn).toBe(600);
    expect(m.seferler.map((s) => s.kalkisSn).slice(0, 3)).toEqual([0, 300, 600]);
  });

  it("mola = 0 → eski davranışla birebir", () => {
    const a = tarifeUret(600, 300, 0, 900, 0);
    const b = tarifeUret(600, 300, 0, 900);
    expect(a.filo).toBe(b.filo);
    expect(a.layoverSn).toBe(b.layoverSn);
  });
});
