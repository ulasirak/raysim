// anaray — şebeke (graf) yardımcıları
//
// flattenRoute: bir rotayı (sıralı kenarlar) fizik motorunun anladığı düz
// Line'a (koridor) çevirir. Kenarlar rota yönünde yürünür; ters yönde
// geçilen kenarda parça offsetleri çevrilir ve EĞİM İŞARETİ döner.

import type {
  RailNetwork,
  Route,
  Line,
  Station,
  TrackSegment,
} from "./types";

export function flattenRoute(net: RailNetwork, route: Route): Line {
  const nodeById = new Map(net.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(net.edges.map((e) => [e.id, e]));

  const edges = route.edgeIds.map((id) => {
    const e = edgeById.get(id);
    if (!e) throw new Error(`Rota kenarı bulunamadı: ${id}`);
    return e;
  });
  if (edges.length === 0) throw new Error("Rota boş");

  // Başlangıç düğümünü belirle
  let current: string;
  if (route.startNodeId) {
    current = route.startNodeId;
  } else if (edges.length === 1) {
    current = edges[0].from;
  } else {
    const e0 = edges[0];
    const e1 = edges[1];
    const shared =
      e0.to === e1.from || e0.to === e1.to ? e0.to : e0.from;
    current = e0.from === shared ? e0.to : e0.from; // paylaşılmayan uç
  }

  const stations: Station[] = [];
  const segments: TrackSegment[] = [];
  let cursor = 0;

  const addStationIfAny = (nodeId: string, pos: number) => {
    const n = nodeById.get(nodeId);
    if (n && n.type === "istasyon") {
      stations.push({ id: n.id, name: n.name, position: pos, dwell: n.dwell ?? 0 });
    }
  };

  addStationIfAny(current, 0);

  for (const e of edges) {
    let forward: boolean;
    let next: string;
    if (e.from === current) {
      forward = true;
      next = e.to;
    } else if (e.to === current) {
      forward = false;
      next = e.from;
    } else {
      throw new Error(`Rota kopuk: '${current}' düğümü '${e.id}' kenarına bağlı değil`);
    }

    for (const s of e.segments) {
      if (forward) {
        segments.push({ start: cursor + s.start, end: cursor + s.end, vmax: s.vmax, gradient: s.gradient });
      } else {
        segments.push({
          start: cursor + (e.length - s.end),
          end: cursor + (e.length - s.start),
          vmax: s.vmax,
          gradient: -s.gradient, // ters yön: yokuş yukarı ↔ aşağı
        });
      }
    }

    cursor += e.length;
    current = next;
    addStationIfAny(current, cursor);
  }

  // Rotanın son düğümü istasyon değilse (ör. hat başı/tampon) dahi tren
  // orada DURMAK zorundadır — hattın sonuna kadar durmadan gidemez.
  const sonUlasim = stations.length > 0 ? stations[stations.length - 1].position : -1;
  if (sonUlasim < cursor - 0.01) {
    const son = nodeById.get(current);
    stations.push({
      id: son?.id ?? "son",
      name: son?.name ?? "Son",
      position: cursor,
      dwell: son?.dwell ?? 0,
    });
  }

  // Ters geçilen kenarlarda parça sırası konuma göre bozulabilir → sırala
  segments.sort((a, b) => a.start - b.start);

  return { id: route.id, name: route.name, length: cursor, stations, segments };
}

/** Bir rotanın kullandığı kenar id'lerini küme olarak döndürür (çizimde vurgu için). */
export function routeEdgeSet(route: Route): Set<string> {
  return new Set(route.edgeIds);
}
