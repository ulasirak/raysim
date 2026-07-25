// raysim — SUNUCU tarafı Firebase (Admin SDK).
//
// Admin SDK güvenlik kurallarını BAYPAS eder; yalnız sunucuda (API route'ları)
// kullanılır, ASLA istemciye sızdırılmaz. Para bağlı her yazma buradan geçer.
//
// ÖNEMLİ: firebase-admin STATİK top-level import edilirse Vercel serverless'ta
// modül yüklenirken 500 patlıyor (Turbopack production paketleme). Bu yüzden tüm
// firebase-admin değer import'ları LAZY DİNAMİK (`await import`) — yalnız gerçekten
// çağrıldığında yüklenir. Tipler `import type` ile alınır (bundle'a girmez).
//
// Yetki: FIREBASE_SERVICE_ACCOUNT = hizmet hesabı JSON'unun tamamı (Firebase
// Console → Proje Ayarları → Hizmet hesapları → Yeni özel anahtar). NEXT_PUBLIC_
// DEĞİLDİR: tarayıcıya gönderilmez.

import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

let cachedApp: App | null = null;

/** Hizmet hesabı yapılandırıldı mı? (route'lar buna göre 503 döndürür.) */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

async function adminApp(): Promise<App> {
  if (cachedApp) return cachedApp;
  const { getApps, getApp, initializeApp, cert } = await import("firebase-admin/app");
  if (getApps().length) { cachedApp = getApp(); return cachedApp; }

  const ham = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!ham) throw new Error("FIREBASE_SERVICE_ACCOUNT tanımlı değil (sunucu ödeme/kredi işlemleri kapalı).");

  let json: { project_id: string; client_email: string; private_key: string };
  try {
    json = JSON.parse(ham);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT geçerli bir JSON değil.");
  }
  // Vercel ortam değişkeninde \n çoğu zaman kaçışlanmış gelir; gerçek satır sonuna çevir.
  const privateKey = json.private_key?.replace(/\\n/g, "\n");

  cachedApp = initializeApp({
    credential: cert({
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey,
    }),
  });
  return cachedApp;
}

export async function adminDb(): Promise<Firestore> {
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(await adminApp());
}

export async function adminAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await adminApp());
}

/**
 * İstek başlığındaki Firebase ID token'ını doğrular ve uid döndürür.
 * İstemci `Authorization: Bearer <idToken>` gönderir; kimlik SÖZE değil imzalı
 * token'a göre belirlenir (kullanıcı başkası adına işlem yapamaz).
 */
export async function istekUid(req: Request): Promise<string> {
  const baslik = req.headers.get("authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : "";
  if (!token) throw new Error("Kimlik doğrulanmadı (token yok).");
  const auth = await adminAuth();
  const cozulen = await auth.verifyIdToken(token);
  return cozulen.uid;
}
