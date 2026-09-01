"use client";

// raysim — CANLI AĞ SİMÜLASYONU ("sim videosu"), ÇİFT ŞERİT (double-track).
// Gidiş üst şerit / dönüş alt şerit — iki yön ayrı hatta akar (gerçek hat gibi).
// Trenler vagon kutucuğu + yön oku ile çizilir; blok işgali her şeritte ayrı
// kırmızıya döner; saat + oynat/duraklat + hız + zaman çubuğu.
// Trenler önceden hesaplanmış yörüngelerden (t→konum) arc-length ile konumlanır.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RailNetwork, Route, Line } from "@/lib/anaray/types";
import type { SignalTrain, DepotInfo, LoopYorunge, LoopDurum } from "@/lib/anaray/signalling";
import type { HatOzellik } from "@/lib/anaray/network";
import type { TerminalConfig, DonusTip, TersMod } from "@/lib/anaray/config";
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

// Döngü durum stilleri (rozet + detay).
const DURUM_STIL: Record<LoopDurum, { renk: string; ikon: string; ad: string }> = {
  seyir: { renk: CK.good, ikon: "→", ad: "serbest seyir" },
  hizlanma: { renk: CK.blue, ikon: "↗", ad: "hızlanıyor" },
  kisit: { renk: CK.amber, ikon: "⤵", ad: "hız kısıtı" },
  dwell: { renk: brand.inkSoft, ikon: "⏸", ad: "istasyon duruşu" },
  donus: { renk: CK.orange, ikon: "🔄", ad: "terminal dönüşü" },
};
// Döngü yörüngesini bir faz anında örnekle (s kümülatif + o anki durum).
function sampleLoop(orn: LoopYorunge["ornekler"], phase: number): { s: number; durum: LoopDurum; ad: string; v: number } {
  if (orn.length === 0) return { s: 0, durum: "seyir", ad: "", v: 0 };
  if (phase <= orn[0].t) return { s: orn[0].s, durum: orn[0].durum, ad: orn[0].ad, v: 0 };
  const son = orn[orn.length - 1];
  if (phase >= son.t) return { s: son.s, durum: son.durum, ad: son.ad, v: 0 };
  let lo = 0, hi = orn.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (orn[mid].t < phase) lo = mid + 1; else hi = mid; }
  const p1 = orn[Math.max(1, lo)]; const p0 = orn[Math.max(0, lo - 1)];
  const dtt = (p1.t - p0.t) || 1; const f = (phase - p0.t) / dtt;
  return { s: p0.s + (p1.s - p0.s) * f, durum: p1.durum, ad: p1.ad, v: Math.abs(p1.s - p0.s) / dtt };
}
// Ters arama: kümülatif s hedefine EN YAKIN faz (t). gidisMi=true → yalnız gidiş kolu
// (s≤L) aranır; false → yalnız dönüş kolu (s≥L). Işınlanma düzeltmesinde yeniden-katılma
// fazını (giden→başa=0, gelen→bitiş terminali=L) bulmak için kullanılır.
function fazAtS(orn: LoopYorunge["ornekler"], sHedef: number, L: number, gidisMi: boolean): number {
  let bt = 0, bd = Infinity;
  for (const o of orn) {
    if (gidisMi && o.s > L + 1e-6) continue;
    if (!gidisMi && o.s < L - 1e-6) continue;
    const d = Math.abs(o.s - sHedef);
    if (d < bd) { bd = d; bt = o.t; }
  }
  return bt;
}

