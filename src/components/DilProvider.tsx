"use client";

// raysim — UYGULAMA GENELİ DİL (i18n) altyapısı.
// Tek dil durumu (TR varsayılan · EN · DE), localStorage'da kalıcı. Çeviri metinleri
// KEY DEĞİL, çağrı yerinde birlikte durur: `t({ tr, en, de })` → seçili dili döndürür,
// eksikse TR'ye düşer (kısmi çeviri zarifçe bozulmaz). Böylece modüller kademeli
// çevrilebilir; çevrilmemiş metin Türkçe kalır. Sunum Modu da bu dili kullanır.
//
// SSR notu: `dil` lazy init localStorage'dan okunur. Uygulamanın çevrili içeriği
// istemci-taraflı oturum kapısının (icerikVar) ARDINDAN render edildiğinden SSR
// HTML'inde yer almaz → hidrasyon uyuşmazlığı olmaz.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Dil = "tr" | "en" | "de";
export type Ceviri = { tr: string; en?: string; de?: string };

export const DIL_ADI: Record<Dil, string> = { tr: "Türkçe", en: "English", de: "Deutsch" };

type DilCtx = { dil: Dil; setDil: (d: Dil) => void; t: (m: Ceviri) => string };

const Ctx = createContext<DilCtx | null>(null);

function kayitliDil(): Dil {
  if (typeof window === "undefined") return "tr";
  try { const v = localStorage.getItem("raysim-dil"); return v === "tr" || v === "en" || v === "de" ? v : "tr"; } catch { return "tr"; }
}

export function DilProvider({ children }: { children: React.ReactNode }) {
  const [dil, setDilState] = useState<Dil>(kayitliDil);
  const setDil = useCallback((d: Dil) => {
    setDilState(d);
    try { localStorage.setItem("raysim-dil", d); } catch { /* özel pencere vb. */ }
  }, []);
  const t = useCallback((m: Ceviri) => m[dil] ?? m.tr, [dil]);
  const deger = useMemo(() => ({ dil, setDil, t }), [dil, setDil, t]);
  return <Ctx.Provider value={deger}>{children}</Ctx.Provider>;
}

// Provider dışında da güvenli (TR döndürür) — parça parça benimsemeyi kolaylaştırır.
export function useDil(): DilCtx {
  return useContext(Ctx) ?? { dil: "tr", setDil: () => {}, t: (m: Ceviri) => m.tr };
}
