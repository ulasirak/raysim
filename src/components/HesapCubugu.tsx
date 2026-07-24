"use client";

// raysim — HESAP & PROJE ÇUBUĞU (çok kiracılı kabuk şeridi).
// Navigasyonun hemen altında durur; o an hangi hesabın hangi hattının aktif
// olduğunu ve kaydetme durumunu gösterir. Yedi modülün tamamı bu çubuğun
// gösterdiği tek hatta hizmet eder.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function HesapCubugu() {
  const { user, hazir, yapilandirildi, cikisYap } = useAuth();
  const {
    demoMu, paylasimGorunumu, paylasimdanCik, durum, hataMetni, projeler, aktifId, aktifAd,
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
        {/* Buton, adresteki ?proje= parametresini de siler — yalnız "/" linki
            vermek görünümden ÇIKARMIYORDU (sağlayıcı yeniden kurulmuyor). */}
        <button onClick={paylasimdanCik} className="ml-auto rounded px-2.5 py-1 text-xs font-medium"
          style={{ background: brand.ink, color: "#fff" }}>
          {user ? "Kendi hattıma dön" : "Giriş yap"}
        </button>
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
        <span className="field-label" style={{ color: brand.faint }} title="Şu an üzerinde çalıştığınız hat — yedi modülün tamamı bu hattı kullanır">AKTİF HAT</span>

        {/* Proje seçici */}
        <select
          value={aktifId ?? ""}
          onChange={(e) => projeSec(e.target.value)}
          title="Bu hesaptaki hatlar. Seçtiğiniz hat anında yüklenir ve Sefer/Ringler/Anklaşman/Tam Hat/Sistem/Belgeler/Coğrafi modüllerinin tamamı o hatta çalışır."
          className="rounded border px-2 py-1 text-xs"
          style={{ borderColor: brand.border, color: brand.ink, maxWidth: 260 }}
        >
          {projeler.map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
        </select>

        {/* Ad düzenleme */}
        {adTaslak === null ? (
          <button onClick={() => setAdTaslak(aktifAd)} title="Aktif hattın adını değiştir (yalnız ad — veriler aynı kalır)"
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
          <button onClick={() => setYeniAcik(true)} title="Sıfırdan BOŞ yeni bir hat açar (mevcut hat kopyalanmaz); listeye eklenir ve aktif olur"
            className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50"
            style={{ borderColor: brand.border, color: brand.inkSoft }}>＋ Yeni hat</button>
        )}

        {projeler.length > 1 && aktifId && (
          <button
            onClick={() => { if (confirm(`“${aktifAd}” kalıcı olarak silinsin mi?`)) sar(projeSilmeIstegi(aktifId), "sil"); }}
            title="Aktif hattı kalıcı olarak siler (geri alınamaz). Son hat silinemez." className="rounded px-1.5 py-1 transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
        )}

        {/* Kaydetme durumu */}
        <span className="ml-1" title="Otomatik kayıt: yaptığınız her değişiklik 1,2 saniye sonra hesabınıza kaydedilir — ayrıca kaydet düğmesi yoktur"
          style={{ color: durum === "hata" ? brand.red : brand.faint }}>
          {durum === "yukleniyor" && "⟳ yükleniyor…"}
          {durum === "kaydediliyor" && "⟳ kaydediliyor…"}
          {durum === "kaydedildi" && <span style={{ color: CK.good }}>✓ kaydedildi</span>}
          {durum === "hazir" && "✓ eşitlendi"}
          {durum === "hata" && `⚠ ${hataMetni ?? "kayıt hatası"}`}
        </span>

        {/* Sağ blok: paylaşım + hesap */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5" title="Açıkken bu hattın linkini bilen herkes (giriş yapmadan) hattı YALNIZ GÖRÜNTÜLER — değiştiremez. Kapatınca erişim anında kesilir.">
            <input type="checkbox" checked={paylasimAcik} onChange={(e) => sar(paylasimDegistir(e.target.checked), "paylasim")} />
            <span style={{ color: brand.inkSoft }}>Paylaşım linki</span>
          </label>
          {paylasimAcik && (
            <button
              onClick={() => { navigator.clipboard?.writeText(paylasimLinki); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }}
              title="Salt-okunur görüntüleme linkini panoya kopyalar (müşteriye/idareye göstermek için)"
              className="rounded border px-2 py-1 font-medium" style={{ borderColor: brand.border, color: brand.ink }}>
              {kopyalandi ? "✓ kopyalandı" : "🔗 linki kopyala"}
            </button>
          )}
          <span style={{ color: brand.faint }}>|</span>
          <span style={{ color: brand.muted }} title="Bu hatların sahibi olan hesap">{user?.email}</span>
          <button onClick={() => cikisYap()} title="Oturumu kapatır; hatlarınız hesabınızda kayıtlı kalır"
            className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50"
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
