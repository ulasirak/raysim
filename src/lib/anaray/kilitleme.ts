// raysim — KİLİTLEME (INTERLOCKING) KONTROL TABLOSU (Büyük sıçrama G — sinyalizasyon derinliği).
// SAF (yan-etkisiz). Hattın makas bölgelerinden + sinyallerinden sinyalizasyon
// mühendisliğinin klasik "kontrol tablosunu" (control table / güzergâh-kilit tablosu)
// türetir: her rota için gereken MAKAS KONUMU (Normal/Ters), kilitlenen çakışan
// hareketler, yan koruma / emniyet payı ve tanzim/serbest-bırakma süreleri. Veriler ring
// modelinden gelir (genel + her simülasyon için) — uydurma yok.
//
// ÇIKTI DİLDEN BAĞIMSIZDIR: satırlar kod (RotaKod/MakasTip) + sayı taşır; insan-okur
// TR/EN/DE metin `kilitlemeMetin(rota, t)` ile çağrı yerinde üretilir (panel: useDil().t,
// rapor: en-bayrağından türetilen t). Böylece tablo her dilde tutarlıdır.

import type { DurakArasiRing, MakasBolgesi, MakasTip } from "@/lib/anaray/ring";
import { tccGerekli, BELGE } from "@/lib/anaray/ring";
import type { SimConfig } from "@/lib/anaray/config";

/** Bir makas bölgesinin ürettiği rota türü. */
export type RotaKod = "duz" | "udonus" | "karsilasmali" | "barinma" | "depo" | "headway-serit";

export interface KilitlemeRota {
  makasAd: string;
  km: number;                       // hat başından mutlak kilometraj (m)
  tip: MakasTip;
  rotaKod: RotaKod;                 // hareket türü (dil-bağımsız kod)
  cift: boolean;                    // scissors / ×2 (çift crossover) mı
  makasKonum: "Normal" | "Ters";    // gerekli makas konumu (düz / crossover)
  tcc: boolean;                     // her geçişte TCC (trafik kontrol) onayı şart mı
  emniyetPayiM: number;             // m — makastan sonraki koruma (emniyet) mesafesi
  tanzimSn: number;                 // rota tanzimi (makas hareketi × adet)
  serbestSn: number;                // rota serbest bırakma (kilit açılışı)
  kilitSn: number;                  // toplam kilit süresi (tanzim + serbest)
}

/** Bir makas bölgesinin ürettiği rota(lar) — ana hat düz geçiş + tipe özgü manevra.
 *  `emniyetM` = makastan sonraki koruma mesafesi (fren mesafesi, blok sınırıyla sınırlı). */
function makasRotalari(m: MakasBolgesi, km: number, emniyetM: number): KilitlemeRota[] {
  const tanzim = Math.max(1, m.makasSayisi) * Math.max(0, m.makasAdimSuresi);
  const serbest = m.routeRelease;
  const tcc = tccGerekli(m.tip) || m.tccZorunlu;
  const cift = m.crossover === "x"; // scissors (çift) — ardışık iki yol

  const taban = { makasAd: m.ad, km: Math.round(km), tip: m.tip, cift, emniyetPayiM: emniyetM };

  // Her makas bölgesi ANA HAT DÜZ geçişe izin verir (makas Normal, çakışma yok).
  const duz: KilitlemeRota = {
    ...taban, rotaKod: "duz", makasKonum: "Normal", tcc: false,
    tanzimSn: 0, serbestSn: serbest, kilitSn: serbest, // düz konumda ek makas hareketi gerekmez
  };

  // Tipe özgü MANEVRA rotası (makas Ters/crossover) — çakışan hareketleri kilitler.
  let manevraKod: RotaKod | null = null;
  switch (m.tip) {
    case "udonus": manevraKod = "udonus"; break;
    case "karsilasmali": manevraKod = "karsilasmali"; break;
    case "barinma": manevraKod = "barinma"; break;
    case "depo": manevraKod = "depo"; break;
    // Headway/blok makası: crossover varsa şerit değişimi rotası, yoksa yalnız düz.
    case "headway": if (m.crossover) manevraKod = "headway-serit"; break;
  }
  if (!manevraKod) return [duz];

  const manevra: KilitlemeRota = {
    ...taban, rotaKod: manevraKod, makasKonum: "Ters", tcc,
    tanzimSn: tanzim, serbestSn: serbest, kilitSn: tanzim + serbest,
  };
  return [duz, manevra];
}

