// Gösterim yardımcıları (SI → insan-okur birim)

/** m/s → km/h */
export const kmh = (v: number) => v * 3.6;

/** m → km, virgülden sonra n hane */
export const km = (s: number, n = 2) => (s / 1000).toFixed(n);

/** saniye → "d:ss" veya "s sn" */
export function sure(sec: number): string {
  const s = Math.round(sec);
  const d = Math.floor(s / 60);
  const r = s % 60;
  return `${d}:${r.toString().padStart(2, "0")}`;
}

/** saniye → "mm:ss" mutlak saat (00:00'dan itibaren) */
export const saat = (sec: number) => sure(sec);
