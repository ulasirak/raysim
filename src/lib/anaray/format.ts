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

/** Blob'u tarayıcıda indirir (dosya adıyla). Ağır belge kütüphanelerine bağlı
 *  değildir — bu yüzden dokuman.ts yerine hafif format modülünde durur. */
export function indir(blob: Blob, adSoyad: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = adSoyad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
