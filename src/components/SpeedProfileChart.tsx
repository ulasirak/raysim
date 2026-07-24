// Hız Profili: hat boyunca (konuma göre) trenin hızı ve hız limiti.
// Yatay: konum (km), Dikey: hız (km/h). Basamaklı çizgi = limit, dolu çizgi = fiili hız.

import type { Line, SimResult } from "@/lib/anaray/types";
import { kmh, km } from "@/lib/anaray/format";
import { CK } from "@/lib/anaray/chartkit";

const VBW = 820;
const VBH = 300;
const PAD = { top: 20, right: 24, bottom: 40, left: 52 };

export function SpeedProfileChart({ line, result }: { line: Line; result: SimResult }) {
  const plotW = VBW - PAD.left - PAD.right;
  const plotH = VBH - PAD.top - PAD.bottom;

  const vmaxKmh = Math.max(...line.segments.map((s) => kmh(s.vmax))) * 1.15;

  const xFor = (s: number) => PAD.left + (s / line.length) * plotW;
  const yFor = (vk: number) => PAD.top + plotH - (vk / vmaxKmh) * plotH;

  const speedPts = result.points.map((p) => `${xFor(p.s).toFixed(1)},${yFor(kmh(p.v)).toFixed(1)}`).join(" ");
  const areaPts = `${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} ${speedPts} ${xFor(line.length).toFixed(1)},${yFor(0).toFixed(1)}`;

  const limitPts: string[] = [];
  for (const seg of line.segments) {
    limitPts.push(`${xFor(seg.start).toFixed(1)},${yFor(kmh(seg.vmax)).toFixed(1)}`);
    limitPts.push(`${xFor(seg.end).toFixed(1)},${yFor(kmh(seg.vmax)).toFixed(1)}`);
  }

  const yTicks = [0, 20, 40, 60].filter((v) => v <= vmaxKmh);

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Hız profili" style={{ fontFamily: CK.sans }}>
      <defs>
        <linearGradient id="sp-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CK.blue} stopOpacity={0.18} />
          <stop offset="100%" stopColor={CK.blue} stopOpacity={0} />
        </linearGradient>
      </defs>

      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} y1={yFor(v)} x2={PAD.left + plotW} y2={yFor(v)} stroke={CK.grid} strokeWidth={1} />
          <text x={PAD.left - 8} y={yFor(v) + 4} fill={CK.muted} fontSize={10} textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>{v}</text>
        </g>
      ))}
      <line x1={PAD.left} y1={yFor(0)} x2={PAD.left + plotW} y2={yFor(0)} stroke={CK.baseline} strokeWidth={1} />

      {line.stations.map((st) => (
        <line key={st.id} x1={xFor(st.position)} y1={PAD.top} x2={xFor(st.position)} y2={PAD.top + plotH} stroke={CK.grid} strokeWidth={1} strokeDasharray="2 4" />
      ))}

      {/* Fiili hız alanı + eğrisi */}
      <polygon points={areaPts} fill="url(#sp-grad)" />
      <polyline points={limitPts.join(" ")} fill="none" stroke={CK.red} strokeWidth={1.4} strokeDasharray="4 3" strokeLinecap="round" opacity={0.75} />
      <polyline points={speedPts} fill="none" stroke={CK.blue} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />

      <text x={PAD.left + plotW / 2} y={VBH - 4} fill={CK.muted} fontSize={10} textAnchor="middle">Konum: 0 – {km(line.length)} km</text>
      <text x={14} y={PAD.top + plotH / 2} fill={CK.muted} fontSize={10} textAnchor="middle" transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}>Hız (km/h)</text>
      <text x={PAD.left + plotW} y={PAD.top + 2} fill={CK.muted} fontSize={9} textAnchor="end"><tspan fill={CK.red}>╌ limit</tspan>  <tspan fill={CK.blue}>▬ fiili</tspan></text>
    </svg>
  );
}
