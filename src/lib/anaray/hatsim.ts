// raysim — TAM HAT ÇOK-TREN CANLI SİMÜLASYONU (ring + anklaşman birleşik).
//
// Ring hücreleri (durak-arası) zincirlenerek tek bir birleşik hat kurulur.
// Trenler bu hat üzerinde:
//   • duraklar arası SABİT BLOK headway ile birbirini bekler (signalling.ts fiziği),
//   • MAKAS BÖLGELERİNDE gerçek interlocking'e girer: bir tren makas bölgesine
//     ancak rotayı ELE GEÇİRİRSE girer — tanzim (≤6 s × makas), geçiş (15 km/h),
//     çıkışta ROUTE RELEASE kilidi (ana hat 5 s / depo 8 s). Bölge o süre boyunca
//     başka trene KAPALI → arkadaki tren makas giriş sinyalinde (kırmızı) bekler.
// Tren sayısı arttıkça makas bölgeleri kuyruklanır → gerçek darboğaz ortaya çıkar.
//
// Fizik ve blok mantığı signalling.ts ile tek kaynaktan (segAt/allowedSpeed/blockOf).
// Tüm mesafe/hız/zamanlayıcılar paylaşılan config'e (cfg) bağlıdır.

import type { Line, RollingStock, Station } from "./types";
import type { SimConfig } from "./config";
import { BELGE, type DurakArasiRing, type MakasTip, ringToLine } from "./ring";
import { allowedSpeed, blockOf, makeBlocks, occupiedBlocks, segAt, stepMotion } from "./signalling";

const MB_MARGIN = 20; // m — hareketli blok emniyet payı (lider kuyruğunun gerisinde)

// ————————————————————————————————————————————————
// Birleşik hat modeli (ring zinciri → tek Line + makas bölgeleri)
// ————————————————————————————————————————————————

/** Birleşik hat üzerinde bir makas bölgesi = interlocking kaynağı. */
export interface MakasZon {
  id: string;
  ad: string;
  ringId: string;
  tip: MakasTip;
  merkez: number; // birleşik hat koordinatı (m)
  start: number; // bölge girişi (m)
  end: number; // bölge çıkışı (m)
  gecisHizi: number; // m/s (15 km/h)
  setupSure: number; // s — tanzim (makasSayisi × adım)
  releaseSure: number; // s — route release kilidi
}

export interface HatModel {
  line: Line;
  zones: MakasZon[];
  ringBounds: number[]; // kümülatif ring sınırları (m) — UI için
  kapali: boolean;
}

/** Ring zincirini birleşik hatta + makas bölgelerine çevirir (nominal mesafeler). */
export function loopToHat(rings: DurakArasiRing[], kapali = true, cfg: SimConfig = BELGE): HatModel {
  const W = cfg.kisitGenisligi; // makas kısıt genişliği (m)
  const segments = [] as Line["segments"];
  const stations: Station[] = [];
  const zones: MakasZon[] = [];
  const ringBounds: number[] = [0];

  let offset = 0;
  rings.forEach((ring, ri) => {
    const sub = ringToLine(ring, "nominal", cfg); // segmentler + 2 durak (0 ve L)
    const L = sub.length;
    // segmentleri offsetle taşı
    for (const s of sub.segments) segments.push({ start: s.start + offset, end: s.end + offset, vmax: s.vmax, gradient: s.gradient });
    // ilk ringin başlangıç durağı bir kez (origin, dwell 0)
    if (ri === 0) stations.push({ id: ring.fromStationId, name: ring.fromAd, position: 0, dwell: 0 });
    // her ringin varış durağı (dwell = ring.dwell)
    stations.push({ id: ring.toStationId, name: ring.toAd, position: offset + L, dwell: ring.dwell });
    // makas bölgeleri
    for (const m of ring.makaslar) {
      const merkez = offset + Math.max(0, Math.min(ring.uzunluk, m.konum));
      zones.push({
        id: `${ring.id}:${m.id}`,
        ad: m.ad || `${ring.ad} makas`,
        ringId: ring.id,
        tip: m.tip,
        merkez,
        start: Math.max(offset, merkez - W / 2),
        end: Math.min(offset + L, merkez + W / 2),
        gecisHizi: Math.max(0.1, m.gecisHizi), // 0 girilirse çevrim (dongu) hesabı Infinity olmasın
        setupSure: Math.max(1, m.makasSayisi) * m.makasAdimSuresi,
        releaseSure: m.routeRelease,
      });
    }
    offset += L;
    ringBounds.push(offset);
  });

  const line: Line = { id: "hat_birlesik", name: "Birleşik Hat", length: offset, stations, segments };
  return { line, zones, ringBounds, kapali };
}

