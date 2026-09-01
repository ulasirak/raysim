"use client";

// raysim — HIZ PROFİLİ v(x): hat boyunca (gidiş legi) tramvayın gerçek hızı + hız-limiti
// zarfı. OpenTrack'in "speed vs distance" grafiğinin muadili. Gerçek hız, canlı sim ile
// AYNI loop yörüngesinden ds/dt ile türetilir; limit, hat segmentlerinin vmax'ından çizilir.
// Nerede hızlanma/frenleme, nerede limitin bağladığı (istasyon/makas/viraj) görünür.
// (Eğim/enerji YOK — yalnız hız.)

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { hizDegisimNoktalari, satirYerlesim } from "@/lib/anaray/grafikNoktalar";
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

  const W = 860, H = 264, padL = 44, padR = 14, padT = 20, padB = 54;
  const pw = W - padL - padR, ph = H - padT - padB;
  const X = (s: number) => padL + (s / L) * pw;
  const Y = (vkmh: number) => padT + (1 - vkmh / vTop) * ph;

  // Değişim noktaları (durak / limit değişimi / uçlar) → km etiketi tam o noktada, çakışmasız.
  const noktalar = hizDegisimNoktalari(loop, line);
  const nokRenk = (tip: string) => (tip === "durak" ? CK.red : tip === "limit" ? CK.amber : brand.muted);
  const nokX = noktalar.map((n) => X(n.s));
  const nokSatir = satirYerlesim(nokX, 30, 3);
  const eksenY = padT + ph;

  // Hız-limiti zarfı (segment vmax basamakları).
  const limitYol = line.segments.map((sg, i) => {
    const y = Y(sg.vmax * 3.6);
    return `${i === 0 ? "M" : "L"}${X(sg.start).toFixed(1)},${y.toFixed(1)} L${X(sg.end).toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  // Gerçek hız eğrisi.
  const hizYol = hiz.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.s).toFixed(1)},${Y(p.v * 3.6).toFixed(1)}`).join(" ");
  // Y ekseni km/h işaretleri — her 5 km/h (kısıt hızları 15/25/35 dâhil okunsun).
  const yIsaret = Array.from({ length: Math.floor(vTop / 5) + 1 }, (_, i) => i * 5);

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
          {/* X ekseni */}
          <line x1={padL} y1={eksenY} x2={padL + pw} y2={eksenY} stroke={brand.border} strokeWidth={1} />
          {/* Hız-limiti zarfı (gri kesikli) + gerçek hız (mavi) */}
          <path d={limitYol} fill="none" stroke={brand.muted} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.8} />
          <path d={hizYol} fill="none" stroke={CK.blue} strokeWidth={1.4} strokeLinejoin="round" />
          {/* Değişim noktaları: eğri üstünde nokta + km etiketi (çakışmasız, satırlara dağıtılmış) */}
          {noktalar.map((n, i) => {
            const x = X(n.s), y = Y(n.v * 3.6), ly = eksenY + 11 + nokSatir[i] * 9, renk = nokRenk(n.tip);
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={x} y2={eksenY} stroke={renk} strokeWidth={0.5} strokeOpacity={0.5} />
                <circle cx={x} cy={y} r={1.9} fill={renk} />
                <line x1={x} y1={eksenY} x2={x} y2={ly - 6} stroke={renk} strokeWidth={0.4} strokeOpacity={0.4} />
                <text x={x} y={ly} textAnchor="middle" fontSize={7} fontWeight={n.tip === "durak" ? 600 : 400} fill={renk}>{(n.s / 1000).toFixed(2)}</text>
              </g>
            );
          })}
          {/* Eksen başlıkları */}
          <text x={padL + pw / 2} y={H - 3} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft}>Mesafe (km) →</text>
          <text x={11} y={padT + ph / 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 11 ${padT + ph / 2})`}>Hız (km/h) ↑</text>
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
          <span><span style={{ color: CK.blue }}>▬</span> Gerçek hız (gidiş)</span>
          <span><span style={{ color: brand.muted }}>╌</span> Hız limiti (segment vmax)</span>
          <span>Dip = istasyon duruşu · limitin altı = hızlanma/frenleme</span>
          <span>km etiketleri değişim noktalarında: <span style={{ color: CK.red }}>●</span> durak · <span style={{ color: CK.amber }}>●</span> limit değişimi · <span style={{ color: brand.muted }}>●</span> hat ucu</span>
        </div>
      </div>
    </div>
  );
}
