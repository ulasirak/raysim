"use client";

// raysim — BİLDFAHRPLAN (zaman–mesafe tren grafiği / Marey diyagramı).
// Demiryolu mühendisliğinin klasik grafiği: x = zaman, y = mesafe (istasyonlar yatay
// ızgara), her tren bir çizgi. Tren gidiş şeridinde 0→L tırmanır, terminalde döner,
// dönüş şeridinde L→0 iner (üçgen dalga); `filo` tren headway aralığıyla ötelenir →
// paralel zigzaglar. Öbekleşme (bunching), headway düzenliliği ve gidiş↔dönüş karşılaşma
// noktaları tek bakışta görünür. Veri, canlı sim ile AYNI loop yörüngesinden gelir.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { bildIstasyonZamanlari, bildKesisimZamanlari, satirYerlesim, type BildOlay } from "@/lib/anaray/grafikNoktalar";
import type { LoopYorunge } from "@/lib/anaray/signalling";
import type { Line } from "@/lib/anaray/types";
import { saat } from "@/lib/anaray/format";

type LoopVeri = LoopYorunge & { count: number; offset: number };

/** ornekler (t artan, 0..periyot) → verilen faz anındaki kümülatif s (doğrusal ara değer). */
function sampleS(orn: LoopYorunge["ornekler"], faz: number): number {
  const n = orn.length;
  if (n === 0) return 0;
  if (faz <= orn[0].t) return orn[0].s;
  if (faz >= orn[n - 1].t) return orn[n - 1].s;
  // İkili arama
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (orn[m].t <= faz) lo = m; else hi = m; }
  const a = orn[lo], b = orn[hi]; const dt = b.t - a.t || 1;
  return a.s + (b.s - a.s) * ((faz - a.t) / dt);
}

