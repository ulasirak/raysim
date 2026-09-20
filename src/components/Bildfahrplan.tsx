"use client";

// raysim — BİLDFAHRPLAN (zaman–mesafe tren grafiği / Marey diyagramı).
// Demiryolu mühendisliğinin klasik grafiği: x = zaman, y = mesafe (istasyonlar yatay
// ızgara), her tren bir çizgi. Tren gidiş şeridinde 0→L tırmanır, terminalde döner,
// dönüş şeridinde L→0 iner (üçgen dalga); `filo` tren headway aralığıyla ötelenir →
// paralel zigzaglar. Öbekleşme (bunching), headway düzenliliği ve gidiş↔dönüş karşılaşma
// noktaları tek bakışta görünür. Veri, canlı sim ile AYNI loop yörüngesinden gelir.

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
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

/** Çakışma işareti verisi (cakisma.ts'ten): gerçek-km span [0,L] + zaman (loopY periyodu içinde). */
export type BildCakisma = { t: number; kmBas: number; kmSon: number; karsi: boolean };

export function Bildfahrplan({ loop, line, cakismalar = [] }: { loop: LoopVeri; line: Line; cakismalar?: BildCakisma[] }) {
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

  // ETKİLEŞİM (E): zoom/pan + tren vurgu. Hook'lar erken-return'den ÖNCE (kurallar).
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [vurgu, setVurgu] = useState<number | null>(null);
  const dragRef = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);

  // Tekerlek zoom'u NON-PASSIVE native dinleyiciyle: React onWheel passive olduğundan
  // preventDefault çalışmaz (yakınlaşırken sayfa kayar + uyarı). İmleç-hassas zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      const q = p.matrixTransform(ctm.inverse());
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => { const k = Math.max(1, Math.min(12, v.k * f)); const r = k / v.k; return { k, tx: q.x - r * (q.x - v.tx), ty: q.y - r * (q.y - v.ty) }; });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [veri]);

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

  // — Etkileşim (E): zoom/pan + hi-res export —
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const onDown = (e: RPointerEvent) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); dragRef.current = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty }; };
  const onMove = (e: RPointerEvent) => {
    const d = dragRef.current; const svg = svgRef.current; if (!d || !svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - d.cx) * (W / rect.width), dy = (e.clientY - d.cy) * (H / rect.height);
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onUp = () => { dragRef.current = null; };
  const zoom = (f: number) => setView((v) => { const k = clamp(v.k * f, 1, 12); const cx = W / 2, cy = H / 2; const r = k / v.k; return { k, tx: cx - r * (cx - v.tx), ty: cy - r * (cy - v.ty) }; });
  const sifirla = () => setView({ k: 1, tx: 0, ty: 0 });

  const indir = (blob: Blob, ad: string) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = ad; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const svgXml = () => { const svg = svgRef.current; if (!svg) return ""; const c = svg.cloneNode(true) as SVGSVGElement; c.setAttribute("width", String(W)); c.setAttribute("height", String(H)); c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); return new XMLSerializer().serializeToString(c); };
  const exportSvg = () => { const xml = svgXml(); if (xml) indir(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }), "bildfahrplan.svg"); };
  const exportPng = () => {
    const xml = svgXml(); if (!xml) return; const scale = 3;
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = W * scale; cv.height = H * scale;
      const ctx = cv.getContext("2d");
      if (ctx) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height); cv.toBlob((b) => { if (b) indir(b, "bildfahrplan.png"); }, "image/png"); }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  const dugme = "rounded px-2 py-1 text-xs font-semibold";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => zoom(1.3)} className={dugme} style={{ background: brand.ink, color: "#fff" }} aria-label="Yakınlaştır">+</button>
        <button type="button" onClick={() => zoom(1 / 1.3)} className={dugme} style={{ background: brand.ink, color: "#fff" }} aria-label="Uzaklaştır">−</button>
        <button type="button" onClick={sifirla} className={dugme} style={{ border: `1px solid ${brand.border}`, color: brand.ink }}>Sıfırla</button>
        <span className="mx-1 text-[0.65rem] tabular-nums" style={{ color: brand.muted }}>×{view.k.toFixed(1)}</span>
        <span className="hidden text-[0.65rem] sm:inline" style={{ color: brand.muted }}>tekerlek = yakınlaş · sürükle = kaydır · tren üstüne gel = vurgula</span>
        <span className="flex-1" />
        <button type="button" onClick={exportPng} className={dugme} style={{ border: `1px solid ${brand.border}`, color: brand.ink }}>PNG indir</button>
        <button type="button" onClick={exportSvg} className={dugme} style={{ border: `1px solid ${brand.border}`, color: brand.ink }}>SVG indir</button>
      </div>
      <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${brand.border}` }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          role="img" aria-label="Bildfahrplan — zaman-mesafe tren grafiği (yakınlaştırılabilir)">
          <defs><clipPath id="bfclip"><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
          <g clipPath="url(#bfclip)"><g transform={`translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.k})`}>
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
          {/* Tren çizgileri — gidiş mavi, dönüş kırmızı; hover ile vurgu (diğerleri soluklaşır) */}
          {trenler.map((tr) => {
            const kalin = (tr.k === 0 ? 1.8 : 0.9) * (vurgu === tr.k ? 2.1 : 1);
            const op = vurgu == null ? (tr.k === 0 ? 1 : 0.75) : vurgu === tr.k ? 1 : 0.16;
            return (
              <g key={tr.k} onMouseEnter={() => setVurgu(tr.k)} onMouseLeave={() => setVurgu(null)} style={{ cursor: "pointer" }}>
                {/* görünmez kalın vuruş — hover kolaylığı */}
                {[...tr.gidis, ...tr.donus].map((seg, i) => <path key={`h${i}`} d={yol(seg)} fill="none" stroke="transparent" strokeWidth={6} />)}
                {tr.gidis.map((seg, i) => <path key={`g${i}`} d={yol(seg)} fill="none" stroke={CK.blue} strokeWidth={kalin} strokeOpacity={op} />)}
                {tr.donus.map((seg, i) => <path key={`d${i}`} d={yol(seg)} fill="none" stroke={CK.red} strokeWidth={kalin} strokeOpacity={op} />)}
              </g>
            );
          })}
          {/* Kesişim (karşılaşma) noktaları — ◇ */}
          {kesisim.map((c, i) => (
            <rect key={`k${i}`} x={X(c.t) - 2.4} y={Y(c.fp) - 2.4} width={4.8} height={4.8} transform={`rotate(45 ${X(c.t).toFixed(1)} ${Y(c.fp).toFixed(1)})`} fill={CK.amber} stroke="#fff" strokeWidth={0.5} />
          ))}
          {/* ÇAKIŞMA işaretleri (#2) — tek-hat kesiminde aynı anda ≥2 tren: kırmızı dikey
              bant (span boyu) + ✖. Karşı yön (meet) dolu, aynı yön (kuyruk) içi boş. */}
          {cakismalar.slice(0, 120).map((c, i) => {
            const x = X(c.t), y1 = Y(Math.min(L, c.kmSon)), y2 = Y(Math.max(0, c.kmBas)), ym = (y1 + y2) / 2;
            return (
              <g key={`ck${i}`}>
                <line x1={x} y1={y1} x2={x} y2={y2} stroke={CK.red} strokeWidth={2.4} strokeOpacity={0.32} strokeLinecap="round" />
                <path d={`M${(x - 3).toFixed(1)},${(ym - 3).toFixed(1)} l6,6 M${(x + 3).toFixed(1)},${(ym - 3).toFixed(1)} l-6,6`} stroke={CK.red} strokeWidth={1.4} fill="none" />
                <circle cx={x} cy={ym} r={2.6} fill={c.karsi ? CK.red : "#fff"} stroke={CK.red} strokeWidth={1} />
              </g>
            );
          })}
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
          </g></g>
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
          <span><span style={{ color: CK.blue }}>▬</span> Gidiş yönü</span>
          <span><span style={{ color: CK.red }}>▬</span> Dönüş yönü</span>
          <span>Kalın çizgi = referans tren (zaman etiketleri bu trenindir)</span>
          <span><span style={{ color: CK.amber }}>◆</span> karşılaşma (kesişim) noktası</span>
          {cakismalar.length > 0 && <span><span style={{ color: CK.red }}>✖</span> tek-hat çakışması ({cakismalar.length})</span>}
          <span>Eğim = hız · yatay = duruş · çizgi aralığı = headway ({saat(loop.offset || 0)})</span>
        </div>
      </div>
    </div>
  );
}

function kisalt(s: string): string { return s.length > 20 ? s.slice(0, 19) + "…" : s; }
