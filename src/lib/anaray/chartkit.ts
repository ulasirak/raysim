// raysim — GRAFİK TASARIM SİSTEMİ (chartkit).
// Tüm gömülü SVG grafikleri (rapor + uygulama) tek tutarlı, profesyonel görsel
// dilden okur: doğrulanmış palet, recessive ızgara/eksen, sans + tabular sayı
// etiketleri, gradyan alan dolguları, yuvarlak/ince marklar.
//
// Palet dataviz metoduyla valide edildi (beyaz zemin): iki-yön = mavi+turuncu
// (geçer), eğim diverging = kırmızı↔mavi + nötr gri, tek-seri ana çizgi = mürekkep,
// altın YALNIZ etiketli kurp işaretinde (ikincil kodlama). Durum = kırmızı/yeşil.

export const CK = {
  // Chrome & ink (recessive)
  ink: "#0C2233",       // ana veri çizgisi / birincil mürekkep (marka lacivert)
  ink2: "#3A4A5A",      // ikincil
  muted: "#8A94A0",     // eksen/etiket
  faint: "#AEB8C2",
  grid: "#EAEEF2",      // saç-teli ızgara
  baseline: "#C7CFD8",  // taban çizgisi/eksen
  surface: "#FFFFFF",
  // Seri renkleri (valide)
  blue: "#2A78D6",      // birincil / gidiş / iniş
  orange: "#EB6834",    // ikinci seri / dönüş
  aqua: "#1BAF7A",
  red: "#C8102E",       // durum-kritik / tırmanış / limit (marka kırmızısı)
  gold: "#A8842C",      // YALNIZ etiketli kurp işareti
  good: "#0E7C57",      // durum-iyi
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

// Sayısal etiket (tabular-nums, sans) — hizalı, temiz.
export function num(x: number, y: number, text: string, o: { size?: number; anchor?: string; color?: string; weight?: number } = {}): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.anchor ?? "start"}" font-family="${CK.sans}" font-size="${o.size ?? 9}" font-weight="${o.weight ?? 400}" fill="${o.color ?? CK.muted}" style="font-variant-numeric:tabular-nums">${text}</text>`;
}
// Metin etiketi (sans).
export function lab(x: number, y: number, text: string, o: { size?: number; anchor?: string; color?: string; weight?: number } = {}): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.anchor ?? "start"}" font-family="${CK.sans}" font-size="${o.size ?? 9}" font-weight="${o.weight ?? 400}" fill="${o.color ?? CK.muted}">${text}</text>`;
}

// Dikey alan gradyanı tanımı (üst renkli → alta şeffaf). id benzersiz olmalı.
export function areaGrad(id: string, color: string, topOpacity = 0.22): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="${topOpacity}"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient>`;
}

/** Pürüzsüz Catmull-Rom → kübik bezier yolu (yumuşak seri çizgisi).
 *  Aşırı sapmayı önlemek için gerilim düşük; monoton veriyi bozmaz. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}` : "";
  if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  const p = pts;
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  const k = 0.16; // düşük gerilim → overshoot yok
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p[i + 1];
    const c1x = p1.x + (p2.x - p0.x) * k, c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k, c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Diverging eğim rengi: + tırmanış (kırmızı) / − iniş (mavi) / ~düz (gri). */
export function egimRenk(g: number): string {
  return g > 0.3 ? CK.red : g < -0.3 ? CK.blue : CK.baseline;
}
