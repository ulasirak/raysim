// SAĞLAMLIK (robustness) regresyon kalkanı — denetimde bulunan fail-safe'leri kilitler:
//  • saglamCfg/saglamIsletme: istemci bozuk/NaN/negatif/0 girdisini güvenli aralığa çeker.
//  • ringToLine: makas/hemzemin/taban hızları ASLA 0/NaN olmaz (0-hız → loopYorunge stall).
//  • migrate: ivme/yavaslama yalnız GERÇEKTEN eski veride sıfırlanır; v2+ değeri KORUNUR
//    (eski bug: her yüklemede sıfırlanıyordu — doküman veriSurum'u migrate'e ulaşmıyordu).

import { describe, it, expect } from "vitest";
import { saglamCfg, saglamIsletme, saglamArac } from "../saglamGirdi";
import { ringToLine, yeniRing } from "../ring";
import { migrate, VERI_SURUM } from "../migrate";
import { varsayilanConfig, varsayilanIsletme } from "../config";

describe("saglamCfg — istemci cfg fail-safe", () => {
  it("NaN/0/negatif sayısal alanlar güvenli tabana çekilir", () => {
    const c = saglamCfg({ vSahasal: 0, vMakas: NaN, kisitGenisligi: NaN, headway: 0, ivme: 0, yavaslama: -1, dolulukTavani: -0.5 });
    expect(c.vSahasal).toBeGreaterThan(0);
    expect(Number.isFinite(c.vMakas)).toBe(true); expect(c.vMakas).toBeGreaterThan(0);
    expect(Number.isFinite(c.kisitGenisligi)).toBe(true); expect(c.kisitGenisligi).toBeGreaterThanOrEqual(1);
    expect(c.headway).toBeGreaterThanOrEqual(1);
    expect(c.ivme).toBeGreaterThan(0); expect(c.yavaslama).toBeGreaterThan(0);
    expect(c.dolulukTavani).toBeGreaterThan(0);
  });
  it("geçerli değerler DEĞİŞMEDEN geçer (varsayılanla aynı)", () => {
    expect(saglamCfg(varsayilanConfig)).toEqual(varsayilanConfig);
  });
  it("undefined/çöp girdi → tam varsayılan", () => {
    expect(saglamCfg(undefined)).toEqual(varsayilanConfig);
    expect(saglamCfg("çöp")).toEqual(varsayilanConfig);
  });
});

describe("saglamIsletme — istemci işletme fail-safe", () => {
  it("NaN mcMean* güvenli değere döner (expRand NaN üretmez)", () => {
    const i = saglamIsletme({ mcMeanEntrySn: NaN, mcMeanDwellSn: -5, aracYolcuKapasite: 0 });
    expect(Number.isFinite(i.mcMeanEntrySn)).toBe(true);
    expect(i.mcMeanDwellSn).toBeGreaterThanOrEqual(0);
    expect(i.aracYolcuKapasite).toBeGreaterThanOrEqual(1); // 0'a bölme koruması
  });
  it("opsiyonel istasyonYolcu talep haritası KORUNUR", () => {
    const iy = { "Durak A": { binen: 100, inen: 50 } };
    const i = saglamIsletme({ istasyonYolcu: iy }) as typeof varsayilanIsletme & { istasyonYolcu?: unknown };
    expect(i.istasyonYolcu).toEqual(iy);
  });
  it("terminal peronIsgali NaN → güvenli", () => {
    const i = saglamIsletme({ terminalBas: { peronIsgali: NaN } });
    expect(Number.isFinite((i.terminalBas as { peronIsgali?: number }).peronIsgali ?? 0)).toBe(true);
  });
});

describe("saglamArac — sınır dışı araç güvenli", () => {
  it("maxSpeed 0 / mass NaN taban değere çekilir (stall yok)", () => {
    const a = saglamArac({ maxSpeed: 0, mass: NaN, maxBraking: 0 });
    expect(a.maxSpeed).toBeGreaterThanOrEqual(1);
    expect(a.mass).toBeGreaterThanOrEqual(1000);
    expect(a.maxBraking).toBeGreaterThan(0);
  });
});

describe("ringToLine — 0/NaN hız bandı üretmez (loopYorunge stall kökü)", () => {
  it("makas gecisHizi=0 → hiçbir segment vmax'ı 0/NaN değil", () => {
    const r = yeniRing("A", "B"); r.uzunluk = 800;
    r.makaslar = [{ konum: 400, tip: "s", gecisHizi: 0, sayi: 1 } as unknown as (typeof r.makaslar)[number]];
    const line = ringToLine(r, "nominal", varsayilanConfig);
    for (const seg of line.segments) { expect(Number.isFinite(seg.vmax)).toBe(true); expect(seg.vmax).toBeGreaterThan(0); }
  });
  it("cfg.vSahasal=0 ve ring.vmax=0 → taban hız yine > 0", () => {
    const r = yeniRing("A", "B"); r.uzunluk = 800; r.vmax = 0;
    const line = ringToLine(r, "nominal", { ...varsayilanConfig, vSahasal: 0 });
    for (const seg of line.segments) expect(seg.vmax).toBeGreaterThan(0);
  });
});

describe("migrate — ivme/yavaslama sürüm-doğru göç (veri kaybı regresyonu)", () => {
  it("v2+ doküman → kullanıcının ivme/yavaslama değeri KORUNUR", () => {
    const veri = { cfg: { ...varsayilanConfig, ivme: 0.8, yavaslama: 0.9 } };
    const m = migrate(veri, VERI_SURUM); // doküman sürümü aktarılır (projeGetir gibi)
    expect(m.cfg.ivme).toBe(0.8);
    expect(m.cfg.yavaslama).toBe(0.9);
  });
  it("sürümsüz (eski/dekoratif) veri → varsayılana çekilir (bir kez)", () => {
    const veri = { cfg: { ...varsayilanConfig, ivme: 0.8, yavaslama: 0.9 } };
    const m = migrate(veri); // docSurum yok, veri içinde de yok → 0 < 2 → sıfırla
    expect(m.cfg.ivme).toBe(varsayilanConfig.ivme);
    expect(m.cfg.yavaslama).toBe(varsayilanConfig.yavaslama);
  });
  it("migrate çıktısı veriSurum damgalar → yeniden-migrate değeri KORUR (veriUygula yolu)", () => {
    const veri = { cfg: { ...varsayilanConfig, ivme: 0.8 } };
    const bir = migrate(veri, VERI_SURUM);
    expect(bir.veriSurum).toBe(VERI_SURUM);
    const iki = migrate(bir); // docSurum yok ama bir.veriSurum=VERI_SURUM içeride
    expect(iki.cfg.ivme).toBe(0.8); // sıfırlanmaz
  });
});
