"use client";

// raysim — HESAP & PROJE ÇUBUĞU (çok kiracılı kabuk şeridi).
// Navigasyonun hemen altında durur; o an hangi hesabın hangi hattının aktif
// olduğunu ve kaydetme durumunu gösterir. Yedi modülün tamamı bu çubuğun
// gösterdiği tek hatta hizmet eder.

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function HesapCubugu() {
  const { user, hazir, yapilandirildi, cikisYap } = useAuth();
  const {
    demoMu, paylasimGorunumu, durum, hataMetni, projeler, aktifId, aktifAd,
    paylasimAcik, projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle, paylasimDegistir,
  } = useHesap();

  const [yeniAcik, setYeniAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState("");
  const [adTaslak, setAdTaslak] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [isBasi, setIsBasi] = useState<string | null>(null);

  if (!yapilandirildi) return null; // Firebase yoksa çubuk anlamsız (yerel geliştirme)

  const sar = (p: Promise<unknown>, ad: string) => {
    setIsBasi(ad);
    p.catch(() => { /* durum context'te gösteriliyor */ }).finally(() => setIsBasi(null));
  };

  // — Salt-okunur paylaşım görünümü —
  if (paylasimGorunumu) {
    return (
      <Serit renk={CK.amber}>
        <span style={{ color: brand.ink }}>
          👁 <b>Salt-okunur paylaşım görünümü</b> — “{aktifAd}”. Değişiklik yapılamaz.
        </span>
        <Link href="/" className="ml-auto rounded px-2.5 py-1 text-xs font-medium" style={{ background: brand.ink, color: "#fff" }}>
          Kendi hattıma dön
        </Link>
      </Serit>
    );
  }

  // Giriş yoksa çubuk hiç görünmez (Kapi zaten giriş/kayıt ekranını gösterir).
  if (demoMu || !hazir || !user) return null;

  // — Girişli: proje yönetimi —
  const paylasimLinki = aktifId ? `${typeof window !== "undefined" ? window.location.origin : ""}/?proje=${aktifId}` : "";

  return (
    <div className="border-b" style={{ background: brand.surface, borderColor: brand.border }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-6 py-2 text-xs">
        <span className="field-label" style={{ color: brand.faint }}>AKTİF HAT</span>

        {/* Proje seçici */}
        <select
          value={aktifId ?? ""}
          onChange={(e) => projeSec(e.target.value)}
          className="rounded border px-2 py-1 text-xs"
          style={{ borderColor: brand.border, color: brand.ink, maxWidth: 260 }}
        >
          {projeler.map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
        </select>

        {/* Ad düzenleme */}
        {adTaslak === null ? (
          <button onClick={() => setAdTaslak(aktifAd)} title="Proje adını değiştir"
            className="rounded px-1.5 py-1 transition hover:opacity-70" style={{ color: brand.faint }}>✎</button>
        ) : (
          <>
            <input value={adTaslak} onChange={(e) => setAdTaslak(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { sar(projeAdiGuncelle(adTaslak.trim() || aktifAd), "ad"); setAdTaslak(null); } if (e.key === "Escape") setAdTaslak(null); }}
              className="rounded border px-2 py-1 text-xs" style={{ borderColor: brand.borderStrong, color: brand.ink }} />
            <button onClick={() => { sar(projeAdiGuncelle(adTaslak.trim() || aktifAd), "ad"); setAdTaslak(null); }}
              className="rounded px-2 py-1 font-medium" style={{ background: brand.ink, color: "#fff" }}>Kaydet</button>
          </>
        )}

        {/* Yeni proje */}
        {yeniAcik ? (
          <>
            <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} placeholder="Yeni hat adı" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { sar(projeYeni(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); } if (e.key === "Escape") setYeniAcik(false); }}
              className="rounded border px-2 py-1 text-xs" style={{ borderColor: brand.borderStrong, color: brand.ink }} />
            <button onClick={() => { sar(projeYeni(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); }} disabled={isBasi === "yeni"}
              className="rounded px-2 py-1 font-medium disabled:opacity-50" style={{ background: brand.ink, color: "#fff" }}>Oluştur</button>
          </>
        ) : (
          <button onClick={() => setYeniAcik(true)} className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50"
            style={{ borderColor: brand.border, color: brand.inkSoft }}>＋ Yeni hat</button>
        )}

        {projeler.length > 1 && aktifId && (
          <button
            onClick={() => { if (confirm(`“${aktifAd}” kalıcı olarak silinsin mi?`)) sar(projeSilmeIstegi(aktifId), "sil"); }}
            title="Bu hattı sil" className="rounded px-1.5 py-1 transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
        )}

        {/* Kaydetme durumu */}
        <span className="ml-1" style={{ color: durum === "hata" ? brand.red : brand.faint }}>
          {durum === "yukleniyor" && "⟳ yükleniyor…"}
          {durum === "kaydediliyor" && "⟳ kaydediliyor…"}
          {durum === "kaydedildi" && <span style={{ color: CK.good }}>✓ kaydedildi</span>}
          {durum === "hazir" && "✓ eşitlendi"}
          {durum === "hata" && `⚠ ${hataMetni ?? "kayıt hatası"}`}
        </span>

        {/* Sağ blok: paylaşım + hesap */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5" title="Açıkken linki bilen herkes bu hattı yalnız GÖRÜNTÜLER">
            <input type="checkbox" checked={paylasimAcik} onChange={(e) => sar(paylasimDegistir(e.target.checked), "paylasim")} />
            <span style={{ color: brand.inkSoft }}>Paylaşım linki</span>
          </label>
          {paylasimAcik && (
            <button
              onClick={() => { navigator.clipboard?.writeText(paylasimLinki); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }}
              className="rounded border px-2 py-1 font-medium" style={{ borderColor: brand.border, color: brand.ink }}>
              {kopyalandi ? "✓ kopyalandı" : "🔗 linki kopyala"}
            </button>
          )}
          <span style={{ color: brand.faint }}>|</span>
          <span style={{ color: brand.muted }}>{user?.email}</span>
          <button onClick={() => cikisYap()} className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50"
            style={{ borderColor: brand.border, color: brand.inkSoft }}>Çıkış</button>
        </div>
      </div>
    </div>
  );
}

function Serit({ renk, children }: { renk: string; children: React.ReactNode }) {
  return (
    <div className="border-b" style={{ background: brand.surface, borderColor: brand.border }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 border-l-4 px-6 py-2 text-xs" style={{ borderColor: renk }}>
        {children}
      </div>
    </div>
  );
}
