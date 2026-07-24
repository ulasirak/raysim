"use client";

// raysim — CANLI AĞ SİMÜLASYONU ("sim videosu").
// Tüm trenler (gidiş + dönüş) aynı anda hat üzerinde hareket eder; blok işgali
// canlı kırmızıya döner; saat + oynat/duraklat + hız + zaman çubuğu.
// Trenler önceden hesaplanmış yörüngelerden (t→konum) arc-length ile konumlanır.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RailNetwork, Route, Line } from "@/lib/anaray/types";
import type { SignalTrain } from "@/lib/anaray/signalling";
import { saat } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";

const VBW = 860;
const VBH = 230;
const HIZLAR = [1, 5, 15, 30, 60];
const DOWN = "#0C6DB8";

function sampleS(points: { t: number; s: number }[], t: number): { s: number; active: boolean } {
  if (points.length === 0) return { s: 0, active: false };
  const first = points[0];
  const last = points[points.length - 1];
  if (t < first.t - 1e-6) return { s: first.s, active: false };
  if (t > last.t + 1e-6) return { s: last.s, active: false };
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const f = (t - p0.t) / ((p1.t - p0.t) || 1);
      return { s: p0.s + (p1.s - p0.s) * f, active: true };
    }
  }
  return { s: last.s, active: true };
}

