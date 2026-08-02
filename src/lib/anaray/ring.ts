// raysim — DURAK ARASI RİNG modeli (gerçek-hayat işletim hücreleri).
//
// Kavram: iki durak arasındaki her kesim bağımsız bir "ring hücresi"dir.
// Her hücre kendi ZORUNLU şartlarını taşır — mesafe, makas bölgeleri (konum,
// tip, 15 km/h geçiş), hemzemin/yaya geçitleri (25 km/h), acil frenleme /
// tehlike noktaları. Hücreler zincirlenerek bir "loop" (kapalı hat + makas
// U-dönüşleri) oluşturur. Simülasyon her hücreyi WORST ↔ BEST köşeleri
// arasında değerlendirir; amaç durak-çiftleri arasında EŞİT şartlar kurup
// headway'i (240 s) kararlı tutmak ve tren sayısı arttıkça darboğazı görmek.
//
// Kaynak kabuller: Tasarım El Kitabı MAZ-VA-AKS-001 v6.0 (s.16–17, 3.4.8.2).
// Fizik motoru (sim.ts) yeniden kullanılır — sayılar el kitabıyla tutarlıdır.

import type { Line, RollingStock, Station, TrackSegment } from "./types";
import { simulate } from "./sim";
import { varsayilanConfig, type SimConfig } from "./config";

/** Belge kabulleri = paylaşılan simülasyon config'inin varsayılanı. Aşağıdaki
 *  fonksiyonlar canlı `cfg` alır; verilmezse bu varsayılanı kullanır. */
export const BELGE = varsayilanConfig;

// ————————————————————————————————————————————————
// Tipler
// ————————————————————————————————————————————————

/** Makas bölgesi türleri (el kitabı bölge senaryolarından). */
export type MakasTip =
  | "karsilasmali" // yüz yüze karşılaşmalı — K-S-Y, her geçiş TCC onayı
  | "headway" // headway/blok makası — K-Y
  | "barinma" // hattı kesen 3. yön (barınma) — istisna, TCC
  | "depo" // depo giriş/çıkış — tek tren, TCC, 8 s release
  | "udonus"; // izole S-makas U-dönüş (geri dönüş) bölgesi

export type HemzeminTip = "yaya" | "karayolu";

export const MAKAS_TIP_AD: Record<MakasTip, string> = {
  karsilasmali: "Karşılaşmalı (yüz yüze)",
  headway: "Headway makası",
  barinma: "Barınma (3. yön)",
  depo: "Depo giriş/çıkış",
  udonus: "U-dönüş (S-makas)",
};

/** Makas için her geçişte TCC onayı zorunlu mu? (el kitabı kritik hat notları) */
export function tccGerekli(tip: MakasTip): boolean {
  return tip === "karsilasmali" || tip === "barinma" || tip === "depo";
}

export interface MakasBolgesi {
  id: string;
  ad: string;
  tip: MakasTip;
  konum: number; // ring başından mesafe (m)
  gecisHizi: number; // m/s (varsayılan 15 km/h)
  tccZorunlu: boolean; // her geçiş TCC onayı gerektirir mi?
  makasAdimSuresi: number; // s — her makas hareketi (≤ 6)
  makasSayisi: number; // ardışık makas adedi (çoklu tanzim sıralaması)
  routeRelease: number; // s — rota serbest bırakma (5 ana hat / 8 depo)
}

export interface Hemzemin {
  id: string;
  ad: string;
  tip: HemzeminTip;
  konum: number; // m
  hiz: number; // m/s (varsayılan 25 km/h)
}

export interface TehlikeNoktasi {
  id: string;
  ad: string;
  konum: number; // m — acil frenleme / tehlike noktası
  hiz: number; // m/s — worst-case'de bu noktada düşülen hız (acil frenleme)
  aciklama: string;
}

export interface DurakArasiRing {
  id: string;
  ad: string;
  fromStationId: string;
  toStationId: string;
  fromAd: string;
  toAd: string;
  uzunluk: number; // m — nominal durak arası mesafe (girilebilir/ayarlanabilir)
  worstUzunluk: number; // m — worst-case referans (≥ uzunluk, vars. 1500)
  bestUzunluk: number; // m — best-case (yakın mesafe) referans
  vmax: number; // m/s — bu ringde sahasal azami (vars. 40 km/h)
  egim: number; // ‰
  dwell: number; // varış durağı bekleme süresi (s)
  /** Varış (to) durağı parklanma (depo/stabling) alanı mı? */
  depot?: boolean;
  /** Varış durağı depoysa: çıkışa hazır bekleyen tren sayısı. */
  queued?: number;
  /** YALNIZ ilk ringde anlamlı: başlangıç (from) durağı parklanma alanı mı?
   *  (Origin istasyonun kendi ringi yoktur; bu yüzden ilk ringde taşınır.) */
  fromDepot?: boolean;
  /** İlk ringde: başlangıç durağı depoysa bekleyen tren sayısı. */
  fromQueued?: number;
  makaslar: MakasBolgesi[];
  hemzeminler: Hemzemin[];
  tehlikeNoktalari: TehlikeNoktasi[];
}

