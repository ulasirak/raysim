// raysim — DAĞITIK ORAN SINIRI (Firestore-destekli).
//
// Serverless'ta bellek-içi sayaç İŞE YARAMAZ: her istek ayrı (ya da yeni) bir
// işlev örneğine düşebilir, dolayısıyla süreç-yerel sayaç bir saldırganı
// durduramaz. Bu yüzden sayaç MERKEZİ Firestore'da tutulur (`hiz/{anahtar}`) ve
// her çağrı bir transaction içinde okuyup artırır — tüm örnekler aynı sayacı
// paylaşır.
//
// Bu bir GÜVENLİK sınırı değil, KÖTÜYE KULLANIM/DoS frenidir: gerçek yetki
// imzalı token + atomik kredi düşme ile sağlanır. Bu yüzden altyapı hatasında
// FAIL-OPEN olur (meşru/ödeme yapan kullanıcıyı bir Firestore kesintisi yüzünden
// bloklamak, sınırı aşmasına izin vermekten daha kötü).
//
// Sabit-pencere modeli: pencere başlangıcından `pencereSn` saniye geçince sayaç
// sıfırlanır. Eski `hiz` dokümanları cron'la temizlenir (bkz. /api/cron/temizlik).

import { adminDb } from "./firebaseAdmin";

export interface HizSonuc {
  /** İsteğe izin verildi mi? */
  izin: boolean;
  /** Bu pencerede kalan istek hakkı. */
  kalan: number;
  /** Pencerenin sıfırlanmasına kalan saniye (429 mesajında kullanılır). */
  sifirlaSn: number;
}

/**
 * `anahtar` için oran sınırını uygular ve sonucu döndürür. `anahtar` çağrı yerine
 * özgü olmalı (ör. `rapor:<uid>`) ki farklı uçlar birbirini tüketmesin.
 * Altyapı hatasında izin verir (fail-open) — sınır bir fren, güvenlik değil.
 */
export async function hizSiniri(anahtar: string, limit: number, pencereSn: number): Promise<HizSonuc> {
  const pencereMs = pencereSn * 1000;
  const simdi = Date.now();
  try {
    const db = await adminDb();
    const { FieldValue } = await import("firebase-admin/firestore");
    const ref = db.collection("hiz").doc(anahtar);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? (snap.data() as { sayac?: number; baslangic?: number }) : null;
      let sayac = d?.sayac ?? 0;
      let baslangic = d?.baslangic ?? simdi;
      // Pencere doldu → sıfırla.
      if (simdi - baslangic >= pencereMs) {
        sayac = 0;
        baslangic = simdi;
      }
      sayac += 1;
      const izin = sayac <= limit;
      tx.set(ref, { sayac, baslangic, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
      const sifirlaSn = Math.max(0, Math.ceil((baslangic + pencereMs - simdi) / 1000));
      return { izin, kalan: Math.max(0, limit - sayac), sifirlaSn };
    });
  } catch (e) {
    // FAIL-OPEN: sayaç okunamadı/yazılamadı → meşru kullanıcıyı bloklama.
    console.warn(`[hizSiniri] atlandı (${anahtar}):`, e instanceof Error ? e.message : e);
    return { izin: true, kalan: limit, sifirlaSn: 0 };
  }
}
