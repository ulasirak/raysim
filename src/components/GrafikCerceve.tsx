"use client";

// raysim — GRAFİK ÇERÇEVESİ: herhangi bir grafiği sarar, sağ üste "⛶ Tam ekran" düğmesi
// koyar. Tıklanınca grafik tam-ekran örtüde BÜYÜK render olur → okunurluk artar (w-full
// SVG'ler tüm genişliğe yayılır). ESC ya da ✕ ile kapanır.
//
// KRİTİK: örtü PORTAL ile document.body'ye taşınır. Aksi halde bir üst-öğede transform
// varsa `position:fixed` viewport yerine o öğeye göre konumlanır ve örtü panel içinde
// sıkışır (fixed'in bilinen tuzağı).

import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { brand } from "@/lib/anaray/brand";

export function GrafikCerceve({ baslik, children }: { baslik: string; children: ReactNode }) {
  const [tam, setTam] = useState(false);
  const [mounted, setMounted] = useState(false);
  const govdeRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  // Tam ekranda SVG'leri EKRANI DOLDURMAYA zorla: preserveAspectRatio="none" (en-boy
  // kilidini kaldır) + yüksekliği viewport'a göre ver → dikey gerilir, küçük değişimler
  // (ör. hız dip/tepe) görünür olur. Birden çok SVG varsa yükseklik paylaşılır.
  useEffect(() => {
    if (!tam) return;
    const el = govdeRef.current;
    if (!el) return;
    const svgs = Array.from(el.querySelectorAll("svg"));
    const her = svgs.length > 0 ? Math.max(24, Math.floor(80 / svgs.length)) : 80;
    const geri: (() => void)[] = [];
    svgs.forEach((s) => {
      const par = s.getAttribute("preserveAspectRatio");
      const h = s.style.height, w = s.style.width;
      s.setAttribute("preserveAspectRatio", "none");
      s.style.height = `${her}vh`;
      s.style.width = "100%";
      geri.push(() => { if (par) s.setAttribute("preserveAspectRatio", par); else s.removeAttribute("preserveAspectRatio"); s.style.height = h; s.style.width = w; });
    });
    return () => geri.forEach((f) => f());
  }, [tam, mounted]);

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
            <div ref={govdeRef} className="mx-auto max-w-[1600px]">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
