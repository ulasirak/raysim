// ASPECT DİZİLİM (SIGNAL ASPECT SEQUENCE) — Büyük sıçrama G — kilidi.
import { describe, it, expect } from "vitest";
import { aspectDizilim, aspectSinirlar } from "../aspectDizilim";
import { varsayilanConfig } from "../config";
import { yeniSinyal, type DurakArasiRing, type SinyalLambasi } from "@/lib/anaray/ring";

function sig(konum: number, yon: "giden" | "gelen" = "giden", ters = false): SinyalLambasi {
  return { ...yeniSinyal(yon, konum, ters), id: `SIG${konum}${yon}${ters}` };
}
function ring(uzunluk: number, sinyaller: SinyalLambasi[]): DurakArasiRing {
  return { uzunluk, makaslar: [], sinyaller } as unknown as DurakArasiRing;
}

describe("aspectSinirlar", () => {
  it("istasyon (ring başı/sonu) + ileri sinyalleri sınır yapar, ters/gelen sinyali eler", () => {
    const rings = [
      ring(1000, [sig(500, "giden"), sig(300, "gelen"), sig(700, "giden", true /* ters işletme */)]),
      ring(1000, [sig(500, "giden")]),
    ];
    // Beklenen: 0, 500, 1000 (istasyon), 1500, 2000. Gelen(300) ve ters(700) ELENİR.
    expect(aspectSinirlar(rings)).toEqual([0, 500, 1000, 1500, 2000]);
  });
});

describe("aspectDizilim", () => {
  const rings = [
    ring(1000, [sig(500, "giden")]),
    ring(1000, [sig(500, "giden")]),
  ];
  const r = aspectDizilim(rings, varsayilanConfig);

  it("4 blok üretir (500 m'lik ardışık sınır çiftleri)", () => {
    expect(r.bloklar.length).toBe(4);
    expect(r.bloklar.every((b) => b.uzunluk === 500)).toBe(true);
    expect(r.hatUzunluk).toBe(2000);
  });

  it("fren mesafesi = v²/(2b), tasarım hızı = vAnahat", () => {
    const v = varsayilanConfig.vAnahat; // 70 km/h
    expect(r.tasarimHizKmh).toBeCloseTo(70, 3);
    expect(r.frenMesafesi).toBeCloseTo((v * v) / (2 * varsayilanConfig.yavaslama), 3);
    // 70 km/h, b=1,2 → ~157,5 m
    expect(r.frenMesafesi).toBeGreaterThan(150);
    expect(r.frenMesafesi).toBeLessThan(165);
  });

  it("500 m bloklar fren mesafesinden uzun → hepsi yeterli", () => {
    expect(r.yetersizBlok).toBe(0);
    expect(r.bloklar.every((b) => b.yeterli)).toBe(true);
  });

  it("3-aspect step-down: işgal bloğu Dur, bir gerisi Tedbir, diğerleri Yol", () => {
    const rr = aspectDizilim(rings, varsayilanConfig, 3); // 3. blok işgal
    expect(rr.isgalBlok).toBe(3);
    const a = (no: number) => rr.sinyaller.find((s) => s.no === no)!.aspect;
    expect(a(3)).toBe("kirmizi"); // işgal bloğu girişi
    expect(a(2)).toBe("sari");    // uyarı bloğu
    expect(a(1)).toBe("yesil");
    expect(a(4)).toBe("yesil");   // işgalin ötesi
  });

  it("varsayılan işgal orta blok (yetersiz yoksa)", () => {
    expect(r.isgalBlok).toBe(2); // ceil(4/2)
  });
});

describe("aspectDizilim — yetersiz görüş/fren", () => {
  it("fren mesafesinden kısa blok yetersiz işaretlenir + varsayılan işgal = ilk yetersiz", () => {
    // Ring1'de 500 ve 600'de sinyal → 100 m'lik blok (157,5 m fren mesafesinden kısa).
    const rings = [ring(1000, [sig(500, "giden"), sig(600, "giden")]), ring(1000, [sig(500, "giden")])];
    const r = aspectDizilim(rings, varsayilanConfig);
    const kisa = r.bloklar.find((b) => b.uzunluk === 100)!;
    expect(kisa.yeterli).toBe(false);
    expect(r.yetersizBlok).toBe(1);
    expect(r.minBlok).toBe(100);
    expect(r.isgalBlok).toBe(kisa.no); // ilk yetersiz blok işgal seçilir
  });
});
