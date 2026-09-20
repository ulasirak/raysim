// raysim — HAT GEOMETRİSİNİ OpenStreetMap'ten çek (Büyük sıçrama D — sürdürülebilir harita).
// Koordinatı olan ama import (GTFS/CAD) geometrisi OLMAYAN müşteri hatları için: hattın
// bbox'ından OSM raylı-hat (tram/light_rail/subway + inşaat) geometrisini SUNUCU tarafında
// çeker (CORS/CSP yok), Douglas-Peucker ile sadeleştirir, 24 saat cache'ler. © OSM · ODbL.

import { NextResponse } from "next/server";
import { hizSiniri } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

type GeoYol = { insaat: boolean; noktalar: [number, number][] };
type OsmIstasyon = { ad: string; lat: number; lon: number };
type OsmSonuc = { geometri: GeoYol[]; istasyonlar: OsmIstasyon[] };

// Modül-içi cache (bbox anahtarlı, 24 s TTL). Serverless soğuk-başlatmada sıfırlanır — zararsız.
const cache = new Map<string, { t: number; veri: OsmSonuc }>();
const TTL = 1000 * 60 * 60 * 24;

const OVERPASS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** Douglas-Peucker (lat/lon planar, şehir ölçeği) → nokta sayısını düşür, harita boyutu makul. */
function dp(pts: { lat: number; lon: number }[], eps = 0.00025): [number, number][] {
  if (pts.length < 3) return pts.map((p) => [r4(p.lat), r4(p.lon)]);
  const d2 = (p: { lat: number; lon: number }, a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const dx = b.lat - a.lat, dy = b.lon - a.lon, L = dx * dx + dy * dy || 1e-12;
    let t = ((p.lat - a.lat) * dx + (p.lon - a.lon) * dy) / L; t = Math.max(0, Math.min(1, t));
    const x = a.lat + t * dx, y = a.lon + t * dy; return (p.lat - x) ** 2 + (p.lon - y) ** 2;
  };
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop()!; let mx = 0, mi = -1; for (let k = i + 1; k < j; k++) { const dd = d2(pts[k], pts[i], pts[j]); if (dd > mx) { mx = dd; mi = k; } } if (mx > eps * eps && mi > 0) { keep[mi] = true; st.push([i, mi], [mi, j]); } }
  return pts.filter((_, k) => keep[k]).map((p) => [r4(p.lat), r4(p.lon)]);
}
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

async function overpassCek(bbox: [number, number, number, number]): Promise<OsmSonuc> {
  const [s, w, n, e] = bbox;
  const bb = `(${s},${w},${n},${e})`;
  // Tek sorguda hem raylı-hat WAY'leri (geometri) hem de İSTASYON NODE'ları (tram_stop /
  // station / halt / public_transport + inşaat halindeki istasyonlar) — koordinat da gelir.
  const q = `[out:json][timeout:60];`
    + `(way["railway"~"^(tram|light_rail|subway|construction)$"]${bb};)->.w;`
    + `(node["railway"~"^(tram_stop|station|halt)$"]${bb};node["public_transport"~"^(station|platform|stop_position)$"]${bb};node["construction:railway"~"^(station|halt|tram_stop)$"]${bb};)->.n;`
    + `.w out geom;.n out body;`;
  let sonHata: unknown = null;
  for (const url of OVERPASS) {
    try {
      const ctrl = new AbortController();
      const zaman = setTimeout(() => ctrl.abort(), 45000);
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: ctrl.signal });
      clearTimeout(zaman);
      if (!r.ok) { sonHata = new Error("HTTP " + r.status); continue; }
      const j = (await r.json()) as { elements?: { type: string; tags?: Record<string, string>; lat?: number; lon?: number; geometry?: { lat: number; lon: number }[] }[] };
      const el = j.elements ?? [];
      const geometri = el.filter((x) => x.type === "way" && x.geometry && x.geometry.length >= 2)
        .map((wy) => ({ insaat: wy.tags?.railway === "construction", noktalar: dp(wy.geometry!) }))
        .filter((y) => y.noktalar.length >= 2);
      // İstasyon node'ları: adlı olanlar; aynı ada birden çok platform → ilkini tut.
      const gorulen = new Set<string>();
      const istasyonlar: OsmIstasyon[] = [];
      for (const nd of el) {
        if (nd.type !== "node" || !nd.tags?.name || !Number.isFinite(nd.lat) || !Number.isFinite(nd.lon)) continue;
        const ad = nd.tags.name.trim();
        const key = ad.toLocaleLowerCase("tr");
        if (gorulen.has(key)) continue;
        gorulen.add(key);
        istasyonlar.push({ ad, lat: r4(nd.lat!), lon: r4(nd.lon!) });
      }
      return { geometri, istasyonlar };
    } catch (err) { sonHata = err; }
  }
  throw sonHata ?? new Error("Overpass erişilemedi.");
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
  const hiz = await hizSiniri("osmgeo:" + ip, 20, 60, false); // 20/dk; rate-limit altyapısı yoksa fail-OPEN (convenience uç)
  if (!hiz.izin) return NextResponse.json({ hata: "Çok fazla istek — biraz bekleyin.", sifirlaSn: hiz.sifirlaSn }, { status: 429 });

  let body: { bbox?: [number, number, number, number] };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  const bbox = body.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return NextResponse.json({ hata: "Geçerli bbox gerekli [güney,batı,kuzey,doğu]." }, { status: 400 });
  }
  const [s, w, n, e] = bbox;
  if (n <= s || e <= w || n - s > 0.6 || e - w > 0.6) {
    return NextResponse.json({ hata: "bbox geçersiz ya da çok büyük (≤0,6°)." }, { status: 400 });
  }

  const key = bbox.map((v) => v.toFixed(3)).join(",");
  const c = cache.get(key);
  if (c && Date.now() - c.t < TTL) return NextResponse.json({ geometri: c.veri.geometri, istasyonlar: c.veri.istasyonlar, kaynak: "osm-cache", not: "© OpenStreetMap · ODbL" });

  try {
    const veri = await overpassCek(bbox);
    cache.set(key, { t: Date.now(), veri });
    return NextResponse.json({
      geometri: veri.geometri,
      istasyonlar: veri.istasyonlar,
      kaynak: "osm",
      not: "© OpenStreetMap · ODbL",
      uyari: veri.geometri.length === 0 && veri.istasyonlar.length === 0 ? "Bu alanda OpenStreetMap'te raylı hat bulunamadı." : undefined,
    });
  } catch {
    return NextResponse.json({ hata: "OpenStreetMap'ten çekilemedi (geçici — Overpass yoğun olabilir). Biraz sonra tekrar deneyin." }, { status: 502 });
  }
}
