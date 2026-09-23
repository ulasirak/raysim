// ROBUSTLUK-KISITLI FİLO ÇÖZÜCÜSÜ — kilidi.
import { describe, it, expect } from "vitest";
import { robustFiloPenceresi } from "../robustFilo";

// Sentetik güvenilirlik: filo arttıkça DÜŞER (gerçek MC davranışı) → rel(f) = 100 - (f-1)*10.
const relFn = (_hw: number, f: number) => Math.max(0, 100 - (f - 1) * 10);

describe("robustFiloPenceresi", () => {
  const g = { cevrimSn: 1200, hMinSn: 120, nMax: 10 };

  it("robustluk üst sınırı: güvenilirlik hedefini sağlayan EN FAZLA filo", () => {
    const r = robustFiloPenceresi({ ...g, hedefGuvenilirlik: 85 }, relFn);
    // rel: f1=100, f2=90, f3=80 → hedef 85 için f1,f2 uygun → üst sınır 2.
    expect(r.robustMaxFilo).toBe(2);
    expect(r.noktalar.find((n) => n.filo === 2)!.robustUygun).toBe(true);
    expect(r.noktalar.find((n) => n.filo === 3)!.robustUygun).toBe(false);
  });

  it("talep yoksa: öneri = güvenilir en az filo (konfor kısıtı yok)", () => {
    const r = robustFiloPenceresi({ ...g, hedefGuvenilirlik: 85 }, relFn);
    expect(r.demandVar).toBe(false);
    expect(r.konforMinFilo).toBe(null);
    expect(r.onerilenFilo).toBe(1); // en az filo zaten güvenilir
    expect(r.fizibil).toBe(true);
  });

  it("FİZİBIL DEĞİL: konfor ≥6 ister ama %85 güvenilirlik ≤2 ile sınırlı → çakışır", () => {
    const r = robustFiloPenceresi(
      { ...g, hedefGuvenilirlik: 85, pikYolcuSaat: 3000, aracKapasite: 220, konforTavani: 0.85 },
      relFn,
    );
    expect(r.konforMinFilo).toBe(6);   // doluluk ≤%85 için ≥6 araç
    expect(r.robustMaxFilo).toBe(2);   // güvenilirlik ≥%85 için ≤2 araç
    expect(r.fizibil).toBe(false);     // pencere boş
    expect(r.onerilenFilo).toBe(null);
  });

  it("FİZİBIL: güvenilirlik hedefi gevşeyince pencere açılır → öneri = konfor alt sınırı", () => {
    const r = robustFiloPenceresi(
      { ...g, hedefGuvenilirlik: 50, pikYolcuSaat: 3000, aracKapasite: 220, konforTavani: 0.85 },
      relFn,
    );
    // rel≥50 → f≤6 robust; konfor → f≥6 → kesişim {6}.
    expect(r.robustMaxFilo).toBe(6);
    expect(r.konforMinFilo).toBe(6);
    expect(r.onerilenFilo).toBe(6);
    expect(r.fizibil).toBe(true);
    const o = r.noktalar.find((n) => n.filo === 6)!;
    expect(o.uygun).toBe(true);
    expect(o.robustUygun && o.konforUygun).toBe(true);
  });

  it("headway = max(hMin, çevrim÷filo) çözücüye doğru geçer", () => {
    const r = robustFiloPenceresi({ ...g, hedefGuvenilirlik: 0 }, relFn);
    expect(r.noktalar.find((n) => n.filo === 4)!.headwaySn).toBeCloseTo(300, 3); // 1200/4
    expect(r.noktalar.find((n) => n.filo === 10)!.headwaySn).toBeCloseTo(120, 3); // hMin taban
  });
});
