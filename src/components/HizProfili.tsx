"use client";

// raysim — HIZ PROFİLİ v(x): hat boyunca (gidiş legi) tramvayın gerçek hızı + hız-limiti
// zarfı. OpenTrack'in "speed vs distance" grafiğinin muadili. Gerçek hız, canlı sim ile
// AYNI loop yörüngesinden ds/dt ile türetilir; limit, hat segmentlerinin vmax'ından çizilir.
// Nerede hızlanma/frenleme, nerede limitin bağladığı (istasyon/makas/viraj) görünür.
// (Eğim/enerji YOK — yalnız hız.)

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import type { LoopYorunge } from "@/lib/anaray/signalling";
import type { Line } from "@/lib/anaray/types";

export function HizProfili({ loop, line }: { loop: LoopYorunge; line: Line }) {
  const veri = useMemo(() => {
    const L = loop.L, orn = loop.ornekler;
    if (L <= 0 || orn.length < 2) return null;
    // Gidiş legi (s ≤ L): gerçek hız = ds/dt (m/s).
    const hiz: { s: number; v: number }[] = [];
    for (let i = 1; i < orn.length; i++) {
      if (orn[i].s > L + 1e-6) break;
      const dt = orn[i].t - orn[i - 1].t;
      const v = dt > 1e-6 ? Math.max(0, (orn[i].s - orn[i - 1].s) / dt) : 0;
      hiz.push({ s: orn[i].s, v });
    }
    if (hiz.length < 2) return null;
    const vmaxTop = Math.max(...line.segments.map((sg) => sg.vmax), ...hiz.map((p) => p.v), 1) * 3.6; // km/h
    return { L, hiz, vTop: Math.ceil((vmaxTop + 3) / 10) * 10 };
  }, [loop, line]);

  if (!veri) return null;
  const { L, hiz, vTop } = veri;
  const duraklar = line.stations.filter((s) => s.tip !== "gecit").map((s) => ({ ad: s.name, pos: s.position }));

  const W = 860, H = 250, padL = 44, padR = 14, padT = 20, padB = 40;
  const pw = W - padL - padR, ph = H - padT - padB;
  const X = (s: number) => padL + (s / L) * pw;
  const Y = (vkmh: number) => padT + (1 - vkmh / vTop) * ph;

  // Hız-limiti zarfı (segment vmax basamakları).
  const limitYol = line.segments.map((sg, i) => {
    const y = Y(sg.vmax * 3.6);
    return `${i === 0 ? "M" : "L"}${X(sg.start).toFixed(1)},${y.toFixed(1)} L${X(sg.end).toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  // Gerçek hız eğrisi.
  const hizYol = hiz.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.s).toFixed(1)},${Y(p.v * 3.6).toFixed(1)}`).join(" ");
  // Y ekseni km/h işaretleri — her 10 km/h (sık).
  const yIsaret = Array.from({ length: Math.floor(vTop / 10) + 1 }, (_, i) => i * 10);
  // X ekseni km işaretleri — her ~1 km (sık, en çok 26 etiket).
  const kmSay = Math.max(2, Math.min(26, Math.round(L / 1000)));
  const xIsaret = Array.from({ length: kmSay + 1 }, (_, i) => (L * i) / kmSay);

  return (
    <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="min-w-[680px] sm:min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Hız profili — hat boyunca hız">
          {/* Y ızgara + km/h */}
          {yIsaret.map((v) => (
            <g key={v}>
              <line x1={padL} y1={Y(v)} x2={padL + pw} y2={Y(v)} stroke={CK.track} strokeWidth={0.7} />
              <text x={padL - 5} y={Y(v) + 2.5} textAnchor="end" fontSize={7.5} fill={brand.muted}>{v}</text>
            </g>
          ))}
          {/* İstasyon dikey işaretleri */}
          {duraklar.map((d, i) => (
            <line key={i} x1={X(d.pos)} y1={padT} x2={X(d.pos)} y2={padT + ph} stroke={CK.track} strokeWidth={0.6} strokeOpacity={0.8} />
          ))}
          {/* X ekseni + km */}
          <line x1={padL} y1={padT + ph} x2={padL + pw} y2={padT + ph} stroke={brand.border} strokeWidth={1} />
          {xIsaret.map((s, i) => (
            <text key={i} x={X(s)} y={padT + ph + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{(s / 1000).toFixed(1)}</text>
          ))}
          {/* Hız-limiti zarfı (gri kesikli) + gerçek hız (mavi) */}
          <path d={limitYol} fill="none" stroke={brand.muted} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.8} />
          <path d={hizYol} fill="none" stroke={CK.blue} strokeWidth={1.4} strokeLinejoin="round" />
          {/* Eksen başlıkları */}
          <text x={padL + pw / 2} y={H - 3} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft}>Mesafe (km) →</text>
          <text x={11} y={padT + ph / 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 11 ${padT + ph / 2})`}>Hız (km/h) ↑</text>
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
          <span><span style={{ color: CK.blue }}>▬</span> Gerçek hız (gidiş)</span>
          <span><span style={{ color: brand.muted }}>╌</span> Hız limiti (segment vmax)</span>
          <span>Dip noktaları = istasyon duruşları · limitin altındaki kısım = hızlanma/frenleme</span>
        </div>
      </div>
    </div>
  );
}
