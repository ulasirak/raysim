// raysim — mikroskobik çok-tren SABİT BLOK sinyal simülasyonu + çift yön + filo.
//
// Hat, sinyallerle bloklara bölünür (istasyonlar + ara sinyaller). Bir tren,
// önündeki ilk BAŞKA trenle dolu bloğa giremez → o bloğun giriş sinyalinde
// (kırmızı) durur, blok boşalınca devam eder. Böylece "birbirini bekler mi"
// blok düzeyinde, istasyon arası dahil gerçekçi modellenir.
// Çift yön (çift hat varsayımı): her yön bağımsız; dönüş için rota ters çevrilir.

import type { Line, RollingStock, Route } from "./types";

const G = 9.81;

export function segAt(line: Line, s: number) {
  for (const seg of line.segments) if (s >= seg.start && s < seg.end) return seg;
  return line.segments[line.segments.length - 1];
}

// stopTarget'ta duracak şekilde izin verilen hız (hat limitleri + fren eğrisi)
export function allowedSpeed(line: Line, stock: RollingStock, s: number, stopTarget: number, b: number): number {
  if (stopTarget <= s) return 0;
  let vc = Math.min(stock.maxSpeed, segAt(line, s).vmax);
  for (const seg of line.segments) {
    if (seg.start > s && seg.start <= stopTarget) {
      vc = Math.min(vc, Math.sqrt(seg.vmax * seg.vmax + 2 * b * (seg.start - s)));
    }
  }
  vc = Math.min(vc, Math.sqrt(2 * b * (stopTarget - s)));
  return vc;
}

/** Blok sınırları: istasyonlar + her kesimi maxBlockLen'i aşmayacak şekilde böl. */
export function makeBlocks(line: Line, maxBlockLen: number): number[] {
  const set = new Set<number>([0, line.length]);
  for (const st of line.stations) set.add(st.position);
  const bounds = Array.from(set).sort((a, c) => a - c);
  const out: number[] = [bounds[0]];
  for (let i = 1; i < bounds.length; i++) {
    const a = bounds[i - 1];
    const c = bounds[i];
    const n = Math.max(1, Math.ceil((c - a) / maxBlockLen - 1e-9));
    for (let j = 1; j <= n; j++) out.push(a + ((c - a) * j) / n);
  }
  return out;
}

export function blockOf(bounds: number[], s: number): number {
  for (let j = 0; j < bounds.length - 1; j++) if (s < bounds[j + 1] - 1e-6) return j;
  return bounds.length - 2;
}

/**
 * Trenin işgal ettiği blok aralığı [kuyruk, baş] (dahil). Tren bir NOKTA değil,
 * boyu kadar yer kaplar → kuyruğu (s − boy) bir bloğu terk edene dek o blok
 * doludur. Bu, kapasitenin blocking-time teorisiyle (t_clearing) tutarlı çıkmasını
 * sağlar; noktasal model kapasiteyi olduğundan yüksek gösterirdi.
 */
export function occupiedBlocks(bounds: number[], sHead: number, length: number): [number, number] {
  const tail = Math.max(0, sHead - length);
  return [blockOf(bounds, tail), blockOf(bounds, sHead)];
}

export interface SignalTrain {
  index: number;
  points: { t: number; s: number }[];
  arr: number;
  delay: number;
}

export interface SignalResult {
  trains: SignalTrain[];
  blocks: number[];
  anyDelay: boolean;
  maxDelay: number;
  minHeadway: number; // gecikmesiz en sık aralık (s)
  tMax: number;
  baseTime: number; // tek tren sefer süresi (s)
}

interface Perturb {
  entry: number[]; // tren başına ek giriş gecikmesi (s)
  dwell: number[][]; // [tren][istasyon] ek durak süresi (s)
}