export interface Loop {
  id: string;
  ad: string;
  ringIds: string[]; // sıralı ring zinciri
  kapali: boolean; // kapalı hat (ring hattı) mı?
}

export type Mode = "nominal" | "worst" | "best";

// ————————————————————————————————————————————————
// Ring → Line (fizik motoru için)
// ————————————————————————————————————————————————

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function ringUzunluk(ring: DurakArasiRing, mode: Mode): number {
  if (mode === "worst") return Math.max(ring.uzunluk, ring.worstUzunluk);
  if (mode === "best") return Math.max(50, Math.min(ring.uzunluk, ring.bestUzunluk));
  return ring.uzunluk;
}

interface Kisit {
  start: number;
  end: number;
  vmax: number;
}

/** [0,L] üzerinde kısıt bölgelerini (makas 15, hemzemin 25) segmentlere döker. */
function segmentle(L: number, base: number, kisitlar: Kisit[], egim: number): TrackSegment[] {
  const pts = new Set<number>([0, L]);
  for (const k of kisitlar) {
    pts.add(clamp(k.start, 0, L));
    pts.add(clamp(k.end, 0, L));
  }
  const bounds = Array.from(pts).sort((a, b) => a - b);
  const segs: TrackSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    let v = base;
    for (const k of kisitlar) if (mid >= k.start && mid < k.end) v = Math.min(v, k.vmax);
    segs.push({ start: a, end: b, vmax: v, gradient: egim });
  }
  if (segs.length === 0) segs.push({ start: 0, end: L, vmax: base, gradient: egim });
  return segs;
}

/** Bir ringi verilen mod (worst/best/nominal) için düz Line'a çevirir. */
export function ringToLine(ring: DurakArasiRing, mode: Mode, cfg: SimConfig = BELGE): Line {
  const L = ringUzunluk(ring, mode);
  const base = ring.vmax > 0 ? ring.vmax : cfg.vSahasal;
  const scale = ring.uzunluk > 0 ? L / ring.uzunluk : 1;
  const W = cfg.kisitGenisligi;

  const kisitlar: Kisit[] = [];
  // best-case: yakın mesafe köşesi — makas/geçit fiziği yine mevcut (kaldırılmaz).
  for (const m of ring.makaslar) {
    const c = clamp(m.konum * scale, 0, L);
    kisitlar.push({ start: Math.max(0, c - W / 2), end: Math.min(L, c + W / 2), vmax: m.gecisHizi });
  }
  for (const h of ring.hemzeminler) {
    const c = clamp(h.konum * scale, 0, L);
    kisitlar.push({ start: Math.max(0, c - W / 2), end: Math.min(L, c + W / 2), vmax: h.hiz });
  }
  // Acil frenleme / tehlike noktaları: worst-case ve nominal senaryoda uygulanır;
  // best-case (idealize yakın mesafe) köşesinde uygulanmaz.
  if (mode !== "best") {
    for (const tn of ring.tehlikeNoktalari) {
      const c = clamp(tn.konum * scale, 0, L);
      const vh = tn.hiz > 0 ? tn.hiz : cfg.vAcil;
      kisitlar.push({ start: Math.max(0, c - W / 2), end: Math.min(L, c + W / 2), vmax: vh });
    }
  }

  const stations: Station[] = [
    { id: ring.fromStationId, name: ring.fromAd, position: 0, dwell: 0 },
    { id: ring.toStationId, name: ring.toAd, position: L, dwell: 0 },
  ];
  return { id: `${ring.id}-${mode}`, name: ring.ad, length: L, segments: segmentle(L, base, kisitlar, egim(ring)), stations };
}

function egim(ring: DurakArasiRing): number {
  return ring.egim || 0;
}

// ————————————————————————————————————————————————
// Senaryo hesabı (worst / best / nominal + timing)
// ————————————————————————————————————————————————

/** Ringin salt seyir süresi (durak beklemesi hariç), verilen mod için (s). */
export function ringSeyirSuresi(ring: DurakArasiRing, stock: RollingStock, mode: Mode, cfg: SimConfig = BELGE): number {
  return simulate(ringToLine(ring, mode, cfg), stock, 0.5).totalTime;
}

/** Makas tanzimi + rota serbest bırakma kaynaklı worst-case ek süre (s). */
export function ringTimingEk(ring: DurakArasiRing): number {
  let ek = 0;
  for (const m of ring.makaslar) {
    ek += Math.max(1, m.makasSayisi) * m.makasAdimSuresi; // sıralı makas adımları
    ek += m.routeRelease; // rota serbest bırakma zamanlayıcısı
  }
  return ek;
}

export interface RingSenaryo {
  worstSeyir: number; // s
  bestSeyir: number; // s
  nominalSeyir: number; // s
  timingEk: number; // s — makas/route release
  worstToplam: number; // s — worstSeyir + timingEk + dwell
  bestToplam: number; // s — bestSeyir + dwell
  headwayUygun: boolean; // 240 s ≥ worstToplam ?
  headwayPayi: number; // s — 240 − worstToplam (marj; negatif = ihlal)
}

