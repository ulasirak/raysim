// raysim — KALICI PROJE ŞEMASI: SÜRÜMLEME + MİGRASYON (tek kaynak).
//
// Neden: Kalıcı projeler Firestore'da JSON string olarak saklanır. Her yeni özellik
// ring modeline / config'e alan ekliyor. Eski kayıtlar bu alanları taşımadığından,
// ham `JSON.parse(...) as ProjeVerisi` cast'i motorda `undefined` → `NaN` ya da
// sessiz yanlış sonuç üretir. Bu modül TEK ve İDEMPOTENT normalleştirici olarak her
// okumada (veri katmanı `projeGetir` + UI `veriUygula`) çağrılır:
//   • Eksik zorunlu alanlar varsayılanla doldurulur (rings dahil DERİN normalizasyon).
//   • Bilinen eski-şema göçleri uygulanır (terminalDwell/donusSuresi → peronIsgali,
//     makasTipi → sMakas/xMakas).
//   • Artık kullanılmayan eski alanlar düşürülür → doküman şişmesi önlenir.
//
// KURAL: `migrate` behavior-preserving ve idempotenttir — geçerli GÜNCEL veriyi
// değiştirmez (migrate(migrate(x)) == migrate(x)). Bu yüzden eski projeyi AÇMAK tek
// başına yeniden-kayıt tetiklemez; göç bellekte uygulanır, kullanıcı ilk gerçek
// düzenlemede kalıcılaşır (tembel göç).
//
// SÜRÜM: `VERI_SURUM` şema (yapı) sürümüdür ve doküman düzeyinde `veriSurum` alanına
// yazılır (bkz. projeler.projeKaydet). Gelecekte YIKICI bir yapı değişikliği (alan
// yeniden adlandırma / anlam değişimi) olduğunda sürüm artırılır ve `SURUM_ADIMLARI`
// dizisine o sürüme özel bir adım eklenir; şekil-tabanlı doldurma her zaman en sonda
// koşar. Şu an tüm göçler şekil-tabanlı olduğundan adım dizisi boştur.

import type { ProjeVerisi } from "@/lib/projeler";
import {
  varsayilanConfig, varsayilanMeta, varsayilanIsletme, VARSAYILAN_TERMINAL,
  type SimConfig, type ProjeMeta, type Isletme, type TerminalConfig, type DonusTip,
} from "./config";
import { varsayilanArac } from "./vehicles";
import type { RollingStock } from "./types";
import {
  tccGerekli,
  type DurakArasiRing, type MakasBolgesi, type Hemzemin, type TehlikeNoktasi,
  type Kurp, type SinyalLambasi, type Sube, type MakasTip, type HemzeminTip,
} from "./ring";

/** Kalıcı proje ŞEMA (yapı) sürümü. Doküman düzeyinde `veriSurum`e yazılır.
 *  v2: cfg.ivme / cfg.yavaslama artık simülasyona BAĞLI (kalkış ivme tavanı + servis
 *  freni). Önceki sürümlerde bu iki alan EYLEMSİZDİ (hiçbir motor okumuyordu), bu yüzden
 *  eski kayıtlardaki değerleri (genelde 1,0) yeni anlamda kullanmak mevcut saatleri
 *  bozardı → v2 altındaki kayıtlarda bu iki alan yeni varsayılana (mevcut davranışı
 *  koruyan, bağlamayan 1,2) çekilir. Bkz. migrate() içindeki sürüm-kapılı adım. */
export const VERI_SURUM = 2;

// ————————————————————————————————————————————————
// Tip-güvenli zorlayıcılar (bilinmeyen JSON → beklenen tip)
// ————————————————————————————————————————————————
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const obj = (x: unknown): Record<string, unknown> => (isObj(x) ? x : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const num = (x: unknown, d: number): number =>
  typeof x === "number" && Number.isFinite(x)
    ? x
    : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))
      ? Number(x)
      : d;
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const bool = (x: unknown, d = false): boolean => (typeof x === "boolean" ? x : d);

