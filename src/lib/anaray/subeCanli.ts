// raysim — ŞUBE CANLI MEKİK YÖRÜNGESİ (dallanma canlı sim, #1 Katman-2C)
//
// Canlı Ağ'da şube artık "ölü" statik çizgi değil: kavşak ↔ şube ucu arasında GERÇEK
// tren işletir. Motor-güdümlü: şubenin kendi ring zinciri bir hat gibi düzleştirilir ve
// trunk ile AYNI loopYorunge çekirdeğiyle (fizik + terminal turnback) bir mekik yörüngesi
// üretilir. Render tarafı bunu yalnızca saat t'den türetir → yeni zamanlayıcı/ref YOK
// (freeze güvenli; tespit render'da değil).
//
// ADDITIVE: şube yoksa boş dizi döner → trunk canlı sim aynen (golden korunur).

import type { RailNetwork, Route, RollingStock } from "./types";
import type { SimConfig, Isletme } from "./config";
import { etkinArac } from "./config";
import type { Sube } from "./ring";
import { flattenRoute } from "./network";
import { loopYorunge, reverseRoute, type LoopYorunge } from "./signalling";
import { simulate } from "./sim";
import { subeIsletme } from "./ortakKesim";

export interface SubeCanli {
  subeId: string;
  ad: string;
  /** Şube çoklu-çizgi düğümleri (kavşaktan uca): arc-length fp + ağ düğüm id'si + durak adı.
   *  Şematik render x/y'yi nodeById[id]'den; coğrafi render lat/lon'u durak ADIYLA çözer. */
  noktalar: { fp: number; id: string; ad: string }[];
  /** Mekik yörüngesi (trunk loopVeri ile aynı şekil) + kaç tren, hangi aralıkla. */
  loop: LoopYorunge & { count: number; offset: number };
}

/**
 * Her şube için kavşak↔uç mekik yörüngesini üretir. `subeRotalar` ringlerdenSebeke'den;
 * şube-özel kenarlar (se_*) alınır, kavşak düğümünden düzleştirilir ve loopYorunge koşulur.
 * Tren sayısı: servisTren girildiyse onu (≤6 vitrin tavanı), yoksa 1 (kolun çalıştığını
 * gösteren tek mekik). Uydurma yok — hız/süre motor fiziğinden.
 */
export function subeCanliYorungeler(
  net: RailNetwork,
  subeRotalar: { id: string; ad: string; route: Route }[],
  subeler: Sube[],
  stock: RollingStock,
  cfg: SimConfig,
  isletme: Isletme,
): SubeCanli[] {
  if (!subeRotalar?.length) return [];
  const stockSim = etkinArac(stock, cfg);
  const edgeById = Object.fromEntries(net.edges.map((e) => [e.id, e]));
  const out: SubeCanli[] = [];

  for (const sr of subeRotalar) {
    const sube = subeler.find((s) => s.id === sr.id);
    if (!sube) continue;
    // Yalnız şube kenarları (se_*) — kavşaktan uca mekik (trunk kısmı dışlanır).
    const seIds = sr.route.edgeIds.filter((id) => id.startsWith("se_"));
    if (!seIds.length) continue;
    const ilk = edgeById[seIds[0]];
    if (!ilk) continue;
    const branchRoute: Route = { id: `mekik_${sr.id}`, name: sr.ad, edgeIds: seIds, startNodeId: ilk.from };

    const gidis = flattenRoute(net, branchRoute);
    const donus = flattenRoute(net, reverseRoute(branchRoute));
    if (gidis.stations.length < 2) continue;
    // Hat modelini ısıt (trunk ile birebir) — loopYorunge tutarlı fizik üretsin.
    simulate(gidis, stockSim, 0.5);
    simulate(donus, stockSim, 0.5);

    // Turnback peron işgali: kavşak ucu = hat başı terminali gibi; şube ucu = şubenin
    // kendi terminali (yoksa ana hat terminalSon) — subeIsletme tek kaynak.
    const si = subeIsletme(isletme, sube);
    const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
    const peronSon = si.terminalSon.tip === "dongu" ? 0 : (si.terminalSon.peronIsgali || 0);
    const ly = loopYorunge(gidis, donus, stockSim, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon });

    const count = Math.max(1, Math.min(Math.round(sube.servisTren ?? 1), 6));
    out.push({
      subeId: sube.id,
      ad: sube.ad || sr.ad,
      noktalar: gidis.stations.map((s) => ({ fp: s.position, id: s.id, ad: s.name })),
      loop: { ...ly, count, offset: ly.periyot / count },
    });
  }
  return out;
}
