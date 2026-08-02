// Şebeke şeması — resmî hat diyagramı stili.
// Seçili rota kalın mürekkep çizgi; rota dışı hatlar (depo) soluk kesikli.
// İstasyon adları üstte, km değerleri altta (line'dan).

import type { RailNetwork, Route, Line } from "@/lib/anaray/types";
import { routeEdgeSet } from "@/lib/anaray/network";
import { km } from "@/lib/anaray/format";
import { CK } from "@/lib/anaray/chartkit";

const VBW = 820;
const VBH = 210;

export function NetworkDiagram({ network, route, line }: { network: RailNetwork; route: Route; line?: Line }) {
  const inRoute = routeEdgeSet(route);
  const nodeById = Object.fromEntries(network.nodes.map((n) => [n.id, n]));
  const kmById = Object.fromEntries((line?.stations ?? []).map((s) => [s.id, s.position]));
  // Durak adları çakışmasın diye SOLDAN SAĞA sırayla İKİ SIRAYA dağıtılır (üst/alt);
  // böylece her etikete iki kat yatay alan düşer (yoğun hatta üst üste binmiyor).
  const xSira = new Map([...network.nodes].sort((a, b) => a.x - b.x).map((n, i) => [n.id, i]));

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Şebeke şeması" style={{ fontFamily: CK.sans }}>
      {/* Kenarlar */}
      {network.edges.map((e) => {
        const a = nodeById[e.from];
        const b = nodeById[e.to];
        if (!a || !b) return null;
        const on = inRoute.has(e.id);
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={on ? CK.ink : CK.faint}
            strokeWidth={on ? 5 : 2}
            strokeDasharray={on ? undefined : "5 4"}
            strokeLinecap="round"
          />
        );
      })}

      {/* Düğümler */}
      {network.nodes.map((n) => {
        const istasyon = n.type === "istasyon";
        const konum = kmById[n.id];
        return (
          <g key={n.id}>
            {istasyon ? (
              <circle cx={n.x} cy={n.y} r={6} fill={CK.surface} stroke={CK.ink} strokeWidth={3} />
            ) : (
              // hat başı / makas: içi dolu kare
              <rect x={n.x - 4} y={n.y - 4} width={8} height={8} fill={CK.muted} />
            )}
            {/* İki sıralı kaydırma: çift sıra üstte (y-13), tek sıra daha yukarıda (y-28) */}
            <text x={n.x} y={n.y - ((xSira.get(n.id) ?? 0) % 2 === 0 ? 13 : 28)} fill={istasyon ? CK.ink : CK.muted} fontSize={11} fontWeight={istasyon ? 600 : 400} textAnchor="middle">
              {n.name}
            </text>
            {konum !== undefined ? (
              <text x={n.x} y={n.y + 20} fill={CK.faint} fontSize={9.5} textAnchor="middle" className="font-mono">
                {km(konum)}
              </text>
            ) : (
              n.type !== "istasyon" && (
                <text x={n.x} y={n.y + 20} fill={CK.faint} fontSize={9} textAnchor="middle">
                  {n.type}
                </text>
              )
            )}
          </g>
        );
      })}

      {/* Alt ölçek etiketi */}
      <text x={VBW - 8} y={VBH - 6} fill={CK.faint} fontSize={9.5} textAnchor="end" className="font-mono">
        km
      </text>
    </svg>
  );
}
