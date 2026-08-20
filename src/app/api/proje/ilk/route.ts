// raysim — YENİ HESABIN İLK HATTI (ücretsiz, sunucuda seed).
//
// Eskiden ilk proje İSTEMCİDEN doğrudan Firestore'a yazılıyordu (`ilk_<uid>`
// setDoc). Bu, `projeler` create kuralının istemciye açık olmasını gerektiriyordu;
// açık kural ise kötü niyetli kullanıcının /api/proje/olustur ücretlendirmesini
// baypas edip SINIRSIZ ücretsiz proje açmasına kapı bırakıyordu. İlk projeyi de
// Admin SDK ile burada üretip create kuralını tamamen kapatabiliyoruz.
//
// Ücretsizdir (ilk hat), idempotenttir (doküman kimliği = ilk_<uid>, varsa dokunmaz)
// ve kimliği imzalı token'dan alır — kullanıcı başkası adına seed açamaz.

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { hizSiniri } from "@/lib/rateLimit";
import { VERI_BAYT_SINIRI } from "@/lib/projeler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  }

  let uid: string;
  try { const k = await istekKimlik(req); uid = k.uid; }
  catch { return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 }); }

  // Kötüye kullanım freni: ilk-hat seed'i normalde hesap başına bir kez çağrılır.
  const hiz = await hizSiniri(`projeilk:${uid}`, 10, 300);
  if (!hiz.izin) {
    return NextResponse.json(
      { hata: "Çok fazla istek — lütfen biraz bekleyin.", sifirlaSn: hiz.sifirlaSn },
      { status: 429 },
    );
  }

  let govde: { ad?: string; veriJson?: string };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const ad = (govde.ad || "İlk hattım").toString().trim().slice(0, 120) || "İlk hattım";
  const veriJson = typeof govde.veriJson === "string" ? govde.veriJson : "";
  // Boyut kuralı firestore.rules ile aynı sınır (VERI_BAYT_SINIRI). Byte cinsinden ölç.
  if (!veriJson || new TextEncoder().encode(veriJson).length > VERI_BAYT_SINIRI) {
    return NextResponse.json({ hata: "Geçersiz proje verisi." }, { status: 400 });
  }

  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");
  const id = `ilk_${uid}`;
  const ref = db.collection("projeler").doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return; // zaten var → mevcut veriyi EZME (idempotent, yarış-güvenli)
      tx.set(ref, {
        sahipUid: uid, ad, veri: veriJson, paylasim: { acik: false },
        olusturma: FieldValue.serverTimestamp(), guncelleme: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