// Eksik/bozuk kayıtlar için çakışmasız kimlik üretimi (nadir; genelde kimlik vardır).
let _sayac = 0;
const yeniKimlik = (pre: string): string => `${pre}_m${Date.now().toString(36)}${(_sayac++).toString(36)}`;

const MAKAS_TIPLERI: ReadonlySet<string> = new Set<MakasTip>(["karsilasmali", "headway", "barinma", "depo", "udonus"]);
const makasTipZorla = (x: unknown): MakasTip => (MAKAS_TIPLERI.has(x as string) ? (x as MakasTip) : "headway");
const hemzeminTipZorla = (x: unknown): HemzeminTip => (x === "karayolu" ? "karayolu" : "yaya");
const DONUS_TIPLERI: ReadonlySet<string> = new Set<DonusTip>(["korTerminal", "ciftPeron", "dongu", "makasliGecis"]);

// ————————————————————————————————————————————————
// Eleman normalleştiriciler (temiz nesne kurar → eski alanları düşürür)
// ————————————————————————————————————————————————
function normMakas(raw: unknown): MakasBolgesi {
  const r = obj(raw);
  const tip = makasTipZorla(r.tip);
  const out: MakasBolgesi = {
    id: str(r.id) || yeniKimlik("MAKAS"),
    ad: str(r.ad),
    tip,
    konum: num(r.konum, 0),
    gecisHizi: num(r.gecisHizi, varsayilanConfig.vMakas),
    tccZorunlu: typeof r.tccZorunlu === "boolean" ? r.tccZorunlu : tccGerekli(tip),
    makasAdimSuresi: num(r.makasAdimSuresi, 4),
    makasSayisi: Math.max(1, Math.round(num(r.makasSayisi, 1))),
    routeRelease: num(r.routeRelease, 5),
  };
  if (r.crossover === "s" || r.crossover === "x") out.crossover = r.crossover;
  return out;
}

function normHemzemin(raw: unknown): Hemzemin {
  const r = obj(raw);
  const out: Hemzemin = {
    id: str(r.id) || yeniKimlik("HZ"),
    ad: str(r.ad),
    tip: hemzeminTipZorla(r.tip),
    konum: num(r.konum, 0),
    hiz: num(r.hiz, varsayilanConfig.vHemzemin),
  };
  if (typeof r.bekleme === "number") out.bekleme = r.bekleme;
  return out;
}

function normTehlike(raw: unknown): TehlikeNoktasi {
  const r = obj(raw);
  return {
    id: str(r.id) || yeniKimlik("TN"),
    ad: str(r.ad),
    konum: num(r.konum, 0),
    hiz: num(r.hiz, varsayilanConfig.vAcil),
    aciklama: str(r.aciklama),
  };
}

function normKurp(raw: unknown): Kurp {
  const r = obj(raw);
  const out: Kurp = {
    id: str(r.id) || yeniKimlik("KRP"),
    ad: str(r.ad),
    konum: num(r.konum, 0),
    uzunluk: num(r.uzunluk, 50),
    yaricap: num(r.yaricap, 100),
    dever: num(r.dever, 0),
  };
  if (typeof r.hizManuel === "number" && Number.isFinite(r.hizManuel)) out.hizManuel = r.hizManuel;
  return out;
}

function normSinyal(raw: unknown): SinyalLambasi {
  const r = obj(raw);
  return {
    id: str(r.id) || yeniKimlik("SIG"),
    ad: str(r.ad),
    konum: num(r.konum, 0),
    yon: r.yon === "gelen" ? "gelen" : "giden",
    tersIsletme: bool(r.tersIsletme),
    yesilSari: num(r.yesilSari, 3),
    sariKirmizi: num(r.sariKirmizi, 2),
    kirmiziYesil: num(r.kirmiziYesil, 8),
  };
}

