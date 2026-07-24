// raysim — GTFS / coğrafi güzergah import + projeksiyon.
//
// Gerçek dünya koordinatlarını (GTFS stops.txt + opsiyonel shapes.txt) okur,
// eş-dikdörtgen (equirectangular) projeksiyonla şematik yerine COĞRAFİ harita çizer.
// Şebeke/sim modeliyle birebir bağlanmaz; amaç güzergahı gerçek koordinatlarda
// göstermek (inandırıcılık + veri devralma). Tarayıcıda ve SSR'de saf çalışır.

import { yeniRing, yeniMakas, yeniHemzemin, BELGE, type DurakArasiRing } from "./ring";

export interface GeoStop { id: string; name: string; lat: number; lon: number; }
export interface GeoShape { id: string; points: { lat: number; lon: number; seq: number }[]; }

// ————————————————————————————————————————————————
// CSV
// ————————————————————————————————————————————————

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map((h) => h.trim().replace(/^﻿/, ""));
  return lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const o: Record<string, string> = {};
    header.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
    return o;
  });
}

export function parseStops(text: string): GeoStop[] {
  return parseCSV(text)
    .map((r) => ({
      id: r.stop_id || r.id || "",
      name: r.stop_name || r.name || r.stop_id || "",
      lat: parseFloat(r.stop_lat || r.lat || ""),
      lon: parseFloat(r.stop_lon || r.lon || ""),
    }))
    .filter((s) => isFinite(s.lat) && isFinite(s.lon));
}

export function parseShapes(text: string): GeoShape[] {
  const rows = parseCSV(text)
    .map((r) => ({
      id: r.shape_id || "shape",
      lat: parseFloat(r.shape_pt_lat || r.lat || ""),
      lon: parseFloat(r.shape_pt_lon || r.lon || ""),
      seq: parseInt(r.shape_pt_sequence || r.seq || "0", 10) || 0,
    }))
    .filter((p) => isFinite(p.lat) && isFinite(p.lon));
  const byId = new Map<string, GeoShape>();
  for (const p of rows) {
    if (!byId.has(p.id)) byId.set(p.id, { id: p.id, points: [] });
    byId.get(p.id)!.points.push({ lat: p.lat, lon: p.lon, seq: p.seq });
  }
  for (const sh of byId.values()) sh.points.sort((a, b) => a.seq - b.seq);
  return [...byId.values()];
}

// ————————————————————————————————————————————————
// Projeksiyon + geometri
// ————————————————————————————————————————————————

export interface GeoBounds { minLat: number; maxLat: number; minLon: number; maxLon: number; }

export function geoBounds(pts: { lat: number; lon: number }[]): GeoBounds {
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
}

export interface Projector {
  project: (lat: number, lon: number) => { x: number; y: number };
  mPerPx: number; // metre / piksel (ölçek çubuğu için)
  bounds: GeoBounds;
}

export function makeProjector(pts: { lat: number; lon: number }[], W: number, H: number, pad: number): Projector | null {
  if (pts.length === 0) return null;
  const b = geoBounds(pts);
  const latMid = (b.minLat + b.maxLat) / 2;
  const kx = Math.cos((latMid * Math.PI) / 180); // boylam sıkıştırma (enlemle)
  const spanLon = Math.max(1e-9, (b.maxLon - b.minLon) * kx);
  const spanLat = Math.max(1e-9, b.maxLat - b.minLat);
  const scale = Math.min((W - 2 * pad) / spanLon, (H - 2 * pad) / spanLat);
  const drawW = spanLon * scale, drawH = spanLat * scale;
  const offX = (W - drawW) / 2, offY = (H - drawH) / 2;
  const project = (lat: number, lon: number) => ({
    x: offX + (lon - b.minLon) * kx * scale,
    y: offY + (b.maxLat - lat) * scale, // kuzey yukarı
  });
  const mPerPx = 111320 / scale; // 1° enlem ≈ 111320 m
  return { project, mPerPx, bounds: b };
}

