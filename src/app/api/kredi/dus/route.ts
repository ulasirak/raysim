// raysim — KREDİ DÜŞME (ücretli eylem kapısı).
//
// İstemci, bir RAPOR üretmeden veya PROJE yüklemeden ÖNCE bunu çağırır. Kimlik
// imzalı Firebase token'ından doğrulanır (kullanıcı başkası adına harcayamaz),
// bedel SUNUCUDA sabittir (istemci fiyat yollayamaz) ve düşme atomiktir.
//
// Not: rapor içeriği şu an istemcide üretiliyor; tam güvenlik için ileride rapor
// da sunucuda üretilip imzalı linkle verilecek (o zaman düşme + üretim tek
// işlemde birleşir). Bu route o geçişte de kapı olarak kalır.

import { NextResponse } from "next/server";
import { istekUid, isAdminConfigured } from "@/lib/firebaseAdmin";
import { krediDus, KrediYetersizError } from "@/lib/cuzdanServer";
import { KREDI_BEDELI, type KrediEylemi } from "@/lib/cuzdan";

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { hata: "Ödeme/kredi altyapısı henüz yapılandırılmadı (FIREBASE_SERVICE_ACCOUNT eksik)." },
      { status: 503 },
    );
  }

  let uid: string;
  try {
    uid = await istekUid(req);
  } catch {
    return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 });
  }

  let govde: { eylem?: string; ref?: string };
  try {
    govde = await req.json();
  } catch {
    return NextResponse.json({ hata: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const eylem = govde.eylem as KrediEylemi;
  const bedel = KREDI_BEDELI[eylem];
  if (!bedel) {
    return NextResponse.json({ hata: "Bilinmeyen eylem." }, { status: 400 });
  }

  try {
    const bakiye = await krediDus(uid, bedel, { tur: eylem, ref: govde.ref });
    return NextResponse.json({ tamam: true, dusulen: bedel, bakiye });
  } catch (e) {
    if (e instanceof KrediYetersizError) {
      return NextResponse.json(
        { hata: "yetersiz_kredi", gereken: e.gereken, mevcut: e.mevcut },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { hata: e instanceof Error ? e.message : "Bilinmeyen hata." },
      { status: 500 },
    );
  }
}
