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
import { KREDI_BEDELI } from "@/lib/cuzdan";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { raporHTML, type RaporDil } from "@/lib/anaray/rapor";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { varsayilanConfig, varsayilanMeta, varsayilanIsletme, type SimConfig, type ProjeMeta, type Isletme } from "@/lib/anaray/config";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { RollingStock } from "@/lib/anaray/types";

export const runtime = "nodejs";

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
  const hiz = await hizSiniri(`rapor:${uid}`, 20, 300);
  if (!hiz.izin) {
    return NextResponse.json(
      { hata: "Çok fazla rapor isteği — lütfen biraz bekleyin.", sifirlaSn: hiz.sifirlaSn },
      { status: 429 },
    );
  }

  let govde: { veri?: { rings?: DurakArasiRing[]; cfg?: Partial<SimConfig>; meta?: Partial<ProjeMeta>; arac?: RollingStock; turnaroundSn?: number; filo?: number; isletme?: Partial<Isletme>; qrUrl?: string }; dil?: string };
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
  const cfg: SimConfig = { ...varsayilanConfig, ...(govde.veri?.cfg ?? {}) };
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
  const isletme: Isletme = { ...varsayilanIsletme, ...(govde.veri?.isletme ?? {}) };
  // QR DEEP-LINK: istemcinin ürettiği bu projenin salt-okunur paylaşım linki
  // (<site>/?proje=<id>). Yalnız güvenli https + makul uzunluk kabul edilir; aksi
  // halde boş bırakılır (rapor QR'ı ana sayfaya düşer). İçerik yalnız QR'a kodlanır.
  const qrHam = typeof govde.veri?.qrUrl === "string" ? govde.veri.qrUrl : "";
  const qrUrl = /^https:\/\/[^\s]{1,512}$/.test(qrHam) ? qrHam : "";

  // Bakiye ÖN-KONTROLÜ: muaf değilse ve bakiye yetersizse pahalı rapor üretimini
  // hiç çalıştırma (boşuna CPU / DoS önlemi). Asıl düşüm aşağıda atomik krediDus'ta.
  if (!muaf) {
    let bakiye: number;
    try { bakiye = await krediBakiye(uid); }
    catch { return NextResponse.json({ hata: "Bakiye okunamadı." }, { status: 500 }); }
    if (bakiye < KREDI_BEDELI.rapor) {
      return NextResponse.json({ hata: "yetersiz_kredi", gereken: KREDI_BEDELI.rapor, mevcut: bakiye }, { status: 402 });
    }
  }

  // 1) Raporu ÜRET (başarısızsa kredi düşülmez).
  let html: string;
  try {
    html = raporHTML(meta, cfg, rings, arac, dil, filo, isletme, qrUrl);
  } catch (e) {
    return NextResponse.json({ hata: `Rapor üretilemedi: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  // 2) Krediyi DÜŞ (yönetici muaf). Yetersizse rapor verilmez.
  if (!muaf) {
    try {
      await krediDus(uid, KREDI_BEDELI.rapor, { tur: "rapor", ref: meta.dokumanNo || undefined });
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

/**
 * İstemciden gelen araç verisini GÜVENLİ aralığa kıskaçlar. Varsayılandan başlar,
 * her sayısal alanı `Number.isFinite` + makul alt/üst sınırla değiştirir. Böylece
 * bozuk/negatif/NaN girdi ne simülasyonu kilitler ne de rapora NaN yazar.
 */
function saglamArac(a: Partial<RollingStock> | undefined): RollingStock {
  const d = varsayilanArac;
  const n = (v: unknown, def: number, lo: number, hi: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
  };
  return {
    id: typeof a?.id === "string" ? a.id : d.id,
    name: typeof a?.name === "string" ? a.name : d.name,
    mass: n(a?.mass, d.mass, 1_000, 2_000_000),                       // kg
    rotatingMassFactor: n(a?.rotatingMassFactor, d.rotatingMassFactor, 0, 0.5),
    length: n(a?.length, d.length, 1, 1_000),                        // m
    maxSpeed: n(a?.maxSpeed, d.maxSpeed, 1, 150),                    // m/s (taban 1 → stall yok)
    startingTractiveEffort: n(a?.startingTractiveEffort, d.startingTractiveEffort, 1, 5_000_000), // N
    power: n(a?.power, d.power, 1_000, 50_000_000),                  // W
    maxBraking: n(a?.maxBraking, d.maxBraking, 0.1, 5),              // m/s²
    davisA: n(a?.davisA, d.davisA, 0, 1e7),
    davisB: n(a?.davisB, d.davisB, 0, 1e6),
    davisC: n(a?.davisC, d.davisC, 0, 1e5),
  };
}
