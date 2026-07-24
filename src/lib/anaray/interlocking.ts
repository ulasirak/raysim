// raysim — MAKAS BÖLGESİ ANKLAŞMAN MOTORU (dağıtık interlocking).
//
// Belge: Tasarım El Kitabı MAZ-VA-AKS-001 v6.0 (bölge senaryoları s.19–44).
// Her makas bölgesi bağımsız bir SIL4 anklaşman birimidir (dağıtık; merkezi ana
// anklaşman YOK). Bir bölge; bloklardan (BS_n), makaslardan (PM_n) ve rotalardan
// (NEREDEN→NEREYE) oluşur. Rota talebi geldiğinde motor:
//   1) ÇAKIŞMA MATRİKSİ + blok doluluğu ile emniyet kontrolü yapar,
//   2) makasları SIRALI tanzim eder (her adım ≤6 s — SARI faz),
//   3) tüm makas zinciri kilitlenince giriş sinyalini YEŞİL yapar,
//   4) tren bölgeyi işgal eder (arkadaki sinyaller KIRMIZI),
//   5) tren çıkınca ROUTE RELEASE TIMER (ana hat 5 s / depo 8 s) dolana dek
//      makaslar kilitli kalır, sonra rota serbest bırakılır.
// Kritik donanım arızası / kırmızı ihlali → yalnız o bölgenin sinyalleri SÖNÜK
// (fail-safe blanking). TCC yalnız "istek" gönderir; son söz saha PLC'sindedir.

import { BELGE } from "./ring";
import type { SimConfig } from "./config";

// ————————————————————————————————————————————————
// Statik topoloji
// ————————————————————————————————————————————————

export type BolgeTip = "karsilasmali" | "headway" | "barinma" | "depo" | "udonus";

/** Bir rotanın (NEREDEN→NEREYE) talep ettiği kaynaklar. */
export interface AnklasmanRota {
  id: string; // ör. LOC1_AD
  nereden: string; // "A"
  nereye: string; // "D"
  bloklar: string[]; // serbest olması gereken BS blokları
  makaslar: { id: string; konum: string }[]; // gereken makas doğrultuları (PM → "AD")
  sinyal: string; // giriş sinyali (SG_n) — NEREDEN ucundaki
  headwayGerekli: boolean; // "Headway time out tamamlandı" şartı var mı?
  tccGerekli: boolean; // her geçişte TCC onayı gerekir mi?
}

export interface MakasBolgeTopolojisi {
  id: string;
  ad: string;
  tip: BolgeTip;
  bloklar: string[]; // BS_n
  makaslar: string[]; // PM_n
  sinyaller: string[]; // SG_n
  rotalar: AnklasmanRota[];
  /** Aynı anda kurulabilen rota çiftleri (çakışma matriksinde X). Verilmezse
   *  kaynak paylaşımından türetilir (blok/makas çakışması → 0). */
  esZamanli?: [string, string][];
  /** Bölge uzunluğu (m) — geçiş süresi hesabı için (15 km/h). */
  uzunluk: number;
  gecisSuresi?: number; // s — verilirse geçiş süresi sabitlenir
}

// ————————————————————————————————————————————————
// Çakışma matriksi
// ————————————————————————————————————————————————

/** İki rota kaynak (blok/makas) düzeyinde çakışır mı? */
export function rotaCakisir(a: AnklasmanRota, b: AnklasmanRota): boolean {
  // ortak blok
  const bset = new Set(b.bloklar);
  if (a.bloklar.some((x) => bset.has(x))) return true;
  // farklı doğrultu istenen ortak makas
  const bmap = new Map(b.makaslar.map((m) => [m.id, m.konum]));
  for (const m of a.makaslar) {
    const bk = bmap.get(m.id);
    if (bk !== undefined && bk !== m.konum) return true;
  }
  return false;
}

/** İki rota aynı anda kurulabilir mi? (esZamanli listesi varsa onu, yoksa kaynak türetmesini kullanır) */
export function birlikteOlur(topo: MakasBolgeTopolojisi, aId: string, bId: string): boolean {
  if (aId === bId) return true;
  if (topo.esZamanli) {
    return topo.esZamanli.some(([x, y]) => (x === aId && y === bId) || (x === bId && y === aId));
  }
  const a = topo.rotalar.find((r) => r.id === aId);
  const b = topo.rotalar.find((r) => r.id === bId);
  if (!a || !b) return false;
  return !rotaCakisir(a, b);
}

