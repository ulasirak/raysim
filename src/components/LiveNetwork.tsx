"use client";

// raysim — CANLI AĞ SİMÜLASYONU ("sim videosu"), ÇİFT ŞERİT (double-track).
// Gidiş üst şerit / dönüş alt şerit — iki yön ayrı hatta akar (gerçek hat gibi).
// Trenler vagon kutucuğu + yön oku ile çizilir; blok işgali her şeritte ayrı
// kırmızıya döner; saat + oynat/duraklat + hız + zaman çubuğu.
// Trenler önceden hesaplanmış yörüngelerden (t→konum) arc-length ile konumlanır.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RailNetwork, Route, Line } from "@/lib/anaray/types";
import type { SignalTrain } from "@/lib/anaray/signalling";
import { saat } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";

const VBW = 860;
const VBH = 300;
const HIZLAR = [1, 5, 15, 30, 60];
const DOWN = "#0C6DB8";
const GAP = 9; // şeritlerin merkez hattından dik ofseti (px)
const UP_SIDE = -1; // gidiş üst şerit (SVG'de -y yukarı)
const DOWN_SIDE = 1; // dönüş alt şerit

function sampleS(points: { t: number; s: number }[], t: number): { s: number; active: boolean; v: number } {
  if (points.length === 0) return { s: 0, active: false, v: 0 };
  const first = points[0];
  const last = points[points.length - 1];
  if (t < first.t - 1e-6) return { s: first.s, active: false, v: 0 };
  if (t > last.t + 1e-6) return { s: last.s, active: false, v: 0 };
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dtt = (p1.t - p0.t) || 1;
      const f = (t - p0.t) / dtt;
      return { s: p0.s + (p1.s - p0.s) * f, active: true, v: (p1.s - p0.s) / dtt };
    }
  }
  return { s: last.s, active: true, v: 0 };
}

