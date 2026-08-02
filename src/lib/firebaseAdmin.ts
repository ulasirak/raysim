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
import { createRemoteJWKSet, jwtVerify } from "jose";

let cachedApp: App | null = null;

// Firebase ID token doğrulaması için Google'ın açık anahtar seti (JWKS).
// firebase-admin'in verifyIdToken'ı yerine BUNU kullanıyoruz: firebase-admin/auth
// içten jwks-rsa→jose'yi require() ile yüklüyor ve Vercel/Turbopack'ta
// ERR_REQUIRE_ESM veriyordu. jose'yi doğrudan ESM import edince sorun yok.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

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

/** Admin Auth (e-postadan uid çözmek gibi işler için). */
export async function adminAuth() {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await adminApp());
}

/**
 * İstek başlığındaki Firebase ID token'ını jose ile DOĞRUDAN doğrular; uid ve
 * (varsa) e-postayı döndürür. İstemci `Authorization: Bearer <idToken>` gönderir;
 * kimlik SÖZE değil, Google'ın imzasıyla doğrulanmış token'a göre belirlenir
 * (kullanıcı başkası adına işlem yapamaz). Kontroller: imza (JWKS), issuer, audience.
 */
export async function istekKimlik(req: Request): Promise<{ uid: string; email: string | null; emailDogrulandi: boolean }> {
  const baslik = req.headers.get("authorization") || "";
  const token = baslik.startsWith("Bearer ") ? baslik.slice(7) : "";
  if (!token) throw new Error("Kimlik doğrulanmadı (token yok).");

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Proje kimliği (NEXT_PUBLIC_FIREBASE_PROJECT_ID) tanımlı değil.");

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub) throw new Error("Token'da kullanıcı kimliği (sub) yok.");
  // email_verified: Firebase e-posta/şifre kaydı e-postayı DOĞRULAMAZ. Ücret
  // muafiyeti gibi hassas kapılar bu bayrağı kontrol etmeli (aksi halde saldırgan
  // kayıtsız bir yönetici e-postasıyla kayıt olup muafiyet kazanabilir). E-posta
  // yine döner (ör. iyzico alıcı bilgisi için) ama "doğrulandı" bilgisi ayrı.
  return {
    uid: payload.sub,
    email: (payload.email as string | undefined) ?? null,
    emailDogrulandi: payload.email_verified === true,
  };
}

/** Geriye dönük uyumluluk: yalnız uid gerekiyorsa. */
export async function istekUid(req: Request): Promise<string> {
  return (await istekKimlik(req)).uid;
}
