import { describe, it, expect } from "vitest";
import { migrate, VERI_SURUM, veriSurumu } from "../migrate";
import { varsayilanConfig, varsayilanIsletme, VARSAYILAN_TERMINAL } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { yeniRing } from "@/lib/anaray/ring";

describe("migrate — boş/bozuk girdi", () => {
  it("null/undefined → geçerli varsayılan proje", () => {
    for (const bos of [null, undefined, {}, 42, "x", []]) {
      const v = migrate(bos);
      expect(Array.isArray(v.rings)).toBe(true);
      expect(v.rings).toHaveLength(0);
      expect(v.arac).toBeDefined();          // DAİMA tanımlı
      expect(v.isletme).toBeDefined();       // DAİMA tanımlı
      expect(Array.isArray(v.subeler)).toBe(true); // şubesiz → []
      expect(v.cfg.headway).toBe(varsayilanConfig.headway);
      expect(v.isletme!.terminalBas.peronIsgali).toBe(VARSAYILAN_TERMINAL.peronIsgali);
    }
  });

  it("bozuk rings elemanları güvenle zorlanır", () => {
    const v = migrate({ rings: [null, 5, "x", {}] });
    expect(v.rings).toHaveLength(4);
    for (const r of v.rings) {
      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(0);
      expect(Array.isArray(r.makaslar)).toBe(true);
      expect(Array.isArray(r.hemzeminler)).toBe(true);
      expect(Array.isArray(r.tehlikeNoktalari)).toBe(true);
      expect(Number.isFinite(r.uzunluk)).toBe(true);
      expect(Number.isFinite(r.dwell)).toBe(true);
    }
  });
});

describe("migrate — idempotent + behavior-preserving", () => {
  const zenginProje = () => {
    const r = yeniRing("A", "B");
    r.makaslar = [{ id: "M1", ad: "m", tip: "karsilasmali", konum: 100, gecisHizi: 4.1, tccZorunlu: true, makasAdimSuresi: 4, makasSayisi: 2, routeRelease: 5, crossover: "x" }];
    r.hemzeminler = [{ id: "H1", ad: "geçit", tip: "karayolu", konum: 200, hiz: 6.9, bekleme: 12 }];
    r.tehlikeNoktalari = [{ id: "T1", ad: "viraj", konum: 300, hiz: 2.7, aciklama: "keskin" }];
    r.sinyaller = [{ id: "S1", ad: "", konum: 50, yon: "giden", tersIsletme: false, yesilSari: 3, sariKirmizi: 2, kirmiziYesil: 8 }];
    r.tekHat = true;
    r.dwellOto = true;
    return { rings: [r], cfg: varsayilanConfig, meta: undefined, arac: varsayilanArac, isletme: varsayilanIsletme, subeler: [] };
  };

  it("migrate(migrate(x)) === migrate(x)", () => {
    const bir = migrate(zenginProje());
    const iki = migrate(bir);
    expect(iki).toEqual(bir);
  });

  it("geçerli güncel değerleri EZMEZ", () => {
    const v = migrate(zenginProje());
    const m = v.rings[0].makaslar[0];
    expect(m.gecisHizi).toBeCloseTo(4.1);
    expect(m.crossover).toBe("x");
    expect(m.makasSayisi).toBe(2);
    expect(v.rings[0].tekHat).toBe(true);
    expect(v.rings[0].hemzeminler[0].bekleme).toBe(12);
  });

  it("zaten normal veride tam tur (parse→migrate→stringify→parse→migrate) sabit", () => {
    const bir = migrate(zenginProje());
    const tur = migrate(JSON.parse(JSON.stringify(bir)));
    expect(tur).toEqual(bir);
  });
});

