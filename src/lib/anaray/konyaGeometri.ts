// raysim — Konya Tramvay GERÇEK TRACK GEOMETRİSİ (Büyük sıçrama D — coğrafi harita).
//
// KAYNAK: © OpenStreetMap katkıcıları (ODbL). Overpass'tan Konya bbox'ındaki tram
// (railway=tram, operasyonel) + inşaat-halindeki (railway=construction·construction=tram)
// way'lerinin node geometrisi çekildi, Douglas-Peucker (~28 m) ile sadeleştirildi
// (3443 → 374 nokta), 4 ondalık (~11 m). UYDURMA YOK. Haritada gerçek kavisli hizayı
// (istasyonlar arası düz çizgi yerine) BACKDROP olarak çizer.
//
// Her yol: insaat (operasyonel/inşaat ayrımı) + [lat, lon] nokta dizisi.

import ham from "./konyaGeometri.json";

export interface GeoYol {
  /** İnşaat halinde mi (railway=construction) — kesikli çizilir. */
  insaat: boolean;
  /** [enlem, boylam] nokta dizisi (sadeleştirilmiş polyline). */
  noktalar: [number, number][];
}

export const KONYA_GEOMETRI: GeoYol[] = (ham as { c: number; p: [number, number][] }[]).map((w) => ({
  insaat: w.c === 1,
  noktalar: w.p,
}));
