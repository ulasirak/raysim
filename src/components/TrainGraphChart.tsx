// Sefer sıklığı string diyagramı: iki yönlü tren-zaman çizgileri + blok/sinyal ızgarası.
// Gidiş trenleri 0→L (yukarıdan aşağı), dönüş trenleri L→0 (aşağıdan yukarı) — kesişimler
// çift hatta geçiştir. Geciken tren kırmızı. İnce yatay çizgiler = sinyal blok sınırları.

import type { Line } from "@/lib/anaray/types";
import { saat, km } from "@/lib/anaray/format";
import { CK } from "@/lib/anaray/chartkit";

// Hem sinyal (SignalTrain) hem tek-hat (STTrain) trenleri için ortak, gevşek tip.
interface TrainLine {
  index: number;
  points: { t: number; s: number }[];
  delay?: number;
}

const VBW = 820;
const VBH = 440;
const PAD = { top: 24, right: 24, bottom: 40, left: 96 };

export function TrainGraphChart({
  line, blocks, gidis, donus, tMax,
}: {
  line: Line;
  blocks: number[];
  gidis: TrainLine[];
  donus?: TrainLine[];
  tMax: number;
}) {
  const plotW = VBW - PAD.left - PAD.right;
  const plotH = VBH - PAD.top - PAD.bottom;
  const T = tMax || 1;

  const xFor = (t: number) => PAD.left + (t / T) * plotW;
  const yFor = (s: number) => PAD.top + (s / line.length) * plotH;

  const step = niceStep(T / 7);
  const ticks: number[] = [];
  for (let t = 0; t <= T + 0.5; t += step) ticks.push(t);

  const poly = (trains: TrainLine[], transform: (s: number) => number, on: string) =>
    trains.map((tr) => {
      const pts = tr.points.map((p) => `${xFor(p.t).toFixed(1)},${yFor(transform(p.s)).toFixed(1)}`).join(" ");
      const delayed = (tr.delay ?? 0) > 2;
      return (
        <polyline key={`${on}-${tr.index}`} points={pts} fill="none"
          stroke={on} strokeWidth={1.9} opacity={0.9} strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={delayed ? "4 3" : undefined} />
      );
    });

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Sefer sıklığı diyagramı" style={{ fontFamily: CK.sans }}>
      {/* Sinyal blok sınırları (ince) */}
      {blocks.map((s, i) => (
        <line key={`b${i}`} x1={PAD.left} y1={yFor(s)} x2={PAD.left + plotW} y2={yFor(s)} stroke={CK.grid} strokeWidth={1} opacity={0.6} />
      ))}

      {/* Zaman ızgarası */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xFor(t)} y1={PAD.top} x2={xFor(t)} y2={PAD.top + plotH} stroke={CK.grid} strokeWidth={1} />
          <text x={xFor(t)} y={PAD.top + plotH + 20} fill={CK.muted} fontSize={11} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>{saat(t)}</text>
        </g>
      ))}

      {/* İstasyonlar (blok çizgilerinden belirgin) */}
      {line.stations.map((st) => (
        <g key={st.id}>
          <line x1={PAD.left} y1={yFor(st.position)} x2={PAD.left + plotW} y2={yFor(st.position)} stroke={CK.baseline} strokeWidth={1} strokeDasharray="2 4" />
          <text x={PAD.left - 10} y={yFor(st.position) + 4} fill={CK.ink2} fontSize={11} textAnchor="end" fontWeight={600}>{st.name}</text>
          <text x={PAD.left - 10} y={yFor(st.position) + 17} fill={CK.faint} fontSize={9} textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>{km(st.position)} km</text>
        </g>
      ))}

      {/* Trenler */}
      {poly(gidis, (s) => s, CK.blue)}
      {donus && poly(donus, (s) => line.length - s, CK.orange)}

      <text x={PAD.left + plotW / 2} y={VBH - 4} fill={CK.muted} fontSize={10} textAnchor="middle">Zaman (dk:sn)</text>
      <text x={PAD.left + plotW} y={PAD.top - 8} fill={CK.muted} fontSize={9} textAnchor="end">
        <tspan fill={CK.blue}>▬ gidiş</tspan>{donus ? <><tspan>  </tspan><tspan fill={CK.orange}>▬ dönüş</tspan></> : null}<tspan>  </tspan><tspan fill={CK.muted}>╌ gecikmeli</tspan>
      </text>
    </svg>
  );
}

function niceStep(raw: number): number {
  const steps = [30, 60, 120, 180, 300, 600, 900];
  for (const s of steps) if (raw <= s) return s;
  return 1200;
}
