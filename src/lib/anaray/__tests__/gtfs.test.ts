// GTFS içe aktarma çekirdeği testi — sentetik feed'i fflate ile zip'leyip parse eder,
// ring zincirini (mesafe/dwell/ad) doğrular. CSV tırnaklı-virgül alanı da test edilir.

import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur } from "@/lib/anaray/gtfs";

const feed = {
  "stops.txt": [
    "stop_id,stop_name,stop_lat,stop_lon",
    "A,İstasyon A,39.0000,32.0000",
    "B,İstasyon B,39.0100,32.0000",
    'C,"İstasyon C, Merkez",39.0100,32.0100',
  ].join("\n"),
  "routes.txt": [
    "route_id,route_short_name,route_long_name,route_type",
    "R1,T1,Test Tramvay,0",
  ].join("\n"),
  "trips.txt": [
    "route_id,trip_id,direction_id,trip_headsign",
    "R1,TR1,0,C Yönü",
    "R1,TR0,0,Kısa",          // aynı yönde daha AZ duraklı trip → seçilmemeli
  ].join("\n"),
  "stop_times.txt": [
    "trip_id,stop_id,stop_sequence,arrival_time,departure_time",
    "TR1,A,1,08:00:00,08:00:00",
    "TR1,B,2,08:00:30,08:01:00",   // B'de 30 s bekleme
    "TR1,C,3,08:02:00,08:02:20",   // C'de 20 s bekleme
    "TR0,A,1,09:00:00,09:00:00",
    "TR0,B,2,09:01:00,09:01:00",
  ].join("\n"),
};

const zip = zipSync(Object.fromEntries(Object.entries(feed).map(([k, v]) => [k, strToU8(v)])));

describe("GTFS import çekirdeği", () => {
  const parsed = parseGtfsZip(zip);

  it("rota listesi doğru", () => {
    const r = gtfsRotalar(parsed);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "R1", ad: "T1", tip: "0", tipAd: "Tramvay" });
  });

  it("yönler + en zengin trip durak sayısı", () => {
    const y = gtfsYonler(parsed, "R1");
    expect(y).toHaveLength(1);
    expect(y[0]).toMatchObject({ dir: "0", duraklar: 3, headsign: "C Yönü" });
  });

  const sonuc = gtfsHatKur(parsed, "R1", "0");

  it("2 ring (3 durak), en çok duraklı trip seçildi", () => {
    expect(sonuc.rings).toHaveLength(2);
    expect(sonuc.durakSayisi).toBe(3);
  });

  it("durak adları (CSV tırnaklı-virgül dâhil) doğru", () => {
    expect(sonuc.rings[0].fromAd).toBe("İstasyon A");
    expect(sonuc.rings[0].toAd).toBe("İstasyon B");
    expect(sonuc.rings[1].toAd).toBe("İstasyon C, Merkez");
  });

  it("haversine mesafeleri makul (0.01° enlem ≈ 1113 m; boylam ≈ 865 m)", () => {
    expect(sonuc.rings[0].uzunluk).toBeGreaterThan(1090);
    expect(sonuc.rings[0].uzunluk).toBeLessThan(1135);
    expect(sonuc.rings[1].uzunluk).toBeGreaterThan(840);
    expect(sonuc.rings[1].uzunluk).toBeLessThan(890);
  });

  it("dwell stop_times'tan (B=30 s, C=20 s)", () => {
    expect(sonuc.rings[0].dwell).toBe(30);
    expect(sonuc.rings[1].dwell).toBe(20);
  });

  it("worst/best uzunluk türetildi", () => {
    expect(sonuc.rings[0].worstUzunluk).toBeGreaterThanOrEqual(sonuc.rings[0].uzunluk);
    expect(sonuc.rings[0].bestUzunluk).toBeLessThanOrEqual(sonuc.rings[0].uzunluk);
  });

  it("bozuk ZIP → hata", () => {
    expect(() => parseGtfsZip(strToU8("bu bir zip değil"))).toThrow();
  });
});

// shapes.txt varsa GERÇEK güzergâh geometrisi kullanılmalı: A→B arasına kavis (detour)
// koyduğumuzda ölçülen mesafe düz-çizgiden (haversine ≈1113 m) belirgin BÜYÜK olmalı.
const feedShape = {
  "stops.txt": ["stop_id,stop_name,stop_lat,stop_lon", "A,A,39.000,32.000", "B,B,39.010,32.000", "C,C,39.010,32.010"].join("\n"),
  "routes.txt": ["route_id,route_short_name,route_type", "R1,T1,0"].join("\n"),
  "trips.txt": ["route_id,trip_id,direction_id,shape_id", "R1,TR1,0,SH1"].join("\n"),
  "stop_times.txt": ["trip_id,stop_id,stop_sequence,arrival_time,departure_time",
    "TR1,A,1,08:00:00,08:00:00", "TR1,B,2,08:00:30,08:01:00", "TR1,C,3,08:02:00,08:02:20"].join("\n"),
  "shapes.txt": ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence",
    "SH1,39.000,32.000,1", "SH1,39.005,32.005,2", "SH1,39.010,32.000,3", "SH1,39.010,32.005,4", "SH1,39.010,32.010,5"].join("\n"),
};
const zipShape = zipSync(Object.fromEntries(Object.entries(feedShape).map(([k, v]) => [k, strToU8(v)])));

describe("GTFS shapes.txt — gerçek güzergâh mesafesi", () => {
  const sonuc = gtfsHatKur(parseGtfsZip(zipShape), "R1", "0");
  it("A→B kavisli güzergâh düz-çizgiden büyük (~1410 m > 1113 m)", () => {
    expect(sonuc.rings[0].uzunluk).toBeGreaterThan(1250);
    expect(sonuc.rings[0].uzunluk).toBeLessThan(1600);
  });
  it("uyarı gerçek güzergâhı belirtir", () => {
    expect(sonuc.uyarilar.some((u) => u.includes("shapes.txt"))).toBe(true);
  });
});