export function LiveNetwork({
  network, route, line, blocks, up, down, tMax,
}: {
  network: RailNetwork;
  route: Route;
  line: Line;
  blocks: number[];
  up: SignalTrain[];
  down: SignalTrain[];
  tMax: number;
}) {
  const [t, setT] = useState(0);
  const [oynat, setOynat] = useState(false);
  const [hiz, setHiz] = useState(15);
  const [mounted, setMounted] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const T = tMax || 1;
  const L = line.length;

  useEffect(() => {
    if (!oynat) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const d = (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const nx = prev + d * hiz;
        if (nx >= T) { setOynat(false); return T; }
        return nx;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [oynat, hiz, T]);

  // Mount öncesi dinamik içeriği çizme → SSR/istemci hydration uyumsuzluğu olmaz.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Rota istasyonlarının ekran koordinatı (arc-length taban noktaları)
  const nodeById = useMemo(() => Object.fromEntries(network.nodes.map((n) => [n.id, n])), [network]);
  const basePts = useMemo(
    () => line.stations.map((st) => ({ fp: st.position, x: nodeById[st.id]?.x ?? 0, y: nodeById[st.id]?.y ?? 0 })),
    [line, nodeById]
  );

  if (!mounted) {
    return <div className="h-[240px] w-full animate-pulse rounded-md" style={{ background: "#EDF0F3" }} aria-hidden />;
  }

  const screenAt = (fp: number) => {
    const p = Math.max(0, Math.min(L, fp));
    for (let i = 0; i < basePts.length - 1; i++) {
      const a = basePts[i];
      const b = basePts[i + 1];
      if (p <= b.fp + 1e-6) {
        const f = (p - a.fp) / ((b.fp - a.fp) || 1);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    const lst = basePts[basePts.length - 1];
    return { x: lst.x, y: lst.y };
  };

  // Anlık tren konumları (ileri koordinat fp)
  const upNow = up.map((tr) => { const r = sampleS(tr.points, t); return { tr, active: r.active, fp: r.s, up: true }; });
  const downNow = down.map((tr) => { const r = sampleS(tr.points, t); return { tr, active: r.active, fp: L - r.s, up: false }; });
  const aktif = [...upNow, ...downNow].filter((x) => x.active);

  // Blok işgali (herhangi aktif tren o blokta mı)
  const occupied = new Set<number>();
  for (const x of aktif) {
    for (let i = 0; i < blocks.length - 1; i++) {
      if (x.fp >= blocks[i] - 1e-6 && x.fp < blocks[i + 1] - 1e-6) { occupied.add(i); break; }
    }
  }

  // Rota polyline (ekran)
  const routePoly = basePts.map((p) => `${p.x},${p.y}`).join(" ");
  // Depo hattı (rota dışı kenarlar) statik
  const spur = network.edges
    .filter((e) => !route.edgeIds.includes(e.id))
    .map((e) => ({ a: nodeById[e.from], b: nodeById[e.to] }))
    .filter((e) => e.a && e.b);

  const oynatDurdur = () => { if (t >= T) setT(0); setOynat((o) => !o); };

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Canlı ağ simülasyonu">
        {/* Depo hattı (statik) */}
        {spur.map((e, i) => (
          <line key={`sp${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={brand.faint} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        ))}

        {/* Ana hat (boş = koyu gri) */}
        <polyline points={routePoly} fill="none" stroke={brand.borderStrong} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />

        {/* İşgal edilen bloklar (kırmızı) */}
        {[...occupied].map((i) => {
          const a = screenAt(blocks[i]);
          const b = screenAt(blocks[i + 1]);
          return <line key={`oc${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={brand.red} strokeWidth={5} strokeLinecap="round" />;
        })}

        {/* Sinyal blok sınırları (ince dik çentik) */}
        {blocks.map((fp, i) => {
          const p = screenAt(fp);
          return <line key={`b${i}`} x1={p.x} y1={p.y - 6} x2={p.x} y2={p.y + 6} stroke={brand.faint} strokeWidth={1} />;
        })}

        {/* İstasyonlar */}
        {line.stations.map((st) => {
          const p = screenAt(st.position);
          return (
            <g key={st.id}>
              <circle cx={p.x} cy={p.y} r={5} fill={brand.surface} stroke={brand.ink} strokeWidth={2} />
              <text x={p.x} y={p.y - 12} fill={brand.muted} fontSize={10} textAnchor="middle">{st.name}</text>
            </g>
          );
        })}

        {/* Trenler */}
        {aktif.map((x, i) => {
          const p = screenAt(x.fp);
          const col = x.up ? brand.ink : DOWN;
          const no = `${x.tr.index + 1}`;
          return (
            <g key={`tr${i}`} transform={`translate(${p.x},${p.y})`}>
              <circle r={8} fill={col} stroke={brand.surface} strokeWidth={2} />
              <text x={0} y={3.5} fill="#fff" fontSize={9} fontWeight={700} textAnchor="middle">{no}</text>
            </g>
          );
        })}

        {/* Saat */}
        <g transform="translate(16,26)">
          <rect x={-6} y={-16} width={92} height={24} rx={4} fill={brand.ink} />
          <text x={40} y={1} fill="#fff" fontSize={14} fontWeight={700} textAnchor="middle" className="font-mono">{saat(t)}</text>
        </g>
        {/* Aktif tren sayısı */}
        <text x={VBW - 10} y={22} fill={brand.muted} fontSize={11} textAnchor="end">Hatta {aktif.length} tren</text>
      </svg>

      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={oynatDurdur} className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90" style={{ background: brand.red }}>
          {oynat ? "⏸ Duraklat" : t >= T ? "↻ Baştan" : "▶ Oynat"}
        </button>
        <div className="flex items-center gap-1">
          {HIZLAR.map((h) => (
            <button key={h} onClick={() => setHiz(h)} className="rounded px-2 py-1 text-xs font-medium transition"
              style={hiz === h ? { background: brand.ink, color: "#fff" } : { background: "#EDF0F3", color: brand.inkSoft }}>
              {h}×
            </button>
          ))}
        </div>
        <input type="range" min={0} max={T} step={0.5} value={t} onChange={(e) => { setOynat(false); setT(parseFloat(e.target.value)); }}
          className="min-w-[160px] flex-1" style={{ accentColor: brand.red }} aria-label="Zaman çubuğu" />
        <span className="font-mono text-xs" style={{ color: brand.muted }}>{saat(t)} / {saat(T)}</span>
      </div>
      <p className="text-xs" style={{ color: brand.muted }}>
        <span style={{ color: brand.ink }}>●</span> Gidiş · <span style={{ color: DOWN }}>●</span> Dönüş · <span style={{ color: brand.red }}>▬</span> işgal edilen blok. Çift hat servisi canlı akıyor.
      </p>
    </div>
  );
}