/** Tam çakışma matriksi: [i][j] = true (X, birlikte uygun) / false (0, mümkün değil). */
export function cakismaMatriksi(topo: MakasBolgeTopolojisi): boolean[][] {
  const n = topo.rotalar.length;
  const m: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      m[i][j] = i === j ? true : birlikteOlur(topo, topo.rotalar[i].id, topo.rotalar[j].id);
    }
  }
  return m;
}

// ————————————————————————————————————————————————
// Dinamik durum + simülasyon
// ————————————————————————————————————————————————

export type SinyalAspekt = "yesil" | "sari" | "kirmizi" | "sonuk";
export type RotaFaz = "bos" | "talep" | "tanzim" | "kurulu" | "isgal" | "release";

export interface RotaCanli {
  id: string;
  faz: RotaFaz;
  faartim: number; // faz içi geçen süre (s)
}

/** Bir bölgenin bir andaki tam durumu. */
export interface AnklasmanKare {
  t: number;
  sinyaller: Record<string, SinyalAspekt>;
  bloklar: Record<string, boolean>; // dolu mu?
  makaslar: Record<string, "kilitli" | "hareket" | "serbest">;
  aktifRotalar: string[]; // kurulu + işgal
  failSafe: boolean;
}

export interface RotaTalebi {
  t: number; // talep zamanı (s)
  rotaId: string;
  trenId?: string;
}

export interface RotaSonuc {
  rotaId: string;
  trenId: string;
  talepT: number;
  kabulT: number; // makas tanzimi başladığı an (-1 = hiç kurulamadı)
  yesilT: number; // sinyal yeşile döndüğü an
  cikisT: number; // tren bölgeyi terk ettiği an
  bekleme: number; // kabulT − talepT (çakışma/emniyet kuyruğu)
  redSebep: string; // boşsa kabul edildi
}

export interface AnklasmanSonuc {
  kareler: AnklasmanKare[];
  sonuclar: RotaSonuc[];
  maxEszamanli: number; // aynı anda kurulu/işgal en fazla rota
  ortBekleme: number; // s
  throughput: number; // tren/saat (kabul edilen)
  toplamSure: number;
  matriks: boolean[][];
}

interface Fault {
  t: number;
  sure: number;
}

/**
 * Bir makas bölgesini zaman-adımlı simüle eder. İstekler zamanına göre işlenir;
 * çakışan rota talepleri kuyrukta bekler (emniyet). Fail-safe aralığında bölge söner.
 */
