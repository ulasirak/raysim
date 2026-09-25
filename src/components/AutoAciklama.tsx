"use client";

// raysim — panel açıklamalarını OTOMATİK sadeleştirir (progressive disclosure).
// Uzun açıklama → ilk cümle görünür, gerisi "… devamı ▸" altında toplanır; kısa
// açıklama olduğu gibi kalır. Tek yerde: tüm modüllerin Panel açıklamaları tutarlı
// biçimde ferahlar, bilgi kaybolmaz. Native <details> — JS/state YOK (freeze-safe).

import { brand } from "@/lib/anaray/brand";

const ESIK = 150; // karakter — bunun altındaki açıklamalar olduğu gibi gösterilir

export function AutoAciklama({
  metin,
  className = "",
  style,
}: {
  metin?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!metin) return null;
  if (metin.length <= ESIK) return <p className={className} style={style}>{metin}</p>;

  // İlk cümle sonunda böl (ilk . ! ? ya da ;). Bulunamazsa eşik civarı kelime sınırı.
  let kes = -1;
  const m = metin.match(/[.!?;](\s|$)/);
  if (m && m.index != null && m.index < ESIK * 1.5) kes = m.index + 1;
  if (kes < 0) { kes = metin.lastIndexOf(" ", ESIK); if (kes < 0) kes = ESIK; }
  const bas = metin.slice(0, kes).trim();
  const kalan = metin.slice(kes).trim();

  return (
    <details className={`nd group ${className}`} style={style}>
      <summary className="flex cursor-pointer select-none items-baseline gap-1 [&::-webkit-details-marker]:hidden">
        <span>{bas}</span>
        <span className="shrink-0 whitespace-nowrap font-semibold" style={{ color: brand.ink }}>
          <span className="group-open:hidden">… devamı </span>
          <span className="inline-block text-[0.85em] transition-transform duration-150 group-open:rotate-90" aria-hidden="true">▸</span>
        </span>
      </summary>
      <div className="mt-1">{kalan}</div>
    </details>
  );
}
