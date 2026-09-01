// raysim — GRAFİK OLAY/DEĞİŞİM NOKTALARI (Bildfahrplan + Hız profili ortak çekirdeği).
//
// Ekran bileşenleri (JSX) ve rapor (string-SVG) AYNI noktaları kullansın diye hesaplama
// burada toplanır. İki tür "gerekli nokta":
//  • Hız profili → değişimin ZORLANDIĞI mesafeler: durak konumları (yaklaşınca frenleme,
//    kalkışta hızlanma) + hız-limiti değişim sınırları. Her birinin km'si etiketlenir.
//  • Bildfahrplan → referans trenin İSTASYON geçiş zamanları (gidiş+dönüş = iniş/çıkış) +
//    gidiş↔dönüş KESİŞİM (karşılaşma/bağlantı) zamanları. Her birinin saati etiketlenir.
// Etiket çakışmasını `satirYerlesim` çözer (yatay yakınsa alt satıra taşır).

import type { LoopYorunge } from "./signalling";
import type { Line } from "./types";

export interface HizNokta { s: number; v: number; tip: "uc" | "durak" | "limit" }
export interface BildOlay { t: number; fp: number; ad?: string; tip: "durak" | "kesisim"; yon?: "g" | "d" }

/** Faz anındaki kümülatif s (0..loopLen) — doğrusal ara değer (t artan). */
export function ornekS(orn: LoopYorunge["ornekler"], faz: number): number {
  const n = orn.length;
  if (n === 0) return 0;
  if (faz <= orn[0].t) return orn[0].s;
  if (faz >= orn[n - 1].t) return orn[n - 1].s;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (orn[m].t <= faz) lo = m; else hi = m; }
  const a = orn[lo], b = orn[hi], dt = b.t - a.t || 1;
  return a.s + (b.s - a.s) * ((faz - a.t) / dt);
}

/** Kümülatif s HEDEFİNE ulaşılan t (s monoton arttığından tek çözüm). */
function tAtCumS(orn: LoopYorunge["ornekler"], hedef: number): number {
  const n = orn.length;
  if (n === 0) return 0;
  if (hedef <= orn[0].s) return orn[0].t;
  if (hedef >= orn[n - 1].s) return orn[n - 1].t;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (orn[m].s <= hedef) lo = m; else hi = m; }
  const a = orn[lo], b = orn[hi], ds = b.s - a.s || 1;
  return a.t + (b.t - a.t) * ((hedef - a.s) / ds);
}

/** Gidiş leginde s'deki gerçek hız (m/s) — doğrusal ara değer. */
function hizAtS(hiz: { s: number; v: number }[], s: number): number {
  if (hiz.length === 0) return 0;
  if (s <= hiz[0].s) return hiz[0].v;
  if (s >= hiz[hiz.length - 1].s) return hiz[hiz.length - 1].v;
  let lo = 0, hi = hiz.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (hiz[m].s <= s) lo = m; else hi = m; }
  const a = hiz[lo], b = hiz[hi], ds = b.s - a.s || 1;
  return a.v + (b.v - a.v) * ((s - a.s) / ds);
}

/**
 * HIZ PROFİLİ değişim noktaları: uçlar (0,L) + duraklar + hız-limiti değişim sınırları.
 * Yakın olanlar (≤ birlesEsik m) tek noktada birleşir. km artan sırada döner.
 */
export function hizDegisimNoktalari(loop: LoopYorunge, line: Line, birlesEsik = 60): HizNokta[] {
  const L = loop.L, orn = loop.ornekler;
  if (L <= 0 || orn.length < 2) return [];
  const hiz: { s: number; v: number }[] = [];
  for (let i = 1; i < orn.length; i++) {
    if (orn[i].s > L + 1e-6) break;
    const dt = orn[i].t - orn[i - 1].t;
    hiz.push({ s: orn[i].s, v: dt > 1e-6 ? Math.max(0, (orn[i].s - orn[i - 1].s) / dt) : 0 });
  }
  const ham: HizNokta[] = [{ s: 0, v: hizAtS(hiz, 0), tip: "uc" }, { s: L, v: hizAtS(hiz, L), tip: "uc" }];
  for (const st of line.stations) if (st.tip !== "gecit" && st.position > 1 && st.position < L - 1) ham.push({ s: st.position, v: hizAtS(hiz, st.position), tip: "durak" });
  for (let i = 1; i < line.segments.length; i++) {
    const sg = line.segments[i];
    if (Math.abs(sg.vmax - line.segments[i - 1].vmax) > 0.1 && sg.start > 1 && sg.start < L - 1) ham.push({ s: sg.start, v: hizAtS(hiz, sg.start), tip: "limit" });
  }
  ham.sort((a, b) => a.s - b.s);
  // Yakınları birleştir (durak, limit'e göre önceliklidir).
  const out: HizNokta[] = [];
  for (const p of ham) {
    const son = out[out.length - 1];
    if (son && p.s - son.s < birlesEsik) { if (son.tip === "limit" && p.tip === "durak") { son.s = p.s; son.v = p.v; son.tip = "durak"; } continue; }
    out.push({ ...p });
  }
  return out;
}