export function ringSenaryo(ring: DurakArasiRing, stock: RollingStock, cfg: SimConfig = BELGE): RingSenaryo {
  const worstSeyir = ringSeyirSuresi(ring, stock, "worst", cfg);
  const bestSeyir = ringSeyirSuresi(ring, stock, "best", cfg);
  const nominalSeyir = ringSeyirSuresi(ring, stock, "nominal", cfg);
  const timingEk = ringTimingEk(ring);
  const worstToplam = worstSeyir + timingEk + ring.dwell;
  const bestToplam = bestSeyir + ring.dwell;
  return {
    worstSeyir,
    bestSeyir,
    nominalSeyir,
    timingEk,
    worstToplam,
    bestToplam,
    headwayUygun: worstToplam <= cfg.headway,
    headwayPayi: cfg.headway - worstToplam,
  };
}

// ————————————————————————————————————————————————
// Loop dengesi (durak-çiftleri arası EŞİT şartlar) + ölçeklenme
// ————————————————————————————————————————————————

export interface RingDenge {
  id: string;
  ad: string;
  worstToplam: number;
  sapma: number; // ortalamadan sapma (s)
}

export interface LoopDenge {
  ortalama: number; // s — ring başına ortalama worst-case
  enYavas: RingDenge | null; // darboğaz ring
  enHizli: RingDenge | null;
  sapmaYuzde: number; // (max−min)/ortalama × 100
  dengeli: boolean; // sapma eşiğin altında mı? (eşit şartlar)
  perRing: RingDenge[];
}

const DENGE_ESIK_YUZDE = 35; // %35 üstü sapma → dengesiz (eşit şart bozuk)

export function loopDenge(rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig = BELGE): LoopDenge {
  const per = rings.map((r) => ({ id: r.id, ad: r.ad, worstToplam: ringSenaryo(r, stock, cfg).worstToplam }));
  if (per.length === 0) {
    return { ortalama: 0, enYavas: null, enHizli: null, sapmaYuzde: 0, dengeli: true, perRing: [] };
  }
  const ort = per.reduce((s, p) => s + p.worstToplam, 0) / per.length;
  const perRing: RingDenge[] = per.map((p) => ({ ...p, sapma: p.worstToplam - ort }));
  const enYavas = perRing.reduce((a, b) => (b.worstToplam > a.worstToplam ? b : a));
  const enHizli = perRing.reduce((a, b) => (b.worstToplam < a.worstToplam ? b : a));
  const sapmaYuzde = ort > 0 ? ((enYavas.worstToplam - enHizli.worstToplam) / ort) * 100 : 0;
  return { ortalama: ort, enYavas, enHizli, sapmaYuzde, dengeli: sapmaYuzde <= DENGE_ESIK_YUZDE, perRing };
}

export interface OlceklenmeSonuc {
  turSuresi: number; // s — loop tam tur SEYİR süresi (worst-case, dönüş beklemesi HARİÇ)
  turnaroundToplam: number; // s — tur başına toplam dönüş bekleme (her ters/kalkış noktasında)
  cevrimSuresi: number; // s — filo hesabına giren tam çevrim = turSuresi + turnaroundToplam
  darbogazRing: RingDenge | null; // en yavaş ring
  minHeadway: number; // s — en yavaş ringin dayattığı alt sınır
  maxTrenHedefHeadway: number; // hedef headway'de çevrime sığan (gereken) tren sayısı
  headwayUygun: boolean; // tüm ringler 240 s altında mı?
}

/**
 * Tren sayısı arttıkça: darboğaz ringi ve headway alt sınırını çıkarır.
 * `turnaroundSn` = uçta/kalkışta dönüş bekleme (s). Çevrim süresine eklenir → filo
 * (maxTrenHedefHeadway) hesabını besler. Açık hatta iki uçta ters dönülür (×2),
 * kapalı loop'ta tek kalkış/dinlenme noktası (×1). Varsayılan 0 → geriye uyumlu.
 */
export function olceklenme(
  rings: DurakArasiRing[], stock: RollingStock, kapali: boolean, cfg: SimConfig = BELGE, turnaroundSn = 0,
): OlceklenmeSonuc {
  const denge = loopDenge(rings, stock, cfg);
  const yon = kapali ? 1 : 2; // açık hat gidiş-dönüş
  const turSuresi = denge.perRing.reduce((s, p) => s + p.worstToplam, 0) * yon;
  const turnaroundToplam = Math.max(0, turnaroundSn) * yon; // her ters/kalkış noktasında bekleme
  const cevrimSuresi = turSuresi + turnaroundToplam;
  const minHeadway = denge.enYavas ? denge.enYavas.worstToplam : 0;
  const maxTren = cfg.headway > 0 ? Math.max(1, Math.floor(cevrimSuresi / cfg.headway)) : 1;
  const headwayUygun = rings.every((r) => ringSenaryo(r, stock, cfg).headwayUygun);
  return {
    turSuresi,
    turnaroundToplam,
    cevrimSuresi,
    darbogazRing: denge.enYavas,
    minHeadway,
    maxTrenHedefHeadway: maxTren,
    headwayUygun,
  };
}

