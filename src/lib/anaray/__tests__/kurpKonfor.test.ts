import { describe, it, expect } from "vitest";
import { varsayilanConfig } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { kurpYanalIvme, kurpKonforAnaliz, ringChallenge, yeniRing, yeniKurp, type Kurp } from "@/lib/anaray/ring";

describe("kurp konfor / yanal ivme", () => {
  const cfg = varsayilanConfig; // aYanalKonfor = 0.85

  it("yarıçaptan türeyen hızda yanal ivme = aYanalKonfor (tasarım)", () => {
    const k: Kurp = { ...yeniKurp(200), yaricap: 120, dever: 0 };
    expect(kurpYanalIvme(k, cfg)).toBeCloseTo(cfg.aYanalKonfor, 5);
  });

  it("dever eklenince aynı yarıçapta yanal ivme = aYanalKonfor kalır (hız dever kadar artar)", () => {
    const k: Kurp = { ...yeniKurp(200), yaricap: 120, dever: 0.1 };
    expect(kurpYanalIvme(k, cfg)).toBeCloseTo(cfg.aYanalKonfor, 5);
  });

  it("elle fazla hız → yanal ivme aşımı → challenge bayrağı", () => {
    const ring = { ...yeniRing("A", "B"), uzunluk: 600, kurplar: [{ ...yeniKurp(300), yaricap: 50, hizManuel: 40 / 3.6 }] as Kurp[] };
    const a = kurpYanalIvme(ring.kurplar[0], cfg);
    expect(a).toBeGreaterThan(2); // (11.1)²/50 ≈ 2.47
    const flags = ringChallenge(ring, varsayilanArac, cfg);
    expect(flags.some((f) => f.tur === "kurp-konfor")).toBe(true);
  });

  it("makul yarıçap kurpu challenge üretmez (tasarım içinde)", () => {
    const ring = { ...yeniRing("A", "B"), uzunluk: 600, kurplar: [{ ...yeniKurp(300), yaricap: 150 }] as Kurp[] };
    const flags = ringChallenge(ring, varsayilanArac, cfg);
    expect(flags.some((f) => f.tur === "kurp-konfor")).toBe(false);
  });

  it("kurpKonforAnaliz: doluluk kalabalık uyarısını devreye alır/kapatır", () => {
    const ring = { ...yeniRing("A", "B"), uzunluk: 600, kurplar: [{ ...yeniKurp(300), yaricap: 120 }] as Kurp[] };
    const dusuk = kurpKonforAnaliz([ring], cfg, { [ring.id]: 0.4 }); // tasarım a=0.85 ama doluluk düşük
    expect(dusuk[0].seviye).toBe("ok");
    const yuksek = kurpKonforAnaliz([ring], cfg, { [ring.id]: 0.95 }); // kalabalık → ayakta yolcu için sıkı
    expect(yuksek[0].seviye).toBe("kalabalik");
    expect(yuksek[0].oneriVKmh).toBeGreaterThan(0);
  });

  it("kurpKonforAnaliz: elle aşım → 'asim' + öneri hız", () => {
    const ring = { ...yeniRing("A", "B"), uzunluk: 600, kurplar: [{ ...yeniKurp(300), yaricap: 50, hizManuel: 40 / 3.6 }] as Kurp[] };
    const s = kurpKonforAnaliz([ring], cfg, { [ring.id]: 0.3 });
    expect(s[0].seviye).toBe("asim");
    expect(s[0].oneriVKmh).toBeLessThan(40);
  });
});
