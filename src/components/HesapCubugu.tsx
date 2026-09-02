"use client";

// raysim — HESAP & HAT KONTROLLERİ + BAĞLAMSAL BİLDİRİMLER.
// Kontroller (HesapKontrolleri) artık ayrı bir şerit değil; üst header satırına
// (logo yanına) gömülüdür. Header koyu mürekkep zemin olduğu için kontroller
// AÇIK-RENK temalıdır (translüsan yüzey + açık metin). Bağlamsal tam-genişlik
// şeritler (ödeme sonucu bildirimi, salt-okunur paylaşım görünümü) bundan ayrı
// tutulur ve HesapBildirimleri altında header'ın hemen altında çizilir.
//
// SADE DÜZEN: kontrolde yalnız günlük kullanılan şeyler durur — hat seçici ·
// ＋ Yeni hat · kayıt durumu · kredi. Seyrek işler (ad değiştir, paylaşım linki,
// hattı sil, çıkış) tek bir "⋮" menüsünün altındadır.

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { useCuzdan } from "@/components/CuzdanProvider";
import { KREDI_PAKETLERI, paketAvantaj, hareketleriGetir, type KrediHareket } from "@/lib/cuzdan";
import { karsilamaSifirla } from "@/components/Karsilama";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

// Koyu header zeminine (#0C2233) göre kontrol paleti. Dolgu SAYDAM DEĞİL, görünür
// bir lacivert (#16324A) — böylece butonlar koyu mürekkeple karışmaz, düşük kontrastlı
// ekranlarda da net okunur. Kenar/metin parlak; vurgu (birincil eylem) marka kırmızısı.
const koyu = {
  yuzey: "#16324A",                   // görünür lacivert dolgu (header'dan belirgin ayrışır)
  kenar: "rgba(255,255,255,0.30)",
  kenarGuclu: "rgba(255,255,255,0.46)",
  metin: "#F1F6FB",
  metinYumusak: "#D5DFE8",
  etiket: "#9DB0C1",
  iyi: "#7BD88F",   // yeşil (kaydedildi) — koyu zeminde okunur ton
  kotu: "#FF8A9B",  // kırmızı (hata / 0 kredi) — koyu zeminde okunur ton
};

/**
 * Header'a gömülü hesap/hat kontrolleri (koyu tema). Yalnız girişli & düzenlenebilir
 * bağlamda görünür: Firebase yoksa, salt-okunur paylaşım görünümünde veya giriş
 * yokken null döner → header yalnız marka ile sade kalır.
 */