// ————————————————————————————————————————————————
// Zorunlu şart validasyonu (girişi zorunlu kıl)
// ————————————————————————————————————————————————

export interface Eksik {
  ringId: string;
  alan: string;
  mesaj: string;
}

/** Bir ringin zorunlu şartlarındaki eksikleri döndürür (boş = tam). */
export function ringDogrula(ring: DurakArasiRing, cfg: SimConfig = BELGE): Eksik[] {
  const e: Eksik[] = [];
  const push = (alan: string, mesaj: string) => e.push({ ringId: ring.id, alan, mesaj });

  if (!ring.fromAd.trim() || !ring.toAd.trim()) push("durak", "Başlangıç ve bitiş durağı adlandırılmalı");
  if (!(ring.uzunluk > 0)) push("uzunluk", "Durak arası mesafe girilmeli (> 0)");
  if (!(ring.worstUzunluk >= ring.uzunluk)) push("worstUzunluk", "Worst-case mesafe nominal mesafeden küçük olamaz");
  if (!(ring.bestUzunluk > 0 && ring.bestUzunluk <= ring.uzunluk)) push("bestUzunluk", "Best-case mesafe 0 ile nominal arasında olmalı");
  if (!(ring.vmax > 0)) push("vmax", "Sahasal azami hız girilmeli");

  ring.makaslar.forEach((m, i) => {
    const et = `Makas #${i + 1} (${m.ad || MAKAS_TIP_AD[m.tip]})`;
    if (m.konum < 0 || m.konum > ring.uzunluk) push(`makas.${m.id}.konum`, `${et}: konum ring içinde olmalı (0–${Math.round(ring.uzunluk)} m)`);
    if (!(m.gecisHizi > 0)) push(`makas.${m.id}.hiz`, `${et}: geçiş hızı girilmeli`);
    if (!(m.makasAdimSuresi > 0 && m.makasAdimSuresi <= cfg.makasAdimMax))
      push(`makas.${m.id}.adim`, `${et}: makas adım süresi 0–${cfg.makasAdimMax} s olmalı`);
    if (tccGerekli(m.tip) && !m.tccZorunlu) push(`makas.${m.id}.tcc`, `${et}: bu tip her geçişte TCC onayı gerektirir`);
  });

  ring.hemzeminler.forEach((h, i) => {
    const et = `Hemzemin #${i + 1} (${h.ad || h.tip})`;
    if (h.konum < 0 || h.konum > ring.uzunluk) push(`hz.${h.id}.konum`, `${et}: konum ring içinde olmalı`);
    if (!(h.hiz > 0)) push(`hz.${h.id}.hiz`, `${et}: yavaşlama hızı girilmeli`);
  });

  ring.tehlikeNoktalari.forEach((tn, i) => {
    const et = `Tehlike/acil frenleme #${i + 1} (${tn.ad || "adsız"})`;
    if (tn.konum < 0 || tn.konum > ring.uzunluk) push(`tn.${tn.id}.konum`, `${et}: konum ring içinde olmalı`);
    if (!(tn.hiz >= 0)) push(`tn.${tn.id}.hiz`, `${et}: acil frenleme hızı girilmeli (≥ 0)`);
  });

  return e;
}

// ————————————————————————————————————————————————
// Kısıtlar arası mesafe ("şartları arası mesafeleri")
// ————————————————————————————————————————————————

export type KisitTur = "makas" | "hemzemin" | "tehlike";

export interface Kisitlik {
  tur: KisitTur;
  id: string;
  ad: string;
  konum: number; // m
  detay: string; // km/h + tip
}

/** Ringdeki tüm kısıtları (makas + hemzemin + tehlike) konuma göre sıralı verir. */
export function ringKisitDizisi(ring: DurakArasiRing): Kisitlik[] {
  const list: Kisitlik[] = [
    ...ring.makaslar.map((m) => ({ tur: "makas" as const, id: m.id, ad: m.ad || MAKAS_TIP_AD[m.tip], konum: m.konum, detay: `${Math.round(m.gecisHizi * 3.6)} km/h · ${MAKAS_TIP_AD[m.tip]}` })),
    ...ring.hemzeminler.map((h) => ({ tur: "hemzemin" as const, id: h.id, ad: h.ad || h.tip, konum: h.konum, detay: `${Math.round(h.hiz * 3.6)} km/h · ${h.tip}` })),
    ...ring.tehlikeNoktalari.map((t) => ({ tur: "tehlike" as const, id: t.id, ad: t.ad || "acil frenleme", konum: t.konum, detay: `${Math.round(t.hiz * 3.6)} km/h · acil frenleme` })),
  ];
  return list.sort((a, b) => a.konum - b.konum);
}

/** Ardışık kısıtlar arası en kısa mesafe (m). Kısıt < 2 ise null. */
export function enKisaKisitAralik(ring: DurakArasiRing): { mesafe: number; a: Kisitlik; b: Kisitlik } | null {
  const d = ringKisitDizisi(ring);
  if (d.length < 2) return null;
  let min = Infinity;
  let pair: { a: Kisitlik; b: Kisitlik } | null = null;
  for (let i = 1; i < d.length; i++) {
    const gap = d[i].konum - d[i - 1].konum;
    if (gap < min) { min = gap; pair = { a: d[i - 1], b: d[i] }; }
  }
  return pair ? { mesafe: min, ...pair } : null;
}

