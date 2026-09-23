// PARETO ÇOK-AMAÇLI OPTİMİZASYON (Büyük sıçrama F) — kilidi.
import { describe, it, expect } from "vitest";
import { paretoAnaliz } from "../pareto";

describe("paretoAnaliz", () => {
  // çevrim 1200 s, hMin 120 s → kapasite duvarı nMax = 10.
  const g = { cevrimSn: 1200, hMinSn: 120, nMax: 10 };

  it("kapasite duvarını aşan filo BASKIN altında (headway sabit, maliyet artar)", () => {
    const r = paretoAnaliz(g);
    // f=11..13 headway hMin'e sabitlenir → f=10 ile aynı bekleme, daha yüksek maliyet → baskın.
    const asiri = r.noktalar.filter((n) => n.filo > 10);
    expect(asiri.length).toBeGreaterThan(0);
    expect(asiri.every((n) => !n.etkin)).toBe(true);
    expect(asiri.every((n) => Math.abs(n.headwaySn - 120) < 1e-6)).toBe(true);
  });

  it("duvara kadar (1..nMax) tüm noktalar Pareto-etkin", () => {
    const r = paretoAnaliz(g);
    const icKume = r.noktalar.filter((n) => n.filo >= 1 && n.filo <= 10);
    expect(icKume.every((n) => n.etkin)).toBe(true);
  });

  it("ağırlık=0 (maliyet önceliği) → optimum en küçük filo; ağırlık=1 (servis) → duvar filosu", () => {
    expect(paretoAnaliz({ ...g, agirlik: 0 }).optimumFilo).toBe(1);
    expect(paretoAnaliz({ ...g, agirlik: 1 }).optimumFilo).toBe(10);
  });

  it("diz noktası etkin kümede ve uçlar arasında (1<diz<nMax)", () => {
    const r = paretoAnaliz(g);
    const diz = r.noktalar.find((n) => n.diz)!;
    expect(diz.etkin).toBe(true);
    expect(r.dizFilo).toBeGreaterThan(1);
    expect(r.dizFilo).toBeLessThan(10);
  });

  it("talep varsa doluluk filo arttıkça DÜŞER (headway kısaldıkça araç başına biniş azalır)", () => {
    const r = paretoAnaliz({ ...g, pikYolcuSaat: 3000, aracKapasite: 220, konforTavani: 0.85 });
    expect(r.demandVar).toBe(true);
    const d1 = r.noktalar.find((n) => n.filo === 1)!.doluluk!;
    const d10 = r.noktalar.find((n) => n.filo === 10)!.doluluk!;
    expect(d1).toBeGreaterThan(d10);
  });

  it("konfor KISITI: optimum konforu (doluluk ≤ tavan) sağlayan filolarda kalır", () => {
    // dol(f) = 4,545/f (f≤10) → ≤0,85 için f ≥ 6 → konforFilo = 6.
    const d = { ...g, pikYolcuSaat: 3000, aracKapasite: 220, konforTavani: 0.85 };
    const r = paretoAnaliz(d);
    expect(r.konforFilo).toBe(6);
    expect(r.konforSaglanabilir).toBe(true);
    expect(r.noktalar.find((n) => n.filo === 5)!.konforUygun).toBe(false);
    expect(r.noktalar.find((n) => n.filo === 6)!.konforUygun).toBe(true);
    // maliyet önceliğinde bile optimum konfor sınırının (6) altına inmez — aşırı kalabalık önermez.
    expect(paretoAnaliz({ ...d, agirlik: 0 }).optimumFilo).toBe(6);
    // optimumun doluluğu tavanı aşmaz.
    const opt = paretoAnaliz(d).noktalar.find((n) => n.optimum)!;
    expect(opt.doluluk!).toBeLessThanOrEqual(0.85 + 1e-9);
  });

  it("talep yoksa doluluk null + konfor kısıtı yok + amaç yalnız maliyet/bekleme", () => {
    const r = paretoAnaliz(g);
    expect(r.demandVar).toBe(false);
    expect(r.konforFilo).toBe(null);
    expect(r.noktalar.every((n) => n.doluluk === null && n.konforUygun)).toBe(true);
  });
});