function runTrains(
  line: Line,
  stock: RollingStock,
  bounds: number[],
  headway: number,
  count: number,
  dt: number,
  baseTime: number,
  pert?: Perturb,
  blocked?: Set<number> // kalıcı arızalı bloklar (dispatcher modu) — hep dolu sayılır
): SignalTrain[] {
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  const b = stock.maxBraking;
  const stops = line.stations.map((s) => ({ pos: s.position, dwell: s.dwell }));
  const EPS = 1; // kırmızı sinyalde 1 m geride dur (temiz blok işgali)
  const nb = bounds.length - 1;
  // İlk durak: konumu 0'dan büyük ilk istasyon (origin s=0'da duruş sayılmaz).
  const firstStop = (() => {
    const i = stops.findIndex((s) => s.pos > 1e-6);
    return i < 0 ? stops.length : i;
  })();

  type St = { k: number; s: number; v: number; started: boolean; done: boolean; ns: number; dwellUntil: number; points: { t: number; s: number }[]; arr: number };
  const trains: St[] = Array.from({ length: count }, (_, k) => ({ k, s: 0, v: 0, started: false, done: false, ns: firstStop, dwellUntil: -1, points: [], arr: 0 }));

  let t = 0;
  const maxT = baseTime * 3 + count * headway + 1200;

  while (trains.some((tr) => !tr.done) && t < maxT) {
    // blok işgali (adım başı anlık görüntü) — tren boyu kadar (kuyruk→baş)
    const occ = new Array<number>(nb).fill(-1);
    for (const tr of trains) if (tr.started && !tr.done) {
      const [a, c] = occupiedBlocks(bounds, tr.s, stock.length);
      for (let j = a; j <= c; j++) occ[j] = tr.k;
    }
    // Arızalı bloklar: sahipsiz ama hep dolu (-2 = tren değil) → arkadaki trenler kırmızıda bekler.
    if (blocked) for (const j of blocked) if (j >= 0 && j < nb) occ[j] = -2;

    for (const tr of trains) {
      if (tr.done) continue;

      if (!tr.started) {
        const ready = t + 1e-9 >= tr.k * headway + (pert?.entry[tr.k] ?? 0);
        if (ready && (occ[0] === -1 || occ[0] === tr.k)) {
          tr.started = true;
          tr.points.push({ t, s: 0 });
        } else {
          if (ready) tr.points.push({ t, s: 0 }); // origin'de bekliyor
          continue;
        }
      }

      if (tr.dwellUntil > t + 1e-9) {
        tr.points.push({ t: t + dt, s: tr.s });
        continue;
      }

      // hareket yetkisi: önümüzdeki ilk dolu bloğun giriş sınırı
      const cur = blockOf(bounds, tr.s);
      let MA = line.length;
      for (let j = cur + 1; j < nb; j++) {
        if (occ[j] !== -1 && occ[j] !== tr.k) { MA = bounds[j]; break; }
      }
      const nsPos = tr.ns < stops.length ? stops[tr.ns].pos : line.length;
      const redStop = MA < nsPos - 1e-6;
      const target = Math.min(MA, nsPos);

      const vAllowed = allowedSpeed(line, stock, tr.s, target, b);
      let vNew: number;
      if (tr.v > vAllowed + 0.05) {
        vNew = Math.max(0, tr.v - b * dt);
      } else if (tr.v < vAllowed - 0.05) {
        const seg = segAt(line, tr.s);
        const Ftr = Math.min(stock.startingTractiveEffort, stock.power / Math.max(tr.v, 0.5));
        const R = stock.davisA + stock.davisB * tr.v + stock.davisC * tr.v * tr.v;
        const Fg = stock.mass * G * (seg.gradient / 1000);
        const a = (Ftr - R - Fg) / meff;
        vNew = Math.max(0, Math.min(tr.v + a * dt, vAllowed));
      } else {
        vNew = vAllowed;
      }

      let sNew = tr.s + ((tr.v + vNew) / 2) * dt;

      // İstasyona varış (kırmızı bundan önce değilse)
      if (!redStop && sNew >= nsPos - 1e-6) {
        sNew = nsPos;
        tr.s = sNew;
        tr.v = 0;
        tr.points.push({ t: t + dt, s: sNew });
        if (nsPos >= line.length - 1e-6) {
          tr.done = true;
          tr.arr = t + dt;
        } else {
          tr.dwellUntil = t + dt + stops[tr.ns].dwell + (pert?.dwell[tr.k]?.[tr.ns] ?? 0);
          tr.ns++;
        }
        continue;
      }

      // Kırmızı sinyalde durma (sinyalin 1 m gerisinde)
      if (redStop && sNew >= MA - EPS) {
        sNew = Math.max(tr.s, MA - EPS);
        vNew = 0;
      }

      tr.s = sNew;
      tr.v = vNew;
      tr.points.push({ t: t + dt, s: sNew });
    }
    t += dt;
  }

  return trains.map((tr) => ({ index: tr.k, points: tr.points, arr: tr.arr || t, delay: 0 }));
}