// ————————————————————————————————————————————————
// Çok-tren interlocking simülasyonu
// ————————————————————————————————————————————————

export type ZonFaz = "bos" | "tanzim" | "kilitli" | "release";

interface ZonDurum {
  z: MakasZon;
  faz: ZonFaz;
  sahip: number; // owner tren index (-1 = boş)
  timer: number;
  busy: number; // faz != bos geçen toplam süre (s)
  gecis: number; // kaç tren geçti
  bekletme: number; // arkada bekletilen toplam tren-saniye (kuyruk yükü)
}

/** Bir makas bölgesinin zaman içindeki faz değişim çizelgesi (kompakt, UI için). */
export interface ZonOlay {
  t: number;
  faz: ZonFaz;
  sahip: number;
}

export interface ZonIstatistik {
  id: string;
  ad: string;
  ringId: string;
  tip: MakasTip;
  merkez: number;
  gecisSayisi: number;
  mesguliyet: number; // busy / tMax (0..1)
  dongu: number; // s — teorik min çevrim (tanzim + geçiş + release)
  toplamBekletme: number; // s — arkada biriken bekleme
}

export interface HatTren {
  index: number;
  points: { t: number; s: number }[];
  girisT: number;
  cikisT: number;
  turSure: number; // cikis - giris (tek hat seyir)
}

export interface Darbogaz {
  tur: "makas" | "blok" | "ring";
  id: string;
  ad: string;
  deger: number; // s — çevrim/işgal süresi
  aciklama: string;
}

export interface HatSonuc {
  line: Line;
  blocks: number[];
  ringBounds: number[];
  zones: MakasZon[];
  gecerli: boolean; // false → araç bu hatta kalkış yapamıyor (aşağıdaki metrikler geçersiz)
  stallUyari: string | null; // kalkış-stall açıklaması (varsa)
  trains: HatTren[];
  zoneTimeline: Record<string, ZonOlay[]>;
  zoneStats: ZonIstatistik[];
  baseTime: number; // tek tren tam hat süresi (s)
  tMax: number;
  throughput: number; // tren/saat (çıkan, bu koşum)
  achievedHeadway: number; // gerçekleşen ort. aralık (s, bu koşum)
  requestedHeadway: number;
  kapasiteHeadway: number; // s — sürdürülebilir min headway (seçili moda göre doygunluk probe'u)
  kapasiteFixed: number; // s — SABİT BLOK doygunluk headway'i (karşılaştırma)
  kapasiteMoving: number; // s — HAREKETLİ BLOK (CBTC) doygunluk headway'i (karşılaştırma)
  movingBlock: boolean; // animasyon/metrikler hangi modda koştu
  darbogaz: Darbogaz | null;
  maxEszamanliGecis: number; // aynı anda en fazla kaç makas işgal (mutual-excl kanıtı ≤ makas sayısı)
}

interface TrenDurum {
  k: number;
  s: number;
  v: number;
  started: boolean;
  done: boolean;
  ns: number; // next station index
  dwellUntil: number;
  points: { t: number; s: number }[];
  girisT: number;
  cikisT: number;
  stall: number; // ilerlemek İSTEDİĞİ hâlde kımıldayamadığı ardışık adım sayısı
}

/**
 * Tam hat çok-tren interlocking simülasyonu (tek yön, hat başından dispatch).
 * Trenler headway aralığıyla 0'dan girer, tüm hattı geçip L'de çıkar.
 */
