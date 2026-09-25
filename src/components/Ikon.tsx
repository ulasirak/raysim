"use client";

// raysim — tutarlı tek-renk çizgi ikon seti (emoji yerine kurumsal dil).
// Tümü `currentColor` ile çizilir → bulunduğu metnin/butonun rengini alır; boyut prop.
// Yalnız JSX'te tek başına duran piktografik emojilerin yerine kullanılır (cümle-içi
// emojiler i18n dizelerinde kalır — ayrı iş). SVG inline (freeze-safe, ek yük yok).

type IkonAd = "cop" | "tramvay" | "kilit";

const YOLLAR: Record<IkonAd, React.ReactNode> = {
  // Çöp kutusu (sil)
  cop: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  // Tramvay (boş durum / marka)
  tramvay: (
    <>
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M5 11h14" />
      <path d="M9 3v4M15 3v4" />
      <path d="M8.5 21l2-3M15.5 21l-2-3" />
    </>
  ),
  // Kilit (güvenli / salt-okunur)
  kilit: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

export function Ikon({
  ad,
  size = 16,
  strokeWidth = 1.75,
  className = "",
  style,
}: {
  ad: IkonAd;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {YOLLAR[ad]}
    </svg>
  );
}
