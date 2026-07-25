// raysim — iyzico ödeme entegrasyonu (SUNUCU tarafı, REST + HMAC).
//
// SDK yerine doğrudan REST: harici paket bağımlılığı yok, Next 16/Turbopack ile
// sürtünme yok. İki uç kullanılır:
//   1) Checkout Form INITIALIZE → ödeme sayfası (paymentPageUrl) üretir.
//   2) Checkout Form RETRIEVE   → callback'te ödeme sonucunu (SUCCESS) doğrular.
//
// Kimlik: iyzico "IYZWSv2" HMAC-SHA256 imzası. Anahtarlar ortam değişkeninde,
// ASLA istemcide (IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL).

import crypto from "crypto";

export function isIyzicoConfigured(): boolean {
  return Boolean(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY);
}

/** GEÇİCİ TEŞHİS: anahtarların ŞEKLİNİ raporlar (değeri sızdırmaz). Sonra sil. */
export function iyzicoTeshis() {
  const apiKey = process.env.IYZICO_API_KEY?.trim() ?? "";
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim() ?? "";
  return {
    apiKeyUzunluk: apiKey.length,
    apiKeySandboxPrefix: apiKey.startsWith("sandbox-"),
    secretUzunluk: secretKey.length,
    secretSandboxPrefix: secretKey.startsWith("sandbox-"),
    base: (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").trim(),
  };
}

function anahtarlar() {
  // trim: Vercel'e yapıştırırken sona eklenen boşluk/yeni satır imzayı bozar.
  const apiKey = process.env.IYZICO_API_KEY?.trim();
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  const base = (process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com").trim();
  if (!apiKey || !secretKey) throw new Error("iyzico anahtarları tanımlı değil.");
  return { apiKey, secretKey, base };
}

/** IYZWSv2 yetkilendirme başlığı (rastgele anahtar + gövde imzası). */
function yetkiBasligi(uriPath: string, govdeJson: string, randomKey: string, apiKey: string, secretKey: string) {
  const payload = randomKey + uriPath + govdeJson;
  const signature = crypto.createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
  const authString = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return "IYZWSv2 " + Buffer.from(authString, "utf8").toString("base64");
}

async function iyzicoPost(uriPath: string, govde: Record<string, unknown>) {
  const { apiKey, secretKey, base } = anahtarlar();
  const govdeJson = JSON.stringify(govde);
  const randomKey = `${Date.now()}${crypto.randomBytes(8).toString("hex")}`;
  const yanit = await fetch(base + uriPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: yetkiBasligi(uriPath, govdeJson, randomKey, apiKey, secretKey),
      "x-iyzi-rnd": randomKey, // bazı iyzico sürümleri imza doğrulaması için bunu da ister
    },
    body: govdeJson,
  });
  return yanit.json() as Promise<Record<string, unknown>>;
}

export interface OdemeBaslatGirdi {
  conversationId: string;   // bizim ödeme kaydımızın id'si (uid'i taşımaz — güvenli)
  fiyatTl: number;
  krediAdet: number;
  callbackUrl: string;
  aliciEposta: string;
  aliciAdSoyad: string;
  aliciUid: string;
}

/** Checkout Form başlatır; ödeme sayfası URL'i döner. */
export async function odemeBaslat(g: OdemeBaslatGirdi): Promise<{ paymentPageUrl?: string; token?: string; status: string; errorMessage?: string; errorCode?: string }> {
  const fiyat = g.fiyatTl.toFixed(2);
  const [ad, ...kalan] = (g.aliciAdSoyad || "RaySim Kullanıcı").split(" ");
  const soyad = kalan.join(" ") || "-";
  const govde = {
    locale: "tr",
    conversationId: g.conversationId,
    price: fiyat,
    paidPrice: fiyat,
    currency: "TRY",
    basketId: g.conversationId,
    paymentGroup: "PRODUCT",
    callbackUrl: g.callbackUrl,
    buyer: {
      id: g.aliciUid,
      name: ad,
      surname: soyad,
      email: g.aliciEposta || "musteri@raysim.app",
      identityNumber: "11111111111",
      registrationAddress: "Konya",
      city: "Konya",
      country: "Türkiye",
      ip: "85.34.78.112",
    },
    billingAddress: { contactName: g.aliciAdSoyad || "RaySim Kullanıcı", city: "Konya", country: "Türkiye", address: "Konya" },
    basketItems: [
      { id: "kredi", name: `${g.krediAdet} RaySim kredisi`, category1: "Kredi", itemType: "VIRTUAL", price: fiyat },
    ],
  };
  const y = await iyzicoPost("/payment/iyzipos/checkoutform/initialize/auth/ecom", govde);
  return {
    paymentPageUrl: y.paymentPageUrl as string | undefined,
    token: y.token as string | undefined,
    status: (y.status as string) ?? "failure",
    errorMessage: y.errorMessage as string | undefined,
    errorCode: y.errorCode as string | undefined,
  };
}

/** Callback'te ödeme sonucunu doğrular. */
export async function odemeDogrula(token: string): Promise<{ basarili: boolean; conversationId?: string; odenenTl?: number; ham: Record<string, unknown> }> {
  const y = await iyzicoPost("/payment/iyzipos/checkoutform/auth/ecom/detail", {
    locale: "tr", token,
  });
  const basarili = y.status === "success" && y.paymentStatus === "SUCCESS";
  return {
    basarili,
    conversationId: y.conversationId as string | undefined,
    odenenTl: y.paidPrice ? Number(y.paidPrice) : undefined,
    ham: y,
  };
}
