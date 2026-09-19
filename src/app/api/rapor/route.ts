// raysim — PDF RAPORU sunucuda üret + ücretlendir.
//
// Rapor HTML'i SUNUCUDA üretilir ve kredi SUNUCUDA düşülür; istemci ikisini de
// atlayamaz (eskiden rapor istemcide üretiliyor, kredi istemci-kapılıydı → kod
// okunup kredisiz rapor üretilebiliyordu). İstemci dönen HTML'i yeni sekmede
// açıp yazdırır (PDF). Kimlik imzalı token'dan; bedel sabit; yönetici muaf.
//
// Sıra: önce rapor üretilir (başarısızsa kredi düşülmez), sonra kredi düşülür,
// sonra HTML döner.

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured } from "@/lib/firebaseAdmin";
import { krediDus, krediBakiye, KrediYetersizError } from "@/lib/cuzdanServer";
import { hizSiniri } from "@/lib/rateLimit";
import { raporKredi, RAPOR_BOLUMLER, type RaporSecim } from "@/lib/raporFiyat";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { raporHTML, type RaporDil } from "@/lib/anaray/rapor";
import { saglamArac, saglamCfg, saglamIsletme } from "@/lib/anaray/saglamGirdi";
import { varsayilanMeta, type SimConfig, type ProjeMeta, type Isletme } from "@/lib/anaray/config";
import type { DurakArasiRing, Sube } from "@/lib/anaray/ring";
import type { RollingStock } from "@/lib/anaray/types";

