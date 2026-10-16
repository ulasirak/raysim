"use client";

// raysim — tutarlı tek-renk çizgi ikon seti (emoji yerine kurumsal dil).
// Tümü `currentColor` ile çizilir → bulunduğu metnin/butonun rengini alır; boyut prop.
// Yalnız JSX'te tek başına duran piktografik emojilerin yerine kullanılır (cümle-içi
// emojiler i18n dizelerinde kalır — ayrı iş). SVG inline (freeze-safe, ek yük yok).

type IkonAd =
  | "cop" | "tramvay" | "kilit" | "goz" | "belge" | "oynat"
  | "klasor" | "kure" | "konum" | "park" | "hedef" | "ampul" | "cetvel";

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
  // Göz (görüntüleme / salt-okunur paylaşım)
  goz: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Belge (rapor / doküman)
  belge: (
    <>
      <path d="M6 2h7l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
      <path d="M13 2v5h5" />
      <path d="M8.5 13h7M8.5 17h7M8.5 9h2.5" />
    </>
  ),
  // Oynat (canlı sim başlat)
  oynat: <path d="M7 5v14l12-7-12-7Z" />,
  // Klasör (dosyadan içe aktar)
  klasor: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </>
  ),
  // Küre (OSM / coğrafi)
  kure: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
    </>
  ),
  // Konum iğnesi (harita noktası / kilometraj)
  konum: (
    <>
      <path d="M12 21s-6.5-5.3-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.7 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </>
  ),
  // Park (P — parklanma / depo bekleme)
  park: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 16V8h3.2a2.4 2.4 0 0 1 0 4.8H10" />
    </>
  ),
  // Hedef (nişangâh — koordinat gir / elle konum)
  hedef: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  // Ampul (ipucu / öneri)
  ampul: (
    <>
      <path d="M12 3a6 6 0 0 0-3.8 10.6c.6.5.9 1.1 1 1.9h5.6c.1-.8.4-1.4 1-1.9A6 6 0 0 0 12 3Z" />
      <path d="M9.5 18.5h5M10.5 21h3" />
    </>
  ),
  // Cetvel (ölçü — CAD / GTFS içe aktar)
  cetvel: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1.2" />
      <path d="M7 8v3M11 8v4.5M15 8v3M19 8v3" />
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
