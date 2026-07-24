// raysim — kurumsal amblem (ray mührü): iki rayın ufka birleşmesi + traversler.
// Tek kaynak SVG; paylaşım görselleri (og/twitter) ve favicon buradan üretilir.
// Renkler marka jetonlarıyla uyumlu: gold cetvel, açık raylar, resmî kırmızı traversler.

export const emblemSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46" fill="none">
  <circle cx="23" cy="23" r="21.5" stroke="#A8842C" stroke-width="1"/>
  <circle cx="23" cy="23" r="18" stroke="#E7ECF1" stroke-width="1" opacity="0.5"/>
  <path d="M17 34 L21.5 13 M29 34 L24.5 13" stroke="#E7ECF1" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M18.4 28 L27.6 28 M19.3 24 L26.7 24 M20 20.5 L26 20.5 M20.7 17.5 L25.3 17.5" stroke="#C8102E" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

// Node çalışma zamanında (ImageResponse) base64 data-URI üret.
// LAZY fonksiyon: modül düzeyinde Buffer'a dokunmaz → client bundle'da
// (emblemSvg'yi rapor.ts gibi tarayıcı modülleri import ettiğinde) çökmemesi için.
export function emblemDataUri(): string {
  return `data:image/svg+xml;base64,${Buffer.from(emblemSvg).toString("base64")}`;
}