/**
 * Hattın tam kilitleme kontrol tablosu — tüm ringlerin makasları, hat başından
 * mutlak kilometraja göre sıralı. Her satır bir rotayı (makas konumu + kilit +
 * emniyet payı + süreler) betimler. `cfg` fren/hız temelini verir (emniyet payı için).
 */
export function kilitlemeTablosu(rings: DurakArasiRing[], cfg: SimConfig = BELGE): KilitlemeRota[] {
  // Blok SINIRLARI = istasyonlar (ring başları/sonu) + sinyal lambaları — emniyet payı
  // bir makastan bir SONRAKİ blok sınırına kadar UZATILAMAZ (çıkış sinyali ötesi güvenlik payı).
  const sinirlar: number[] = [];
  let off0 = 0;
  for (const r of rings) {
    sinirlar.push(off0);
    for (const s of r.sinyaller ?? []) sinirlar.push(off0 + s.konum);
    off0 += r.uzunluk;
  }
  sinirlar.push(off0);
  const hatSonu = off0;
  sinirlar.sort((a, b) => a - b);
  const sinirMesafe = (km: number) => {
    const nx = sinirlar.find((s) => s > km + 1e-6);
    return Math.max(0, Math.round((nx ?? hatSonu) - km));
  };

  // EMNİYET PAYI (overlap / Durchrutschweg): kırmızıyı bu hatta izin verilen hızla AŞAN
  // trenin servis freniyle duracağı mesafe — fiziksel, uydurma değil. Fren temeli
  // blocking-time (Sperrzeit) ile aynı (cfg.yavaslama = servis fren oranı). Sonraki blok
  // sınırıyla (sinyal/durak) SINIRLIDIR: makastan öteye taşamaz.
  const b = cfg.yavaslama > 0 ? cfg.yavaslama : 1.2;             // m/s² — servis freni
  const vFallback = cfg.vSahasal > 0 ? cfg.vSahasal : 40 / 3.6;  // m/s — ring hızı yoksa
  const emniyetPayi = (ringVmax: number, km: number) => {
    const v = ringVmax > 0 ? ringVmax : vFallback;
    const frenMes = Math.round((v * v) / (2 * b));
    return Math.min(frenMes, sinirMesafe(km));
  };

  const out: KilitlemeRota[] = [];
  let offset = 0;
  for (const r of rings) {
    for (const m of r.makaslar) {
      const gkm = offset + m.konum;
      out.push(...makasRotalari(m, gkm, emniyetPayi(r.vmax, gkm)));
    }
    offset += r.uzunluk;
  }
  out.sort((a, b) => a.km - b.km);
  return out;
}

/** Özet sayaçlar (panel/rapor başlığı için). */
export function kilitlemeOzet(tablo: KilitlemeRota[]) {
  const makasSet = new Set(tablo.map((t) => `${t.makasAd}@${t.km}`));
  const manevra = tablo.filter((t) => t.makasKonum === "Ters").length;
  const tccli = tablo.filter((t) => t.tcc).length;
  const maxKilit = tablo.reduce((a, t) => Math.max(a, t.kilitSn), 0);
  return { makas: makasSet.size, rota: tablo.length, manevra, tccli, maxKilit };
}

// ————————————————————————————————————————————————
// DİL: yapısal veri → TR/EN/DE metin (çağrı yerinde)
// ————————————————————————————————————————————————

export type Ceviri = { tr: string; en: string; de: string };
export type CeviriFn = (m: Ceviri) => string;

/** Makas tipinin görünen adı (kısa). */
const TIP_AD: Record<MakasTip, Ceviri> = {
  udonus: { tr: "U-dönüş", en: "Turnback", de: "Kehre" },
  karsilasmali: { tr: "Karşılaşmalı", en: "Crossover", de: "Gleiswechsel" },
  barinma: { tr: "Barınma yolu", en: "Siding", de: "Abstellgleis" },
  depo: { tr: "Depo", en: "Depot", de: "Depot" },
  headway: { tr: "Blok makası", en: "Block turnout", de: "Blockweiche" },
};

