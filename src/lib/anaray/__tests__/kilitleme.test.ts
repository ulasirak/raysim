// KİLİTLEME (INTERLOCKING) KONTROL TABLOSU (Büyük sıçrama G) — kilidi.
import { describe, it, expect } from "vitest";
import { kilitlemeTablosu, kilitlemeOzet, kilitlemeMetin } from "../kilitleme";
import type { DurakArasiRing, MakasBolgesi } from "@/lib/anaray/ring";

function makas(ad: string, tip: MakasBolgesi["tip"], konum: number, extra: Partial<MakasBolgesi> = {}): MakasBolgesi {
  return {
    id: ad, ad, tip, konum, gecisHizi: 15 / 3.6, tccZorunlu: false,
    makasAdimSuresi: 6, makasSayisi: 2, routeRelease: 5, ...extra,
  };
}
function ring(uzunluk: number, makaslar: MakasBolgesi[]): DurakArasiRing {
  return { makaslar, uzunluk } as unknown as DurakArasiRing;
}

describe("kilitlemeTablosu", () => {
  const rings = [
    ring(1000, [makas("M1", "karsilasmali", 300), makas("M2", "udonus", 800, { crossover: "x" })]),
    ring(1000, [makas("M3", "depo", 200), makas("M4", "headway", 600 /* crossover yok */)]),
  ];
  const t = kilitlemeTablosu(rings);

  it("her makas ANA HAT DÜZ geçiş rotası üretir", () => {
    const duz = t.filter((r) => r.rotaKod === "duz");
    expect(duz.length).toBe(4); // 4 makas → 4 düz rota
    expect(duz.every((r) => r.makasKonum === "Normal" && r.tanzimSn === 0)).toBe(true);
  });

  it("crossover/karşılaşmalı/udönüş/depo MANEVRA rotası ekler (Ters konum)", () => {
    const manevra = t.filter((r) => r.makasKonum === "Ters");
    // M1 karsilasmali + M2 udonus + M3 depo = 3 manevra; M4 headway (crossover yok) = manevra YOK
    expect(manevra.length).toBe(3);
    expect(t.some((r) => r.makasAd === "M4" && r.makasKonum === "Ters")).toBe(false);
  });

  it("karşılaşmalı ve depo TCC gerektirir", () => {
    expect(t.some((r) => r.makasAd === "M1" && r.makasKonum === "Ters" && r.tcc)).toBe(true);
    expect(t.some((r) => r.makasAd === "M3" && r.makasKonum === "Ters" && r.tcc)).toBe(true);
  });

  it("manevra kilit süresi = tanzim + serbest (tanzim = makasSayısı × adım)", () => {
    const m1 = t.find((r) => r.makasAd === "M1" && r.makasKonum === "Ters")!;
    expect(m1.tanzimSn).toBe(12); // 2 × 6
    expect(m1.serbestSn).toBe(5);
    expect(m1.kilitSn).toBe(17);
  });

  it("mutlak kilometraj: 2. ring makasları offset'li + tablo sıralı", () => {
    const m3 = t.find((r) => r.makasAd === "M3")!;
    expect(m3.km).toBe(1200); // ring1 uzunluk 1000 + konum 200
    const kmler = t.map((r) => r.km);
    expect(kmler).toEqual([...kmler].sort((a, b) => a - b));
  });

  it("emniyet payı: servis freni mesafesi (v²/2b), blok sınırıyla sınırlı", () => {
    // vmax girilmemiş → cfg.vSahasal (40 km/h ≈ 11,11 m/s), b=1,2 → 11,11²/2,4 ≈ 51 m
    const m1 = t.find((r) => r.makasAd === "M1")!;
    expect(m1.emniyetPayiM).toBe(51);
    // Sonraki blok sınırı yakınsa emniyet payı ORAYA kadar kısılır (makastan öteye taşamaz)
    const kisa = kilitlemeTablosu([ring(30, [makas("K", "karsilasmali", 0)])]);
    expect(kisa[0].emniyetPayiM).toBe(30);
  });

  it("kilitlemeMetin: TR/EN/DE ayrı metin + dile bağlı emniyet payı terimi", () => {
    const m1ters = t.find((r) => r.makasAd === "M1" && r.makasKonum === "Ters")!;
    const tr = kilitlemeMetin(m1ters, (m) => m.tr);
    const en = kilitlemeMetin(m1ters, (m) => m.en);
    const de = kilitlemeMetin(m1ters, (m) => m.de);
    expect(tr.rota).toContain("Karşılaşmalı");
    expect(en.rota).toContain("Crossover");
    expect(de.rota).toContain("Gleiswechsel");
    expect(tr.konum).toBe("Ters");
    expect(en.konum).toBe("Reverse");
    expect(de.konum).toBe("Umgestellt");
    // Emniyet payı terimi dile göre: TR "emniyet payı" · EN "overlap" · DE "Durchrutschweg"
    expect(tr.koruma).toContain("emniyet payı");
    expect(en.koruma).toContain("overlap");
    expect(de.koruma).toContain("Durchrutschweg");
  });

  it("özet sayaçlar tutarlı", () => {
    const o = kilitlemeOzet(t);
    expect(o.makas).toBe(4);
    expect(o.rota).toBe(t.length);
    expect(o.manevra).toBe(3);
    expect(o.maxKilit).toBeGreaterThan(0);
  });
});