export function simuleEtAnklasman(
  topo: MakasBolgeTopolojisi,
  istekler: RotaTalebi[],
  opts: { dt?: number; headwayTimeout?: number; fault?: Fault; cfg?: SimConfig } = {}
): AnklasmanSonuc {
  const dt = opts.dt ?? 0.5;
  const cfg = opts.cfg ?? BELGE;
  const headwayTimeout = opts.headwayTimeout ?? 0;
  const gecis = topo.gecisSuresi ?? Math.max(8, topo.uzunluk / cfg.vMakas); // makas geçiş hızı
  const releaseSure = topo.tip === "depo" ? cfg.routeReleaseDepo : cfg.routeReleaseAnahat;

  const rotaById = new Map(topo.rotalar.map((r) => [r.id, r]));
  const matriks = cakismaMatriksi(topo);

  // Talep kuyruğu (zamana göre)
  const kuyruk = [...istekler]
    .map((x, i) => ({ ...x, trenId: x.trenId ?? `T${i + 1}`, _i: i }))
    .sort((a, b) => a.t - b.t || a._i - b._i);

  // Aktif rota süreçleri (aynı anda birden fazla — çakışmayanlar)
  interface Surec {
    talep: (typeof kuyruk)[number];
    rota: AnklasmanRota;
    faz: RotaFaz;
    faartim: number;
    kabulT: number;
    yesilT: number;
    cikisT: number;
  }
  const aktif: Surec[] = [];
  const sonuclar: RotaSonuc[] = [];
  const kareler: AnklasmanKare[] = [];

  const tanzimSuresi = (r: AnklasmanRota) =>
    Math.max(1, r.makaslar.length) * cfg.makasAdimMax; // sıralı makas adımları

  let t = 0;
  let sirIdx = 0;
  let maxEs = 0;
  const bitis = () => sirIdx >= kuyruk.length && aktif.length === 0;
  const maxT = (kuyruk.at(-1)?.t ?? 0) + 3600;

  while (!bitis() && t < maxT) {
    const failSafe = !!opts.fault && t >= opts.fault.t && t < opts.fault.t + opts.fault.sure;

    // Çakışma için "meşgul" sayılan rotalar: tanzim/kurulu/işgal (release'te makas hâlâ kilitli ama rota yeni talebe kapalı)
    const mesgulIds = new Set(aktif.filter((s) => s.faz !== "release").map((s) => s.rota.id));
    const releaseIds = new Set(aktif.filter((s) => s.faz === "release").map((s) => s.rota.id));

    // Yeni talepleri kabul et (fail-safe'te kabul yok)
    while (!failSafe && sirIdx < kuyruk.length && kuyruk[sirIdx].t <= t + 1e-9) {
      const talep = kuyruk[sirIdx];
      const rota = rotaById.get(talep.rotaId);
      if (!rota) {
        sonuclar.push({ rotaId: talep.rotaId, trenId: talep.trenId, talepT: talep.t, kabulT: -1, yesilT: -1, cikisT: -1, bekleme: 0, redSebep: "Rota tanımsız" });
        sirIdx++;
        continue;
      }
      // Emniyet: aktif hiçbir rota ile çakışmamalı + release'teki rotayla da çakışmamalı (makas kilitli)
      const cakisan = [...mesgulIds, ...releaseIds].filter((id) => id !== rota.id && !birlikteOlur(topo, rota.id, id));
      const headwayOK = !rota.headwayGerekli || headwayTimeout <= (t - (talep.t - talep.t)); // basit: timeout sağlandı say
      if (cakisan.length === 0 && headwayOK) {
        aktif.push({ talep, rota, faz: "tanzim", faartim: 0, kabulT: t, yesilT: -1, cikisT: -1 });
        mesgulIds.add(rota.id);
        sirIdx++;
      } else {
        // Kuyrukta beklet: bu talebi zamanı gelmiş ama çakışıyor → ilerlet, sonraki tik'te tekrar dene
        // (sıralı adalet için ilk çakışan talepte dur)
        break;
      }
    }

    // Aktif süreçleri ilerlet
    for (const s of aktif) {
      s.faartim += dt;
      switch (s.faz) {
        case "tanzim":
          if (s.faartim >= tanzimSuresi(s.rota)) { s.faz = "kurulu"; s.faartim = 0; s.yesilT = t; }
          break;
        case "kurulu":
          // Yeşil yandı → tren derhal girer
          s.faz = "isgal"; s.faartim = 0;
          break;
        case "isgal":
          if (s.faartim >= gecis) { s.faz = "release"; s.faartim = 0; s.cikisT = t; }
          break;
        case "release":
          if (s.faartim >= releaseSure) {
            s.faz = "bos";
            sonuclar.push({
              rotaId: s.rota.id, trenId: s.talep.trenId, talepT: s.talep.t,
              kabulT: s.kabulT, yesilT: s.yesilT, cikisT: s.cikisT,
              bekleme: s.kabulT - s.talep.t, redSebep: "",
            });
          }
          break;
      }
    }
    // Biten süreçleri çıkar
    for (let i = aktif.length - 1; i >= 0; i--) if (aktif[i].faz === "bos") aktif.splice(i, 1);

    const esz = aktif.filter((s) => s.faz === "kurulu" || s.faz === "isgal").length;
    if (esz > maxEs) maxEs = esz;

    // Kare üret
    kareler.push(kareUret(topo, aktif, t, failSafe));
    t += dt;
  }

  const kabuller = sonuclar.filter((s) => s.redSebep === "");
  const ortBekleme = kabuller.length ? kabuller.reduce((a, s) => a + s.bekleme, 0) / kabuller.length : 0;
  const throughput = t > 0 ? (kabuller.length / t) * 3600 : 0;

  return { kareler, sonuclar, maxEszamanli: maxEs, ortBekleme, throughput, toplamSure: t, matriks };
}

