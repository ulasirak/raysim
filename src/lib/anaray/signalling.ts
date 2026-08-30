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

/**
 * Ortak hareket adımı — v → vNew (+ ivme a). TÜM motorlar bunu kullanır (tek kaynak
 * fizik): çekiş Ftr=min(ST, P/max(v,0.5)); direnç R=davisA+B·v+C·v²; eğim
 * Fg=m·g·grad/1000; a=(Ftr−R−Fg)/meff. Fren rejiminde vNew=max(0, v−b·dt) (a=−b),
 * seyirde vNew=vAllowed (a=0). vNew her zaman [0, vAllowed] aralığında.
 * Not: net kuvvet negatifse (dik yokuş/yetersiz güç) sahte ivme eklenmez — tren
 * denge hızına oturur ya da (kalkışta) durur (kalkış-stall coreRun'da yakalanır).
 */
export function stepMotion(
  stock: RollingStock, v: number, vAllowed: number, gradient: number, dt: number, meff: number, b: number
): { vNew: number; a: number } {
  if (v > vAllowed + 0.05) return { vNew: Math.max(0, v - b * dt), a: -b };
  if (v < vAllowed - 0.05) {
    const Ftr = Math.min(stock.startingTractiveEffort, stock.power / Math.max(v, 0.5));
    const R = stock.davisA + stock.davisB * v + stock.davisC * v * v;
    const Fg = stock.mass * G * (gradient / 1000);
    const a = (Ftr - R - Fg) / meff;
    return { vNew: Math.max(0, Math.min(v + a * dt, vAllowed)), a };
  }
  return { vNew: vAllowed, a: 0 };
}

