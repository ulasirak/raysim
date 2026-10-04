// raysim — PARKLANMA (depoda park eden tren) İKİ YÖNLÜ AYNA yardımcıları
//
// "Park eden tren" İKİ yerde düzenlenir ve EŞ kalmalıdır:
//   1) Duraklar/Mesafeler (RingEditor) → ring.queued / fromQueued (ringe bağlı, kalıcı)
//   2) Sefer "Parklanma Dizilimi" (Studio) → isletme.parklanmaDagilim (konum-anahtarlı)
// Bu modül iki temsil arasındaki eşlemeyi TEK kaynaktan verir → her iki editör de aynı
// haritayı kullanır, kopmaz. Sim anlambilimi değişmez (sürücü hâlâ parklanmaDagilim);
// ayna yalnız kullanıcı düzenlemesinde iki alanı eşitler.

import type { DurakArasiRing } from "./ring";

/** Depo (parklanma) konum anahtarı — isletme.parklanmaDagilim bu anahtarla saklar. */
export const parkAnahtar = (pos: number) => `d${Math.round(pos)}`;

/** Durak index k'nin hat başından kümülatif konumu (m). k=0 → 0 (hat başı). */
export function durakKonumu(rings: DurakArasiRing[], k: number): number {
  let acc = 0;
  for (let i = 0; i < k && i < rings.length; i++) acc += Math.max(0, rings[i].uzunluk);
  return acc;
}

/** Konumdan (m) depo durağı index'i (bulunamazsa -1). k=0 = hat başı. */
export function konumDurakIndex(rings: DurakArasiRing[], pos: number): number {
  if (Math.abs(pos) < 1) return 0;
  let acc = 0;
  for (let i = 0; i < rings.length; i++) {
    acc += Math.max(0, rings[i].uzunluk);
    if (Math.abs(acc - pos) < 1) return i + 1;
  }
  return -1;
}

/** ring.queued/fromQueued'u k. durağa yaz (k=0 → ring[0].fromQueued). Yeni dizi döner. */
export function queuedYaz(rings: DurakArasiRing[], k: number, q: number): DurakArasiRing[] {
  const v = Math.max(0, Math.min(40, Math.round(q)));
  if (k <= 0) return rings.map((r, i) => (i === 0 ? { ...r, fromQueued: v } : r));
  return rings.map((r, i) => (i === k - 1 ? { ...r, queued: v } : r));
}

/** k. durağın ring.queued değeri (k=0 → fromQueued). */
export function queuedOku(rings: DurakArasiRing[], k: number): number {
  const r = k <= 0 ? rings[0] : rings[k - 1];
  const v = k <= 0 ? r?.fromQueued : r?.queued;
  return Math.max(0, Math.round(v ?? 0));
}
