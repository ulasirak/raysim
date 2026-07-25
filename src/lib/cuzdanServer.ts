// raysim — KREDİ CÜZDANI (SUNUCU tarafı, Admin SDK).
//
// Para bağlı TÜM yazmalar burada ve YALNIZ burada. Her işlem bir Firestore
// TRANSACTION'ı içinde: bakiye okunur, kontrol edilir, güncellenir ve aynı anda
// bir denetim hareketi (krediHareket) yazılır — böylece eşzamanlı iki istek
// bakiyeyi bozamaz (çift harcama / çift ekleme olmaz).
//
// firebase-admin/firestore LAZY DİNAMİK import edilir (FieldValue dahil): statik
// import Vercel serverless'ta modül yüklerken 500 veriyordu (bkz. firebaseAdmin.ts).
//
// İstemci buraya erişemez; yalnız API route'ları (kimliği doğrulanmış) çağırır.

import { adminDb } from "./firebaseAdmin";
import type { HareketTuru } from "./cuzdan";

/** FieldValue'yu dinamik yükler (statik import 500 veriyordu). */
async function alanDegeri() {
  const { FieldValue } = await import("firebase-admin/firestore");
  return FieldValue;
}

/** Bekleyen ödeme kaydı — initialize sırasında yazılır, callback'te okunur. */
export interface OdemeKaydi {
  uid: string;
  kredi: number;
  tl: number;
  durum: "beklemede" | "tamam" | "basarisiz";
}

export async function odemeKaydiOlustur(id: string, k: OdemeKaydi): Promise<void> {
  const db = await adminDb();
  const FieldValue = await alanDegeri();
  await db.collection("odeme").doc(id).set({ ...k, olusturma: FieldValue.serverTimestamp() });
}

export async function odemeKaydiGetir(id: string): Promise<OdemeKaydi | null> {
  const db = await adminDb();
  const snap = await db.collection("odeme").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  return { uid: String(d.uid), kredi: Number(d.kredi), tl: Number(d.tl), durum: (d.durum as OdemeKaydi["durum"]) ?? "beklemede" };
}

export async function odemeKaydiDurum(id: string, durum: OdemeKaydi["durum"]): Promise<void> {
  const db = await adminDb();
  const FieldValue = await alanDegeri();
  await db.collection("odeme").doc(id).set({ durum, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
}

export class KrediYetersizError extends Error {
  constructor(public gereken: number, public mevcut: number) {
    super(`Yetersiz kredi: ${gereken} gerekli, ${mevcut} mevcut.`);
    this.name = "KrediYetersizError";
  }
}

interface HareketDetay {
  tur: HareketTuru;
  ref?: string;
}

/** Güncel bakiye (cüzdan yoksa 0). Sunucu içi kullanım. */
export async function bakiyeOku(uid: string): Promise<number> {
  const db = await adminDb();
  const snap = await db.collection("cuzdan").doc(uid).get();
  return snap.exists ? Number(snap.data()?.bakiye ?? 0) : 0;
}

/**
 * Krediyi ATOMİK düşer ve hareket yazar. Bakiye yetersizse hiçbir şey yazmaz,
 * KrediYetersizError fırlatır. Dönüş: işlem sonrası bakiye.
 */
export async function krediDus(uid: string, miktar: number, detay: HareketDetay): Promise<number> {
  if (miktar <= 0) throw new Error("Düşülecek miktar pozitif olmalı.");
  const db = await adminDb();
  const FieldValue = await alanDegeri();
  return db.runTransaction(async (tx) => {
    const ref = db.collection("cuzdan").doc(uid);
    const snap = await tx.get(ref);
    const mevcut = snap.exists ? Number(snap.data()?.bakiye ?? 0) : 0;
    if (mevcut < miktar) throw new KrediYetersizError(miktar, mevcut);
    const sonra = mevcut - miktar;

    tx.set(ref, { bakiye: sonra, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.collection("krediHareket").doc(), {
      uid, tur: detay.tur, miktar: -miktar, bakiyeSonra: sonra,
      ...(detay.ref ? { ref: detay.ref } : {}),
      olusturma: FieldValue.serverTimestamp(),
    });
    return sonra;
  });
}

/**
 * Kredi EKLER (satın alma) — İDEMPOTENT. `odemeId` daha önce işlendiyse tekrar
 * eklemez (webhook iki kez gelse bile kredi bir kez yüklenir). Dönüş: bakiye.
 */
export async function krediEkle(
  uid: string,
  miktar: number,
  odemeId: string,
  detay: HareketDetay = { tur: "satinalma" },
): Promise<number> {
  if (miktar <= 0) throw new Error("Eklenecek miktar pozitif olmalı.");
  const db = await adminDb();
  const FieldValue = await alanDegeri();
  return db.runTransaction(async (tx) => {
    // İdempotency kilidi: odemeOlay/{odemeId} zaten varsa bu ödeme işlenmiş demektir.
    const olayRef = db.collection("odemeOlay").doc(odemeId);
    const olay = await tx.get(olayRef);

    const ref = db.collection("cuzdan").doc(uid);
    const snap = await tx.get(ref);
    const mevcut = snap.exists ? Number(snap.data()?.bakiye ?? 0) : 0;

    if (olay.exists) return mevcut; // zaten işlenmiş — tekrar ekleme

    const sonra = mevcut + miktar;
    tx.set(ref, { bakiye: sonra, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(olayRef, {
      uid, miktar, ref: detay.ref ?? odemeId, olusturma: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection("krediHareket").doc(), {
      uid, tur: detay.tur, miktar, bakiyeSonra: sonra,
      ref: detay.ref ?? odemeId,
      olusturma: FieldValue.serverTimestamp(),
    });
    return sonra;
  });
}
