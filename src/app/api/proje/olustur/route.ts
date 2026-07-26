// raysim — YENİ HAT (proje) oluşturma, ATOMİK ücretlendirmeyle.
//
// Kredi düşme ile proje oluşturmayı TEK Firestore transaction'ında yapar: kredi
// yetersizse proje açılmaz, proje açılırsa kredi kesin düşer (ikisi bir arada
// olur ya da hiçbiri). Eskiden kredi sunucuda düşülüp proje istemcide açılıyordu;
// arada kopma olursa kredi gidip hat açılmayabiliyordu.
//
// Kimlik imzalı token'dan; bedel sunucuda sabit; yönetici muaf.

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { KREDI_BEDELI } from "@/lib/cuzdan";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { varsayilanConfig, varsayilanMeta } from "@/lib/anaray/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  }

  let uid: string;
  let yonetici: boolean;
  try {
    const k = await istekKimlik(req);
    uid = k.uid;
    // Ücret muafiyeti: uid allowlist VEYA DOĞRULANMIŞ yönetici e-postası.
    yonetici = yoneticiUidMi(k.uid) || (k.emailDogrulandi && yoneticiMi(k.email));
  }
  catch { return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 }); }

  let govde: { ad?: string };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const ad = (govde.ad || "Yeni hat").toString().trim().slice(0, 120) || "Yeni hat";
  const bedel = KREDI_BEDELI.projeYukleme;
  const bosVeriJson = JSON.stringify({ rings: [], cfg: varsayilanConfig, meta: varsayilanMeta });

  const db = await adminDb();
  const { FieldValue } = await import("firebase-admin/firestore");

  try {
    const id = await db.runTransaction(async (tx) => {
      const cuzdanRef = db.collection("cuzdan").doc(uid);
      let bakiye = 0;
      if (!yonetici) {
        const snap = await tx.get(cuzdanRef);
        bakiye = snap.exists ? Number(snap.data()?.bakiye ?? 0) : 0;
        if (bakiye < bedel) throw new Error(`yetersiz:${bedel}:${bakiye}`);
      }

      const projeRef = db.collection("projeler").doc();
      tx.set(projeRef, {
        sahipUid: uid, ad, veri: bosVeriJson, paylasim: { acik: false },
        olusturma: FieldValue.serverTimestamp(), guncelleme: FieldValue.serverTimestamp(),
      });

      if (!yonetici) {
        const sonra = bakiye - bedel;
        tx.set(cuzdanRef, { bakiye: sonra, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.collection("krediHareket").doc(), {
          uid, tur: "projeYukleme", miktar: -bedel, bakiyeSonra: sonra, ref: projeRef.id,
          olusturma: FieldValue.serverTimestamp(),
        });
      }
      return projeRef.id;
    });
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("yetersiz:")) {
      const [, g, m] = msg.split(":");
      return NextResponse.json({ hata: "yetersiz_kredi", gereken: Number(g), mevcut: Number(m) }, { status: 402 });
    }
    return NextResponse.json({ hata: msg }, { status: 500 });
  }
}
