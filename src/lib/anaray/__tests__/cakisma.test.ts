import { describe, it, expect } from "vitest";
import { cakismaTespit } from "@/lib/anaray/cakisma";
import { loopToHat } from "@/lib/anaray/hatsim";
import { loopYorunge } from "@/lib/anaray/signalling";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanIsletme } from "@/lib/anaray/config";
import type { Line } from "@/lib/anaray/types";

function reverseLineOf(line: Line): Line {
  const L = line.length;
  return {
    ...line, id: line.id + "-rev", name: line.name + " (dönüş)",
    stations: line.stations.map((s) => ({ ...s, position: L - s.position })).reverse(),
    segments: line.segments.map((s) => ({ start: L - s.end, end: L - s.start, vmax: s.vmax, gradient: -s.gradient })).reverse(),
  };
}

function kur(tekHatIndex: number | null, filo: number) {
  const h = hazirHatlar().find((x) => x.key === "mevcut")!;
  const cfg = h.veri.cfg;
  const stock = h.veri.arac!;
  const rings = (h.veri.rings ?? []).map((r, i) => (i === tekHatIndex ? { ...r, tekHat: true } : { ...r, tekHat: false }));
  const line = loopToHat(rings, true, cfg).line;
  const loopY = loopYorunge(line, reverseLineOf(line), stock, { peronIsgaliBas: 60, peronIsgaliSon: 60 });
  const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
  return { rings, stock, cfg, loopY, isletme, filo };
}

describe("#2 çakışma tespiti", () => {
  it("tümüyle çift hat + makul filo → çakışma yok", () => {
    const { rings, stock, cfg, loopY, isletme } = kur(null, 3);
    const r = cakismaTespit(rings, stock, cfg, loopY, 3, isletme);
    expect(r.spanlar.length).toBe(0);
    expect(r.spanOzet.length).toBe(0);
    expect(r.cakismaVar).toBe(false);
  });

  it("orta kesim tek hat + çift yön filo → karşılaşma çakışması bulunur", () => {
    const idx = 3; // orta ring tek hat
    const { rings, stock, cfg, loopY, isletme } = kur(idx, 4);
    const r = cakismaTespit(rings, stock, cfg, loopY, 4, isletme);
    expect(r.spanlar.length).toBe(1);
    expect(r.cakismaVar).toBe(true);
    expect(r.spanOzet.length).toBe(1);
    const o = r.spanOzet[0];
    expect(o.cakismaSayisi).toBeGreaterThan(0);
    expect(o.maxOrtusme).toBeGreaterThan(0);
    expect(o.karsiYon).toBe(true); // zıt yön trenler tek hatta karşılaşır
    expect(o.oneri).toContain("geçiş cebi");
    // Ham olaylar grafik için üretildi
    expect(r.cakismalar.length).toBeGreaterThan(0);
    expect(r.cakismalar[0].tip).toBe("tekhat");
  });

  it("aşırı filo → sistemik headway<hMin uyarısı", () => {
    const { rings, stock, cfg, loopY, isletme } = kur(null, 40);
    const r = cakismaTespit(rings, stock, cfg, loopY, 40, isletme);
    expect(r.sistemik).not.toBeNull();
    expect(r.sistemik!.hMin).toBeGreaterThan(r.sistemik!.ulasilan);
    expect(r.sistemik!.oneri).toContain("Headway");
  });

  it("filo=1 → hiç çakışma yok (tek hat olsa bile)", () => {
    const { rings, stock, cfg, loopY, isletme } = kur(3, 1);
    const r = cakismaTespit(rings, stock, cfg, loopY, 1, isletme);
    expect(r.cakismalar.length).toBe(0);
    expect(r.spanOzet.length).toBe(0);
  });
});
