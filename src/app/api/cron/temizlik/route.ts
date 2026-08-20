// raysim — PERİYODİK TEMİZLİK (Vercel Cron).
//
// İki artık veri türünü toplar:
//   1) ÖRHAN ÖDEME KAYITLARI: initialize edilip callback'i hiç gelmeyen (kullanıcı
//      ödeme sayfasını kapattı) `odeme` dokümanları "beklemede" durumunda sonsuza
//      dek kalıyordu. 24 saatten eski bekleyenler silinir. (Tamamlanan ödemelerin
//      denetim izi ayrı `odemeOlay` koleksiyonundadır — buradan silinmez.)
//   2) ESKİ ORAN-SINIRI SAYAÇLARI: `hiz/{anahtar}` dokümanları pencere dolunca
//      işlevsiz kalır; 1 günden eski olanlar silinir (koleksiyon şişmesin).
//
// GÜVENLİK: Vercel Cron isteği `Authorization: Bearer <CRON_SECRET>` gönderir.
// CRON_SECRET tanımlıysa eşleşmeyen istek 401 alır (uç herkese açık olamaz).
// Tanımlı değilse (yerel geliştirme) çalışır ama uyarı loglanır.
//
// Zamanlama vercel.json `crons` alanında (günde bir). Admin SDK kuralları baypas
// eder; sorgular tekil-alan aralığı kullanır → elle bileşik dizin gerekmez.

import { NextResponse } from "next/server";
import { isAdminConfigured, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUN_MS = 24 * 60 * 60 * 1000;
const YIGIN_SINIRI = 400; // tek koşuda silinecek azami doküman (batch güvenli sınırı)

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const baslik = req.headers.get("authorization") || "";
  if (secret) {
    if (baslik !== `Bearer ${secret}`) {
      return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });
    }
  } else {
    console.warn("[cron/temizlik] CRON_SECRET tanımlı değil — uç korumasız çalışıyor.");
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  }

  const db = await adminDb();
  const { Timestamp } = await import("firebase-admin/firestore");
  const simdi = Date.now();

  let odemeSilinen = 0;
  let hizSilinen = 0;

  // 1) Örhan (bekleyen) ödeme kayıtları — 24 saatten eski.
  // Tekil-alan aralığı (olusturma < eşik) otomatik indeksli; "beklemede" filtresi
  // kodda yapılır → bileşik dizin kurulumu gerekmez.
  try {
    const esik = Timestamp.fromMillis(simdi - GUN_MS);
    const snap = await db
      .collection("odeme")
      .where("olusturma", "<", esik)
      .limit(YIGIN_SINIRI)
      .get();
    const batch = db.batch();
    snap.docs.forEach((d) => {
      if ((d.data()?.durum ?? "beklemede") === "beklemede") {
        batch.delete(d.ref);
        odemeSilinen += 1;
      }
    });
    if (odemeSilinen > 0) await batch.commit();
  } catch (e) {
    console.warn("[cron/temizlik] odeme temizliği hatası:", e instanceof Error ? e.message : e);
  }

  // 2) Eski oran-sınırı sayaçları — 1 günden eski.
  try {
    const esik = Timestamp.fromMillis(simdi - GUN_MS);
    const snap = await db
      .collection("hiz")
      .where("guncelleme", "<", esik)
      .limit(YIGIN_SINIRI)
      .get();
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      hizSilinen = snap.size;
      await batch.commit();
    }
  } catch (e) {
    console.warn("[cron/temizlik] hiz temizliği hatası:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ odemeSilinen, hizSilinen });
}
