"use client";

// raysim — HESAP (kimlik) katmanı.
// Klasik e-posta/şifre girişi (Firebase Auth). Kayıt olan hesap ANINDA açılır:
// e-posta doğrulama adımı YOKTUR — kayıt biter bitmez kullanıcı içerdedir.
// Tek yardımcı akış şifre sıfırlamadır.

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import { getAuthInstance, isFirebaseConfigured } from "@/lib/firebase";

interface AuthCtx {
  user: User | null;
  /** İlk oturum kontrolü sürüyor mu? (true iken "giriş yok" kararı verilmemeli) */
  hazir: boolean;
  yapilandirildi: boolean;
  girisYap: (eposta: string, sifre: string) => Promise<void>;
  kayitOl: (eposta: string, sifre: string) => Promise<void>;
  cikisYap: () => Promise<void>;
  sifreSifirla: (eposta: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function auth() {
  const a = getAuthInstance();
  if (!a) throw new Error("Firebase yapılandırılmadı (.env.local eksik).");
  return a;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hazir, setHazir] = useState(false);
  const yapilandirildi = isFirebaseConfigured();

  useEffect(() => {
    const a = getAuthInstance();
    if (!a) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHazir(true);
      return;
    }
    return onAuthStateChanged(a, (u) => {
      setUser(u);
      setHazir(true);
    });
  }, []);

  const girisYap = async (eposta: string, sifre: string) => {
    await signInWithEmailAndPassword(auth(), eposta.trim(), sifre);
  };

  // Kayıt = anında oturum: Firebase, hesabı oluşturur oluşturmaz kullanıcıyı
  // içeri alır. Ek bir onay/doğrulama adımı yoktur.
  const kayitOl = async (eposta: string, sifre: string) => {
    await createUserWithEmailAndPassword(auth(), eposta.trim(), sifre);
  };

  const cikisYap = async () => { await signOut(auth()); };
  const sifreSifirla = async (eposta: string) => { await sendPasswordResetEmail(auth(), eposta.trim()); };

  return (
    <Ctx.Provider value={{ user, hazir, yapilandirildi, girisYap, kayitOl, cikisYap, sifreSifirla }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return c;
}

/** Firebase Auth hata kodlarını okunur Türkçeye çevirir. */
export function authHata(e: unknown): string {
  const kod = (e as { code?: string })?.code ?? "";
  switch (kod) {
    case "auth/invalid-email": return "E-posta adresi geçersiz.";
    case "auth/missing-password": return "Şifre girilmedi.";
    case "auth/weak-password": return "Şifre çok zayıf — en az 6 karakter olmalı.";
    case "auth/email-already-in-use": return "Bu e-posta ile zaten bir hesap var — giriş yapın.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests": return "Çok fazla deneme yapıldı — bir süre sonra tekrar deneyin.";
    case "auth/network-request-failed": return "Ağ hatası — bağlantınızı kontrol edin.";
    case "auth/operation-not-allowed": return "E-posta/şifre girişi Firebase Console'da etkinleştirilmemiş.";
    default: return e instanceof Error ? e.message : String(e);
  }
}
