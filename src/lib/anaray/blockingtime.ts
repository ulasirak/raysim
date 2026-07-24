// raysim — BLOCKING-TIME (Sperrzeitentreppe) + UIC 406 KAPASİTE.
//
// Her sinyal bloğu, bir tren için bir "blocking time" süresi boyunca rezerve
// edilir. Klasik demiryolu kapasite teorisinde (Pachl; UIC 406) bu süre 6
// bileşenden oluşur:
//   1) t_setup     — rota kurma / sinyal açma (makas bölgesinde tanzim)
//   2) t_sighting  — sürücünün sinyali görme / reaksiyon
//   3) t_approach  — yaklaşma (fren mesafesi kadar önden) seyir süresi
//   4) t_running   — bloğun kendi içinde seyir süresi
//   5) t_clearing  — tren boyunun bloğu terk süresi (tren uzunluğu / hız)
//   6) t_release   — rota serbest bırakma (makas bölgesinde 5/8 s)
// Bloğun blocking-time'ı bu 6'nın toplamıdır ("merdiven basamağı").
// Min headway = en yüksek blocking-time'lı blok (kritik blok). UIC 406 doluluk =
// sıkıştırılmış işgal süresi / zaman penceresi. Tramvay (görerek sürüş) rejimine
// uyarlanır: düz bloklarda setup/release ~0, makas bloklarında config'ten gelir.

import type { RollingStock } from "./types";
import type { SimConfig } from "./config";
import { simulate } from "./sim";
import { makeBlocks } from "./signalling";
import { loopToHat, type HatModel } from "./hatsim";
import type { DurakArasiRing } from "./ring";

const T_SIGHTING = 4; // s — sürücü görme/reaksiyon (görerek sürüş kabulü)

export interface BlokSperr {
  i: number;
  start: number; // m
  end: number; // m
  girisT: number; // s — tek tren giriş
  cikisT: number; // s — tek tren çıkış
  makasBlok: boolean;
  tSetup: number;
  tSighting: number;
  tApproach: number;
  tRunning: number;
  tClearing: number;
  tRelease: number;
  toplam: number; // blocking time (s)
}

export interface BlockingSonuc {
  bloklar: BlokSperr[];
  minHeadway: number; // s — kritik blok blocking-time'ı
  kritikBlok: number; // indeks
  teorikKapasite: number; // tren/saat = 3600 / minHeadway
  hedefHeadway: number; // s (config)
  dolulukHedef: number; // % — minHeadway / hedefHeadway (UIC 406 doluluk)
  hedefUygun: boolean; // hedef headway ≥ minHeadway ?
  tTren: number; // s — tek tren tam hat süresi
  toplamUzunluk: number; // m
  yorunge: { t: number; s: number }[]; // tek tren yörüngesi (Sperrzeitentreppe çizimi için)
}

/** Bir trajektoriden verilen konuma ilk ulaşma zamanı (s). */
function ulasmaT(points: { t: number; s: number }[], s: number): number {
  if (s <= 0) return points[0]?.t ?? 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].s >= s - 1e-6) {
      const p0 = points[i - 1], p1 = points[i];
      const f = (s - p0.s) / ((p1.s - p0.s) || 1);
      return p0.t + (p1.t - p0.t) * Math.max(0, Math.min(1, f));
    }
  }
  return points[points.length - 1]?.t ?? 0;
}

/** Verilen konumdaki hız (m/s) — clearing süresi için. */
function hizAt(points: { t: number; s: number; v: number }[], s: number): number {
  for (let i = 1; i < points.length; i++) {
    if (points[i].s >= s - 1e-6) return Math.max(1, points[i].v);
  }
  return Math.max(1, points[points.length - 1]?.v ?? 1);
}

export function blockingTimeHesap(model: HatModel, stock: RollingStock, cfg: SimConfig): BlockingSonuc {
  const line = model.line;
  const bounds = makeBlocks(line, cfg.blokMaxUzunluk);
  const res = simulate(line, stock, 0.5);
  const pts = res.points;
  const b = stock.maxBraking;
  const brakeDist = (stock.maxSpeed * stock.maxSpeed) / (2 * b);

  const makasOverlap = (s0: number, s1: number) =>
    model.zones.find((z) => z.start < s1 - 1e-6 && z.end > s0 + 1e-6) ?? null;

  const bloklar: BlokSperr[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i];
    const end = bounds[i + 1];
    const girisT = ulasmaT(pts, start);
    const cikisT = ulasmaT(pts, end);
    const tRunning = Math.max(0, cikisT - girisT);

    // yaklaşma: fren mesafesi kadar önce
    const yaklasS = Math.max(0, start - brakeDist);
    const tApproach = Math.max(0, girisT - ulasmaT(pts, yaklasS));

    // temizleme: tren boyu / çıkış hızı
    const vCikis = hizAt(pts, end);
    const tClearing = stock.length / vCikis;

    const z = makasOverlap(start, end);
    const tSetup = z ? z.setupSure : 0;
    const tRelease = z ? z.releaseSure : 0;
    const tSighting = T_SIGHTING;

    const toplam = tSetup + tSighting + tApproach + tRunning + tClearing + tRelease;
    bloklar.push({ i, start, end, girisT, cikisT, makasBlok: !!z, tSetup, tSighting, tApproach, tRunning, tClearing, tRelease, toplam });
  }

  let kritikBlok = 0;
  for (let i = 1; i < bloklar.length; i++) if (bloklar[i].toplam > bloklar[kritikBlok].toplam) kritikBlok = i;
  const minHeadway = bloklar.length ? bloklar[kritikBlok].toplam : 0;
  const teorikKapasite = minHeadway > 0 ? 3600 / minHeadway : 0;
  const dolulukHedef = cfg.headway > 0 ? (minHeadway / cfg.headway) * 100 : 0;

  return {
    bloklar,
    minHeadway,
    kritikBlok,
    teorikKapasite,
    hedefHeadway: cfg.headway,
    dolulukHedef,
    hedefUygun: cfg.headway >= minHeadway,
    tTren: res.totalTime,
    toplamUzunluk: line.length,
    yorunge: pts.map((p) => ({ t: p.t, s: p.s })),
  };
}

/** Kısayol: ring dizisinden doğrudan blocking-time analizi. */
export function blockingTimeRing(rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig): BlockingSonuc {
  return blockingTimeHesap(loopToHat(rings, true, cfg), stock, cfg);
}
