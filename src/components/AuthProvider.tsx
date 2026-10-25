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

/** Firebase Auth hata kodlarını okunur, çok-dilli (TR·EN·DE) mesaja çevirir. */
export function authHata(e: unknown, dil: "tr" | "en" | "de" = "tr"): string {
  const kod = (e as { code?: string })?.code ?? "";
  const m = (tr: string, en: string, de: string) => (dil === "en" ? en : dil === "de" ? de : tr);
  switch (kod) {
    case "auth/invalid-email": return m("E-posta adresi geçersiz.", "Invalid email address.", "Ungültige E-Mail-Adresse.");
    case "auth/missing-password": return m("Şifre girilmedi.", "No password entered.", "Kein Passwort eingegeben.");
    case "auth/weak-password": return m("Şifre çok zayıf; en az 6 karakter olmalı.", "Password is too weak; it must be at least 6 characters.", "Passwort zu schwach; mindestens 6 Zeichen nötig.");
    case "auth/email-already-in-use": return m("Bu e-posta ile zaten bir hesap var; giriş yapın.", "An account already exists with this email; sign in instead.", "Mit dieser E-Mail existiert bereits ein Konto; melden Sie sich an.");
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return m("E-posta veya şifre hatalı.", "Incorrect email or password.", "E-Mail oder Passwort falsch.");
    case "auth/too-many-requests": return m("Çok fazla deneme yapıldı; bir süre sonra tekrar deneyin.", "Too many attempts; please try again later.", "Zu viele Versuche; bitte später erneut versuchen.");
    case "auth/network-request-failed": return m("Ağ hatası; bağlantınızı kontrol edin.", "Network error; check your connection.", "Netzwerkfehler; prüfen Sie Ihre Verbindung.");
    case "auth/operation-not-allowed": return m("E-posta/şifre girişi Firebase Console'da etkinleştirilmemiş.", "Email/password sign-in is not enabled in the Firebase Console.", "E-Mail/Passwort-Anmeldung ist in der Firebase Console nicht aktiviert.");
    default: return e instanceof Error ? e.message : String(e);
  }
}