describe("migrate — eski-şema göçleri", () => {
  it("terminal: terminalDwell + donusSuresi → peronIsgali", () => {
    const v = migrate({ isletme: { terminalBas: { terminalDwell: 40, donusSuresi: 200 } } });
    expect(v.isletme!.terminalBas.peronIsgali).toBe(240);
    // eski alanlar DÜŞÜRÜLÜR (şişme önlenir)
    expect((v.isletme!.terminalBas as unknown as Record<string, unknown>).terminalDwell).toBeUndefined();
    expect((v.isletme!.terminalBas as unknown as Record<string, unknown>).donusSuresi).toBeUndefined();
  });

  it("terminal: makasTipi → sMakas/xMakas", () => {
    const sx = migrate({ isletme: { terminalSon: { makasTipi: "sx" } } }).isletme!.terminalSon;
    expect(sx.sMakas).toBe(1);
    expect(sx.xMakas).toBe(1);
    expect((sx as unknown as Record<string, unknown>).makasTipi).toBeUndefined();

    const x = migrate({ isletme: { terminalSon: { makasTipi: "x" } } }).isletme!.terminalSon;
    expect(x.sMakas).toBe(0);
    expect(x.xMakas).toBe(1);
  });

  it("mevcut peronIsgali/sMakas varsa eski alanlara BAKMAZ", () => {
    const t = migrate({ isletme: { terminalBas: { peronIsgali: 999, sMakas: 3, xMakas: 0, terminalDwell: 1, makasTipi: "x" } } }).isletme!.terminalBas;
    expect(t.peronIsgali).toBe(999);
    expect(t.sMakas).toBe(3);
    expect(t.xMakas).toBe(0);
  });
});

describe("migrate — derin ring doldurma", () => {
  it("eksik zorunlu alanlar varsayılanla dolar", () => {
    const v = migrate({ rings: [{ id: "R1", ad: "X" }] });
    const r = v.rings[0];
    expect(r.uzunluk).toBe(varsayilanConfig.ortalamaDurakArasi);
    expect(r.vmax).toBe(varsayilanConfig.vSahasal);
    expect(r.makaslar).toEqual([]);
    expect(r.hemzeminler).toEqual([]);
    expect(r.tehlikeNoktalari).toEqual([]);
  });

  it("makas eksik gecisHizi → vMakas; tccZorunlu tipten türetilir", () => {
    const v = migrate({ rings: [{ makaslar: [{ id: "M", tip: "depo" }] }] });
    const m = v.rings[0].makaslar[0];
    expect(m.gecisHizi).toBe(varsayilanConfig.vMakas);
    expect(m.tccZorunlu).toBe(true); // depo → TCC gerekli
    const m2 = migrate({ rings: [{ makaslar: [{ id: "M2", tip: "headway" }] }] }).rings[0].makaslar[0];
    expect(m2.tccZorunlu).toBe(false); // headway → TCC gerekmez
  });

  it("geçersiz makas tipi güvenli 'headway'e düşer", () => {
    const m = migrate({ rings: [{ makaslar: [{ id: "M", tip: "SAÇMA" }] }] }).rings[0].makaslar[0];
    expect(m.tip).toBe("headway");
  });

  it("şube ring zinciri de derin normalleşir", () => {
    const v = migrate({ subeler: [{ id: "SB", ad: "Tali", atIndex: 2, rings: [{ id: "SR" }] }] });
    expect(v.subeler).toHaveLength(1);
    expect(v.subeler![0].atIndex).toBe(2);
    expect(v.subeler![0].rings[0].makaslar).toEqual([]);
  });
});

describe("veriSurumu / VERI_SURUM", () => {
  it("VERI_SURUM pozitif tam sayı", () => {
    expect(Number.isInteger(VERI_SURUM)).toBe(true);
    expect(VERI_SURUM).toBeGreaterThanOrEqual(1);
  });
  it("sürümsüz kayıt → 0", () => {
    expect(veriSurumu(undefined)).toBe(0);
    expect(veriSurumu("x")).toBe(0);
    expect(veriSurumu(3)).toBe(3);
  });
});
