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
import { yoneticiMi } from "@/lib/anaray/yetki";
import { raporHTML, type RaporDil } from "@/lib/anaray/rapor";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { varsayilanConfig, varsayilanMeta, type SimConfig, type ProjeMeta } from "@/lib/anaray/config";
import type { DurakArasiRing } from "@/lib/anaray/ring";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  }

  let uid: string;
  let email: string | null;
  try { const k = await istekKimlik(req); uid = k.uid; email = k.email; }
  catch { return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 }); }

  let govde: { veri?: { rings?: DurakArasiRing[]; cfg?: Partial<SimConfig>; meta?: Partial<ProjeMeta> }; dil?: string };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const rings = govde.veri?.rings;
  if (!Array.isArray(rings) || rings.length === 0) {
    return NextResponse.json({ hata: "Rapor için hat (ring) verisi gerekli." }, { status: 400 });
  }
  const cfg: SimConfig = { ...varsayilanConfig, ...(govde.veri?.cfg ?? {}) };
  const meta: ProjeMeta = { ...varsayilanMeta, ...(govde.veri?.meta ?? {}) };
  const dil: RaporDil = govde.dil === "en" ? "en" : "tr";

  // 1) Raporu ÜRET (başarısızsa kredi düşülmez).
  let html: string;
  try {
    html = raporHTML(meta, cfg, rings, varsayilanArac, dil);
  } catch (e) {
    return NextResponse.json({ hata: `Rapor üretilemedi: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  // 2) Krediyi DÜŞ (yönetici muaf). Yetersizse rapor verilmez.
  if (!yoneticiMi(email)) {
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
