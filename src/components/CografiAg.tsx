"use client";

// raysim — COĞRAFİ / ÖLÇEKLİ CANLI AĞ (Büyük sıçrama D).
// Hattı KUŞBAKIŞI düzlemde gösterir: istasyonların gerçek koordinatı varsa (GTFS
// içe aktarımı) gerçek harita düzlemine oturur; yoksa gerçek uzunluk oranlı ölçekli
// plana düşer (koordinat UYDURULMAZ). Trenler döngü yörüngesinden (LoopYorunge) canlı
// akar; makas/sinyal/geçit gerçek kilometrajlarında işaretlenir. Kendi zamanlayıcı
// sürücüsü (setInterval) — donma önlemi: ilerletme RENDER'da değil zamanlayıcıda.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Line } from "@/lib/anaray/types";
import type { LoopYorunge } from "@/lib/anaray/signalling";
import type { HatOzellik } from "@/lib/anaray/network";
import { cografiGeometri, type GeoNokta } from "@/lib/anaray/cografi";
import { sampleLoop, HIZLAR, UP_COL, DOWN, GAP, DURUM_STIL } from "@/components/liveNetworkGeo";
import { TrenDetayKutusu } from "@/components/liveNetworkKartlar";
import type { TersIsletmeRapor } from "@/lib/anaray/tersisletme";
import type { HaritaKisit } from "@/lib/anaray/ring";
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
  blocks,
  ters,
  hizKisitlari = [],
  yolcuVeriVar = false,
  autoOynat = false,
}: {
  line: Line;
  loop?: LoopVeri;
  features?: HatOzellik[];
  koordinat?: Record<string, { lat: number; lon: number }>;
  /** Blok sınırları (kilometraj) — işgal edilen blok rayı kırmızıya döner (şematikle aynı). */
  blocks?: number[];
  /** Ters işletme analizi — kısa-dönüş önerilen makaslar + filo etkisi harita OVERLAY'i. */
  ters?: TersIsletmeRapor | null;
  /** Hız kısıtları (makas/geçit/tehlike/kurp) — mutlak km + hız sınırı (km/h); kurplarda
   *  yolcu-doluluğuna eşli konfor önerisi. Haritada tıklanabilir işaret + popup. */
  hizKisitlari?: HaritaKisit[];
  /** Yolcu verisi girili mi? (kurp kalabalık uyarısı buna bağlı — bilgilendirme). */
  yolcuVeriVar?: boolean;
  /** Hattın GERÇEK track geometrisi (müşteri verisi: GTFS shape vb.). Verilmezse Konya
   *  bbox'ında bundled örneğe düşer; o da yoksa düz istasyon-çizgisi. Sürdürülebilir. */
  geometri?: { insaat?: boolean; noktalar: [number, number][] }[];
  autoOynat?: boolean;
}) {
  const g = useMemo(() => cografiGeometri(line, koordinat, VBW), [line, koordinat]);
  const [t, setT] = useState(0);
  const [oynat, setOynat] = useState(autoOynat);
  const [hiz, setHiz] = useState(15);
  const [secili, setSecili] = useState<number | null>(null); // tıklanan tren (detay kutusu)
  const [seciliKisit, setSeciliKisit] = useState<number | null>(null); // tıklanan hız kısıtı (popup)
  const [tersGoster, setTersGoster] = useState(true); // ters işletme overlay'i açık mı
  // ZOOM/PAN — görüntü kutusu (null = tam sığdır). Tekerlek + butonlar + sürükle.
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const tersMakaslar = (ters?.makaslar ?? []).filter((m) => m.kisaDonusOnerilir);
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

  // GERÇEK OSM geometrisi projeksiyonu — görünürdeki (bu hattın) yolları 2B'ye taşır.
  // Hem çizim (yolD) hem de trenlerin RAYA SNAP'i (raydan yürüsün) bundan beslenir.
  const geoProjeksiyon = useMemo(() => {
    const pe = g.projekteEt;
    if (!g.coordluMu || !pe) return [] as { insaat: boolean; pts: GeoNokta[] }[];
    const kaynak = geometri ?? [];
    const { w, h } = g.vb;
    const out: { insaat: boolean; pts: GeoNokta[] }[] = [];
    for (const yol of kaynak) {
      const pts = yol.noktalar.map(([lat, lon]) => pe(lat, lon));
      const ic = pts.filter((p) => p.x >= -20 && p.x <= w + 20 && p.y >= -20 && p.y <= h + 20).length;
      if (ic < pts.length * 0.6) continue;
      out.push({ insaat: !!yol.insaat, pts });
    }
    return out;
  }, [g, geometri]);
  const gercekGeo = geoProjeksiyon.length > 0;
  // Snap için düz segment listesi (operasyonel yolları tercih et — dönüş/tren o hatta).
  const geoSegmentler = useMemo(() => {
    const segs: { ax: number; ay: number; bx: number; by: number }[] = [];
    for (const y of geoProjeksiyon) if (!y.insaat) for (let i = 1; i < y.pts.length; i++) segs.push({ ax: y.pts[i - 1].x, ay: y.pts[i - 1].y, bx: y.pts[i].x, by: y.pts[i].y });
    // operasyonel yoksa inşaat da olsun (yine de raya otursun)
    if (segs.length === 0) for (const y of geoProjeksiyon) for (let i = 1; i < y.pts.length; i++) segs.push({ ax: y.pts[i - 1].x, ay: y.pts[i - 1].y, bx: y.pts[i].x, by: y.pts[i].y });
    return segs;
  }, [geoProjeksiyon]);
  // Bir noktayı en yakın ray segmentine snap et + o segmentin açısını ver (tren raya otursun).
  const snapRay = (px: number, py: number): { x: number; y: number; aci: number } | null => {
    if (geoSegmentler.length === 0) return null;
    let best = Infinity, bx = px, by = py, ba = 0;
    for (const s of geoSegmentler) {
      const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1e-9;
      let tt = ((px - s.ax) * dx + (py - s.ay) * dy) / L2; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const x = s.ax + tt * dx, y = s.ay + tt * dy;
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (d2 < best) { best = d2; bx = x; by = y; ba = (Math.atan2(dy, dx) * 180) / Math.PI; }
    }
    return { x: bx, y: by, aci: ba };
  };

  // Trenleri döngü fazından örnekle (headway'le eşit aralıklı). s → fiziksel kilometraj:
  // gidiş (s≤L) düz; dönüş (s>L) geri → chain = loopLen − s. Şerit ofseti yönle işaretlenir.
  const trenler = useMemo(() => {
    if (!loop || loop.count <= 0 || periyot <= 0) return [];
    const out: { no: number; pt: GeoNokta; aci: number; gidis: boolean; durum: import("@/lib/anaray/signalling").LoopDurum; ad: string; v: number; fp: number; s: number }[] = [];
    for (let i = 0; i < loop.count; i++) {
      const faz = (t + (loop.offset ?? 0) + (i * periyot) / loop.count) % periyot;
      const smp = sampleLoop(loop.ornekler, faz);
      const gidis = smp.s <= L;
      const chain = gidis ? smp.s : loopLen - smp.s;
      // Konumu GERÇEK RAYA snap et (tren raydan yürüsün, köşe kesmesin). Yön = ilerideki
      // (seyahat yönündeki) snap noktasına göre → gidiş/dönüş oku doğru.
      const base = g.konum(chain);
      const s0 = gercekGeo ? snapRay(base.x, base.y) : null;
      const cx = s0 ? s0.x : base.x, cy = s0 ? s0.y : base.y;
      // OK yönü (seyahat): gidiş ileri, dönüş geri → ok doğru yöne baksın.
      const ilerideChain = gidis ? Math.min(line.length, chain + 4) : Math.max(0, chain - 4);
      const b1 = g.konum(ilerideChain);
      const s1 = gercekGeo ? snapRay(b1.x, b1.y) : null;
      const fx = (s1 ? s1.x : b1.x) - cx, fy = (s1 ? s1.y : b1.y) - cy;
      const aci = (Math.atan2(fy, fx) * 180) / Math.PI;
      // ÇİFT ŞERİT ofseti: DAİMA ileri (chain artan) yöne DİK — gidiş +şerit, dönüş −şerit.
      // (Eski hata: ofset seyahat yönüne göreydi → dönüşün ters açısı yüzünden iki tren aynı
      //  şeride düşüyordu. Artık ileri-yön DİK'i sabit → iki yön GERÇEKTEN ayrı şeritte.)
      const bf = g.konum(Math.min(line.length, chain + 4));
      const sf = gercekGeo ? snapRay(bf.x, bf.y) : null;
      const ffx = (sf ? sf.x : bf.x) - cx, ffy = (sf ? sf.y : bf.y) - cy;
      const flen = Math.hypot(ffx, ffy) || 1;
      const pox = -ffy / flen, poy = ffx / flen;
      const yon = gidis ? 1 : -1;
      out.push({ no: i + 1, pt: { x: cx + pox * GAP * yon, y: cy + poy * GAP * yon }, aci, gidis, durum: smp.durum, ad: smp.ad, v: smp.v, fp: chain, s: smp.s });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, t, periyot, L, loopLen, g, line.length, geoSegmentler, gercekGeo]);

  // BLOK İŞGAL (şematikle aynı): bir trenin bulunduğu blok kırmızıya döner. Blok
  // sınırları (kilometraj) → o aralığın rayı örneklenip snap edilerek kırmızı çizilir.
  const blokDoluluk = useMemo(() => {
    if (!blocks || blocks.length < 2 || trenler.length === 0) return [] as string[];
    const occ = new Set<number>();
    for (const tr of trenler) {
      const c = tr.fp;
      for (let j = 0; j < blocks.length - 1; j++) if (c >= blocks[j] && c < blocks[j + 1]) { occ.add(j); break; }
    }
    const out: string[] = [];
    for (const j of occ) {
      const b0 = blocks[j], b1 = blocks[j + 1];
      const N = Math.max(3, Math.ceil((b1 - b0) / 60));
      const pts: GeoNokta[] = [];
      for (let s = 0; s <= N; s++) {
        const c = b0 + ((b1 - b0) * s) / N;
        const p = g.konum(c);
        const sp = gercekGeo ? snapRay(p.x, p.y) : null;
        pts.push(sp ? { x: sp.x, y: sp.y } : p);
      }
      out.push(pts.map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, trenler, g, gercekGeo, geoSegmentler]);

  const yolD = g.yol.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // İKİ YÖN ŞERİDİ (gidiş + / dönüş −) — merkez hattı örnekle, İLERİ-yöne dik ±GAP ofset;
  // trenler bu şeritlere oturur → haritada gidiş-geliş (çift hat) açıkça betimlenir.
  const seritler = useMemo(() => {
    const N = 160;
    const g1: GeoNokta[] = [], g2: GeoNokta[] = [];
    const aci: number[] = [];      // her örnekte ileri-yön açısı (chevron için)
    for (let i = 0; i <= N; i++) {
      const chain = (line.length * i) / N;
      const base = g.konum(chain);
      const s0 = gercekGeo ? snapRay(base.x, base.y) : null;
      const cx = s0 ? s0.x : base.x, cy = s0 ? s0.y : base.y;
      const bf = g.konum(Math.min(line.length, chain + 4));
      const sf = gercekGeo ? snapRay(bf.x, bf.y) : null;
      const ffx = (sf ? sf.x : bf.x) - cx, ffy = (sf ? sf.y : bf.y) - cy;
      const flen = Math.hypot(ffx, ffy) || 1;
      const ox = -ffy / flen, oy = ffx / flen;
      g1.push({ x: cx + ox * GAP, y: cy + oy * GAP });
      g2.push({ x: cx - ox * GAP, y: cy - oy * GAP });
      aci.push((Math.atan2(ffy, ffx) * 180) / Math.PI);
    }
    const path = (pts: GeoNokta[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    // Yön okları (chevron): gidiş → ileri (aci); dönüş → geri (aci+180). Periyodik.
    const oklarGidis: { x: number; y: number; aci: number }[] = [];
    const oklarDonus: { x: number; y: number; aci: number }[] = [];
    for (let i = 10; i < N - 4; i += 22) {
      oklarGidis.push({ x: g1[i].x, y: g1[i].y, aci: aci[i] });
      oklarDonus.push({ x: g2[i].x, y: g2[i].y, aci: aci[i] + 180 });
    }
    return { gidis: path(g1), donus: path(g2), oklarGidis, oklarDonus };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, line.length, gercekGeo, geoSegmentler]);

  // Çizim yolları (geoProjeksiyon'dan path string'i) — gerçek kavisli hiza.
  const geoYollar = useMemo(
    () => geoProjeksiyon.map((y) => ({ insaat: y.insaat, d: y.pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") })),
    [geoProjeksiyon]
  );
  const featureSimge = (f: HatOzellik, idx: number) => {
    const b = g.konum(f.pos);
    const sr = gercekGeo ? snapRay(b.x, b.y) : null; // özellikler de raya otursun
    const p = sr ? { x: sr.x, y: sr.y } : b;
    if (f.kind === "makas") {
      return <rect key={`f${idx}`} x={p.x - 4} y={p.y - 4} width={8} height={8} transform={`rotate(45 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`} fill={CK.gold} stroke="#fff" strokeWidth={1}><title>{f.ad}</title></rect>;
    }
    if (f.kind === "sinyal") {
      return <circle key={`f${idx}`} cx={p.x} cy={p.y} r={3.4} fill={f.tersIsletme ? CK.orange : CK.good} stroke="#fff" strokeWidth={1}><title>{f.ad}</title></circle>;
    }
    // yaya / karayolu geçidi
    return <g key={`f${idx}`} stroke={CK.red} strokeWidth={1.4} strokeLinecap="round"><line x1={p.x - 3} y1={p.y - 3} x2={p.x + 3} y2={p.y + 3} /><line x1={p.x + 3} y1={p.y - 3} x2={p.x - 3} y2={p.y + 3} /><title>{f.ad}</title></g>;
  };

  // ——— ZOOM / PAN ———
  // Hat değişince (g.vb boyutu değişir) zoom'u sıfırla — render-zamanı türetilmiş state deseni.
  const vbSig = `${g.vb.w}x${g.vb.h}`;
  const [viewSig, setViewSig] = useState(vbSig);
  let etkinView = view;
  if (viewSig !== vbSig) { setViewSig(vbSig); setView(null); etkinView = null; }
  const vb = etkinView ?? { x: 0, y: 0, w: g.vb.w, h: g.vb.h };
  const enAz = g.vb.w * 0.18; // en fazla ~5.5× yakınlaştırma
  const justPanned = useRef(false);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
      setView((v) => {
        const c = v ?? { x: 0, y: 0, w: g.vb.w, h: g.vb.h };
        const f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
        const nw = Math.min(g.vb.w, Math.max(enAz, c.w * f));
        const nh = nw * (g.vb.h / g.vb.w);
        return { x: c.x + mx * c.w - mx * nw, y: c.y + my * c.h - my * nh, w: nw, h: nh };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.vb.w, g.vb.h]);
  const zoomBtn = (f: number) => setView(() => {
    const c = vb;
    const nw = Math.min(g.vb.w, Math.max(enAz, c.w * f));
    const nh = nw * (g.vb.h / g.vb.w);
    return { x: c.x + c.w / 2 - nw / 2, y: c.y + c.h / 2 - nh / 2, w: nw, h: nh };
  });
  const panDown = (e: React.PointerEvent) => { panRef.current = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, moved: false }; setPanning(true); };
  const panMove = (e: React.PointerEvent) => {
    const p = panRef.current, el = svgRef.current; if (!p || !el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) > 3) p.moved = true;
    setView({ x: p.vx - (e.clientX - p.sx) / r.width * vb.w, y: p.vy - (e.clientY - p.sy) / r.height * vb.h, w: vb.w, h: vb.h });
  };
  const panUp = () => { if (panRef.current?.moved) { justPanned.current = true; setTimeout(() => { justPanned.current = false; }, 60); } panRef.current = null; setPanning(false); };
  const yakinMi = vb.w < g.vb.w - 1;

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

      {/* Ters işletme analizi — kısa dönüş önerilen istasyonlar + filo etkisi (overlay özeti) */}
      {tersMakaslar.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-[0.72rem]" style={{ background: CK.amberBg, border: `1px solid ${CK.amber}`, color: CK.amberInk }}>
          <span className="font-semibold">↺ Ters işletme:</span>
          <span><b>{tersMakaslar.length}</b> istasyon makasında kısa dönüş önerilir (haritada ↺)</span>
          {ters?.filo && ters.filo.kisaDonusTasarruf > 0 && (
            <span>· filo: gereken <b>{ters.filo.gerekenArac}</b> → kısa dönüşle <b>{ters.filo.gerekenAracKisaDonusle}</b> (−{ters.filo.kisaDonusTasarruf} araç)</span>
          )}
          <button type="button" onClick={() => setTersGoster((o) => !o)} className="ml-auto underline">{tersGoster ? "gizle" : "göster"}</button>
        </div>
      )}

      {/* Hız sınırı & kurp konfor özeti — haritada km/h işaretleri tıklanabilir (popup) */}
      {hizKisitlari.length > 0 && (() => {
        const konforlu = hizKisitlari.filter((k) => k.tur === "kurp" && (k.seviye === "asim" || k.seviye === "kalabalik"));
        const asim = konforlu.filter((k) => k.seviye === "asim").length;
        const kritik = asim > 0;
        return (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-[0.72rem]" style={{ background: kritik ? "#FDECEC" : CK.goodBgSoft, border: `1px solid ${kritik ? CK.red : brand.border}`, color: kritik ? CK.red : brand.inkSoft }}>
            <span className="font-semibold" style={{ color: brand.ink }}>⏱ Hız sınırı önerileri:</span>
            <span><b>{hizKisitlari.length}</b> kısıt haritada işaretli (km/h — <b>tıkla</b> → detay){konforlu.length > 0 ? ` · ${konforlu.length} kurpta konfor önerisi` : ""}{asim > 0 ? ` (${asim} aşım)` : ""}</span>
            {konforlu.length > 0 && <span style={{ color: brand.muted }}>{yolcuVeriVar ? "kurplar istasyon yolcu sayısına eşli" : "kurplar talep doluluğuna eşli"}</span>}
          </div>
        );
      })()}

      <div className="relative overflow-hidden rounded-lg border" style={{ borderColor: brand.border, background: g.coordluMu ? "linear-gradient(160deg,#F5F9F7 0%,#E9F1EE 55%,#DEE9E5 100%)" : "linear-gradient(160deg,#FBFCFD 0%,#EEF3F6 100%)" }}>
        {/* Zoom kontrolleri (tekerlekle de yakınlaş/uzaklaş; sürükleyerek kaydır) */}
        <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-md border shadow-sm" style={{ borderColor: brand.border, background: "rgba(255,255,255,0.92)" }}>
          <button type="button" onClick={() => zoomBtn(1 / 1.4)} title="Yakınlaştır" className="px-2.5 py-1 text-base font-bold leading-none hover:bg-slate-100" style={{ color: brand.ink }}>+</button>
          <button type="button" onClick={() => zoomBtn(1.4)} title="Uzaklaştır" className="border-t px-2.5 py-1 text-base font-bold leading-none hover:bg-slate-100" style={{ color: brand.ink, borderColor: brand.border }}>−</button>
          {yakinMi && <button type="button" onClick={() => setView(null)} title="Tam sığdır" className="border-t px-2.5 py-1 text-[0.65rem] leading-none hover:bg-slate-100" style={{ color: brand.muted, borderColor: brand.border }}>⤢</button>}
        </div>
        <svg ref={svgRef} viewBox={`${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`} width="100%" style={{ display: "block", cursor: panning ? "grabbing" : "grab", touchAction: "none" }} role="img" aria-label="Coğrafi canlı ağ"
          onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp} onPointerLeave={panUp}>
          {/* İz — gerçek OSM geometrisi varsa onu (kavisli hiza), yoksa düz istasyon-çizgisi */}
          {gercekGeo ? (
            <>
              {/* kılıf (beyaz) */}
              {geoYollar.map((y, i) => (
                <path key={`gc${i}`} d={y.d} fill="none" stroke="#fff" strokeWidth={y.insaat ? 4.5 : 6} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {/* gerçek track: operasyonel düz, inşaat kesikli. Yön rayları çizilince taban
                  soluklaşır (çift-hat baskın olsun); inşaat hatları tam kalır (bilgi). */}
              {geoYollar.map((y, i) => (
                <path key={`g${i}`} d={y.d} fill="none" stroke={y.insaat ? CK.amber : brand.route} strokeWidth={y.insaat ? 1.8 : 2.6}
                  strokeOpacity={y.insaat ? 0.8 : (loop && periyot > 0 ? 0.35 : 1)} strokeDasharray={y.insaat ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </>
          ) : (
            <>
              <path d={yolD} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
              <path d={yolD} fill="none" stroke={brand.route} strokeWidth={3} strokeOpacity={loop && periyot > 0 ? 0.35 : 1} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}

          {/* İki YÖN ŞERİDİ — gidiş (mavi) + / dönüş (turuncu) − : gidiş-geliş çift hat betimi */}
          {/* İKİ YÖN RAYI (şematik kalitesinde çift hat) — beyaz kılıf + renkli ray (gidiş mavi,
              dönüş turuncu) + periyodik yön chevron'ları (▶ gidiş / ◀ dönüş). */}
          {loop && periyot > 0 && (
            <>
              <path d={seritler.gidis} fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
              <path d={seritler.donus} fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
              <path d={seritler.gidis} fill="none" stroke={UP_COL} strokeWidth={1.9} strokeOpacity={0.8} strokeLinecap="round" strokeLinejoin="round" />
              <path d={seritler.donus} fill="none" stroke={DOWN} strokeWidth={1.9} strokeOpacity={0.8} strokeLinecap="round" strokeLinejoin="round" />
              {seritler.oklarGidis.map((o, i) => (
                <g key={`og${i}`} transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)}) rotate(${o.aci.toFixed(1)})`}>
                  <path d="M-2,-2.4 L2.4,0 L-2,2.4" fill="none" stroke={UP_COL} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}
              {seritler.oklarDonus.map((o, i) => (
                <g key={`od${i}`} transform={`translate(${o.x.toFixed(1)} ${o.y.toFixed(1)}) rotate(${o.aci.toFixed(1)})`}>
                  <path d="M-2,-2.4 L2.4,0 L-2,2.4" fill="none" stroke={DOWN} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}
            </>
          )}

          {/* Blok işgali — işgal edilen blok rayı kırmızı (şematikle aynı) */}
          {blokDoluluk.map((d, i) => (
            <path key={`bd${i}`} d={d} fill="none" stroke={CK.red} strokeWidth={5} strokeOpacity={0.32} strokeLinecap="round" />
          ))}

          {/* Sinyal lambaları (makas/geçit artık aşağıdaki hız-kısıt işaretinde km/h ile). */}
          {features.map((f, i) => (f.kind === "sinyal" ? featureSimge(f, i) : null))}

          {/* Ters işletme: kısa dönüş önerilen istasyon makasları ↺ (overlay) */}
          {tersGoster && tersMakaslar.map((m, i) => {
            const b = g.konum(m.konum);
            const sp = gercekGeo ? snapRay(b.x, b.y) : null;
            const p = sp ? { x: sp.x, y: sp.y } : b;
            return (
              <g key={`ters${i}`}>
                <circle cx={p.x} cy={p.y} r={6.5} fill="#fff" stroke={CK.amber} strokeWidth={1.8} />
                <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill={CK.amberInk}>↺</text>
                <title>{m.ad} — kısa dönüş önerilir (sessiz taraf %{Math.round(m.kisaDonusYuzde)})</title>
              </g>
            );
          })}

          {/* HIZ SINIRI İŞARETLERİ (makas/geçit/tehlike/kurp) — tip ikonu + km/h; kurpta konfor
              önerisi (≤hız) + renk (aşım kırmızı, kalabalık amber). TIKLA → popup (detay). */}
          {hizKisitlari.map((k, i) => {
            const b = g.konum(k.konum);
            const sp = gercekGeo ? snapRay(b.x, b.y) : null;
            const p = sp ? { x: sp.x, y: sp.y } : b;
            const kritik = k.seviye === "asim";
            const konfor = k.seviye === "kalabalik";
            const renk = kritik ? CK.red : k.tur === "makas" ? CK.gold : k.tur === "tehlike" ? CK.red : k.tur === "hemzemin" ? CK.orange : konfor ? CK.amberInk : brand.muted;
            const ikon = k.tur === "makas" ? "◆" : k.tur === "hemzemin" ? "✕" : k.tur === "tehlike" ? "!" : "⤾";
            const gHiz = k.tur === "kurp" && k.oneriVKmh != null ? `≤${k.oneriVKmh}` : `${k.vmax}`;
            const sec = seciliKisit === i;
            return (
              <g key={`hk${i}`} onClick={() => { if (justPanned.current) return; setSeciliKisit(sec ? null : i); setSecili(null); }} style={{ cursor: "pointer" }}>
                {sec && <circle cx={p.x} cy={p.y} r={10} fill="none" stroke={renk} strokeWidth={1.3} strokeOpacity={0.6} />}
                <circle cx={p.x} cy={p.y} r={6} fill="#fff" stroke={renk} strokeWidth={sec ? 2.2 : 1.6} />
                <text x={p.x} y={p.y + 2.8} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={renk}>{ikon}</text>
                <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={7} fontWeight={800} fill={renk}>{gHiz}</text>
                <title>{`${k.ad}: ${k.detay}${k.tur === "kurp" && k.konforMesaj ? " — " + k.konforMesaj : ""} · tıkla → detay`}</title>
              </g>
            );
          })}

          {/* İstasyonlar — raya snap (koordinatsız/yaklaşık olanlar da rayın üstüne otursun) */}
          {g.istasyonlar.map((s, i) => {
            const sp = gercekGeo ? snapRay(s.nokta.x, s.nokta.y) : null;
            const sx = sp ? sp.x : s.nokta.x, sy = sp ? sp.y : s.nokta.y;
            return (
              <g key={`s${i}`}>
                {s.depot ? (
                  <rect x={sx - 4.5} y={sy - 4.5} width={9} height={9} fill={brand.ink} stroke="#fff" strokeWidth={1.4} />
                ) : (
                  <circle cx={sx} cy={sy} r={s.tip && s.tip !== "istasyon" ? 2.6 : 4} fill={s.tip && s.tip !== "istasyon" ? brand.muted : "#fff"} stroke={brand.ink} strokeWidth={1.6} />
                )}
                {(!s.tip || s.tip === "istasyon" || s.depot) && (
                  <text x={sx} y={sy - 8} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={brand.inkSoft}>{s.ad}</text>
                )}
              </g>
            );
          })}

          {/* Trenler — durum halkası (ne yaptığı) + no + tıkla→detay */}
          {trenler.map((tr, i) => {
            const sec = secili === i;
            const stil = DURUM_STIL[tr.durum];
            return (
              <g key={`t${i}`} onClick={() => { if (justPanned.current) return; setSecili(sec ? null : i); }} style={{ cursor: "pointer" }}>
                <circle cx={tr.pt.x} cy={tr.pt.y} r={7} fill="transparent" />
                <circle cx={tr.pt.x} cy={tr.pt.y} r={sec ? 9 : 7} fill="none" stroke={stil.renk} strokeWidth={sec ? 2.2 : 1.4} strokeOpacity={0.9} />
                <g transform={`translate(${tr.pt.x.toFixed(1)} ${tr.pt.y.toFixed(1)}) rotate(${tr.aci.toFixed(1)})`}>
                  <rect x={-6} y={-3.2} width={12} height={6.4} rx={1.6} fill={tr.gidis ? UP_COL : DOWN} stroke="#fff" strokeWidth={sec ? 1.6 : 1} />
                  <path d="M4,-2 L7,0 L4,2 Z" fill={tr.gidis ? UP_COL : DOWN} />
                </g>
                <text x={tr.pt.x} y={tr.pt.y - 10} textAnchor="middle" fontSize={6.5} fontWeight={700} fill={stil.renk}>{tr.no}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tıklanan trenin detayı — şematikle AYNI kutu (durum + tam-tur hareket/duruş dökümü) */}
      {secili != null && trenler[secili] && loop && (
        <TrenDetayKutusu
          st={{ durum: trenler[secili].durum, ad: trenler[secili].ad, v: trenler[secili].v, fp: trenler[secili].fp, up: trenler[secili].gidis }}
          no={trenler[secili].no}
          dokum={loop.dokum}
          periyot={periyot}
          cakismaVar={false}
          onKapat={() => setSecili(null)}
        />
      )}

      {/* Tıklanan hız kısıtının popup detayı (hız sınırı önerisi + kurp konfor) */}
      {seciliKisit != null && hizKisitlari[seciliKisit] && (() => {
        const k = hizKisitlari[seciliKisit];
        const turAd = k.tur === "makas" ? "Makas (turnout)" : k.tur === "hemzemin" ? "Hemzemin geçit" : k.tur === "tehlike" ? "Tehlike noktası" : "Kurp (yatay kavis)";
        const kritik = k.seviye === "asim", konfor = k.seviye === "kalabalik";
        const renk = kritik ? CK.red : konfor ? CK.amberInk : brand.ink;
        return (
          <div className="mt-2 rounded-lg border-l-4 px-3 py-2.5 text-[0.75rem]" style={{ borderColor: renk, background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.10)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold" style={{ color: renk }}>⏱ {k.ad} — {turAd}</span>
              <button type="button" onClick={() => setSeciliKisit(null)} className="text-[0.7rem] underline" style={{ color: brand.muted }}>kapat ✕</button>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5" style={{ color: brand.inkSoft }}>
              <span>Konum: <b>{(k.konum / 1000).toFixed(2)} km</b></span>
              <span>Hız sınırı: <b>{k.vmax} km/h</b></span>
              {k.tur === "kurp" && k.oneriVKmh != null && <span>Önerilen (konfor): <b style={{ color: renk }}>≤{k.oneriVKmh} km/h</b></span>}
            </div>
            <div className="mt-1" style={{ color: k.tur === "kurp" && (kritik || konfor) ? renk : brand.muted }}>
              {k.tur === "kurp" && k.konforMesaj ? k.konforMesaj : k.detay}
            </div>
            <div className="mt-1 text-[0.68rem]" style={{ color: brand.faint }}>Bu kısıtı <b>Ringler (KUR)</b>'da düzenleyebilirsiniz — değişiklik haritaya anında yansır.</div>
          </div>
        );
      })()}

      {/* Lejant */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.65rem]" style={{ color: brand.muted }}>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: UP_COL }} /> gidiş ▶</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: DOWN }} /> ◀ dönüş</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: CK.good }} /> sinyal</span>
        {hizKisitlari.length > 0 && <span className="flex items-center gap-1"><span className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[0.55rem] font-bold" style={{ border: `1.4px solid ${CK.gold}`, color: CK.gold }}>◆</span> hız sınırı km/h — <b>tıkla → detay</b></span>}
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
