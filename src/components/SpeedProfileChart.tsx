// Hız Profili: hat boyunca (konuma göre) trenin hızı ve hız limiti.
// Yatay: konum (km), Dikey: hız (km/h). Basamaklı çizgi = limit, dolu çizgi = fiili hız.

import type { Line, SimResult } from "@/lib/anaray/types";
import { kmh, km } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";

const VBW = 820;
const VBH = 300;
const PAD = { top: 20, right: 24, bottom: 40, left: 52 };

const COL = {
  grid: brand.grid,
  limit: brand.limit,
  speed: brand.speed,
  station: brand.borderStrong,
  text: brand.muted,
};

export function SpeedProfileChart({ line, result }: { line: Line; result: SimResult }) {
  const plotW = VBW - PAD.left - PAD.right;
  const plotH = VBH - PAD.top - PAD.bottom;

  const vmaxKmh = Math.max(...line.segments.map((s) => kmh(s.vmax))) * 1.15;

  const xFor = (s: number) => PAD.left + (s / line.length) * plotW;
  const yFor = (vk: number) => PAD.top + plotH - (vk / vmaxKmh) * plotH;

  // Fiili hız eğrisi (konum-hız); duraklardaki bekleme aynı konumda olduğundan atlanır
  const speedPath = result.points.map((p) => `${xFor(p.s).toFixed(1)},${yFor(kmh(p.v)).toFixed(1)}`).join(" ");

  // Hız limiti basamak çizgisi
  const limitPts: string[] = [];
  for (const seg of line.segments) {
    limitPts.push(`${xFor(seg.start).toFixed(1)},${yFor(kmh(seg.vmax)).toFixed(1)}`);
    limitPts.push(`${xFor(seg.end).toFixed(1)},${yFor(kmh(seg.vmax)).toFixed(1)}`);
  }

  const yTicks = [0, 20, 40, 60].filter((v) => v <= vmaxKmh);

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Hız profili">
      {/* Hız ızgarası */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} y1={yFor(v)} x2={PAD.left + plotW} y2={yFor(v)} stroke={COL.grid} strokeWidth={1} />
          <text x={PAD.left - 8} y={yFor(v) + 4} fill={COL.text} fontSize={11} textAnchor="end">
            {v}
          </text>
        </g>
      ))}

      {/* İstasyon işaretleri */}
      {line.stations.map((st) => (
        <line key={st.id} x1={xFor(st.position)} y1={PAD.top} x2={xFor(st.position)} y2={PAD.top + plotH} stroke={COL.station} strokeWidth={1} strokeDasharray="2 4" />
      ))}

      {/* Hız limiti */}
      <polyline points={limitPts.join(" ")} fill="none" stroke={COL.limit} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.8} />

      {/* Fiili hız */}
      <polyline points={speedPath} fill="none" stroke={COL.speed} strokeWidth={2.5} strokeLinejoin="round" />

      {/* Eksen etiketleri */}
      <text x={PAD.left + plotW / 2} y={VBH - 4} fill={COL.text} fontSize={11} textAnchor="middle">
        Konum: 0 – {km(line.length)} km
      </text>
      <text x={14} y={PAD.top + plotH / 2} fill={COL.text} fontSize={11} textAnchor="middle" transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}>
        Hız (km/h)
      </text>
    </svg>
  );
}
