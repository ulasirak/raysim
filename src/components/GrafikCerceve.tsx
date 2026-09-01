"use client";

// raysim — GRAFİK ÇERÇEVESİ: herhangi bir grafiği sarar, sağ üste "⛶ Tam ekran" düğmesi
// koyar. Tıklanınca grafik tam-ekran örtüde (fixed inset-0) BÜYÜK render olur → okunurluk
// artar (w-full SVG'ler tüm genişliğe yayılır). ESC ya da ✕ ile kapanır.

import { useState, useEffect, type ReactNode } from "react";
import { brand } from "@/lib/anaray/brand";

export function GrafikCerceve({ baslik, children }: { baslik: string; children: ReactNode }) {
  const [tam, setTam] = useState(false);

  useEffect(() => {
    if (!tam) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTam(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [tam]);

  const dugme = (koyu: boolean) => (
    <button type="button" onClick={() => setTam((v) => !v)}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition hover:bg-slate-50"
      style={{ borderColor: brand.border, color: brand.ink, background: koyu ? "#fff" : "rgba(255,255,255,0.85)" }}
      title={tam ? "Kapat (ESC)" : "Tam ekran"}>
      {tam ? "✕ Kapat" : "⛶ Tam ekran"}
    </button>
  );

  if (tam) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: brand.surface ?? "#fff" }}>
        <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: brand.border }}>
          <span className="font-brand text-base font-semibold" style={{ color: brand.ink }}>{baslik}</span>
          {dugme(true)}
        </div>
        {/* Tam-ekran gövde: grafik genişliğe yayılır, gerekirse dikey/yatay kaydırılır */}
        <div className="flex-1 overflow-auto p-4">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10">{dugme(false)}</div>
      {children}
    </div>
  );
}