function normRing(raw: unknown): DurakArasiRing {
  const r = obj(raw);
  const out: DurakArasiRing = {
    id: str(r.id) || yeniKimlik("RING"),
    ad: str(r.ad),
    fromStationId: str(r.fromStationId) || yeniKimlik("st"),
    toStationId: str(r.toStationId) || yeniKimlik("st"),
    fromAd: str(r.fromAd),
    toAd: str(r.toAd),
    uzunluk: num(r.uzunluk, varsayilanConfig.ortalamaDurakArasi),
    worstUzunluk: num(r.worstUzunluk, varsayilanConfig.enUzunHeadwayMesafesi),
    bestUzunluk: num(r.bestUzunluk, 300),
    vmax: num(r.vmax, varsayilanConfig.vSahasal),
    egim: num(r.egim, 0),
    dwell: num(r.dwell, 20),
    makaslar: arr(r.makaslar).map(normMakas),
    hemzeminler: arr(r.hemzeminler).map(normHemzemin),
    tehlikeNoktalari: arr(r.tehlikeNoktalari).map(normTehlike),
    kurplar: arr(r.kurplar).map(normKurp),
  };
  // Opsiyonel sayısal alanlar — yalnız varsa taşınır (yoksa tüketici varsayılanı kullanır).
  const sayiOpt: (keyof DurakArasiRing)[] = ["kapiAcma", "yolcuDegisimi", "kapiKapama", "kalkisOlu", "inenYolcu", "binenYolcu", "queued", "fromQueued"];
  for (const k of sayiOpt) if (typeof r[k] === "number") (out[k] as number) = r[k] as number;
  const boolOpt: (keyof DurakArasiRing)[] = ["dwellOto", "tekHat", "depot", "fromDepot"];
  for (const k of boolOpt) if (typeof r[k] === "boolean") (out[k] as boolean) = r[k] as boolean;
  if (Array.isArray(r.sinyaller)) out.sinyaller = r.sinyaller.map(normSinyal);
  return out;
}

function normTerminal(raw: unknown): TerminalConfig {
  const t = obj(raw);
  // peronIsgali göçü: eski (terminalDwell + donusSuresi) → tek peronIsgali.
  let peronIsgali: number;
  if (t.peronIsgali != null) peronIsgali = num(t.peronIsgali, VARSAYILAN_TERMINAL.peronIsgali);
  else if (t.terminalDwell != null || t.donusSuresi != null) peronIsgali = num(t.terminalDwell, 30) + num(t.donusSuresi, 180);
  else peronIsgali = VARSAYILAN_TERMINAL.peronIsgali;

  // makas göçü: eski makasTipi ("s"/"x"/"sx") → sMakas/xMakas.
  let sMakas: number, xMakas: number;
  if (t.sMakas == null && t.xMakas == null && t.makasTipi != null) {
    sMakas = t.makasTipi === "x" ? 0 : 1;
    xMakas = t.makasTipi === "x" || t.makasTipi === "sx" ? 1 : 0;
  } else {
    sMakas = Math.max(0, Math.round(num(t.sMakas, VARSAYILAN_TERMINAL.sMakas ?? 1)));
    xMakas = Math.max(0, Math.round(num(t.xMakas, VARSAYILAN_TERMINAL.xMakas ?? 0)));
  }

  const out: TerminalConfig = {
    tip: DONUS_TIPLERI.has(t.tip as string) ? (t.tip as DonusTip) : VARSAYILAN_TERMINAL.tip,
    peronSayisi: Math.max(1, Math.round(num(t.peronSayisi, VARSAYILAN_TERMINAL.peronSayisi))),
    peronIsgali,
    sMakas,
    xMakas,
    bogazIsgali: num(t.bogazIsgali, VARSAYILAN_TERMINAL.bogazIsgali),
    bogazOto: bool(t.bogazOto, VARSAYILAN_TERMINAL.bogazOto),
    bogazMakasSayisi: Math.max(1, Math.round(num(t.bogazMakasSayisi, VARSAYILAN_TERMINAL.bogazMakasSayisi))),
  };
  if (typeof t.peronTekYon === "boolean") out.peronTekYon = t.peronTekYon;
  const inceOpt: (keyof TerminalConfig)[] = ["varisTampon", "inisBinis", "tersDonus", "kalkisTemizleme", "toparlanma"];
  for (const k of inceOpt) if (typeof t[k] === "number") (out[k] as number) = t[k] as number;
  return out;
}

