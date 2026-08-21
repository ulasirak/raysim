// raysim — HAZIR KONYA HATLARINI seed et (yönetici · sunucu · idempotent).
//
// Üç gerçek Konya tramvay hattını (Mevcut T1 · 1. Etap · 2. Etap) yönetici
// hesabına, ücret düşmeden, Admin SDK ile ekler. Sabit doküman kimliği
// (`hazir_<key>_<uid>`) sayesinde tekrar çağrılsa da çift oluşmaz ve mevcut
// (kullanıcının düzenlediği) veriyi EZMEZ.
//
// YETKİ: Yalnız yönetici. Muafiyet mantığı rapor/ücret kapısıyla aynı — uid
// allowlist (YONETICI_UIDLER) VEYA DOĞRULANMIŞ yönetici e-postası. Sıradan
// kullanıcı çağırırsa 403; kimliksiz 401.

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { hizSiniri } from "@/lib/rateLimit";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { VERI_BAYT_SINIRI } from "@/lib/projeler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  }

  let uid: string;
  let yetkili: boolean;
  try {
    const k = await istekKimlik(req);
    uid = k.uid;
    yetkili = yoneticiUidMi(k.uid) || (k.emailDogrulandi && yoneticiMi(k.email));
  } catch {
    return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 });
  }
  if (!yetkili) {
    return NextResponse.json({ hata: "Bu işlem yalnız yöneticiye açıktır." }, { status: 403 });
  }

  const hiz = await hizSiniri(`projehazir:${uid}`, 5, 300);
  if (!hiz.izin) {
    return NextResponse.json(
      { hata: "Çok fazla istek — lütfen biraz bekleyin.", sifirlaSn: hiz.sifirlaSn },
      { status: 429 },
    );
  }

  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");

  const olusan: { key: string; id: string; yeni: boolean }[] = [];
  try {
    for (const hat of hazirHatlar()) {
      const veriJson = JSON.stringify(hat.veri);
      if (new TextEncoder().encode(veriJson).length > VERI_BAYT_SINIRI) {
        return NextResponse.json({ hata: `Hat verisi çok büyük: ${hat.key}` }, { status: 400 });
      }
      const id = `hazir_${hat.key}_${uid}`;
      const ref = db.collection("projeler").doc(id);
      const yeni = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return false; // idempotent — kullanıcının düzenlediği veriyi ezme
        tx.set(ref, {
          sahipUid: uid, ad: hat.ad, veri: veriJson, paylasim: { acik: false },
          olusturma: FieldValue.serverTimestamp(), guncelleme: FieldValue.serverTimestamp(),
        });
        return true;
      });
      olusan.push({ key: hat.key, id, yeni });
    }
    return NextResponse.json({ hatlar: olusan });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
