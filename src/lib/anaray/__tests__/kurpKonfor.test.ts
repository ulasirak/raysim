import { describe, it, expect } from "vitest";
import { varsayilanConfig } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { kurpYanalIvme, ringChallenge, yeniRing, yeniKurp, type Kurp } from "@/lib/anaray/ring";

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
});
