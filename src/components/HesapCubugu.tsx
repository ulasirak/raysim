"use client";

// raysim — HESAP & PROJE ÇUBUĞU (çok kiracılı kabuk şeridi).
// Navigasyonun hemen altında durur; o an hangi hesabın hangi hattının aktif
// olduğunu ve kaydetme durumunu gösterir. Yedi modülün tamamı bu çubuğun
// gösterdiği tek hatta hizmet eder.
//
// SADE DÜZEN (kullanıcı isteği): çubukta yalnız günlük kullanılan üç şey durur —
// hat seçici · ＋ Yeni hat · kayıt durumu. Seyrek kullanılanlar (ad değiştirme,
// paylaşım linki, hattı silme) tek bir "⋮" menüsünün altındadır.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { useCuzdan } from "@/components/CuzdanProvider";
import { KREDI_PAKETLERI } from "@/lib/cuzdan";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function HesapCubugu() {
  const { user, hazir, yapilandirildi, cikisYap } = useAuth();
  const {
    demoMu, paylasimGorunumu, paylasimdanCik, durum, hataMetni, projeler, aktifId, aktifAd,
    paylasimAcik, kota, kotaDoldu, yonetici,
    projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle, paylasimDegistir,
  } = useHesap();

  const { bakiye, krediSatinAl, krediHarca } = useCuzdan();
  const [yeniAcik, setYeniAcik] = useState(false);
  const [odemeHata, setOdemeHata] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState("");
  const [adTaslak, setAdTaslak] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const [isBasi, setIsBasi] = useState<string | null>(null);

  if (!yapilandirildi) return null; // Firebase yoksa çubuk anlamsız (yerel geliştirme)

  const sar = (p: Promise<unknown>, ad: string) => {
    setIsBasi(ad);
    p.catch(() => { /* durum context'te gösteriliyor */ }).finally(() => setIsBasi(null));
  };

  // Yeni hat = ücretli (proje yükleme). Önce SUNUCUDA kredi düşülür; yeterliyse
  // hat açılır. Yönetici muaftır. Yetersizse kredi al uyarısı gösterilir.
  const yeniHatKredili = async (ad: string) => {
    if (!yonetici) {
      const r = await krediHarca("projeYukleme");
      if (!r.tamam) {
        setOdemeHata(r.yetersiz
          ? `Yeni hat ${r.gereken} kredi ister; ${r.mevcut} krediniz var. Yukarıdan kredi alın.`
          : (r.hata ?? "Kredi düşülemedi."));
        throw new Error("kredi-yok");
      }
    }
    await projeYeni(ad);
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
  const silinebilir = projeler.length > 1 && Boolean(aktifId);

  const menuKapat = () => setMenuAcik(false);

  return (
    <div className="border-b" style={{ background: brand.surface, borderColor: brand.border }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-6 py-2 text-xs">
        <span className="field-label" style={{ color: brand.faint }}>AKTİF HAT</span>

        {/* Hat seçici — seçilen hat yedi modülün tamamında aktif olur */}
        {adTaslak === null ? (
          <select
            value={aktifId ?? ""}
            onChange={(e) => projeSec(e.target.value)}
            title="Üzerinde çalıştığınız proje. Seçtiğiniz hat tüm modüllerde aktif olur."
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: brand.border, color: brand.ink, maxWidth: 260 }}
          >
            {projeler.map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
          </select>
        ) : (
          /* Ad değiştirme — menüden açılır, seçicinin yerinde düzenlenir */
          <>
            <input value={adTaslak} onChange={(e) => setAdTaslak(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { sar(projeAdiGuncelle(adTaslak.trim() || aktifAd), "ad"); setAdTaslak(null); } if (e.key === "Escape") setAdTaslak(null); }}
              className="rounded border px-2 py-1 text-xs" style={{ borderColor: brand.borderStrong, color: brand.ink }} />
            <button onClick={() => { sar(projeAdiGuncelle(adTaslak.trim() || aktifAd), "ad"); setAdTaslak(null); }}
              className="rounded px-2 py-1 font-medium" style={{ background: brand.ink, color: "#fff" }}>Kaydet</button>
            <button onClick={() => setAdTaslak(null)} className="rounded px-2 py-1" style={{ color: brand.muted }}>Vazgeç</button>
          </>
        )}

        {/* Yeni hat */}
        {yeniAcik ? (
          <>
            <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} placeholder="Yeni hat adı" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { setOdemeHata(null); sar(yeniHatKredili(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); } if (e.key === "Escape") setYeniAcik(false); }}
              className="rounded border px-2 py-1 text-xs" style={{ borderColor: brand.borderStrong, color: brand.ink }} />
            <button onClick={() => { setOdemeHata(null); sar(yeniHatKredili(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); }} disabled={isBasi === "yeni"}
              className="rounded px-2 py-1 font-medium disabled:opacity-50" style={{ background: brand.ink, color: "#fff" }}>Oluştur</button>
            <button onClick={() => setYeniAcik(false)} className="rounded px-2 py-1" style={{ color: brand.muted }}>Vazgeç</button>
          </>
        ) : (
          <button onClick={() => setYeniAcik(true)} disabled={kotaDoldu}
            title={kotaDoldu
              ? `Hat kotanız dolu (${projeler.length}/${kota}). Yeni hat açmak için önce bir hattı silin.`
              : "Sıfırdan boş yeni bir proje açar"}
            className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            style={{ borderColor: brand.border, color: brand.inkSoft }}>＋ Yeni hat</button>
        )}

        {/* Kaydetme durumu — ayrı bir "Kaydet" düğmesi yoktur, otomatik kaydedilir */}
        <span className="ml-1" title="Değişiklikleriniz otomatik kaydedilir"
          style={{ color: durum === "hata" ? brand.red : brand.faint }}>
          {durum === "yukleniyor" && "⟳ yükleniyor…"}
          {durum === "kaydediliyor" && "⟳ kaydediliyor…"}
          {durum === "kaydedildi" && <span style={{ color: CK.good }}>✓ kaydedildi</span>}
          {durum === "hazir" && "✓ kaydedildi"}
          {durum === "hata" && `⚠ ${hataMetni ?? "kayıt hatası"}`}
        </span>

        {/* Kredi/ödeme uyarısı (yeni hat için yetersiz kredi vb.) */}
        {odemeHata && (
          <span className="max-w-xs truncate" title={odemeHata} style={{ color: brand.red }}>⚠ {odemeHata}</span>
        )}

        {/* Sağ blok: kredi bakiyesi + ⋮ menüsü + çıkış */}
        <div className="relative ml-auto flex items-center gap-2">
          {/* Kredi bakiyesi — ücretli rapor/proje yükleme bu krediden düşer */}
          <span title="Kredi bakiyeniz — rapor ve proje yükleme bundan düşer"
            className="rounded-full border px-2.5 py-1 font-medium"
            style={{ borderColor: brand.border, color: bakiye === 0 ? brand.red : brand.inkSoft }}>
            {bakiye === null ? "◌ kredi" : `◈ ${bakiye} kredi`}
          </span>

          <button onClick={() => setMenuAcik((a) => !a)} title="Bu hat için diğer işlemler"
            className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50"
            style={{ borderColor: brand.border, color: brand.inkSoft }}>⋮</button>

          <button onClick={() => cikisYap()} title="Oturumu kapatır; hatlarınız hesabınızda kalır"
            className="rounded border px-2 py-1 font-medium transition hover:bg-slate-50"
            style={{ borderColor: brand.border, color: brand.inkSoft }}>Çıkış</button>

          {menuAcik && (
            <>
              {/* Dışarı tıklayınca kapanır */}
              <div className="fixed inset-0 z-30" onClick={menuKapat} />
              <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-md border py-1 shadow-lg"
                style={{ background: brand.surface, borderColor: brand.border }}>
                <div className="border-b px-3 py-2" style={{ borderColor: brand.border }}>
                  <div className="field-label" style={{ color: brand.faint }}>HESAP</div>
                  <div style={{ color: brand.ink }}>{user.email}</div>
                  <div className="mt-0.5 text-[0.7rem]" style={{ color: kotaDoldu ? brand.red : brand.muted }}>
                    {kota === null ? `${projeler.length} hat · sınırsız` : `${projeler.length}/${kota} hat`}
                    {"  ·  "}
                    <span style={{ color: bakiye === 0 ? brand.red : brand.muted }}>
                      {bakiye === null ? "kredi —" : `${bakiye} kredi`}
                    </span>
                  </div>
                </div>

                {/* Kredi satın alma — ücretli rapor/proje yükleme bu krediden düşer */}
                <div className="border-b px-3 py-2" style={{ borderColor: brand.border }}>
                  <div className="field-label mb-1" style={{ color: brand.faint }}>KREDİ AL</div>
                  <div className="flex flex-wrap gap-1.5">
                    {KREDI_PAKETLERI.map((p) => (
                      <button key={p.id}
                        onClick={async () => { setOdemeHata(null); const r = await krediSatinAl(p.id); if (r.hata) setOdemeHata(r.hata); }}
                        title={`${p.kredi} kredi — ${p.tl} TL`}
                        className="rounded border px-2 py-1 text-xs font-medium transition hover:bg-slate-50"
                        style={{ borderColor: brand.border, color: brand.ink }}>
                        {p.kredi} kredi<span style={{ color: brand.muted }}> · {p.tl}₺</span>
                      </button>
                    ))}
                  </div>
                  {odemeHata && <div className="mt-1 text-[0.7rem]" style={{ color: brand.red }}>{odemeHata}</div>}
                </div>

                <MenuOge onClick={() => { setAdTaslak(aktifAd); menuKapat(); }}
                  ad="Adı değiştir" alt="Bu projenin adını düzenle" />

                <MenuOge onClick={() => { sar(paylasimDegistir(!paylasimAcik), "paylasim"); }}
                  ad={paylasimAcik ? "Paylaşımı kapat" : "Paylaşım linki oluştur"}
                  alt={paylasimAcik
                    ? "Link şu an açık — kapatınca erişim anında kesilir"
                    : "Linki verdiğiniz kişi projeyi sadece görüntüler, değiştiremez"} />

                {paylasimAcik && (
                  <MenuOge
                    onClick={() => { navigator.clipboard?.writeText(paylasimLinki); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }}
                    ad={kopyalandi ? "✓ Kopyalandı" : "🔗 Linki kopyala"}
                    alt="Salt-okunur görüntüleme linkini panoya kopyalar" />
                )}

                {silinebilir && (
                  <MenuOge tehlike
                    onClick={() => { if (confirm(`“${aktifAd}” kalıcı olarak silinsin mi?`)) { sar(projeSilmeIstegi(aktifId!), "sil"); menuKapat(); } }}
                    ad="Hattı sil" alt="Bu projeyi kalıcı olarak siler (geri alınamaz)" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Menü satırı — üstte eylem adı, altında tek cümlelik açıklama. */
function MenuOge({ ad, alt, onClick, tehlike = false }: { ad: string; alt: string; onClick: () => void; tehlike?: boolean }) {
  return (
    <button onClick={onClick} className="block w-full px-3 py-2 text-left transition hover:bg-slate-50">
      <span className="font-medium" style={{ color: tehlike ? brand.red : brand.ink }}>{ad}</span>
      <span className="mt-0.5 block text-[0.7rem] leading-snug" style={{ color: brand.muted }}>{alt}</span>
    </button>
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
