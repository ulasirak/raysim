// raysim — GTFS İÇE AKTARMA çekirdeği (saf TS; UI'dan bağımsız, test edilebilir).
// GTFS (General Transit Feed Specification): bir ZIP içinde CSV'ler (stops/routes/
// trips/stop_times). Bir rota + yön seçilince o hattın SIRALI duraklarından, gerçek
// enlem-boylamla (haversine) durak-arası mesafeler ve stop_times'tan duruş süreleri
// çıkarılıp RaySim ring zinciri (DurakArasiRing[]) kurulur. Makas/sinyal GTFS'te yok →
// varsayılan kalır (kullanıcı Ringler'de ekler).

import { unzipSync, strFromU8 } from "fflate";
import { yeniRing, type DurakArasiRing } from "./ring";

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
  trips: { tripId: string; routeId: string; dir: string; headsign: string }[];
  stopTimes: Map<string, { stopId: string; seq: number; varis: number; kalkis: number }[]>; // tripId → sıralı
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
    .map((r) => ({ tripId: r.trip_id, routeId: r.route_id, dir: r.direction_id || "0", headsign: r.trip_headsign || "" }));
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
  return { stops, routes, trips, stopTimes };
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

export interface GtfsHatSonuc { rings: DurakArasiRing[]; ad: string; durakSayisi: number; toplamKm: number; uyarilar: string[]; }

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

  let koordsuz = 0, toplam = 0;
  const rings: DurakArasiRing[] = [];
  for (let i = 0; i < dizi.length - 1; i++) {
    const a = feed.stops.get(dizi[i].stopId), b = feed.stops.get(dizi[i + 1].stopId);
    const adA = a?.ad || dizi[i].stopId, adB = b?.ad || dizi[i + 1].stopId;
    let mesafe = a && b ? haversine(a, b) : NaN;
    if (!Number.isFinite(mesafe) || mesafe < 20) { mesafe = 600; koordsuz++; } // koordinat yok/aynı → varsayılan
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
  uyarilar.push("Mesafeler kuş-uçuşu (haversine) enlem-boylamdan hesaplandı; gerçek ray uzunluğundan bir miktar kısa olabilir — Ringler'de düzeltebilirsiniz.");
  if (koordsuz > 0) uyarilar.push(`${koordsuz} durak arası koordinat içermiyordu → varsayılan 600 m kullanıldı.`);
  uyarilar.push("Makas, sinyal ve hemzemin geçit bilgisi GTFS'te bulunmaz → boş bırakıldı; Ringler'de ekleyin.");
  return { rings, ad, durakSayisi: dizi.length, toplamKm: toplam / 1000, uyarilar };
}