export function Bildfahrplan({ loop, line }: { loop: LoopVeri; line: Line }) {
  const veri = useMemo(() => {
    const { periyot, L, loopLen, count } = loop;
    if (periyot <= 0 || L <= 0 || count < 1) return null;
    const offset = loop.offset || periyot / Math.max(1, count);
    const pencere = periyot; // bir tam çevrim = kalıcı-durum desenini bir kez gösterir
    const adim = pencere / 260;
    // Her tren için gidiş/dönüş alt-poliline'ları (yön değişince böl → renklendirilebilir).
    const trenler: { k: number; gidis: { t: number; fp: number }[][]; donus: { t: number; fp: number }[][] }[] = [];
    for (let k = 0; k < count; k++) {
      const gidis: { t: number; fp: number }[][] = [[]];
      const donus: { t: number; fp: number }[][] = [[]];
      let oncekiGidis: boolean | null = null;
      for (let t = 0; t <= pencere + 1e-6; t += adim) {
        const faz = (((t + k * offset) % periyot) + periyot) % periyot;
        const s = sampleS(loop.ornekler, faz);
        const g = s <= L + 1e-6;
        const fp = g ? Math.min(L, s) : Math.max(0, loopLen - s);
        if (oncekiGidis !== null && g !== oncekiGidis) { gidis.push([]); donus.push([]); } // yön değişti → yeni segment
        (g ? gidis : donus)[(g ? gidis : donus).length - 1].push({ t, fp });
        oncekiGidis = g;
      }
      trenler.push({ k, gidis: gidis.filter((s) => s.length > 1), donus: donus.filter((s) => s.length > 1) });
    }
    // Gerekli ZAMAN noktaları: referans trenin istasyon geçişleri (iniş/çıkış, gidiş+dönüş)
    // + gidiş↔dönüş kesişimleri (karşılaşma/bağlantı). Eksende çakışmasız yazılacak.
    const istOlay = bildIstasyonZamanlari(loop, line);
    const kesisim = bildKesisimZamanlari(loop, count, offset).map((c) => ({ t: c.t, fp: c.fp, tip: "kesisim" as const }));
    return { trenler, pencere, L, istOlay, kesisim };
  }, [loop, line]);

  if (!veri) return null;
  const { trenler, pencere, L, istOlay, kesisim } = veri;

  // Y-ekseni: istasyonlar (0..L). Çakışmayı azaltmak için ada göre benzersiz konumlar.
  const duraklar = line.stations
    .filter((s) => s.tip !== "gecit")
    .map((s) => ({ ad: s.name, pos: s.position }))
    .sort((a, b) => a.pos - b.pos);

  // Çizim alanı (SVG kullanıcı koordinatı). Yükseklik istasyon sayısına göre.
  const solPad = 118, sagPad = 14, ustPad = 26, altPad = 52;
  const cizW = 900, cizH = Math.max(240, duraklar.length * 15);
  const W = solPad + cizW + sagPad, H = ustPad + cizH + altPad;
  const X = (t: number) => solPad + (t / pencere) * cizW;
  const Y = (fp: number) => ustPad + (1 - fp / L) * cizH; // 0 alt, L üst
  const eksenY = ustPad + cizH;

  const yol = (seg: { t: number; fp: number }[]) => seg.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.t).toFixed(1)},${Y(p.fp).toFixed(1)}`).join(" ");

  // Gerekli zaman noktaları: istasyon geçişleri + kesişimler → t'ye göre birleştir, yakınları
  // (≤ pencere/120) tekilleştir (durak önceliklidir), çakışmasız satırlara dağıt.
  const olaylar: BildOlay[] = [...istOlay, ...kesisim].sort((a, b) => a.t - b.t);
  const eksenOlay: BildOlay[] = [];
  const zEsik = pencere / 120;
  for (const o of olaylar) { const s = eksenOlay[eksenOlay.length - 1]; if (s && o.t - s.t < zEsik) { if (o.tip === "durak" && s.tip === "kesisim") eksenOlay[eksenOlay.length - 1] = o; continue; } eksenOlay.push(o); }
  const olayX = eksenOlay.map((o) => X(o.t));
  const olaySatir = satirYerlesim(olayX, 30, 3);
  const olayRenk = (tip: string) => (tip === "durak" ? brand.inkSoft : CK.amber);

  return (
    <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="min-w-[720px] sm:min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Bildfahrplan — zaman-mesafe tren grafiği">
          {/* İstasyon yatay ızgara + adları */}
          {duraklar.map((d, i) => {
            const y = Y(d.pos);
            return (
              <g key={i}>
                <line x1={solPad} y1={y} x2={solPad + cizW} y2={y} stroke={CK.track} strokeWidth={0.8} />
                <text x={solPad - 5} y={y + 2.5} textAnchor="end" fontSize={7.5} fill={brand.muted}>{kisalt(d.ad)}</text>
              </g>
            );
          })}
          {/* Zaman ekseni */}
          <line x1={solPad} y1={eksenY} x2={solPad + cizW} y2={eksenY} stroke={brand.border} strokeWidth={1} />
          {/* Gerekli zaman noktalarının dikey kılavuzları (istasyon/kesişim) */}
          {eksenOlay.map((o, i) => (
            <line key={`gv${i}`} x1={X(o.t)} y1={ustPad} x2={X(o.t)} y2={eksenY} stroke={olayRenk(o.tip)} strokeWidth={0.5} strokeOpacity={o.tip === "durak" ? 0.28 : 0.5} strokeDasharray={o.tip === "kesisim" ? "2 2" : undefined} />
          ))}
          {/* Tren çizgileri — gidiş mavi, dönüş kırmızı; referans tren (k=0) vurgulu */}
          {trenler.map((tr) => (
            <g key={tr.k}>
              {tr.gidis.map((seg, i) => <path key={`g${i}`} d={yol(seg)} fill="none" stroke={CK.blue} strokeWidth={tr.k === 0 ? 1.8 : 0.9} strokeOpacity={tr.k === 0 ? 1 : 0.75} />)}
              {tr.donus.map((seg, i) => <path key={`d${i}`} d={yol(seg)} fill="none" stroke={CK.red} strokeWidth={tr.k === 0 ? 1.8 : 0.9} strokeOpacity={tr.k === 0 ? 1 : 0.75} />)}
            </g>
          ))}
          {/* Kesişim (karşılaşma) noktaları — ◇ */}
          {kesisim.map((c, i) => (
            <rect key={`k${i}`} x={X(c.t) - 2.4} y={Y(c.fp) - 2.4} width={4.8} height={4.8} transform={`rotate(45 ${X(c.t).toFixed(1)} ${Y(c.fp).toFixed(1)})`} fill={CK.amber} stroke="#fff" strokeWidth={0.5} />
          ))}
          {/* Referans trenin istasyon geçiş noktaları — dolu daire */}
          {istOlay.map((o, i) => (
            <circle key={`i${i}`} cx={X(o.t)} cy={Y(o.fp)} r={1.8} fill={o.yon === "g" ? CK.blue : CK.red} />
          ))}
          {/* Zaman etiketleri — çakışmasız satırlara dağıtılmış (saat) */}
          {eksenOlay.map((o, i) => (
            <text key={`zt${i}`} x={X(o.t)} y={eksenY + 11 + olaySatir[i] * 9} textAnchor="middle" fontSize={7} fontWeight={o.tip === "durak" ? 600 : 400} fill={olayRenk(o.tip)}>{saat(o.t)}</text>
          ))}
          {/* Eksen başlıkları */}
          <text x={solPad + cizW / 2} y={H - 3} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft}>Zaman (çevrim boyu) →</text>
          <text x={12} y={ustPad + cizH / 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 12 ${ustPad + cizH / 2})`}>Mesafe / İstasyon ↑</text>
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
          <span><span style={{ color: CK.blue }}>▬</span> Gidiş yönü</span>
          <span><span style={{ color: CK.red }}>▬</span> Dönüş yönü</span>
          <span>Kalın çizgi = referans tren (zaman etiketleri bu trenindir)</span>
          <span><span style={{ color: CK.amber }}>◆</span> karşılaşma (kesişim) noktası</span>
          <span>Eğim = hız · yatay = duruş · çizgi aralığı = headway ({saat(loop.offset || 0)})</span>
        </div>
      </div>
    </div>
  );
}

function kisalt(s: string): string { return s.length > 20 ? s.slice(0, 19) + "…" : s; }
