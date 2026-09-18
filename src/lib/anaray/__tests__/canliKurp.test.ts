import { describe, it, expect } from "vitest";
import { ringlerdenSebeke } from "@/lib/anaray/network";
import { flattenRoute } from "@/lib/anaray/network";
import { simulate } from "@/lib/anaray/sim";
import { varsayilanConfig } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { yeniRing, yeniKurp, type DurakArasiRing, type Kurp } from "@/lib/anaray/ring";

describe("canlı ağ hattı kurbu içerir + kurptan önce frenler", () => {
  it("kurp bölgesinde hız kısıtlı, öncesinde yavaşlama var", () => {
    const rA: DurakArasiRing = { ...yeniRing("A", "B"), uzunluk: 800, worstUzunluk: 800, bestUzunluk: 800, vmax: 50 / 3.6, kurplar: [{ ...yeniKurp(400), yaricap: 50, uzunluk: 50 }] as Kurp[] };
    const rB: DurakArasiRing = { ...yeniRing("B", "C"), uzunluk: 500, worstUzunluk: 500, bestUzunluk: 500, vmax: 50 / 3.6 };
    const sebeke = ringlerdenSebeke([rA, rB], varsayilanConfig);
    expect(sebeke).not.toBeNull();
    const line = flattenRoute(sebeke!.network, sebeke!.route);
    // Canlı ağ hattının segmentlerinde kurp hız düşüşü var mı? (~6.5 m/s = R50)
    const kurpSeg = line.segments.find((s) => s.start >= 370 && s.end <= 430);
    expect(kurpSeg).toBeTruthy();
    expect(kurpSeg!.vmax).toBeLessThan(7); // R50 ≈ 6.5 m/s

    const res = simulate(line, varsayilanArac, 0.5);
    const inZone = res.points.filter((p) => p.s >= 380 && p.s <= 420);
    const before = res.points.filter((p) => p.s >= 150 && p.s <= 340);
    const vZoneMax = Math.max(...inZone.map((p) => p.v));
    const vBeforeMax = Math.max(...before.map((p) => p.v));
    expect(vZoneMax).toBeLessThan(7.2);            // kurpta hız kısıtlı
    expect(vBeforeMax).toBeGreaterThan(9);          // öncesinde daha hızlıydı → frenleyerek indi
  });
});
