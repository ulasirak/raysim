// raysim — ÇAKIŞMA ÇÖZÜCÜSÜ (advisory) — tek-hat kalkış-offset optimizasyonu (#2 devamı).
// SAF (yan-etkisiz). cakisma.ts tek-hat çakışmasını TESPİT eder + metinsel öneri verir;
// bu modül onu HESAPLANMIŞ bir çizelgeye çevirir: trenlerin kalkış offset'lerini (faz)
// even-spacing'den küçük sapmalarla arayıp tek-hat kesimlerdeki örtüşmeyi en aza indirir
// (klasik meet/pass zamanlaması). Amaç fonksiyonu = cakisma ile AYNI örnekleme modeli
// (loopY faz-ötelemesi). Salt analiz: çekirdek sim'e dokunmaz, öneri üretir.

import { ornekS } from "./grafikNoktalar";
import type { LoopYorunge } from "./signalling";
import type { TekHatSpan } from "./cakisma";

export interface CozumSonuc {
  filo: number;
  bazOrtusme: number;      // even-spacing'de toplam çakışma (tren·s)
  cozumOrtusme: number;    // optimize edilmiş offset'te toplam çakışma (tren·s)
  iyilesme: number;        // baz − çözüm (giderilen çakışma, s)
  offsetler: number[];     // önerilen kalkış offset'leri (s); [0] = 0 (referans)
  kaydirmalar: number[];   // her tren için even-spacing'e göre Δ (s, işaretli) — RETİMİNG
  cozuldu: boolean;        // çözümde örtüşme ≈ 0
  periyot: number;
}

/** Toplam örtüşme (tren·s): her örnek adımında tek-hat span'ında ≥2 tren varsa fazlalık × dt. */
function toplamOrtusme(spanlar: TekHatSpan[], loopY: LoopYorunge, offsetler: number[], dt: number): number {
  const { ornekler, L, loopLen, periyot: P } = loopY;
  const realKm = (s: number) => (s <= L ? s : loopLen - s);
  let toplam = 0;
  for (let t = 0; t < P - 1e-9; t += dt) {
    for (const sp of spanlar) {
      let icinde = 0;
      for (const o of offsetler) {
        const faz = (((t - o) % P) + P) % P;
        const km = realKm(ornekS(ornekler, faz));
        if (km >= sp.kmBas - 1e-6 && km <= sp.kmSon + 1e-6) icinde++;
      }
      if (icinde >= 2) toplam += (icinde - 1) * dt;
    }
  }
  return toplam;
}

/**
 * Kalkış offset'lerini even-spacing'den arayıp tek-hat çakışmasını en aza indirir
 * (koordinat inişi; tren 0 referans sabit, diğerleri perturbe edilir). Deterministik.
 */
export function cakismaCoz(spanlar: TekHatSpan[], loopY: LoopYorunge, filo: number): CozumSonuc {
  const P = loopY.periyot;
  const n = Math.max(1, Math.round(filo));
  const even = Array.from({ length: n }, (_, k) => (k * P) / n);
  const dt = Math.max(0.5, Math.min(5, P / 300));
  const bos = (o: number[], skor: number): CozumSonuc => ({
    filo: n, bazOrtusme: Math.round(bazOrtusme), cozumOrtusme: Math.round(skor),
    iyilesme: Math.round(bazOrtusme - skor), offsetler: o.map((x) => Math.round(x)),
    kaydirmalar: o.map((x, k) => imzaliDelta(x - even[k], P)), cozuldu: skor < dt * 0.5, periyot: Math.round(P),
  });

  const bazOrtusme = spanlar.length && n >= 2 ? toplamOrtusme(spanlar, loopY, even, dt) : 0;
  if (!spanlar.length || n < 2 || bazOrtusme < dt * 0.5) return bos(even, bazOrtusme);

  // Koordinat inişi: her tren için offset ızgarası (±bir slot), en iyi seçilir; birkaç geçiş.
  const slot = P / n;
  const cur = even.slice();
  let curSkor = bazOrtusme;
  for (let pass = 0; pass < 8; pass++) {
    let iyilesti = false;
    for (let k = 1; k < n; k++) {
      let bestOff = cur[k], bestSkor = curSkor;
      for (let d = -slot; d <= slot + 1e-9; d += slot / 6) {
        const cand = cur.slice();
        cand[k] = (((cur[k] + d) % P) + P) % P;
        const sk = toplamOrtusme(spanlar, loopY, cand, dt);
        if (sk < bestSkor - 1e-9) { bestSkor = sk; bestOff = cand[k]; }
      }
      if (bestOff !== cur[k]) { cur[k] = bestOff; curSkor = bestSkor; iyilesti = true; }
    }
    if (!iyilesti || curSkor < dt * 0.5) break;
  }
  return bos(cur, curSkor);
}

/** İşaretli faz farkı [-P/2, P/2) — kaydırmanın yönünü/büyüklüğünü verir. */
function imzaliDelta(d: number, P: number): number {
  let x = ((d % P) + P) % P;
  if (x >= P / 2) x -= P;
  return Math.round(x);
}

/** Çakışmasız işletilebilecek EN FAZLA filo (tek-hat kısıtı altında; block'tan ayrı). */
export function cakismasizMaxFilo(spanlar: TekHatSpan[], loopY: LoopYorunge, nMax: number): number {
  if (!spanlar.length) return Math.max(1, Math.round(nMax));
  const ust = Math.max(1, Math.min(30, Math.round(nMax)));
  let enFazla = 1;
  for (let f = 2; f <= ust; f++) {
    if (cakismaCoz(spanlar, loopY, f).cozuldu) enFazla = f;
    else break; // çözülemeyen ilk filodan sonrası da (genelde) çözülemez → dur
  }
  return enFazla;
}
