// raysim — paylaşılan QR (kare kod) SVG üreticisi.
// Hem PDF rapor (rapor.ts) hem paylaşım panosu (PaylasimPano) aynı üreticiyi kullanır
// → tek kaynak. qrcode-generator ile deterministik, harici istek yok (offline çalışır).

import qrcode from "qrcode-generator";

/** Verilen metni QR SVG string'ine çevirir. Hata durumunda boş string döner. */
export function qrSvgString(text: string, size = 96, renk = "#0C2233"): string {
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const cell = size / n;
    let rects = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c))
          rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="${renk}">${rects}</g></svg>`;
  } catch {
    return "";
  }
}