/** Blok sınırları: istasyonlar + her kesimi maxBlockLen'i aşmayacak şekilde böl. */
export function makeBlocks(line: Line, maxBlockLen: number): number[] {
  // Sıfır/negatif uzunlukta en az iki sınır garantile → blockOf dejenere (-1) dönmesin.
  const L = Math.max(line.length, 1e-6);
  const set = new Set<number>([0, L]);
  for (const st of line.stations) set.add(st.position);
  const bounds = Array.from(set).sort((a, c) => a - c);
  const out: number[] = [bounds[0] ?? 0];
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
  blocked?: Set<number>, // kalıcı arızalı bloklar (dispatcher modu) — hep dolu sayılır
  origins?: number[] // tren başına çıkış konumu (m); verilmezse 0 (hat başı). Depo çıkışı.
): SignalTrain[] {
  const meff = Math.max(1, stock.mass * (1 + stock.rotatingMassFactor)); // kütle≤0 → NaN yörünge olmasın
  const b = Math.max(0.1, stock.maxBraking); // negatif/0 fren → NaN yörünge olmasın (hatsim/blockingtime ile tutarlı)
  const stops = line.stations.map((s) => ({ pos: s.position, dwell: s.dwell }));
  const EPS = 1; // kırmızı sinyalde 1 m geride dur (temiz blok işgali)
  const nb = bounds.length - 1;
  const org = (k: number) => Math.max(0, Math.min(line.length, origins?.[k] ?? 0));
  // İlk durak: çıkış konumundan SONRAKİ ilk istasyon (çıkış konumundaki duruş sayılmaz).
  const firstStopFrom = (pos: number) => {
    const i = stops.findIndex((s) => s.pos > pos + 1e-6);
    return i < 0 ? stops.length : i;
  };

  type St = { k: number; s: number; v: number; started: boolean; done: boolean; ns: number; dwellUntil: number; points: { t: number; s: number }[]; arr: number };
  const trains: St[] = Array.from({ length: count }, (_, k) => ({ k, s: org(k), v: 0, started: false, done: false, ns: firstStopFrom(org(k)), dwellUntil: -1, points: [], arr: 0 }));

  let t = 0;
  const maxT = baseTime * 3 + count * headway + 1200;
  // Sağlamlık backstop'u: patolojik girdide (maxSpeed=0, aşırı eğim, negatif kütle)
  // hiçbir tren ilerleyemezse döngü kilitlenmesin. Sert iterasyon tavanı + adım
  // başı "canlılık" kontrolü (aşağıda). maxT bazı çağrılarda ~1e9 olduğundan şart.
  const HARD_ITERS = 2_000_000;
  let iters = 0;

  while (trains.some((tr) => !tr.done) && t < maxT) {
    if (++iters > HARD_ITERS) break;
    const sumBefore = trains.reduce((acc, tr) => acc + tr.s, 0);
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
        const s0 = org(tr.k);
        const startBlk = blockOf(bounds, s0);
        const ready = t + 1e-9 >= tr.k * headway + (pert?.entry[tr.k] ?? 0);
        if (ready && (occ[startBlk] === -1 || occ[startBlk] === tr.k)) {
          tr.started = true;
          tr.points.push({ t, s: s0 });
        } else {
          if (ready) tr.points.push({ t, s: s0 }); // depoda/çıkışta bekliyor
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
      let vNew = stepMotion(stock, tr.v, vAllowed, segAt(line, tr.s).gradient, dt, meff, b).vNew;

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
    // Canlılık: kimse ilerlemedi + kimse duruşta/çıkış-sırası beklemiyorsa → kalıcı
    // stall (hat fiziksel olarak koşulamıyor). Kalanları bitir ve çık; sonsuz dönme.
    let alive = trains.reduce((acc, tr) => acc + tr.s, 0) > sumBefore + 1e-6;
    if (!alive) {
      for (const tr of trains) {
        if (tr.done) continue;
        if (!tr.started) {
          const entryT = tr.k * headway + (pert?.entry[tr.k] ?? 0);
          if (t < entryT - 1e-9) { alive = true; break; }
        } else if (tr.dwellUntil > t + 1e-9) { alive = true; break; }
      }
    }
    if (!alive) { for (const tr of trains) if (!tr.done) { tr.done = true; tr.arr = t; } break; }
    t += dt;
  }

  return trains.map((tr) => ({ index: tr.k, points: tr.points, arr: tr.arr || t, delay: 0 }));
}

export function simulateSignalled(
  line: Line,
  stock: RollingStock,
  opts: { headway: number; count: number; maxBlockLen: number; dt?: number; blocked?: number[]; origins?: number[] }
): SignalResult {
  const dt = opts.dt ?? 0.5;
  const bounds = makeBlocks(line, opts.maxBlockLen);
  const baseTime = runTrains(line, stock, bounds, 1e9, 1, dt, 600)[0].arr;

  const blocked = opts.blocked && opts.blocked.length ? new Set(opts.blocked) : undefined;
  const runs = runTrains(line, stock, bounds, opts.headway, Math.min(200, Math.max(1, opts.count)), dt, baseTime, undefined, blocked, opts.origins);
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

// ————————————————————————————————————————————————
// Depo (parklanma) çıkış planı
// ————————————————————————————————————————————————

export interface DepotInfo {
  id: string;
  name: string;
  position: number;    // m (hat başından)
  queued: number;      // çıkışa hazır bekleyen tren sayısı
  releaseTimes: number[]; // her bekleyen trenin planlanan çıkış anı (s)
}

/**
 * Depo (parklanma) istasyonlarından gidiş servis planı üretir. Her deponun
 * kuyruğu, hat başına yakın depo önce olacak şekilde headway aralığıyla tek
 * kuyruğa dizilir → trenler depolarından SIRAYLA çıkar. `origins` doğrudan
 * runTrains'e verilir (tren başına çıkış konumu). Hattın sonundaki depo gidişe
 * tren veremez (gidecek yer yok) → dışlanır.
 */
export function planDepotDispatch(line: Line, headway: number): { origins: number[]; depots: DepotInfo[]; total: number } {
  // Depo BAYRAĞI olan her istasyon dispatch origini (queued>0 şartı yok; filo pik
  // filodan gelir, queued = bu depoda park eden/stablanmış tren sayısı — bilgi).
  const depotStops = line.stations
    .filter((s) => s.depot && s.position < line.length - 1e-6)
    .sort((a, c) => a.position - c.position);
  const origins: number[] = [];
  const depots: DepotInfo[] = [];
  for (const s of depotStops) {
    const q = Math.floor(s.queued ?? 0);
    const releaseTimes: number[] = [];
    for (let i = 0; i < q; i++) {
      releaseTimes.push(origins.length * headway); // küresel çıkış sırası × headway
      origins.push(s.position);
    }
    depots.push({ id: s.id, name: s.name, position: s.position, queued: q, releaseTimes });
  }
  return { origins, depots, total: origins.length };
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
  threshold: number;
  /** Gecikme DAĞILIMI (histogram): tüm örneklerin kovalara düşen oranı (%). */
  histogram: { alt: number; ust: number; oran: number }[];
  /** Tren SIRASINA göre gecikme kademesi (yayılım): ortalama + p50 + p90. */
  perTren: { ort: number; p50: number; p90: number }[];
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
  const count = Math.min(200, Math.max(1, opts.count)); // motor koruması: aşırı tren sayısı donmasın
  const trials = Math.min(500, Math.max(1, cfg.trials)); // deneme sayısı üst sınırı
  const nStops = line.stations.length;

  const all: number[] = [];
  const perTrain: number[][] = Array.from({ length: count }, () => []);

  for (let tr = 0; tr < trials; tr++) {
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
  const maxDelay = all[all.length - 1] ?? 0;

  // Gecikme dağılımı histogramı — sabit kova sayısı; son kova üst sınırı dahil.
  const nB = 14;
  const genislik = maxDelay > 0 ? maxDelay / nB : 1;
  const N = all.length || 1;
  const histogram = Array.from({ length: nB }, (_, i) => {
    const alt = i * genislik;
    const ust = (i + 1) * genislik;
    const say = all.filter((d) => (i === nB - 1 ? d >= alt && d <= ust : d >= alt && d < ust)).length;
    return { alt, ust, oran: (say / N) * 100 };
  });

  // Tren sırasına göre gecikme kademesi (yayılım): her tren için p50/p90/ortalama.
  const perTren = perTrain.map((arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return {
      ort: s.reduce((a, b) => a + b, 0) / (s.length || 1),
      p50: percentile(s, 50),
      p90: percentile(s, 90),
    };
  });

  return {
    trials, // fiilen koşturulan (kıskaçlanmış) deneme sayısı
    onTimePct: onTime * 100,
    meanDelay: mean,
    p90Delay: percentile(all, 90),
    maxDelay,
    threshold: cfg.threshold,
    histogram,
    perTren,
  };
}