// ————————————————————————————————————————————————
// Challenge (karşılaşılabilecek zorluk) analizi
// ————————————————————————————————————————————————

export type ChallengeTur = "headway" | "acil-frenleme" | "makas-kuyruk" | "kisit-yakinlik";
export type ChallengeSeviye = "bilgi" | "uyari" | "kritik";

export interface ChallengeBayrak {
  tur: ChallengeTur;
  seviye: ChallengeSeviye;
  baslik: string;
  mesaj: string;
}

const YAKINLIK_ESIK = 120; // m — iki kısıt bundan yakınsa "challenge"

/** Bir ringin karşılaşabileceği işletme zorluklarını (challenge) çıkarır. */
export function ringChallenge(ring: DurakArasiRing, stock: RollingStock, cfg: SimConfig = BELGE): ChallengeBayrak[] {
  const c: ChallengeBayrak[] = [];
  const sen = ringSenaryo(ring, stock, cfg);

  // 1) Headway
  if (!sen.headwayUygun) {
    c.push({ tur: "headway", seviye: "kritik", baslik: "Headway ihlali", mesaj: `Worst-case ${Math.round(sen.worstToplam)} s > ${cfg.headway} s hedef headway — bu ring sefer sıklığını tıkar.` });
  } else if (sen.headwayPayi < cfg.headway * 0.15) {
    c.push({ tur: "headway", seviye: "uyari", baslik: "Dar headway marjı", mesaj: `Yalnız ${Math.round(sen.headwayPayi)} s marj — küçük bir aksaklık headway'i aşar.` });
  }

  // 2) Acil frenleme cezası
  if (ring.tehlikeNoktalari.length > 0) {
    const temiz = { ...ring, tehlikeNoktalari: [] };
    const ceza = ringSeyirSuresi(ring, stock, "worst", cfg) - ringSeyirSuresi(temiz, stock, "worst", cfg);
    c.push({
      tur: "acil-frenleme",
      seviye: ceza > 15 ? "uyari" : "bilgi",
      baslik: "Acil frenleme cezası",
      mesaj: `${ring.tehlikeNoktalari.length} tehlike/acil frenleme noktası worst-case seyre +${Math.max(0, Math.round(ceza))} s ekliyor.`,
    });
  }

  // 3) Makas kuyruklanma riski (tek-tren/TCC bölgeleri tren sayısı artınca kuyruklanır)
  const tekTren = ring.makaslar.filter((m) => tccGerekli(m.tip));
  if (tekTren.length > 0) {
    c.push({
      tur: "makas-kuyruk",
      seviye: "uyari",
      baslik: "Makas kuyruklanma riski",
      mesaj: `${tekTren.length} tek-tren/TCC makas bölgesi (${tekTren.map((m) => MAKAS_TIP_AD[m.tip]).join(", ")}) — tren sayısı artınca bu bölgede kuyruk oluşur.`,
    });
  }

  // 4) Kısıt yakınlığı
  const yakin = enKisaKisitAralik(ring);
  if (yakin && yakin.mesafe < YAKINLIK_ESIK) {
    c.push({
      tur: "kisit-yakinlik",
      seviye: yakin.mesafe < YAKINLIK_ESIK / 2 ? "uyari" : "bilgi",
      baslik: "Kısıtlar çok yakın",
      mesaj: `"${yakin.a.ad}" ile "${yakin.b.ad}" yalnız ${Math.round(yakin.mesafe)} m arayla — art arda yavaşlama (challenge).`,
    });
  }

  return c;
}

// ————————————————————————————————————————————————
// Eşit şartlar önerisi (loop dengeleme)
// ————————————————————————————————————————————————

export interface DengeOneri {
  ringId: string;
  ad: string;
  fark: number; // s — ortalamadan sapma
  oneri: string;
}

/** Durak-çiftleri arası EŞİT şartlar için ring bazında dengeleme önerisi. */
export function dengeOnerisi(rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig = BELGE): DengeOneri[] {
  const denge = loopDenge(rings, stock, cfg);
  const esik = Math.max(8, denge.ortalama * 0.12); // ±%12 veya 8 s
  const oneriler: DengeOneri[] = [];
  for (const p of denge.perRing) {
    if (Math.abs(p.sapma) < esik) continue;
    const metre = Math.round((Math.abs(p.sapma) / Math.max(0.1, cfg.vSahasal)) * (p.sapma > 0 ? 1 : 1));
    const oneri =
      p.sapma > 0
        ? `${Math.round(p.sapma)} s yavaş — ~${metre} m kısalt veya dwell/kısıt azalt (headway'i bu ring belirliyor).`
        : `${Math.round(-p.sapma)} s hızlı — pay var; gerekirse mesafe/dwell buraya kaydırılabilir.`;
    oneriler.push({ ringId: p.id, ad: p.ad, fark: p.sapma, oneri });
  }
  return oneriler.sort((a, b) => b.fark - a.fark);
}