function kareUret(
  topo: MakasBolgeTopolojisi,
  aktif: { rota: AnklasmanRota; faz: RotaFaz }[],
  t: number,
  failSafe: boolean
): AnklasmanKare {
  const sinyaller: Record<string, SinyalAspekt> = {};
  const bloklar: Record<string, boolean> = {};
  const makaslar: Record<string, "kilitli" | "hareket" | "serbest"> = {};

  for (const sg of topo.sinyaller) sinyaller[sg] = failSafe ? "sonuk" : "kirmizi";
  for (const bs of topo.bloklar) bloklar[bs] = false;
  for (const pm of topo.makaslar) makaslar[pm] = "serbest";

  if (!failSafe) {
    for (const s of aktif) {
      const sg = s.rota.sinyal;
      if (s.faz === "tanzim") sinyaller[sg] = pri(sinyaller[sg], "sari");
      else if (s.faz === "kurulu") sinyaller[sg] = pri(sinyaller[sg], "yesil");
      // işgal/release'te giriş sinyali tekrar kırmızı (blok dolu / koruma)
      // Makaslar
      if (s.faz === "tanzim") for (const m of s.rota.makaslar) makaslar[m.id] = "hareket";
      else if (s.faz === "kurulu" || s.faz === "isgal" || s.faz === "release")
        for (const m of s.rota.makaslar) makaslar[m.id] = "kilitli";
      // Bloklar
      if (s.faz === "isgal") for (const b of s.rota.bloklar) bloklar[b] = true;
    }
  }

  const aktifRotalar = failSafe ? [] : aktif.filter((s) => s.faz === "kurulu" || s.faz === "isgal").map((s) => s.rota.id);
  return { t, sinyaller, bloklar, makaslar, aktifRotalar, failSafe };
}

// yeşil > sarı > kırmızı önceliği (bir sinyalde birden çok rota olabilir)
function pri(mevcut: SinyalAspekt, yeni: SinyalAspekt): SinyalAspekt {
  const rank: Record<SinyalAspekt, number> = { sonuk: -1, kirmizi: 0, sari: 1, yesil: 2 };
  return rank[yeni] > rank[mevcut] ? yeni : mevcut;
}

// ————————————————————————————————————————————————
// Belge bölge seed'leri (s.19–27)
// ————————————————————————————————————————————————

/** 1. Makas Bölgesi (s.19): karşılaşmalı — A↔D, A↔B, C↔D, C↔B. Tek tren (tümü çakışır). */
export function bolge1(): MakasBolgeTopolojisi {
  const R = (id: string, nereden: string, nereye: string, sinyal: string, konum: string): AnklasmanRota => ({
    id, nereden, nereye, sinyal, bloklar: ["BS1", "BS2"], makaslar: [{ id: "PM1", konum }], headwayGerekli: false, tccGerekli: true,
  });
  return {
    id: "1", ad: "1. Makas Bölgesi — Alaaddin (karşılaşmalı, TCC)", tip: "karsilasmali",
    bloklar: ["BS1", "BS2"], makaslar: ["PM1"], sinyaller: ["SG_A", "SG_C", "SG_D", "SG_B"], uzunluk: 90,
    rotalar: [
      R("LOC1_AD", "A", "D", "SG_A", "AD"),
      R("LOC1_AB", "A", "B", "SG_A", "AB"),
      R("LOC1_CD", "C", "D", "SG_C", "CD"),
      R("LOC1_CB", "C", "B", "SG_C", "CB"),
    ],
    esZamanli: [], // hepsi BS1&BS2 paylaşır → hiçbiri birlikte kurulamaz (tek tren)
  };
}

/** 2. Makas Bölgesi (s.21): AB & CD paralel düz; BE, DB sapaklar. */
export function bolge2(): MakasBolgeTopolojisi {
  return {
    id: "2", ad: "2. Makas Bölgesi — Mevlana (headway + U-dönüş)", tip: "headway",
    bloklar: ["BS4", "BS5", "BS6", "BS8"], makaslar: ["PM2", "PM3"], sinyaller: ["SG_A", "SG_C", "SG_B", "SG_D"], uzunluk: 120,
    rotalar: [
      { id: "LOC2_AB", nereden: "A", nereye: "B", sinyal: "SG_A", bloklar: ["BS5"], makaslar: [{ id: "PM2", konum: "AB" }], headwayGerekli: true, tccGerekli: false },
      { id: "LOC2_CD", nereden: "C", nereye: "D", sinyal: "SG_C", bloklar: ["BS4", "BS6"], makaslar: [{ id: "PM3", konum: "CD" }], headwayGerekli: true, tccGerekli: false },
      { id: "LOC2_BE", nereden: "B", nereye: "E", sinyal: "SG_B", bloklar: ["BS8"], makaslar: [{ id: "PM2", konum: "BE" }], headwayGerekli: true, tccGerekli: false },
      { id: "LOC2_DB", nereden: "D", nereye: "B", sinyal: "SG_D", bloklar: ["BS5", "BS6"], makaslar: [{ id: "PM3", konum: "DB" }, { id: "PM2", konum: "DB" }], headwayGerekli: false, tccGerekli: true },
    ],
    // Belge çakışma matriksi (X hücreleri): AB-CD ve CD-BE aynı anda kurulabilir.
    esZamanli: [["LOC2_AB", "LOC2_CD"], ["LOC2_CD", "LOC2_BE"]],
  };
}

