// anaray — şebeke (graf) yardımcıları
//
// flattenRoute: bir rotayı (sıralı kenarlar) fizik motorunun anladığı düz
// Line'a (koridor) çevirir. Kenarlar rota yönünde yürünür; ters yönde
// geçilen kenarda parça offsetleri çevrilir ve EĞİM İŞARETİ döner.

import type {
  RailNetwork,
  Route,
  RailNode,
  RailEdge,
  Line,
  Station,
  TrackSegment,
} from "./types";
import type { SimConfig } from "./config";
import { BELGE, ringToLine, type DurakArasiRing } from "./ring";

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
      stations.push({ id: n.id, name: n.name, position: pos, dwell: n.dwell ?? 0, depot: n.depot, queued: n.queued });
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
      depot: son?.depot,
      queued: son?.queued,
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

// ————————————————————————————————————————————————
// Proje hattı (ring zinciri) → graf şebekesi
// ————————————————————————————————————————————————

/**
 * Paylaşılan proje hattını (durak-arası ring zinciri) Sefer modülünün graf
 * modeline çevirir: her ring bir kenar, her durak bir düğüm. Segmentler
 * `ringToLine` ile üretilir → makas/hemzemin/tehlike hız kısıtları ve eğim
 * ring editöründe girildiği gibi korunur.
 *
 * Böylece Sefer modülü de Ringler/Tam Hat/Belgeler ile AYNI hattı gösterir;
 * ayrı bir örnek şebeke yoktur.
 */
export function ringlerdenSebeke(
  rings: DurakArasiRing[],
  cfg: SimConfig = BELGE,
  hatAdi = "Proje Hattı"
): { network: RailNetwork; route: Route } | null {
  if (rings.length === 0) return null;

  const nodes: RailNode[] = [];
  const edges: RailEdge[] = [];
  const toplam = rings.reduce((a, r) => a + Math.max(1, r.uzunluk), 0);
  const X0 = 60, X1 = 760, Y = 70;

  // Düğümler ring SINIRLARINDAN üretilir (`dg0..dgN`), ring'in kendi durak id'sinden
  // DEĞİL: komşu iki ring aynı durağı paylaşsa bile ayrı id taşıyabilir
  // (`yeniRing` her hücreye taze id verir) → id'ye güvenilirse zincir kopar.
  const dugumId = (i: number) => `dg${i}`;
  const dugumEkle = (i: number, ad: string, dwell: number, konum: number) => {
    nodes.push({
      id: dugumId(i), name: ad, type: "istasyon",
      x: X0 + (X1 - X0) * (toplam > 0 ? konum / toplam : 0), y: Y, dwell,
    });
  };

  dugumEkle(0, rings[0].fromAd, 0, 0);
  let kumul = 0;
  rings.forEach((ring, i) => {
    const alt = ringToLine(ring, "nominal", cfg); // uzunluk + segment kısıtları
    kumul += alt.length;
    dugumEkle(i + 1, ring.toAd, ring.dwell, kumul);
    edges.push({
      id: `rg${i + 1}`,
      from: dugumId(i),
      to: dugumId(i + 1),
      length: alt.length,
      segments: alt.segments.map((s) => ({ start: s.start, end: s.end, vmax: s.vmax, gradient: s.gradient })),
    });
  });

  const ilk = rings[0].fromAd;
  const son = rings[rings.length - 1].toAd;
  return {
    network: { id: "sebeke_proje", name: hatAdi, nodes, edges },
    route: {
      id: "rota_proje",
      name: `${ilk} → ${son}`,
      edgeIds: edges.map((e) => e.id),
      startNodeId: dugumId(0), // kapalı hatta uç-tahmini belirsizleşir
    },
  };
}