export function simulateSignalled(
  line: Line,
  stock: RollingStock,
  opts: { headway: number; count: number; maxBlockLen: number; dt?: number; blocked?: number[] }
): SignalResult {
  const dt = opts.dt ?? 0.5;
  const bounds = makeBlocks(line, opts.maxBlockLen);
  const baseTime = runTrains(line, stock, bounds, 1e9, 1, dt, 600)[0].arr;

  const blocked = opts.blocked && opts.blocked.length ? new Set(opts.blocked) : undefined;
  const runs = runTrains(line, stock, bounds, opts.headway, Math.max(1, opts.count), dt, baseTime, undefined, blocked);
  const trains = runs.map((tr) => ({ ...tr, delay: Math.max(0, tr.arr - (tr.index * opts.headway + baseTime)) }));
  const maxDelay = Math.max(0, ...trains.map((t) => t.delay));
  const tMax = Math.max(...trains.map((t) => t.arr));

  // gecikmesiz en sık aralık (kaba arama, 3 tren)
  let minHeadway = Math.max(15, Math.round(baseTime));
  for (let h = 15; h <= baseTime; h += 15) {
    const r = runTrains(line, stock, bounds, h, 3, dt, baseTime);
    const d = r[2].arr - (2 * h + baseTime);
    if (d <= 2) { minHeadway = h; break; }
  }

  return { trains, blocks: bounds, anyDelay: maxDelay > 2, maxDelay, minHeadway, tMax, baseTime };
}

/** Rotayı ters çevirir (dönüş yönü). flatten bunu diğer uçtan gezer, eğim işareti döner. */
export function reverseRoute(route: Route): Route {
  // startNodeId TAŞINMAZ: ileri rotanın başlangıç düğümü dönüşün başlangıcı değildir
  // (ters listenin ilk kenarı o düğüme bağlı olmadığı için flattenRoute "Rota kopuk"
  // hatası verirdi). Düşürülünce flatten diğer uçtan gezer.
  return {
    id: route.id + "-donus",
    name: route.name + " (dönüş)",
    edgeIds: [...route.edgeIds].reverse(),
  };
}

/** Filo (araç) ihtiyacı = tur süresi / sefer aralığı (yukarı yuvarlanır). */
export function fleetSize(forwardTime: number, returnTime: number, turnaround: number, headway: number): {
  roundTrip: number;
  trains: number;
} {
  const roundTrip = forwardTime + returnTime + 2 * turnaround;
  return { roundTrip, trains: Math.max(1, Math.ceil(roundTrip / headway)) };
}

// ————————————————————————————————————————————————
// Monte-Carlo gecikme yayılımı / robustluk (Faz 4)
// ————————————————————————————————————————————————
// Her denemede rastgele giriş gecikmesi + durak süresi sapması (üstel dağılım)
// enjekte edilir; çok tren sinyal simülasyonu koşturulur; birincil gecikmelerin
// sonraki trenlere nasıl yayıldığı ölçülür.

function expRand(mean: number): number {
  if (mean <= 0) return 0;
  return -mean * Math.log(1 - Math.random());
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface MonteCarloResult {
  trials: number;
  onTimePct: number; // eşik altında varan tren oranı (%)
  meanDelay: number;
  p90Delay: number;
  maxDelay: number;
  avgByTrain: number[]; // tren sırasına göre ortalama varış gecikmesi
  threshold: number;
}

export function monteCarlo(
  line: Line,
  stock: RollingStock,
  opts: { headway: number; count: number; maxBlockLen: number; dt?: number },
  cfg: { trials: number; meanEntry: number; meanDwell: number; threshold: number }
): MonteCarloResult {
  const dt = opts.dt ?? 0.5;
  const bounds = makeBlocks(line, opts.maxBlockLen);
  const baseTime = runTrains(line, stock, bounds, 1e9, 1, dt, 600)[0].arr;
  const count = Math.max(1, opts.count);
  const nStops = line.stations.length;

  const all: number[] = [];
  const perTrain: number[][] = Array.from({ length: count }, () => []);

  for (let tr = 0; tr < cfg.trials; tr++) {
    const entry = Array.from({ length: count }, () => expRand(cfg.meanEntry));
    const dwell = Array.from({ length: count }, () => Array.from({ length: nStops }, () => expRand(cfg.meanDwell)));
    const runs = runTrains(line, stock, bounds, opts.headway, count, dt, baseTime, { entry, dwell });
    runs.forEach((r, k) => {
      const d = Math.max(0, r.arr - (k * opts.headway + baseTime));
      all.push(d);
      perTrain[k].push(d);
    });
  }

  all.sort((a, b) => a - b);
  const mean = all.reduce((s, x) => s + x, 0) / (all.length || 1);
  const onTime = all.filter((d) => d <= cfg.threshold).length / (all.length || 1);
  const avgByTrain = perTrain.map((arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1));

  return {
    trials: cfg.trials,
    onTimePct: onTime * 100,
    meanDelay: mean,
    p90Delay: percentile(all, 90),
    maxDelay: all[all.length - 1] ?? 0,
    avgByTrain,
    threshold: cfg.threshold,
  };
}
