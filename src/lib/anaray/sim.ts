// anaray — mikroskobik tren hareketi simülasyon motoru (Faz 0)
//
// Tek bir treni bir hat boyunca zaman-adımlı olarak koşturur:
//   ivme = (çekiş kuvveti − direnç − eğim bileşeni) / etkin kütle
// Hız limitleri ve duraklar için "önden fren eğrisi" (lookahead) uygular:
// trenin herhangi bir noktada izin verilen hızı, ileride durması/yavaşlaması
// gereken her kısıt için gereken fren mesafesinden geri hesaplanır.

import type {
  Line,
  RollingStock,
  SimResult,
  TrajectoryPoint,
  Regime,
  TrackSegment,
} from "./types";

const G = 9.81;

/** s konumunu içeren segmenti döndürür. */
function segmentAt(line: Line, s: number): TrackSegment {
  for (const seg of line.segments) {
    if (s >= seg.start && s < seg.end) return seg;
  }
  return line.segments[line.segments.length - 1];
}

/**
 * s konumundaki trene, ileride durması/yavaşlaması gereken tüm kısıtlar
 * göz önüne alınarak izin verilen azami hız (m/s).
 * Fren eğrisi: v_izin = √(v_hedef² + 2·b·mesafe).
 */
function maxAllowedSpeed(
  line: Line,
  stock: RollingStock,
  s: number,
  nextStopPos: number | null,
  b: number
): number {
  let vc = Math.min(stock.maxSpeed, segmentAt(line, s).vmax);

  // İleride hız limitinin düştüğü segment başlangıçları
  for (const seg of line.segments) {
    if (seg.start > s && (nextStopPos === null || seg.start <= nextStopPos)) {
      const allow = Math.sqrt(seg.vmax * seg.vmax + 2 * b * (seg.start - s));
      vc = Math.min(vc, allow);
    }
  }

  // Sonraki durakta hız 0 olmalı
  if (nextStopPos !== null && nextStopPos > s) {
    const allow = Math.sqrt(2 * b * (nextStopPos - s));
    vc = Math.min(vc, allow);
  }

  return vc;
}

export function simulate(line: Line, stock: RollingStock, dt = 0.5): SimResult {
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  const b = stock.maxBraking;

  const points: TrajectoryPoint[] = [];
  const stationEvents: SimResult["stationEvents"] = [];

  // Durulacak istasyonlar (başlangıç durağında zaten duruyoruz)
  const stops = line.stations
    .filter((st) => st.position > 0)
    .sort((a, c) => a.position - c.position);
  let stopIdx = 0;

  let s = 0;
  let v = 0;
  let t = 0;
  points.push({ t, s, v, a: 0, regime: "durak" });

  const maxIter = 500_000;
  let iter = 0;

  while (s < line.length - 0.01 && iter < maxIter) {
    iter++;
    const nextStop = stopIdx < stops.length ? stops[stopIdx] : null;
    const nextStopPos = nextStop ? nextStop.position : null;
    const vAllowed = maxAllowedSpeed(line, stock, s, nextStopPos, b);

    let a: number;
    let regime: Regime;
    let vNew: number;

    if (v > vAllowed + 0.05) {
      // Fren
      a = -b;
      vNew = Math.max(0, v - b * dt);
      regime = "yavaslama";
    } else if (v < vAllowed - 0.05) {
      // Hızlanma: çekiş kuvveti − direnç − eğim
      const seg = segmentAt(line, s);
      const Ftr = Math.min(stock.startingTractiveEffort, stock.power / Math.max(v, 0.5));
      const R = stock.davisA + stock.davisB * v + stock.davisC * v * v;
      const Fgrad = stock.mass * G * (seg.gradient / 1000);
      a = (Ftr - R - Fgrad) / meff;
      // Net kuvvet negatifse (dik yokuş / yetersiz güç) tren gerçekte
      // hızlanamaz; sahte ivme eklemeyiz. Yavaşladıkça P/v ile çekiş
      // kuvveti artar, tren yokuşta doğal bir denge hızına oturur.
      vNew = Math.max(0, Math.min(v + a * dt, vAllowed));
      regime = a >= 0 ? "hizlanma" : "yavaslama";
    } else {
      // Seyir (limitte sabit)
      a = 0;
      vNew = vAllowed;
      regime = "seyir";
    }

    let sNew = s + ((v + vNew) / 2) * dt;
    t += dt;

    // Sonraki durağa ulaşıldı mı?
    if (nextStop && sNew >= nextStop.position) {
      sNew = nextStop.position;
      vNew = 0;
      s = sNew;
      v = vNew;
      const arrival = t;
      points.push({ t, s, v, a: -b, regime: "yavaslama" });
      t += nextStop.dwell; // bekleme
      const departure = t;
      points.push({ t, s, v: 0, a: 0, regime: "durak" });
      stationEvents.push({ stationId: nextStop.id, arrival, departure });
      stopIdx++;
      continue;
    }

    s = sNew;
    v = vNew;
    points.push({ t, s, v, a, regime });
  }

  return { points, totalTime: t, stationEvents };
}

/** Yörüngeden verilen zamandaki durumu doğrusal ara-değerle örnekler. */
export function sampleAt(points: TrajectoryPoint[], tt: number): TrajectoryPoint {
  if (points.length === 0) return { t: tt, s: 0, v: 0, a: 0, regime: "durak" };
  if (tt <= points[0].t) return points[0];
  const last = points[points.length - 1];
  if (tt >= last.t) return last;

  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= tt) lo = mid;
    else hi = mid;
  }
  const p0 = points[lo];
  const p1 = points[hi];
  const span = p1.t - p0.t || 1;
  const f = (tt - p0.t) / span;
  return {
    t: tt,
    s: p0.s + (p1.s - p0.s) * f,
    v: p0.v + (p1.v - p0.v) * f,
    a: p0.a,
    regime: p0.regime,
  };
}