/** Tüm ringler eksiksiz mi? (loop kurmak için zorunlu şart) */
export function loopTamMi(rings: DurakArasiRing[]): boolean {
  return rings.length > 0 && rings.every((r) => ringDogrula(r).length === 0);
}

// ————————————————————————————————————————————————
// Durak (istasyon) düzenleme — doğrudan ring zinciri üzerinde
// ————————————————————————————————————————————————
// Ring modeli durak-ARASI hücrelerden oluşur; bir durak, iki komşu ringin
// paylaştığı uçtur (ring N.toAd == ring N+1.fromAd). Aşağıdaki SAF fonksiyonlar
// durak-merkezli işlemleri (ekle baş/son/orta · sil · ad senkron) doğrudan ring
// dizisine uygular — grafa çevirmeye gerek yok. RingEditor "Duraklar" paneli kullanır.
// Durak indeksleme: n ring → (n+1) durak; durak i, ring i-1 (gelen) ile ring i (giden) arasında.

/** Ring zincirinden sıralı durak listesi + kümülatif konum (m). */
export function ringDuraklari(rings: DurakArasiRing[]): { ad: string; konum: number }[] {
  if (rings.length === 0) return [];
  const out = [{ ad: rings[0].fromAd, konum: 0 }];
  let acc = 0;
  for (const r of rings) { acc += r.uzunluk; out.push({ ad: r.toAd, konum: acc }); }
  return out;
}

/** Durak i'nin adını değiştir — paylaşılan durak iki komşu ringde SENKRON güncellenir. */
export function durakAdiDegistir(rings: DurakArasiRing[], i: number, ad: string): DurakArasiRing[] {
  return rings.map((r, k) => {
    if (k === i - 1) return { ...r, toAd: ad }; // durağa GELEN ring
    if (k === i) return { ...r, fromAd: ad };   // duraktan GİDEN ring
    return r;
  });
}

/** Yeni ring — verilen mesafeyle (yoksa yeniRing varsayılanı). */
function mesafeliRing(from: string, to: string, mesafe?: number): DurakArasiRing {
  const r = yeniRing(from, to);
  if (mesafe != null && mesafe > 0) {
    r.uzunluk = Math.max(50, Math.round(mesafe));
    r.bestUzunluk = clamp(r.bestUzunluk, 50, r.uzunluk);
    r.worstUzunluk = Math.max(r.uzunluk, r.worstUzunluk);
  }
  return r;
}

/** Başa durak ekle (yeni durak → mevcut ilk durak). `mesafe` verilirse o uzunlukla. */
export function durakEkleBas(rings: DurakArasiRing[], mesafe?: number): DurakArasiRing[] {
  const ilk = rings[0];
  return [mesafeliRing("Yeni Durak", ilk ? ilk.fromAd : "Son Durak", mesafe), ...rings];
}

/** Sona durak ekle (mevcut son durak → yeni durak). `mesafe` verilirse o uzunlukla. */
export function durakEkleSon(rings: DurakArasiRing[], mesafe?: number): DurakArasiRing[] {
  const son = rings[rings.length - 1];
  return [...rings, mesafeliRing(son ? son.toAd : "Başlangıç Durağı", "Yeni Durak", mesafe)];
}

/**
 * Toplam uzunluk + durak sayısından hattı KUR (hızlı ilk taslak): (n-1) ring,
 * her biri eşit mesafe. Sonra kullanıcı adları/mesafeleri ince ayarlar.
 */
export function duraklardanHat(toplamUzunluk: number, durakSayisi: number): DurakArasiRing[] {
  const n = Math.max(2, Math.round(durakSayisi));
  const ringSayisi = n - 1;
  const seg = Math.max(50, Math.round(Math.max(50, toplamUzunluk) / ringSayisi));
  const ad = (i: number) => (i === 0 ? "Başlangıç Durağı" : i === n - 1 ? "Son Durak" : `Durak ${i + 1}`);
  return Array.from({ length: ringSayisi }, (_, i) => mesafeliRing(ad(i), ad(i + 1), seg));
}

/**
 * Ring `index`'i ikiye bölerek ORTASINA durak ekle. `konum` verilirse orada (0..uzunluk),
 * yoksa ortadan böler. Kısıtlar bölme noktasına göre paylaştırılır.
 */
