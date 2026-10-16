import { describe, it, expect } from "vitest";
import { metrikHesapla } from "@/lib/anaray/karsilastirma";
import { yeniRing, type Sube } from "@/lib/anaray/ring";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

// Ana hat A–B–C–D; kavşak C'de (atIndex 2) ayrılan şube C–E–F.
function anaHat() { return [yeniRing("A", "B"), yeniRing("B", "C"), yeniRing("C", "D")]; }
const sube: Sube = { id: "SB1", ad: "Şube", atIndex: 2, rings: [yeniRing("C", "E"), yeniRing("E", "F")], servisTren: 2 };

describe("#3 Karşılaştırma şube-duyarlı", () => {
  const stock = varsayilanArac, cfg = varsayilanConfig, isletme = varsayilanIsletme;

  it("şubesiz metrik, boş subeler ile BİREBİR aynı (geriye uyumlu)", () => {
    const a = metrikHesapla("x", anaHat(), stock, cfg, isletme);
    const b = metrikHesapla("x", anaHat(), stock, cfg, isletme, []);
    expect(b).toEqual(a);
    expect(a.sube).toBe(0);
  });

  it("şube ağ bütünü betimleyici toplamlara katılır (durak/uzunluk/sube)", () => {
    const tek = metrikHesapla("tek", anaHat(), stock, cfg, isletme);
    const agli = metrikHesapla("ağ", anaHat(), stock, cfg, isletme, [sube]);
    expect(agli.sube).toBe(1);
    // Şube iki yeni durak (E, F) ekler (kavşak kökü C paylaşılır).
    expect(agli.durak).toBe(tek.durak + 2);
    // Ağ uzunluğu şube ringleriyle artar.
    expect(agli.uzunlukKm).toBeGreaterThan(tek.uzunlukKm);
  });

  it("kavşak turnout'u kapasiteyi etkiler ya da eşit bırakır (asla iyileştirmez)", () => {
    const tek = metrikHesapla("tek", anaHat(), stock, cfg, isletme);
    const agli = metrikHesapla("ağ", anaHat(), stock, cfg, isletme, [sube]);
    // Kavşak makası ek bir blocking-time kısıtı → min headway ≥ (asla <).
    expect(agli.hMin).toBeGreaterThanOrEqual(tek.hMin);
  });
});
