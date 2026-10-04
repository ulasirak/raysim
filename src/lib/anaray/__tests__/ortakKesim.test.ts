import { describe, it, expect } from "vitest";
import { ortakKesimAnaliz, subeOzeti, subeIsletme } from "@/lib/anaray/ortakKesim";
import { yeniRing, type DurakArasiRing, type Sube } from "@/lib/anaray/ring";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";

const stock = hazirHatlar()[0].veri.arac!;
const R = (f: string, t: string, u: number) => { const r = yeniRing(f, t); r.uzunluk = u; return r; };
function trunk(): DurakArasiRing[] {
  return [R("Merkez", "Meydan", 1000), R("Meydan", "Sanayi", 1200), R("Sanayi", "Kavşak", 1000), R("Kavşak", "Kampüs", 900), R("Kampüs", "Üniversite", 1000)];
}
const sube = (servisTren?: number): Sube => ({ id: "h", ad: "Havalimanı Kolu", atIndex: 3, servisTren, rings: [R("Kavşak", "Fuar", 900), R("Fuar", "Havalimanı", 1600)] });

describe("#1-B/D ortak kesim yükü", () => {
  it("servisTren yoksa → analiz kapalı (tahmin yok)", () => {
    const r = ortakKesimAnaliz(trunk(), [sube(undefined)], stock, varsayilanConfig, varsayilanIsletme, 6);
    expect(r.aktif).toBe(false);
    expect(r.kesimler.length).toBe(0);
  });

  it("servisTren girilince ortak kesim hesaplanır (birleşik = ana + şube)", () => {
    const r = ortakKesimAnaliz(trunk(), [sube(4)], stock, varsayilanConfig, varsayilanIsletme, 6);
    expect(r.aktif).toBe(true);
    expect(r.kesimler.length).toBe(1);
    const k = r.kesimler[0];
    expect(k.junctionDurak).toBe(3);
    expect(k.junctionAd).toBe("Kavşak");
    expect(k.subeFreq).toBeGreaterThan(0);
    // Birleşik frekans, ana + şube = her ikisinden büyük
    expect(k.birlesikFreq).toBeGreaterThan(k.anaFreq);
    expect(k.birlesikFreq).toBeCloseTo(k.anaFreq + k.subeFreq, 0); // bağımsız yuvarlama toleransı
    // Ortak kesim = hat başı → Kavşak = 3 ring = 3.2 km
    expect(k.paylasilanKm).toBeCloseTo(3.2, 1);
  });

  it("çok tren → ortak kesim aşırı yüklenir (uygun=false)", () => {
    const r = ortakKesimAnaliz(trunk(), [sube(40)], stock, { ...varsayilanConfig, headway: 120 }, varsayilanIsletme, 40);
    expect(r.aktif).toBe(true);
    expect(r.uygun).toBe(false);
    expect(r.ozet).toContain("AŞIRI YÜKLÜ");
  });

  it("hat başından ayrılan şube (atIndex=0) → ortak kesim yok", () => {
    const s0: Sube = { id: "s0", ad: "Baş Kol", atIndex: 0, servisTren: 4, rings: [R("Merkez", "P1", 500)] };
    const r = ortakKesimAnaliz(trunk(), [s0], stock, varsayilanConfig, varsayilanIsletme, 6);
    expect(r.aktif).toBe(true);
    expect(r.kesimler.length).toBe(0); // paylaşılan kesim yok
  });
});

describe("#1 Katman-1 şube özeti (editör netliği)", () => {
  it("geometriyi motordan türetir ve rapor 4.4 ile aynı hesaplar", () => {
    const o = subeOzeti(trunk(), sube(4), stock, varsayilanConfig, varsayilanIsletme);
    expect(o.kavsakIndex).toBe(3);
    expect(o.kavsakAd).toBe("Kavşak");
    // Hat başı → Kavşak = 3 ring = 1000+1200+1000 = 3.2 km
    expect(o.kavsakKm).toBeCloseTo(3.2, 3);
    // Şube kendi uzunluğu = 900 + 1600 = 2.5 km
    expect(o.subeKm).toBeCloseTo(2.5, 3);
    // Rota = kavşak + şube = 5.7 km
    expect(o.rotaKm).toBeCloseTo(5.7, 3);
    expect(o.durakSayisi).toBe(2);
    expect(o.maks.gecerli).toBe(true);
    expect(o.maks.nSurdurulebilir).toBeGreaterThan(0);
    expect(o.maks.hMin).toBeGreaterThan(0);
  });

  it("hat başından ayrılan şube → kavşak km = 0 (ortak kesim yok)", () => {
    const s0: Sube = { id: "s0", ad: "Baş Kol", atIndex: 0, rings: [R("Merkez", "P1", 500)] };
    const o = subeOzeti(trunk(), s0, stock, varsayilanConfig, varsayilanIsletme);
    expect(o.kavsakKm).toBe(0);
    expect(o.kavsakAd).toBe("Merkez");
    expect(o.subeKm).toBeCloseTo(0.5, 3);
  });
});

describe("#1 Katman-2B şube terminali (turnback)", () => {
  it("terminal verilmezse ana hattın terminalSon'u korunur (geriye uyumlu)", () => {
    const i = subeIsletme(varsayilanIsletme, sube(4));
    expect(i.terminalSon).toBe(varsayilanIsletme.terminalSon); // referans aynı → override yok
    expect(i.terminalBas).toBe(varsayilanIsletme.terminalBas);
  });

  it("şube terminali verilince terminalSon override edilir, terminalBas değişmez", () => {
    const dongu = { ...varsayilanIsletme.terminalSon, tip: "dongu" as const };
    const s = { ...sube(4), terminal: dongu };
    const i = subeIsletme(varsayilanIsletme, s);
    expect(i.terminalSon).toBe(dongu);
    expect(i.terminalBas).toBe(varsayilanIsletme.terminalBas); // başlangıç = hat başı, değişmez
  });
});
