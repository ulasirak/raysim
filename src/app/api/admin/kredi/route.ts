// raysim — TEK SEFERLİK kredi ekleme (SECRET korumalı, geçici).
//
// UI butonu YOK. Yalnız KREDI_SECRET başlığıyla çağrılır: gövdedeki e-postanın
// hesabına kredi ekler. E-posta → uid, firebase-admin/auth YERİNE Identity Toolkit
// REST ile çözülür (firebase-admin/auth Vercel'de jose/ESM çakışması veriyor).
// Kurulum bitince bu rota + KREDI_SECRET kaldırılır. Secret yoksa 404 (kapalı).

import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/firebaseAdmin";
import { krediEkle } from "@/lib/cuzdanServer";
import crypto from "crypto";

export const runtime = "nodejs";

function servisHesabi() {
  const ham = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!ham) throw new Error("Service account yok.");
  const j = JSON.parse(ham) as { client_email: string; private_key: string; project_id: string };
  return { ...j, private_key: j.private_key.replace(/\\n/g, "\n") };
}

/** Service account JWT → OAuth2 erişim jetonu (identitytoolkit kapsamı). */
async function erisimJetonu(): Promise<string> {
  const sa = servisHesabi();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const govde = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/identitytoolkit",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  })}`;
  const imza = crypto.createSign("RSA-SHA256").update(govde).sign(sa.private_key, "base64url");
  const yanit = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${govde}.${imza}`,
  });
  const d = await yanit.json();
  if (!d.access_token) throw new Error(`OAuth başarısız: ${JSON.stringify(d)}`);
  return d.access_token as string;
}

export async function POST(req: Request) {
  const beklenen = process.env.KREDI_SECRET;
  if (!beklenen) return NextResponse.json({ hata: "Kapalı." }, { status: 404 });
  if (!isAdminConfigured()) return NextResponse.json({ hata: "Sunucu yapılandırılmadı." }, { status: 503 });
  if ((req.headers.get("x-kredi-secret") || "") !== beklenen) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  let govde: { email?: string; miktar?: number };
  try { govde = await req.json(); } catch { return NextResponse.json({ hata: "Geçersiz istek." }, { status: 400 }); }
  const email = String(govde.email || "").trim();
  if (!email) return NextResponse.json({ hata: "email gerekli." }, { status: 400 });
  const miktar = Math.min(1000000, Math.max(1, Math.round(Number(govde.miktar) || 1000)));

  try {
    const jeton = await erisimJetonu();
    const pid = servisHesabi().project_id;
    const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:lookup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: [email] }),
    });
    const ld = await lookup.json();
    const uid = ld.users?.[0]?.localId as string | undefined;
    if (!uid) return NextResponse.json({ hata: `Kullanıcı bulunamadı: ${email}` }, { status: 404 });

    const bakiye = await krediEkle(uid, miktar, `secret_${crypto.randomUUID()}`, { tur: "duzeltme", ref: "admin-grant" });
    return NextResponse.json({ uid, bakiye, eklenen: miktar });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : "Eklenemedi." }, { status: 500 });
  }
}
