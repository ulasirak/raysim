// raysim — GECİKME YAYILIMI / KNOCK-ON (deterministik zincir) (#3)
//
// Monte-Carlo (signalling.monteCarlo) TOPLAM dağılımı verir ("robustluk"). Bu modül
// TEK bir birincil gecikmenin ARDIŞIK trenlere DETERMİNİSTİK zincir etkisini gösterir:
// "hedef tren X s geç kalırsa, arkadaki her tren kaç saniye etkilenir ve gecikme
// hangi trende sönümlenir (recovery)?".
//
// Yöntem: aynı sinyalli çok-tren sim (simulateSignalled) iki kez koşulur — temel
// (gecikmesiz) ve hedef trene birincil giriş gecikmesi enjekte edilmiş. Her trenin
// ikincil (knock-on) gecikmesi = perturbe gecikme − temel gecikme. Blok işgali/red
// sinyal ardışık treni yavaşlattığında zincir oluşur; headway toparlama payı yeterse
// gecikme birkaç tren sonra ~0'a iner (sönümleme).

import { simulateSignalled } from "./signalling";
import type { Line } from "./types";
import type { RollingStock } from "./types";

export interface KnockOnTren {
  tren: number;      // filo indeksi (0-tabanlı)
  birincil: number;  // bu trene enjekte edilen birincil gecikme (yalnız hedef trende > 0)
  ikincil: number;   // knock-on (yansıyan) gecikme (s) — temel duruma göre artış
  toplam: number;    // birincil + ikincil (bu trenin toplam ek gecikmesi)
}

export interface KnockOnSonuc {
  hedefTren: number;
  birincilSn: number;
  zincir: KnockOnTren[];        // hedefTren .. count-1
  etkilenen: number;            // ikincil > eşik olan SONRAKİ tren sayısı
  sonumleme: number | null;     // ikincil'in ~0'a döndüğü ilk SONRAKİ tren (recovery); null = pencere içinde sönmedi
  toplamIkincil: number;        // Σ ikincil (hedef hariç)
  maxIkincil: number;           // en yüksek tekil knock-on (s)
  ozet: string;
}

const ESIK = 3; // s — gürültü eşiği (bunun altı "etkilenmedi")

/**
 * Hedef trene `birincilSn` giriş gecikmesi vererek knock-on zincirini hesaplar.
 * `opts` simulateSignalled ile aynı (headway, count, sinyaller, origins, blocked).
 */
export function gecikmeYayilim(
  line: Line,
  stock: RollingStock,
  opts: { headway: number; count: number; sinyaller?: number[]; origins?: number[]; blocked?: number[]; dt?: number },
  hedefTren: number,
  birincilSn: number,
): KnockOnSonuc {
  const count = Math.min(200, Math.max(1, opts.count));
  const hedef = Math.max(0, Math.min(count - 1, Math.round(hedefTren)));
  const bos: KnockOnSonuc = {
    hedefTren: hedef, birincilSn, zincir: [], etkilenen: 0, sonumleme: null,
    toplamIkincil: 0, maxIkincil: 0, ozet: "Yayılım yok.",
  };
  if (birincilSn <= 0 || count < 1) return bos;

  const base = simulateSignalled(line, stock, opts);
  const entry = Array.from({ length: count }, (_, k) => (k === hedef ? birincilSn : 0));
  const pert = simulateSignalled(line, stock, { ...opts, entry });

  const baseDelay = (k: number) => base.trains.find((t) => t.index === k)?.delay ?? 0;
  const pertDelay = (k: number) => pert.trains.find((t) => t.index === k)?.delay ?? 0;

  const zincir: KnockOnTren[] = [];
  let toplamIkincil = 0, maxIkincil = 0, etkilenen = 0, sonumleme: number | null = null;
  for (let k = hedef; k < count; k++) {
    const artis = Math.max(0, pertDelay(k) - baseDelay(k)); // knock-on (temel farkı)
    const birincil = k === hedef ? birincilSn : 0;
    const ikincil = k === hedef ? Math.max(0, artis - birincilSn) : artis; // hedefte primary'yi ayıkla
    zincir.push({ tren: k, birincil, ikincil: Math.round(ikincil), toplam: Math.round(birincil + ikincil) });
    if (k > hedef) {
      toplamIkincil += ikincil;
      maxIkincil = Math.max(maxIkincil, ikincil);
      if (ikincil > ESIK) { etkilenen++; sonumleme = null; }
      else if (sonumleme === null && etkilenen > 0) sonumleme = k; // ilk sönme
    }
  }

  let ozet: string;
  if (etkilenen === 0) {
    ozet = `${hedef + 1}. tren ${Math.round(birincilSn)} s geç kalsa da arkadaki trenlere yansımaz — headway toparlama payı yeterli.`;
  } else {
    const recov = sonumleme !== null ? `gecikme ${sonumleme - hedef}. ardışık trende (~${sonumleme + 1}. tren) sönümlenir` : `gecikme pencere sonuna dek sönümlenmez (yetersiz toparlama payı)`;
    ozet = `${hedef + 1}. tren ${Math.round(birincilSn)} s geç kaldığında ${etkilenen} ardışık tren etkilenir (en yüksek knock-on ${Math.round(maxIkincil)} s, toplam yansıyan ${Math.round(toplamIkincil)} s); ${recov}.`;
  }

  return { hedefTren: hedef, birincilSn, zincir, etkilenen, sonumleme, toplamIkincil: Math.round(toplamIkincil), maxIkincil: Math.round(maxIkincil), ozet };
}
