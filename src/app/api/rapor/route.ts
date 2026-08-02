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
import { krediDus, KrediYetersizError } from "@/lib/cuzdanServer";
import { KREDI_BEDELI } from "@/lib/cuzdan";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { raporHTML, type RaporDil } from "@/lib/anaray/rapor";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { varsayilanConfig, varsayilanMeta, type SimConfig, type ProjeMeta } from "@/lib/anaray/config";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { MakasBolgeTopolojisi } from "@/lib/anaray/interlocking";
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

  let govde: { veri?: { rings?: DurakArasiRing[]; cfg?: Partial<SimConfig>; meta?: Partial<ProjeMeta>; arac?: RollingStock; turnaroundSn?: number; bolgeler?: MakasBolgeTopolojisi[] }; dil?: string };
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
  const arac: RollingStock = govde.veri?.arac ?? varsayilanArac; // projenin aracı (yoksa varsayılan)
  const dil: RaporDil = govde.dil === "en" ? "en" : "tr";
  // Dönüş bekleme (s) → çevrim/filo hesabı. Geçersiz/negatif/aşırı değerler nötrlenir.
  const ts = Number(govde.veri?.turnaroundSn);
  const turnaroundSn = Number.isFinite(ts) ? Math.min(3600, Math.max(0, ts)) : 0;
  // Makas bölgeleri (Anklaşman modülünden) — belgedeki bölge senaryoları buradan gelir.
  // Kötüye kullanım freni: aşırı bölge sayısını kırp (gerçek hatlar ~onlarca bölge).
  const bolgeler: MakasBolgeTopolojisi[] = Array.isArray(govde.veri?.bolgeler) ? govde.veri.bolgeler.slice(0, 200) : [];

  // 1) Raporu ÜRET (başarısızsa kredi düşülmez).
  let html: string;
  try {
    html = raporHTML(meta, cfg, rings, arac, dil, turnaroundSn, bolgeler);
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
