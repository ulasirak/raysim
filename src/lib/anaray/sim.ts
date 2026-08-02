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
// Hareket adımı fiziği tek kaynaktan (signalling.ts) — kopya sürüklenmesini önler.
import { stepMotion } from "./signalling";

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
  const meff = Math.max(1, stock.mass * (1 + stock.rotatingMassFactor)); // kütle≤0 → NaN ivme olmasın
  const b = Math.max(0.1, stock.maxBraking); // negatif/0 fren → sqrt(2·b·d) NaN olmasın (hatsim/blockingtime ile tutarlı)

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
  let stuck = 0; // ilerleme olmayan ardışık adım sayacı (patolojik girdi → erken çık)

  while (s < line.length - 0.01 && iter < maxIter) {
    iter++;
    const nextStop = stopIdx < stops.length ? stops[stopIdx] : null;
    const nextStopPos = nextStop ? nextStop.position : null;
    const vAllowed = maxAllowedSpeed(line, stock, s, nextStopPos, b);

    // Hareket adımı (çekiş/fren/seyir) tek kaynaktan; rejim etiketi sim'e özel çıktı.
    const mot = stepMotion(stock, v, vAllowed, segmentAt(line, s).gradient, dt, meff, b);
    const a = mot.a;
    let vNew = mot.vNew;
    const regime: Regime =
      v > vAllowed + 0.05 ? "yavaslama"
        : v < vAllowed - 0.05 ? (a >= 0 ? "hizlanma" : "yavaslama")
          : "seyir";

    let sNew = s + ((v + vNew) / 2) * dt;
    t += dt;
    // Stall koruması: tren hiç ilerlemiyorsa (ör. maxSpeed 0) 500k nokta biriktirme.
    if (sNew <= s + 1e-6) { if (++stuck > 4000) break; } else stuck = 0;

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
