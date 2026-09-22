// raysim — OSM'DEN ŞEHİR HATTI KUR (yeni içe-aktarma kaynağı · sunucu · CORS/CSP yok).
//
// "OSM'den hat kur" yetkinliğinin backend'i. İki mod:
//   • mod "ara" : {sehir} (Nominatim ile bbox/area'ya çevrilir) VEYA {bbox} →
//                 o bölgedeki tram / hafif-raylı / metro `route` relation'larını listeler.
//   • mod "hat" : {relIds:[...]} → seçilen rota(lar)ın SIRALI duraklarını (member role="stop"
//                 düğümleri, yolcu sırası) + rota geometrisini (way üyeleri) çeker.
// İstemci lib (osmHatKur) segmentleri birleştirip ring zincirini kurar. © OSM · ODbL.

import { NextResponse } from "next/server";
import { hizSiniri } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sıra ÖNEMLİ: yanıt vermeyen uç 45 s bekletmesin diye en güvenilir public instance önce,
// her uçta kısa abort (18 s) → ölü uç hızlı elenir, çalışana ~3 s'de düşülür.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const UA = "raysim/1.0 (https://raysim.vercel.app; raysim OSM hat içe aktarma)";
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

type LL = { lat: number; lon: number };

/** Douglas-Peucker (lat/lon planar, şehir ölçeği). */
function dp(pts: LL[], eps = 0.00025): [number, number][] {
  if (pts.length < 3) return pts.map((p) => [r4(p.lat), r4(p.lon)]);
  const d2 = (p: LL, a: LL, b: LL) => {
    const dx = b.lat - a.lat, dy = b.lon - a.lon, L = dx * dx + dy * dy || 1e-12;
    let t = ((p.lat - a.lat) * dx + (p.lon - a.lon) * dy) / L; t = Math.max(0, Math.min(1, t));
    const x = a.lat + t * dx, y = a.lon + t * dy; return (p.lat - x) ** 2 + (p.lon - y) ** 2;
  };
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop()!; let mx = 0, mi = -1; for (let k = i + 1; k < j; k++) { const dd = d2(pts[k], pts[i], pts[j]); if (dd > mx) { mx = dd; mi = k; } } if (mx > eps * eps && mi > 0) { keep[mi] = true; st.push([i, mi], [mi, j]); } }
  return pts.filter((_, k) => keep[k]).map((p) => [r4(p.lat), r4(p.lon)]);
}

async function overpass(q: string): Promise<{ elements: OsmEl[] }> {
  let sonHata: unknown = null;
  for (const url of OVERPASS) {
    try {
      const ctrl = new AbortController();
      const zaman = setTimeout(() => ctrl.abort(), 18000);
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA }, body: "data=" + encodeURIComponent(q), signal: ctrl.signal });
      clearTimeout(zaman);
      if (!r.ok) { sonHata = new Error("HTTP " + r.status); continue; }
      return (await r.json()) as { elements: OsmEl[] };
    } catch (err) { sonHata = err; }
  }
  throw sonHata ?? new Error("Overpass erişilemedi.");
}

interface OsmEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number; lon?: number;
  tags?: Record<string, string>;
  geometry?: LL[];
  members?: { type: string; ref: number; role: string }[];
}

/** Nominatim ile şehir → bbox [güney,batı,kuzey,doğu] + görünen ad.
 *  (Alan/area sorgusu il ölçeğinde ~70 s sürdüğü için bbox kullanılır — Overpass bbox'ı
 *  indeksler, relation-yalnız sorgu birkaç saniyede döner.) */
