// raysim — KREDİ SATIN ALMA başlatma (iyzico Checkout Form).
//
// İstemci bir paket seçer; sunucu ödeme kaydını oluşturur ve iyzico ödeme
// sayfasının URL'ini döndürür. Fiyat SUNUCUDA sabittir (paketBul) — istemci
// tutar yollayamaz. Kimlik imzalı token'dan gelir.

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured } from "@/lib/firebaseAdmin";
import { odemeKaydiOlustur, kartAnahtariGetir } from "@/lib/cuzdanServer";
import { isIyzicoConfigured, odemeBaslat } from "@/lib/iyzico";
import { paketBul, guvenliDonusYolu } from "@/lib/cuzdan";
import crypto from "crypto";

export async function POST(req: Request) {
  if (!isAdminConfigured() || !isIyzicoConfigured()) {
    return NextResponse.json({ hata: "Ödeme altyapısı henüz yapılandırılmadı (sunucu anahtarları eksik)." }, { status: 503 });
  }

  let uid: string;
  let eposta = "";
  try { const k = await istekKimlik(req); uid = k.uid; eposta = k.email ?? ""; }
  catch { return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 }); }

  let govde: { paketId?: string; donusYolu?: string };
  try { govde = await req.json(); }
  catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const paket = paketBul(govde.paketId ?? "");
  if (!paket) return NextResponse.json({ hata: "Geçersiz paket." }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const conversationId = crypto.randomUUID();
  const donusYolu = guvenliDonusYolu(govde.donusYolu); // ödemeye başlanan sayfaya dön
  // Alıcı e-postası imzalı token'dan gelir (istemciye güvenmeden).

  await odemeKaydiOlustur(conversationId, { uid, kredi: paket.kredi, tl: paket.tl, durum: "beklemede", donusYolu });

  // Kullanıcının kayıtlı kartı varsa ödeme formunda çıkması için anahtarı ekle.
  const cardUserKey = (await kartAnahtariGetir(uid)) ?? undefined;

  try {
    const sonuc = await odemeBaslat({
      conversationId,
      fiyatTl: paket.tl,
      krediAdet: paket.kredi,
      callbackUrl: `${siteUrl}/api/odeme/callback`,
      aliciEposta: eposta,
      aliciAdSoyad: eposta ? eposta.split("@")[0] : "RaySim Kullanıcı",
      aliciUid: uid,
      cardUserKey,
    });
    if (sonuc.status !== "success" || (!sonuc.checkoutFormContent && !sonuc.paymentPageUrl)) {
      return NextResponse.json(
        { hata: `Ödeme başlatılamadı: ${sonuc.errorMessage ?? "bilinmeyen hata"}` },
        { status: 502 },
      );
    }
    // İçerik = modal-içi gömme (site içinde kalır); odemeUrl = yedek (yeni sekme).
    return NextResponse.json({ icerik: sonuc.checkoutFormContent, odemeUrl: sonuc.paymentPageUrl });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : "Ödeme hatası." }, { status: 500 });
  }
}