export function LiveNetwork({
  network, route, line, blocks, up, down, tMax, trainLen = 40, faultBlocks = [], onBlockClick,
}: {
  network: RailNetwork;
  route: Route;
  line: Line;
  blocks: number[];
  up: SignalTrain[];
  down: SignalTrain[];
  tMax: number;
  trainLen?: number;
  faultBlocks?: number[];
  onBlockClick?: (i: number) => void;
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

  // Kavşak noktalarında pürüzsüz şerit için köşe (vertex) normalleri
  const vertexN = useMemo(() => {
    const n = basePts.length;
    if (n < 2) return basePts.map(() => ({ nx: 0, ny: 1 }));
    const seg: { nx: number; ny: number }[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = basePts[i + 1].x - basePts[i].x;
      const dy = basePts[i + 1].y - basePts[i].y;
      const len = Math.hypot(dx, dy) || 1;
      seg.push({ nx: -dy / len, ny: dx / len });
    }
    return basePts.map((_, i) => {
      const a = seg[Math.max(0, i - 1)];
      const b = seg[Math.min(seg.length - 1, i)];
      const nx = a.nx + b.nx, ny = a.ny + b.ny;
      const len = Math.hypot(nx, ny) || 1;
      return { nx: nx / len, ny: ny / len };
    });
  }, [basePts]);

  if (!mounted) {
    return <div className="h-[280px] w-full animate-pulse rounded-md" style={{ background: "#EDF0F3" }} aria-hidden />;
  }

  // fp → merkez hattı noktası + segment normali + açı
  const segAt = (fp: number) => {
    const p = Math.max(0, Math.min(L, fp));
    for (let i = 0; i < basePts.length - 1; i++) {
      const a = basePts[i];
      const b = basePts[i + 1];
      if (p <= b.fp + 1e-6) {
        const f = (p - a.fp) / ((b.fp - a.fp) || 1);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: a.x + dx * f, y: a.y + dy * f, nx: -dy / len, ny: dx / len, ang: Math.atan2(dy, dx) };
      }
    }
    const lst = basePts[basePts.length - 1];
    const pr = basePts[Math.max(0, basePts.length - 2)];
    const dx = lst.x - pr.x, dy = lst.y - pr.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: lst.x, y: lst.y, nx: -dy / len, ny: dx / len, ang: Math.atan2(dy, dx) };
  };
  // Şerit üzerindeki nokta (side: -1 üst gidiş, +1 alt dönüş)
  const laneAt = (fp: number, side: number) => {
    const s = segAt(fp);
    return { x: s.x + side * GAP * s.nx, y: s.y + side * GAP * s.ny, ang: s.ang };
  };
  // Şeridin dışına (dist px) ofsetli nokta — wayside sinyal fenerleri için
  const offsetAt = (fp: number, dist: number, side: number) => {
    const s = segAt(fp);
    return { x: s.x + side * dist * s.nx, y: s.y + side * dist * s.ny };
  };
  // Şerit polyline (köşe normalleriyle)
  const lanePoly = (side: number) =>
    basePts.map((p, i) => `${(p.x + side * GAP * vertexN[i].nx).toFixed(1)},${(p.y + side * GAP * vertexN[i].ny).toFixed(1)}`).join(" ");

  // Anlık tren konumları (ileri koordinat fp)
  const upNow = up.map((tr) => { const r = sampleS(tr.points, t); return { tr, active: r.active, fp: r.s, up: true, v: r.v }; }).filter((x) => x.active);
  const downNow = down.map((tr) => { const r = sampleS(tr.points, t); return { tr, active: r.active, fp: L - r.s, up: false, v: r.v }; }).filter((x) => x.active);
  const aktifSayi = upNow.length + downNow.length;

  // Blok işgali — her şerit ayrı
  const blokIndeks = (fp: number) => {
    for (let i = 0; i < blocks.length - 1; i++) {
      if (fp >= blocks[i] - 1e-6 && fp < blocks[i + 1] - 1e-6) return i;
    }
    return -1;
  };
  const occUp = new Set<number>();
  const occDown = new Set<number>();
  for (const x of upNow) { const i = blokIndeks(x.fp); if (i >= 0) occUp.add(i); }
  for (const x of downNow) { const i = blokIndeks(x.fp); if (i >= 0) occDown.add(i); }

  // Sinyal fener aspekti (sabit blok, 3 fener): korunan blok dolu → KIRMIZI;
  // bir sonraki blok dolu → SARI (dikkat); ikisi de boş → YEŞİL.
  const nb = blocks.length - 1;
  const asp = (occ: Set<number>, ahead: number, after: number) =>
    occ.has(ahead) ? "#C8102E" : occ.has(after) ? "#E0A400" : "#0E7C57";

  // Depo hattı (rota dışı kenarlar) statik
  const spur = network.edges
    .filter((e) => !route.edgeIds.includes(e.id))
    .map((e) => ({ a: nodeById[e.from], b: nodeById[e.to] }))
    .filter((e) => e.a && e.b);

  const oynatDurdur = () => { if (t >= T) setT(0); setOynat((o) => !o); };

  const laneRed = (occ: Set<number>, side: number, key: string) =>
    [...occ].map((i) => {
      const a = laneAt(blocks[i], side);
      const b = laneAt(blocks[i + 1], side);
      return <line key={`${key}${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={brand.red} strokeWidth={4.5} strokeLinecap="round" />;
    });

  const CAR_PX = 7;
  const cars = Math.max(2, Math.min(6, Math.round(trainLen / 20))); // ~20 m/vagon
  const wagon = (x: { tr: SignalTrain; fp: number; up: boolean; v: number }, i: number) => {
    const side = x.up ? UP_SIDE : DOWN_SIDE;
    const pos = laneAt(x.fp, side);
    const col = x.up ? brand.ink : DOWN;
    // yön: gidiş +tangent, dönüş -tangent
    const deg = (pos.ang * 180) / Math.PI + (x.up ? 0 : 180);
    const no = `${x.tr.index + 1}`;
    const wpx = cars * CAR_PX, half = wpx / 2;
    const kmh = Math.round(x.v * 3.6);
    const lbl = offsetAt(x.fp, GAP + 13, side); // hız etiketi şerit dışına
    return (
      <g key={`tr${i}`}>
        <g transform={`translate(${pos.x},${pos.y}) rotate(${deg})`}>
          <rect x={-half} y={-4.5} width={wpx} height={9} rx={2.5} fill={col} stroke="#fff" strokeWidth={1.2} />
          {Array.from({ length: cars - 1 }).map((_, c) => {
            const sx = -half + (c + 1) * CAR_PX;
            return <line key={c} x1={sx} y1={-4.5} x2={sx} y2={4.5} stroke="#fff" strokeWidth={0.7} opacity={0.55} />;
          })}
          <polygon points={`${half},-4.5 ${half + 5},0 ${half},4.5`} fill={col} />
        </g>
        <text x={pos.x} y={pos.y + 3} fill="#fff" fontSize={7.5} fontWeight={700} textAnchor="middle">{no}</text>
        {kmh > 1 && <text x={lbl.x} y={lbl.y} fill={col} fontSize={7.5} fontWeight={600} textAnchor="middle">{kmh}</text>}
      </g>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Canlı ağ simülasyonu (çift hat)">
        {/* Depo hattı (statik) */}
        {spur.map((e, i) => (
          <line key={`sp${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={brand.faint} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        ))}

        {/* Traversler (iki şerit arası bağlantı çentikleri) */}
        {basePts.length > 1 && Array.from({ length: 60 }).map((_, k) => {
          const fp = (L * (k + 0.5)) / 60;
          const a = laneAt(fp, UP_SIDE);
          const b = laneAt(fp, DOWN_SIDE);
          return <line key={`tie${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={brand.faint} strokeWidth={1} opacity={0.5} />;
        })}

        {/* Boş şeritler (koyu gri) */}
        <polyline points={lanePoly(UP_SIDE)} fill="none" stroke={brand.borderStrong} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={lanePoly(DOWN_SIDE)} fill="none" stroke={brand.borderStrong} strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* İşgal edilen bloklar (her şerit ayrı) */}
        {laneRed(occUp, UP_SIDE, "ou")}
        {laneRed(occDown, DOWN_SIDE, "od")}

        {/* Sinyal blok sınırları (her şeritte ince çentik) */}
        {blocks.map((fp, i) => {
          const u = laneAt(fp, UP_SIDE);
          const d = laneAt(fp, DOWN_SIDE);
          return (
            <g key={`b${i}`}>
              <line x1={u.x} y1={u.y - 5} x2={u.x} y2={u.y + 5} stroke={brand.faint} strokeWidth={1} />
              <line x1={d.x} y1={d.y - 5} x2={d.x} y2={d.y + 5} stroke={brand.faint} strokeWidth={1} />
            </g>
          );
        })}

        {/* Arızalı bloklar (dispatcher) — gidiş şeridinde kırmızı taralı + ✕ */}
        {faultBlocks.filter((i) => i >= 0 && i < nb).map((i) => {
          const a = laneAt(blocks[i], UP_SIDE);
          const b = laneAt(blocks[i + 1], UP_SIDE);
          const m = offsetAt((blocks[i] + blocks[i + 1]) / 2, GAP + 12, UP_SIDE);
          return (
            <g key={`fa${i}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={brand.red} strokeWidth={5} strokeDasharray="4 3" strokeLinecap="round" />
              <text x={m.x} y={m.y + 3} fill={brand.red} fontSize={11} fontWeight={700} textAnchor="middle">✕</text>
            </g>
          );
        })}

        {/* Sinyal fenerleri (3 aspekt) — gidiş şeridi üstte, dönüş şeridi altta */}
        {Array.from({ length: nb }).map((_, i) => {
          const p = offsetAt(blocks[i], GAP + 6, UP_SIDE);
          const arizali = faultBlocks.includes(i);
          return (
            <circle key={`su${i}`} cx={p.x} cy={p.y} r={onBlockClick ? 3.6 : 3.1}
              fill={arizali ? "#7A0A1C" : asp(occUp, i, i + 1)} stroke="#fff" strokeWidth={1}
              style={{ transition: "fill 0.35s ease", cursor: onBlockClick ? "pointer" : "default" }}
              onClick={onBlockClick ? () => onBlockClick(i) : undefined}>
              {onBlockClick && <title>{`Blok ${i} — tıkla: arıza aç/kapat`}</title>}
            </circle>
          );
        })}
        {Array.from({ length: nb }).map((_, k) => {
          const i = k + 1;
          const p = offsetAt(blocks[i], GAP + 6, DOWN_SIDE);
          return <circle key={`sd${i}`} cx={p.x} cy={p.y} r={3.1} fill={asp(occDown, i - 1, i - 2)} stroke="#fff" strokeWidth={1} style={{ transition: "fill 0.35s ease" }} />;
        })}

        {/* İstasyonlar (peron = iki şeridi kesen dik marka) */}
        {line.stations.map((st) => {
          const c = segAt(st.position);
          const u = laneAt(st.position, UP_SIDE);
          const d = laneAt(st.position, DOWN_SIDE);
          return (
            <g key={st.id}>
              <line x1={u.x} y1={u.y} x2={d.x} y2={d.y} stroke={brand.ink} strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={c.x} cy={c.y} r={4} fill={brand.surface} stroke={brand.ink} strokeWidth={2} />
              <text x={u.x} y={u.y - 10} fill={brand.muted} fontSize={10} textAnchor="middle">{st.name}</text>
            </g>
          );
        })}

        {/* Trenler */}
        {upNow.map(wagon)}
        {downNow.map((x, i) => wagon(x, i + upNow.length))}

        {/* Saat */}
        <g transform="translate(16,26)">
          <rect x={-6} y={-16} width={92} height={24} rx={4} fill={brand.ink} />
          <text x={40} y={1} fill="#fff" fontSize={14} fontWeight={700} textAnchor="middle" className="font-mono">{saat(t)}</text>
        </g>
        {/* Aktif tren sayısı */}
        <text x={VBW - 10} y={22} fill={brand.muted} fontSize={11} textAnchor="end">Hatta {aktifSayi} tren</text>
        {/* Şerit etiketleri */}
        <text x={10} y={VBH - 30} fill={brand.ink} fontSize={10} fontWeight={600}>▲ Gidiş (üst şerit)</text>
        <text x={10} y={VBH - 12} fill={DOWN} fontSize={10} fontWeight={600}>▼ Dönüş (alt şerit)</text>
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
        <span style={{ color: brand.ink }}>▬</span> Üst şerit: Gidiş · <span style={{ color: DOWN }}>▬</span> Alt şerit: Dönüş · <span style={{ color: brand.red }}>▬</span> işgal edilen blok.
        {" "}Sinyal: <span style={{ color: "#0E7C57" }}>●</span> yeşil (serbest) · <span style={{ color: "#E0A400" }}>●</span> sarı (dikkat) · <span style={{ color: "#C8102E" }}>●</span> kırmızı (dur). Sabit blok 3-fener mantığı canlı akıyor.
      </p>
    </div>
  );
}