export function durakBol(rings: DurakArasiRing[], index: number, konum?: number): DurakArasiRing[] {
  const r = rings[index];
  if (!r) return rings;
  const yari = clamp(Math.round(konum ?? r.uzunluk / 2), 1, Math.max(1, r.uzunluk - 1));
  const kalan = Math.max(1, r.uzunluk - yari);
  const oncesi = <T extends { konum: number }>(xs: T[]) => xs.filter((o) => o.konum <= yari);
  const sonrasi = <T extends { konum: number }>(xs: T[]) => xs.filter((o) => o.konum > yari).map((o) => ({ ...o, konum: o.konum - yari }));
  const a: DurakArasiRing = {
    ...r, id: yeniId("RING"), toAd: "Yeni Durak", uzunluk: yari,
    worstUzunluk: Math.max(yari, r.worstUzunluk), bestUzunluk: clamp(r.bestUzunluk, 50, yari),
    depot: false, queued: undefined,
    makaslar: oncesi(r.makaslar), hemzeminler: oncesi(r.hemzeminler), tehlikeNoktalari: oncesi(r.tehlikeNoktalari),
  };
  const b: DurakArasiRing = {
    ...r, id: yeniId("RING"), fromAd: "Yeni Durak", uzunluk: kalan,
    worstUzunluk: Math.max(kalan, r.worstUzunluk), bestUzunluk: clamp(r.bestUzunluk, 50, kalan),
    fromDepot: undefined, fromQueued: undefined,
    makaslar: sonrasi(r.makaslar), hemzeminler: sonrasi(r.hemzeminler), tehlikeNoktalari: sonrasi(r.tehlikeNoktalari),
  };
  return [...rings.slice(0, index), a, b, ...rings.slice(index + 1)];
}

/** Durak i'yi sil. İlk/son → uç ringi at; orta durak → iki komşu ringi BİRLEŞTİR.
 *  En az bir ring (iki durak) korunur (aksi halde hat kalmaz). */
export function durakSil(rings: DurakArasiRing[], i: number): DurakArasiRing[] {
  const n = rings.length;
  if (n <= 1) return rings; // 1 ring = 2 durak: daha aza inme
  if (i <= 0) return rings.slice(1);           // ilk durak → ilk ringi at
  if (i >= n) return rings.slice(0, n - 1);    // son durak → son ringi at
  const a = rings[i - 1], b = rings[i];        // orta durak i: a ve b'yi birleştir
  const merged: DurakArasiRing = {
    ...a, toAd: b.toAd, uzunluk: a.uzunluk + b.uzunluk,
    worstUzunluk: Math.max(a.worstUzunluk, b.worstUzunluk, a.uzunluk + b.uzunluk),
    bestUzunluk: Math.min(a.bestUzunluk, b.bestUzunluk),
    dwell: b.dwell, depot: b.depot, queued: b.queued,
    makaslar: [...a.makaslar, ...b.makaslar.map((m) => ({ ...m, konum: m.konum + a.uzunluk }))],
    hemzeminler: [...a.hemzeminler, ...b.hemzeminler.map((h) => ({ ...h, konum: h.konum + a.uzunluk }))],
    tehlikeNoktalari: [...a.tehlikeNoktalari, ...b.tehlikeNoktalari.map((t) => ({ ...t, konum: t.konum + a.uzunluk }))],
  };
  return [...rings.slice(0, i - 1), merged, ...rings.slice(i + 1)];
}

// ————————————————————————————————————————————————
// Fabrika yardımcıları (yeni öğe)
// ————————————————————————————————————————————————

let _sayac = 0;
function yeniId(pre: string): string {
  _sayac += 1;
  return `${pre}_${_sayac}`;
}

export function yeniMakas(tip: MakasTip, konum: number): MakasBolgesi {
  const depo = tip === "depo";
  return {
    id: yeniId("PM"),
    ad: "",
    tip,
    konum,
    gecisHizi: BELGE.vMakas,
    tccZorunlu: tccGerekli(tip),
    makasAdimSuresi: BELGE.makasAdimMax,
    makasSayisi: tip === "udonus" || tip === "karsilasmali" ? 2 : 1,
    routeRelease: depo ? BELGE.routeReleaseDepo : BELGE.routeReleaseAnahat,
  };
}

export function yeniHemzemin(tip: HemzeminTip, konum: number): Hemzemin {
  return { id: yeniId("HZ"), ad: "", tip, konum, hiz: BELGE.vHemzemin };
}

export function yeniTehlike(konum: number): TehlikeNoktasi {
  return { id: yeniId("TN"), ad: "", konum, hiz: BELGE.vAcil, aciklama: "" };
}

export function yeniRing(fromAd: string, toAd: string): DurakArasiRing {
  const id = yeniId("RING");
  return {
    id,
    ad: `${fromAd} → ${toAd}`,
    fromStationId: yeniId("st"),
    toStationId: yeniId("st"),
    fromAd,
    toAd,
    uzunluk: BELGE.ortalamaDurakArasi,
    worstUzunluk: BELGE.enUzunHeadwayMesafesi,
    bestUzunluk: 300,
    vmax: BELGE.vSahasal,
    egim: 0,
    dwell: 20,
    makaslar: [],
    hemzeminler: [],
    tehlikeNoktalari: [],
  };
}

// ————————————————————————————————————————————————
// Örnek seed (jenerik — karşı taraf kendi hattını editörden girer)
// ————————————————————————————————————————————————
// Not: Aşağıdaki hat SADECE ÖRNEK/başlangıç verisidir; gerçek proje değildir.
// İstasyon adları, mesafeler, makas/geçit konumları Ringler editöründen değiştirilir.

