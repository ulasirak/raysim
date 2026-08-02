// raysim — TEK SEFERLİK kredi ekleme (SECRET korumalı, geçici).
//
// UI butonu YOK. Yalnız KREDI_SECRET başlığıyla çağrılır: gövdedeki e-postanın
// hesabına kredi ekler (e-posta → uid Admin Auth ile). Yönetici kurulumunu
// bitirince bu rota ve KREDI_SECRET kaldırılır. Secret tanımlı değilse 404 gibi
// davranır (kapalı).

import { NextResponse } from "next/server";
import { isAdminConfigured, adminAuth } from "@/lib/firebaseAdmin";
import { krediEkle } from "@/lib/cuzdanServer";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const beklenen = process.env.KREDI_SECRET;
  if (!beklenen) return NextResponse.json({ hata: "Kapalı." }, { status: 404 });
  if (!isAdminConfigured()) return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });

  const secret = req.headers.get("x-kredi-secret") || "";
  if (secret !== beklenen) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  let govde: { email?: string; miktar?: number };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  const email = String(govde.email || "").trim();
  if (!email) return NextResponse.json({ hata: "email gerekli." }, { status: 400 });
  const miktar = Math.min(1000000, Math.max(1, Math.round(Number(govde.miktar) || 1000)));

  try {
    const auth = await adminAuth();
    const kullanici = await auth.getUserByEmail(email);
    const bakiye = await krediEkle(kullanici.uid, miktar, `secret_${crypto.randomUUID()}`, { tur: "duzeltme", ref: "admin-grant" });
    return NextResponse.json({ uid: kullanici.uid, bakiye, eklenen: miktar });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : "Eklenemedi." }, { status: 500 });
  }
}
