// raysim — YÖNETİCİ test kredisi ekleme (yalnız yönetici).
//
// Yönetici, kendi hesabına test amaçlı kredi ekler (ödeme akışını denemek için).
// Yalnız DOĞRULANMIŞ yönetici e-postası / uid allowlist geçebilir; başkası 403.
// Runtime'da FIREBASE_SERVICE_ACCOUNT ile çalışır (idempotent değil — her çağrı ekler).

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured } from "@/lib/firebaseAdmin";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { krediEkle } from "@/lib/cuzdanServer";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });

  let uid: string;
  let muaf: boolean;
  try {
    const k = await istekKimlik(req);
    uid = k.uid;
    muaf = yoneticiUidMi(k.uid) || (k.emailDogrulandi && yoneticiMi(k.email));
  } catch {
    return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 });
  }
  if (!muaf) return NextResponse.json({ hata: "Yalnız yönetici test kredisi ekleyebilir." }, { status: 403 });

  let govde: { miktar?: number };
  try { govde = await req.json(); } catch { govde = {}; }
  const miktar = Math.min(100000, Math.max(1, Math.round(Number(govde.miktar) || 1000)));

  try {
    const bakiye = await krediEkle(uid, miktar, `admin_${crypto.randomUUID()}`, { tur: "duzeltme", ref: "admin-test" });
    return NextResponse.json({ bakiye, eklenen: miktar });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : "Kredi eklenemedi." }, { status: 500 });
  }
}
