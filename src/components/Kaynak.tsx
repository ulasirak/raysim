"use client";

// raysim — "GİRDİ KAYNAĞI" işareti. Bir panelin kullandığı değerlerin NEREDEN
// değiştirileceğini tutarlı biçimde gösterir (girdiler taşınmadan "yerli yerinde"
// erişim). Kısayollar: ⚙ Parametreler (üst çubuk modalı — olayla açılır) veya
// Ringler/Sefer bölümleri (hash-ankor). Tek bileşen → tüm panellerde aynı dil.

import Link from "next/link";
import { brand } from "@/lib/anaray/brand";

/** ⚙ Parametreler modalını her yerden açan olay adı (ParametreDuzenleButonu dinler). */
export const PARAMETRELER_AC = "raysim:parametreler-ac";

export type KaynakYer =
  | "parametreler"                          // ⚙ Parametreler modalını açar
  | { ad: string; href: string };           // bölüm ankoru (ör. /#ringler)

export function Kaynak({ yerler, etiket = "Bu değerleri nereden değiştirirsin" }: { yerler: KaynakYer[]; etiket?: string }) {
  if (!yerler.length) return null;
  const acParametreler = () => { try { window.dispatchEvent(new CustomEvent(PARAMETRELER_AC)); } catch { /* sessiz */ } };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[0.7rem]" style={{ borderColor: brand.border }}>
      <span className="shrink-0" style={{ color: brand.faint }}>ⓘ {etiket}:</span>
      {yerler.map((y, i) => y === "parametreler" ? (
        <button key={i} type="button" onClick={acParametreler}
          className="rounded-full border px-2 py-0.5 font-medium transition hover:bg-slate-50"
          style={{ borderColor: brand.border, color: brand.inkSoft }}>⚙ Parametreler →</button>
      ) : (
        <Link key={i} href={y.href}
          className="rounded-full border px-2 py-0.5 font-medium transition hover:bg-slate-50"
          style={{ borderColor: brand.border, color: brand.inkSoft }}>{y.ad} →</Link>
      ))}
    </div>
  );
}
