// raysim — GTFS / coğrafi güzergah import + projeksiyon.
//
// Gerçek dünya koordinatlarını (GTFS stops.txt + opsiyonel shapes.txt) okur,
// eş-dikdörtgen (equirectangular) projeksiyonla şematik yerine COĞRAFİ harita çizer.
// Şebeke/sim modeliyle birebir bağlanmaz; amaç güzergahı gerçek koordinatlarda
// göstermek (inandırıcılık + veri devralma). Tarayıcıda ve SSR'de saf çalışır.

import { yeniRing, yeniMakas, yeniHemzemin, BELGE, type DurakArasiRing } from "./ring";

export interface GeoStop { id: string; name: string; lat: number; lon: number; ele?: number; }
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
    .map((r) => {
      const ele = parseFloat(r.stop_elevation || r.elevation || r.stop_ele || r.ele || "");
      return {
        id: r.stop_id || r.id || "",
        name: r.stop_name || r.name || r.stop_id || "",
        lat: parseFloat(r.stop_lat || r.lat || ""),
        lon: parseFloat(r.stop_lon || r.lon || ""),
        ...(isFinite(ele) ? { ele } : {}),
      };
    })
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

/**
 * Shape üzerinde TEK NOKTADA keskin kırılmaları (olası makas/kavşak) bul.
 * Komşu segment açısı kullanır → dağıtık KURP tetiklemez (kurp = her noktada küçük
 * açı), yalnız ani kırılma (switch/junction = tek noktada büyük açı) yakalanır.
 */
