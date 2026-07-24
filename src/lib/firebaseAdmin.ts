// raysim — SUNUCU tarafı Firebase (Admin SDK).
//
// Admin SDK güvenlik kurallarını BAYPAS eder; bu yüzden yalnız sunucuda (API
// route'ları) kullanılır ve ASLA istemciye sızdırılmaz. Para bağlı her yazma
// (cüzdan bakiyesi, kredi hareketi, ödeme olayı) buradan geçer — istemci bu
// koleksiyonlara yazamaz (bkz. firestore.rules).
//
// Yetki: bir hizmet hesabı (service account) anahtarı gerekir. Vercel'de tek
// ortam değişkeni olarak saklanır:
//   FIREBASE_SERVICE_ACCOUNT = {...}  (Firebase Console → Proje Ayarları →
//   Hizmet hesapları → "Yeni özel anahtar oluştur" ile inen JSON'un TAMAMI)
// Bu değişken NEXT_PUBLIC_ DEĞİLDİR: tarayıcıya gönderilmez.

import { getApps, getApp, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let cachedApp: App | null = null;

/** Hizmet hesabı yapılandırıldı mı? (route'lar buna göre 503 döndürür.) */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function adminApp(): App {
  if (cachedApp) return cachedApp;
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

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

/**
 * İstek başlığındaki Firebase ID token'ını doğrular ve uid döndürür.
 * İstemci `Authorization: Bearer <idToken>` gönderir; sunucu kime ait olduğunu
 * SÖZE değil, imzalı token'a göre belirler (kullanıcı başkası adına işlem yapamaz).
 */
export async function istekUid(req: Request): Promise<string> {
  const baslik = req.headers.get("authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : "";
  if (!token) throw new Error("Kimlik doğrulanmadı (token yok).");
  const cozulen = await adminAuth().verifyIdToken(token);
  return cozulen.uid;
}