function normSube(raw: unknown): Sube {
  const s = obj(raw);
  const out: Sube = {
    id: str(s.id) || yeniKimlik("SUBE"),
    ad: str(s.ad, "Şube"),
    atIndex: Math.max(0, Math.round(num(s.atIndex, 0))),
    rings: arr(s.rings).map(normRing),
  };
  if (typeof s.servisTren === "number") out.servisTren = s.servisTren;
  return out;
}

// ————————————————————————————————————————————————
// Üst düzey normalleştiriciler
// ————————————————————————————————————————————————
// cfg/meta/isletme app tarafından üretilir (düşük "junk" riski) → sığ birleştirme
// yeterli; yalnız iç içe terminaller derin normalleştirilir.
function normConfig(raw: unknown): SimConfig {
  return { ...varsayilanConfig, ...(isObj(raw) ? raw : {}) } as SimConfig;
}
function normMeta(raw: unknown): ProjeMeta {
  return { ...varsayilanMeta, ...(isObj(raw) ? raw : {}) } as ProjeMeta;
}
function normArac(raw: unknown): RollingStock {
  return isObj(raw) ? ({ ...varsayilanArac, ...raw } as RollingStock) : { ...varsayilanArac };
}
function normIsletme(raw: unknown): Isletme {
  const merged = { ...varsayilanIsletme, ...(isObj(raw) ? raw : {}) } as Isletme;
  merged.terminalBas = normTerminal(merged.terminalBas);
  merged.terminalSon = normTerminal(merged.terminalSon);
  return merged;
}

// Gelecekteki YIKICI sürüm adımları buraya (fromSurum → veri dönüşümü). Şu an boş:
// tüm göçler şekil-tabanlı ve `normalize` içinde koşar.
const SURUM_ADIMLARI: ((v: Record<string, unknown>) => Record<string, unknown>)[] = [];

/**
 * Ham (parse edilmiş) proje JSON'unu GÜNCEL şemaya normalleştirir. Total ve
 * idempotenttir; her okumada güvenle çağrılır. `arac` ve `isletme` DAİMA tanımlı,
 * `subeler` daima dizi (şubesiz projede []) döner.
 */
export function migrate(raw: unknown): ProjeVerisi {
  let r = obj(raw);
  for (const adim of SURUM_ADIMLARI) r = adim(r); // ileride yıkıcı adımlar
  // v2 göçü (anlam değişimi): eskiden EYLEMSİZ olan cfg.ivme/yavaslama artık sim'e bağlı.
  // Sürüm 2 altındaki (veya sürümsüz) kayıtlarda bu iki alanı yeni varsayılana çek →
  // kaydedilmiş eski değerler (ör. 1,0) yeni anlamda saatleri bozmaz. İdempotent:
  // yeniden kayıtta veriSurum=2 olur ve adım atlanır. Kullanıcının v2 sonrası bilerek
  // girdiği değerler korunur (doküman veriSurum=2 taşır).
  if (veriSurumu(r.veriSurum) < 2 && isObj(r.cfg)) {
    (r.cfg as Record<string, unknown>).ivme = varsayilanConfig.ivme;
    (r.cfg as Record<string, unknown>).yavaslama = varsayilanConfig.yavaslama;
  }
  return {
    rings: arr(r.rings).map(normRing),
    cfg: normConfig(r.cfg),
    meta: normMeta(r.meta),
    arac: normArac(r.arac),
    isletme: normIsletme(r.isletme),
    subeler: arr(r.subeler).map(normSube),
  };
}

/** Ham kaydın taşıdığı şema sürümü (yoksa 0 = eski/sürümsüz). Bilgi amaçlı. */
export function veriSurumu(docVeriSurum: unknown): number {
  return typeof docVeriSurum === "number" && Number.isFinite(docVeriSurum) ? docVeriSurum : 0;
}
