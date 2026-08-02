// raysim — Ring zinciri → BİRLEŞİK HAT MODELİ (makas bölgeleriyle).
//
// Durak-arası ring hücrelerini tek bir birleşik hatta zincirler ve makas
// bölgelerini (kapasite kaynağı) çıkarır. Blocking-time kapasite hesabı
// (blockingtime.ts) ve teknik rapor (rapor.ts) bu modeli tüketir.
//
// NOT: Çok-tren canlı simülasyon modülü (HatSim) kaldırıldı; burada yalnızca
// hattı kuran saf yardımcı (loopToHat) kalır.

import type { Line, Station } from "./types";
import type { SimConfig } from "./config";
import { BELGE, type DurakArasiRing, type MakasTip, ringToLine } from "./ring";

// ————————————————————————————————————————————————
// Birleşik hat modeli (ring zinciri → tek Line + makas bölgeleri)
// ————————————————————————————————————————————————

/** Birleşik hat üzerinde bir makas bölgesi = kapasite (mutual-exclusion) kaynağı. */
export interface MakasZon {
  id: string;
  ad: string;
  ringId: string;
  tip: MakasTip;
  merkez: number; // birleşik hat koordinatı (m)
  start: number; // bölge girişi (m)
  end: number; // bölge çıkışı (m)
  gecisHizi: number; // m/s (15 km/h)
  setupSure: number; // s — tanzim (makasSayisi × adım)
  releaseSure: number; // s — route release kilidi
}

export interface HatModel {
  line: Line;
  zones: MakasZon[];
  ringBounds: number[]; // kümülatif ring sınırları (m) — UI için
  kapali: boolean;
}

/** Ring zincirini birleşik hatta + makas bölgelerine çevirir (nominal mesafeler). */
export function loopToHat(rings: DurakArasiRing[], kapali = true, cfg: SimConfig = BELGE): HatModel {
  const W = cfg.kisitGenisligi; // makas kısıt genişliği (m)
  const segments = [] as Line["segments"];
  const stations: Station[] = [];
  const zones: MakasZon[] = [];
  const ringBounds: number[] = [0];

  let offset = 0;
  rings.forEach((ring, ri) => {
    const sub = ringToLine(ring, "nominal", cfg); // segmentler + 2 durak (0 ve L)
    const L = sub.length;
    // segmentleri offsetle taşı
    for (const s of sub.segments) segments.push({ start: s.start + offset, end: s.end + offset, vmax: s.vmax, gradient: s.gradient });
    // ilk ringin başlangıç durağı bir kez (origin, dwell 0)
    if (ri === 0) stations.push({ id: ring.fromStationId, name: ring.fromAd, position: 0, dwell: 0 });
    // her ringin varış durağı (dwell = ring.dwell)
    stations.push({ id: ring.toStationId, name: ring.toAd, position: offset + L, dwell: ring.dwell });
    // makas bölgeleri
    for (const m of ring.makaslar) {
      const merkez = offset + Math.max(0, Math.min(ring.uzunluk, m.konum));
      zones.push({
        id: `${ring.id}:${m.id}`,
        ad: m.ad || `${ring.ad} makas`,
        ringId: ring.id,
        tip: m.tip,
        merkez,
        start: Math.max(offset, merkez - W / 2),
        end: Math.min(offset + L, merkez + W / 2),
        gecisHizi: Math.max(0.1, m.gecisHizi), // 0 girilirse çevrim (dongu) hesabı Infinity olmasın
        setupSure: Math.max(1, m.makasSayisi) * m.makasAdimSuresi,
        releaseSure: m.routeRelease,
      });
    }
    offset += L;
    ringBounds.push(offset);
  });

  const line: Line = { id: "hat_birlesik", name: "Birleşik Hat", length: offset, stations, segments };
  return { line, zones, ringBounds, kapali };
}
