"use client";

// raysim — KREDİ CÜZDANI (istemci bağlamı).
// Kullanıcının bakiyesini OKUR ve kredi paketi satın almayı başlatır. Ücretli
// eylemlerde kredi düşümü ilgili SUNUCU ucunda atomik yapılır (rapor: /api/rapor,
// hat: /api/proje/olustur) — istemci düşüm yapmaz.
//
// Bakiye OKUMA istemciden güvenli (kurallar sahibi okumaya izin verir); YAZMA
// yalnız sunucudan olur (bkz. firestore.rules + lib/cuzdanServer.ts).

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getAuthInstance, isFirebaseConfigured } from "@/lib/firebase";
import { bakiyeGetir } from "@/lib/cuzdan";

interface CuzdanCtx {
  bakiye: number | null; // null = henüz yüklenmedi
  yenile: () => Promise<void>;
  /** Kredi paketi satın almayı başlatır; iyzico formunu MODAL içinde açar (siteden çıkmaz). */
  krediSatinAl: (paketId: string) => Promise<{ hata?: string }>;
  /** Açık ödeme modalının iyzico gömme içeriği (null = kapalı). */
  odemeIcerik: string | null;
  /** Gömme başarısızsa yeni sekmede açılacak yedek iyzico URL'i. */
  odemeUrlYedek: string | null;
  /** Ödeme modalını kapatır (kullanıcı vazgeçti → sitede kalır). */
  odemeKapat: () => void;
  /** Ödeme dönüşü sonucu (iyzico callback'ten): kullanıcıya banner gösterilir. */
  odemeSonucu: "basarili" | "hata" | null;
  odemeSonucuTemizle: () => void;
}

const Ctx = createContext<CuzdanCtx | null>(null);

export function CuzdanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bakiye, setBakiye] = useState<number | null>(null);
  const [odemeSonucu, setOdemeSonucu] = useState<"basarili" | "hata" | null>(null);
  const odemeSonucuTemizle = useCallback(() => setOdemeSonucu(null), []);
  const [odemeIcerik, setOdemeIcerik] = useState<string | null>(null);
  const [odemeUrlYedek, setOdemeUrlYedek] = useState<string | null>(null);
  const odemeKapat = useCallback(() => { setOdemeIcerik(null); setOdemeUrlYedek(null); }, []);

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
    if (yanit.ok && (veri.icerik || veri.odemeUrl)) {
      // Modal-içi gömme: kullanıcı SİTEDEN ÇIKMAZ → vazgeçince (Kapat) yerinde kalır.
      // Gömme yoksa yalnız yedek URL tutulur (modal "yeni sekmede aç" sunar).
      setOdemeUrlYedek(veri.odemeUrl ?? null);
      setOdemeIcerik(veri.icerik ?? "");
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
    <Ctx.Provider value={{ bakiye, yenile, krediSatinAl, odemeIcerik, odemeUrlYedek, odemeKapat, odemeSonucu, odemeSonucuTemizle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCuzdan(): CuzdanCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCuzdan, CuzdanProvider içinde kullanılmalı.");
  return c;
}
