// raysim — TEK HAT işletmesi: karşılaşma/geçiş (kruvasman) noktaları.
//
// Tek ray iki yönde paylaşılır. Kruvasman (geçiş) istasyonları arası "kesim"
// bir karşılıklı-dışlama kaynağıdır: aynı anda tek tren (herhangi yön) girer.
// Bir tren, geçiş istasyonuna varınca mevcut kesimini BIRAKIR, sonra sonraki
// kesimi TALEP eder (boşsa girer, doluysa geçiş istasyonunda bekler).
// "Tut-ve-bekle" hiç oluşmaz (tren kesim tutarken beklemez) → deadlock yok.
// Karşı yönler ancak geçiş istasyonlarında karşılaşır.

import type { Line, RollingStock } from "./types";
// Fizik yardımcıları tek kaynaktan (signalling.ts) — kopya sürüklenmesini önler.
import { allowedSpeed, segAt } from "./signalling";

const G = 9.81;

export interface STTrain {
  index: number;
  dir: 1 | -1;
  points: { t: number; s: number }[]; // kendi hat koordinatı (up: ileri, down: ters)
  arr: number;
}

export interface SingleTrackResult {
  up: STTrain[];
  down: STTrain[];
  sections: number[]; // ileri koordinatta geçiş istasyonu sınırları
  waited: number; // en az bir kez bekleyen (karşılaşan) tren sayısı
  deadlock: boolean;
  tMax: number;
}

interface Tr {
  id: number;
  dir: 1 | -1;
  line: Line;
  stops: { pos: number; dwell: number }[];
  passOwn: number[];
  runSec: number[];
  ready: number;
  s: number;
  v: number;
  started: boolean;
  done: boolean;
  runIdx: number;
  secOwned: number;
  ns: number;
  dwellUntil: number;
  points: { t: number; s: number }[];
  arr: number;
  waited: boolean;
}