function seedRing(
  fromAd: string,
  toAd: string,
  uzunluk: number,
  opts: Partial<DurakArasiRing> & { makaslar?: MakasBolgesi[]; hemzeminler?: Hemzemin[] } = {}
): DurakArasiRing {
  const r = yeniRing(fromAd, toAd);
  return {
    ...r,
    uzunluk,
    worstUzunluk: opts.worstUzunluk ?? Math.max(uzunluk, BELGE.enUzunHeadwayMesafesi),
    bestUzunluk: opts.bestUzunluk ?? Math.min(300, uzunluk),
    egim: opts.egim ?? 0,
    dwell: opts.dwell ?? 20,
    makaslar: opts.makaslar ?? [],
    hemzeminler: opts.hemzeminler ?? [],
    tehlikeNoktalari: opts.tehlikeNoktalari ?? [],
  };
}

// ————————————————————————————————————————————————
// Konya Tramvay T2 — Alaaddin → Adliye (Tasarım El Kitabı MAZ-VA-AKS-001 v6.0)
// ————————————————————————————————————————————————
// Kaynak: KONYA STADYUM–ŞEHİR HASTANESİ 2. ETAP Sinyalizasyon Tasarım El Kitabı
// (Aslan Sinyalizasyon / Müşavir Emay / Yüklenici Uğursal-ONH) + T2 hat durak
// dizisi. Duraklar ve makas bölgeleri GERÇEK (el kitabı senaryolarından):
//   • 1. Makas Bölgesi (LOC1) = Alaaddin — karşılaşmalı (AD/AB/CD/CB, her geçiş TCC)
//   • 2. Makas Bölgesi (LOC2) = Mevlana — headway (karma trafik notu)
//   • MKM sonrası S-makas (izole U-dönüş) · Adliye S-makas (izole çift-yön U-dönüş)
// ⚠️ Durak-arası MESAFELER yaklaşık koordinattan türetilmiştir (as-built cetvelle
//    düzeltilecek). Hızlar/headway/süreler el kitabı kabulleridir (config.ts).
export function konya2EtapSeed(): { rings: DurakArasiRing[]; loop: Loop } {
  _sayac = 0;
  const w = (u: number) => Math.round(u * 1.1); // worst-case ≈ +%10 (gerçek geometri)
  const rings: DurakArasiRing[] = [
    // Alaaddin → Hükümet: hattın merkez kavşağı (1. Makas Bölgesi, karşılaşmalı)
    // El kitabı notu: Hükümet–Alaaddin arası ~15 s'de aşılır (kısa aralık).
    seedRing("Alaaddin", "Hükümet", 360, {
      worstUzunluk: w(360),
      makaslar: [{ ...yeniMakas("karsilasmali", 45), ad: "1. Makas Bölgesi — Alaaddin (karşılaşmalı, TCC)" }],
      hemzeminler: [{ ...yeniHemzemin("karayolu", 210), ad: "Alaaddin–Hükümet karayolu geçidi (karma trafik)" }],
    }),
    // Hükümet → Mevlana: 2. Makas Bölgesi (headway). Karma trafik (yaya/karayolu).
    seedRing("Hükümet", "Mevlana", 660, {
      worstUzunluk: w(660),
      makaslar: [{ ...yeniMakas("headway", 610), ad: "2. Makas Bölgesi — Mevlana (headway)" }],
      hemzeminler: [{ ...yeniHemzemin("yaya", 300), ad: "Mevlana yaya geçidi (karma trafik)" }],
    }),
    // Mevlana → Mevlana Kültür Merkezi
    seedRing("Mevlana", "Mevlana Kültür Merkezi", 390, {
      worstUzunluk: w(390),
      hemzeminler: [{ ...yeniHemzemin("karayolu", 200), ad: "MKM karayolu geçidi" }],
    }),
    // MKM → Fetih Caddesi: MKM sonrası S-makas bölgesi (izole, karma trafiksiz)
    seedRing("Mevlana Kültür Merkezi", "Fetih Caddesi", 540, {
      worstUzunluk: w(540),
      makaslar: [{ ...yeniMakas("udonus", 70), ad: "MKM S-Makas Bölgesi (izole U-dönüş)" }],
    }),
    seedRing("Fetih Caddesi", "Spor ve Kongre Merkezi", 636, { worstUzunluk: w(636) }),
    seedRing("Spor ve Kongre Merkezi", "Karşehir Caddesi", 636, { worstUzunluk: w(636) }),
    // Karşehir Caddesi → Adliye: Adliye S-makas bölgesi (izole, çift-yön geri dönüş)
    seedRing("Karşehir Caddesi", "Adliye", 706, {
      worstUzunluk: w(706),
      makaslar: [{ ...yeniMakas("udonus", 660), ad: "Adliye S-Makas Bölgesi (izole çift-yön U-dönüş)" }],
      hemzeminler: [{ ...yeniHemzemin("karayolu", 330), ad: "Adliye karayolu geçidi" }],
    }),
  ];
  const loop: Loop = { id: "loop_konya_t2", ad: "Konya T2 — Alaaddin → Adliye", ringIds: rings.map((r) => r.id), kapali: false };
  return { rings, loop };
}
