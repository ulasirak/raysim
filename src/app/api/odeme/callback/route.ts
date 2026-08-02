// raysim — KREDİ SATIN ALMA geri dönüşü (iyzico callback).
//
// iyzico ödeme sonucunu buraya form-POST eder (token). Sunucu token'ı iyzico'ya
// SORARAK doğrular (istemciye güvenmez), ödeme kaydıyla tutarı eşleştirir ve
// başarılıysa krediyi ATOMİK + İDEMPOTENT ekler (webhook çift gelse tek yükleme).
// Sonuçta kullanıcı ana sayfaya durum parametresiyle yönlendirilir.

import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/firebaseAdmin";
import { odemeDogrula } from "@/lib/iyzico";
import { odemeKaydiGetir, odemeKaydiDurum, krediEkle, kartAnahtariKaydet } from "@/lib/cuzdanServer";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
// 303: POST callback'ten GET sayfaya güvenli geçiş. `yol` = ödemeye başlanan
// site-içi yol (sanitize edilmiş); `?odeme=` durumu eklenir, varsa #hash korunur.
function yonlendir(durum: "basarili" | "hata", yol = "/") {
  const [path, hash] = (yol || "/").split("#");
  const url = `${siteUrl()}${path || "/"}?odeme=${durum}${hash ? "#" + hash : ""}`;
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  if (!isAdminConfigured()) return yonlendir("hata");

  // iyzico form-encoded gönderir: token
  let token = "";
  try {
    const form = await req.formData();
    token = String(form.get("token") ?? "");
  } catch {
    try { token = String((await req.json())?.token ?? ""); } catch { /* yok */ }
  }
  if (!token) return yonlendir("hata");

  try {
    const dogrulama = await odemeDogrula(token);
    if (!dogrulama.basarili || !dogrulama.conversationId) return yonlendir("hata");

    const kayit = await odemeKaydiGetir(dogrulama.conversationId);
    if (!kayit) return yonlendir("hata");
    const yol = kayit.donusYolu ?? "/"; // kullanıcı ödemeye hangi sayfadan başladıysa oraya dön

    // Tutar doğrulama: iyzico'nun bildirdiği ödenen tutar, kayıtlı fiyatla eşleşmeli.
    // FAIL-CLOSED: başarı yanıtında paidPrice hiç gelmediyse (odenenTl == null) tutar
    // doğrulanamaz → krediyi YÜKLEME. Aksi halde yanlış/eksik tutarla kredi yüklenebilirdi.
    if (dogrulama.odenenTl == null || Math.abs(dogrulama.odenenTl - kayit.tl) > 0.01) {
      await odemeKaydiDurum(dogrulama.conversationId, "basarisiz");
      return yonlendir("hata", yol);
    }
    // Para birimi güvencesi: initialize TRY zorlar; retrieve TRY dışı bildirirse
    // (sayısal eşit ama farklı birim) krediyi YÜKLEME. Birim yoksa tutar+TRY-init
    // yeterli sayılır (eski kayıtları bozmamak için fail-closed değil).
    if (dogrulama.paraBirimi && dogrulama.paraBirimi !== "TRY") {
      await odemeKaydiDurum(dogrulama.conversationId, "basarisiz");
      return yonlendir("hata", yol);
    }

    // İdempotent: krediEkle odemeOlay/{conversationId} ile çift eklemeyi önler.
    await krediEkle(kayit.uid, kayit.kredi, dogrulama.conversationId, { tur: "satinalma", ref: dogrulama.conversationId });
    await odemeKaydiDurum(dogrulama.conversationId, "tamam");

    // Kullanıcı "kartımı sakla" seçtiyse anahtarını kaydet — sonraki ödemelerde
    // kart formda hazır gelir (kart bilgisi bizde DEĞİL, iyzico'da durur).
    if (dogrulama.cardUserKey) {
      try { await kartAnahtariKaydet(kayit.uid, dogrulama.cardUserKey); } catch { /* opsiyonel */ }
    }
    return yonlendir("basarili", yol);
  } catch {
    return yonlendir("hata");
  }
}
