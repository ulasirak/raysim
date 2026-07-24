// Mesafe–Zaman Diyagramı (Bildfahrplan / grafik tarife)
// Yatay: zaman, Dikey: hat boyunca konum. Trenin yörüngesi bir çizgidir;
// yatay çizgiler istasyonları, çizginin eğimi hızı gösterir (düz = durakta bekleme).

import type { Line, SimResult } from "@/lib/anaray/types";
import { saat, km } from "@/lib/anaray/format";
import { CK } from "@/lib/anaray/chartkit";

const VBW = 820;
const VBH = 460;
const PAD = { top: 24, right: 24, bottom: 40, left: 96 };

export function TimeDistanceChart({ line, result }: { line: Line; result: SimResult }) {
  const plotW = VBW - PAD.left - PAD.right;
  const plotH = VBH - PAD.top - PAD.bottom;
  const T = result.totalTime || 1;

  const xFor = (t: number) => PAD.left + (t / T) * plotW;
  const yFor = (s: number) => PAD.top + (s / line.length) * plotH;

  const path = result.points.map((p) => `${xFor(p.t).toFixed(1)},${yFor(p.s).toFixed(1)}`).join(" ");

  // Zaman ekseni işaretleri (yaklaşık 6 adet, 30 sn'nin katı)
  const step = niceStep(T / 6);
  const ticks: number[] = [];
  for (let t = 0; t <= T + 0.5; t += step) ticks.push(t);

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Mesafe-zaman diyagramı" style={{ fontFamily: CK.sans }}>
      {/* Zaman ızgarası */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xFor(t)} y1={PAD.top} x2={xFor(t)} y2={PAD.top + plotH} stroke={CK.grid} strokeWidth={1} />
          <text x={xFor(t)} y={PAD.top + plotH + 20} fill={CK.muted} fontSize={11} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
            {saat(t)}
          </text>
        </g>
      ))}

      {/* İstasyon çizgileri */}
      {line.stations.map((st) => (
        <g key={st.id}>
          <line x1={PAD.left} y1={yFor(st.position)} x2={PAD.left + plotW} y2={yFor(st.position)} stroke={CK.grid} strokeWidth={1} strokeDasharray="2 4" />
          <text x={PAD.left - 10} y={yFor(st.position) + 4} fill={CK.ink2} fontSize={11} textAnchor="end" fontWeight={600}>
            {st.name}
          </text>
          <text x={PAD.left - 10} y={yFor(st.position) + 17} fill={CK.faint} fontSize={9} textAnchor="end" style={{ fontVariantNumeric: "tabular-nums" }}>
            {km(st.position)} km
          </text>
        </g>
      ))}

      {/* Trenin yörüngesi */}
      <polyline points={path} fill="none" stroke={CK.blue} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />

      {/* Eksen etiketi */}
      <text x={PAD.left + plotW / 2} y={VBH - 4} fill={CK.muted} fontSize={10} textAnchor="middle">
        Zaman (dk:sn)
      </text>
    </svg>
  );
}

function niceStep(raw: number): number {
  const steps = [15, 30, 60, 120, 300, 600];
  for (const s of steps) if (raw <= s) return s;
  return 600;
}
