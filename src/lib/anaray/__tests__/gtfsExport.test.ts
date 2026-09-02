import { describe, it, expect } from "vitest";
import { gtfsIhrac, parseGtfsZip } from "@/lib/anaray/gtfs";

describe("GTFS export → parse round-trip", () => {
  it("geçerli zip; stops lat/lon + stop_times korunur", () => {
    const zip = gtfsIhrac({
      hatAdi: "Test Hattı",
      agency: "Test İdare",
      baslangicSn: 6 * 3600,
      duraklar: [
        { id: "S0", ad: "A Durağı", lat: 37.87, lon: 32.49, varisSn: 0, kalkisSn: 0 },
        { id: "S1", ad: "B, Merkez", lat: 37.88, lon: 32.50, varisSn: 90, kalkisSn: 110 },
        { id: "S2", ad: "C \"Park\"", lat: 37.89, lon: 32.51, varisSn: 220, kalkisSn: 240 },
      ],
    });
    expect(zip.length).toBeGreaterThan(100);
    // Geri ayrıştır (kendi parser'ımızla)
    const feed = parseGtfsZip(zip);
    expect(feed.stops.size).toBe(3);
    expect(feed.routes.length).toBe(1);
    const b = feed.stops.get("S1")!;
    expect(b.ad).toBe("B, Merkez");          // virgüllü ad CSV-kaçışı ile korunur
    expect(Math.abs(b.lat - 37.88)).toBeLessThan(1e-5);
    // stop_times: 3 durak, sıralı, saat formatı
    const st = [...feed.stopTimes.values()][0];
    expect(st.length).toBe(3);
    expect(st[1].varis).toBe(6 * 3600 + 90); // 06:01:30
  });

  it("tırnaklı durak adı bozulmadan geçer", () => {
    const feed = parseGtfsZip(gtfsIhrac({
      hatAdi: "H", agency: "A",
      duraklar: [
        { id: "S0", ad: "İlk", lat: 1, lon: 1, varisSn: 0, kalkisSn: 0 },
        { id: "S1", ad: 'Ç "tırnak" ve, virgül', lat: 2, lon: 2, varisSn: 60, kalkisSn: 60 },
      ],
    }));
    expect(feed.stops.get("S1")!.ad).toBe('Ç "tırnak" ve, virgül');
  });
});
