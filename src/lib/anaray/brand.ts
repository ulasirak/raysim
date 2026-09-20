// raysim — kurumsal marka jetonları (tek kaynak).
// Açık "resmî belge" teması: koyu mürekkep-lacivert + resmî Türk kırmızısı + nötr kağıt.
// Tüm bileşenler (kartlar, SVG grafikler) renkleri buradan alır → tek tutarlı sistem.

export const brand = {
  // Kurumsal yüzeyler
  ink: "#0C2233", // koyu mürekkep-lacivert — başlık, masthead, ana veri
  inkSoft: "#3A4A5A", // gövde metni
  muted: "#6B7A8A", // etiket / ikincil
  faint: "#9AA7B4",
  red: "#C8102E", // resmî kırmızı aksan (ölçülü)
  redSoft: "#E23B52",
  gold: "#A8842C", // nadir "mühür" cetveli
  paper: "#F5F6F8", // sayfa zemini
  surface: "#FFFFFF", // kartlar
  border: "#DCE1E7", // ince cetvel
  borderStrong: "#C3CBD4",

  // Grafik / veri renkleri (açık zeminde okunur)
  grid: "#E6E9ED",
  route: "#0C2233", // yörünge / rota çizgisi
  train: "#C8102E", // tren işareti
  speed: "#0C2233", // fiili hız eğrisi
  limit: "#C8102E", // hız limiti (kesikli)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// KURUMSAL TASARIM SİSTEMİ (design tokens) — tek kaynak, ölçekli, dokümante.
// `brand` (yukarıda) renk paletinin çekirdeğidir; `ds` bunun üzerine tipografi
// ölçeği, boşluk ritmi, köşe/gölge (yükselti), hareket ve anlamsal durum
// renklerini ekler. Amaç: tüm uygulamada TEK tutarlı görsel dil — "AI yapımı"
// değil, tasarım-sistemi disiplinli bir ürün izlenimi. Değerler globals.css'te
// CSS değişkeni olarak da yayınlanır (--ds-*), böylece hem TS hem CSS aynı
// kaynaktan beslenir. Backward-compat: `brand` anahtarları değişmedi.
export const ds = {
  /** Tipografi ölçeği — rem tabanlı, oransal satır yüksekliği + harf aralığı. */
  type: {
    display: { size: "2.5rem", line: "1.08", weight: 600, tracking: "-0.02em" },
    h1: { size: "1.875rem", line: "1.15", weight: 600, tracking: "-0.015em" },
    h2: { size: "1.375rem", line: "1.25", weight: 600, tracking: "-0.01em" },
    h3: { size: "1.125rem", line: "1.3", weight: 600, tracking: "0" },
    h4: { size: "1rem", line: "1.4", weight: 600, tracking: "0" },
    body: { size: "0.9375rem", line: "1.6", weight: 400, tracking: "0" },
    bodySm: { size: "0.8125rem", line: "1.55", weight: 400, tracking: "0" },
    label: { size: "0.6875rem", line: "1.2", weight: 600, tracking: "0.14em" },
    caption: { size: "0.75rem", line: "1.4", weight: 400, tracking: "0" },
  },
  /** Boşluk ritmi — 4px temelli ölçek (tutarlı dikey/yatay ritim). */
  space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px", "3xl": "48px", "4xl": "64px" },
  /** Köşe yarıçapı ölçeği. */
  radius: { sm: "4px", md: "8px", lg: "12px", xl: "16px", pill: "999px" },
  /** Yükselti (gölge) — ölçülü, kurumsal; mürekkep-lacivert tonlu. */
  shadow: {
    sm: "0 1px 2px rgba(12,34,51,0.06)",
    md: "0 2px 8px rgba(12,34,51,0.08)",
    lg: "0 8px 24px rgba(12,34,51,0.12)",
    focus: "0 0 0 3px rgba(200,16,46,0.35)",
  },
  /** Hareket — süre + yumuşatma (reduced-motion globals.css'te kısılır). */
  motion: {
    fast: "120ms",
    base: "200ms",
    slow: "320ms",
    ease: "cubic-bezier(0.2,0.6,0.2,1)",
    emphasized: "cubic-bezier(0.2,0.8,0.2,1)",
  },
  /** Anlamsal durum renkleri — metin + yumuşak zemin (rozet/uyarı şeritleri). */
  status: {
    success: "#1B7A4B", successSoft: "#E7F3EC",
    warn: "#9A6B00", warnSoft: "#FBF1DA",
    danger: "#C8102E", dangerSoft: "#FBE4E7", // danger = kurumsal kırmızı
    info: "#0C2233", infoSoft: "#E8EEF3",
  },
  /** Koyu tema yüzeyleri — token değerleri hazır (globals.css `[data-theme="dark"]`
   *  altında yayınlanır; bileşen bazlı benimseme kademeli). */
  dark: {
    paper: "#0B1620",
    surface: "#12222F",
    ink: "#E7ECF1",
    inkSoft: "#AEBECB",
    muted: "#7E8FA0",
    border: "#23384A",
    borderStrong: "#33506A",
  },
} as const;
