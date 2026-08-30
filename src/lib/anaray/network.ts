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
  const dugumEkle = (i: number, ad: string, dwell: number, konum: number, depot?: boolean, queued?: number) => {
    nodes.push({
      id: dugumId(i), name: ad, type: "istasyon",
      x: X0 + (X1 - X0) * (toplam > 0 ? konum / toplam : 0), y: Y, dwell, depot, queued,
    });
  };

  // Başlangıç durağı deposu ilk ringde (fromDepot/fromQueued) taşınır — origin'in
  // kendi ringi yoktur. Diğer duraklar, kendilerine VARAN ringin depot/queued'ıyla.
  dugumEkle(0, rings[0].fromAd, 0, 0, rings[0].fromDepot, rings[0].fromQueued);
  let kumul = 0;
  rings.forEach((ring, i) => {
    const alt = ringToLine(ring, "nominal", cfg); // uzunluk + segment kısıtları
    kumul += alt.length;
    dugumEkle(i + 1, ring.toAd, ring.dwell, kumul, ring.depot, ring.queued);
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

// ————————————————————————————————————————————————
// Hemzemin geçit KORUMA DURUŞLARI (canlı sim + sinyal)
// ————————————————————————————————————————————————
// Karayolu geçidinde `bekleme > 0` ise: tren o noktada gerçek bir DURUŞ yapar
// (yavaşla → dur → bekle → kalk). Duruş noktası aynı zamanda blok sınırı olur →
// orada koruyucu sinyal belirir (dolu bloğa girmeden kırmızıda durur). Böylece
// "işlevli koruyucu sinyal" ve fiziksel durma tek modelden gelir.

/** Bekleme > 0 olan karayolu geçitlerinin hat-boyu konumları (ileri yön). */
export function hemzeminDuruslari(
  rings: DurakArasiRing[], cfg: SimConfig = BELGE,
): { pos: number; dwell: number; name: string }[] {
  const out: { pos: number; dwell: number; name: string }[] = [];
  let offset = 0;
  for (const r of rings) {
    const L = ringToLine(r, "nominal", cfg).length;
    for (const h of r.hemzeminler) {
      const b = Math.max(0, h.bekleme ?? 0);
      if (b > 0 && (h.tip === "karayolu" || h.tip === undefined)) {
        const k = Math.max(0, Math.min(r.uzunluk, h.konum));
        out.push({ pos: offset + k * (L / Math.max(1, r.uzunluk)), dwell: b, name: h.ad || "Geçit" });
      }
    }
    offset += L;
  }
  return out;
}

/** Geçit koruma duruşlarını bir Line'ın istasyon listesine ekler (tip:'gecit').
 *  `reverse` = ters yön hattı (konumlar aynalanır). */
export function duruslariEkle(
  line: Line, duruslar: { pos: number; dwell: number; name: string }[], reverse = false,
): Line {
  if (duruslar.length === 0) return line;
  const extra: Station[] = duruslar.map((d, i) => ({
    id: `gecit_${reverse ? "d" : "g"}${i}`,
    name: d.name,
    position: reverse ? line.length - d.pos : d.pos,
    dwell: d.dwell,
    tip: "gecit" as const,
  })).filter((s) => s.position > 1 && s.position < line.length - 1); // uçlardaki durakla çakışmasın
  const stations = [...line.stations, ...extra].sort((a, b) => a.position - b.position);
  return { ...line, stations };
}

/** Canlı sim için: her yolcu istasyonunun dwell'ine kalkış ölü zamanını ekler
 *  (start-up lost time animasyonda da görünsün → kapasiteyle tutarlı). Geçit
 *  duruşlarına (tip:'gecit') dokunmaz. globalSu = hat geneli varsayılan (s). */
export function kalkisEkle(line: Line, globalSu: number): Line {
  const su = Math.max(0, globalSu);
  if (su <= 0) return line;
  return { ...line, stations: line.stations.map((st) => (st.tip === "gecit" ? st : { ...st, dwell: st.dwell + su })) };
}

/** Makas (kavşak) merkezlerinin hat-boyu konumları (ileri yön) — kavşak sinyalleri için. */
export function makasKonumlari(
  rings: DurakArasiRing[], cfg: SimConfig = BELGE,
): { pos: number; ad: string }[] {
  const out: { pos: number; ad: string }[] = [];
  let offset = 0;
  for (const r of rings) {
    const L = ringToLine(r, "nominal", cfg).length;
    for (const m of r.makaslar) {
      const k = Math.max(0, Math.min(r.uzunluk, m.konum));
      out.push({ pos: offset + k * (L / Math.max(1, r.uzunluk)), ad: m.ad || "Makas" });
    }
    offset += L;
  }
  return out;
}

/** Canlı sim görseli için TÜM hat özellikleri (hemzemin geçit tipleriyle + makas),
 *  hat-boyu konumlarıyla. Görsel işaretler bu tek kaynaktan çizilir. */
export type HatOzellik = {
  pos: number;
  kind: "yaya" | "karayolu" | "makas";
  ad: string;
  bekleme: number;        // s — karayolu geçidinde durma (0 = durmadan yavaşlar)
  makasTip?: string;      // makas ise tipi (karsilasmali/headway/…)
};
export function hatOzellikleri(
  rings: DurakArasiRing[], cfg: SimConfig = BELGE,
): HatOzellik[] {
  const out: HatOzellik[] = [];
  let offset = 0;
  for (const r of rings) {
    const L = ringToLine(r, "nominal", cfg).length;
    const scale = L / Math.max(1, r.uzunluk);
    for (const h of r.hemzeminler) {
      const pos = offset + Math.max(0, Math.min(r.uzunluk, h.konum)) * scale;
      const yaya = h.tip === "yaya";
      out.push({ pos, kind: yaya ? "yaya" : "karayolu", ad: h.ad || (yaya ? "Yaya geçidi" : "Karayolu geçidi"), bekleme: Math.max(0, h.bekleme ?? 0) });
    }
    for (const m of r.makaslar) {
      const pos = offset + Math.max(0, Math.min(r.uzunluk, m.konum)) * scale;
      out.push({ pos, kind: "makas", ad: m.ad || "Makas", bekleme: 0, makasTip: m.tip });
    }
    offset += L;
  }
  return out;
}
