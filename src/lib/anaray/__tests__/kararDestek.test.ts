// KARAR DESTEK / OPTİMİZASYON (Büyük sıçrama F) — kilidi.
import { describe, it, expect } from "vitest";
import { filoHeadwayEgrisi, hedefFilo, enIyiHeadwaySn } from "../kararDestek";

describe("filoHeadwayEgrisi", () => {
  const cevrim = 1200, hMin = 120, nMax = 10; // çevrim 1200 s, hMin 120 s → duvar filo 10
  const e = filoHeadwayEgrisi(cevrim, hMin, nMax);
  it("filo arttıkça headway düşer (hiperbol)", () => {
    expect(e[0].headwaySn).toBe(1200);      // filo 1
    expect(e[1].headwaySn).toBe(600);       // filo 2
    expect(e.every((p, i) => i === 0 || p.headwaySn < e[i - 1].headwaySn)).toBe(true);
  });
  it("kapasite duvarı: headway < hMin olan noktalar uygun DEĞİL", () => {
    // filo 10 → 120 s = hMin (uygun); filo 11 → ~109 s < hMin (uygun değil) ama ust=nMax=10
    expect(e[e.length - 1].filo).toBe(10);
    expect(e[e.length - 1].uygun).toBe(true);
  });
});

describe("hedefFilo — hedef-arama", () => {
  it("hedef headway için gereken en az filo (yukarı yuvarlar)", () => {
    const r = hedefFilo(1200, 240, 10); // 1200/240 = 5
    expect(r.filo).toBe(5);
    expect(r.ulasilanHeadwaySn).toBe(240);
    expect(r.uygun).toBe(true);
  });
  it("çok sıkı hedef → kapasiteyi aşarsa uygun değil", () => {
    const r = hedefFilo(1200, 60, 10); // 1200/60 = 20 > nMax 10
    expect(r.filo).toBe(20);
    expect(r.uygun).toBe(false);
    expect(r.kapasiteFilo).toBe(10);
  });
  it("tam bölünmeyen hedef yukarı yuvarlanır → ulaşılan < hedef", () => {
    const r = hedefFilo(1000, 240, 20); // 1000/240 = 4.16 → 5 filo → 200 s
    expect(r.filo).toBe(5);
    expect(r.ulasilanHeadwaySn).toBe(200);
    expect(r.ulasilanHeadwaySn).toBeLessThan(240);
  });
});

describe("enIyiHeadwaySn", () => {
  it("kapasite duvarındaki en küçük headway", () => {
    expect(enIyiHeadwaySn(1200, 10)).toBe(120);
  });
});