/** Referans trenin (offset 0) istasyon geçiş zamanları — gidiş + dönüş (iniş/çıkış). */
export function bildIstasyonZamanlari(loop: LoopYorunge, line: Line): BildOlay[] {
  const { L, loopLen, ornekler: orn } = loop;
  if (L <= 0 || orn.length < 2) return [];
  const ev: BildOlay[] = [];
  for (const st of line.stations) {
    if (st.tip === "gecit") continue;
    ev.push({ t: tAtCumS(orn, st.position), fp: st.position, ad: st.name, tip: "durak", yon: "g" });
    ev.push({ t: tAtCumS(orn, loopLen - st.position), fp: st.position, ad: st.name, tip: "durak", yon: "d" });
  }
  return ev;
}

/**
 * Referans trenin (k=0) diğer trenlerle KESİŞİM (karşılaşma) noktaları: yalnız ZIT yönlü
 * trenler kesişir. Zaman penceresini tarayıp fp farkının işaret değiştirdiği yeri ara değerler.
 */
export function bildKesisimZamanlari(loop: LoopYorunge, count: number, offset: number): { t: number; fp: number }[] {
  const { periyot, L, loopLen, ornekler: orn } = loop;
  if (periyot <= 0 || L <= 0 || count < 2) return [];
  const durum = (t: number, j: number) => {
    const faz = (((t + j * offset) % periyot) + periyot) % periyot;
    const s = ornekS(orn, faz);
    const gidis = s <= L + 1e-6;
    return { fp: gidis ? Math.min(L, s) : Math.max(0, loopLen - s), gidis };
  };
  const res: { t: number; fp: number }[] = [];
  const N = 500, dt = periyot / N;
  for (let j = 1; j < count; j++) {
    let onceki: { t: number; d: number } | null = null;
    for (let n = 0; n <= N; n++) {
      const t = n * dt, a = durum(t, 0), b = durum(t, j);
      if (a.gidis === b.gidis) { onceki = null; continue; } // aynı yön → kesişmez
      const d = a.fp - b.fp;
      if (onceki && Math.sign(d) !== Math.sign(onceki.d) && d !== 0) {
        const pay = Math.abs(onceki.d) / (Math.abs(onceki.d) + Math.abs(d) || 1);
        const tt = onceki.t + (t - onceki.t) * pay;
        res.push({ t: tt, fp: durum(tt, 0).fp });
      }
      onceki = { t, d };
    }
  }
  // Yakın kesişimleri (≤6 s ve ≤40 m) tekilleştir.
  res.sort((a, b) => a.t - b.t);
  const out: { t: number; fp: number }[] = [];
  for (const c of res) { const s = out[out.length - 1]; if (s && Math.abs(c.t - s.t) < 6 && Math.abs(c.fp - s.fp) < 40) continue; out.push(c); }
  return out;
}

/**
 * ÇAKIŞMASIZ SATIR YERLEŞİMİ: piksel konumları (artan sırada verilmeli) için, her etikete
 * komşusuyla minGap'ten yakınsa alt satır atar. maxSatir'a kadar; dolarsa en az dolu satıra
 * koyar (son çare). Dönen dizi: her konumun satır indeksi (0 üst).
 */
export function satirYerlesim(pozlar: number[], minGap: number, maxSatir = 3): number[] {
  const sonX: number[] = new Array(maxSatir).fill(-Infinity);
  return pozlar.map((x) => {
    for (let r = 0; r < maxSatir; r++) if (x - sonX[r] >= minGap) { sonX[r] = x; return r; }
    // Hepsi dolu → en erken biten (en soldaki) satıra yerleştir.
    let en = 0; for (let r = 1; r < maxSatir; r++) if (sonX[r] < sonX[en]) en = r;
    sonX[en] = x; return en;
  });
}
