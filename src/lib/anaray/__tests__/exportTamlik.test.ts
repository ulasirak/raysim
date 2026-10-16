import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { gtfsIhrac } from "@/lib/anaray/gtfs";
import { railmlIhrac } from "@/lib/anaray/railml";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { yeniRing, type Sube } from "@/lib/anaray/ring";

const DURAKLAR = [
  { id: "S0", ad: "A", lat: 37.87, lon: 32.49, varisSn: 0, kalkisSn: 0 },
  { id: "S1", ad: "B", lat: 37.88, lon: 32.50, varisSn: 90, kalkisSn: 110 },
  { id: "S2", ad: "C", lat: 37.89, lon: 32.51, varisSn: 220, kalkisSn: 220 },
];

function dosyalar(zip: Uint8Array): Record<string, string> {
  const u = unzipSync(zip);
  const out: Record<string, string> = {};
  for (const k of Object.keys(u)) out[k] = strFromU8(u[k]);
  return out;
}

describe("#5 GTFS export tamlığı", () => {
  it("çift yön + frequencies + feed_info + shapes üretir", () => {
    const f = dosyalar(gtfsIhrac({
      hatAdi: "Test", agency: "İdare", duraklar: DURAKLAR,
      headwaySn: 240, baslangicSn: 6 * 3600, bitisSn: 24 * 3600,
    }));
    // Tüm zorunlu + tamlık dosyaları
    for (const d of ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar.txt", "feed_info.txt", "shapes.txt", "frequencies.txt"]) {
      expect(f[d], `eksik dosya: ${d}`).toBeTruthy();
    }
    // trips: çift yön (direction_id 0 ve 1)
    const trips = f["trips.txt"].trim().split("\n");
    expect(trips.length).toBe(3); // başlık + 2 yön
    expect(f["trips.txt"]).toContain(",0,");
    expect(f["trips.txt"]).toContain(",1,");
    // frequencies: her iki trip, doğru headway ve pencere
    expect(f["frequencies.txt"]).toContain("T0,06:00:00,24:00:00,240,0");
    expect(f["frequencies.txt"]).toContain("T1,06:00:00,24:00:00,240,0");
    // shapes: iki shape id
    expect(f["shapes.txt"]).toContain("shp_0");
    expect(f["shapes.txt"]).toContain("shp_1");
    // stop_times: iki trip × 3 durak = 6 satır (+başlık)
    expect(f["stop_times.txt"].trim().split("\n").length).toBe(1 + 6);
  });

  it("dönüş yönü durak sırası tersine döner ve seyir süreleri korunur", () => {
    const f = dosyalar(gtfsIhrac({ hatAdi: "T", agency: "A", duraklar: DURAKLAR, headwaySn: 240 }));
    const sats = f["stop_times.txt"].trim().split("\n").slice(1);
    const t1 = sats.filter((s) => s.startsWith("T1,"));
    // T1 ilk durak = C (S2), son durak = A (S0)
    expect(t1[0].split(",")[3]).toBe("S2");
    expect(t1[t1.length - 1].split(",")[3]).toBe("S0");
    // Dönüşte toplam seyir = ileri toplam seyir (220 s), dwell'ler uçta 0
    const sonKalkis = t1[t1.length - 1].split(",")[2]; // A varış = 06:03:40
    expect(sonKalkis).toBe("06:03:40");
  });

  it("headway verilmezse frequencies yok (geriye uyumlu)", () => {
    const f = dosyalar(gtfsIhrac({ hatAdi: "T", agency: "A", duraklar: DURAKLAR }));
    expect(f["frequencies.txt"]).toBeUndefined();
  });

  it("tek durak → tek yön (dönüş üretilmez)", () => {
    const f = dosyalar(gtfsIhrac({ hatAdi: "T", agency: "A", duraklar: [DURAKLAR[0]] }));
    expect(f["trips.txt"].trim().split("\n").length).toBe(2); // başlık + 1
  });
});