/**
 * Bir kilitleme satırının insan-okur metinlerini seçili dilde üretir.
 * `t` = çeviri fonksiyonu (panel: useDil().t · rapor: (m)=>en?m.en:m.tr).
 */
export function kilitlemeMetin(r: KilitlemeRota, t: CeviriFn) {
  const x2 = r.cift ? " ×2" : "";
  const sc = r.cift ? t({ tr: " · scissors", en: " · scissors", de: " · Kreuzung" }) : "";

  const ROTA: Record<RotaKod, Ceviri> = {
    duz: { tr: "Ana hat düz geçiş", en: "Main-line straight move", de: "Hauptgleis-Durchfahrt" },
    udonus: { tr: `U-dönüş (şerit değişimi${sc})`, en: `Turnback (track change${sc})`, de: `Kehre (Gleiswechsel${sc})` },
    karsilasmali: { tr: `Karşılaşmalı geçiş (crossover${x2})`, en: `Crossover move${x2}`, de: `Gleiswechsel${x2}` },
    barinma: { tr: "Barınma yoluna giriş (3. yön)", en: "Entry to siding (3rd direction)", de: "Einfahrt Abstellgleis (3. Richtung)" },
    depo: { tr: "Depo giriş/çıkış", en: "Depot entry/exit", de: "Depot-Ein-/Ausfahrt" },
    "headway-serit": { tr: `Şerit değişimi (headway makası${x2})`, en: `Track change (headway turnout${x2})`, de: `Gleiswechsel (Zugfolgeweiche${x2})` },
  };

  const CAKISAN: Record<RotaKod, Ceviri> = {
    duz: { tr: "—", en: "—", de: "—" },
    udonus: { tr: "Karşı yön ana hat geçişi kilitli", en: "Opposing main-line move locked", de: "Gegenrichtung Hauptgleis verschlossen" },
    karsilasmali: { tr: "Karşı yön ana hat + eşzamanlı karşılaşma kilitli", en: "Opposing main line + simultaneous crossover locked", de: "Gegengleis + gleichzeitiger Gleiswechsel verschlossen" },
    barinma: { tr: "Her iki ana hat geçişi kilitli", en: "Both main-line moves locked", de: "Beide Hauptgleisfahrten verschlossen" },
    depo: { tr: "Ana hat kilitli — tek tren", en: "Main line locked — single train", de: "Hauptgleis verschlossen — ein Zug" },
    "headway-serit": { tr: "Karşı yön ana hat geçişi kilitli", en: "Opposing main-line move locked", de: "Gegenrichtung Hauptgleis verschlossen" },
  };

  const KORUMA: Record<RotaKod, Ceviri> = {
    duz: { tr: "Çıkış sinyali + emniyet bloğu serbest", en: "Exit signal + safety block clear", de: "Ausfahrsignal + Schutzblock frei" },
    udonus: { tr: "Karşı hat yandan korumalı + dönüş", en: "Opposite track flank-protected + turnback", de: "Gegengleis flankengeschützt + Kehre" },
    karsilasmali: { tr: "Her iki hat yandan korumalı", en: "Both tracks flank-protected", de: "Beide Gleise flankengeschützt" },
    barinma: { tr: "Ana hat yan koruma + barınma", en: "Main-line flank + siding", de: "Hauptgleis-Flankenschutz + Abstellgleis" },
    depo: { tr: "Ana hat yan koruma + depo boğazı", en: "Main-line flank + depot throat", de: "Hauptgleis-Flankenschutz + Depothals" },
    "headway-serit": { tr: "Karşı hat yan koruma", en: "Opposite track flank", de: "Gegengleis-Flankenschutz" },
  };

  const pay = t({
    tr: `emniyet payı ~${r.emniyetPayiM} m`,
    en: `overlap ~${r.emniyetPayiM} m`,
    de: `Durchrutschweg ~${r.emniyetPayiM} m`,
  });

  return {
    tipAd: t(TIP_AD[r.tip]),
    rota: t(ROTA[r.rotaKod]),
    konum: r.makasKonum === "Ters"
      ? t({ tr: "Ters", en: "Reverse", de: "Umgestellt" })
      : t({ tr: "Normal", en: "Normal", de: "Normal" }),
    cakisan: t(CAKISAN[r.rotaKod]),
    koruma: `${t(KORUMA[r.rotaKod])} · ${pay}`,
  };
}
