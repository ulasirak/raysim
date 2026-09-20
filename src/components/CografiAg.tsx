"use client";

// raysim — COĞRAFİ / ÖLÇEKLİ CANLI AĞ (Büyük sıçrama D).
// Hattı KUŞBAKIŞI düzlemde gösterir: istasyonların gerçek koordinatı varsa (GTFS
// içe aktarımı) gerçek harita düzlemine oturur; yoksa gerçek uzunluk oranlı ölçekli
// plana düşer (koordinat UYDURULMAZ). Trenler döngü yörüngesinden (LoopYorunge) canlı
// akar; makas/sinyal/geçit gerçek kilometrajlarında işaretlenir. Kendi zamanlayıcı
// sürücüsü (setInterval) — donma önlemi: ilerletme RENDER'da değil zamanlayıcıda.

import { useEffect, useMemo, useState } from "react";
import type { Line } from "@/lib/anaray/types";
import type { LoopYorunge } from "@/lib/anaray/signalling";
import type { HatOzellik } from "@/lib/anaray/network";
import { cografiGeometri, type GeoNokta } from "@/lib/anaray/cografi";
import { KONYA_GEOMETRI } from "@/lib/anaray/konyaGeometri";
import { sampleLoop, HIZLAR, UP_COL, DOWN, GAP } from "@/components/liveNetworkGeo";
import { saat } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

const VBW = 900;

interface LoopVeri extends LoopYorunge {
  count: number;
  offset?: number;
}

