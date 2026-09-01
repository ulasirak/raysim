import { describe, it, expect } from "vitest";
import { hizDegisimNoktalari, bildIstasyonZamanlari, bildKesisimZamanlari, satirYerlesim } from "../grafikNoktalar";
import { loopYorunge } from "../signalling";
import { loopToHat } from "../hatsim";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";

describe("grafik noktaları (Bildfahrplan + Hız profili gerekli noktalar)", () => {
  const h = hazirHatlar().find((x) => x.key === "birlesik")!;
  const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
  const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
  const stock = h.veri.arac ?? varsayilanArac;
  const rings = dwellUygulanmisRings(h.veri.rings ?? [], stock, isletme);
  const line = loopToHat(rings, true, cfg).line;
  const rev = { ...line, id: line.id + "-r", stations: line.stations.map((s) => ({ ...s, position: line.length - s.position })).reverse(), segments: line.segments.map((s) => ({ start: line.length - s.end, end: line.length - s.start, vmax: s.vmax, gradient: -s.gradient })).reverse() };
  const loop = loopYorunge(line, rev, stock, { peronIsgaliBas: 0, peronIsgaliSon: 0 });

  it("hız değişim noktaları: uçları içerir, km artan ve L içinde", () => {
    const nk = hizDegisimNoktalari(loop, line);
    expect(nk.length).toBeGreaterThan(2);
    expect(nk[0].s).toBeCloseTo(0, 1);
    expect(nk[nk.length - 1].s).toBeLessThanOrEqual(loop.L + 1);
    for (let i = 1; i < nk.length; i++) expect(nk[i].s).toBeGreaterThanOrEqual(nk[i - 1].s);
    // en az bir durak noktası olmalı
    expect(nk.some((n) => n.tip === "durak")).toBe(true);
  });

  it("bildfahrplan istasyon zamanları: her durak için gidiş + dönüş, 0..periyot içinde", () => {
    const ev = bildIstasyonZamanlari(loop, line);
    const nist = line.stations.filter((s) => s.tip !== "gecit").length;
    expect(ev.length).toBe(nist * 2);
    for (const e of ev) { expect(e.t).toBeGreaterThanOrEqual(0); expect(e.t).toBeLessThanOrEqual(loop.periyot + 1); }
    expect(ev.some((e) => e.yon === "g")).toBe(true);
    expect(ev.some((e) => e.yon === "d")).toBe(true);
  });

  it("bildfahrplan kesişimleri: zıt yönlü karşılaşmalar, t sıralı", () => {
    const filo = 8, offset = loop.periyot / filo;
    const ks = bildKesisimZamanlari(loop, filo, offset);
    for (let i = 1; i < ks.length; i++) expect(ks[i].t).toBeGreaterThanOrEqual(ks[i - 1].t);
    for (const c of ks) { expect(c.fp).toBeGreaterThanOrEqual(0); expect(c.fp).toBeLessThanOrEqual(loop.L + 1); }
  });

  it("satır yerleşimi: yakın etiketler farklı satıra düşer, uzaklar 0. satırda", () => {
    const rows = satirYerlesim([0, 5, 10, 200, 205], 30, 3);
    expect(rows[0]).toBe(0);
    expect(rows[1]).not.toBe(0); // 5, 0'a çok yakın → alt satır
    expect(rows[3]).toBe(0);     // 200 uzak → üst satıra döner
  });
});
