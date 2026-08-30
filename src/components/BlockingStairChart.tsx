// raysim — GERÇEK Sperrzeitentreppe (blocking-time merdiveni).
//
// Kanonik demiryolu kapasite diyagramı: yatay = ZAMAN, dikey = MESAFE (hat boyunca).
// Her sinyal bloğu, bir tren için bir DİKDÖRTGEN boyunca rezervedir:
//   • dikey kenar = bloğun [start,end] uzunluğu,
//   • yatay kenar = blocking-time = [giriş − yaklaşma − görme − setup, çıkış + temizleme + release].
// Ardışık dikdörtgenler trenin yörüngesi boyunca bir MERDİVEN oluşturur. İki ardışık
// tren (2. tren = 1. + min headway) çizilir; merdivenler KRİTİK BLOKTA tam "değer" →
// o an min headway'i (kapasiteyi) gözle görürsün. Kritik blok kırmızı çerçeveli.

import type { BlokSperr } from "@/lib/anaray/blockingtime";
import { saat, km } from "@/lib/anaray/format";
import { CK } from "@/lib/anaray/chartkit";

const VBW = 820;
const VBH = 460;
const PAD = { top: 22, right: 20, bottom: 42, left: 74 };

const FILL_DUZ = CK.blue; // düz blok
const FILL_MAKAS = CK.orange; // makas bloğu

export function BlockingStairChart({
  bloklar, L, minHeadway, kritikBlok, yorunge, kritikRenk = CK.red, kritikAd = "kritik",
}: {
  bloklar: BlokSperr[];
  L: number;
  minHeadway: number;
  kritikBlok: number;
  yorunge: { t: number; s: number }[];
  /** Belirleyici (min headway) bloğun vurgu rengi — sunum modunda nötr (varsayılan kırmızı). */
  kritikRenk?: string;
  /** Belirleyici bloğun anlatım etiketi ("kritik" | "belirleyici"). */
  kritikAd?: string;
}) {
  const plotW = VBW - PAD.left - PAD.right;
  const plotH = VBH - PAD.top - PAD.bottom;

  // Her blok için rezerve pencere (blocking time) — merdiven basamağı
  const basamaklar = bloklar.map((b) => ({
    b,
    rStart: b.girisT - b.tApproach - b.tSighting - b.tSetup,
    rEnd: b.cikisT + b.tClearing + b.tRelease,
  }));

  const tMin = Math.min(0, ...basamaklar.map((x) => x.rStart));
  const tMax = Math.max(...basamaklar.map((x) => x.rEnd)) + minHeadway;
  const T = tMax - tMin || 1;

  const xFor = (t: number) => PAD.left + ((t - tMin) / T) * plotW;
  const yFor = (s: number) => PAD.top + (Math.max(0, Math.min(L, s)) / L) * plotH;

  const step = niceStep(T / 7);
  const ticks: number[] = [];
  for (let t = Math.ceil(tMin / step) * step; t <= tMax + 0.5; t += step) ticks.push(t);

  const trenPath = (offset: number) =>
    yorunge.map((p) => `${xFor(p.t + offset).toFixed(1)},${yFor(p.s).toFixed(1)}`).join(" ");

  const rects = (offset: number, ana: boolean) =>
    basamaklar.map(({ b, rStart, rEnd }) => {
      const x0 = xFor(rStart + offset);
      const x1 = xFor(rEnd + offset);
      const y0 = yFor(b.start);
      const y1 = yFor(b.end);
      const kritik = b.i === kritikBlok;
      return (
        <rect
          key={`${ana ? "a" : "b"}-${b.i}`}
          x={x0 + 0.4}
          y={y0 + 0.4}
          width={Math.max(1, x1 - x0 - 0.8)}
          height={Math.max(1, y1 - y0 - 0.8)}
          rx={1}
          fill={b.makasBlok ? FILL_MAKAS : FILL_DUZ}
          fillOpacity={ana ? (kritik ? 0.42 : 0.22) : kritik ? 0.3 : 0.13}
          stroke={kritik ? kritikRenk : b.makasBlok ? FILL_MAKAS : FILL_DUZ}
          strokeWidth={kritik ? 1.6 : 0.6}
          strokeOpacity={kritik ? 1 : 0.5}
        />
      );
    });

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Sperrzeitentreppe blocking-time merdiveni" style={{ fontFamily: CK.sans }}>
      {/* Zaman ızgarası */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xFor(t)} y1={PAD.top} x2={xFor(t)} y2={PAD.top + plotH} stroke={CK.grid} strokeWidth={1} />
          <text x={xFor(t)} y={PAD.top + plotH + 18} fill={CK.muted} fontSize={11} textAnchor="middle">{saat(t)}</text>
        </g>
      ))}

      {/* Mesafe ekseni: blok sınırları */}
      {bloklar.map((b) => (
        <g key={`bl${b.i}`}>
          <line x1={PAD.left} y1={yFor(b.start)} x2={PAD.left + plotW} y2={yFor(b.start)} stroke={CK.grid} strokeWidth={0.5} strokeDasharray="2 4" />
        </g>
      ))}
      <text x={PAD.left - 10} y={yFor(0) + 4} fill={CK.faint} fontSize={9} textAnchor="end">0 km</text>
      <text x={PAD.left - 10} y={yFor(L) - 2} fill={CK.faint} fontSize={9} textAnchor="end">{km(L)} km</text>

      {/* 2. tren (soluk) — 1. + min headway */}
      {rects(minHeadway, false)}
      <polyline points={trenPath(minHeadway)} fill="none" stroke={CK.ink} strokeWidth={1.4} strokeOpacity={0.45} strokeLinejoin="round" />

      {/* 1. tren (ana) */}
      {rects(0, true)}
      <polyline points={trenPath(0)} fill="none" stroke={CK.ink} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />

      {/* min headway göstergesi (kritik blok hizasında iki tren arası) */}
      {(() => {
        const kb = basamaklar[kritikBlok];
        if (!kb) return null;
        const yk = yFor((kb.b.start + kb.b.end) / 2);
        const xa = xFor(kb.rStart);
        const xb = xFor(kb.rStart + minHeadway);
        return (
          <g>
            <line x1={xa} y1={yk} x2={xb} y2={yk} stroke={kritikRenk} strokeWidth={1.4} markerEnd="url(#ok)" markerStart="url(#ok)" />
            <rect x={(xa + xb) / 2 - 34} y={yk - 20} width={68} height={15} rx={3} fill={kritikRenk} />
            <text x={(xa + xb) / 2} y={yk - 9} fill="#fff" fontSize={10} fontWeight={700} textAnchor="middle" className="font-mono">{saat(minHeadway)}</text>
          </g>
        );
      })()}

      <defs>
        <marker id="ok" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={kritikRenk} />
        </marker>
      </defs>

      <text x={PAD.left + plotW / 2} y={VBH - 4} fill={CK.muted} fontSize={11} textAnchor="middle">Zaman (dk:sn) →  ·  {kritikAd} blokta iki merdiven değer = min headway</text>
    </svg>
  );
}

function niceStep(raw: number): number {
  const steps = [15, 30, 60, 120, 180, 300, 600];
  for (const s of steps) if (raw <= s) return s;
  return 900;
}
