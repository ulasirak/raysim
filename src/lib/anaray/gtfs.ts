// raysim — GTFS İÇE AKTARMA çekirdeği (saf TS; UI'dan bağımsız, test edilebilir).
// GTFS (General Transit Feed Specification): bir ZIP içinde CSV'ler (stops/routes/
// trips/stop_times). Bir rota + yön seçilince o hattın SIRALI duraklarından, gerçek
// enlem-boylamla (haversine) durak-arası mesafeler ve stop_times'tan duruş süreleri
// çıkarılıp RaySim ring zinciri (DurakArasiRing[]) kurulur. Makas/sinyal GTFS'te yok →
// varsayılan kalır (kullanıcı Ringler'de ekler).

import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { yeniRing, yeniKurp, kurpHizi, type DurakArasiRing } from "./ring";
import { kurplariBul } from "./kurpBul";

// —— Minimal CSV (RFC-4180: tırnaklı alan + kaçışlı çift tırnak) ——
function csvSatirlar(metin: string): string[][] {
  const out: string[][] = [];
  let alan = "", satir: string[] = [], tirnak = false;
  const s = metin.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (tirnak) {
      if (c === '"') { if (s[i + 1] === '"') { alan += '"'; i++; } else tirnak = false; }
      else alan += c;
    } else if (c === '"') tirnak = true;
    else if (c === ",") { satir.push(alan); alan = ""; }
    else if (c === "\n") { satir.push(alan); out.push(satir); satir = []; alan = ""; }
    else alan += c;
  }
  if (alan.length || satir.length) { satir.push(alan); out.push(satir); }
  return out.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}
