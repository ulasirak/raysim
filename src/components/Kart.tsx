// raysim — KART primitifi (kurumsal tasarım sistemi).
// Tek tutarlı yüzey: aynı zemin · aynı cetvel · aynı köşe · aynı yükselti (gölge).
// globals.css `.ds-card` tokenlarını kullanır. Dağınık `rounded-lg border bg-white`
// varyasyonları yerine tek kaynak. `ic` dolgu ölçeğini, `ton` sol-kenar vurgusunu
// (durum) belirler; `as` ile section/article gibi anlamsal etiket verilebilir.

import { brand, ds } from "@/lib/anaray/brand";

type Ton = "notr" | "danger" | "success" | "warn" | "info";

const KENAR: Record<Ton, string | undefined> = {
  notr: undefined,
  danger: ds.status.danger,
  success: ds.status.success,
  warn: ds.status.warn,
  info: brand.ink,
};

export function Kart({
  children,
  ic = "md",
  ton = "notr",
  className = "",
  style,
  title,
}: {
  children: React.ReactNode;
  /** İç dolgu: yok / dar / orta / geniş. */
  ic?: "yok" | "sm" | "md" | "lg";
  /** Sol-kenar durum vurgusu (ölçülü). */
  ton?: Ton;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const dolgu = ic === "yok" ? "" : ic === "sm" ? "p-3" : ic === "lg" ? "p-5" : "p-4";
  const kenar = KENAR[ton];
  return (
    <div
      className={`ds-card ${dolgu} ${className}`.trim()}
      title={title}
      style={kenar ? { borderLeft: `3px solid ${kenar}`, ...style } : style}
    >
      {children}
    </div>
  );
}
