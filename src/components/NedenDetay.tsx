"use client";

// raysim — satır-içi kademeli açıklama (progressive disclosure).
// Uzun tanım/gerekçe metnini tek satırlık bir tetikleyicinin ("… ▸") altına toplar:
// ekran ferahlar, bilgi kaybolmaz. Native <details> — JS/state YOK (app'in bilinçli
// "freeze yok" deseni). Varsayılan üçgen, summary'ye display:flex verilerek kalkar
// (Panel ile aynı yöntem); Safari için ::-webkit-details-marker de gizlenir.

import { brand } from "@/lib/anaray/brand";

export function NedenDetay({
  ozet,
  children,
  className = "",
}: {
  ozet: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`nd group mt-1 ${className}`}>
      <summary
        className="flex w-fit cursor-pointer select-none items-center gap-1 text-[0.7rem] font-semibold [&::-webkit-details-marker]:hidden"
        style={{ color: brand.ink }}
      >
        <span className="underline decoration-dotted underline-offset-2">{ozet}</span>
        <span className="text-[0.6rem] transition-transform duration-150 group-open:rotate-90" style={{ color: brand.muted }} aria-hidden="true">▸</span>
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}