function csvNesneler(metin: string): Record<string, string>[] {
  const rows = csvSatirlar(metin);
  if (rows.length < 1) return [];
  const bas = rows[0].map((h) => h.trim().replace(/^﻿/, ""));
  return rows.slice(1).map((r) => Object.fromEntries(bas.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export interface GtfsFeed {
  stops: Map<string, { ad: string; lat: number; lon: number }>;
  routes: { id: string; ad: string; tip: string }[];
  trips: { tripId: string; routeId: string; dir: string; headsign: string; shapeId: string }[];
  stopTimes: Map<string, { stopId: string; seq: number; varis: number; kalkis: number }[]>; // tripId → sıralı
  shapes: Map<string, { lat: number; lon: number }[]>; // shapeId → seq sıralı poligon (varsa)
}

const dosyaBul = (z: Record<string, Uint8Array>, ad: string): string | undefined =>
  Object.keys(z).find((k) => k.toLowerCase().replace(/\\/g, "/").split("/").pop() === ad);

const saat = (t: string): number => {
  const p = t.split(":").map((x) => parseInt(x, 10));
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? p[0] * 3600 + p[1] * 60 + p[2] : NaN;
};

/** GTFS .zip baytlarını ayrıştır. Eksik/bozuk zorunlu dosyada hata fırlatır. */
export function parseGtfsZip(bytes: Uint8Array): GtfsFeed {
  let z: Record<string, Uint8Array>;
  try { z = unzipSync(bytes); } catch { throw new Error("Geçersiz ZIP dosyası."); }
  const oku = (ad: string, zorunlu = true): string => {
    const k = dosyaBul(z, ad);
    if (!k) { if (zorunlu) throw new Error(`GTFS eksik: ${ad} yok.`); return ""; }
    return strFromU8(z[k]);
  };
  const stops = new Map<string, { ad: string; lat: number; lon: number }>();
  for (const r of csvNesneler(oku("stops.txt"))) {
    if (!r.stop_id) continue;
    stops.set(r.stop_id, { ad: r.stop_name || r.stop_id, lat: parseFloat(r.stop_lat), lon: parseFloat(r.stop_lon) });
  }
  const routes = csvNesneler(oku("routes.txt"))
    .filter((r) => r.route_id)
    .map((r) => ({ id: r.route_id, ad: (r.route_short_name || r.route_long_name || r.route_id).trim(), tip: r.route_type || "" }));
  const trips = csvNesneler(oku("trips.txt"))
    .filter((r) => r.trip_id && r.route_id)
    .map((r) => ({ tripId: r.trip_id, routeId: r.route_id, dir: r.direction_id || "0", headsign: r.trip_headsign || "", shapeId: r.shape_id || "" }));
  // shapes.txt (opsiyonel) — gerçek güzergâh geometrisi (haversine düz-çizgiden doğru).
  const shapes = new Map<string, { lat: number; lon: number; seq: number }[]>();
  for (const r of csvNesneler(oku("shapes.txt", false))) {
    if (!r.shape_id) continue;
    const arr = shapes.get(r.shape_id) ?? [];
    arr.push({ lat: parseFloat(r.shape_pt_lat), lon: parseFloat(r.shape_pt_lon), seq: parseInt(r.shape_pt_sequence || "0", 10) || 0 });
    shapes.set(r.shape_id, arr);
  }
  const shapesSirali = new Map<string, { lat: number; lon: number }[]>();
  for (const [id, arr] of shapes) shapesSirali.set(id, arr.sort((a, b) => a.seq - b.seq).map(({ lat, lon }) => ({ lat, lon })));
  const stopTimes = new Map<string, { stopId: string; seq: number; varis: number; kalkis: number }[]>();
  for (const r of csvNesneler(oku("stop_times.txt"))) {
    if (!r.trip_id || !r.stop_id) continue;
    const v = saat(r.arrival_time || r.departure_time || ""), k = saat(r.departure_time || r.arrival_time || "");
    const arr = stopTimes.get(r.trip_id) ?? [];
    arr.push({ stopId: r.stop_id, seq: parseInt(r.stop_sequence || "0", 10) || 0, varis: v, kalkis: k });
    stopTimes.set(r.trip_id, arr);
  }
  for (const arr of stopTimes.values()) arr.sort((a, b) => a.seq - b.seq);
  if (routes.length === 0) throw new Error("GTFS'te rota yok (routes.txt boş).");
  return { stops, routes, trips, stopTimes, shapes: shapesSirali };
}

/** Rota listesi (UI'da seçilir). route_type: 0=tramvay,1=metro,2=tren,3=otobüs… */
export function gtfsRotalar(feed: GtfsFeed): { id: string; ad: string; tip: string; tipAd: string }[] {
  const TIP: Record<string, string> = { "0": "Tramvay", "1": "Metro", "2": "Tren", "3": "Otobüs", "4": "Feribot", "5": "Teleferik" };
  return feed.routes.map((r) => ({ ...r, tipAd: TIP[r.tip] || "Diğer" }));
}

/** Bir rotanın yönleri + her yönde en zengin trip'in durak sayısı. */
export function gtfsYonler(feed: GtfsFeed, routeId: string): { dir: string; duraklar: number; headsign: string }[] {
  const yonMap = new Map<string, { duraklar: number; headsign: string }>();
  for (const t of feed.trips.filter((x) => x.routeId === routeId)) {
    const n = feed.stopTimes.get(t.tripId)?.length ?? 0;
    const mevcut = yonMap.get(t.dir);
    if (!mevcut || n > mevcut.duraklar) yonMap.set(t.dir, { duraklar: n, headsign: t.headsign });
  }
  return [...yonMap.entries()].map(([dir, v]) => ({ dir, ...v })).sort((a, b) => a.dir.localeCompare(b.dir));
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return NaN;
  const R = 6371000, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Bir poligon (shape) boyunca kümülatif mesafe (m) + bir noktaya en yakın köşe indeksi.
function sekilKumulatif(pts: { lat: number; lon: number }[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + (haversine(pts[i - 1], pts[i]) || 0));
  return cum;
}
function enYakinIdx(pts: { lat: number; lon: number }[], p: { lat: number; lon: number }): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) { const d = haversine(pts[i], p); if (Number.isFinite(d) && d < bd) { bd = d; bi = i; } }
  return bi;
}

export interface GtfsHatSonuc { rings: DurakArasiRing[]; ad: string; durakSayisi: number; toplamKm: number; uyarilar: string[]; duraklar?: { ad: string; lat: number; lon: number }[]; }

/** Rota + yön → RaySim ring zinciri. Temsili trip = o yönde EN ÇOK duraklı trip. */
export function gtfsHatKur(feed: GtfsFeed, routeId: string, dir: string): GtfsHatSonuc {
  const uyarilar: string[] = [];
  const adaylar = feed.trips.filter((t) => t.routeId === routeId && t.dir === dir);
  if (adaylar.length === 0) throw new Error("Bu rota/yön için sefer (trip) bulunamadı.");
  let temsili = adaylar[0], enCok = -1;
  for (const t of adaylar) { const n = feed.stopTimes.get(t.tripId)?.length ?? 0; if (n > enCok) { enCok = n; temsili = t; } }
  const st = feed.stopTimes.get(temsili.tripId) ?? [];
  if (st.length < 2) throw new Error("Hat için en az 2 durak gerekli.");

  // Ardışık AYNI durağı (aynı stopId) sıkıştır.
  const dizi = st.filter((x, i) => i === 0 || x.stopId !== st[i - 1].stopId);
  const rotaAd = feed.routes.find((r) => r.id === routeId)?.ad || routeId;
  const ad = `${rotaAd}${temsili.headsign ? ` — ${temsili.headsign}` : ""}`;

  // GERÇEK GÜZERGÂH: trip'in shape'i varsa, her durağın güzergâh boyunca kümülatif
  // mesafesinden durak-arası ölçülür (viraj dâhil, düz-çizgiden doğru). Eşleşme monoton
  // artmıyorsa (bozuk shape) güvenle düz-çizgiye (haversine) düşülür.
  const shape = temsili.shapeId ? feed.shapes.get(temsili.shapeId) : undefined;
  let stopKum: number[] | null = null;
  if (shape && shape.length >= 2) {
    const cum = sekilKumulatif(shape);
    const km = dizi.map((s) => { const st = feed.stops.get(s.stopId); return st && Number.isFinite(st.lat) ? cum[enYakinIdx(shape, st)] : NaN; });
    if (km.every(Number.isFinite) && km.every((v, i) => i === 0 || v >= km[i - 1] - 1)) stopKum = km;
  }
  const sekilKullanildi = !!stopKum;

  let koordsuz = 0, toplam = 0;
  const rings: DurakArasiRing[] = [];
  for (let i = 0; i < dizi.length - 1; i++) {
    const a = feed.stops.get(dizi[i].stopId), b = feed.stops.get(dizi[i + 1].stopId);
    const adA = a?.ad || dizi[i].stopId, adB = b?.ad || dizi[i + 1].stopId;
    let mesafe = stopKum ? Math.abs(stopKum[i + 1] - stopKum[i]) : (a && b ? haversine(a, b) : NaN);
    if (!Number.isFinite(mesafe) || mesafe < 20) { mesafe = a && b ? haversine(a, b) : NaN; } // shape 0/eksikse düz-çizgi
    if (!Number.isFinite(mesafe) || mesafe < 20) { mesafe = 600; koordsuz++; } // yine yoksa varsayılan
    const uz = Math.round(mesafe);
    toplam += uz;
    // Varış durağındaki bekleme: kalkış − varış (varsa, makul aralıkta).
    const bek = dizi[i + 1].kalkis - dizi[i + 1].varis;
    const dwell = Number.isFinite(bek) && bek > 0 && bek < 600 ? Math.round(bek) : 20;
    const r = yeniRing(adA, adB);
    r.uzunluk = uz;
    r.worstUzunluk = Math.max(uz, Math.round(uz * 1.15));
    r.bestUzunluk = Math.max(50, Math.round(uz * 0.7));
    r.dwell = dwell;
    rings.push(r);
  }
  // Yatay KURPLAR: shape (gerçek güzergâh) varsa geometriden otomatik çıkar → ilgili ringe ekle.
  if (shape && stopKum && shape.length >= 3) {
    const d2r = Math.PI / 180, Re = 6371000, lat0 = shape[0].lat * d2r, lon0 = shape[0].lon;
    const proj = shape.map((pt) => ({ x: (pt.lon - lon0) * d2r * Re * Math.cos(lat0), y: (pt.lat - shape[0].lat) * d2r * Re }));
    let kurpEklenen = 0;
    for (const c of kurplariBul(proj)) {
      let ri = -1;
      for (let i = 0; i < rings.length; i++) {
        if (c.kmMerkez >= stopKum[i] - 1e-6 && c.kmMerkez < stopKum[i + 1] + 1e-6) { ri = i; break; }
      }
      if (ri < 0) continue;
      const r = rings[ri];
      const konum = Math.max(0, Math.min(r.uzunluk, Math.round(c.kmMerkez - stopKum[ri])));
      const uz = Math.max(10, Math.min(r.uzunluk, Math.round(c.uzunluk)));
      const kurp = { ...yeniKurp(konum), uzunluk: uz, yaricap: Math.round(c.yaricap) };
      if (kurpHizi(kurp) < r.vmax - 1e-6) { r.kurplar = [...(r.kurplar ?? []), kurp]; kurpEklenen++; }
    }
    if (kurpEklenen > 0) uyarilar.push(`${kurpEklenen} kavis (kurp) güzergâh geometrisinden (shapes.txt) otomatik çıkarıldı; hızları yarıçaptan hesaplandı — Ringler'de kontrol/rötuş yapabilirsin.`);
  }

  uyarilar.push(sekilKullanildi
    ? "Mesafeler gerçek güzergâh geometrisinden (shapes.txt) hesaplandı — viraj dâhil, ray uzunluğuna yakın."
    : "Mesafeler kuş-uçuşu (haversine) enlem-boylamdan hesaplandı; gerçek ray uzunluğundan bir miktar kısa olabilir — Ringler'de düzeltebilirsiniz.");
  if (koordsuz > 0) uyarilar.push(`${koordsuz} durak arası mesafe çıkarılamadı → varsayılan 600 m kullanıldı.`);
  uyarilar.push("Makas, sinyal ve hemzemin geçit bilgisi GTFS'te bulunmaz → boş bırakıldı; Ringler'de ekleyin.");
  // Durak koordinatları (lat/lon) — GTFS export'ta yeniden kullanılmak üzere dışa verilir.
  const duraklar = dizi
    .map((d) => { const s = feed.stops.get(d.stopId); return s && Number.isFinite(s.lat) && Number.isFinite(s.lon) ? { ad: s.ad || d.stopId, lat: s.lat, lon: s.lon } : null; })
    .filter((x): x is { ad: string; lat: number; lon: number } => x !== null);
  return { rings, ad, durakSayisi: dizi.length, toplamKm: toplam / 1000, uyarilar, duraklar };
}

// ————————————————————————————————————————————————————————————————
// GTFS DIŞA AKTARMA (export). Ring zinciri + istasyon koordinatları + RaySim
// çizelgesi → geçerli GTFS .zip (agency/stops/routes/trips/stop_times/calendar).
// stops.txt lat/lon ZORUNLU → yalnız koordinatlı hatlarda (GTFS'ten içe aktarılmış)
// çağrılmalı. Çizelge (stop_times) RaySim'in fizik simülasyonundan gelir (asıl değer).
// ————————————————————————————————————————————————————————————————

function sn2hms(sn: number): string {
  const s = Math.max(0, Math.round(sn));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
function csvKac(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface GtfsDurakZaman {
  id: string; ad: string; lat: number; lon: number;
  varisSn: number;  // trip başından varış (s)
  kalkisSn: number; // trip başından kalkış (s)
}

/** Dönüş yönü durak zamanlarını ileri yönden türetir: durak sırası tersine döner,
 *  durak-arası seyir süreleri (ileri segment farkları) korunur, dwell'ler eşlenir.
 *  Uç duraklarda dwell = 0. İki yön asimetrik hız/dwell varsayımı taşımaz (ayna). */
function donusYonu(ileri: GtfsDurakZaman[]): GtfsDurakZaman[] {
  const n = ileri.length;
  if (n < 2) return [];
  const seg = (j: number) => Math.max(0, ileri[j + 1].varisSn - ileri[j].kalkisSn); // durak j→j+1 seyir (s)
  const out: GtfsDurakZaman[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const src = ileri[n - 1 - i];
    if (i > 0) t += seg(n - 1 - i); // (n-i)→(n-1-i) seyir = ileri segment (n-1-i)
    const dwell = (i === 0 || i === n - 1) ? 0 : Math.max(0, src.kalkisSn - src.varisSn);
    out.push({ id: src.id, ad: src.ad, lat: src.lat, lon: src.lon, varisSn: t, kalkisSn: t + dwell });
    t += dwell;
  }
  return out;
}

/**
 * Tam GTFS .zip baytları üretir (fflate). İçerik:
 *   agency · stops · routes · trips (çift yön, direction_id) · stop_times ·
 *   calendar · feed_info · shapes (durak koordinatlarından) ·
 *   frequencies (headwaySn > 0 ise — headway-tabanlı tam servis penceresi).
 * `duraklar` ileri yön; dönüş yönü otomatik türetilir (ciftYon ≠ false).
 * Zamanlar `baslangicSn`'den (vars. 06:00) başlar; servis penceresi bitisSn (vars. 24:00).
 */
export function gtfsIhrac(opts: {
  hatAdi: string;
  agency: string;
  duraklar: GtfsDurakZaman[];
  baslangicSn?: number;
  bitisSn?: number;
  headwaySn?: number;
  ciftYon?: boolean;
}): Uint8Array {
  const bas = opts.baslangicSn ?? 6 * 3600;
  const bit = Math.max(bas + 60, opts.bitisSn ?? 24 * 3600);
  const hw = Math.max(0, Math.round(opts.headwaySn ?? 0));
  const ciftYon = opts.ciftYon !== false && opts.duraklar.length > 1;
  const agencyId = "A1", routeId = "R1", serviceId = "HAFTAICI";
  const ad = opts.hatAdi || "RaySim hattı";
  const ileri = opts.duraklar;
  const donus = ciftYon ? donusYonu(ileri) : [];

  // Yön → { tripId, headsign, shapeId, dizi }
  const yonler: { tripId: string; dir: 0 | 1; headsign: string; shapeId: string; dizi: GtfsDurakZaman[] }[] = [
    { tripId: "T0", dir: 0, headsign: ileri[ileri.length - 1]?.ad ?? ad, shapeId: "shp_0", dizi: ileri },
  ];
  if (ciftYon) yonler.push({ tripId: "T1", dir: 1, headsign: donus[donus.length - 1]?.ad ?? ad, shapeId: "shp_1", dizi: donus });

  const stopTimes = yonler.flatMap((y) =>
    y.dizi.map((d, i) => `${y.tripId},${sn2hms(bas + d.varisSn)},${sn2hms(bas + d.kalkisSn)},${d.id},${i + 1}`)
  ).join("\n");

  const trips = yonler.map((y) => `${routeId},${serviceId},${y.tripId},${csvKac(y.headsign)},${y.dir},${y.shapeId}`).join("\n");

  const shapes = yonler.flatMap((y) =>
    y.dizi.map((d, i) => `${y.shapeId},${d.lat.toFixed(6)},${d.lon.toFixed(6)},${i + 1}`)
  ).join("\n");

  const tarih = new Date();
  const ymd = `${tarih.getFullYear()}${String(tarih.getMonth() + 1).padStart(2, "0")}${String(tarih.getDate()).padStart(2, "0")}`;

  const files: Record<string, Uint8Array> = {
    "agency.txt": strToU8(`agency_id,agency_name,agency_url,agency_timezone,agency_lang\n${agencyId},${csvKac(opts.agency || "RaySim")},https://raysim.vercel.app,Europe/Istanbul,tr\n`),
    "stops.txt": strToU8("stop_id,stop_name,stop_lat,stop_lon\n" +
      ileri.map((d) => `${d.id},${csvKac(d.ad)},${d.lat.toFixed(6)},${d.lon.toFixed(6)}`).join("\n") + "\n"),
    "routes.txt": strToU8(`route_id,agency_id,route_short_name,route_long_name,route_type\n${routeId},${agencyId},${csvKac(ad.slice(0, 20))},${csvKac(ad)},0\n`),
    "trips.txt": strToU8(`route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n${trips}\n`),
    "stop_times.txt": strToU8("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" + stopTimes + "\n"),
    "calendar.txt": strToU8(`service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n${serviceId},1,1,1,1,1,1,1,20260101,20261231\n`),
    "shapes.txt": strToU8("shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n" + shapes + "\n"),
    "feed_info.txt": strToU8(`feed_publisher_name,feed_publisher_url,feed_lang,feed_version\nRaySim,https://raysim.vercel.app,tr,${ymd}\n`),
  };
  // Headway-tabanlı tam servis: her yön için pencere boyunca frequencies.
  if (hw > 0) {
    files["frequencies.txt"] = strToU8("trip_id,start_time,end_time,headway_secs,exact_times\n" +
      yonler.map((y) => `${y.tripId},${sn2hms(bas)},${sn2hms(bit)},${hw},0`).join("\n") + "\n");
  }
  return zipSync(files, { level: 6 });
}
