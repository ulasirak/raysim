"use client";

// raysim — GRAFİK ÇERÇEVESİ: herhangi bir grafiği sarar, sağ üste "⛶ Tam ekran" düğmesi
// koyar. Tıklanınca grafik tam-ekran örtüde BÜYÜK render olur → okunurluk artar (w-full
// SVG'ler tüm genişliğe yayılır). ESC ya da ✕ ile kapanır.
//
// KRİTİK: örtü PORTAL ile document.body'ye taşınır. Aksi halde bir üst-öğede transform
// varsa `position:fixed` viewport yerine o öğeye göre konumlanır ve örtü panel içinde
// sıkışır (fixed'in bilinen tuzağı).

import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { brand } from "@/lib/anaray/brand";

export function GrafikCerceve({ baslik, children }: { baslik: string; children: ReactNode }) {
  const [tam, setTam] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!tam) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTam(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [tam]);

  const dugme = (kapat: boolean) => (
    <button type="button" onClick={() => setTam(!kapat)}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition hover:bg-slate-50"
      style={{ borderColor: brand.border, color: brand.ink, background: "rgba(255,255,255,0.9)" }}
      title={kapat ? "Kapat (ESC)" : "Tam ekran"}>
      {kapat ? "✕ Kapat" : "⛶ Tam ekran"}
    </button>
  );

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10">{dugme(false)}</div>
      {children}
      {tam && mounted && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "#fff" }} role="dialog" aria-modal="true">
          <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: brand.border }}>
            <span className="font-brand text-base font-semibold" style={{ color: brand.ink }}>{baslik}</span>
            {dugme(true)}
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