/** İki koordinat arası büyük-çember mesafesi (m). */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Sıralı nokta dizisinin toplam uzunluğu (m). */
export function polylineLength(pts: { lat: number; lon: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

/** İki koordinat arası pusula açısı (derece, 0=kuzey). */
function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
/** İki pusula açısı arası mutlak sapma (0–180°). */
function angDiff(b1: number, b2: number): number {
  let d = Math.abs(b1 - b2) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// ————————————————————————————————————————————————
// TAHMİN: shape geometrisinden makas + hemzemin öner (hepsi "tahmini")
// ————————————————————————————————————————————————

export interface TahminSonuc { makas: number; hemzemin: number; }

/** Shape üzerinde pencereli keskin yön değişimlerini (olası kavşak/makas) bul. */
function detectTurns(pts: { lat: number; lon: number }[], cum: number[], W: number, thresh: number): { cum: number; ang: number }[] {
  const n = pts.length;
  const cand: { cum: number; ang: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    let j = i; while (j > 0 && cum[i] - cum[j] < W) j--;
    let k = i; while (k < n - 1 && cum[k] - cum[i] < W) k++;
    if (j === i || k === i) continue;
    const ang = angDiff(bearingDeg(pts[j], pts[i]), bearingDeg(pts[i], pts[k]));
    if (ang >= thresh) cand.push({ cum: cum[i], ang });
  }
  // en keskinden başlayarak, min 250 m aralıkla non-maximum suppression
  cand.sort((a, b) => b.ang - a.ang);
  const picked: { cum: number; ang: number }[] = [];
  for (const c of cand) if (picked.every((p) => Math.abs(p.cum - c.cum) >= 250)) picked.push(c);
  picked.sort((a, b) => a.cum - b.cum);
  return picked;
}

/**
 * Ring'lere shape geometrisinden TAHMİNİ makas + hemzemin ekler (mutasyon).
 * - Makas: keskin yön değişimi (bearing reversal) + hat sonu U-dönüş (yapısal).
 * - Hemzemin: geometriden konum çıkarılamaz → eşit-aralık VARSAYIMI (saha ile düzelt).
 * Hepsi adında "(tahmini)" taşır.
 */
export function tahminEtKisitlar(rings: DurakArasiRing[], stops: GeoStop[], shapes: GeoShape[]): TahminSonuc {
  let makasSay = 0, hemzeminSay = 0;
  if (!rings.length) return { makas: 0, hemzemin: 0 };

  // --- Makas: keskin dönüşler (shape varsa) ---
  const sh = shapes.length ? shapes.reduce((a, b) => (b.points.length > a.points.length ? b : a)) : null;
  if (sh && sh.points.length >= 3) {
    const pts = sh.points;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    const stopCum = stopCumulative(stops, shapes);
    // ring sınırları (shape-cum uzayında) = ardışık durak kümülatifleri
    const turns = detectTurns(pts, cum, 45, 40);
    for (const tr of turns) {
      for (let i = 0; i < rings.length; i++) {
        const a = stopCum[i], b = stopCum[i + 1];
        if (a == null || b == null) continue;
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (tr.cum >= lo - 1e-6 && tr.cum <= hi + 1e-6) {
          const pos = Math.max(10, Math.min(rings[i].uzunluk - 10, Math.abs(tr.cum - a)));
          rings[i].makaslar.push({ ...yeniMakas("karsilasmali", Math.round(pos)), ad: `Tahmini makas (keskin dönüş ~${Math.round(tr.ang)}°)` });
          makasSay++;
          break;
        }
      }
    }
  }
  // Hat sonu U-dönüş makası (yapısal olarak yüksek olasılık)
  const son = rings[rings.length - 1];
  son.makaslar.push({ ...yeniMakas("udonus", Math.round(son.uzunluk * 0.9)), ad: "Tahmini U-dönüş (hat sonu)" });
  makasSay++;

  // --- Hemzemin: eşit-aralık VARSAYIMI (geometriden çıkarılamaz) ---
  for (const r of rings) {
    if (r.uzunluk < 500) continue;
    const adet = Math.min(3, Math.floor(r.uzunluk / 600));
    for (let c = 1; c <= adet; c++) {
      const pos = Math.round((r.uzunluk * c) / (adet + 1));
      r.hemzeminler.push({ ...yeniHemzemin("karayolu", pos), ad: "Tahmini hemzemin geçit (eşit-aralık varsayımı)" });
      hemzeminSay++;
    }
  }
  return { makas: makasSay, hemzemin: hemzeminSay };
}

// ————————————————————————————————————————————————
// GTFS → Ring modeli (simülasyona bağla)
// ————————————————————————————————————————————————

/** Sıralı durakların shape üzerindeki kümülatif konumu (m). shape yoksa null. */
function stopCumulative(stops: GeoStop[], shapes: GeoShape[]): (number | null)[] {
  if (!shapes.length) return stops.map(() => null);
  const sh = shapes.reduce((a, b) => (b.points.length > a.points.length ? b : a)); // en uzun shape
  const pts = sh.points;
  if (pts.length < 2) return stops.map(() => null);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  return stops.map((s) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = haversine(s, pts[i]); if (d < bd) { bd = d; bi = i; } }
    return cum[bi];
  });
}

/**
 * GTFS güzergahını (sıralı duraklar + opsiyonel shape) ring zincirine çevirir.
 * Durak-arası mesafe shape varsa shape boyunca, yoksa büyük-çember (haversine) ile.
 * makas/hemzemin/tehlike GTFS'te olmadığından BOŞ gelir → Ringler editöründen eklenir.
 */
export function gtfsToRings(stops: GeoStop[], shapes: GeoShape[]): DurakArasiRing[] {
  if (stops.length < 2) return [];
  const cum = stopCumulative(stops, shapes);
  const rings: DurakArasiRing[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const ci = cum[i], cj = cum[i + 1];
    let d = ci != null && cj != null ? Math.abs(cj - ci) : haversine(a, b);
    d = Math.max(50, Math.round(d));
    const r = yeniRing(a.name, b.name);
    rings.push({
      ...r,
      uzunluk: d,
      worstUzunluk: Math.max(d, Math.round(d * 1.1)),
      bestUzunluk: Math.max(50, Math.round(d * 0.9)),
      vmax: BELGE.vSahasal,
    });
  }
  return rings;
}

// ————————————————————————————————————————————————
// DEMO veri (yaklaşık Konya koordinatları — gerçek GTFS import'unu göstermek için)
// ————————————————————————————————————————————————

export const ornekGtfsStops = `stop_id,stop_name,stop_lat,stop_lon
1,Merkez,37.87050,32.49250
2,İstasyon A,37.87360,32.48540
3,İstasyon B,37.87720,32.47880
4,İstasyon C,37.88140,32.47330
5,İstasyon D,37.88620,32.46940
6,Üniversite,37.89150,32.46720
7,İstasyon E,37.89700,32.46680
8,İstasyon F,37.90260,32.46840
9,Şehir Hastanesi,37.90820,32.47150
10,Terminal,37.91330,32.47620`;

// Duraklardan geçen basit bir shape (temiz stop poligonu; yapay zikzak yok).
export const ornekGtfsShapes = (() => {
  const stops = parseStops(ornekGtfsStops);
  const rows = ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence"];
  stops.forEach((s, i) => rows.push(`H1,${s.lat.toFixed(5)},${s.lon.toFixed(5)},${i}`));
  return rows.join("\n");
})();