describe("#5 railML export tamlığı (rollingstock + timetable)", () => {
  const h = hazirHatlar().find((x) => x.key === "mevcut")!;
  const rings = h.veri.rings ?? [];
  const stock = h.veri.arac!;

  it("stock verilince rollingstock + timetable eklenir", () => {
    const xml = railmlIhrac(rings, h.ad, { stock, cfg: h.veri.cfg, headwaySn: 240, servisBasSn: 6 * 3600, servisBitSn: 7 * 3600 });
    expect(xml).toContain("<rollingstock>");
    expect(xml).toContain(`name="${stock.name}"`);
    expect(xml).toContain(`length="${stock.length.toFixed(2)}"`);
    expect(xml).toContain("<formation id=\"fo_1\"");
    expect(xml).toContain("<timetable id=\"tt_raysim\">");
    expect(xml).toContain("<trainParts>");
    expect(xml).toContain("<ocpTT ocpRef=");
    expect(xml).toContain("<times scope=\"scheduled\"");
    // Çift yön: hem up hem dn trainPart
    expect(xml).toContain("tp_up_0");
    expect(xml).toContain("tp_dn_0");
    // Headway 240 s, pencere 1 saat (3600 s) → ~16 kalkış × 2 yön = ~32 train
    const trainSayisi = (xml.match(/<train /g) || []).length;
    expect(trainSayisi).toBeGreaterThanOrEqual(30);
    expect(trainSayisi).toBeLessThanOrEqual(34);
  });

  it("stock verilmezse yalnız altyapı (geriye uyumlu)", () => {
    const xml = railmlIhrac(rings, h.ad);
    expect(xml).toContain("<infrastructure");
    expect(xml).not.toContain("<rollingstock>");
    expect(xml).not.toContain("<timetable");
  });

  it("timetable up-yön çizelgesi artan; ilk ocp sequence=1", () => {
    const xml = railmlIhrac(rings, h.ad, { stock, cfg: h.veri.cfg, servisBasSn: 6 * 3600 }); // headway yok → tek sefer
    const trainSayisi = (xml.match(/<train /g) || []).length;
    expect(trainSayisi).toBe(2); // tek kalkış × 2 yön
    expect(xml).toContain("sequence=\"1\"");
  });
});

describe("#2 Şube (tali hat) export — durak/rota kaybı YOK", () => {
  // Ana hat A–B–C, kavşak B'de (atIndex 1) ayrılan "Havalimanı Şubesi" B–D–E.
  const anaRings = [yeniRing("A", "B"), yeniRing("B", "C")];
  const subeRings = [yeniRing("B", "D"), yeniRing("D", "E")];
  const sube: Sube = { id: "SUBE_1", ad: "Havalimanı Şubesi", atIndex: 1, rings: subeRings, servisTren: 3 };

  it("railML: her şube AYRI <track> + şube durakları ocp olur; şubesizle geriye uyumlu", () => {
    const xml = railmlIhrac(anaRings, "Test Hattı", { subeler: [sube] });
    expect(xml).toContain('<track id="trk_b0"');
    expect(xml).toContain("Havalimanı Şubesi");
    // Şube durakları (D, E) kendi ocp'lerini aldı; kavşak (B) ana ocp'ye bağlı.
    expect(xml).toContain('name="D"');
    expect(xml).toContain('name="E"');
    expect(xml).toContain("kavşağından ayrılır"); // ayrım dürüstçe belgelenir
    // Şubesiz çağrı trk_b0 ÜRETMEZ (golden korunur).
    expect(railmlIhrac(anaRings, "Test Hattı")).not.toContain("trk_b0");
  });

  it("GTFS: şube ayrı route (Rb0) + çift yön; kavşak durağı tek kez yazılır", () => {
    const trunk = DURAKLAR; // A(S0) B(S1) C(S2)
    // Şube durakları: kavşak B ana hat id'siyle (S1) paylaşılır; D/E yeni id.
    const subeDur = [
      { id: "S1", ad: "B", lat: 37.88, lon: 32.50, varisSn: 0, kalkisSn: 0 },
      { id: "Sb0_1", ad: "D", lat: 37.90, lon: 32.52, varisSn: 100, kalkisSn: 120 },
      { id: "Sb0_2", ad: "E", lat: 37.91, lon: 32.53, varisSn: 240, kalkisSn: 240 },
    ];
    const f = dosyalar(gtfsIhrac({
      hatAdi: "Test", agency: "İdare", duraklar: trunk, headwaySn: 240,
      subeler: [{ ad: "Havalimanı Şubesi", duraklar: subeDur, headwaySn: 300 }],
    }));
    // İki route: ana (R1) + şube (Rb0)
    expect(f["routes.txt"]).toContain("R1,");
    expect(f["routes.txt"]).toContain("Rb0,");
    expect(f["routes.txt"]).toContain("Havalimanı Şubesi");
    // Şube durakları stops.txt'te; kavşak B (S1) yalnız BİR kez (paylaşım).
    expect(f["stops.txt"]).toContain("Sb0_1,D,");
    expect(f["stops.txt"]).toContain("Sb0_2,E,");
    expect(f["stops.txt"].match(/^S1,/gm)?.length ?? 0).toBe(1);
    // Şube çift yön trip'leri + kendi frequencies (300 s)
    expect(f["trips.txt"]).toContain("Rb0,HAFTAICI,Tb0_0,");
    expect(f["trips.txt"]).toContain("Rb0,HAFTAICI,Tb0_1,");
    expect(f["frequencies.txt"]).toContain("Tb0_0,06:00:00,24:00:00,300,0");
    // Ana hat çıktısı korunur
    expect(f["frequencies.txt"]).toContain("T0,06:00:00,24:00:00,240,0");
  });
});
