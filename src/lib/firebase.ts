// aslanray — Firebase bağlantısı.
// Yapılandırma .env.local'den NEXT_PUBLIC_FIREBASE_* değişkenleriyle okunur.
// Değerler girilmemişse uygulama ÇÖKMEZ; getDb() null döner (güvenli düşüş).
//
// Değerleri nereden alırsın: Firebase Console → Proje Ayarları →
// "Uygulamalarınız" (Web) → SDK kurulumu ve yapılandırması → yapılandırma nesnesi.

import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** Zorunlu alanlar dolu mu? (gerçek bağlantı testi değil, yapılandırma kontrolü) */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

/** Firestore örneği; yapılandırma yoksa null. */
export function getDb(): Firestore | null {
  const a = getFirebaseApp();
  if (!a) return null;
  if (!dbInstance) dbInstance = getFirestore(a);
  return dbInstance;
}

let authInstance: Auth | null = null;

/** Auth örneği; yapılandırma yoksa null. Yönetici girişi (senaryo yazma yetkisi) için. */
export function getAuthInstance(): Auth | null {
  const a = getFirebaseApp();
  if (!a) return null;
  if (!authInstance) authInstance = getAuth(a);
  return authInstance;
}
