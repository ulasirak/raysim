"use client";

// raysim — KREDİ CÜZDANI (istemci bağlamı).
// Kullanıcının bakiyesini okur ve ücretli eylemler için TEK kapı sunar:
// `krediHarca(eylem)` → sunucudaki /api/kredi/dus'a imzalı token'la gider,
// atomik düşer, yeni bakiyeyi döndürür. Bakiye yetersizse KrediYetersiz sinyali.
//
// Bakiye OKUMA istemciden güvenli (kurallar sahibi okumaya izin verir); YAZMA
// yalnız sunucudan olur (bkz. firestore.rules + lib/cuzdanServer.ts).

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getAuthInstance, isFirebaseConfigured } from "@/lib/firebase";
import { bakiyeGetir, KREDI_BEDELI, type KrediEylemi } from "@/lib/cuzdan";

interface CuzdanCtx {
  bakiye: number | null; // null = henüz yüklenmedi
  yenile: () => Promise<void>;
  /** Ücretli eylem için krediyi sunucuda düşer. Dönüş: {tamam, bakiye, gereken?, mevcut?}. */
  krediHarca: (eylem: KrediEylemi, ref?: string) => Promise<HarcamaSonuc>;
}

export interface HarcamaSonuc {
  tamam: boolean;
  bakiye?: number;
  yetersiz?: boolean;
  gereken?: number;
  mevcut?: number;
  hata?: string;
}

const Ctx = createContext<CuzdanCtx | null>(null);

export function CuzdanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bakiye, setBakiye] = useState<number | null>(null);

  const yenile = useCallback(async () => {
    if (!user || !isFirebaseConfigured()) { setBakiye(null); return; }
    try {
      const c = await bakiyeGetir(user.uid);
      setBakiye(c.bakiye);
    } catch {
      setBakiye(null);
    }
  }, [user]);

  // Oturum değişince bakiyeyi çek. setState async IIFE içinde (effect gövdesinde
  // SENKRON değil) — user yoksa null, varsa Firestore'dan okunur.
  useEffect(() => {
    let iptal = false;
    (async () => {
      if (!user || !isFirebaseConfigured()) { if (!iptal) setBakiye(null); return; }
      try {
        const c = await bakiyeGetir(user.uid);
        if (!iptal) setBakiye(c.bakiye);
      } catch {
        if (!iptal) setBakiye(null);
      }
    })();
    return () => { iptal = true; };
  }, [user]);

  const krediHarca = useCallback(async (eylem: KrediEylemi, ref?: string): Promise<HarcamaSonuc> => {
    const a = getAuthInstance();
    if (!a?.currentUser) return { tamam: false, hata: "Oturum yok." };
    const token = await a.currentUser.getIdToken();
    const yanit = await fetch("/api/kredi/dus", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eylem, ref }),
    });
    const veri = await yanit.json().catch(() => ({}));
    if (yanit.ok) {
      if (typeof veri.bakiye === "number") setBakiye(veri.bakiye);
      return { tamam: true, bakiye: veri.bakiye };
    }
    if (yanit.status === 402) {
      return { tamam: false, yetersiz: true, gereken: veri.gereken ?? KREDI_BEDELI[eylem], mevcut: veri.mevcut ?? 0 };
    }
    return { tamam: false, hata: veri.hata ?? `Hata (${yanit.status}).` };
  }, []);

  return <Ctx.Provider value={{ bakiye, yenile, krediHarca }}>{children}</Ctx.Provider>;
}

export function useCuzdan(): CuzdanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCuzdan, CuzdanProvider içinde kullanılmalı.");
  return c;
}
