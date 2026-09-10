// raysim — ÇİZELGE ÇAKIŞMA TESPİTİ + ÇÖZÜM ÖNERİSİ (#2)
//
// RaySim hattı DAİMA çift hattır → aynı yön trenler paralel şeritte, karşı yön ayrı
// şeritte ilerler; bunlar fizikî çakışmaz. GERÇEK çakışma iki yerde doğar:
//   1) TEK HAT (ring.tekHat) kesimler: çift yön aynı tek hattı paylaşır → o kesimde
//      AYNI ANDA birden çok tren = fizikî imkânsız (karşılaşma/kuyruk). Bu, tek-hat
//      "meet/pass" çakışmasıdır (klasik geçiş cebi problemi).
//   2) BLOK/HEADWAY: ulaşılan aralık, belirleyici kısıtın minimum headway'inden (hMin,
//      maksimumTren) küçükse ardışık trenler blok temizlenmeden bloğa girer → sistemik.
//
// Yöntem: LoopYorunge tek trenin s(t) yörüngesidir; filo faz-ötelenmiş kopyalardır
// (offset = periyot/filo). Bir periyot boyunca örnekleyip her trenin gerçek-km'sini
// (s≤L → gidiş; s>L → dönüş, km = loopLen−s) hesaplar; tek-hat span'ında aynı anda
// ≥2 tren varsa çakışma açılır, ayrıldıklarında kapanır. Salt-fonksiyon, test edilebilir.

import { ringToLine, type DurakArasiRing } from "./ring";
import type { RollingStock } from "./types";
import type { SimConfig, Isletme } from "./config";
import type { LoopYorunge } from "./signalling";
import { ornekS } from "./grafikNoktalar";
import { maksimumTren } from "./kapasite";

export interface TekHatSpan { kmBas: number; kmSon: number; ad: string; }

/** Tek bir çakışma olayı (bir periyot penceresi içinde). */
export interface Cakisma {
  tip: "tekhat";
  ad: string;              // kesim adı
  kmBas: number; kmSon: number; // gerçek-km span (m)
  t: number;               // çakışma başlangıç zamanı (s, pencere içi 0..periyot)
  sure: number;            // örtüşme süresi (s)
  trenA: number; trenB: number; // filo indeksleri (0-tabanlı)
  yonA: "g" | "d"; yonB: "g" | "d"; // g=gidiş, d=dönüş
  karsi: boolean;          // karşı yön çakışması mı (g vs d)
}

/** Bir tek-hat kesiminin çakışma özeti (rapor/karar için). */
export interface SpanOzet {
  ad: string; kmBas: number; kmSon: number;
  cakismaSayisi: number;   // periyottaki ayrık çakışma sayısı
  maxOrtusme: number;      // en uzun örtüşme (s)
  karsiYon: boolean;       // karşı yön karşılaşması var mı
  oneri: string;
}

export interface CakismaSonuc {
  cakismalar: Cakisma[];   // ham olaylar (grafik işareti için; üst sınırlı)
  spanlar: TekHatSpan[];   // hattaki tüm tek-hat kesimleri
  spanOzet: SpanOzet[];    // kesim başına özet (yalnız çakışmalı olanlar)
  sistemik: { hMin: number; ulasilan: number; ad: string; oneri: string } | null;
  cakismaVar: boolean;
  ozet: string;
}

const HAM_UST = 300; // grafik işareti için ham olay üst sınırı

function oneriMetni(karsi: boolean, ad: string, sure: number): string {
  return karsi
    ? `Tek hatta KARŞILAŞMA (${ad}): iki tren zıt yönden aynı kesime giriyor. Birini geçiş cebinde ~${sure} s beklet (meet/pass) ya da bu kesimi çift hatta çıkar.`
    : `Tek hatta AYNI YÖN kuyruğu (${ad}): iki tren aynı kesimi ~${sure} s paylaşıyor. Headway'i artır ya da kesimi çift hatta çıkar.`;
}