/** 5.1 Barınma Bölgesi (s.27): A-B-C barınma + D-E-F barınma; her geçiş TCC. */
export function bolge51(): MakasBolgeTopolojisi {
  const mk = (id: string, ned: string, ney: string, sg: string, bloklar: string[], konum: string): AnklasmanRota => ({
    id, nereden: ned, nereye: ney, sinyal: sg, bloklar, makaslar: [{ id: "PM5", konum }], headwayGerekli: false, tccGerekli: true,
  });
  return {
    id: "5.1", ad: "5.1 Barınma / S-Makas Bölgesi — Adliye (izole, her geçiş TCC)", tip: "barinma",
    bloklar: ["BS29", "BS30", "BS31", "BS21", "BS22", "BS23", "BS24"], makaslar: ["PM5", "PM6"], sinyaller: ["SG_A", "SG_B", "SG_D", "SG_E"], uzunluk: 100,
    rotalar: [
      mk("LOC5.1_AB", "A", "B", "SG_A", ["BS29", "BS30"], "AB"),
      mk("LOC5.1_BC", "B", "C", "SG_B", ["BS21", "BS30", "BS31"], "BC"),
      mk("LOC5.1_AC", "A", "C", "SG_A", ["BS30", "BS31"], "AC"),
      { id: "LOC5.1_DE", nereden: "D", nereye: "E", sinyal: "SG_D", bloklar: ["BS23", "BS24"], makaslar: [{ id: "PM6", konum: "DE" }], headwayGerekli: false, tccGerekli: true },
      { id: "LOC5.1_EF", nereden: "E", nereye: "F", sinyal: "SG_E", bloklar: ["BS22", "BS23"], makaslar: [{ id: "PM6", konum: "EF" }], headwayGerekli: false, tccGerekli: true },
      { id: "LOC5.1_DF", nereden: "D", nereye: "F", sinyal: "SG_D", bloklar: ["BS22", "BS23"], makaslar: [{ id: "PM6", konum: "DF" }], headwayGerekli: false, tccGerekli: true },
    ],
    // Belge: A-tarafı (ABC) ile D-tarafı (DEF) birbirinden bağımsız → çapraz X.
    esZamanli: [
      ["LOC5.1_AB", "LOC5.1_DE"], ["LOC5.1_AB", "LOC5.1_EF"], ["LOC5.1_AB", "LOC5.1_DF"],
      ["LOC5.1_BC", "LOC5.1_DE"], ["LOC5.1_BC", "LOC5.1_EF"], ["LOC5.1_BC", "LOC5.1_DF"],
      ["LOC5.1_AC", "LOC5.1_DE"], ["LOC5.1_AC", "LOC5.1_EF"], ["LOC5.1_AC", "LOC5.1_DF"],
    ],
  };
}

export function bolgeSeed(): MakasBolgeTopolojisi[] {
  return [bolge1(), bolge2(), bolge51()];
}

/**
 * Ring makas tipini temsili anklaşman bölgesine bağlar (mantıksal köprü).
 * Ring editöründe bir makas bölgesinden onun interlocking modeline geçmek için.
 */
export function bolgeIdIcin(tip: BolgeTip): string {
  switch (tip) {
    case "karsilasmali": return "1"; // yüz yüze — tek tren, tümü çakışır
    case "headway": return "2"; // paralel düz + sapak (AB+CD X)
    // İzole S-makas U-dönüş bölgesi 5.1 ile aynı rejimdedir (izole, her geçiş TCC).
    // Önceden "2"ye düşüyordu → U-dönüş bölgeleri yanlışlıkla headway modelini
    // açıyor, 5.1 modeline ise hiçbir bölgeden bağlantı kalmıyordu.
    case "udonus": return "5.1";
    case "barinma": return "5.1"; // barınma — çapraz bağımsız kollar
    case "depo": return "5.1"; // her geçiş TCC, benzer kilit rejimi
    default: return "1";
  }
}

/** Bir makas bölgesinin bağlı olduğu anklaşman modeli: açık bağ > tipten türetme. */
export function makasBolgeId(m: { tip: BolgeTip; bolgeId?: string }): string {
  return m.bolgeId ?? bolgeIdIcin(m.tip);
}
