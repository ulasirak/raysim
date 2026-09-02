// ENTEGRASYON + KENAR DURUM testleri — UI'ın dayandığı çekirdek boru hatları.
// React değil (node ortamı); amaç: motor + import/export + rapor uçtan uca tutarlı
// çalışsın ve boş/uç girdilerde ÇÖKMESİN (UI bu güvenceye güvenir).

import { describe, it, expect } from "vitest";
import { yeniRing, type DurakArasiRing } from "@/lib/anaray/ring";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { blockingTimeRing } from "@/lib/anaray/blockingtime";
import { raporHTML } from "@/lib/anaray/rapor";
import { railmlIhrac, railmlHatKur } from "@/lib/anaray/railml";
import { gtfsIhrac, parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur } from "@/lib/anaray/gtfs";
import { varsayilanConfig, varsayilanIsletme, varsayilanMeta } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";

const cfg = varsayilanConfig, isletme = varsayilanIsletme, stock = varsayilanArac, meta = varsayilanMeta;

function hat(mesafeler: number[]): DurakArasiRing[] {
  return mesafeler.map((m, i) => { const r = yeniRing(`D${i}`, `D${i + 1}`); r.uzunluk = m; r.worstUzunluk = Math.round(m * 1.15); r.dwell = 20; return r; });
}

describe("Kenar durumlar — çökmeden sonuç üretir", () => {
  it("boş hat: maksimumTren geçersiz döner, çökmez", () => {
    const m = maksimumTren([], stock, cfg, isletme);
    expect(m.gecerli).toBe(false);
    expect(Number.isFinite(m.hMin)).toBe(true);
  });

  it("tek ring: kapasite + blocking-time finite ve tutarlı", () => {
    const r = hat([800]);
    const m = maksimumTren(r, stock, cfg, isletme);
    const bt = blockingTimeRing(r, stock, cfg, isletme.kalkisOluZamaniSn);
    expect(m.gecerli).toBe(true);
    expect(Number.isFinite(m.hMin)).toBe(true);
    expect(Number.isFinite(bt.minHeadway)).toBe(true);
    expect(m.nTeorik).toBeGreaterThanOrEqual(1);
  });

  it("aşırı girdiler (uzun/çok kısa/çok istasyon) NaN üretmez", () => {
    for (const r of [hat([50]), hat([20000]), hat(Array(40).fill(500))]) {
      const m = maksimumTren(r, stock, cfg, isletme);
      expect(Number.isFinite(m.hMin)).toBe(true);
      expect(Number.isFinite(m.cevrimSuresi)).toBe(true);
      expect(m.nSurdurulebilir).toBeGreaterThanOrEqual(1);
    }
  });

  it("rapor: minimal hat için HTML üretir (çökmez, boş değil)", () => {
    const html = raporHTML(meta, cfg, dwellUygulanmisRings(hat([600, 700]), stock, isletme), stock, "tr", 0, isletme);
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain("Yönetici Özeti");
  });

  it("railML export: boş/tek-durak dejenere hatta bile string döner", () => {
    expect(typeof railmlIhrac([], "boş")).toBe("string");
    expect(railmlIhrac(hat([500]), "tek").length).toBeGreaterThan(200);
  });
});

describe("İçe → dışa aktarma zincirleri (uçtan uca)", () => {
  it("railML: kur → aktar → kur (istasyon sayısı korunur)", () => {
    const r = hat([300, 450, 600]);
    const geri = railmlHatKur(railmlIhrac(r, "T"));
    expect(geri.durakSayisi).toBe(r.length + 1);
  });

  it("GTFS: üret → ayrıştır → hat kur → yeniden üret (tam döngü)", () => {
    // Küçük gerçek-koordinatlı GTFS üret
    const zip1 = gtfsIhrac({
      hatAdi: "Döngü Hattı", agency: "A",
      duraklar: [
        { id: "S0", ad: "A", lat: 37.87, lon: 32.49, varisSn: 0, kalkisSn: 0 },
        { id: "S1", ad: "B", lat: 37.88, lon: 32.50, varisSn: 120, kalkisSn: 140 },
        { id: "S2", ad: "C", lat: 37.90, lon: 32.52, varisSn: 300, kalkisSn: 320 },
      ],
    });
    const feed = parseGtfsZip(zip1);
    const rota = gtfsRotalar(feed)[0];
    const yon = gtfsYonler(feed, rota.id)[0];
    const kur = gtfsHatKur(feed, rota.id, yon.dir);
    expect(kur.rings.length).toBe(2);                 // 3 durak → 2 ring
    expect(kur.duraklar?.length).toBe(3);             // koordinatlar dışa verildi
    expect(kur.duraklar?.[0].lat).toBeCloseTo(37.87, 4);
    // Yeniden GTFS'e ver
    const zip2 = gtfsIhrac({ hatAdi: kur.ad, agency: "A", duraklar: (kur.duraklar ?? []).map((d, i) => ({ id: `S${i}`, ad: d.ad, lat: d.lat, lon: d.lon, varisSn: i * 100, kalkisSn: i * 100 })) });
    expect(parseGtfsZip(zip2).stops.size).toBe(3);
  });
});