export function LiveNetwork({
  network, route, line, blocks, up = [], down = [], tMax, trainLen = 40, faultBlocks = [], onBlockClick, depots = [], features = [], loop, terminalBas, terminalSon,
  tersMod = "gidenHat", onTersMod, autoOynat = false,
}: {
  network: RailNetwork;
  route: Route;
  line: Line;
  blocks: number[];
  up?: SignalTrain[];
  down?: SignalTrain[];
  tMax: number;
  trainLen?: number;
  faultBlocks?: number[];
  onBlockClick?: (i: number) => void;
  depots?: DepotInfo[];
  features?: HatOzellik[]; // hat özellikleri: yaya/karayolu geçidi + makas (tip-ayrımlı görsel)
  /** DÖNGÜ modu: tek-tren yörüngesi + faz — trenler uçta döner (git-gel), üstlerinde durum rozeti.
   *  dagitim: her tren parklanma alanından çıkar (düz gidiş / makastan geçip ters), dispatchT'de. */
  loop?: LoopYorunge & { count: number; offset: number; dagitim?: { parkPos: number; gidis: boolean; dispatchT: number; startPhase: number }[] };
  terminalBas?: TerminalConfig; // başlangıç terminali dönüş tipi (görsel turnback biçimi)
  terminalSon?: TerminalConfig; // bitiş terminali dönüş tipi
  tersMod?: TersMod;            // ters işletme (istasyon makası kısa dönüş) modu
  onTersMod?: (m: TersMod) => void; // mod değişince kalıcı kaydet (isletme.tersMod)
  autoOynat?: boolean;          // rapor QR akışı: yüklenince otomatik oynat (?oynat=1)
}) {
  const [t, setT] = useState(0);
  const [secili, setSecili] = useState<number | null>(null); // döngüde tıklanan tren (detay kutusu)
  const [oynat, setOynat] = useState(false);
  const [hiz, setHiz] = useState(15);
  const [mounted, setMounted] = useState(false);
  // ETKİLEŞİMLİ TERS İŞLETME (SADECE istasyon makasları): bir tren istasyon makasına
  // gelince süre durur + onay pop-up. yon="giden" → tren karşı (dönüş) şeride geçip
  // başa geri döner; yon="gelen" (yalnız çift yönlü mod) → dönüş treni GİDEN hatta
  // geçip ileri (bitiş terminaline) gider.
  const [karar, setKarar] = useState<{ trainIdx: number; no: number; makasPos: number; makasAd: string; crossover: "s" | "x"; yon: "giden" | "gelen"; key: string } | null>(null);
  const [tersHareket, setTersHareket] = useState<{ idx: number; no: number; makasPos: number; t0: number; yon: "giden" | "gelen" }[]>([]);
  // Işınlanma düzeltmesi: ters işletme biten tren, fazı "olması gereken" konuma
  // sıfırlanarak yeniden servise katılır (yoksa faz durmadan aktığından ileriye ışınlanırdı).
  const [fazKaydirma, setFazKaydirma] = useState<Record<number, number>>({});
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const tRef = useRef(0);                              // saatin otoritesi (zamanlayıcı sahibi)
  const sorulan = useRef<Set<string>>(new Set());      // sorulmuş (tren:yön:makas:tur) → tekrar sorma
  const loopRef = useRef(loop);
  const tersMakasRef = useRef<{ pos: number; ad: string; crossover: "s" | "x" }[]>([]);
  const tersHareketRef = useRef(tersHareket);
  const tersAktifIdxRef = useRef<Set<number>>(new Set());
  const kararRef = useRef(karar);
  const tersModRef = useRef<TersMod>(tersMod);
  const fazKaydirmaRef = useRef(fazKaydirma);
  const vTersRef = useRef(10);                          // ters dönüş ort. hız (m/s sim)
  // DÖNGÜ motoru periyodik tek-yörüngedir → KALICI blok arızasını temsil edemez
  // (arızalı blok = sonsuz durma, periyot bozulur). Bir blok arızalıyken bu yüzden
  // SİNYAL/KUYRUK motoruna (up/down = simulateSignalled, blocked:ariza) düşeriz:
  // trenler arızalı bloğun 1 m gerisinde durup kuyruklanır. Arıza kalkınca loop döner.
  const loopAktif = !!loop && faultBlocks.length === 0;
  // Rapor QR akışı: yüklenince bir kez otomatik başlat (kısa gecikme → sahne hazır olsun).
  const otoBaslatildi = useRef(false);
  useEffect(() => {
    if (!autoOynat || otoBaslatildi.current) return;
    otoBaslatildi.current = true;
    const id = setTimeout(() => { setOynat(true); if (loopAktif && secili === null) setSecili(0); }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOynat, loopAktif]);
  const T = loopAktif ? loop!.periyot : (tMax || 1);
  const L = line.length;

  useEffect(() => {
    if (!oynat) return;
    last.current = performance.now();
    tRef.current = t;                 // oynatma başlarken saat senkron
    let durdu = false;
    // Süreyi gerçek geçen zamana göre ilerlet + ETKİLEŞİMLİ TERS İŞLETME tespiti.
    // Tespit/geri-iade ZAMANLAYICI içinde yapılır (render değil): hook sırası
    // bozulmaz, render saf kalır, setState döngüsü/donma riski olmaz.
    const ilerlet = () => {
      if (durdu) return;
      const now = performance.now();
      const d = (now - last.current) / 1000;
      last.current = now;
      if (d <= 0) return;
      let nx = tRef.current + d * hiz;
      let bitti = false;
      if (nx >= T) { nx = T; bitti = true; }
      tRef.current = nx;
      setT(nx);
      if (bitti) { setOynat(false); return; }

      // — Bir tren İSTASYON makasına ulaştı mı? (ters işletme = SADECE istasyon makası) —
      // Mod: "kapali" → hiç sorma; "gidenHat" → yalnız GİDEN trenler; "ciftYonlu" → giden + GELEN.
      const lp = loopRef.current;
      const mod = tersModRef.current;
      if (lp && mod !== "kapali" && !kararRef.current) {
        const tm = tersMakasRef.current;
        if (tm.length) {
          const w = Math.max(50, Math.min(lp.loopLen * 0.015, 140)); // tespit penceresi (m)
          const fk = fazKaydirmaRef.current;
          for (let k = 0; k < lp.count; k++) {
            if (tersAktifIdxRef.current.has(k)) continue;             // zaten dönüyor
            const dg = lp.dagitim?.[k];
            if (dg && nx < dg.dispatchT - 1e-6) continue;             // henüz depoda
            const raw = (dg ? dg.startPhase + (nx - dg.dispatchT) : nx + k * lp.offset) + (fk[k] ?? 0);
            const lap = Math.floor(raw / lp.periyot);
            const phase = (((raw % lp.periyot) + lp.periyot) % lp.periyot);
            const r = sampleLoop(lp.ornekler, phase);
            const gidis = r.s <= lp.L + 1e-6;
            if (gidis === false && mod !== "ciftYonlu") continue;     // gelen yön yalnız çift yönlü modda
            const yon: "giden" | "gelen" = gidis ? "giden" : "gelen";
            const fp = gidis ? Math.min(lp.L, r.s) : Math.max(0, lp.loopLen - r.s); // fiziksel konum (0..L)
            let sordu = false;
            for (const m of tm) {
              if (fp >= m.pos - w && fp <= m.pos + w) {
                const key = `${k}:${yon}:${Math.round(m.pos)}:${lap}`;
                if (!sorulan.current.has(key)) {
                  sorulan.current.add(key);
                  setKarar({ trainIdx: k, no: k + 1, makasPos: m.pos, makasAd: m.ad, crossover: m.crossover || "s", yon, key });
                  setOynat(false);
                  sordu = true;
                  break;
                }
              }
            }
            if (sordu) return;
          }
        }
      }

      // — Ters işletme overlay'i biten trenleri normal servise İADE et (ışınlanmadan) —
      // giden: başa (fp 0) vardı → faz s=0'a sıfırlanır (sıranın en arkası).
      // gelen: bitiş terminaline (fp L) vardı → faz s=L'ye (dönüşe geçiş) sıfırlanır.
      const th = tersHareketRef.current;
      if (th.length && lp) {
        const v = vTersRef.current;
        const biten = th.filter((rr) => rr.yon === "gelen"
          ? rr.makasPos + v * Math.max(0, nx - rr.t0) >= lp.L
          : rr.makasPos - v * Math.max(0, nx - rr.t0) <= 0);
        if (biten.length) {
          // Her biten trene: mevcut fazı, hedef s'ye denk gelecek şekilde kaydır.
          setFazKaydirma((prev) => {
            const nf = { ...prev };
            for (const b of biten) {
              const dg = lp.dagitim?.[b.idx];
              const taban = dg ? dg.startPhase + (nx - dg.dispatchT) : nx + b.idx * lp.offset;
              const hedefFaz = b.yon === "gelen"
                ? fazAtS(lp.ornekler, lp.L, lp.L, false)  // dönüşe geçiş (bitiş terminali)
                : 0;                                       // gidiş başı (s=0)
              nf[b.idx] = hedefFaz - taban;
            }
            return nf;
          });
          setTersHareket((prev) => prev.filter((rr) => !biten.some((b) => b.idx === rr.idx)));
        }
      }
    };
    // rAF görünürken pürüzsüz akıcılık sağlar; ama sekme gizliyken (arka plan,
    // odak dışı, headless) tarayıcı rAF'ı DURAKLATIR → saat donardı. setInterval
    // görünürlükten bağımsız çalışıp ilerlemeyi her koşulda garanti eder.
    const tick = () => { ilerlet(); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    const id = window.setInterval(ilerlet, 1000 / 30);
    return () => {
      durdu = true;
      window.clearInterval(id);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // TERS İŞLETME MAKASLARI = SADECE İSTASYONDAKİ makaslar (kullanıcı kuralı): her makas
  // en yakın YOLCU istasyonuna atanır; terminal (ilk/son) istasyonlar hariç tutulur
  // (onlar zaten otomatik turnback). Kısa dönüş noktası istasyon konumuna SNAP edilir →
  // ters işletme daima istasyonda başlar, ara-segment ortasında değil. (tersisletme.ts
  // makasliDurak mantığıyla tutarlı.)
  const tersMakaslar = useMemo(() => {
    const istasyonlar = line.stations.filter((st) => st.tip !== "gecit");
    const N = istasyonlar.length;
    const makasFeat = features.filter((f) => f.kind === "makas");
    const byDurak = new Map<number, { pos: number; ad: string; crossover: "s" | "x" }>();
    for (const f of makasFeat) {
      let bi = 0, bd = Infinity;
      istasyonlar.forEach((s, i) => { const d = Math.abs(s.position - f.pos); if (d < bd) { bd = d; bi = i; } });
      if (bi <= 0 || bi >= N - 1) continue;                 // terminal istasyonları hariç
      if (byDurak.has(bi)) continue;                        // durak başına tek kısa dönüş noktası
      byDurak.set(bi, { pos: istasyonlar[bi].position, ad: f.ad || istasyonlar[bi].name || "Makas", crossover: (f.crossover as "s" | "x") || "s" });
    }
    return [...byDurak.values()].sort((a, b) => a.pos - b.pos);
  }, [features, line]);
  const vTers = loop ? loop.loopLen / Math.max(1, loop.periyot) : 10; // ters dönüş ort. hızı (m/s)

  // Zamanlayıcının okuduğu ref'leri render SONRASI (effect'te) senkronla — render
  // sırasında ref yazmak/okumak React kuralına aykırı; effect doğru yer.
  useEffect(() => {
    loopRef.current = loopAktif ? loop : undefined; // arıza aktifken turnback tespiti kapalı
    tersMakasRef.current = tersMakaslar;
    kararRef.current = karar;
    tersModRef.current = tersMod;
    fazKaydirmaRef.current = fazKaydirma;
    vTersRef.current = vTers;
    tersAktifIdxRef.current = new Set(tersHareket.map((r) => r.idx));
    tersHareketRef.current = tersHareket;
  });

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
  // DÖNGÜ modu: tek-tren yörüngesinde `count` treni eşit fazla (offset=headway) yerleştir.
  const loopNow = loop ? Array.from({ length: loop.count }, (_, k) => {
    const dg = loop.dagitim?.[k];
    const trBase = { index: k, points: [], arr: 0, delay: 0 } as SignalTrain;
    // Dispatch'ten önce: parklanma alanında bekliyor (gidiş şeridinde park konumu).
    if (dg && t < dg.dispatchT - 1e-6) {
      return { tr: trBase, fp: Math.min(loop.L, dg.parkPos), up: true, v: 0, durum: "dwell" as LoopDurum, ad: "parklanma alanında sıra bekliyor" };
    }
    const taban = dg ? dg.startPhase + (t - dg.dispatchT) : t + k * loop.offset;
    // Işınlanma düzeltmesi: ters işletme sonrası yeniden-katılan trene faz kaydırma uygulanır.
    const phase = ((((taban + (fazKaydirma[k] ?? 0)) % loop.periyot) + loop.periyot) % loop.periyot);
    const r = sampleLoop(loop.ornekler, phase);
    const gidis = r.s <= loop.L + 1e-6;
    const fp = gidis ? Math.min(loop.L, r.s) : Math.max(0, loop.loopLen - r.s);
    return { tr: trBase, fp, up: gidis, v: r.v, durum: r.durum, ad: r.ad };
  }) : [];
  // Ters işletmeye geçmiş trenler normal döngüden çıkarılır (kendi overlay'iyle çizilir).
  const tersAktifIdx = new Set(tersHareket.map((r) => r.idx));
  const gorunenLoop = loopAktif ? loopNow.filter((x) => !tersAktifIdx.has(x.tr.index)) : [];
  const gidenler = loopAktif ? gorunenLoop.filter((x) => x.up) : upNow;
  const gelenler = loopAktif ? gorunenLoop.filter((x) => !x.up) : downNow;
  const aktifSayi = loopAktif ? loop!.count : upNow.length + downNow.length;

  // Ters işletmeye geçen trenler overlay'i. yon="giden": makastan başa (0) doğru DÖNÜŞ
  // (üst) şeritte geri gider. yon="gelen" (çift yönlü): makastan bitiş terminaline (L)
  // doğru GİDİŞ (alt) şeritte ilerler — dönüş treni karşı hatta geçti.
  const tersNow = loopAktif ? tersHareket.map((r) => {
    const dt = Math.max(0, t - r.t0);
    const fp = r.yon === "gelen"
      ? Math.min(L, r.makasPos + vTers * dt)
      : Math.max(0, r.makasPos - vTers * dt);
    return { idx: r.idx, no: r.no, fp, up: r.yon === "gelen" };
  }) : [];

  // Blok işgali — her şerit ayrı
  const blokIndeks = (fp: number) => {
    for (let i = 0; i < blocks.length - 1; i++) {
      if (fp >= blocks[i] - 1e-6 && fp < blocks[i + 1] - 1e-6) return i;
    }
    return -1;
  };
  const occUp = new Set<number>();
  const occDown = new Set<number>();
  for (const x of gidenler) { const i = blokIndeks(x.fp); if (i >= 0) occUp.add(i); }
  for (const x of gelenler) { const i = blokIndeks(x.fp); if (i >= 0) occDown.add(i); }

  const nb = blocks.length - 1;

  // Depo hattı (rota dışı kenarlar) statik
  const spur = network.edges
    .filter((e) => !route.edgeIds.includes(e.id))
    .map((e) => ({ a: nodeById[e.from], b: nodeById[e.to] }))
    .filter((e) => e.a && e.b);

  const oynatDurdur = () => {
    if (t >= T) { setT(0); tRef.current = 0; }
    // Oynat'a basınca, kullanıcı başka bir trene tıklamadıysa Tren 1'i otomatik seç →
    // detay kutusu açık başlar ve o an ne yaptığı (→ seyir vb.) canlı görünür.
    if (!oynat && loopAktif && secili === null) setSecili(0);
    setOynat((o) => !o);
  };
  // Ters işletme onaylandı → tren makastan karşı şeride geçer (giden→dönüş / gelen→gidiş),
  // süre yeniden akar. Overlay bitince faz sıfırlanarak ışınlanmadan servise döner.
  const onayla = () => {
    if (!karar) return;
    setTersHareket((prev) => prev.some((r) => r.idx === karar.trainIdx) ? prev : [...prev, { idx: karar.trainIdx, no: karar.no, makasPos: karar.makasPos, t0: t, yon: karar.yon }]);
    setKarar(null);
    setOynat(true);
  };
  const vazgec = () => { setKarar(null); setOynat(true); };

  const laneRed = (occ: Set<number>, side: number, key: string) =>
    [...occ].map((i) => {
      const a = laneAt(blocks[i], side);
      const b = laneAt(blocks[i + 1], side);
      return <line key={`${key}${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={brand.red} strokeWidth={4.5} strokeLinecap="round" />;
    });

  const CAR_PX = 7;
  const cars = Math.max(2, Math.min(6, Math.round(trainLen / 20))); // ~20 m/vagon
  const wagon = (x: { tr: SignalTrain; fp: number; up: boolean; v: number; durum?: LoopDurum; ad?: string }, i: number) => {
    const side = x.up ? UP_SIDE : DOWN_SIDE;
    const pos = laneAt(x.fp, side);
    const col = x.up ? UP_COL : DOWN;
    // yön: gidiş +tangent (alt şerit sol→sağ), dönüş -tangent (üst şerit sağ→sol)
    const deg = (pos.ang * 180) / Math.PI + (x.up ? 0 : 180);
    const no = `${x.tr.index + 1}`;
    const wpx = cars * CAR_PX, half = wpx / 2;
    const kmh = Math.round(x.v * 3.6);
    const lbl = offsetAt(x.fp, GAP + 13, side); // hız etiketi şerit dışına
    // DÖNGÜ rozeti: trenin üstünde o an ne olduğunu gösteren küçük kompakt pill (durum ikonu + km/h).
    const st = x.durum ? DURUM_STIL[x.durum] : null;
    const rz = offsetAt(x.fp, GAP + 25, UST); // rozet daima üstte
    const rozetW = st ? Math.max(20, (st.ikon.length + 3) * 5) : 0;
    return (
      <g key={`tr${i}`} style={{ cursor: loopAktif ? "pointer" : "default" }} onClick={loopAktif ? () => setSecili((p) => (p === x.tr.index ? null : x.tr.index)) : undefined}>
        <g transform={`translate(${pos.x},${pos.y}) rotate(${deg})`}>
          <rect x={-half} y={-4.5} width={wpx} height={9} rx={2.5} fill={col} stroke={secili === x.tr.index ? brand.ink : "#fff"} strokeWidth={secili === x.tr.index ? 1.8 : 1.2} />
          {Array.from({ length: cars - 1 }).map((_, c) => {
            const sx = -half + (c + 1) * CAR_PX;
            return <line key={c} x1={sx} y1={-4.5} x2={sx} y2={4.5} stroke="#fff" strokeWidth={0.7} opacity={0.55} />;
          })}
          <polygon points={`${half},-4.5 ${half + 5},0 ${half},4.5`} fill={col} />
        </g>
        <text x={pos.x} y={pos.y + 3} fill="#fff" fontSize={7.5} fontWeight={700} textAnchor="middle">{no}</text>
        {kmh > 1 && <text x={lbl.x} y={lbl.y} fill={col} fontSize={7.5} fontWeight={600} textAnchor="middle">{kmh}</text>}
        {st && (
          <g transform={`translate(${rz.x},${rz.y})`}>
            <line x1={0} y1={2} x2={pos.x - rz.x} y2={pos.y - rz.y} stroke={st.renk} strokeWidth={0.5} strokeDasharray="1 1" opacity={0.6} />
            <rect x={-rozetW / 2} y={-6} width={rozetW} height={9} rx={4.5} fill="#fff" stroke={st.renk} strokeWidth={0.9} />
            <text x={0} y={0.6} fill={st.renk} fontSize={5.5} fontWeight={700} textAnchor="middle">{st.ikon} {kmh > 1 ? `${kmh}` : "0"}</text>
          </g>
        )}
      </g>
    );
  };

  // Depo (parklanma) — gidiş (alt) şeridinin yanında bir yard kutusu: bekleyen
  // trenler dolu (mavi), çıkanlar soluk. CANLI dağıtımdan (loop.dagitim) türetilir →
  // depodaki tram sayısı gerçek filoyla birebir; her tren dispatchT'sinde çıktıkça azalır.
  const depoKuyrukRT = (d: DepotInfo): number[] => {
    const dg = loop?.dagitim;
    if (dg && dg.length) return dg.filter((x) => Math.abs(x.parkPos - d.position) < 1).map((x) => x.dispatchT).sort((a, b) => a - b);
    return d.releaseTimes;
  };
  // Çıkışa hazır = dispatchT'si henüz gelmemiş (t ona ulaşınca tren yola çıkar, kutu azalır).
  const depotBekleyen = (d: DepotInfo) => depoKuyrukRT(d).filter((rt) => rt >= t - 1e-6).length;
  const depotMark = (d: DepotInfo) => {
    const q = depoKuyrukRT(d).length;
    if (q <= 0) return null;
    const waiting = depotBekleyen(d);
    const dispatched = q - waiting;
    const lp = laneAt(d.position, UP_SIDE);          // üst şerit üzerindeki bağlantı noktası
    const sqW = q > 12 ? Math.max(3, Math.floor(120 / q)) : 8; // çok tram varsa kareleri daralt
    const rectW = Math.max(2, sqW - 2);
    const bc = offsetAt(d.position, GAP + 30, UP_SIDE); // kutu merkezi (şeridin üstünde)
    const boxW = Math.max(34, q * sqW + 10), boxH = 17;
    const bx = bc.x - boxW / 2, by = bc.y - boxH / 2;
    const etk = `🅿 ${waiting}/${q} hazır`;
    return (
      <g key={`dep${d.id}`}>
        <line x1={lp.x} y1={lp.y} x2={bc.x} y2={by + boxH} stroke={brand.faint} strokeWidth={1} strokeDasharray="2 2" />
        <rect x={bx} y={by} width={boxW} height={boxH} rx={3} fill={CK.track} stroke={brand.borderStrong} strokeWidth={1} />
        {Array.from({ length: q }).map((_, i) => {
          const gone = i < dispatched; // baştan çıkanlar soluk
          return <rect key={i} x={bx + 6 + i * sqW} y={by + 4.5} width={rectW} height={8} rx={1}
            fill={gone ? "none" : UP_COL} stroke={gone ? brand.faint : "#fff"} strokeWidth={gone ? 1 : 0.8} opacity={gone ? 0.45 : 1}>
            <title>{gone ? "yola çıktı" : "depoda çıkışa hazır"}</title>
          </rect>;
        })}
        <rect x={bc.x - (etk.length * 2.6 + 4)} y={by - 11} width={(etk.length * 2.6 + 4) * 2} height={11} rx={2} fill={brand.surface} opacity={0.85} />
        <text x={bc.x} y={by - 3} fill={brand.inkSoft} fontSize={8} fontWeight={700} textAnchor="middle">{etk}</text>
      </g>
    );
  };
  const depoToplam = depots.reduce((a, d) => a + depoKuyrukRT(d).length, 0);
  const depoBekleyenToplam = depots.reduce((a, d) => a + depotBekleyen(d), 0);

  // TERMİNAL DÖNÜŞ BİÇİMİ — dönüş tipine göre uçta farklı geometri çizilir; tip
  // değişince görsel de değişir (Ringler → Dönüş tipi). Gidiş (alt) ↔ dönüş (üst) uçları bağlanır.
  const TERM_TIP_KISA: Record<DonusTip, string> = { korTerminal: "kör terminal", ciftPeron: "çift peron", dongu: "balon loop", makasliGecis: "makaslı geçiş" };
  const terminalGlyph = (uc: "bas" | "son", tc?: TerminalConfig) => {
    if (!tc || basePts.length < 2) return null;
    const termPos = uc === "bas" ? 0 : L;
    const s = segAt(termPos);
    const dir = uc === "bas" ? -1 : 1;                          // hat boyunca dışa doğru
    const uo = { x: Math.cos(s.ang) * dir, y: Math.sin(s.ang) * dir };
    const pu = laneAt(termPos, UP_SIDE);                        // gidiş (alt) ucu
    const pd = laneAt(termPos, DOWN_SIDE);                      // dönüş (üst) ucu
    const R = 16;
    const col = brand.inkSoft;
    const puO = { x: pu.x + uo.x * R, y: pu.y + uo.y * R };
    const pdO = { x: pd.x + uo.x * R, y: pd.y + uo.y * R };
    const mid = { x: (pu.x + pd.x) / 2, y: (pu.y + pd.y) / 2 };
    const tip = { x: mid.x + uo.x * (R + 7), y: mid.y + uo.y * (R + 7) };
    const sekil = tc.tip === "dongu" ? (
      // Balon (loop): tren durmadan döner — pu'dan dışa büyük kavis → pd (damla).
      <path d={`M ${pu.x} ${pu.y} C ${pu.x + uo.x * R * 2.4} ${pu.y + uo.y * R * 2.4} ${pd.x + uo.x * R * 2.4} ${pd.y + uo.y * R * 2.4} ${pd.x} ${pd.y}`} fill="none" stroke={col} strokeWidth={1.7} strokeLinecap="round" />
    ) : tc.tip === "ciftPeron" ? (
      // Çift peron + makas: iki paralel peron kolu, aralarında X makas (biri dönerken diğeri girer).
      <>
        <line x1={pu.x} y1={pu.y} x2={puO.x} y2={puO.y} stroke={col} strokeWidth={1.7} strokeLinecap="round" />
        <line x1={pd.x} y1={pd.y} x2={pdO.x} y2={pdO.y} stroke={col} strokeWidth={1.7} strokeLinecap="round" />
        <line x1={pu.x} y1={pu.y} x2={pdO.x} y2={pdO.y} stroke={col} strokeWidth={1} opacity={0.85} />
        <line x1={pd.x} y1={pd.y} x2={puO.x} y2={puO.y} stroke={col} strokeWidth={1} opacity={0.85} />
      </>
    ) : tc.tip === "makasliGecis" ? (
      // Makaslı geçiş: uçta X crossover (scissors) — iki şeridi çaprazlar.
      <>
        <line x1={pu.x} y1={pu.y} x2={pdO.x} y2={pdO.y} stroke={col} strokeWidth={1.7} strokeLinecap="round" />
        <line x1={pd.x} y1={pd.y} x2={puO.x} y2={puO.y} stroke={col} strokeWidth={1.7} strokeLinecap="round" />
        <circle cx={pu.x} cy={pu.y} r={1.2} fill={col} /><circle cx={pd.x} cy={pd.y} r={1.2} fill={col} />
      </>
    ) : (
      // Kör (stub) terminal: iki kısa kol + kalın tampon barı (dead-end) — tren durup ters döner.
      <>
        <line x1={pu.x} y1={pu.y} x2={puO.x} y2={puO.y} stroke={col} strokeWidth={1.7} strokeLinecap="round" />
        <line x1={pd.x} y1={pd.y} x2={pdO.x} y2={pdO.y} stroke={col} strokeWidth={1.7} strokeLinecap="round" />
        <line x1={puO.x} y1={puO.y} x2={pdO.x} y2={pdO.y} stroke={col} strokeWidth={2.8} strokeLinecap="round" />
      </>
    );
    return (
      <g key={`term${uc}`} opacity={0.92}>
        {sekil}
        <text x={Math.max(28, Math.min(VBW - 28, tip.x))} y={tip.y + (uo.y >= 0 ? 8 : -3)} textAnchor="middle" fontSize={6.5} fontWeight={600} fill={brand.muted}>{TERM_TIP_KISA[tc.tip]}</text>
        <title>{`${uc === "bas" ? "Başlangıç" : "Bitiş"} terminali — ${TERM_TIP_KISA[tc.tip]}${tc.tip === "dongu" ? " (dönüş beklemesi ≈ 0)" : ""}`}</title>
      </g>
    );
  };

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
    <div className="relative flex flex-col gap-3">
      {/* Mobil okunurluk: şema 860px iç genişlikte; dar ekrana sığdırılınca minik kalıyordu.
          Yalnız ŞEMAYI yatay kaydırılabilir min-genişlikli kutuya alıyoruz (kontroller/efsane
          etkilenmez). sm ve üstünde min-genişlik + kaydırma kalkar — geniş ekranda zaten sığar. */}
      <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-x-visible sm:px-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="min-w-[760px] sm:min-w-0">
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

        {/* OTOMATİK BLOK SINIRLARI — düz yeşil blok işareti (sinyal DEĞİL; gerçek sinyaller
            elle metrajla konur). Doluluk kırmızı blok segmentiyle görünür. Arızalı = koyu kırmızı. */}
        {Array.from({ length: nb }).map((_, i) => {
          const p = offsetAt(blocks[i], GAP + 6, UP_SIDE);
          const arizali = faultBlocks.includes(i);
          return (
            <circle key={`su${i}`} cx={p.x} cy={p.y} r={onBlockClick ? 3.2 : 2.7}
              fill={arizali ? "#7A0A1C" : ASPEKT.yesil} stroke="#fff" strokeWidth={0.9}
              style={{ cursor: onBlockClick ? "pointer" : "default" }}
              onClick={onBlockClick ? () => onBlockClick(i) : undefined}>
              {onBlockClick && <title>{`Blok sınırı ${i} (otomatik bölme) — tıkla: arıza aç/kapat`}</title>}
            </circle>
          );
        })}
        {Array.from({ length: nb }).map((_, k) => {
          const i = k + 1;
          const p = offsetAt(blocks[i], GAP + 6, DOWN_SIDE);
          return <circle key={`sd${i}`} cx={p.x} cy={p.y} r={2.7} fill={ASPEKT.yesil} stroke="#fff" strokeWidth={0.9} />;
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
        {/* HAT ÖZELLİKLERİ — yaya/karayolu geçidi + makas (tip-ayrımlı, raya bağ çizgili) */}
        {features.map((f, i) => {
          const top = offsetAt(f.pos, GAP + 13, UST);
          const ray = laneAt(f.pos, UST);
          const blk = blokIndeks(f.pos);
          const dolu = blk >= 0 && (occUp.has(blk) || occDown.has(blk) || faultBlocks.includes(blk));
          const asp2 = dolu ? ASPEKT.kirmizi : ASPEKT.yesil;
          const bag = <line x1={top.x} y1={top.y + 3} x2={ray.x} y2={ray.y} stroke={brand.faint} strokeWidth={0.6} strokeDasharray="1.5 1.5" />;
          if (f.kind === "yaya") {
            return (
              <g key={`f${i}`}>{bag}
                <circle cx={top.x} cy={top.y} r={3.4} fill={brand.surface} stroke={CK.blue} strokeWidth={1.3} />
                <circle cx={top.x} cy={top.y - 0.8} r={0.9} fill={CK.blue} />
                <line x1={top.x} y1={top.y + 0.1} x2={top.x} y2={top.y + 2.2} stroke={CK.blue} strokeWidth={0.9} />
                <title>{`Yaya geçidi: ${f.ad} — tren yavaşlar`}</title>
              </g>
            );
          }
          if (f.kind === "karayolu") {
            const durur = f.bekleme > 0;
            return (
              <g key={`f${i}`}>{bag}
                <rect x={top.x - 4} y={top.y - 4} width={8} height={8} rx={1} fill={brand.surface} stroke={CK.amber} strokeWidth={1.4} />
                <line x1={top.x - 4} y1={top.y} x2={top.x + 4} y2={top.y} stroke={CK.amber} strokeWidth={1} />
                <line x1={top.x} y1={top.y - 4} x2={top.x} y2={top.y + 4} stroke={CK.amber} strokeWidth={1} />
                {durur && <circle cx={top.x + 6} cy={top.y - 4} r={2} fill={asp2} stroke="#fff" strokeWidth={0.6} style={{ transition: "fill 0.35s ease" }} />}
                <title>{`Karayolu geçidi: ${f.ad}${durur ? ` — koruma duruşu ${Math.round(f.bekleme)} s (tren durur)` : " — tren yavaşlar"}`}</title>
              </g>
            );
          }
          if (f.kind === "sinyal") {
            const giden = f.yon === "giden";
            const ters = !!f.tersIsletme;
            const cerceve = ters ? CK.amber : brand.ink;
            return (
              <g key={`f${i}`}>{bag}
                {/* direk + 3-aspect kafa (kırmızı/sarı/yeşil) — aktif renk blok işgaline göre */}
                <line x1={top.x} y1={top.y - 6} x2={top.x} y2={top.y + 3} stroke={cerceve} strokeWidth={0.8} />
                <rect x={top.x - 1.7} y={top.y - 6.5} width={3.4} height={6.6} rx={1} fill={brand.surface} stroke={cerceve} strokeWidth={0.7} />
                <circle cx={top.x} cy={top.y - 4.8} r={0.85} fill={dolu ? ASPEKT.kirmizi : "#E6C9C9"} style={{ transition: "fill 0.35s ease" }} />
                <circle cx={top.x} cy={top.y - 3.1} r={0.85} fill="#E8DEBE" />
                <circle cx={top.x} cy={top.y - 1.4} r={0.85} fill={dolu ? "#C4D8C9" : ASPEKT.yesil} style={{ transition: "fill 0.35s ease" }} />
                {/* yön oku: giden ▶ / gelen ◀ */}
                <path d={giden ? `M ${top.x + 2.6} ${top.y - 3.8} l 2.2 1.4 l -2.2 1.4 z` : `M ${top.x - 2.6} ${top.y - 3.8} l -2.2 1.4 l 2.2 1.4 z`} fill={cerceve} />
                {ters && <text x={top.x} y={top.y + 3.6} textAnchor="middle" fontSize={3.2} fontWeight={700} fill={CK.amber}>↺</text>}
                <title>{`Sinyal: ${f.ad} — ${giden ? "giden (ileri)" : "gelen (ters)"}${ters ? " · TERS İŞLETME (turnback)" : ""} · aspect çevrimi ${Math.round(f.aspektCevrim || 0)} s · ${dolu ? "kırmızı (dolu)" : "yeşil (serbest)"}`}</title>
              </g>
            );
          }
          {
            const scissors = f.crossover === "x";
            // S/X CROSSOVER geometrisi: gidiş (alt) ↔ dönüş (üst) şeritlerini bağlar (sinyalle uyumlu renk).
            const del = Math.max(12, Math.min(L * 0.05, L * 0.014));
            const gA = laneAt(Math.max(0, f.pos - del), UP_SIDE), gB = laneAt(Math.min(L, f.pos + del), UP_SIDE);
            const dA = laneAt(Math.max(0, f.pos - del), DOWN_SIDE), dB = laneAt(Math.min(L, f.pos + del), DOWN_SIDE);
            const col = dolu ? ASPEKT.kirmizi : ASPEKT.yesil; // blok doluysa kırmızı
            const etk = offsetAt(f.pos, GAP + 12, UST);
            return (
              <g key={`f${i}`}>
                <line x1={gA.x} y1={gA.y} x2={dB.x} y2={dB.y} stroke={col} strokeWidth={1.5} strokeLinecap="round" style={{ transition: "stroke 0.35s ease" }} />
                {scissors && <line x1={dA.x} y1={dA.y} x2={gB.x} y2={gB.y} stroke={col} strokeWidth={1.5} strokeLinecap="round" style={{ transition: "stroke 0.35s ease" }} />}
                <circle cx={gA.x} cy={gA.y} r={1.1} fill={col} /><circle cx={dB.x} cy={dB.y} r={1.1} fill={col} />
                {scissors && <><circle cx={dA.x} cy={dA.y} r={1.1} fill={col} /><circle cx={gB.x} cy={gB.y} r={1.1} fill={col} /></>}
                <text x={etk.x} y={etk.y} textAnchor="middle" fontSize={4.6} fontWeight={700} fill={brand.inkSoft}>{scissors ? "X" : "S"}</text>
                <title>{`Makas: ${f.ad} — ${scissors ? "X-makas — 2 çapraz, gidiş↔dönüş" : "S-makas — gidiş↔dönüş"}${f.makasSayisi ? ` · ${f.makasSayisi} makas` : ""} — ${dolu ? "kırmızı (dolu)" : "yeşil (serbest)"}`}</title>
              </g>
            );
          }
        })}
        {/* TERMİNAL DÖNÜŞ BİÇİMİ — dönüş tipine göre uçlarda farklı geometri */}
        {terminalGlyph("bas", terminalBas)}
        {terminalGlyph("son", terminalSon)}

        {/* Depolar (parklanma alanları) — gidiş (alt) şeridinin yanında */}
        {depots.map(depotMark)}

        {/* Trenler */}
        {gidenler.map(wagon)}
        {gelenler.map((x, i) => wagon(x, i + gidenler.length))}
        {/* Ters işletmeye geçen trenler — giden→DÖNÜŞ (üst) şeritte başa geri; gelen→GİDİŞ
            (alt) şeritte bitiş terminaline doğru (karşı hatta geçti) */}
        {loopAktif && tersNow.map((r, i) => wagon({ tr: { index: r.idx, points: [], arr: 0, delay: 0 } as SignalTrain, fp: r.fp, up: r.up, v: vTers, durum: "donus" as LoopDurum, ad: r.up ? "ters işletme — karşı (gidiş) hatta geçti, ileri gidiyor" : "ters işletme — karşı (dönüş) şeride geçti, geri dönüyor" }, 900 + i))}

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
      </div>
      </div>

      {/* DÖNGÜ — seçili tren detay kutusu: bir turda hangi nedene ne kadar süre */}
      {loopAktif && secili !== null && (() => {
        const st = loopNow.find((x) => x.tr.index === secili);
        if (!st) return null;
        const stil = DURUM_STIL[st.durum];
        const topSn = Object.values(loop!.dokum).reduce((a, b) => a + b, 0) || 1;
        const sirali = (Object.entries(loop!.dokum) as [LoopDurum, number][]).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
        return (
          <div className="mt-2 rounded-lg border p-3" style={{ borderColor: brand.ink, background: brand.surface }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: brand.ink }}>🚋 Tren {secili + 1} — şu an: <span style={{ color: stil.renk }}>{stil.ikon} {st.ad}</span> · {Math.round(st.v * 3.6)} km/h</span>
              <button onClick={() => setSecili(null)} className="text-xs underline" style={{ color: brand.muted }}>kapat</button>
            </div>
            <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>Bir tam turda (çevrim {saat(loop!.periyot)}) hangi nedene ne kadar süre geçiriyor:</div>
            <div className="mt-1 space-y-1">
              {sirali.map(([d, v]) => {
                const s = DURUM_STIL[d]; const yuzde = (v / topSn) * 100;
                return (
                  <div key={d} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0" style={{ color: s.renk }}>{s.ikon} {s.ad}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: CK.track }}><div style={{ width: `${yuzde}%`, height: "100%", background: s.renk }} /></div>
                    <span className="w-20 shrink-0 text-right tabular-nums" style={{ color: brand.inkSoft }}>{Math.round(v)} s · %{Math.round(yuzde)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Arıza aktif → mod bildirimi: döngü yerine sinyal/kuyruk motoru çiziliyor */}
      {loop && faultBlocks.length > 0 && (
        <div className="mb-2 rounded-md border-l-4 px-3 py-2 text-xs" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.inkSoft }}>
          <b style={{ color: brand.red }}>⚠ Arıza modu:</b> {faultBlocks.length} blok arızalı → trenler <b>sinyal/kuyruk</b> motoruyla çiziliyor: arızalı bloğun 1 m gerisinde durup arkadan kuyruklanırlar. (Döngü rozetleri & terminal dönüşü etkileşimi bu modda kapalı.) Arızayı kaldırınca ✕ işaretli bloğa tekrar tıkla → döngü görünümüne dönülür.
        </div>
      )}

      {/* TERS İŞLETME MODU — SADECE istasyon makasları için geçerli. Aktivasyon:
          Kapalı / Sadece giden hat / Çift taraflı. Kalıcı (isletme.tersMod). */}
      {loop && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: brand.border, background: CK.track }}>
          <span className="flex items-center gap-1 font-semibold" style={{ color: brand.ink }}><span style={{ color: CK.amber }}>↺</span> Ters işletme:</span>
          {([
            { m: "kapali" as TersMod, ad: "Kapalı", ip: "İstasyon makasında kısa dönüş sorulmaz — trenler kesintisiz döner." },
            { m: "gidenHat" as TersMod, ad: "Sadece giden hat", ip: "Yalnız GİDEN trenler istasyon makasından kısa dönüş yapabilir (karşı/dönüş şeride geçip başa döner)." },
            { m: "ciftYonlu" as TersMod, ad: "Çift taraflı", ip: "Giden + GELEN trenler istasyon makasından geçebilir; dönüş treni de gidiş hattına girip ileri gidebilir." },
          ]).map(({ m, ad, ip }) => (
            <button key={m} title={ip} disabled={!onTersMod}
              onClick={() => { if (m !== tersMod) { onTersMod?.(m); if (m === "kapali") { setKarar(null); } } }}
              className="rounded px-2.5 py-1 font-medium transition disabled:opacity-50"
              style={tersMod === m ? { background: brand.ink, color: "#fff" } : { background: brand.surface, color: brand.inkSoft, border: `1px solid ${brand.border}` }}>
              {ad}
            </button>
          ))}
          <span style={{ color: brand.faint }}>— yalnız <b>istasyondaki</b> makaslar için geçerli ({tersMakaslar.length} istasyon)</span>
        </div>
      )}

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
        {" "}<span style={{ color: ASPEKT.yesil }}>●</span> otomatik blok sınırı (boş kesim bölme — sinyal değil, sadece blok işareti). GERÇEK sinyaller elle metrajla konur: 3-aspect direk sinyali <b>▶</b> giden / <b>◀</b> gelen yön, <span style={{ color: CK.amber }}>amber ↺</span> = ters işletme (turnback) sinyali (kırmızı/sarı/yeşil = önündeki blok işgaline göre yanar). Hat özellikleri: <span style={{ color: CK.blue }}>◉</span> yaya geçidi · <span style={{ color: CK.amber }}>⊞</span> karayolu geçidi · <span style={{ color: brand.ink }}>◆</span> makas — <b>S-makas</b> / <b>X-makas</b> (✕). İşgal edilen blok kırmızı segmentle görünür.
        {depoToplam > 0 && <> · 🅿 <b>Depo (parklanma):</b> bekleyen trenler sırayla headway aralığıyla servise çıkar; kutudaki dolu kareler çıkışa hazır, soluk kareler çıkmış trenlerdir.</>}
        {tersMakaslar.length > 0 && tersMod !== "kapali" && <> · <span style={{ color: CK.amber }}>↺</span> <b>Ters işletme (istasyon makası):</b> {tersMod === "ciftYonlu" ? "giden ya da gelen" : "giden"} bir tren <b>istasyon</b> makasına ulaşınca süre durur ve onay istenir; onaylarsanız karşı hatta geçer ({tersMod === "ciftYonlu" ? "giden→başa döner, gelen→ileri gider" : "başa, sıranın en arkasına döner"}). Yalnız istasyon makasları için geçerlidir.</>}
        {(terminalBas || terminalSon) && <> · <b>Terminal dönüş biçimi:</b> hattın uçlarında dönüş tipine göre çizilir — <b>kör terminal</b> (tampon barı = çıkmaz, perondan ters döner) · <b>çift peron</b> (iki kol + X makas, biri dönerken diğeri girer) · <b>balon loop</b> (durmadan döner, dönüş beklemesi ≈ 0) · <b>makaslı geçiş</b> (uçta X-makas). Ringler → Dönüş tipi değişince şekil değişir.</>}
      </p>

      {/* ETKİLEŞİMLİ TERS İŞLETME — onay pop-up (süre durdurulmuşken) */}
      {karar && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md" style={{ background: "rgba(15,23,42,0.45)" }}>
          <div className="mx-4 max-w-sm rounded-xl border-2 p-4 shadow-xl" style={{ background: brand.surface, borderColor: CK.amber }}>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: brand.ink }}>
              <span style={{ color: CK.amber, fontSize: 18 }}>↺</span> Ters işletme onayı
            </div>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: brand.inkSoft }}>
              <b>Tren {karar.no}</b>, <b>{karar.makasAd}</b> istasyon makasına ({karar.crossover === "x" ? "X-makas" : "S-makas"}) ulaştı — <b>süre durduruldu</b>.
              {karar.yon === "gelen"
                ? " Bu DÖNÜŞ trenini karşı (gidiş) hatta geçirip ileri, bitiş terminaline doğru göndermek istiyor musunuz?"
                : " Bu GİDEN treni karşı (dönüş) şeride geçirip başa (sıranın en arkasına) geri döndürmek istiyor musunuz?"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onayla} className="flex-1 rounded-md px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.red }}>Ters işletmeyi onaylıyorum</button>
              <button onClick={vazgec} className="rounded-md border px-3 py-1.5 text-sm transition hover:opacity-80" style={{ borderColor: brand.ink, color: brand.ink }}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
