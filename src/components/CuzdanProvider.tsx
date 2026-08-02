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
  /** Kredi paketi satın almayı başlatır; iyzico ödeme sayfasına yönlendirir. */
  krediSatinAl: (paketId: string) => Promise<{ hata?: string }>;
  /** Ödeme dönüşü sonucu (iyzico callback'ten): kullanıcıya banner gösterilir. */
  odemeSonucu: "basarili" | "hata" | null;
  odemeSonucuTemizle: () => void;
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
  const [odemeSonucu, setOdemeSonucu] = useState<"basarili" | "hata" | null>(null);
  const odemeSonucuTemizle = useCallback(() => setOdemeSonucu(null), []);

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

  const krediSatinAl = useCallback(async (paketId: string): Promise<{ hata?: string }> => {
    const a = getAuthInstance();
    if (!a?.currentUser) return { hata: "Oturum yok." };
    const token = await a.currentUser.getIdToken();
    // Ödemeye başlanan sayfa (pathname + #hash) → dönüşte kullanıcı buraya döner.
    const donusYolu = window.location.pathname + window.location.hash;
    const yanit = await fetch("/api/odeme/baslat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paketId, donusYolu }),
    });
    const veri = await yanit.json().catch(() => ({}));
    if (yanit.ok && veri.odemeUrl) {
      window.location.href = veri.odemeUrl; // iyzico ödeme sayfası
      return {};
    }
    return { hata: veri.hata ?? `Ödeme başlatılamadı (${yanit.status}).` };
  }, []);

  // Ödeme dönüşü: /?odeme=basarili|hata → banner göster; başarılıysa bakiyeyi tazele.
  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const p = new URLSearchParams(window.location.search);
        const od = p.get("odeme");
        if (od !== "basarili" && od !== "hata") return;
        if (!iptal) {
          setOdemeSonucu(od);
          if (od === "basarili") await yenile(); // kredi eklendi — bakiyeyi güncelle
        }
        // Adresteki ?odeme= parametresini temizle (yenilemede tekrar tetiklenmesin).
        p.delete("odeme");
        const u = new URL(window.location.href);
        u.search = p.toString();
        window.history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
      } catch { /* sessiz */ }
    })();
    return () => { iptal = true; };
  }, [yenile]);

  return (
    <Ctx.Provider value={{ bakiye, yenile, krediHarca, krediSatinAl, odemeSonucu, odemeSonucuTemizle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCuzdan(): CuzdanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCuzdan, CuzdanProvider içinde kullanılmalı.");
  return c;
}
