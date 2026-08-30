"use client";

// raysim — CANLI AĞ SİMÜLASYONU ("sim videosu"), ÇİFT ŞERİT (double-track).
// Gidiş üst şerit / dönüş alt şerit — iki yön ayrı hatta akar (gerçek hat gibi).
// Trenler vagon kutucuğu + yön oku ile çizilir; blok işgali her şeritte ayrı
// kırmızıya döner; saat + oynat/duraklat + hız + zaman çubuğu.
// Trenler önceden hesaplanmış yörüngelerden (t→konum) arc-length ile konumlanır.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RailNetwork, Route, Line } from "@/lib/anaray/types";
import type { SignalTrain, DepotInfo } from "@/lib/anaray/signalling";
import { saat } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";
import { CK, ASPEKT } from "@/lib/anaray/chartkit";

const VBW = 860;
// Yükseklik İÇERİĞE göre: depo/spur gibi alt kollar varsa (düğüm y'si büyük) alan
// açılır, düz koridorda (proje hattı) açılmaz — aksi halde şeritlerin altında
// kocaman boş bir bant kalıyordu.
const VBH_MIN = 190;
const vbhHesap = (nodeY: number[]) => Math.max(VBH_MIN, Math.max(70, ...nodeY) + 120);
const HIZLAR = [1, 5, 15, 30, 60];
// Yön kodlaması TÜM modüllerde aynı (Bildfahrplan/TrainGraphChart ile birebir):
// gidiş = mavi · dönüş = turuncu (chartkit'te valide edilmiş çift).
const UP_COL = CK.blue;
const DOWN = CK.orange;
const GAP = 9; // şeritlerin merkez hattından dik ofseti (px)
// YÖN 180° ÇEVRİK (geometri/normaller OLDUĞU GİBİ — ayna YOK): gidiş ALT şeritte
// (fp=s → ekranda sol→sağ), dönüş ÜST şeritte (fp=L-s → sağ→sol). İstasyon adları
// daima FİZİKSEL üst şeridin (UST=-1) üstüne yazılır → raylar arasına düşmez.
const UP_SIDE = 1;    // gidiş → alt şerit
const DOWN_SIDE = -1; // dönüş → üst şerit
const UST = -1;       // fiziksel üst şerit (etiket/leader yerleşimi için)

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
  network, route, line, blocks, up, down, tMax, trainLen = 40, faultBlocks = [], onBlockClick, depots = [],
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
  depots?: DepotInfo[];
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

  // Rota istasyonlarının ekran koordinatı (arc-length taban noktaları).
  const nodeById = useMemo(() => Object.fromEntries(network.nodes.map((n) => [n.id, n])), [network]);
  // Lane geometrisi YALNIZ yolcu istasyonlarının network koordinatlarından kurulur;
  // hemzemin geçit duruşları (tip:'gecit') network düğümü taşımaz → geometriye girmez
  // (fp konumu laneAt ile hesaplanır), aksi halde x=0 geometriyi bozardı.
  const basePts = useMemo(
    () => line.stations.filter((st) => st.tip !== "gecit").map((st) => ({ fp: st.position, x: nodeById[st.id]?.x ?? 0, y: nodeById[st.id]?.y ?? 0 })),
    [line, nodeById]
  );

  const VBH = useMemo(() => vbhHesap(network.nodes.map((n) => n.y)), [network]);

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
    // Yer tutucu SVG ile aynı en-boy oranında olsun → mount'ta sıçrama olmaz.
    return <div className="w-full animate-pulse rounded-md" style={{ background: CK.track, aspectRatio: `${VBW} / ${VBH}` }} aria-hidden />;
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
  // Fiziksel fp korunur (gidiş s:0→L, dönüş L→0). 180° yön çevirme ŞERİT
  // ATAMASIYLA yapılır (gidiş=alt UP_SIDE, dönüş=üst DOWN_SIDE) → geometri/normaller
  // olduğu gibi, istasyon adları üstte, hiza bozulmaz.
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
    occ.has(ahead) ? ASPEKT.kirmizi : occ.has(after) ? ASPEKT.sari : ASPEKT.yesil;

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
    const col = x.up ? UP_COL : DOWN;
    // yön: gidiş +tangent (alt şerit sol→sağ), dönüş -tangent (üst şerit sağ→sol)
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

  // Depo (parklanma) — gidiş (alt) şeridinin yanında bir yard kutusu: bekleyen
  // trenler dolu (mavi), çıkanlar soluk. Zaman ilerledikçe kuyruk boşalır (releaseTimes>t).
  const depotBekleyen = (d: DepotInfo) => d.releaseTimes.filter((rt) => rt > t + 1e-6).length;
  const depotMark = (d: DepotInfo) => {
    const waiting = depotBekleyen(d);
    const dispatched = d.queued - waiting;
    const lp = laneAt(d.position, UP_SIDE);          // üst şerit üzerindeki bağlantı noktası
    const bc = offsetAt(d.position, GAP + 30, UP_SIDE); // kutu merkezi (şeridin üstünde)
    const boxW = Math.max(34, d.queued * 8 + 10), boxH = 17;
    const bx = bc.x - boxW / 2, by = bc.y - boxH / 2;
    return (
      <g key={`dep${d.id}`}>
        <line x1={lp.x} y1={lp.y} x2={bc.x} y2={by + boxH} stroke={brand.faint} strokeWidth={1} strokeDasharray="2 2" />
        <rect x={bx} y={by} width={boxW} height={boxH} rx={3} fill={CK.track} stroke={brand.borderStrong} strokeWidth={1} />
        {Array.from({ length: d.queued }).map((_, i) => {
          const gone = i < dispatched; // baştan çıkanlar soluk
          return <rect key={i} x={bx + 6 + i * 8} y={by + 4.5} width={6} height={8} rx={1}
            fill={gone ? "none" : UP_COL} stroke={gone ? brand.faint : "#fff"} strokeWidth={gone ? 1 : 0.8} opacity={gone ? 0.45 : 1} />;
        })}
        <rect x={bc.x - (`🅿 ${waiting}/${d.queued} hazır`.length * 2.6 + 4)} y={by - 11} width={(`🅿 ${waiting}/${d.queued} hazır`.length * 2.6 + 4) * 2} height={11} rx={2} fill={brand.surface} opacity={0.85} />
        <text x={bc.x} y={by - 3} fill={brand.inkSoft} fontSize={8} fontWeight={700} textAnchor="middle">🅿 {waiting}/{d.queued} hazır</text>
      </g>
    );
  };
  const depoToplam = depots.reduce((a, d) => a + d.queued, 0);
  const depoBekleyenToplam = depots.reduce((a, d) => a + depotBekleyen(d), 0);

  // İstasyon ADI yerleşimi — ÇAKIŞMA-FARKINDA PULL-UP: adları soldan sağa gezip
  // her birini, o kademede yatay biniş YOKSA en alt kademeye koyar; biniş varsa
  // bir üst kademeye "yukarı çeker". Sabit iki-kademe, yakın iki uzun adı hâlâ
  // üst üste bindirebiliyordu → kademe sayısı ihtiyaca göre artar, hiçbir ad örtülmez.
  const LBL_PAD = 3;      // etiketler arası asgari yatay boşluk (px)
  const LBL_TIER = 16;    // kademe başına yukarı çekme (px)
  const LBL_BASE = -12;   // en alt kademenin şeritten ofseti (px)
  const stationLabels = line.stations
    .filter((st) => st.tip !== "gecit") // geçit duruşları yolcu istasyonu değil → ayrı işaretlenir
    .map((st) => {
      const top = laneAt(st.position, UST);
      const w = st.name.length * 5.3 + 8; // ~fontSize 9.5 metin genişliği tahmini
      return { st, x: top.x, baseY: top.y, w, x1: top.x - w / 2, x2: top.x + w / 2, tier: 0 };
    })
    .sort((a, b) => a.x - b.x);
  // Hemzemin geçit koruma duruşları — ayrı işaret (⊞) + laneAt konumu
  const gecitler = line.stations.filter((st) => st.tip === "gecit").map((st) => ({ st, p: laneAt(st.position, UST) }));
  const tierEnds: number[] = []; // her kademedeki son etiketin sağ kenarı
  for (const lb of stationLabels) {
    let tier = 0;
    while (tier < tierEnds.length && lb.x1 < tierEnds[tier] + LBL_PAD) tier++;
    lb.tier = tier;
    tierEnds[tier] = lb.x2;
  }
  // En üst etiket kutusunun üst kenarı (kademelere göre).
  const enUstY = stationLabels.reduce((m, lb) => Math.min(m, lb.baseY + LBL_BASE - lb.tier * LBL_TIER - 8.5), Infinity);
  const etiketTepe = Number.isFinite(enUstY) ? enUstY : 40;
  // HUD (saat + tren/depo sayaçları) DAİMA en üst etiketin de üstüne istiflenir:
  // istasyon adları şeridin üstüne (y küçük) yazıldığından, sabit y'li HUD ile aynı
  // üst şeridi paylaşıp çakışıyordu → HUD'u etiketlerin üstüne kaydır (6 px boşluk).
  // Orijinal HUD düzeni: saat kutusu translate(16,26) [üst kenar y=10], sayaçlar y=22/38
  // [en alt kenar ~41]. Tüm bloğu tek kaydırmayla (hudDY) yukarı taşırız.
  const hudDY = Math.min(0, etiketTepe - 6 - 41); // HUD alt kenarı (41) etiketlerin 6px üstüne
  // Otomatik üst pay: en üstteki eleman (saat kutusu üst kenarı = 10+hudDY veya etiketTepe)
  // SVG tepesini aşarsa viewBox'ı yukarı genişlet — içerik sabit, taşma yerine boşluk.
  const topMost = Math.min(etiketTepe, 10 + hudDY);
  const ustPay = topMost < 4 ? Math.ceil(4 - topMost) : 0;

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 ${-ustPay} ${VBW} ${VBH + ustPay}`} className="w-full h-auto" role="img" aria-label="Canlı ağ simülasyonu (çift hat)">
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

        {/* İstasyonlar — peron markası + dik iniş çubuğu (etiketler AYRI katmanda) */}
        {line.stations.filter((st) => st.tip !== "gecit").map((st) => {
          const c = segAt(st.position);
          const u = laneAt(st.position, UP_SIDE);
          const d = laneAt(st.position, DOWN_SIDE);
          return (
            <g key={st.id}>
              <line x1={u.x} y1={u.y} x2={d.x} y2={d.y} stroke={brand.ink} strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={c.x} cy={c.y} r={4} fill={brand.surface} stroke={brand.ink} strokeWidth={2} />
            </g>
          );
        })}
        {/* Hemzemin geçit koruma duruşları — ⊞ işareti (trenler burada durur; blok sınırı → sinyal) */}
        {gecitler.map(({ st, p }) => (
          <g key={st.id}>
            <rect x={p.x - 4} y={p.y - 10} width={8} height={8} rx={1} fill={brand.surface} stroke={CK.amber} strokeWidth={1.4} />
            <line x1={p.x - 4} y1={p.y - 6} x2={p.x + 4} y2={p.y - 6} stroke={CK.amber} strokeWidth={1} />
            <line x1={p.x} y1={p.y - 10} x2={p.x} y2={p.y - 2} stroke={CK.amber} strokeWidth={1} />
            <title>{`Hemzemin geçit: ${st.name} — koruma duruşu ${Math.round(st.dwell)} s`}</title>
          </g>
        ))}
        {/* Depolar (parklanma alanları) — gidiş (alt) şeridinin yanında */}
        {depots.map(depotMark)}

        {/* Trenler */}
        {upNow.map(wagon)}
        {downNow.map((x, i) => wagon(x, i + upNow.length))}

        {/* İstasyon ADLARI — EN ÜST katman (depo kutuları + trenlerden SONRA çizilir →
            hiçbir tren kutusu / depo etiketi durak adını örtemez). Gerçek adlar
            uzundur ("Mevlana Kültür Merkezi") → çakışma-farkında PULL-UP ile
            gerektiği kadar kademeye çekilir + her ad arkasına yüzey halesi:
            komşu etiketler yatayda binişse ayrı kademeye taşınır, üst üste yazı olmaz. */}
        {stationLabels.map((lb) => {
          const ty = lb.baseY + LBL_BASE - lb.tier * LBL_TIER; // kademeye göre yukarı çekme
          return (
            <g key={`lbl${lb.st.id}`}>
              <line x1={lb.x} y1={lb.baseY - 6} x2={lb.x} y2={ty + 2} stroke={CK.faint} strokeWidth={0.8} />
              <rect x={lb.x - lb.w / 2} y={ty - 8.5} width={lb.w} height={11} rx={2} fill={brand.surface} opacity={0.85} />
              <text x={lb.x} y={ty} fill={brand.muted} fontSize={9.5} textAnchor="middle">{lb.st.name}</text>
            </g>
          );
        })}

        {/* Saat — HUD etiketlerin üstüne istiflenir (hudDY), durak adlarıyla çakışmaz */}
        <g transform={`translate(16,${26 + hudDY})`}>
          <rect x={-6} y={-16} width={92} height={24} rx={4} fill={brand.ink} />
          <text x={40} y={1} fill="#fff" fontSize={14} fontWeight={700} textAnchor="middle" className="font-mono">{saat(t)}</text>
        </g>
        {/* Aktif tren sayısı + depoda bekleyen — aynı HUD kaydırmasıyla */}
        <text x={VBW - 10} y={22 + hudDY} fill={brand.muted} fontSize={11} textAnchor="end">Hatta {aktifSayi} tren</text>
        {depoToplam > 0 && (
          <text x={VBW - 10} y={38 + hudDY} fill={brand.inkSoft} fontSize={10} textAnchor="end">🅿 {depoBekleyenToplam}/{depoToplam} depoda çıkışa hazır</text>
        )}
        {/* Şerit etiketleri — üst = Dönüş (sağ→sol), alt = Gidiş (sol→sağ) */}
        <text x={10} y={VBH - 30} fill={DOWN} fontSize={10} fontWeight={600}>◀ Dönüş (üst şerit)</text>
        <text x={10} y={VBH - 12} fill={UP_COL} fontSize={10} fontWeight={600}>Gidiş (alt şerit) ▶</text>
      </svg>

      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={oynatDurdur} className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90" style={{ background: brand.red }}>
          {oynat ? "⏸ Duraklat" : t >= T ? "↻ Baştan" : "▶ Oynat"}
        </button>
        <div className="flex items-center gap-1">
          {HIZLAR.map((h) => (
            <button key={h} onClick={() => setHiz(h)} className="rounded px-2 py-1 text-xs font-medium transition"
              style={hiz === h ? { background: brand.ink, color: "#fff" } : { background: CK.track, color: brand.inkSoft }}>
              {h}×
            </button>
          ))}
        </div>
        <input type="range" min={0} max={T} step={0.5} value={t} onChange={(e) => { setOynat(false); setT(parseFloat(e.target.value)); }}
          className="min-w-[160px] flex-1" style={{ accentColor: brand.red }} aria-label="Zaman çubuğu" />
        <span className="font-mono text-xs" style={{ color: brand.muted }}>{saat(t)} / {saat(T)}</span>
      </div>
      <p className="text-xs" style={{ color: brand.muted }}>
        <span style={{ color: DOWN }}>▬</span> Üst şerit: Dönüş (sağ→sol) · <span style={{ color: UP_COL }}>▬</span> Alt şerit: Gidiş (sol→sağ) · <span style={{ color: CK.red }}>▬</span> işgal edilen blok.
        {" "}Sinyal: <span style={{ color: ASPEKT.yesil }}>●</span> yeşil (serbest) · <span style={{ color: ASPEKT.sari }}>●</span> sarı (dikkat) · <span style={{ color: ASPEKT.kirmizi }}>●</span> kırmızı (dur). Sabit blok 3-fener mantığı canlı akıyor.
        {depoToplam > 0 && <> · 🅿 <b>Depo (parklanma):</b> bekleyen trenler sırayla headway aralığıyla servise çıkar; kutudaki dolu kareler çıkışa hazır, soluk kareler çıkmış trenlerdir.</>}
      </p>
    </div>
  );
}
