"use client";

// raysim — HEMZEMİN GEÇİT & SİNYAL ÖNCELİĞİ (TSP) GECİKME ANALİZİ.
// Tramvaylar sokakta çok geçitli çalışır (OpenTrack bunu ayrı vurgulamaz). Her geçit iki
// gecikme üretir: (1) YAVAŞLAMA — tren geçit hızına (ör. 25 km/h) düşer, (2) BEKLEME —
// karayolu geçidinde trafik/öncelik (TSP) beklemesi. bekleme, sinyal önceliğinin doğrudan
// ölçüsüdür: iyi TSP → düşük bekleme. Grafik geçitlerin tur süresine katkısını gösterir.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { SimConfig } from "@/lib/anaray/config";
import { sure } from "@/lib/anaray/format";

export function HemzeminAnaliz({ rings, cfg, cevrimSn }: { rings: DurakArasiRing[]; cfg: SimConfig; cevrimSn: number }) {
  const veri = useMemo(() => {
    const W = cfg.kisitGenisligi || 40;
    let acc = 0;
    const g: { konum: number; ad: string; tip: string; yavas: number; bekle: number }[] = [];
    for (const r of rings) {
      const vmax = Math.max(0.1, r.vmax); // m/s
      for (const h of r.hemzeminler) {
        const hiz = Math.max(0.1, h.hiz); // m/s
        const yavas = hiz < vmax ? W * (1 / hiz - 1 / vmax) : 0; // ~zonu düşük hızda geçmenin ek süresi
        const bekle = h.tip === "karayolu" ? (h.bekleme ?? 0) : 0;
        g.push({ konum: acc + Math.max(0, Math.min(r.uzunluk, h.konum)), ad: h.ad || (h.tip === "karayolu" ? "Karayolu geçidi" : "Yaya geçidi"), tip: h.tip, yavas, bekle });
      }
      acc += r.uzunluk;
    }
    g.sort((a, b) => a.konum - b.konum);
    const L = Math.max(acc, 1);
    const toplamTek = g.reduce((s, x) => s + x.yavas + x.bekle, 0);
    const toplamTur = toplamTek * 2; // gidiş + dönüş
    const karayolu = g.filter((x) => x.tip === "karayolu").length;
    return { g, L, toplamTur, karayolu, yaya: g.length - karayolu, top: Math.max(...g.map((x) => x.yavas + x.bekle), 1) };
  }, [rings, cfg]);

  if (!veri || veri.g.length === 0) {
    return <div className="text-sm" style={{ color: brand.muted }}>Bu hatta tanımlı hemzemin geçit yok.</div>;
  }
  const { g, L, toplamTur, karayolu, yaya, top } = veri;
  const W = 860, H = 190, padL = 40, padR = 14, padT = 22, padB = 34;
  const pw = W - padL - padR, ph = H - padT - padB;
  const X = (k: number) => padL + (k / L) * pw;
  const Y = (s: number) => padT + (1 - s / top) * ph;
  const bw = Math.max(3, Math.min(18, pw / g.length * 0.6));
  const yuzde = cevrimSn > 0 ? (toplamTur / cevrimSn) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: brand.inkSoft }}>
        <span><b>{g.length}</b> geçit ({karayolu} karayolu · {yaya} yaya)</span>
        <span>Tur başına geçit gecikmesi: <b style={{ color: yuzde > 8 ? CK.red : brand.ink }}>{sure(Math.round(toplamTur))}</b> (çevrimin %{yuzde.toFixed(1)}'i)</span>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="min-w-[680px] sm:min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Hemzemin geçit gecikme">
            <line x1={padL} y1={padT + ph} x2={padL + pw} y2={padT + ph} stroke={brand.border} strokeWidth={1} />
            {[0, Math.round(top / 2), Math.round(top)].map((v) => (
              <text key={v} x={padL - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7.5} fill={brand.muted}>{v}</text>
            ))}
            {g.map((x, i) => {
              const cx = X(x.konum), base = padT + ph;
              const yBek = Y(x.bekle), yTop = Y(x.bekle + x.yavas);
              const bekRenk = x.bekle > 20 ? CK.red : x.bekle > 8 ? CK.amber : CK.blue;
              return (
                <g key={i}>
                  {x.yavas > 0 && <rect x={cx - bw / 2} y={yTop} width={bw} height={Math.max(0, yBek - yTop)} fill="#9AA7B2"><title>{x.ad}: yavaşlama {Math.round(x.yavas)} s</title></rect>}
                  {x.bekle > 0 && <rect x={cx - bw / 2} y={yBek} width={bw} height={Math.max(0, base - yBek)} fill={bekRenk}><title>{x.ad}: bekleme (TSP/trafik) {Math.round(x.bekle)} s</title></rect>}
                  {x.yavas === 0 && x.bekle === 0 && <rect x={cx - bw / 2} y={base - 2} width={bw} height={2} fill="#9AA7B2" />}
                </g>
              );
            })}
            {Array.from({ length: Math.max(2, Math.round(L / 1000)) + 1 }, (_, i) => {
              const k = (L * i) / Math.max(2, Math.round(L / 1000));
              return <text key={i} x={X(k)} y={padT + ph + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{(k / 1000).toFixed(1)}</text>;
            })}
            <text x={padL + pw / 2} y={H - 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft}>Mesafe (km) →</text>
            <text x={10} y={padT + ph / 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 10 ${padT + ph / 2})`}>gecikme (s) ↑</text>
          </svg>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: brand.muted }}>
        <span><span style={{ color: "#9AA7B2" }}>■</span> yavaşlama · <span style={{ color: CK.blue }}>■</span>/<span style={{ color: CK.amber }}>■</span>/<span style={{ color: CK.red }}>■</span> bekleme (TSP/trafik, artan)</span>
        <span>Sinyal önceliği (TSP) iyileştikçe bekleme düşer → tur süresi kısalır, kapasite artar.</span>
      </div>
    </div>
  );
}
