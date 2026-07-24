// raysim — graf düzenleme (istasyon ekle/sil).
//
// Değişmez (invariant): editör tabanı ana hat (anaHat) TÜM kenarları ileri yönde
// gezer (train edge.from'dan girer). Ekle/sil bu ileri-yönlülüğü korur:
//  - ekle: kenarı [from→yeni, yeni→to] olarak böler (ikisi de ileri)
//  - sil: e1.to===node && e2.from===node olan ardışık iki kenarı birleştirir
// Böylece yön/eğim işareti karmaşası olmadan doğru kalır.

import type { RailNetwork, Route, RailEdge, EdgeSegment, RailNode } from "./types";

function uid(prefix: string, existing: Set<string>): string {
  let i = 1;
  while (existing.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** edgeId kenarının ortasına yeni bir istasyon ekler. */
export function addStationOnEdge(
  net: RailNetwork,
  route: Route,
  edgeId: string,
  name: string
): { network: RailNetwork; route: Route } {
  const edge = net.edges.find((e) => e.id === edgeId);
  if (!edge) return { network: net, route };
  const from = net.nodes.find((n) => n.id === edge.from);
  const to = net.nodes.find((n) => n.id === edge.to);
  if (!from || !to) return { network: net, route };

  const d = edge.length / 2; // orta nokta

  const nodeIds = new Set(net.nodes.map((n) => n.id));
  const newId = uid("st", nodeIds);
  const newNode: RailNode = {
    id: newId,
    name,
    type: "istasyon",
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    dwell: 20,
  };

  // Segmentleri d konumunda böl
  const segsA: EdgeSegment[] = [];
  const segsB: EdgeSegment[] = [];
  for (const s of edge.segments) {
    if (s.end <= d) segsA.push({ ...s });
    else if (s.start >= d) segsB.push({ start: s.start - d, end: s.end - d, vmax: s.vmax, gradient: s.gradient });
    else {
      segsA.push({ start: s.start, end: d, vmax: s.vmax, gradient: s.gradient });
      segsB.push({ start: 0, end: s.end - d, vmax: s.vmax, gradient: s.gradient });
    }
  }
  const fb = edge.segments[0];
  const lb = edge.segments[edge.segments.length - 1];
  if (segsA.length === 0) segsA.push({ start: 0, end: d, vmax: fb.vmax, gradient: fb.gradient });
  if (segsB.length === 0) segsB.push({ start: 0, end: edge.length - d, vmax: lb.vmax, gradient: lb.gradient });

  const edgeIds = new Set(net.edges.map((e) => e.id));
  const idA = uid("e", edgeIds);
  edgeIds.add(idA);
  const idB = uid("e", edgeIds);
  const edgeA: RailEdge = { id: idA, from: edge.from, to: newId, length: d, segments: segsA };
  const edgeB: RailEdge = { id: idB, from: newId, to: edge.to, length: edge.length - d, segments: segsB };

  const edges = net.edges.filter((e) => e.id !== edgeId).concat([edgeA, edgeB]);
  const newEdgeIds = route.edgeIds.flatMap((id) => (id === edgeId ? [idA, idB] : [id]));

  return {
    network: { ...net, nodes: [...net.nodes, newNode], edges },
    route: { ...route, edgeIds: newEdgeIds },
  };
}

/** Ara istasyonu siler (etrafındaki iki kenarı birleştirir). Uç düğümler silinemez. */
export function removeStation(
  net: RailNetwork,
  route: Route,
  nodeId: string
): { network: RailNetwork; route: Route } {
  for (let i = 1; i < route.edgeIds.length; i++) {
    const e1 = net.edges.find((e) => e.id === route.edgeIds[i - 1]);
    const e2 = net.edges.find((e) => e.id === route.edgeIds[i]);
    if (e1 && e2 && e1.to === nodeId && e2.from === nodeId) {
      const mId = uid("e", new Set(net.edges.map((e) => e.id)));
      const merged: RailEdge = {
        id: mId,
        from: e1.from,
        to: e2.to,
        length: e1.length + e2.length,
        segments: [
          ...e1.segments.map((s) => ({ ...s })),
          ...e2.segments.map((s) => ({ start: s.start + e1.length, end: s.end + e1.length, vmax: s.vmax, gradient: s.gradient })),
        ],
      };
      const edges = net.edges.filter((e) => e.id !== e1.id && e.id !== e2.id).concat([merged]);
      const nodes = net.nodes.filter((n) => n.id !== nodeId);
      const newEdgeIds = route.edgeIds.flatMap((id, j) => (j === i - 1 ? [mId] : j === i ? [] : [id]));
      return { network: { ...net, nodes, edges }, route: { ...route, edgeIds: newEdgeIds } };
    }
  }
  return { network: net, route };
}
