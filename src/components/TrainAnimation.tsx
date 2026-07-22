"use client";

// Canlı animasyon: trenin hat üzerindeki hareketi (dikey hat + istasyon noktaları),
// oynat/duraklat, zaman çubuğu ve hız çarpanı. Yörüngeden zamanla örnekleme yapar.

import { useEffect, useRef, useState } from "react";
import type { Line, SimResult, RollingStock, Regime } from "@/lib/anaray/types";
import { sampleAt } from "@/lib/anaray/sim";
import { kmh, km, saat } from "@/lib/anaray/format";
import { brand, rejimRenk } from "@/lib/anaray/brand";

const VBW = 240;
const PAD_Y = 28;

const REJIM_AD: Record<Regime, string> = {
  hizlanma: "Hızlanma",
  seyir: "Seyir",
  yavaslama: "Yavaşlama",
  durak: "Durakta",
};

const HIZLAR = [1, 2, 5, 10];

export function TrainAnimation({ line, result, stock }: { line: Line; result: SimResult; stock: RollingStock }) {
  const [simT, setSimT] = useState(0);
  const [oynat, setOynat] = useState(false);
  const [carpan, setCarpan] = useState(5);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const T = result.totalTime || 1;

  useEffect(() => {
    if (!oynat) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setSimT((prev) => {
        const next = prev + dt * carpan;
        if (next >= T) {
          setOynat(false);
          return T;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [oynat, carpan, T]);

  const cur = sampleAt(result.points, simT);
  const trackH = 460;
  const yFor = (s: number) => PAD_Y + (s / line.length) * (trackH - 2 * PAD_Y);
  const cx = VBW / 2;

  const oynatDurdur = () => {
    if (simT >= T) setSimT(0);
    setOynat((o) => !o);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
        {/* Hat çizimi */}
        <svg viewBox={`0 0 ${VBW} ${trackH}`} className="h-[460px] w-auto shrink-0" role="img" aria-label="Hat animasyonu">
          <line x1={cx} y1={PAD_Y} x2={cx} y2={trackH - PAD_Y} stroke={brand.borderStrong} strokeWidth={4} strokeLinecap="round" />
          {line.stations.map((st) => (
            <g key={st.id}>
              <circle cx={cx} cy={yFor(st.position)} r={5} fill={brand.surface} stroke={brand.muted} strokeWidth={2} />
              <text x={cx + 14} y={yFor(st.position) + 4} fill={brand.inkSoft} fontSize={11}>
                {st.name}
              </text>
            </g>
          ))}
          {/* Tren */}
          <g transform={`translate(${cx}, ${yFor(cur.s)})`}>
            <rect x={-9} y={-6} width={18} height={12} rx={2} fill={rejimRenk[cur.regime]} stroke={brand.surface} strokeWidth={1.5} />
          </g>
        </svg>

        {/* Anlık değerler */}
        <div className="flex flex-col justify-center gap-3 text-sm">
          <Deger etiket="Zaman" deger={saat(simT)} />
          <Deger etiket="Konum" deger={`${km(cur.s)} km`} />
          <Deger etiket="Hız" deger={`${kmh(cur.v).toFixed(1)} km/h`} vurgu />
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: rejimRenk[cur.regime] }} />
            <span style={{ color: brand.inkSoft }}>{REJIM_AD[cur.regime]}</span>
          </div>
        </div>
      </div>

      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={oynatDurdur}
          className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          style={{ background: brand.ink }}
        >
          {oynat ? "⏸ Duraklat" : simT >= T ? "↻ Baştan" : "▶ Oynat"}
        </button>

        <div className="flex items-center gap-1">
          {HIZLAR.map((h) => (
            <button
              key={h}
              onClick={() => setCarpan(h)}
              className="rounded px-2 py-1 text-xs font-medium transition"
              style={
                carpan === h
                  ? { background: brand.ink, color: "#fff" }
                  : { background: "#EDF0F3", color: brand.inkSoft }
              }
            >
              {h}×
            </button>
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={T}
          step={0.1}
          value={simT}
          onChange={(e) => {
            setOynat(false);
            setSimT(parseFloat(e.target.value));
          }}
          className="min-w-[160px] flex-1"
          style={{ accentColor: brand.red }}
          aria-label="Zaman çubuğu"
        />
      </div>
      <p className="text-xs" style={{ color: brand.muted }}>{stock.name}</p>
    </div>
  );
}

function Deger({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <div>
      <div className="field-label">{etiket}</div>
      <div
        className="font-mono tabular-nums"
        style={vurgu ? { fontSize: "1.5rem", color: brand.red } : { fontSize: "1.05rem", color: brand.ink }}
      >
        {deger}
      </div>
    </div>
  );
}
