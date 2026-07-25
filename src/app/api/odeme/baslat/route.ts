// raysim — KREDİ SATIN ALMA başlatma (iyzico Checkout Form).
//
// İstemci bir paket seçer; sunucu ödeme kaydını oluşturur ve iyzico ödeme
// sayfasının URL'ini döndürür. Fiyat SUNUCUDA sabittir (paketBul) — istemci
// tutar yollayamaz. Kimlik imzalı token'dan gelir.

import { NextResponse } from "next/server";
import { istekUid, isAdminConfigured, adminAuth } from "@/lib/firebaseAdmin";
import { odemeKaydiOlustur } from "@/lib/cuzdanServer";
import { isIyzicoConfigured, odemeBaslat } from "@/lib/iyzico";
import { paketBul } from "@/lib/cuzdan";
import crypto from "crypto";

export async function POST(req: Request) {
  if (!isAdminConfigured() || !isIyzicoConfigured()) {
    return NextResponse.json({ hata: "Ödeme altyapısı henüz yapılandırılmadı (sunucu anahtarları eksik)." }, { status: 503 });
  }

  let uid: string;
  try { uid = await istekUid(req); }
  catch (e) { return NextResponse.json({ hata: "Kimlik doğrulanamadı: " + (e instanceof Error ? e.message : String(e)) }, { status: 401 }); }

  let govde: { paketId?: string };
  try { govde = await req.json(); }
  catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const paket = paketBul(govde.paketId ?? "");
  if (!paket) return NextResponse.json({ hata: "Geçersiz paket." }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const conversationId = crypto.randomUUID();

  // Alıcı e-postası imzalı hesaptan (istemciye güvenmeden).
  let eposta = "";
  try { eposta = (await (await adminAuth()).getUser(uid)).email ?? ""; } catch { /* opsiyonel */ }

  await odemeKaydiOlustur(conversationId, { uid, kredi: paket.kredi, tl: paket.tl, durum: "beklemede" });

  try {
    const sonuc = await odemeBaslat({
      conversationId,
      fiyatTl: paket.tl,
      krediAdet: paket.kredi,
      callbackUrl: `${siteUrl}/api/odeme/callback`,
      aliciEposta: eposta,
      aliciAdSoyad: eposta ? eposta.split("@")[0] : "RaySim Kullanıcı",
      aliciUid: uid,
    });
    if (sonuc.status !== "success" || !sonuc.paymentPageUrl) {
      return NextResponse.json({ hata: sonuc.errorMessage ?? "iyzico ödeme başlatılamadı." }, { status: 502 });
    }
    return NextResponse.json({ odemeUrl: sonuc.paymentPageUrl });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : "Ödeme hatası." }, { status: 500 });
  }
}