async function sehirCoz(sehir: string): Promise<{ bbox: [number, number, number, number]; ad: string }> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(sehir)}`;
  const ctrl = new AbortController();
  const zaman = setTimeout(() => ctrl.abort(), 20000);
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" }, signal: ctrl.signal });
  clearTimeout(zaman);
  if (!r.ok) throw new Error("Şehir bulunamadı (Nominatim " + r.status + ").");
  const arr = (await r.json()) as { boundingbox?: string[]; display_name?: string }[];
  if (!arr.length) throw new Error("Şehir bulunamadı: " + sehir);
  const h = arr[0];
  const bb = (h.boundingbox ?? []).map(Number); // [south, north, west, east]
  if (bb.length !== 4 || !bb.every(Number.isFinite)) throw new Error("Şehir sınırı çözülemedi: " + sehir);
  return { bbox: [bb[0], bb[2], bb[1], bb[3]], ad: h.display_name ?? sehir };
}

async function rotaAra(sehir: string | undefined, bbox: [number, number, number, number] | undefined) {
  let alanAd = "";
  if (sehir) {
    const c = await sehirCoz(sehir);
    alanAd = c.ad;
    bbox = c.bbox;
  }
  if (!bbox) throw new Error("Şehir ya da bbox gerekli.");
  const [s, w, n, e] = bbox;
  if (!(n > s && e > w) || n - s > 4 || e - w > 4) throw new Error("Bölge geçersiz ya da çok büyük (≤4°). Daha dar bir şehir/ilçe yaz.");
  const q = `[out:json][timeout:50];rel["route"~"^(tram|light_rail|subway)$"](${s},${w},${n},${e});out tags;`;
  return finishAra(await overpass(q), alanAd, bbox);
}

function finishAra(js: { elements: OsmEl[] }, alanAd: string, bbox?: [number, number, number, number]) {
  const rotalar = (js.elements ?? [])
    .filter((e) => e.type === "relation")
    .map((e) => ({
      id: e.id,
      ref: e.tags?.ref ?? "",
      ad: e.tags?.name ?? (e.tags?.ref ? `Hat ${e.tags.ref}` : `Rota ${e.id}`),
      from: e.tags?.from ?? "",
      to: e.tags?.to ?? "",
      network: e.tags?.network ?? "",
      operator: e.tags?.operator ?? "",
      renk: e.tags?.colour ?? "",
      tip: e.tags?.route ?? "tram",
    }))
    .sort((a, b) => (a.ref || a.ad).localeCompare(b.ref || b.ad, "tr"));
  return NextResponse.json({ alanAd, bbox, rotalar, not: "© OpenStreetMap · ODbL" });
}

async function hatCek(relIds: number[]) {
  const idListe = relIds.map((n) => Math.round(n)).filter((n) => n > 0).slice(0, 8);
  if (idListe.length === 0) throw new Error("Geçerli rota kimliği gerekli.");
  // Küme adlandırması ŞART: adsız `node(r)` bir önceki `way(r)` kümesine bakar → 0 durak.
  // .r = ilişkiler, .w = üye way'ler (geometri), .n = üye node'lar (durak koord+ad).
  const q = `[out:json][timeout:60];rel(id:${idListe.join(",")})->.r;.r out body;way(r.r)->.w;.w out geom;node(r.r)->.n;.n out body;`;
  const js = await overpass(q);
  const el = js.elements ?? [];
  const nodeById = new Map<number, OsmEl>();
  const wayById = new Map<number, OsmEl>();
  for (const e of el) { if (e.type === "node") nodeById.set(e.id, e); else if (e.type === "way") wayById.set(e.id, e); }

  const segmentler = [];
  for (const relId of idListe) {
    const rel = el.find((e) => e.type === "relation" && e.id === relId);
    if (!rel || !rel.members) continue;
    const duraklar: { ad: string; lat: number; lon: number }[] = [];
    const gorulen = new Set<string>();
    const geoLL: LL[] = [];
    let anon = 0;
    for (const m of rel.members) {
      const rol = m.role || "";
      if (m.type === "node" && (rol.startsWith("stop") || rol.startsWith("platform"))) {
        const nd = nodeById.get(m.ref);
        if (!nd || !Number.isFinite(nd.lat) || !Number.isFinite(nd.lon)) continue;
        const ad = (nd.tags?.name ?? "").trim() || `Durak ${++anon}`;
        const key = ad.toLocaleLowerCase("tr");
        if (gorulen.has(key)) continue; // aynı ada 2. platform/stop → atla
        gorulen.add(key);
        duraklar.push({ ad, lat: r4(nd.lat!), lon: r4(nd.lon!) });
      } else if (m.type === "way" && rol === "") {
        const wy = wayById.get(m.ref);
        if (wy?.geometry && wy.geometry.length >= 2) {
          for (const g of wy.geometry) geoLL.push(g);
        }
      }
    }
    const geometri = geoLL.length >= 2 ? dp(geoLL) : [];
    segmentler.push({
      relId,
      ad: rel.tags?.name ?? `Rota ${relId}`,
      from: rel.tags?.from ?? "",
      to: rel.tags?.to ?? "",
      network: rel.tags?.network ?? "",
      duraklar,
      geometri,
    });
  }
  if (segmentler.length === 0) throw new Error("Rota(lar) bulunamadı ya da sıralı durak yok.");
  return NextResponse.json({ segmentler, not: "© OpenStreetMap · ODbL" });
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
  const hiz = await hizSiniri("osmrota:" + ip, 20, 60, false);
  if (!hiz.izin) return NextResponse.json({ hata: "Çok fazla istek — biraz bekleyin.", sifirlaSn: hiz.sifirlaSn }, { status: 429 });

  let body: { mod?: string; sehir?: string; bbox?: [number, number, number, number]; relIds?: number[]; relId?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  try {
    if (body.mod === "ara") {
      const bbox = Array.isArray(body.bbox) && body.bbox.length === 4 && body.bbox.every((v) => typeof v === "number" && Number.isFinite(v)) ? body.bbox : undefined;
      const sehir = typeof body.sehir === "string" && body.sehir.trim() ? body.sehir.trim().slice(0, 120) : undefined;
      if (!sehir && !bbox) return NextResponse.json({ hata: "Şehir adı ya da bbox gerekli." }, { status: 400 });
      return await rotaAra(sehir, bbox);
    }
    if (body.mod === "hat") {
      const relIds = Array.isArray(body.relIds) ? body.relIds : (typeof body.relId === "number" ? [body.relId] : []);
      if (relIds.length === 0) return NextResponse.json({ hata: "En az bir rota kimliği (relId) gerekli." }, { status: 400 });
      return await hatCek(relIds);
    }
    return NextResponse.json({ hata: "mod 'ara' ya da 'hat' olmalı." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OSM'den çekilemedi.";
    return NextResponse.json({ hata: msg + " (Overpass/Nominatim yoğun olabilir — birazdan tekrar deneyin.)" }, { status: 502 });
  }
}
