// anaray — örnek şebeke senaryosu.
// Ana hat (Merkez → Terminal) + B durağından ayrılan bir depo hattı (spur).
// Trenimiz ana hattı izler; depo hattı grafın gerçekten bir "ağ" olduğunu gösterir.
// Bu örnek veridir; gerçek proje hattı Ringler editöründen girilir.

import type { RailNetwork, Route } from "./types";
import { flattenRoute } from "./network";

export { varsayilanArac as ornekTramvay } from "./vehicles";

const KMH = 1 / 3.6; // km/h → m/s

export const ornekSebeke: RailNetwork = {
  id: "sebeke-1",
  name: "Örnek Tramvay Şebekesi",
  nodes: [
    { id: "merkez", name: "Merkez", type: "istasyon", x: 60, y: 70, dwell: 0 },
    { id: "a", name: "İstasyon A", type: "istasyon", x: 200, y: 70, dwell: 20 },
    { id: "b", name: "İstasyon B", type: "istasyon", x: 340, y: 70, dwell: 20 },
    { id: "c", name: "İstasyon C", type: "istasyon", x: 480, y: 70, dwell: 20 },
    { id: "d", name: "İstasyon D", type: "istasyon", x: 620, y: 70, dwell: 20 },
    { id: "terminal", name: "Terminal", type: "hatbasi", x: 760, y: 70, dwell: 0 },
    { id: "depo", name: "Depo", type: "hatbasi", x: 340, y: 150 },
  ],
  edges: [
    { id: "e1", from: "merkez", to: "a", length: 1200, segments: [{ start: 0, end: 1200, vmax: 60 * KMH, gradient: 0 }] },
    { id: "e2", from: "a", to: "b", length: 1200, segments: [{ start: 0, end: 1200, vmax: 60 * KMH, gradient: 0 }] },
    {
      id: "e3", from: "b", to: "c", length: 1200,
      segments: [
        { start: 0, end: 600, vmax: 40 * KMH, gradient: 15 }, // yavaş bölge + yokuş yukarı
        { start: 600, end: 1200, vmax: 40 * KMH, gradient: 0 },
      ],
    },
    { id: "e4", from: "c", to: "d", length: 1200, segments: [{ start: 0, end: 1200, vmax: 60 * KMH, gradient: -10 }] },
    { id: "e5", from: "d", to: "terminal", length: 1200, segments: [{ start: 0, end: 1200, vmax: 60 * KMH, gradient: -10 }] },
    // Depo hattı (rotada değil) — şebekede dallanma olduğunu gösterir
    { id: "e6", from: "b", to: "depo", length: 400, segments: [{ start: 0, end: 400, vmax: 20 * KMH, gradient: 0 }] },
  ],
};

export const anaHat: Route = {
  id: "rota-anahat",
  name: "Ana Hat: Merkez → Terminal",
  edgeIds: ["e1", "e2", "e3", "e4", "e5"],
};

/** Ana hattın düz koridor karşılığı (fizik motoru bunu tüketir). */
export const ornekHat = flattenRoute(ornekSebeke, anaHat);

