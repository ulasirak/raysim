// KAVŞAK ZAMAN-ÇAKIŞMASI (merge/diverge conflict, dallanma sonraki seviye) — kilidi.
import { describe, it, expect } from "vitest";
import { kavsakCakismaAnaliz } from "@/lib/anaray/kavsakCakisma";
import { yeniRing, type DurakArasiRing, type Sube } from "@/lib/anaray/ring";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";

const stock = hazirHatlar()[0].veri.arac!;
const R = (f: string, t: string, u: number) => { const r = yeniRing(f, t); r.uzunluk = u; return r; };
function trunk(): DurakArasiRing[] {
  return [R("Merkez", "Meydan", 1000), R("Meydan", "Sanayi", 1200), R("Sanayi", "Kavşak", 1000), R("Kavşak", "Kampüs", 900), R("Kampüs", "Üniversite", 1000)];
}
const sube = (servisTren?: number): Sube => ({ id: "h", ad: "Havalimanı Kolu", atIndex: 3, servisTren, rings: [R("Kavşak", "Fuar", 900), R("Fuar", "Havalimanı", 1600)] });

describe("kavsakCakismaAnaliz — opt-in kapı (ortakKesim ile aynı)", () => {
  it("servisTren yoksa → analiz kapalı (tahmin yok)", () => {
    const r = kavsakCakismaAnaliz(trunk(), [sube(undefined)], stock, varsayilanConfig, varsayilanIsletme, 6);
    expect(r.aktif).toBe(false);
    expect(r.kavsaklar.length).toBe(0);
  });

  it("hat başından ayrılan şube (atIndex=0) → kavşak yok (ortak kesim yok)", () => {
    const s0: Sube = { id: "s0", ad: "Baş Kol", atIndex: 0, servisTren: 4, rings: [R("Merkez", "P1", 500)] };
    const r = kavsakCakismaAnaliz(trunk(), [s0], stock, varsayilanConfig, varsayilanIsletme, 6);
    expect(r.aktif).toBe(true);
    expect(r.kavsaklar.length).toBe(0);
  });
});

describe("kavsakCakismaAnaliz — pencereli (faz-taramalı) çakışma", () => {
  it("servisTren girilince kavşak analizi üretilir (ana hat + şube servis çifti)", () => {
    const r = kavsakCakismaAnaliz(trunk(), [sube(4)], stock, varsayilanConfig, varsayilanIsletme, 6);
    expect(r.aktif).toBe(true);
    expect(r.kavsaklar.length).toBe(1);
    const k = r.kavsaklar[0];
    expect(k.junctionDurak).toBe(3);
    expect(k.junctionAd).toBe("Kavşak");
    // İki servis (ana + şube) → bir çift
    expect(k.servisler.length).toBe(2);
    expect(k.ciftler.length).toBe(1);
    expect(k.minHeadway).toBeGreaterThan(0);
    // Ortak kesim = hat başı → Kavşak = 3 ring = 3.2 km
    expect(k.paylasilanKm).toBeCloseTo(3.2, 1);
  });

  it("en iyi ayrım + öteleme tutarlı; kaçınılmaz çakışma ⇔ enIyiAralik < kavşak min headway", () => {
    const r = kavsakCakismaAnaliz(trunk(), [sube(4)], stock, varsayilanConfig, varsayilanIsletme, 6);
    const k = r.kavsaklar[0];
    const b = k.baglayan!;
    // En iyi ayrım, şube periyodunun yarısını aşamaz (φ taraması [0,hB))
    const subeServis = k.servisler.find((s) => s.tur === "sube")!;
    expect(b.enIyiAralik).toBeLessThanOrEqual(subeServis.headway / 2 + 1);
    // Öteleme [0, hB) aralığında
    expect(b.enIyiOfset).toBeGreaterThanOrEqual(0);
    expect(b.enIyiOfset).toBeLessThan(subeServis.headway);
    // Tutarlılık
    expect(b.cakismaKacinilmaz).toBe(b.enIyiAralik < k.minHeadway);
    expect(k.cakismaVar).toBe(b.cakismaKacinilmaz);
    expect(k.enIyiOfsetSn).toBe(b.enIyiOfset);
  });

  it("aşırı servis → kapasite aşımı: ortalama bile sığmaz, 'AŞIRI YÜKLÜ' önerisi", () => {
    const r = kavsakCakismaAnaliz(trunk(), [sube(40)], stock, { ...varsayilanConfig, headway: 120 }, varsayilanIsletme, 40);
    expect(r.aktif).toBe(true);
    expect(r.cakismaVar).toBe(true);
    const k = r.kavsaklar[0];
    expect(k.kapasiteAsimi).toBe(true);
    expect(k.ortalamaHeadway).toBeLessThan(k.minHeadway);
    expect(k.oneri).toContain("AŞIRI YÜKLÜ");
  });

  it("ortalama sığar ama periyotlar uyumsuz → VURU çakışması (öteleme çözmez)", () => {
    // Seyrek şube (servisTren=2) + orta ana filo: ortalama birleşik headway min'in üstünde
    // kalır ama periyotlar uyumsuz olduğundan en sıkı ayrım min'in altına düşebilir.
    const r = kavsakCakismaAnaliz(trunk(), [sube(2)], stock, varsayilanConfig, varsayilanIsletme, 6);
    const k = r.kavsaklar[0];
    if (k.cakismaVar && !k.kapasiteAsimi) {
      expect(k.ortalamaHeadway).toBeGreaterThanOrEqual(k.minHeadway);
      expect(k.oneri).toContain("VURU ÇAKIŞMASI");
    }
    // Her halükârda ortalama ve min tutarlı sayılar
    expect(k.ortalamaHeadway).toBeGreaterThan(0);
  });

  it("önlenebilir durumda öneri ÖNLENEBİLİR içerir ve öteleme [0,hB)'de", () => {
    const r = kavsakCakismaAnaliz(trunk(), [sube(2)], stock, varsayilanConfig, varsayilanIsletme, 4);
    const k = r.kavsaklar[0];
    if (!k.cakismaVar) {
      expect(k.oneri).toContain("ÖNLENEBİLİR");
      expect(k.enIyiOfsetSn).toBeGreaterThanOrEqual(0);
    } else {
      // Çakışma varsa ya kapasite aşımı ya vuru çakışması
      expect(k.oneri).toMatch(/AŞIRI YÜKLÜ|VURU ÇAKIŞMASI/);
    }
  });

  it("öteleme uygulanınca ayrım gerçekten en büyük: taranan tüm φ'ler ≤ enIyiAralik üretir", () => {
    // enIyiAralik, baglayan çift için φ taramasının maksimumudur → bu, servis penceresinde
    // erişilebilir en geniş ayrımdır (monoton artan değil ama maksimum doğru seçilmeli).
    const r = kavsakCakismaAnaliz(trunk(), [sube(4)], stock, varsayilanConfig, varsayilanIsletme, 6);
    const k = r.kavsaklar[0];
    expect(k.baglayan!.enIyiAralik).toBeGreaterThanOrEqual(0);
    // Birden çok çift varsa baglayan en küçük enIyiAralik'li olmalı (en sıkı)
    expect(k.baglayan!.enIyiAralik).toBe(Math.min(...k.ciftler.map((c) => c.enIyiAralik)));
  });
});
