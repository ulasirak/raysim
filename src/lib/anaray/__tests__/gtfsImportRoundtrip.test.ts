import { describe, it, expect } from "vitest";
import { gtfsIhrac, parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur, type GtfsDurakZaman } from "../gtfs";

// İMPORT YOLU round-trip: gerçek koordinatlı GTFS üret (ihrac) → ayrıştır → hat kur.
// Konya etap hatları "import ile" (gömülü DEĞİL) geldiği için bu yol sağlam olmalı:
// stops.txt lat/lon → istasyonKoordinat; shapes.txt → hatGeometri. Bu test o zinciri korur.
describe("GTFS import yolu (koordinatlı hat)", () => {
  const duraklar: GtfsDurakZaman[] = [
    { id: "s0", ad: "Aslım Sanayi", lat: 37.93088, lon: 32.56869, varisSn: 0, kalkisSn: 0 },
    { id: "s1", ad: "Ravza Camii", lat: 37.9253, lon: 32.5639, varisSn: 120, kalkisSn: 140 },
    { id: "s2", ad: "Gülistan Caddesi", lat: 37.91669, lon: 32.55661, varisSn: 300, kalkisSn: 320 },
    { id: "s3", ad: "Şehir Hastanesi", lat: 37.85656, lon: 32.54901, varisSn: 900, kalkisSn: 900 },
  ];
  const zip = gtfsIhrac({ hatAdi: "Konya 1. Etap (test)", agency: "AYGM", duraklar });

  it("üretilen GTFS ayrıştırılabilir; 1 tramvay rotası + yön", () => {
    const feed = parseGtfsZip(zip);
    const rotalar = gtfsRotalar(feed);
    expect(rotalar.length).toBe(1);
    expect(rotalar[0].tip).toBe("0"); // tramvay
    const yonler = gtfsYonler(feed, rotalar[0].id);
    expect(yonler.length).toBeGreaterThanOrEqual(1);
  });

  it("hat kurulunca durak koordinatları (lat/lon) korunur", () => {
    const feed = parseGtfsZip(zip);
    const rid = gtfsRotalar(feed)[0].id;
    const dir = gtfsYonler(feed, rid)[0].dir;
    const sonuc = gtfsHatKur(feed, rid, dir);
    expect(sonuc.durakSayisi).toBe(4);
    expect(sonuc.duraklar).toBeDefined();
    const asl = sonuc.duraklar!.find((d) => d.ad === "Aslım Sanayi")!;
    expect(asl).toBeDefined();
    expect(asl.lat).toBeCloseTo(37.93088, 4);
    expect(asl.lon).toBeCloseTo(32.56869, 4);
    // tüm duraklar koordinatlı → import sonrası haritaTam olur
    expect(sonuc.duraklar!.length).toBe(4);
  });

  it("shapes.txt → gerçek geometri döner (harita hizası için)", () => {
    const feed = parseGtfsZip(zip);
    const rid = gtfsRotalar(feed)[0].id;
    const dir = gtfsYonler(feed, rid)[0].dir;
    const sonuc = gtfsHatKur(feed, rid, dir);
    expect(sonuc.geometri).toBeDefined();
    expect(sonuc.geometri!.length).toBeGreaterThanOrEqual(2);
    // geometri [lat,lon] Konya bölgesinde
    for (const [la, lo] of sonuc.geometri!) {
      expect(la).toBeGreaterThan(37.8); expect(la).toBeLessThan(37.95);
      expect(lo).toBeGreaterThan(32.53); expect(lo).toBeLessThan(32.58);
    }
  });

  it("ring zinciri kuruldu; durak-arası mesafeler makul (>0)", () => {
    const feed = parseGtfsZip(zip);
    const rid = gtfsRotalar(feed)[0].id;
    const dir = gtfsYonler(feed, rid)[0].dir;
    const sonuc = gtfsHatKur(feed, rid, dir);
    expect(sonuc.rings.length).toBe(3); // 4 durak → 3 ring
    for (const r of sonuc.rings) expect(r.uzunluk).toBeGreaterThan(20);
  });
});