export function CografiAg({
  line,
  loop,
  features = [],
  koordinat,
  geometri,
  autoOynat = false,
}: {
  line: Line;
  loop?: LoopVeri;
  features?: HatOzellik[];
  koordinat?: Record<string, { lat: number; lon: number }>;
  /** Hattın GERÇEK track geometrisi (müşteri verisi: GTFS shape vb.). Verilmezse Konya
   *  bbox'ında bundled örneğe düşer; o da yoksa düz istasyon-çizgisi. Sürdürülebilir. */
  geometri?: { insaat?: boolean; noktalar: [number, number][] }[];
  autoOynat?: boolean;
}) {
  const g = useMemo(() => cografiGeometri(line, koordinat, VBW), [line, koordinat]);
  const [t, setT] = useState(0);
  const [oynat, setOynat] = useState(autoOynat);
  const [hiz, setHiz] = useState(15);
  const periyot = loop?.periyot ?? 0;

  // ZAMANLAYICI sürücüsü — t'yi burada ilerlet (render'da DEĞİL). Interval yalnız
  // oynat/hız/periyot değişince yeniden kurulur (donma önlemi: setInterval sürücü).
  useEffect(() => {
    if (!oynat || periyot <= 0) return;
    const dt = 0.05; // 50 ms
    const id = setInterval(() => {
      setT((prev) => (prev + hiz * dt) % periyot);
    }, dt * 1000);
    return () => clearInterval(id);
  }, [oynat, periyot, hiz]);

  const L = loop?.L ?? line.length;
  const loopLen = loop?.loopLen ?? line.length * 2;

  // Trenleri döngü fazından örnekle (headway'le eşit aralıklı). s → fiziksel kilometraj:
  // gidiş (s≤L) düz; dönüş (s>L) geri → chain = loopLen − s. Şerit ofseti yönle işaretlenir.
  const trenler = useMemo(() => {
    if (!loop || loop.count <= 0 || periyot <= 0) return [];
    const out: { pt: GeoNokta; aci: number; gidis: boolean; durum: string; s: number }[] = [];
    for (let i = 0; i < loop.count; i++) {
      const faz = (t + (loop.offset ?? 0) + (i * periyot) / loop.count) % periyot;
      const smp = sampleLoop(loop.ornekler, faz);
      const gidis = smp.s <= L;
      const chain = gidis ? smp.s : loopLen - smp.s;
      const pt = g.konum(chain);
      const ileri = g.konum(Math.min(line.length, chain + 5));
      const geri = g.konum(Math.max(0, chain - 5));
      const dx = ileri.x - geri.x, dy = ileri.y - geri.y;
      const aci = (Math.atan2(dy, dx) * 180) / Math.PI;
      const nrm = g.normal(chain);
      const yon = gidis ? 1 : -1;
      out.push({ pt: { x: pt.x + nrm.x * GAP * yon, y: pt.y + nrm.y * GAP * yon }, aci, gidis, durum: smp.durum, s: smp.s });
    }
    return out;
  }, [loop, t, periyot, L, loopLen, g, line.length]);

  const yolD = g.yol.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // GERÇEK OSM TRACK GEOMETRİSİ (Konya) — istasyon koordinatlarıyla aynı projeksiyona
  // taşınır; çoğu noktası viewBox içinde kalan yollar (yani bu Konya hattı) çizilir.
  // Böylece harita düz istasyon-çizgisi yerine gerçek kavisli hizayı gösterir.
  const geoYollar = useMemo(() => {
    const pe = g.projekteEt;
    if (!g.coordluMu || !pe) return [] as { insaat: boolean; d: string }[];
    // KAYNAK: müşterinin kendi geometrisi (GTFS shape vb.) varsa O; yoksa Konya bundled örnek.
    const kaynak = geometri && geometri.length ? geometri : KONYA_GEOMETRI;
    const { w, h } = g.vb;
    const out: { insaat: boolean; d: string }[] = [];
    for (const yol of kaynak) {
      const pts = yol.noktalar.map(([lat, lon]) => pe(lat, lon));
      const ic = pts.filter((p) => p.x >= -20 && p.x <= w + 20 && p.y >= -20 && p.y <= h + 20).length;
      if (ic < pts.length * 0.6) continue; // çoğu görünürse (bu hat) çiz
      out.push({ insaat: !!yol.insaat, d: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") });
    }
    return out;
  }, [g, geometri]);
  const gercekGeo = geoYollar.length > 0;
  const featureSimge = (f: HatOzellik, idx: number) => {
    const p = g.konum(f.pos);
    if (f.kind === "makas") {
      return <rect key={`f${idx}`} x={p.x - 4} y={p.y - 4} width={8} height={8} transform={`rotate(45 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`} fill={CK.gold} stroke="#fff" strokeWidth={1}><title>{f.ad}</title></rect>;
    }
    if (f.kind === "sinyal") {
      return <circle key={`f${idx}`} cx={p.x} cy={p.y} r={3.4} fill={f.tersIsletme ? CK.orange : CK.good} stroke="#fff" strokeWidth={1}><title>{f.ad}</title></circle>;
    }
    // yaya / karayolu geçidi
    return <g key={`f${idx}`} stroke={CK.red} strokeWidth={1.4} strokeLinecap="round"><line x1={p.x - 3} y1={p.y - 3} x2={p.x + 3} y2={p.y + 3} /><line x1={p.x + 3} y1={p.y - 3} x2={p.x - 3} y2={p.y + 3} /><title>{f.ad}</title></g>;
  };

  return (
    <div>
      {/* Kip rozeti + kontroller */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="ds-chip" style={{ background: g.coordluMu ? CK.goodBgSoft : "#EEF2F6", color: g.coordluMu ? CK.good : brand.muted, border: `1px solid ${g.coordluMu ? CK.good : brand.border}` }}>
          {gercekGeo ? "Gerçek OSM hattı (harita)" : g.coordluMu ? "Gerçek koordinat (harita)" : "Ölçekli plan (koordinatsız)"}
        </span>
        {loop && periyot > 0 && (
          <>
            <button type="button" onClick={() => setOynat((o) => !o)} className="rounded-md px-3 py-1 text-sm font-semibold text-white" style={{ background: brand.ink }}>
              {oynat ? "⏸ Duraklat" : "▶ Oynat"}
            </button>
            <div className="flex items-center gap-1">
              {HIZLAR.map((hh) => (
                <button key={hh} type="button" onClick={() => setHiz(hh)} className="rounded px-2 py-1 text-xs font-semibold tabular-nums"
                  style={{ background: hiz === hh ? brand.ink : "transparent", color: hiz === hh ? "#fff" : brand.muted, border: `1px solid ${hiz === hh ? brand.ink : brand.border}` }}>
                  ×{hh}
                </button>
              ))}
            </div>
            <span className="font-mono text-xs tabular-nums" style={{ color: brand.muted }}>{saat(Math.floor(t))} / {saat(Math.floor(periyot))}</span>
            <input type="range" min={0} max={Math.max(1, Math.floor(periyot))} value={Math.floor(t)} onChange={(e) => { setOynat(false); setT(parseFloat(e.target.value)); }} className="ml-1 w-40" />
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border" style={{ borderColor: brand.border, background: g.coordluMu ? "#F2F6F4" : "#FBFCFD" }}>
        <svg viewBox={`0 0 ${g.vb.w} ${g.vb.h}`} width="100%" style={{ display: "block" }} role="img" aria-label="Coğrafi canlı ağ">
          {/* İz — gerçek OSM geometrisi varsa onu (kavisli hiza), yoksa düz istasyon-çizgisi */}
          {gercekGeo ? (
            <>
              {/* kılıf (beyaz) */}
              {geoYollar.map((y, i) => (
                <path key={`gc${i}`} d={y.d} fill="none" stroke="#fff" strokeWidth={y.insaat ? 4.5 : 6} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {/* gerçek track: operasyonel düz, inşaat kesikli */}
              {geoYollar.map((y, i) => (
                <path key={`g${i}`} d={y.d} fill="none" stroke={y.insaat ? CK.amber : brand.route} strokeWidth={y.insaat ? 1.8 : 2.6}
                  strokeOpacity={y.insaat ? 0.8 : 1} strokeDasharray={y.insaat ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </>
          ) : (
            <>
              <path d={yolD} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
              <path d={yolD} fill="none" stroke={brand.route} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}

          {/* Özellikler (makas/sinyal/geçit) */}
          {features.map((f, i) => featureSimge(f, i))}

          {/* İstasyonlar */}
          {g.istasyonlar.map((s, i) => (
            <g key={`s${i}`}>
              {s.depot ? (
                <rect x={s.nokta.x - 4.5} y={s.nokta.y - 4.5} width={9} height={9} fill={brand.ink} stroke="#fff" strokeWidth={1.4} />
              ) : (
                <circle cx={s.nokta.x} cy={s.nokta.y} r={s.tip && s.tip !== "istasyon" ? 2.6 : 4} fill={s.tip && s.tip !== "istasyon" ? brand.muted : "#fff"} stroke={brand.ink} strokeWidth={1.6} />
              )}
              {(!s.tip || s.tip === "istasyon" || s.depot) && (
                <text x={s.nokta.x} y={s.nokta.y - 8} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={brand.inkSoft}>{s.ad}</text>
              )}
            </g>
          ))}

          {/* Trenler */}
          {trenler.map((tr, i) => (
            <g key={`t${i}`} transform={`translate(${tr.pt.x.toFixed(1)} ${tr.pt.y.toFixed(1)}) rotate(${tr.aci.toFixed(1)})`}>
              <rect x={-6} y={-3.2} width={12} height={6.4} rx={1.6} fill={tr.gidis ? UP_COL : DOWN} stroke="#fff" strokeWidth={1} />
              <path d="M4,-2 L7,0 L4,2 Z" fill={tr.gidis ? UP_COL : DOWN} />
            </g>
          ))}
        </svg>
      </div>

      {/* Lejant */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.65rem]" style={{ color: brand.muted }}>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: UP_COL }} /> gidiş</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: DOWN }} /> dönüş</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45" style={{ background: CK.gold }} /> makas</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: CK.good }} /> sinyal</span>
        <span className="flex items-center gap-1"><span style={{ color: CK.red }}>✕</span> geçit</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5" style={{ background: brand.ink }} /> parklanma</span>
        {gercekGeo && (
          <>
            <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-4 rounded-sm" style={{ background: brand.route }} /> gerçek hat (OSM)</span>
            <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-4 rounded-sm" style={{ background: CK.amber }} /> inşaat halinde</span>
          </>
        )}
      </div>
    </div>
  );
}
