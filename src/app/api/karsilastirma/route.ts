// raysim — SENARYO KARŞILAŞTIRMA raporunu SUNUCUDA üret + ücretlendir.
// /api/rapor ile aynı güvenlik: kimlik imzalı token, hız sınırı, kredi (yönetici muaf).
// İstemci 2-4 senaryonun ham verisini (rings/cfg/arac/isletme + ad) yollar; sunucu
// AYNI çekirdekle (karsilastirmaHTML → metrikHesapla) hesaplayıp HTML döndürür.

import { NextResponse } from "next/server";
import { istekKimlik, isAdminConfigured } from "@/lib/firebaseAdmin";
import { krediDus, krediBakiye, KrediYetersizError } from "@/lib/cuzdanServer";
import { hizSiniri } from "@/lib/rateLimit";
import { KREDI_BEDELI } from "@/lib/cuzdan";
import { yoneticiMi, yoneticiUidMi } from "@/lib/anaray/yetki";
import { karsilastirmaHTML, type KarsSenaryo } from "@/lib/anaray/karsilastirma";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { varsayilanConfig, varsayilanMeta, varsayilanIsletme, type SimConfig, type ProjeMeta, type Isletme } from "@/lib/anaray/config";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { RollingStock } from "@/lib/anaray/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });

  let uid: string, muaf: boolean;
  try {
    const k = await istekKimlik(req);
    uid = k.uid;
    muaf = yoneticiUidMi(k.uid) || (k.emailDogrulandi && yoneticiMi(k.email));
  } catch { return NextResponse.json({ hata: "Kimlik doğrulanamadı." }, { status: 401 }); }

  const hiz = await hizSiniri(`kars:${uid}`, 20, 300);
  if (!hiz.izin) return NextResponse.json({ hata: "Çok fazla istek — lütfen biraz bekleyin.", sifirlaSn: hiz.sifirlaSn }, { status: 429 });

  let govde: { senaryolar?: { ad?: string; rings?: DurakArasiRing[]; cfg?: Partial<SimConfig>; arac?: RollingStock; isletme?: Partial<Isletme> }[]; meta?: Partial<ProjeMeta>; altBaslik?: string };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }

  const gelen = Array.isArray(govde.senaryolar) ? govde.senaryolar : [];
  if (gelen.length < 2) return NextResponse.json({ hata: "Karşılaştırma için en az 2 senaryo gerekli." }, { status: 400 });
  if (gelen.length > 4) return NextResponse.json({ hata: "En çok 4 senaryo karşılaştırılır." }, { status: 413 });

  const senaryolar: KarsSenaryo[] = gelen.map((s, i) => ({
    ad: typeof s.ad === "string" && s.ad ? s.ad.slice(0, 60) : `Senaryo ${i + 1}`,
    rings: Array.isArray(s.rings) ? s.rings : [],
    cfg: { ...varsayilanConfig, ...(s.cfg ?? {}) },
    stock: saglamArac(s.arac),
    isletme: { ...varsayilanIsletme, ...(s.isletme ?? {}) },
  }));
  if (senaryolar.some((s) => s.rings.length > 1000)) {
    return NextResponse.json({ hata: "Hat verisi çok büyük (senaryo başına en çok 1000 ring)." }, { status: 413 });
  }
  if (senaryolar.filter((s) => s.rings.length >= 1).length < 2) {
    return NextResponse.json({ hata: "Karşılaştırma için en az 2 kurulu hat gerekli." }, { status: 400 });
  }

  const meta: ProjeMeta = { ...varsayilanMeta, ...(govde.meta ?? {}) };
  const altBaslik = typeof govde.altBaslik === "string" ? govde.altBaslik.slice(0, 140) : "";

  // Bakiye ön-kontrol (muaf değilse) — pahalı üretimi boşa çalıştırma.
  if (!muaf) {
    let bakiye: number;
    try { bakiye = await krediBakiye(uid); } catch { return NextResponse.json({ hata: "Bakiye okunamadı." }, { status: 500 }); }
    if (bakiye < KREDI_BEDELI.rapor) return NextResponse.json({ hata: "yetersiz_kredi", gereken: KREDI_BEDELI.rapor, mevcut: bakiye }, { status: 402 });
  }

  // 1) Üret (başarısızsa kredi düşülmez).
  let html: string;
  try { html = karsilastirmaHTML(senaryolar, meta, altBaslik); }
  catch (e) { return NextResponse.json({ hata: `Rapor üretilemedi: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 }); }

  // 2) Kredi düş (yönetici muaf).
  if (!muaf) {
    try { await krediDus(uid, KREDI_BEDELI.rapor, { tur: "rapor", ref: meta.dokumanNo || "karsilastirma" }); }
    catch (e) {
      if (e instanceof KrediYetersizError) return NextResponse.json({ hata: "yetersiz_kredi", gereken: e.gereken, mevcut: e.mevcut }, { status: 402 });
      return NextResponse.json({ hata: e instanceof Error ? e.message : "Kredi düşülemedi." }, { status: 500 });
    }
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** İstemciden gelen araç verisini güvenli aralığa kıskaçlar (bkz. /api/rapor). */
function saglamArac(a: Partial<RollingStock> | undefined): RollingStock {
  const d = varsayilanArac;
  const n = (v: unknown, def: number, lo: number, hi: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
  };
  return {
    id: typeof a?.id === "string" ? a.id : d.id,
    name: typeof a?.name === "string" ? a.name : d.name,
    mass: n(a?.mass, d.mass, 1_000, 2_000_000),
    rotatingMassFactor: n(a?.rotatingMassFactor, d.rotatingMassFactor, 0, 0.5),
    length: n(a?.length, d.length, 1, 1_000),
    maxSpeed: n(a?.maxSpeed, d.maxSpeed, 1, 150),
    startingTractiveEffort: n(a?.startingTractiveEffort, d.startingTractiveEffort, 1, 5_000_000),
    power: n(a?.power, d.power, 1_000, 50_000_000),
    maxBraking: n(a?.maxBraking, d.maxBraking, 0.1, 5),
    davisA: n(a?.davisA, d.davisA, 0, 1e7),
    davisB: n(a?.davisB, d.davisB, 0, 1e6),
    davisC: n(a?.davisC, d.davisC, 0, 1e5),
  };
}