export function simuleHat(
  model: HatModel,
  stock: RollingStock,
  opts: { headway: number; count: number; maxBlockLen?: number; dt?: number; captureFrames?: boolean; movingBlock?: boolean }
): HatSonuc {
  const { line, zones, ringBounds } = model;
  const dt = opts.dt ?? 0.5;
  const maxBlockLen = opts.maxBlockLen ?? 500;
  const bounds = makeBlocks(line, maxBlockLen);
  const count = Math.max(1, opts.count);
  const headway = opts.headway;
  const movingBlock = !!opts.movingBlock;

  // Tek tren referans koşusu — saf fizik (interlocking çekişmesi yok). Araç bu hatta
  // kalkamıyorsa (dik eğim / yetersiz çekiş) stall bayrağı burada en net yakalanır.
  const base = coreRun(line, zones, bounds, stock, 1e9, 1, dt, null, false);
  const baseTime = base.trains[0]?.turSure ?? 0;

  // Animasyon/metrikler SEÇİLİ modda koşar
  const res = coreRun(line, zones, bounds, stock, headway, count, dt, opts.captureFrames ? {} : null, movingBlock);

  // Kalkış-stall: tek-tren ya da çok-tren koşusunda bir tren fiziksel olarak ilerleyemedi.
  // Bu durumda süre/headway/kapasite sayıları anlamsızdır → sonucu geçersiz işaretle.
  const stallInfo = base.stallInfo ?? res.stallInfo;
  const gecerli = !stallInfo;
  const stallUyari = stallInfo
    ? `Araç bu hatta kalkış yapamıyor: ~${(stallInfo.pos / 1000).toFixed(2)} km noktasında çekiş kuvveti eğimi/direnci yenemedi ve tren durdu. Eğim profilini, aracın çekiş gücünü (power) veya kalkış çekiş kuvvetini (startingTractiveEffort) kontrol edin. Aşağıdaki süre ve kapasite değerleri bu nedenle geçersizdir.`
    : null;

  // metrikler — headway ÇIKIŞ noktasında ölçülür (servis hızı)
  const tMax = Math.max(dt, ...res.trains.map((t) => t.cikisT || 0));
  const cikisT = res.trains.filter((t) => t.cikisT > 0).map((t) => t.cikisT).sort((a, b) => a - b);
  const achievedHeadway = cikisT.length > 1 ? (cikisT[cikisT.length - 1] - cikisT[0]) / (cikisT.length - 1) : baseTime;
  const throughput = achievedHeadway > 0 ? 3600 / achievedHeadway : 0;

  // KAPASİTE PROBE'u (her iki mod): çok sıkı talep + çok tren → sürdürülebilir min headway
  const probeHeadway = (mb: boolean) => {
    const probe = coreRun(line, zones, bounds, stock, 10, Math.max(14, count), dt, null, mb);
    const pc = probe.trains.filter((t) => t.cikisT > 0).map((t) => t.cikisT).sort((a, b) => a - b);
    return pc.length > 1 ? (pc[pc.length - 1] - pc[0]) / (pc.length - 1) : baseTime;
  };
  const kapasiteFixed = probeHeadway(false);
  const kapasiteMoving = probeHeadway(true);
  const kapasiteHeadway = movingBlock ? kapasiteMoving : kapasiteFixed;

  // zon istatistik + timeline
  const zoneStats: ZonIstatistik[] = res.zoneDurum.map((zd) => ({
    id: zd.z.id,
    ad: zd.z.ad,
    ringId: zd.z.ringId,
    tip: zd.z.tip,
    merkez: zd.z.merkez,
    gecisSayisi: zd.gecis,
    mesguliyet: tMax > 0 ? zd.busy / tMax : 0,
    dongu: zd.z.setupSure + (zd.z.end - zd.z.start) / zd.z.gecisHizi + zd.z.releaseSure,
    toplamBekletme: zd.bekletme,
  }));

  // darboğaz: gerçek kapasite headway'i (probe) makas interlocking çevrimiyle
  // karşılaştır — makas mı yoksa blok/durak aralığı mı bağlayıcı?
  const makasFloor = zoneStats.length > 0 ? zoneStats.reduce((a, b) => (b.dongu > a.dongu ? b : a)) : null;
  let darbogaz: Darbogaz | null = null;
  if (makasFloor && kapasiteHeadway <= makasFloor.dongu * 1.2) {
    darbogaz = {
      tur: "makas",
      id: makasFloor.id,
      ad: makasFloor.ad,
      deger: kapasiteHeadway,
      aciklama: `Makas interlocking çevrimi ${makasFloor.dongu.toFixed(0)} s bağlayıcı → min sürdürülebilir headway ≈ ${kapasiteHeadway.toFixed(0)} s`,
    };
  } else {
    darbogaz = {
      tur: "blok",
      id: "blok-durak",
      ad: "Blok + durak aralığı",
      deger: kapasiteHeadway,
      aciklama: `Sabit blok + durak dwell bağlayıcı (makas çevrimi ${makasFloor ? makasFloor.dongu.toFixed(0) + " s" : "yok"} altında) → min sürdürülebilir headway ≈ ${kapasiteHeadway.toFixed(0)} s`,
    };
  }

  return {
    line,
    blocks: bounds,
    ringBounds,
    zones,
    gecerli,
    stallUyari,
    trains: res.trains,
    zoneTimeline: res.timeline,
    zoneStats,
    baseTime,
    tMax,
    throughput,
    achievedHeadway,
    requestedHeadway: headway,
    kapasiteHeadway,
    kapasiteFixed,
    kapasiteMoving,
    movingBlock,
    darbogaz,
    maxEszamanliGecis: res.maxEsGecis,
  };
}