export const runtime = "nodejs";
// Patolojik istemci girdisine karşı sert üst sınır: tek rapor isteği fonksiyon
// penceresini (varsayılan 300 s) tüketemesin (DoS freni; motor içi iterasyon
// kapları + saglamGirdi kıskacı ile birlikte savunma katmanı).
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  }

  let uid: string;
  let muaf: boolean;
  try {
    const k = await istekKimlik(req);
    uid = k.uid;
    // Ücret muafiyeti: uid allowlist VEYA DOĞRULANMIŞ yönetici e-postası.
    // Doğrulanmamış e-posta muafiyet kazandırmaz (bkz. firebaseAdmin.istekKimlik).
    muaf = yoneticiUidMi(k.uid) || (k.emailDogrulandi && yoneticiMi(k.email));
  }
  catch { return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 }); }

  // Kötüye kullanım freni: pahalı rapor üretimini kullanıcı başına sınırla.
  const hiz = await hizSiniri(`rapor:${uid}`, 20, 300, true); // ücretli+ağır → fail-closed
  if (!hiz.izin) {
    return NextResponse.json(
      { hata: "Çok fazla rapor isteği — lütfen biraz bekleyin.", sifirlaSn: hiz.sifirlaSn },
      { status: 429 },
    );
  }

  let govde: { veri?: { rings?: DurakArasiRing[]; cfg?: Partial<SimConfig>; meta?: Partial<ProjeMeta>; arac?: RollingStock; turnaroundSn?: number; filo?: number; isletme?: Partial<Isletme>; qrUrl?: string; subeler?: Sube[] }; dil?: string; secim?: Record<string, unknown> };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const rings = govde.veri?.rings;
  if (!Array.isArray(rings) || rings.length === 0) {
    return NextResponse.json({ hata: "Rapor için hat (ring) verisi gerekli." }, { status: 400 });
  }
  // Kötüye kullanım freni: aşırı büyük ring dizisi rapor üretimini (CPU/bellek) ücret
  // düşülmeden şişirebilir. Gerçek hatlar ~onlarca ring; 1000 fazlasıyla cömert.
  if (rings.length > 1000) {
    return NextResponse.json({ hata: "Hat verisi çok büyük (en çok 1000 ring)." }, { status: 413 });
  }
  // cfg İSTEMCİDEN gelir → sayısal alanları güvenli aralığa kıskaçla (araç gibi). Bozuk/
  // NaN/negatif cfg değeri simülasyonu kilitleyebilir (0-hız stall) ya da rapora NaN/negatif
  // sayı yazabilir. Fail-safe: her sayısal alan finite'e, hızlar/genişlikler > 0'a çekilir.
  const cfg: SimConfig = saglamCfg(govde.veri?.cfg);
  const meta: ProjeMeta = { ...varsayilanMeta, ...(govde.veri?.meta ?? {}) };
  // Araç girdisi İSTEMCİDEN gelir → güvenli aralığa kıskaçla: bozuk/negatif/NaN
  // alanlar simülasyonu kilitleyebilir (stall) veya rapora NaN yazabilir. Fail-safe.
  const arac: RollingStock = saglamArac(govde.veri?.arac);
  const dil: RaporDil = govde.dil === "en" ? "en" : "tr";
  // Dönüş bekleme (s) → çevrim/filo hesabı. Geçersiz/negatif/aşırı değerler nötrlenir.
  // Planlanan filo (kullanıcının onayladığı gerçek araç sayısı) — geçersizse 0 (rapor öneriye düşer).
  const fl = Number(govde.veri?.filo);
  const filo = Number.isFinite(fl) ? Math.min(999, Math.max(0, Math.round(fl))) : 0;
  // İşletme (talep/filo/doluluk girdileri) → ters işletme & talep analizi. Varsayılandan
  // başla, istemci alanlarını üstüne yaz (tersIsletmeAnaliz içi kıskaçlar/guard'lar bozuk
  // sayıyı zaten nötrler).
  const isletme: Isletme = saglamIsletme(govde.veri?.isletme);
  // QR DEEP-LINK: istemcinin ürettiği bu projenin salt-okunur paylaşım linki
  // (<site>/?proje=<id>). Yalnız güvenli https + makul uzunluk kabul edilir; aksi
  // halde boş bırakılır (rapor QR'ı ana sayfaya düşer). İçerik yalnız QR'a kodlanır.
  const qrHam = typeof govde.veri?.qrUrl === "string" ? govde.veri.qrUrl : "";
  const qrUrl = /^https:\/\/[^\s]{1,512}$/.test(qrHam) ? qrHam : "";
  // Şubeler (dallanma) — istemciden; makul sayı/boyut sınırı (DoS freni), aksi halde boş.
  const subeler: Sube[] = Array.isArray(govde.veri?.subeler)
    ? govde.veri!.subeler!.filter((s) => s && Array.isArray(s.rings)).slice(0, 20)
    : [];
  // Bölüm seçimi: yalnız bilinen bölüm anahtarları + boolean değerler kabul (istemci
  // fiyat yollamaz; bedel SUNUCUDA raporKredi'den hesaplanır). Boşsa tümü dâhil.
  const secim: RaporSecim = {};
  const secimHam = govde.secim;
  if (secimHam && typeof secimHam === "object") {
    for (const b of RAPOR_BOLUMLER) if (typeof (secimHam as Record<string, unknown>)[b] === "boolean") secim[b] = (secimHam as Record<string, boolean>)[b];
  }
  const bedel = raporKredi(secim); // taban + seçilen bölümler

  // Bakiye ÖN-KONTROLÜ: muaf değilse ve bakiye yetersizse pahalı rapor üretimini
  // hiç çalıştırma (boşuna CPU / DoS önlemi). Asıl düşüm aşağıda atomik krediDus'ta.
  if (!muaf) {
    let bakiye: number;
    try { bakiye = await krediBakiye(uid); }
    catch { return NextResponse.json({ hata: "Bakiye okunamadı." }, { status: 500 }); }
    if (bakiye < bedel) {
      return NextResponse.json({ hata: "yetersiz_kredi", gereken: bedel, mevcut: bakiye }, { status: 402 });
    }
  }

  // 1) Raporu ÜRET (başarısızsa kredi düşülmez).
  let html: string;
  try {
    html = raporHTML(meta, cfg, rings, arac, dil, filo, isletme, qrUrl, subeler, secim);
  } catch (e) {
    return NextResponse.json({ hata: `Rapor üretilemedi: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  // 2) Krediyi DÜŞ (yönetici muaf). Yetersizse rapor verilmez.
  if (!muaf) {
    try {
      await krediDus(uid, bedel, { tur: "rapor", ref: meta.dokumanNo || undefined });
    } catch (e) {
      if (e instanceof KrediYetersizError) {
        return NextResponse.json({ hata: "yetersiz_kredi", gereken: e.gereken, mevcut: e.mevcut }, { status: 402 });
      }
      return NextResponse.json({ hata: e instanceof Error ? e.message : "Kredi düşülemedi." }, { status: 500 });
    }
  }

  // 3) HTML'i döndür (istemci yeni sekmede açıp yazdırır).
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