export function cakismaTespit(
  rings: DurakArasiRing[],
  stock: RollingStock,
  cfg: SimConfig,
  loopY: LoopYorunge,
  filo: number,
  isletme: Isletme,
): CakismaSonuc {
  const bos: CakismaSonuc = { cakismalar: [], spanlar: [], spanOzet: [], sistemik: null, cakismaVar: false, ozet: "Çakışma yok." };
  if (!rings.length || filo < 1 || !loopY || loopY.periyot <= 0 || loopY.loopLen <= 0) return bos;

  // 1) Tek-hat span'ları (gerçek-km; ringToLine uzunluklarıyla → loopY ile birebir)
  const spanlar: TekHatSpan[] = [];
  let off = 0;
  rings.forEach((r, i) => {
    const L = ringToLine(r, "nominal", cfg).length;
    if (r.tekHat) {
      const ad = r.fromAd && r.toAd ? `${r.fromAd} – ${r.toAd}` : (r.toAd || `Kesim ${i + 1}`);
      spanlar.push({ kmBas: off, kmSon: off + L, ad });
    }
    off += L;
  });

  // 2) Sistemik blok/headway: ulaşılan aralık < hMin
  const P = loopY.periyot;
  const offset = P / Math.max(1, filo); // ulaşılan gerçek aralık
  const maks = maksimumTren(rings, stock, cfg, isletme);
  const sistemik = (maks.gecerli && maks.hMin > offset + 1e-6)
    ? {
        hMin: Math.round(maks.hMin), ulasilan: Math.round(offset), ad: maks.baglayanAd || "belirleyici blok",
        oneri: `Ulaşılan aralık ${Math.round(offset)} s, belirleyici kısıtın (${maks.baglayanAd || "blok"}) izin verdiği minimum ${Math.round(maks.hMin)} s'nin ALTINDA → ardışık trenler blok temizlenmeden bloğa girer. Headway'i ≥ ${Math.round(maks.hMin)} s yap ya da filoyu azalt.`,
      }
    : null;

  // 3) Tek-hat çakışması — bir periyot boyunca örnekle
  const cakismalar: Cakisma[] = [];
  const ozetMap = new Map<string, SpanOzet>();
  if (spanlar.length) {
    const orn = loopY.ornekler;
    const L0 = loopY.L, loopLen = loopY.loopLen;
    const realKm = (s: number) => (s <= L0 ? s : loopLen - s);
    const yonOf = (s: number): "g" | "d" => (s <= L0 ? "g" : "d");
    const dt = Math.max(0.5, Math.min(5, P / 800)); // ≤ ~800 örnek

    type An = { tren: number; yon: "g" | "d" };
    for (const sp of spanlar) {
      const acik = new Map<string, { t0: number; son: number; a: An; b: An; karsi: boolean }>();
      const ozet: SpanOzet = { ad: sp.ad, kmBas: sp.kmBas, kmSon: sp.kmSon, cakismaSayisi: 0, maxOrtusme: 0, karsiYon: false, oneri: "" };
      const kapat = (c: { t0: number; son: number; a: An; b: An; karsi: boolean }) => {
        const sure = Math.round(c.son - c.t0 + dt);
        ozet.cakismaSayisi++;
        ozet.maxOrtusme = Math.max(ozet.maxOrtusme, sure);
        if (c.karsi) ozet.karsiYon = true;
        if (cakismalar.length < HAM_UST) {
          cakismalar.push({
            tip: "tekhat", ad: sp.ad, kmBas: sp.kmBas, kmSon: sp.kmSon, t: c.t0, sure,
            trenA: c.a.tren, trenB: c.b.tren, yonA: c.a.yon, yonB: c.b.yon, karsi: c.karsi,
          });
        }
      };

      for (let t = 0; t < P - 1e-9; t += dt) {
        const icinde: An[] = [];
        for (let k = 0; k < filo; k++) {
          const faz = (((t - k * offset) % P) + P) % P;
          const s = ornekS(orn, faz);
          const km = realKm(s);
          if (km >= sp.kmBas - 1e-6 && km <= sp.kmSon + 1e-6) icinde.push({ tren: k, yon: yonOf(s) });
        }
        const buAdim = new Set<string>();
        for (let i = 0; i < icinde.length; i++) {
          for (let j = i + 1; j < icinde.length; j++) {
            const a = icinde[i], b = icinde[j];
            const key = `${Math.min(a.tren, b.tren)}|${Math.max(a.tren, b.tren)}`;
            buAdim.add(key);
            const cur = acik.get(key);
            if (cur) cur.son = t;
            else acik.set(key, { t0: t, son: t, a, b, karsi: a.yon !== b.yon });
          }
        }
        for (const key of [...acik.keys()]) if (!buAdim.has(key)) { kapat(acik.get(key)!); acik.delete(key); }
      }
      for (const c of acik.values()) kapat(c);
      if (ozet.cakismaSayisi > 0) {
        ozet.oneri = oneriMetni(ozet.karsiYon, ozet.ad, ozet.maxOrtusme);
        ozetMap.set(sp.ad, ozet);
      }
    }
  }

  const spanOzet = [...ozetMap.values()];
  const cakismaVar = spanOzet.length > 0 || sistemik !== null;
  let ozet: string;
  if (!cakismaVar) {
    ozet = spanlar.length
      ? `${spanlar.length} tek-hat kesimi var; bu filo/headway'de çakışma yok.`
      : "Hat tümüyle çift hat; tek-hat çakışması yok.";
  } else {
    const parcalar: string[] = [];
    if (spanOzet.length) parcalar.push(`${spanOzet.length} tek-hat kesiminde çakışma (${spanOzet.reduce((s, o) => s + o.cakismaSayisi, 0)} karşılaşma/çevrim)`);
    if (sistemik) parcalar.push(`headway ${sistemik.ulasilan} s < min ${sistemik.hMin} s (${sistemik.ad})`);
    ozet = parcalar.join(" · ");
  }

  return { cakismalar, spanlar, spanOzet, sistemik, cakismaVar, ozet };
}