export function HesapKontrolleri() {
  const { user, hazir, yapilandirildi, cikisYap } = useAuth();
  const {
    demoMu, paylasimGorunumu, durum, hataMetni, projeler, aktifId, aktifAd,
    paylasimAcik, kota, kotaDoldu,
    projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle, paylasimDegistir,
  } = useHesap();
  const { bakiye, krediSatinAl } = useCuzdan();

  const [yeniAcik, setYeniAcik] = useState(false);
  const [odemeHata, setOdemeHata] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState("");
  const [kopyalandi, setKopyalandi] = useState(false);
  const [menuAcik, setMenuAcik] = useState(false);
  const [adTaslak, setAdTaslak] = useState<string | null>(null);
  const [isBasi, setIsBasi] = useState<string | null>(null);
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [hareketler, setHareketler] = useState<KrediHareket[]>([]);

  // Kontroller yalnız girişli & düzenlenebilir bağlamda görünür.
  if (!yapilandirildi || paylasimGorunumu || demoMu || !hazir || !user) return null;

  const sar = (p: Promise<unknown>, ad: string) => {
    setIsBasi(ad);
    p.catch(() => { /* durum context'te gösteriliyor */ }).finally(() => setIsBasi(null));
  };

  // Kredi geçmişini aç/kapa; açarken son hareketleri yükler.
  const gecmisiDegistir = async () => {
    const yeni = !gecmisAcik;
    setGecmisAcik(yeni);
    if (yeni && user) {
      try { setHareketler(await hareketleriGetir(user.uid, 12)); } catch { setHareketler([]); }
    }
  };

  const hareketAdi = (t: KrediHareket["tur"]) =>
    t === "satinalma" ? "Kredi alımı" : t === "rapor" ? "PDF rapor" : t === "projeYukleme" ? "Yeni hat" : "Düzeltme";

  const paylasimLinki = aktifId ? `${typeof window !== "undefined" ? window.location.origin : ""}/?proje=${aktifId}` : "";
  const silinebilir = projeler.length > 1 && Boolean(aktifId);
  const menuKapat = () => setMenuAcik(false);

  return (
    <div className="relative flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1.5 text-xs">
      {/* ── Hat grubu: etiket + seçici + yeni hat (birlikte hizalı durur) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden font-semibold uppercase tracking-[0.14em] sm:inline"
          style={{ color: koyu.etiket, fontSize: "0.6rem" }}>AKTİF HAT</span>

        {/* Hat seçici + yanındaki ✎ ile proje adı doğrudan düzenlenir. */}
        {adTaslak === null ? (
          <div className="flex items-center gap-1">
            <select
              value={aktifId ?? ""}
              onChange={(e) => projeSec(e.target.value)}
              title="Üzerinde çalıştığınız proje. Seçtiğiniz hat tüm modüllerde aktif olur."
              className="rounded-md border px-2.5 py-1 text-xs font-medium"
              style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: koyu.metin, colorScheme: "dark", maxWidth: 200 }}
            >
              {projeler.map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
            </select>
            {aktifId && (
              <button onClick={() => setAdTaslak(aktifAd)} title="Proje adını değiştir" aria-label="Proje adını değiştir"
                className="rounded-md border px-1.5 py-1 text-xs transition hover:bg-white/10"
                style={{ borderColor: koyu.kenar, color: koyu.metinYumusak }}>✎</button>
            )}
          </div>
        ) : (
          /* Satır-içi ad değiştirme — seçicinin yerinde */
          <div className="flex items-center gap-1">
            <input value={adTaslak} onChange={(e) => setAdTaslak(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { sar(projeAdiGuncelle(adTaslak.trim() || aktifAd), "ad"); setAdTaslak(null); } if (e.key === "Escape") setAdTaslak(null); }}
              className="rounded-md border px-2.5 py-1 text-xs" style={{ background: koyu.yuzey, borderColor: koyu.kenarGuclu, color: koyu.metin, maxWidth: 200 }} />
            <button onClick={() => { sar(projeAdiGuncelle(adTaslak.trim() || aktifAd), "ad"); setAdTaslak(null); }}
              className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: brand.red, color: "#fff" }}>Kaydet</button>
            <button onClick={() => setAdTaslak(null)} className="rounded-md px-2 py-1 text-xs" style={{ color: koyu.metinYumusak }}>Vazgeç</button>
          </div>
        )}

        {/* Yeni hat */}
        {yeniAcik ? (
          <>
            <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} placeholder="Yeni hat adı" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { setOdemeHata(null); sar(projeYeni(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); } if (e.key === "Escape") setYeniAcik(false); }}
              className="rounded-md border px-2.5 py-1 text-xs" style={{ background: koyu.yuzey, borderColor: koyu.kenarGuclu, color: koyu.metin }} />
            <button onClick={() => { setOdemeHata(null); sar(projeYeni(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); }} disabled={isBasi === "yeni"}
              className="rounded-md px-2.5 py-1 font-medium disabled:opacity-50" style={{ background: brand.red, color: "#fff" }}>Oluştur</button>
            <button onClick={() => setYeniAcik(false)} className="rounded-md px-2 py-1" style={{ color: koyu.metinYumusak }}>Vazgeç</button>
          </>
        ) : (
          <button onClick={() => setYeniAcik(true)} disabled={kotaDoldu}
            title={kotaDoldu
              ? `Hat kotanız dolu (${projeler.length}/${kota}). Yeni hat açmak için önce bir hattı silin.`
              : "Sıfırdan boş yeni bir proje açar"}
            className="rounded-md border px-2.5 py-1 font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: koyu.metinYumusak }}>＋ Yeni hat</button>
        )}
      </div>

      {/* İnce dikey ayraç — hat grubunu kayıt durumundan ayırır */}
      <span className="hidden h-4 w-px sm:block" style={{ background: koyu.kenar }} aria-hidden="true" />

      {/* Kaydetme durumu — ayrı bir "Kaydet" düğmesi yoktur, otomatik kaydedilir */}
      <span className="inline-flex items-center gap-1 font-medium" title="Değişiklikleriniz otomatik kaydedilir"
        style={{ color: durum === "hata" ? koyu.kotu : (durum === "kaydedildi" || durum === "hazir") ? koyu.iyi : koyu.etiket }}>
        {durum === "yukleniyor" && "⟳ yükleniyor…"}
        {durum === "kaydediliyor" && "⟳ kaydediliyor…"}
        {(durum === "kaydedildi" || durum === "hazir") && "✓ kaydedildi"}
        {durum === "hata" && `⚠ ${hataMetni ?? "kayıt hatası"}`}
      </span>

      {/* Kredi/ödeme uyarısı (yeni hat için yetersiz kredi vb.) */}
      {odemeHata && (
        <span className="max-w-xs truncate" title={odemeHata} style={{ color: koyu.kotu }}>⚠ {odemeHata}</span>
      )}

      {/* Kredi bakiyesi — ücretli rapor/proje yükleme bu krediden düşer */}
      <span title="Kredi bakiyeniz — rapor ve proje yükleme bundan düşer"
        className="inline-flex items-center rounded-full border px-2.5 py-1 font-medium tabular-nums"
        style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: bakiye === 0 ? koyu.kotu : koyu.metin }}>
        {bakiye === null ? "◌ kredi" : `◈ ${bakiye} kredi`}
      </span>

      {/* ⋮ menüsü — seyrek işler + kredi al + çıkış */}
      <button onClick={() => setMenuAcik((a) => !a)} title="Hesap · kredi · hat işlemleri · çıkış" aria-label="Hesap menüsü"
        className="rounded-md border px-2 py-1 font-medium leading-none transition hover:bg-white/10"
        style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: koyu.metin }}>⋮</button>

      {menuAcik && (
        <>
          {/* Dışarı tıklayınca kapanır */}
          <div className="fixed inset-0 z-30" onClick={menuKapat} />
          {/* Açılır menü açık temalı bir popover'dır (koyu header'dan sarkar) */}
          <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-md border py-1 shadow-xl"
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
                {KREDI_PAKETLERI.map((p) => {
                  const { indirimYuzde } = paketAvantaj(p);
                  return (
                    <button key={p.id}
                      onClick={async () => { setOdemeHata(null); const r = await krediSatinAl(p.id); if (r.hata) setOdemeHata(r.hata); }}
                      title={`${p.ad} — ${p.kredi} kredi, ${p.tl}₺ (KDV dâhil)${indirimYuzde > 0 ? ` · %${indirimYuzde} avantajlı` : ""}`}
                      className="relative rounded border px-2 py-1 text-xs font-medium transition hover:bg-slate-50"
                      style={{ borderColor: brand.border, color: brand.ink }}>
                      <span style={{ color: brand.faint }}>{p.ad}</span> · {p.kredi} kredi<span style={{ color: brand.muted }}> · {p.tl}₺</span>
                      {indirimYuzde > 0 && <span className="ml-1 rounded px-1 text-[0.6rem] font-semibold" style={{ background: CK.goodBg, color: CK.good }}>%{indirimYuzde}</span>}
                    </button>
                  );
                })}
              </div>
              {odemeHata && <div className="mt-1 text-[0.7rem]" style={{ color: brand.red }}>{odemeHata}</div>}
            </div>

            {/* Kredi geçmişi — satın alma + harcama hareketleri (denetim) */}
            <div className="border-b" style={{ borderColor: brand.border }}>
              <MenuOge onClick={() => { void gecmisiDegistir(); }}
                ad={gecmisAcik ? "Kredi geçmişi ▲" : "Kredi geçmişi ▼"}
                alt="Kredi alımları ve harcamalarınız" />
              {gecmisAcik && (
                <div className="max-h-40 overflow-auto px-3 pb-2">
                  {hareketler.length === 0 ? (
                    <div className="text-[0.7rem]" style={{ color: brand.muted }}>Henüz hareket yok.</div>
                  ) : hareketler.map((h) => (
                    <div key={h.id} className="flex items-center justify-between border-t py-1 text-[0.72rem]"
                      style={{ borderColor: brand.border }}>
                      <span style={{ color: brand.inkSoft }}>{hareketAdi(h.tur)}</span>
                      <span className="font-medium tabular-nums"
                        style={{ color: h.miktar > 0 ? CK.good : brand.red }}>
                        {h.miktar > 0 ? "+" : ""}{h.miktar}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

            {/* Tanıtım sihirbazını yeniden aç — bir daha "nasıl çalışır" için */}
            <div className="border-t" style={{ borderColor: brand.border }}>
              <MenuOge onClick={() => { menuKapat(); if (user) { karsilamaSifirla(user.uid); window.scrollTo({ top: 0 }); location.reload(); } }}
                ad="Tanıtımı göster" alt="RaySim iş akışı sihirbazını yeniden açar" />
            </div>

            {/* Oturumu kapat — çubuğun sadeleşmesi için ayrı buton yerine menüde */}
            <div className="border-t" style={{ borderColor: brand.border }}>
              <MenuOge onClick={() => { menuKapat(); cikisYap(); }}
                ad="Çıkış" alt="Oturumu kapatır; hatlarınız hesabınızda kalır" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Bağlamsal tam-genişlik bildirim şeritleri — header'ın hemen altında çizilir.
 * Ödeme dönüşü banner'ı ve salt-okunur paylaşım görünümü uyarısı. Kontrollerden
 * ayrıdır çünkü koyu header satırına değil, sayfa genişliğine yayılırlar.
 */
export function HesapBildirimleri() {
  const { user } = useAuth();
  const { paylasimGorunumu, paylasimdanCik, aktifAd } = useHesap();
  const { odemeSonucu, odemeSonucuTemizle } = useCuzdan();

  return (
    <>
      {/* Ödeme dönüşü bildirimi (iyzico callback sonrası) */}
      {odemeSonucu && (
        <div className="border-b" style={{
          background: odemeSonucu === "basarili" ? CK.goodBg : CK.amberBg,
          borderColor: odemeSonucu === "basarili" ? CK.good : CK.amber,
        }}>
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-2 text-xs" style={{ color: brand.ink }}>
            {odemeSonucu === "basarili"
              ? <span>✓ <b>Ödeme başarılı</b> — krediniz hesabınıza eklendi.</span>
              : <span>⚠ <b>Ödeme tamamlanamadı</b> — kredi eklenmedi. Tekrar deneyebilirsiniz.</span>}
            <button onClick={odemeSonucuTemizle} className="ml-auto rounded px-2 py-0.5 font-medium"
              style={{ color: brand.muted }}>kapat ✕</button>
          </div>
        </div>
      )}

      {/* Salt-okunur paylaşım görünümü uyarısı */}
      {paylasimGorunumu && (
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
      )}
    </>
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
