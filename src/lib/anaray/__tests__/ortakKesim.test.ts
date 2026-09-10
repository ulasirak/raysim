import { describe, it, expect } from "vitest";
import { ortakKesimAnaliz } from "@/lib/anaray/ortakKesim";
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