export function simulateSingleTrack(
  forwardLine: Line,
  reverseLine: Line,
  stock: RollingStock,
  opts: { headway: number; upCount: number; downCount: number; passing: number[]; dt?: number }
): SingleTrackResult {
  const dt = opts.dt ?? 0.5;
  const b = stock.maxBraking;
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  const L = forwardLine.length;

  // İleri koordinatta geçiş istasyonu sınırları (uçlar daima geçiş)
  const P = [...new Set([0, L, ...opts.passing.filter((p) => p > 0 && p < L)])].sort((a, c) => a - c);
  const nSec = P.length - 1;
  const sectionOf = (fp: number) => {
    for (let j = 0; j < nSec; j++) if (fp < P[j + 1] - 1e-6) return j;
    return nSec - 1;
  };

  function mkTrain(id: number, dir: 1 | -1, line: Line, ready: number): Tr {
    const stops = line.stations.map((s) => ({ pos: s.position, dwell: s.dwell }));
    const passOwn = (dir === 1 ? P.slice() : P.map((p) => L - p)).sort((a, c) => a - c);
    const runSec: number[] = [];
    for (let k = 0; k < passOwn.length - 1; k++) {
      const midOwn = (passOwn[k] + passOwn[k + 1]) / 2;
      const fp = dir === 1 ? midOwn : L - midOwn;
      runSec.push(sectionOf(fp));
    }
    const firstStop = (() => {
      const i = stops.findIndex((s) => s.pos > 1e-6);
      return i < 0 ? stops.length : i;
    })();
    return { id, dir, line, stops, passOwn, runSec, ready, s: 0, v: 0, started: false, done: false, runIdx: 0, secOwned: -1, ns: firstStop, dwellUntil: -1, points: [], arr: 0, waited: false };
  }

  const trains: Tr[] = [];
  for (let k = 0; k < opts.upCount; k++) trains.push(mkTrain(1000 + k, 1, forwardLine, k * opts.headway));
  for (let k = 0; k < opts.downCount; k++) trains.push(mkTrain(2000 + k, -1, reverseLine, k * opts.headway));
  // İşlem sırası: erken kalkan öncelikli (adil kruvasman kararı)
  const order = [...trains].sort((a, c) => a.ready - c.ready || a.id - c.id);

  const owner = new Array<number>(nSec).fill(-1);
  let t = 0;
  const maxT = 30000 + (opts.upCount + opts.downCount) * opts.headway;

  while (trains.some((x) => !x.done) && t < maxT) {
    for (const tr of order) {
      if (tr.done) continue;

      if (!tr.started) {
        if (t + 1e-9 < tr.ready) continue;
        const sec = tr.runSec[0];
        if (owner[sec] === -1) {
          owner[sec] = tr.id;
          tr.secOwned = sec;
          tr.started = true;
          tr.points.push({ t, s: 0 });
        } else {
          tr.points.push({ t, s: 0 }); // kalkış için bekliyor
          continue;
        }
      }

      if (tr.dwellUntil > t + 1e-9) {
        tr.points.push({ t: t + dt, s: tr.s });
        continue;
      }

      // Sonraki kesimi talep et (geçiş istasyonunda)
      if (tr.secOwned === -1) {
        const sec = tr.runSec[tr.runIdx];
        if (owner[sec] === -1) {
          owner[sec] = tr.id;
          tr.secOwned = sec;
        } else {
          tr.waited = true;
          tr.points.push({ t: t + dt, s: tr.s }); // geçiş istasyonunda bekle
          continue;
        }
      }

      // Kesim içinde sonraki durağa/sınıra doğru hareket
      const boundary = tr.passOwn[tr.runIdx + 1];
      const nsPos = tr.ns < tr.stops.length ? tr.stops[tr.ns].pos : tr.line.length;
      const target = Math.min(boundary, nsPos);

      const vA = allowedSpeed(tr.line, stock, tr.s, target, b);
      let vN: number;
      if (tr.v > vA + 0.05) {
        vN = Math.max(0, tr.v - b * dt);
      } else if (tr.v < vA - 0.05) {
        const g = segAt(tr.line, tr.s);
        const Ft = Math.min(stock.startingTractiveEffort, stock.power / Math.max(tr.v, 0.5));
        const R = stock.davisA + stock.davisB * tr.v + stock.davisC * tr.v * tr.v;
        const Fg = stock.mass * G * (g.gradient / 1000);
        vN = Math.max(0, Math.min(tr.v + ((Ft - R - Fg) / meff) * dt, vA));
      } else {
        vN = vA;
      }
      let sN = tr.s + ((tr.v + vN) / 2) * dt;

      if (sN >= target - 1e-6) {
        sN = target;
        tr.s = sN;
        tr.v = 0;
        const reachedStation = Math.abs(target - nsPos) < 1e-6 && tr.ns < tr.stops.length;
        const reachedBoundary = Math.abs(target - boundary) < 1e-6;
        if (reachedStation) {
          tr.dwellUntil = t + dt + tr.stops[tr.ns].dwell;
          tr.ns++;
        }
        tr.points.push({ t: t + dt, s: sN });
        if (reachedBoundary) {
          owner[tr.secOwned] = -1;
          tr.secOwned = -1;
          tr.runIdx++;
          if (tr.runIdx >= tr.runSec.length) {
            tr.done = true;
            tr.arr = t + dt;
          }
        }
        continue;
      }

      tr.s = sN;
      tr.v = vN;
      tr.points.push({ t: t + dt, s: sN });
    }
    t += dt;
  }

  const up = trains.filter((x) => x.dir === 1).map((x) => ({ index: x.id - 1000, dir: x.dir, points: x.points, arr: x.arr || t }));
  const down = trains.filter((x) => x.dir === -1).map((x) => ({ index: x.id - 2000, dir: x.dir, points: x.points, arr: x.arr || t }));
  return {
    up,
    down,
    sections: P,
    waited: trains.filter((x) => x.waited).length,
    deadlock: trains.some((x) => !x.done),
    tMax: Math.max(...trains.map((x) => x.arr || t)),
  };
}