interface CoreOut {
  trains: HatTren[];
  zoneDurum: ZonDurum[];
  timeline: Record<string, ZonOlay[]>;
  maxEsGecis: number;
  stallInfo: { train: number; pos: number } | null; // bir tren kalkamadıysa (fizik)
}

function coreRun(
  line: Line,
  zones: MakasZon[],
  bounds: number[],
  stock: RollingStock,
  headway: number,
  count: number,
  dt: number,
  capture: Record<string, never> | null,
  movingBlock: boolean
): CoreOut {
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  const b = Math.max(0.1, stock.maxBraking); // 0 girilirse brakeDist=Infinity ve kalıcı stall olmasın
  const EPS = 1;
  const nb = bounds.length - 1;
  const L = line.length;
  const stops = line.stations.map((s) => ({ pos: s.position, dwell: s.dwell }));
  const firstStop = (() => {
    const i = stops.findIndex((s) => s.pos > 1e-6);
    return i < 0 ? stops.length : i;
  })();
  const brakeDist = (stock.maxSpeed * stock.maxSpeed) / (2 * b);

  const trains: TrenDurum[] = Array.from({ length: count }, (_, k) => ({
    k, s: 0, v: 0, started: false, done: false, ns: firstStop, dwellUntil: -1, points: [], girisT: -1, cikisT: 0, stall: 0,
  }));

  const zd: ZonDurum[] = zones.map((z) => ({ z, faz: "bos", sahip: -1, timer: 0, busy: 0, gecis: 0, bekletme: 0 }));
  const timeline: Record<string, ZonOlay[]> = {};
  for (const z of zones) timeline[z.id] = [{ t: 0, faz: "bos", sahip: -1 }];
  const logFaz = (i: number, t: number) => {
    if (!capture) return;
    const tl = timeline[zd[i].z.id];
    const last = tl[tl.length - 1];
    if (last.faz !== zd[i].faz || last.sahip !== zd[i].sahip) tl.push({ t, faz: zd[i].faz, sahip: zd[i].sahip });
  };

  let t = 0;
  let maxEsGecis = 0;
  let stallInfo: { train: number; pos: number } | null = null;
  const maxT = 1e9; // güvenli üst sınır coreRun içinde bitiş koşuluyla
  const hardT = Math.max(3600, count * Math.max(1, headway) + 4000);
  // Mutlak iterasyon freni (sim.ts ile aynı mantık). hardT tek-tren referans
  // koşusunda ~1e9 olabildiği için, kalkamayan bir tren döngüyü sonsuza kilitlerdi;
  // bu sayaç her koşulda tarayıcının donmasını engeller.
  const maxIter = 2_000_000;
  const STALL_LIMIT = 40; // ~20 s (dt=0.5) ilerleyememe → fiziksel kalkış-stall
  let iter = 0;

  while (trains.some((tr) => !tr.done) && t < Math.min(maxT, hardT)) {
    if (++iter > maxIter) break;
    // 1) Zon fazlarını ilerlet
    let esGecis = 0;
    zd.forEach((z, i) => {
      if (z.faz === "tanzim") {
        z.timer += dt;
        if (z.timer >= z.z.setupSure) { z.faz = "kilitli"; z.timer = 0; }
      } else if (z.faz === "release") {
        z.timer += dt;
        if (z.timer >= z.z.releaseSure) { z.faz = "bos"; z.sahip = -1; z.timer = 0; }
      }
      if (z.faz !== "bos") z.busy += dt;
      if (z.faz === "kilitli") esGecis++;
      logFaz(i, t);
    });
    if (esGecis > maxEsGecis) maxEsGecis = esGecis;

    // 2) Blok işgali — tren boyu kadar (kuyruk→baş)
    const occ = new Array<number>(nb).fill(-1);
    for (const tr of trains) if (tr.started && !tr.done) {
      const [a, c] = occupiedBlocks(bounds, tr.s, stock.length);
      for (let j = a; j <= c; j++) occ[j] = tr.k;
    }

    // 2b) Makas bölgesi rota tahsisi — bölgeye EN YAKIN (en önde) tren kazanır.
    // Eskiden tahsis 3) döngüsünde "önce talep eden kazanır" idi. Bu, öndeki tren
    // bölge girişine yakın bir durakta dwell yaparken (dwell'de talep edemez) ARKADAKİ
    // trenin rotayı kapmasına yol açıyordu: öndeki tren giremez, arkadaki de öndekini
    // geçemez → kalıcı deadlock. Gerçek TCC de rotayı yaklaşan ilk trene verir.
    zd.forEach((z, i) => {
      if (z.faz !== "bos") return;
      const yaklas = brakeDist + z.z.setupSure * stock.maxSpeed + 30;
      let aday: TrenDurum | null = null;
      for (const tr of trains) {
        if (!tr.started || tr.done) continue;
        const uzaklik = z.z.start - tr.s;
        if (uzaklik < -1e-6 || uzaklik > yaklas) continue; // geçmiş ya da henüz uzak
        if (!aday || tr.s > aday.s) aday = tr; // en önde olan kazanır
      }
      if (aday) { z.faz = "tanzim"; z.sahip = aday.k; z.timer = 0; logFaz(i, t); }
    });

    // 3) Trenler
    for (const tr of trains) {
      if (tr.done) continue;

      if (!tr.started) {
        const ready = t + 1e-9 >= tr.k * headway;
        if (ready && (occ[0] === -1 || occ[0] === tr.k)) {
          tr.started = true;
          tr.girisT = t;
          tr.points.push({ t, s: 0 });
        } else {
          if (ready) tr.points.push({ t, s: 0 });
          continue;
        }
      }

      if (tr.dwellUntil > t + 1e-9) {
        tr.points.push({ t: t + dt, s: tr.s });
        continue;
      }

      // 3a) hareket yetkisi (MA)
      let MA = L;
      if (movingBlock) {
        // HAREKETLİ BLOK: MA = önümüzdeki en yakın trenin KUYRUĞU − emniyet payı.
        // Blok granülü yok; tren, öndekinin fiziksel kuyruğuna kadar sürekli yaklaşır.
        for (const o of trains) {
          if (o.k === tr.k || !o.started || o.done) continue;
          if (o.s > tr.s + 1e-6) MA = Math.min(MA, Math.max(0, o.s - stock.length) - MB_MARGIN);
        }
        MA = Math.max(tr.s, MA);
      } else {
        // SABİT BLOK: MA = önümüzdeki ilk dolu bloğun giriş sınırı
        const cur = blockOf(bounds, tr.s);
        for (let j = cur + 1; j < nb; j++) {
          if (occ[j] !== -1 && occ[j] !== tr.k) { MA = bounds[j]; break; }
        }
        // Fiziksel emniyet: trenin BULUNDUĞU blok yukarıdaki taramaya dahil değil ve
        // occ[] blok başına tek tren tutar (son yazan kazanır) → aynı bloğa düşen iki
        // trende öndeki görünmez olur ve trenler birbirinin İÇİNDEN geçerdi. Öndeki
        // trenin kuyruğu her hâlükârda aşılamaz. Normalde blok sınırı daha kısıtlayıcı
        // olduğu için sabit blok davranışı değişmez; bu yalnız ihlali engeller.
        for (const o of trains) {
          if (o.k === tr.k || !o.started || o.done) continue;
          if (o.s > tr.s + 1e-6) MA = Math.min(MA, Math.max(tr.s, o.s - stock.length - MB_MARGIN));
        }
      }

      // 3b) makas bölgesi kapısı: önümüzdeki ilk bölge (start > s)
      let zoneGate = L + 1;
      let zi = -1;
      for (let i = 0; i < zd.length; i++) {
        if (zd[i].z.start > tr.s + 1e-6 && zd[i].z.start < zoneGate) { zoneGate = zd[i].z.start; zi = i; }
      }
      if (zi >= 0) {
        const z = zd[zi];
        const uzaklik = z.z.start - tr.s;
        // Rota tahsisi 2b'de yapıldı (bölgeye en yakın tren kazanır) — burada yalnız
        // geçiş hakkı sorgulanır.
        // sahip biz + kilitli → geç; aksi halde giriş sınırında bekle
        const gecebilir = z.sahip === tr.k && z.faz === "kilitli";
        if (!gecebilir) {
          if (z.sahip !== tr.k || z.faz !== "kilitli") {
            if (uzaklik < 1e-6 + EPS) z.bekletme += dt; // girişte bekliyor → kuyruk yükü
          }
        } else {
          zoneGate = L + 1; // geçiş serbest
        }
      }

      const blockTarget = Math.min(MA, zoneGate);
      const nsPos = tr.ns < stops.length ? stops[tr.ns].pos : L;
      const redStop = blockTarget < nsPos - 1e-6;
      const target = Math.min(blockTarget, nsPos);

      const vAllowed = allowedSpeed(line, stock, tr.s, target, b);
      let vNew = stepMotion(stock, tr.v, vAllowed, segAt(line, tr.s).gradient, dt, meff, b).vNew;

      let sNew = tr.s + ((tr.v + vNew) / 2) * dt;

      // istasyona varış
      if (!redStop && sNew >= nsPos - 1e-6) {
        sNew = nsPos;
        tr.s = sNew;
        tr.v = 0;
        tr.points.push({ t: t + dt, s: sNew });
        if (nsPos >= L - 1e-6) {
          tr.done = true;
          tr.cikisT = t + dt;
        } else {
          tr.dwellUntil = t + dt + stops[tr.ns].dwell;
          tr.ns++;
        }
        continue;
      }

      // kırmızı/makas kapısında durma
      if (redStop && sNew >= blockTarget - EPS) {
        sNew = Math.max(tr.s, blockTarget - EPS);
        vNew = 0;
      }

      // Kalkış-stall tespiti: tren durakta/sinyalde DEĞİL (redStop yok) ve önünde
      // gidilecek yol varken durgun hızdan hiç ilerleyemiyorsa (dik eğim + yetersiz
      // çekiş → net kuvvet ≤ 0), fiziksel olarak kalkamıyor demektir. Sinyalde
      // meşru bekleyen tren redStop ile ayrışır; yavaş tırmanan tren ilerleme (>1 mm)
      // gösterip sayaç sıfırlanır. Sadece gerçekten donan tren eşiği aşar.
      const gidilecekYol = !redStop && nsPos - tr.s > 1e-3;
      if (gidilecekYol && tr.v < 0.1 && vNew < 0.1 && sNew - tr.s < 1e-3) {
        tr.stall += 1;
        if (tr.stall >= STALL_LIMIT) {
          if (!stallInfo) stallInfo = { train: tr.k, pos: tr.s };
          tr.done = true; // treni bitir → döngü sonsuza kilitlenmesin
          continue;
        }
      } else {
        tr.stall = 0;
      }

      tr.s = sNew;
      tr.v = vNew;
      tr.points.push({ t: t + dt, s: sNew });
    }

    // 4) Makas işgal/çıkış kontrolü (sahip bölgeyi geçti mi?)
    zd.forEach((z, i) => {
      if (z.faz === "kilitli" && z.sahip >= 0) {
        const owner = trains[z.sahip];
        if (owner.done || owner.s >= z.z.end - 1e-6) {
          z.faz = "release";
          z.timer = 0;
          z.gecis += 1;
          logFaz(i, t);
        }
      }
    });

    t += dt;
  }

  return {
    trains: trains.map((tr) => ({
      index: tr.k,
      points: tr.points,
      girisT: tr.girisT,
      cikisT: tr.cikisT,
      turSure: (tr.cikisT || t) - (tr.girisT < 0 ? 0 : tr.girisT),
    })),
    zoneDurum: zd,
    timeline,
    maxEsGecis,
    stallInfo,
  };
}
