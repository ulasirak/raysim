"use client";

// raysim — SEFER (TARİFE) ↔ TERS İŞLETME ENTEGRE PANELİ.
// Manuel SEFER ARALIĞI (headway) + ZAMAN çubuğu → o an seferdeki araçların GERÇEK konumları
// (yörüngeden; sinyal/geçit/makas/dwell yavaşlamaları dâhil) diyagramda; talep dengesizliği
// olan makaslara yaklaşan araca KISA DÖNÜŞ kararı bağlanır; kazanç + gerekçe önerilir.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { sure } from "@/lib/anaray/format";
import { seferTersEntegre } from "@/lib/anaray/seferters";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { SimConfig, Isletme } from "@/lib/anaray/config";
import type { RollingStock } from "@/lib/anaray/types";

export function SeferTersEntegre({ rings, stock, cfg, isletme }: { rings: DurakArasiRing[]; stock: RollingStock; cfg: SimConfig; isletme: Isletme }) {
  const [headwayDk, setHeadwayDk] = useState(5);
  const [anSn, setAnSn] = useState(0);
  const s = useMemo(() => seferTersEntegre(rings, stock, cfg, isletme, headwayDk * 60, anSn), [rings, stock, cfg, isletme, headwayDk, anSn]);

  if (!s.gecerli) return <div className="text-sm" style={{ color: brand.muted }}>Hat yeterli değil (en az 2 durak gerekli).</div>;

  const Lkm = s.L / 1000;
  const W = 900, padL = 12, padR = 12, midY = 66, H = 120;
  const X = (km: number) => padL + (km / Math.max(0.001, Lkm)) * (W - padL - padR);
  const oneriAracSet = new Set(s.oneriler.map((o) => o.aracNo));

  return (
    <div>
      {/* Kontroller */}
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: brand.ink }}>Sefer aralığı</span>
          <input type="range" min={1} max={15} step={0.5} value={headwayDk} onChange={(e) => setHeadwayDk(parseFloat(e.target.value))} className="w-40" />
          <span className="tabular-nums font-bold" style={{ color: brand.red }}>{headwayDk.toFixed(1)} dk</span>
          <span className="text-xs" style={{ color: brand.muted }}>→ {s.filo} araç serviste</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: brand.ink }}>Zaman</span>
          <input type="range" min={0} max={Math.max(1, Math.round(s.cevrimSn))} step={15} value={anSn} onChange={(e) => setAnSn(parseFloat(e.target.value))} className="w-40" />
          <span className="tabular-nums" style={{ color: brand.inkSoft }}>{sure(s.anSn)} / {sure(s.cevrimSn)}</span>
        </label>
      </div>

      {/* Konum diyagramı */}
      <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="min-w-[680px] sm:min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sefer & ters işletme konum diyagramı">
            {/* hat */}
            <line x1={padL} y1={midY} x2={W - padR} y2={midY} stroke={CK.track} strokeWidth={4} strokeLinecap="round" />
            {/* km ekseni uçları */}
            <text x={padL} y={H - 4} fontSize={8} fill={brand.muted}>0 km</text>
            <text x={W - padR} y={H - 4} textAnchor="end" fontSize={8} fill={brand.muted}>{Lkm.toFixed(1)} km</text>
            {/* makaslar */}
            {s.makaslar.map((m, i) => (
              <g key={i}>
                <line x1={X(m.km)} y1={midY - 8} x2={X(m.km)} y2={midY + 8} stroke={m.onerilir ? CK.red : brand.border} strokeWidth={m.onerilir ? 2 : 1} />
                {m.onerilir && <text x={X(m.km)} y={midY + 22} textAnchor="middle" fontSize={8} fontWeight={700} fill={CK.red}>🔄 {m.km.toFixed(2)}</text>}
                <title>{`${m.ad} (${m.crossover === "x" ? "X" : "S"}-makas) · ${m.km.toFixed(2)} km${m.onerilir ? " · kısa dönüş adayı" : ""}`}</title>
              </g>
            ))}
            {/* öneri okları: araç → makas */}
            {s.oneriler.map((o, i) => (
              <line key={`ok${i}`} x1={X(o.aracKm)} y1={midY - 16} x2={X(o.makasKm)} y2={midY - 16} stroke={CK.red} strokeWidth={0.8} strokeDasharray="3 2" markerEnd="url(#ok)" />
            ))}
            <defs><marker id="ok" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={CK.red} /></marker></defs>
            {/* araçlar */}
            {s.araclar.map((a) => {
              const x = X(a.km), oner = oneriAracSet.has(a.no);
              const y = a.gidis ? midY - 6 : midY + 6;
              const renk = oner ? CK.red : a.gidis ? CK.blue : CK.orange;
              const ok = a.gidis ? `${x - 4},${y - 4} ${x + 4},${y} ${x - 4},${y + 4}` : `${x + 4},${y - 4} ${x - 4},${y} ${x + 4},${y + 4}`;
              return (
                <g key={a.no}>
                  <polygon points={ok} fill={renk} />
                  <text x={x} y={a.gidis ? y - 6 : y + 12} textAnchor="middle" fontSize={7} fontWeight={oner ? 700 : 500} fill={renk}>{a.no}</text>
                  <title>{`Araç ${a.no} · ${a.km.toFixed(2)} km · ${a.gidis ? "gidiş" : "dönüş"} · ${a.durum}`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
        <span><span style={{ color: CK.blue }}>▲</span> gidiş · <span style={{ color: CK.orange }}>▼</span> dönüş · <span style={{ color: CK.red }}>🔄</span> kısa dönüş makası / bağlanan araç</span>
      </div>

      {/* Öneriler */}
      {s.oneriler.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-semibold" style={{ color: brand.ink }}>Kısa dönüş önerileri (araca bağlı)</div>
          {s.oneriler.map((o, i) => (
            <div key={i} className="rounded-lg border-l-4 px-3 py-2 text-sm" style={{ borderColor: CK.red, background: "#FDF3F4", color: brand.inkSoft }}>
              <div className="font-semibold" style={{ color: brand.ink }}>
                🔄 Araç {o.aracNo} → {o.makasAd} ({o.crossover === "x" ? "X" : "S"}-makas · {o.makasKm.toFixed(2)} km)
                <span className="ml-2 text-xs font-normal" style={{ color: brand.muted }}>makasa ~{sure(o.ulasimSn)} sonra ulaşır · yoğun/sessiz {Math.round(o.oran * 10) / 10}× · ≈{sure(o.kazancSn)} daha sık</span>
              </div>
              <div className="mt-0.5 text-xs">{o.gerekce}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border px-3 py-2 text-sm" style={{ borderColor: brand.border, color: brand.muted }}>Bu an için araca bağlı kısa dönüş önerisi yok — zaman çubuğunu oynatınca makasa yaklaşan araç değişir.</div>
      )}

      {/* Bilgilendirme */}
      <ul className="mt-3 ml-4 list-disc text-xs" style={{ color: brand.muted }}>
        {s.bilgi.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  );
}
