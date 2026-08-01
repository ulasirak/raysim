// raysim — graf düzenleme (istasyon ekle/sil).
//
// Değişmez (invariant): editör tabanı proje hattı (ringlerdenSebeke) TÜM kenarları
// ileri yönde gezer (tren edge.from'dan girer). Ekle/sil bu ileri-yönlülüğü korur:
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

/**
 * İstasyon siler. İç istasyon → iki komşu kenarı birleştirir (hat boyu korunur).
 * Uç istasyon (baş/son) → o kenarı düşürür (hat o kadar kısalır). En az iki durak
 * kalmalı (route ≥1 kenar), aksi halde işlem yapılmaz.
 */
export function removeStation(
  net: RailNetwork,
  route: Route,
  nodeId: string
): { network: RailNetwork; route: Route } {
  // — İç istasyon: iki kenarı birleştir —
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

  // — Uç istasyon: baştaki/sondaki kenarı düşür (en az bir kenar kalmalı) —
  if (route.edgeIds.length >= 2) {
    const firstEdge = net.edges.find((e) => e.id === route.edgeIds[0]);
    const lastEdge = net.edges.find((e) => e.id === route.edgeIds[route.edgeIds.length - 1]);
    const startNode = route.startNodeId ?? firstEdge?.from;
    // Baş uç: startNode = firstEdge.from (ileri zincir) → düşür, yeni başlangıç firstEdge.to
    if (firstEdge && startNode === nodeId && firstEdge.from === nodeId) {
      return {
        network: { ...net, nodes: net.nodes.filter((n) => n.id !== nodeId), edges: net.edges.filter((e) => e.id !== firstEdge.id) },
        route: { ...route, edgeIds: route.edgeIds.slice(1), startNodeId: firstEdge.to },
      };
    }
    // Son uç: lastEdge.to = son düğüm → düşür
    if (lastEdge && lastEdge.to === nodeId) {
      return {
        network: { ...net, nodes: net.nodes.filter((n) => n.id !== nodeId), edges: net.edges.filter((e) => e.id !== lastEdge.id) },
        route: { ...route, edgeIds: route.edgeIds.slice(0, -1) },
      };
    }
  }
  return { network: net, route };
}

/**
 * Hattın başına ("start") veya sonuna ("end") yeni bir uç istasyon ekler → hattı
 * uzatır. Yeni kenar, komşu uç kenarın uzunluğu/hız limitini örnek alır (eğim 0).
 * İleri-yön değişmezliği korunur: başa eklerken yeni→eskiBaş, sona eklerken eskiSon→yeni.
 */
export function addTerminalStation(
  net: RailNetwork,
  route: Route,
  where: "start" | "end",
  name: string
): { network: RailNetwork; route: Route } {
  if (route.edgeIds.length === 0) return { network: net, route };
  const newId = uid("st", new Set(net.nodes.map((n) => n.id)));
  const newEdgeId = uid("e", new Set(net.edges.map((e) => e.id)));

  if (where === "start") {
    const firstEdge = net.edges.find((e) => e.id === route.edgeIds[0]);
    if (!firstEdge) return { network: net, route };
    const startNode = net.nodes.find((n) => n.id === (route.startNodeId ?? firstEdge.from));
    const secondNode = net.nodes.find((n) => n.id === firstEdge.to);
    if (!startNode || !secondNode) return { network: net, route };
    const len = firstEdge.length || 1000;
    const seg = firstEdge.segments[0];
    const newNode: RailNode = { id: newId, name, type: "istasyon", x: 2 * startNode.x - secondNode.x, y: startNode.y, dwell: 20 };
    const newEdge: RailEdge = { id: newEdgeId, from: newId, to: startNode.id, length: len, segments: [{ start: 0, end: len, vmax: seg?.vmax ?? 22, gradient: 0 }] };
    return {
      network: { ...net, nodes: [...net.nodes, newNode], edges: [...net.edges, newEdge] },
      route: { ...route, edgeIds: [newEdgeId, ...route.edgeIds], startNodeId: newId },
    };
  }

  const lastEdge = net.edges.find((e) => e.id === route.edgeIds[route.edgeIds.length - 1]);
  if (!lastEdge) return { network: net, route };
  const lastNode = net.nodes.find((n) => n.id === lastEdge.to);
  const prevNode = net.nodes.find((n) => n.id === lastEdge.from);
  if (!lastNode || !prevNode) return { network: net, route };
  const len = lastEdge.length || 1000;
  const seg = lastEdge.segments[lastEdge.segments.length - 1];
  const newNode: RailNode = { id: newId, name, type: "istasyon", x: 2 * lastNode.x - prevNode.x, y: lastNode.y, dwell: 20 };
  const newEdge: RailEdge = { id: newEdgeId, from: lastNode.id, to: newId, length: len, segments: [{ start: 0, end: len, vmax: seg?.vmax ?? 22, gradient: 0 }] };
  return {
    network: { ...net, nodes: [...net.nodes, newNode], edges: [...net.edges, newEdge] },
    route: { ...route, edgeIds: [...route.edgeIds, newEdgeId] },
  };
}
