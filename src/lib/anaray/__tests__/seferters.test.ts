import { describe, it, expect } from "vitest";
import { seferTersEntegre } from "../seferters";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

describe("Sefer ↔ Ters İşletme entegre algoritma", () => {
  const h = hazirHatlar().find((x) => x.key === "birlesik")!;
  const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
  const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
  const stock = h.veri.arac ?? varsayilanArac;
  const rings = h.veri.rings ?? [];

  it("verilen headway'de araç konumlarını + filoyu üretir", () => {
    const s = seferTersEntegre(rings, stock, cfg, isletme, 5 * 60, 0); // 5 dk aralık
    expect(s.gecerli).toBe(true);
    expect(s.filo).toBeGreaterThan(0);
    expect(s.araclar.length).toBe(s.filo);
    // konumlar 0..L(km) aralığında
    for (const a of s.araclar) expect(a.km).toBeGreaterThanOrEqual(0);
    expect(s.bilgi.length).toBeGreaterThan(0);
  });

  it("headway küçüldükçe filo artar (dinamik)", () => {
    const az = seferTersEntegre(rings, stock, cfg, isletme, 10 * 60, 0);
    const cok = seferTersEntegre(rings, stock, cfg, isletme, 3 * 60, 0);
    expect(cok.filo).toBeGreaterThan(az.filo);
  });

  it("tramvay ekleme ihtiyacı modülü: durum + doluluk mantıklı", () => {
    // Büyük headway → az araç serviste → yoğunlukta ekleme/altyapı beklenir.
    const seyrek = seferTersEntegre(rings, stock, cfg, isletme, 15 * 60, 0);
    const f = seyrek.filoIhtiyac!;
    expect(f).not.toBeNull();
    expect(["dengeli", "tersYeter", "ekle", "altyapi"]).toContain(f.durum);
    expect(f.tepeDoluluk).toBeGreaterThan(0);
    // problem varsa ya araç eklenir ya da açık (tavan üstü) raporlanır
    if (f.problem) expect(f.eklenecek + f.acikAdet).toBeGreaterThan(0);
    // ekleme önerilirse yeni doluluk mevcut serviste doluluğundan düşük olmalı
    if (f.eklenecek > 0) expect(f.yeniDoluluk).toBeLessThanOrEqual(f.tepeDoluluk + 1e-9);
  });

  it("sık sefer (küçük headway) filo ihtiyacını dengeler", () => {
    const sik = seferTersEntegre(rings, stock, cfg, isletme, 3 * 60, 0);
    const seyrek = seferTersEntegre(rings, stock, cfg, isletme, 15 * 60, 0);
    // Daha sık sefer → serviste daha çok araç → daha az/eşit ekleme ihtiyacı
    expect(sik.filoIhtiyac!.eklenecek).toBeLessThanOrEqual(seyrek.filoIhtiyac!.eklenecek);
  });

  it("aşırı sık sefer fiziksel tavanı aşınca 'aracYetersiz' der (sağlanamaz)", () => {
    const asiri = seferTersEntegre(rings, stock, cfg, isletme, 0.5 * 60, 0); // 30 s aralık
    const f = asiri.filoIhtiyac!;
    expect(f.durum).toBe("aracYetersiz");
    expect(f.problem).toBe(true);
    expect(asiri.filo).toBeGreaterThan(f.teorikTavan);   // istenen serviste tavanı aşar
    expect(f.acikAdet).toBe(asiri.filo - f.teorikTavan); // fazla araç
    expect(f.minAralikSn).toBeGreaterThan(0);            // en küçük uygulanabilir aralık verilir
    // DİYAGRAM fiziksel tavana kırpılır (canlı sim gibi) — istenen kadar araç çizilmez
    expect(asiri.aracKirpildi).toBe(true);
    expect(asiri.cizilenArac).toBe(f.teorikTavan);
    expect(asiri.araclar.length).toBe(f.teorikTavan);
    // makul aralıkta bu durum oluşmaz
    expect(seferTersEntegre(rings, stock, cfg, isletme, 8 * 60, 0).filoIhtiyac!.durum).not.toBe("aracYetersiz");
  });

  it("öneri üretirse dönüş kararı bir araca bağlanır + gerçek ulaşım süresi taşır", () => {
    const s = seferTersEntegre(rings, stock, cfg, isletme, 4 * 60, 300);
    for (const o of s.oneriler) {
      expect(o.aracNo).toBeGreaterThan(0);
      expect(o.ulasimSn).toBeGreaterThanOrEqual(0);
      expect(o.gerekce).toContain("makas");
    }
  });
});
