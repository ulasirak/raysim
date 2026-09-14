// raysim — LiveNetwork GEOMETRİ + ÖRNEKLEME yardımcıları (LiveNetwork.tsx'ten ayrıldı).
// Tümü SAF/yan-etkisiz (hook YOK): sabitler + yörünge örnekleme. LiveNetwork bileşeni
// buradan okur. Bölme davranışı değiştirmez; içerik birebir taşındı.

import type { LoopYorunge, LoopDurum } from "@/lib/anaray/signalling";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export const VBW = 860;
// Yükseklik İÇERİĞE göre: depo/spur gibi alt kollar varsa (düğüm y'si büyük) alan
// açılır, düz koridorda (proje hattı) açılmaz — aksi halde şeritlerin altında
// kocaman boş bir bant kalıyordu.
export const VBH_MIN = 190;
export const vbhHesap = (nodeY: number[]) => Math.max(VBH_MIN, Math.max(70, ...nodeY) + 120);
export const HIZLAR = [1, 5, 15, 30, 60];
// Yön kodlaması TÜM modüllerde aynı (Bildfahrplan/TrainGraphChart ile birebir):
// gidiş = mavi · dönüş = turuncu (chartkit'te valide edilmiş çift).
export const UP_COL = CK.blue;
export const DOWN = CK.orange;
export const GAP = 9; // şeritlerin merkez hattından dik ofseti (px)
// YÖN 180° ÇEVRİK (geometri/normaller OLDUĞU GİBİ — ayna YOK): gidiş ALT şeritte
// (fp=s → ekranda sol→sağ), dönüş ÜST şeritte (fp=L-s → sağ→sol). İstasyon adları
// daima FİZİKSEL üst şeridin (UST=-1) üstüne yazılır → raylar arasına düşmez.
export const UP_SIDE = 1;    // gidiş → alt şerit
export const DOWN_SIDE = -1; // dönüş → üst şerit
export const UST = -1;       // fiziksel üst şerit (etiket/leader yerleşimi için)

export function sampleS(points: { t: number; s: number }[], t: number): { s: number; active: boolean; v: number } {
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
export const DURUM_STIL: Record<LoopDurum, { renk: string; ikon: string; ad: string }> = {
  seyir: { renk: CK.good, ikon: "→", ad: "serbest seyir" },
  hizlanma: { renk: CK.blue, ikon: "↗", ad: "hızlanıyor" },
  kisit: { renk: CK.amber, ikon: "⤵", ad: "hız kısıtı" },
  dwell: { renk: brand.inkSoft, ikon: "⏸", ad: "istasyon duruşu" },
  donus: { renk: CK.orange, ikon: "🔄", ad: "terminal dönüşü" },
};
// Döngü yörüngesini bir faz anında örnekle (s kümülatif + o anki durum).
export function sampleLoop(orn: LoopYorunge["ornekler"], phase: number): { s: number; durum: LoopDurum; ad: string; v: number } {
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
export function fazAtS(orn: LoopYorunge["ornekler"], sHedef: number, L: number, gidisMi: boolean): number {
  let bt = 0, bd = Infinity;
  for (const o of orn) {
    if (gidisMi && o.s > L + 1e-6) continue;
    if (!gidisMi && o.s < L - 1e-6) continue;
    const d = Math.abs(o.s - sHedef);
    if (d < bd) { bd = d; bt = o.t; }
  }
  return bt;
}
