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

  // ——— EKONOMİK OPTİMUM (jenerik maliyet çanağı) ———
  const eko = { ...g, pikYolcuSaat: 3000, aracKapasite: 220, konforTavani: 0.85, zamanDegeriYolcuSaat: 100, aracSaatMaliyet: 800 };

  it("jenerik maliyet = işletmeci + yolcu; toplamın alt noktası ekonomik optimum (U çanağı)", () => {
    const r = paretoAnaliz(eko);
    expect(r.ekoVar).toBe(true);
    // VoT=100, Cveh=800, talep=3000 → min f=8 (elle: jen(8)=12650 < jen(7)=12743 < jen(9)=12756).
    expect(r.ekoOptimumFilo).toBe(8);
    const opt = r.noktalar.find((n) => n.ekoOptimum)!;
    // döküm tutarlı: toplam = işletmeci + yolcu.
    expect(opt.jenerikMaliyet!).toBeCloseTo(opt.isletmeciMaliyet! + opt.yolcuMaliyet!, 6);
    // gerçekten minimum: komşulardan küçük-eşit.
    const jen = (f: number) => r.noktalar.find((n) => n.filo === f)!.jenerikMaliyet!;
    expect(jen(8)).toBeLessThanOrEqual(jen(7));
    expect(jen(8)).toBeLessThanOrEqual(jen(9));
    // optimum daima kapasite duvarını (nMax=10) aşmaz.
    expect(r.ekoOptimumFilo!).toBeLessThanOrEqual(10);
    // konfor-uygun: optimumun doluluğu tavanı (%85) aşmaz (aşırı kalabalık önerilmez).
    expect(opt.doluluk!).toBeLessThanOrEqual(0.85 + 1e-9);
    expect(r.ekoOptimumFilo!).toBeGreaterThanOrEqual(r.konforFilo!);
  });

  it("kısıtsız maliyet minimumu konfor tavanını aşarsa optimum konfor sınırına çekilir (bağlı)", () => {
    // Pahalı araç + düşük VoT → kısıtsız maliyet minimumu (f*≈√(500·VoT/Cveh)) konfor sınırının (6) altına iner.
    const r = paretoAnaliz({ ...eko, zamanDegeriYolcuSaat: 20, aracSaatMaliyet: 2000 });
    expect(r.ekoSerbestFilo!).toBeLessThan(r.konforFilo!);   // kısıtsız min aşırı kalabalık
    expect(r.ekoKonforBagli).toBe(true);
    expect(r.ekoOptimumFilo).toBe(r.konforFilo);             // öneri konfor sınırına çekildi
    expect(r.noktalar.find((n) => n.ekoOptimum)!.doluluk!).toBeLessThanOrEqual(0.85 + 1e-9);
  });

  it("zaman değeri artınca optimum filo ARTAR; araç maliyeti artınca AZALIR", () => {
    const dusukVoT = paretoAnaliz({ ...eko, zamanDegeriYolcuSaat: 30 }).ekoOptimumFilo!;
    const yuksekVoT = paretoAnaliz({ ...eko, zamanDegeriYolcuSaat: 200 }).ekoOptimumFilo!;
    expect(yuksekVoT).toBeGreaterThanOrEqual(dusukVoT);
    const ucuzArac = paretoAnaliz({ ...eko, aracSaatMaliyet: 300 }).ekoOptimumFilo!;
    const pahaliArac = paretoAnaliz({ ...eko, aracSaatMaliyet: 2000 }).ekoOptimumFilo!;
    expect(pahaliArac).toBeLessThanOrEqual(ucuzArac);
  });

  it("iki ₺ girdi (VoT/araç-saat) yoksa jenerik maliyet YOK (ekoVar=false, alanlar null)", () => {
    const r = paretoAnaliz({ ...g, pikYolcuSaat: 3000, aracKapasite: 220 }); // ₺ girdi yok
    expect(r.ekoVar).toBe(false);
    expect(r.ekoOptimumFilo).toBe(null);
    expect(r.ekoMaliyet).toBe(null);
    expect(r.noktalar.every((n) => n.jenerikMaliyet === null && !n.ekoOptimum)).toBe(true);
  });
});
