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
import { useDil } from "@/components/DilProvider";
import { useAuth } from "@/components/AuthProvider";
import { useHesap, useProje, useIsletme } from "@/components/SimConfigProvider";
import { HatIceAktar } from "@/components/HatIceAktar";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import { useCuzdan } from "@/components/CuzdanProvider";
import { KREDI_PAKETLERI, paketAvantaj, hareketleriGetir, type KrediHareket } from "@/lib/cuzdan";
import { tanitimAc } from "@/components/Karsilama";
import { PaylasimPano } from "@/components/PaylasimPano";
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
  const { t } = useDil();
  const { user, hazir, yapilandirildi, cikisYap } = useAuth();
  const {
    demoMu, paylasimGorunumu, durum, hataMetni, projeler, aktifId, aktifAd,
    kota, kotaDoldu,
    projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle,
  } = useHesap();
  const { bakiye, krediSatinAl } = useCuzdan();
  // "+ Yeni hat" → dosyadan içe aktararak yeni proje kurma için (mevcut import motoru).
  const { setRings, patchMeta } = useProje();
  const { patchIsletme } = useIsletme();

  const [yeniAcik, setYeniAcik] = useState(false);
  const [iceModal, setIceModal] = useState(false); // dosyadan içe aktar modalı
  const [odemeHata, setOdemeHata] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState("");
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

  const hareketAdi = (tur: KrediHareket["tur"]) =>
    tur === "satinalma" ? t({ tr: "Kredi alımı", en: "Credit purchase", de: "Credit-Kauf" })
      : tur === "rapor" ? t({ tr: "PDF rapor", en: "PDF report", de: "PDF-Bericht" })
      : tur === "projeYukleme" ? t({ tr: "Yeni hat", en: "New line", de: "Neue Linie" })
      : t({ tr: "Düzeltme", en: "Correction", de: "Korrektur" });

  const silinebilir = projeler.length > 1 && Boolean(aktifId);
  const menuKapat = () => setMenuAcik(false);

  return (
    <div className="relative flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1.5 text-xs">
      {/* ── Hat grubu: etiket + seçici + yeni hat (birlikte hizalı durur) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden font-semibold uppercase tracking-[0.14em] sm:inline"
          style={{ color: koyu.etiket, fontSize: "0.6rem" }}>{t({ tr: "AKTİF HAT", en: "ACTIVE LINE", de: "AKTIVE LINIE" })}</span>

        {/* Hat seçici + yanındaki ✎ ile proje adı doğrudan düzenlenir. */}
        {adTaslak === null ? (
          <div className="flex items-center gap-1">
            <select
              value={aktifId ?? ""}
              onChange={(e) => projeSec(e.target.value)}
              title={t({ tr: "Üzerinde çalıştığınız proje. Seçtiğiniz hat tüm modüllerde aktif olur.", en: "The project you are working on. The selected line becomes active in all modules.", de: "Das Projekt, an dem Sie arbeiten. Die gewählte Linie wird in allen Modulen aktiv." })}
              className="rounded-md border px-2.5 py-1 text-xs font-medium"
              style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: koyu.metin, colorScheme: "dark", maxWidth: 200 }}
            >
              {projeler.map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
            </select>
            {aktifId && (
              <button onClick={() => setAdTaslak(aktifAd)} title={t({ tr: "Proje adını değiştir", en: "Rename project", de: "Projektname ändern" })} aria-label={t({ tr: "Proje adını değiştir", en: "Rename project", de: "Projektname ändern" })}
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
              className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: brand.red, color: "#fff" }}>{t({ tr: "Kaydet", en: "Save", de: "Speichern" })}</button>
            <button onClick={() => setAdTaslak(null)} className="rounded-md px-2 py-1 text-xs" style={{ color: koyu.metinYumusak }}>{t({ tr: "Vazgeç", en: "Cancel", de: "Abbrechen" })}</button>
          </div>
        )}

        {/* Yeni hat */}
        {yeniAcik ? (
          <>
            <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} placeholder={t({ tr: "Yeni hat adı", en: "New line name", de: "Name der neuen Linie" })} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { setOdemeHata(null); sar(projeYeni(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); } if (e.key === "Escape") setYeniAcik(false); }}
              className="rounded-md border px-2.5 py-1 text-xs" style={{ background: koyu.yuzey, borderColor: koyu.kenarGuclu, color: koyu.metin }} />
            <button onClick={() => { setOdemeHata(null); sar(projeYeni(yeniAd.trim()), "yeni"); setYeniAd(""); setYeniAcik(false); }} disabled={isBasi === "yeni"}
              className="rounded-md px-2.5 py-1 font-medium disabled:opacity-50" style={{ background: brand.red, color: "#fff" }}>{t({ tr: "Oluştur", en: "Create", de: "Erstellen" })}</button>
            <button onClick={() => setYeniAcik(false)} className="rounded-md px-2 py-1" style={{ color: koyu.metinYumusak }}>{t({ tr: "Vazgeç", en: "Cancel", de: "Abbrechen" })}</button>
            <span style={{ color: koyu.etiket }}>·</span>
            <button onClick={() => { setYeniAcik(false); setIceModal(true); }} title={t({ tr: "railML / GTFS / DXF / Shapefile dosyasından yeni hat kur", en: "Set up a new line from a railML / GTFS / DXF / Shapefile file", de: "Neue Linie aus einer railML- / GTFS- / DXF- / Shapefile-Datei erstellen" })}
              className="rounded-md border px-2.5 py-1 font-medium transition hover:bg-white/10"
              style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: koyu.metinYumusak }}>{t({ tr: "📁 Dosyadan", en: "📁 From file", de: "📁 Aus Datei" })}</button>
          </>
        ) : (
          <button onClick={() => setYeniAcik(true)} disabled={kotaDoldu}
            title={kotaDoldu
              ? `${t({ tr: "Hat kotanız dolu", en: "Your line quota is full", de: "Ihr Linienkontingent ist voll" })} (${projeler.length}/${kota}). ${t({ tr: "Yeni hat açmak için önce bir hattı silin.", en: "Delete a line first to open a new one.", de: "Löschen Sie zuerst eine Linie, um eine neue zu erstellen." })}`
              : t({ tr: "Sıfırdan boş yeni bir proje açar", en: "Opens a new, empty project from scratch", de: "Öffnet ein neues, leeres Projekt von Grund auf" })}
            className="rounded-md border px-2.5 py-1 font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: koyu.metinYumusak }}>{t({ tr: "＋ Yeni hat", en: "＋ New line", de: "＋ Neue Linie" })}</button>
        )}
      </div>

      {/* İnce dikey ayraç — hat grubunu kayıt durumundan ayırır */}
      <span className="hidden h-4 w-px sm:block" style={{ background: koyu.kenar }} aria-hidden="true" />

      {/* Kaydetme durumu — ayrı bir "Kaydet" düğmesi yoktur, otomatik kaydedilir */}
      <span className="inline-flex items-center gap-1 font-medium" title={t({ tr: "Değişiklikleriniz otomatik kaydedilir", en: "Your changes are saved automatically", de: "Ihre Änderungen werden automatisch gespeichert" })}
        style={{ color: durum === "hata" ? koyu.kotu : (durum === "kaydedildi" || durum === "hazir") ? koyu.iyi : koyu.etiket }}>
        {durum === "yukleniyor" && t({ tr: "⟳ yükleniyor…", en: "⟳ loading…", de: "⟳ wird geladen…" })}
        {durum === "kaydediliyor" && t({ tr: "⟳ kaydediliyor…", en: "⟳ saving…", de: "⟳ wird gespeichert…" })}
        {(durum === "kaydedildi" || durum === "hazir") && t({ tr: "✓ kaydedildi", en: "✓ saved", de: "✓ gespeichert" })}
        {durum === "hata" && `⚠ ${hataMetni ?? t({ tr: "kayıt hatası", en: "save error", de: "Speicherfehler" })}`}
      </span>

      {/* Kredi/ödeme uyarısı (yeni hat için yetersiz kredi vb.) */}
      {odemeHata && (
        <span className="max-w-xs truncate" title={odemeHata} style={{ color: koyu.kotu }}>⚠ {odemeHata}</span>
      )}

      {/* NOT: Eski global "◐ Sade" ekran-modu kaldırıldı. Ekran artık HER ZAMAN gerçek
          değerleri gösterir (mod yok); "müşteri sunumu olarak dışa aktar" seçeneği
          yalnız Belgeler'de, PDF üretimine özgü olarak durur. Bkz. Belgeler.tsx. */}

      {/* Kredi bakiyesi — ücretli rapor/proje yükleme bu krediden düşer */}
      <span title={t({ tr: "Kredi bakiyeniz — rapor ve proje yükleme bundan düşer", en: "Your credit balance — reports and project uploads are deducted from this", de: "Ihr Guthaben — Berichte und Projekt-Uploads werden davon abgezogen" })}
        className="inline-flex items-center rounded-full border px-2.5 py-1 font-medium tabular-nums"
        style={{ background: koyu.yuzey, borderColor: koyu.kenar, color: bakiye === 0 ? koyu.kotu : koyu.metin }}>
        {bakiye === null ? "◌ kredi" : `◈ ${bakiye} kredi`}
      </span>

      {/* ⋮ menüsü — seyrek işler + kredi al + çıkış */}
      <button onClick={() => setMenuAcik((a) => !a)} title={t({ tr: "Hesap · kredi · hat işlemleri · çıkış", en: "Account · credits · line actions · sign out", de: "Konto · Guthaben · Linienaktionen · Abmelden" })} aria-label={t({ tr: "Hesap menüsü", en: "Account menu", de: "Kontomenü" })}
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
              <div className="field-label" style={{ color: brand.faint }}>{t({ tr: "HESAP", en: "ACCOUNT", de: "KONTO" })}</div>
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
              <div className="field-label mb-1" style={{ color: brand.faint }}>{t({ tr: "KREDİ AL", en: "BUY CREDITS", de: "CREDITS KAUFEN" })}</div>
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
                ad={gecmisAcik ? t({ tr: "Kredi geçmişi ▲", en: "Credit history ▲", de: "Credit-Verlauf ▲" }) : t({ tr: "Kredi geçmişi ▼", en: "Credit history ▼", de: "Credit-Verlauf ▼" })}
                alt={t({ tr: "Kredi alımları ve harcamalarınız", en: "Your credit purchases and spending", de: "Ihre Credit-Käufe und Ausgaben" })} />
              {gecmisAcik && (
                <div className="max-h-40 overflow-auto px-3 pb-2">
                  {hareketler.length === 0 ? (
                    <div className="text-[0.7rem]" style={{ color: brand.muted }}>{t({ tr: "Henüz hareket yok.", en: "No transactions yet.", de: "Noch keine Buchungen." })}</div>
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

            {/* Paylaşım panosu — durum anahtarı + okunur link + kopyala + QR + mobil paylaş */}
            <PaylasimPano />

            {silinebilir && (
              <MenuOge tehlike
                onClick={() => { if (confirm(`“${aktifAd}” ${t({ tr: "kalıcı olarak silinsin mi?", en: "will be permanently deleted?", de: "dauerhaft löschen?" })}`)) { sar(projeSilmeIstegi(aktifId!), "sil"); menuKapat(); } }}
                ad={t({ tr: "Hattı sil", en: "Delete line", de: "Linie löschen" })} alt={t({ tr: "Bu projeyi kalıcı olarak siler (geri alınamaz)", en: "Permanently deletes this project (cannot be undone)", de: "Löscht dieses Projekt dauerhaft (nicht rückgängig zu machen)" })} />
            )}

            {/* Tanıtım sihirbazını yeniden aç — bir daha "nasıl çalışır" için */}
            <div className="border-t" style={{ borderColor: brand.border }}>
              <MenuOge onClick={() => { menuKapat(); tanitimAc(); }}
                ad={t({ tr: "Tanıtımı göster", en: "Show tour", de: "Tour anzeigen" })} alt={t({ tr: "RaySim iş akışı sihirbazını yeniden açar", en: "Reopens the RaySim workflow wizard", de: "Öffnet den RaySim-Workflow-Assistenten erneut" })} />
            </div>

            {/* Oturumu kapat — çubuğun sadeleşmesi için ayrı buton yerine menüde */}
            <div className="border-t" style={{ borderColor: brand.border }}>
              <MenuOge onClick={() => { menuKapat(); cikisYap(); }}
                ad={t({ tr: "Çıkış", en: "Sign out", de: "Abmelden" })} alt={t({ tr: "Oturumu kapatır; hatlarınız hesabınızda kalır", en: "Signs you out; your lines stay in your account", de: "Meldet Sie ab; Ihre Linien bleiben in Ihrem Konto" })} />
            </div>
          </div>
        </>
      )}

      {/* DOSYADAN YENİ HAT — mevcut import motoru (HatIceAktar) "yeni hat" modunda.
          Sistemi bozmayan ekstra giriş noktası: "+ Yeni hat" → 📁 Dosyadan. */}
      {iceModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:p-8"
          role="dialog" aria-modal="true" aria-label={t({ tr: "Dosyadan yeni hat", en: "New line from file", de: "Neue Linie aus Datei" })}
          onClick={(e) => { if (e.target === e.currentTarget) setIceModal(false); }}>
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl px-5 py-3" style={{ background: "linear-gradient(180deg,#0F2B40 0%,#0C2233 100%)" }}>
              <span className="font-brand text-sm font-semibold text-white">{t({ tr: "📁 Dosyadan yeni hat kur", en: "📁 Set up a new line from a file", de: "📁 Neue Linie aus Datei erstellen" })}</span>
              <button onClick={() => setIceModal(false)} className="rounded px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">{t({ tr: "✕ Kapat", en: "✕ Close", de: "✕ Schließen" })}</button>
            </div>
            <div className="px-4 py-4">
              <HatIceAktar gomulu onIceAktar={async (yeni: DurakArasiRing[], ad: string, _mod, koord?: Record<string, { lat: number; lon: number }>, geometri?: { insaat?: boolean; noktalar: [number, number][] }[]) => {
                try { await projeYeni(ad); setRings(() => yeni); patchMeta({ hatAdi: ad }); patchIsletme({ istasyonKoordinat: koord ?? {}, hatGeometri: geometri, koordinatKaynak: "iceaktar" }); setIceModal(false); }
                catch { /* hata hesap çubuğunda görünür; modal açık kalır */ }
              }} />
            </div>
          </div>
        </div>
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
  const { t } = useDil();
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
              ? <span>✓ <b>{t({ tr: "Ödeme başarılı", en: "Payment successful", de: "Zahlung erfolgreich" })}</b> {t({ tr: "— krediniz hesabınıza eklendi.", en: "— your credits have been added to your account.", de: "— Ihr Guthaben wurde Ihrem Konto gutgeschrieben." })}</span>
              : <span>⚠ <b>{t({ tr: "Ödeme tamamlanamadı", en: "Payment failed", de: "Zahlung fehlgeschlagen" })}</b> {t({ tr: "— kredi eklenmedi. Tekrar deneyebilirsiniz.", en: "— no credit was added. You can try again.", de: "— es wurde kein Guthaben hinzugefügt. Sie können es erneut versuchen." })}</span>}
            <button onClick={odemeSonucuTemizle} className="ml-auto rounded px-2 py-0.5 font-medium"
              style={{ color: brand.muted }}>{t({ tr: "kapat ✕", en: "close ✕", de: "schließen ✕" })}</button>
          </div>
        </div>
      )}

      {/* Salt-okunur paylaşım görünümü uyarısı */}
      {paylasimGorunumu && (
        <Serit renk={CK.amber}>
          <span style={{ color: brand.ink }}>
            👁 <b>{t({ tr: "Salt-okunur paylaşım görünümü", en: "Read-only shared view", de: "Schreibgeschützte Freigabeansicht" })}</b> — “{aktifAd}”. {t({ tr: "Değişiklik yapılamaz.", en: "No changes possible.", de: "Keine Änderungen möglich." })}
          </span>
          {/* Buton, adresteki ?proje= parametresini de siler — yalnız "/" linki
              vermek görünümden ÇIKARMIYORDU (sağlayıcı yeniden kurulmuyor). */}
          <button onClick={paylasimdanCik} className="ml-auto rounded px-2.5 py-1 text-xs font-medium"
            style={{ background: brand.ink, color: "#fff" }}>
            {user ? t({ tr: "Kendi hattıma dön", en: "Back to my line", de: "Zu meiner Linie" }) : t({ tr: "Giriş yap", en: "Sign in", de: "Anmelden" })}
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