function detectTurns(pts: { lat: number; lon: number }[], cum: number[], thresh: number): { cum: number; ang: number }[] {
  const n = pts.length;
  const cand: { cum: number; ang: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    const ang = angDiff(bearingDeg(pts[i - 1], pts[i]), bearingDeg(pts[i], pts[i + 1]));
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
    const turns = detectTurns(pts, cum, 48);
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

/** Üç noktanın çevrel çember yarıçapı (m); noktalar yerel metre {x,y}. */
function circumradius(A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }): number {
  const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
  const a = d(B, C), b = d(A, C), c = d(A, B);
  const area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
  if (area < 1e-6) return Infinity; // ~doğrusal → düz
  return (a * b * c) / (4 * area);
}

/**
 * Shape'in yerel kurp yarıçapından ring başına TAHMİNİ hız kısıtı (vmax) hesaplar.
 * v = √(a_lat · R), a_lat ≈ 0.8 m/s² (hafif raylı yanal ivme). Yalnız DÜŞÜRÜR
 * (mevcut sahasal vmax'ın üstüne çıkmaz), tabanı makas hızı. 5 km/h'ye yuvarlar.
 * Yalnız gerçek yoğun shape'lerde (sık nokta) anlamlı; seyrek shape'te R büyük çıkar.
 */
export function tahminEtHiz(rings: DurakArasiRing[], stops: GeoStop[], shapes: GeoShape[]): { ayarlanan: number; minVmaxKmh: number | null } {
  const sh = shapes.length ? shapes.reduce((a, b) => (b.points.length > a.points.length ? b : a)) : null;
  if (!sh || sh.points.length < 3 || !rings.length) return { ayarlanan: 0, minVmaxKmh: null };
  const pts = sh.points;
  const lat0 = pts[0].lat, lon0 = pts[0].lon;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 111320;
  const xy = pts.map((p) => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const stopCum = stopCumulative(stops, shapes);
  const A_LAT = 0.8;             // m/s² — izin verilen yanal ivme (hafif raylı)
  const CAP = BELGE.vAnahat;     // üst sınır (ana hat hızı)
  const FLOOR = BELGE.vMakas;    // taban (bu altı makas rejimi)

  const ringMinR = rings.map(() => Infinity);
  for (let i = 1; i < xy.length - 1; i++) {
    const R = circumradius(xy[i - 1], xy[i], xy[i + 1]);
    if (!isFinite(R)) continue;
    for (let k = 0; k < rings.length; k++) {
      const a = stopCum[k], b = stopCum[k + 1];
      if (a == null || b == null) continue;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (cum[i] >= lo - 1e-6 && cum[i] <= hi + 1e-6) { ringMinR[k] = Math.min(ringMinR[k], R); break; }
    }
  }

  let ayarlanan = 0, gmin = Infinity;
  rings.forEach((r, k) => {
    if (!isFinite(ringMinR[k])) return;
    const vCurve = Math.min(Math.sqrt(A_LAT * ringMinR[k]), CAP); // m/s
    let kmh = Math.round((vCurve * 3.6) / 5) * 5;
    kmh = Math.max(Math.round(FLOOR * 3.6), kmh);
    const nv = kmh / 3.6;
    if (nv < r.vmax - 1e-6) { r.vmax = nv; ayarlanan++; gmin = Math.min(gmin, kmh); }
  });
  return { ayarlanan, minVmaxKmh: isFinite(gmin) ? gmin : null };
}

/**
 * Durak yüksekliklerinden (varsa) ring başına eğim (‰) hesaplar → ring.egim.
 * grade = Δyükseklik / mesafe × 1000, ±80‰ ile sınırlı. Yükseklik yoksa 0 döner.
 * GTFS'te yükseklik standart değildir; stop_elevation/elevation/ele sütunundan okunur.
 */
export function tahminEtEgim(rings: DurakArasiRing[], stops: GeoStop[]): { ayarlanan: number; maxEgim: number } {
  let n = 0, maxAbs = 0;
  for (let i = 0; i < rings.length && i + 1 < stops.length; i++) {
    const a = stops[i].ele, b = stops[i + 1].ele;
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) continue;
    let g = ((b - a) / Math.max(1, rings[i].uzunluk)) * 1000; // ‰
    g = Math.max(-80, Math.min(80, g));
    rings[i].egim = Math.round(g * 10) / 10;
    if (Math.abs(g) > maxAbs) maxAbs = Math.abs(g);
    n++;
  }
  return { ayarlanan: n, maxEgim: Math.round(maxAbs * 10) / 10 };
}

/**
 * Durak yüksekliklerini shape'in her noktasına (kümülatif mesafeye göre) enterpole eder.
 * Coğrafi haritada renk-kodlu eğim için. Yükseklik yoksa null.
 */
export function shapeElevations(stops: GeoStop[], shapes: GeoShape[]): number[] | null {
  if (!stops.some((s) => s.ele != null)) return null;
  const sh = shapes.length ? shapes.reduce((a, b) => (b.points.length > a.points.length ? b : a)) : null;
  if (!sh || sh.points.length < 2) return null;
  const pts = sh.points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  const stopCum = stopCumulative(stops, shapes);
  const bp: { c: number; e: number }[] = [];
  stops.forEach((s, i) => { if (s.ele != null && stopCum[i] != null) bp.push({ c: stopCum[i] as number, e: s.ele }); });
  bp.sort((a, b) => a.c - b.c);
  if (bp.length < 2) return null;
  return pts.map((_, i) => {
    const c = cum[i];
    if (c <= bp[0].c) return bp[0].e;
    if (c >= bp[bp.length - 1].c) return bp[bp.length - 1].e;
    for (let k = 1; k < bp.length; k++) {
      if (c <= bp[k].c) {
        const p0 = bp[k - 1], p1 = bp[k];
        const f = (c - p0.c) / ((p1.c - p0.c) || 1);
        return p0.e + (p1.e - p0.e) * f;
      }
    }
    return bp[bp.length - 1].e;
  });
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

export const ornekGtfsStops = `stop_id,stop_name,stop_lat,stop_lon,stop_elevation
1,Merkez,37.87050,32.49250,1016
2,İstasyon A,37.87360,32.48540,1019
3,İstasyon B,37.87720,32.47880,1023
4,İstasyon C,37.88140,32.47330,1028
5,İstasyon D,37.88620,32.46940,1034
6,Üniversite,37.89150,32.46720,1039
7,İstasyon E,37.89700,32.46680,1041
8,İstasyon F,37.90260,32.46840,1038
9,Şehir Hastanesi,37.90820,32.47150,1033
10,Terminal,37.91330,32.47620,1029`;

// Duraklardan geçen YOĞUN shape: çoğu düz interpolasyon, bir segmentte gerçekçi
// kurp (chicane) — hız-kısıtı tahminini göstermek için (~65 m yarıçap → ~25 km/h).
// Komşu-açı makas eşiğinin altında kaldığından yanlış makas üretmez.
export const ornekGtfsShapes = (() => {
  const s = parseStops(ornekGtfsStops);
  const lat0 = s[0].lat, lon0 = s[0].lon;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 111320;
  const toXY = (p: { lat: number; lon: number }) => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky });
  const XY = s.map(toXY);
  const out: { x: number; y: number }[] = [];
  const push = (x: number, y: number) => out.push({ x, y });
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
  const straight = (A: { x: number; y: number }, B: { x: number; y: number }, step: number) => {
    const d = dist(A, B), n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k++) { const t = k / n; push(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t); }
  };
  const CURVE_I = 5; // Üniversite → İstasyon E segmentinde kurp
  for (let i = 0; i < XY.length - 1; i++) {
    const A = XY[i], B = XY[i + 1];
    if (i === CURVE_I) {
      const len = dist(A, B);
      const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len, nx = -uy, ny = ux;
      const chLen = Math.min(240, len * 0.6), c0 = (len - chLen) / 2, amp = 34, N = 44;
      straight(A, { x: A.x + ux * c0, y: A.y + uy * c0 }, 60);
      for (let k = 0; k <= N; k++) {
        // yükselen-kosinüs sapma: uçlarda eğim 0 → pürüzsüz birleşme (kink yok)
        const t = k / N, along = c0 + t * chLen, off = (amp / 2) * (1 - Math.cos(2 * Math.PI * t));
        push(A.x + ux * along + nx * off, A.y + uy * along + ny * off);
      }
      straight({ x: A.x + ux * (c0 + chLen), y: A.y + uy * (c0 + chLen) }, B, 60);
    } else {
      straight(A, B, 80);
    }
  }
  push(XY[XY.length - 1].x, XY[XY.length - 1].y);
  const rows = ["shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence"];
  out.forEach((p, i) => rows.push(`H1,${(lat0 + p.y / ky).toFixed(6)},${(lon0 + p.x / kx).toFixed(6)},${i}`));
  return rows.join("\n");
})();
