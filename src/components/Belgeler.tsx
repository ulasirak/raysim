"use client";

// raysim — TEKNİK BELGELER modülü.
// Karşı taraf proje künyesini girer; mevcut hat (ringler) + parametrelerden
// amblemli, baskıya hazır PROFESYONEL PDF rapor üretir (sunucuda; /api/rapor,
// kredi düşülür). İçerik tamamen girilen projeden türer (Konya'ya bağlı değil).

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { AutoAciklama } from "@/components/AutoAciklama";
import { CK } from "@/lib/anaray/chartkit";
import { sure } from "@/lib/anaray/format";
import { useSimConfig, useProje, useArac, useIsletme, useHesap } from "@/components/SimConfigProvider";
import { PROJE_META_ALANLAR } from "@/lib/anaray/config";

// Proje künyesi alan etiketleri (config.ts veri haritasındaki TR karşılıkları) →
// EN/DE. `a.key`'e göre çevrilir; eksikse TR ad'a düşer. Bkz. DilProvider.t.
const KUNYE_ETIKET: Record<string, { tr: string; en: string; de: string }> = {
  projeAdi: { tr: "Proje adı", en: "Project name", de: "Projektname" },
  hatAdi: { tr: "Hat adı", en: "Line name", de: "Linienname" },
  dokumanNo: { tr: "Doküman no", en: "Document no.", de: "Dokument-Nr." },
  revizyon: { tr: "Revizyon", en: "Revision", de: "Revision" },
  tarih: { tr: "Tarih", en: "Date", de: "Datum" },
  idare: { tr: "İdare / İşveren", en: "Authority / Client", de: "Auftraggeber" },
  yuklenici: { tr: "Yüklenici", en: "Contractor", de: "Auftragnehmer" },
  musavir: { tr: "Müşavir", en: "Consultant", de: "Berater" },
  sinyalizasyonFirmasi: { tr: "Sinyalizasyon firması", en: "Signalling company", de: "Signaltechnik-Firma" },
  hazirlayan: { tr: "Hazırlayan", en: "Prepared by", de: "Erstellt von" },
  onaylayan: { tr: "Onaylayan", en: "Approved by", de: "Genehmigt von" },
};
import { loopDenge, olceklenme, ringChallenge, ringDogrula, loopTamMi } from "@/lib/anaray/ring";
import { MiniStat, Durum } from "@/components/Kpi";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { type RaporDil } from "@/lib/anaray/rapor";
import { RAPOR_BOLUMLER, RAPOR_BOLUM_KREDI, RAPOR_BOLUM_AD, RAPOR_TABAN_KREDI, raporKredi, type RaporBolum } from "@/lib/raporFiyat";
import { useCuzdan } from "@/components/CuzdanProvider";
import { useDil } from "@/components/DilProvider";
import { getAuthInstance } from "@/lib/firebase";

// Rapor sekmesi açılır açılmaz gösterilen ŞIK yükleme ekranı (about:blank yerine).
// Kendi kendine yeten tam HTML: markalı, CSS spinner + ilerleme çubuğu. Rapor hazır
// olunca sekme blob URL'ine yönlendirilir ve bu ekran otomatik yerini rapora bırakır.
const YUKLEME_EKRANI = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapor hazırlanıyor…</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #F4F6F8 0%, #EAEEF2 60%, #E3E8ED 100%); color: #1F2933; }
  .card { text-align: center; padding: 40px 44px; }
  .brand { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; color: #1F2933; }
  .brand .r { color: #B3282D; }
  .spin { width: 46px; height: 46px; margin: 26px auto 20px; border: 4px solid #D5DBE1;
    border-top-color: #B3282D; border-radius: 50%; animation: sp 0.9s linear infinite; }
  @keyframes sp { to { transform: rotate(360deg); } }
  .msg { font-size: 15px; font-weight: 600; color: #334155; }
  .sub { margin-top: 6px; font-size: 12.5px; color: #64748B; }
  .bar { width: 240px; height: 4px; margin: 22px auto 0; background: #DDE3E9; border-radius: 4px; overflow: hidden; }
  .bar > i { display: block; height: 100%; width: 40%; border-radius: 4px; background: #B3282D;
    animation: mv 1.3s ease-in-out infinite; }
  @keyframes mv { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
  @media (prefers-color-scheme: dark) {
    body { background: radial-gradient(1200px 600px at 50% -10%, #1B2129 0%, #141A21 70%, #0F141A 100%); color: #E5EAF0; }
    .brand { color: #F1F5F9; } .msg { color: #CBD5E1; } .sub { color: #94A3B8; } .bar { background: #2A333D; }
    .spin { border-color: #2A333D; border-top-color: #E24B50; } .bar > i { background: #E24B50; }
  }
</style></head>
<body><div class="card">
  <div class="brand">Ray<span class="r">Sim</span></div>
  <div class="spin" role="status" aria-label="Yükleniyor"></div>
  <div class="msg">Rapor hazırlanıyor…</div>
  <div class="sub">Simülasyon çalışıyor · birkaç saniye sürebilir</div>
  <div class="bar"><i></i></div>
</div></body></html>`;

export function Belgeler() {
  const { t } = useDil();
  const { cfg } = useSimConfig();
  const { rings: ringsHam, meta, patchMeta, yazilabilir, subeler } = useProje();
  const { yenile } = useCuzdan();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();
  // QR DEEP-LINK: rapordaki QR, paylaşım açıksa BU projenin salt-okunur CANLI AĞ
  // SİMÜLASYONUNA gider — oturum gerektirmeden (?proje=<id> paylaşım görünümü),
  // &oynat=1#canli ile o bölüme kaydırıp simülasyonu otomatik başlatır. Kapalıysa
  // boş bırakılır → rapor QR'ı ana sayfaya düşer.
  const { aktifId, paylasimAcik, paylasimDegistir } = useHesap();
  // 4 hazır Konya hattının aktif ID'si `hazir_<key>_<uid>` biçimindedir. Bu hatlar için
  // QR'ı paylaşıma bağımlı `?proje=<id>` yerine `?hat=<key>`'e bağlarız: hat verisi
  // istemcide (hazirHatlar) yüklenir, paylaşım açık/kapalı fark etmez → QR ASLA ana
  // sayfaya düşmez, daima o hattın canlı sim sayfasını açar. Diğer (kullanıcı) projeleri
  // için paylaşım açıkken `?proje=<id>` kullanılır.
  const hazirKey = aktifId?.match(/^hazir_(mevcut|etap1|etap2|birlesik|samsun)_/)?.[1];
  const qrUrl = typeof window === "undefined" ? ""
    : hazirKey ? `${window.location.origin}/canli?hat=${hazirKey}`
    : (aktifId && paylasimAcik ? `${window.location.origin}/canli?proje=${aktifId}` : "");
  const turnaroundSn = Math.max(0, isletme.turnaroundDk) * 60; // dönüş bekleme → çevrim/filo hesabı
  // Yolcu dinamiği: dwell OTO ringlerin dwell'i hesaplanır → RAPOR da hesaplı dwell'i
  // kullanır (kapasite/canlı sim ile tutarlı). Ham ring yerine hesaplı ring geçilir.
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  // Sunum modu (bkz. rapor.ts): challenge/risk kaydı ve "ihlal/dengesizlik" uyarıları
  // gösterilmez; belge özeti uygun/dengeli olarak yansıtılır.
  const sunum = !!meta.sunumModu;
  const [durum, setDurum] = useState<{ tip: "ok" | "err" | "info"; metin: string } | null>(null);
  const [mesgul, setMesgul] = useState<"" | "rapor">("");
  const [dil, setDil] = useState<RaporDil>("tr");
  // Bölüm seçimi — kullanıcı hangi bölümleri PDF'e koyacağını seçer; fiyat kümülatif.
  const [secim, setSecim] = useState<Record<RaporBolum, boolean>>(
    () => Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, true])) as Record<RaporBolum, boolean>,
  );
  const toplamKredi = raporKredi(secim);
  const secBolum = (b: RaporBolum) => setSecim((s) => ({ ...s, [b]: !s[b] }));

  const ozet = useMemo(() => {
    const olcek = olceklenme(rings, stock, true, cfg);
    const denge = loopDenge(rings, stock, cfg);
    const chSayi = rings.reduce((n, r) => n + ringChallenge(r, stock, cfg).length, 0);
    const kritik = rings.reduce((n, r) => n + ringChallenge(r, stock, cfg).filter((c) => c.seviye === "kritik").length, 0);
    return {
      ring: rings.length,
      makas: rings.reduce((n, r) => n + r.makaslar.length, 0),
      darbogaz: olcek.darbogazRing,
      dengeli: denge.dengeli,
      headwayUygun: olcek.headwayUygun,
      chSayi, kritik,
    };
  }, [rings, stock, cfg]);

  // Belge geçerlilik kapısı: zorunlu şartları eksik bir hattan RESMÎ tasarım belgesi
  // üretmek yanıltıcı olur (karşı taraf onu doğru sanır). Eksikler açıkça listelenir.
  const hatTam = useMemo(() => loopTamMi(rings), [rings]);
  const eksikler = useMemo(
    () => rings.flatMap((r) => ringDogrula(r).map((e) => e.mesaj)),
    [rings]
  );

  // Rapor SUNUCUDA üretilir + kredi SUNUCUDA düşülür (bkz. /api/rapor). Hem
  // "yazdır→PDF" hem "HTML indir" bu ücretli uçtan geçer — HTML de raporun
  // tıpkısı olduğu için (yazdırınca PDF olur) ücretsiz kaçak bırakılmaz.
  // Dönüş: rapor HTML'i (hata durumunda null; mesaj setDurum'a yazılır).
  const raporAl = async (): Promise<string | null> => {
    const a = getAuthInstance();
    const token = await a?.currentUser?.getIdToken();
    if (!token) { setDurum({ tip: "err", metin: t({ tr: "Oturum bulunamadı — lütfen yeniden giriş yapın.", en: "Session not found — please sign in again.", de: "Sitzung nicht gefunden — bitte erneut anmelden." }) }); return null; }
    const yanit = await fetch("/api/rapor", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ veri: { rings, cfg, meta, arac: stock, turnaroundSn, filo: isletme.pikFilo, isletme, qrUrl, subeler }, dil, secim }),
    });
    if (!yanit.ok) {
      const v = await yanit.json().catch(() => ({}));
      setDurum({
        tip: "err",
        metin: v.hata === "yetersiz_kredi"
          ? t({
              tr: `PDF rapor ${v.gereken} kredi ister; ${v.mevcut} krediniz var. Hesap çubuğundaki “Kredi al”dan yükleyin.`,
              en: `The PDF report needs ${v.gereken} credits; you have ${v.mevcut}. Top up via “Buy credits” in the account bar.`,
              de: `Der PDF-Bericht benötigt ${v.gereken} Credits; Sie haben ${v.mevcut}. Laden Sie über „Credits kaufen“ in der Kontoleiste auf.`,
            })
          : (v.hata ?? t({ tr: "Rapor üretilemedi.", en: "Report could not be generated.", de: "Bericht konnte nicht erstellt werden." })),
      });
      return null;
    }
    await yenile(); // bakiye güncellendi
    return await yanit.text();
  };

  const raporUret = async () => {
    setMesgul("rapor"); setDurum(null);
    // Pencereyi TIKLAMA jesti içinde aç (popup engeline takılmasın). Popup engelliyse
    // dürüstçe uyar (aksi halde sessizce hiçbir şey açılmaz).
    const w = window.open("", "_blank", "width=920,height=1000");
    if (!w) {
      setDurum({ tip: "err", metin: t({ tr: "Açılır pencere engellendi — tarayıcı pop-up iznini bu site için açıp tekrar deneyin.", en: "Pop-up blocked — allow pop-ups for this site in your browser and try again.", de: "Pop-up blockiert — erlauben Sie Pop-ups für diese Seite im Browser und versuchen Sie es erneut." }) });
      setMesgul(""); return;
    }
    // Şık yükleme ekranı — boş (about:blank) sekme yerine markalı spinner. Hazır olunca
    // blob'a yönlendirilince bu ekran otomatik yerini rapora bırakır.
    try { w.document.open(); w.document.write(YUKLEME_EKRANI); w.document.close(); } catch { /* garantiye al */ }
    try {
      const html = await raporAl();
      if (!html) { w.close(); return; }
      // about:blank tuzağı: document.write ile büyük (gömülü SVG/font/data-URI'li) HTML
      // bazı tarayıcılarda BOŞ render eder. Bunun yerine gerçek bir Blob URL'ine gidip
      // sayfayı normal navigasyonla yükle → her varyasyonda güvenilir + yazdırılabilir.
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      w.location.href = url; // yükleme ekranından rapora doğrudan yönlendir
      // Belge yüklendikten sonra URL'i serbest bırak (yüklenen doküman bellekte kalır).
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      setDurum({ tip: "ok", metin: t({ tr: "Rapor yeni sekmede açıldı — yazdırma diyalogunda “Hedef: PDF olarak kaydet”i seçin.", en: "Report opened in a new tab — choose “Destination: Save as PDF” in the print dialog.", de: "Bericht in einem neuen Tab geöffnet — wählen Sie im Druckdialog „Ziel: Als PDF speichern“." }) });
    } catch (e) {
      try { w.close(); } catch { /* yok say */ }
      setDurum({ tip: "err", metin: `${t({ tr: "Rapor açılamadı:", en: "Report could not be opened:", de: "Bericht konnte nicht geöffnet werden:" })} ${e instanceof Error ? e.message : String(e)}` });
    } finally { setMesgul(""); }
  };

  // Kapak logosu: yüklenen görseli küçült (kapak için ~18 mm yeterli) → PNG data URI.
  // Projeye kaydedilir; büyükse (data URI > ~300 KB) reddedilir (Firestore doküman sınırı).
  const logoYukle = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setDurum({ tip: "err", metin: t({ tr: "Logo okunamadı.", en: "Logo could not be read.", de: "Logo konnte nicht gelesen werden." }) });
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setDurum({ tip: "err", metin: t({ tr: "Görsel çözümlenemedi — PNG/JPG deneyin.", en: "Image could not be decoded — try PNG/JPG.", de: "Bild konnte nicht decodiert werden — versuchen Sie PNG/JPG." }) });
      img.onload = () => {
        const maxW = 640, maxH = 220;
        const oran = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * oran)), h = Math.max(1, Math.round(img.height * oran));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setDurum({ tip: "err", metin: t({ tr: "Logo işlenemedi.", en: "Logo could not be processed.", de: "Logo konnte nicht verarbeitet werden." }) }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const uri = canvas.toDataURL("image/png");
        if (uri.length > 300000) { setDurum({ tip: "err", metin: t({ tr: "Logo çok büyük — daha sade/küçük bir görsel deneyin.", en: "Logo too large — try a simpler/smaller image.", de: "Logo zu groß — versuchen Sie ein einfacheres/kleineres Bild." }) }); return; }
        patchMeta({ logo: uri });
        setDurum({ tip: "ok", metin: t({ tr: "Logo eklendi — PDF kapağında görünür.", en: "Logo added — appears on the PDF cover.", de: "Logo hinzugefügt — erscheint auf dem PDF-Deckblatt." }) });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };


  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">{t({ tr: "Teknik Belgeler — PDF Rapor Üretimi", en: "Technical Documents — PDF Report Generation", de: "Technische Dokumente — PDF-Bericht-Erstellung" })}</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{t({ tr: "Sinyalizasyon Tasarım Dokümantasyonu", en: "Signalling Design Documentation", de: "Signaltechnik-Planungsdokumentation" })}</h1>
        <p className="mt-2 max-w-3xl text-sm" style={{ color: brand.inkSoft }}>
          {t({ tr: "Proje künyeni gir; mevcut hat (ringler), filo ve parametrelerden amblemli, baskıya hazır ", en: "Enter your project details; from the current line (cells), fleet and parameters, a branded, print-ready ", de: "Geben Sie Ihre Projektangaben ein; aus der aktuellen Linie (Abschnitte), Flotte und Parametern wird ein gebrandeter, druckfertiger " })}<b>{t({ tr: "PDF rapor", en: "PDF report", de: "PDF-Bericht" })}</b>{t({ tr: " üretilir. Hat şeması, ringler, sinyalizasyon, kapasite ve blocking-time bölümlerinin tamamı ", en: " is generated. The line diagram, cells, signalling, capacity and blocking-time sections are all ", de: " erstellt. Liniendiagramm, Abschnitte, Signaltechnik, Kapazität und Blockbelegungszeit-Abschnitte werden alle " })}<b>{t({ tr: "senin projenden türer", en: "derived from your project", de: "aus Ihrem Projekt abgeleitet" })}</b>.
        </p>
      </div>

      {/* Proje künyesi */}
      <Panel baslik={t({ tr: "Proje Künyesi", en: "Project Details", de: "Projektangaben" })} aciklama={yazilabilir
        ? t({ tr: "Belgelerin kapağında ve künyesinde görünür. Hesabınıza otomatik kaydedilir.", en: "Appears on the document cover and title page. Saved to your account automatically.", de: "Erscheint auf Deckblatt und Impressum der Dokumente. Wird automatisch in Ihrem Konto gespeichert." })
        : t({ tr: "Belgelerin kapağında ve künyesinde görünür. Demo/paylaşım görünümünde düzenlenemez.", en: "Appears on the document cover and title page. Not editable in demo/shared view.", de: "Erscheint auf Deckblatt und Impressum der Dokumente. In der Demo-/Freigabeansicht nicht bearbeitbar." })}>
        {/* Künye proje verisidir → salt-okunur modda kapalı; belge üretimi AÇIK kalır
            (ziyaretçi demo hattının belgesini indirip kaliteyi görebilsin). */}
        <fieldset disabled={!yazilabilir} className="contents">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROJE_META_ALANLAR.map((a) => (
              <label key={a.key} className={a.genis ? "sm:col-span-2" : ""}>
                <span className="field-label">{t(KUNYE_ETIKET[a.key] ?? { tr: a.ad })}</span>
                <input value={typeof meta[a.key] === "string" ? (meta[a.key] as string) : ""} onChange={(e) => patchMeta({ [a.key]: e.target.value })}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-60" style={{ borderColor: brand.border, color: brand.ink }} />
              </label>
            ))}
          </div>

          {/* Müşavir/firma LOGOSU — PDF kapağına basılır. Küçültülüp data URI olarak
              projeye kaydedilir (boşsa firma adı/amblem gösterilir). */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <span className="field-label">{t({ tr: "Kapak logosu (opsiyonel)", en: "Cover logo (optional)", de: "Deckblatt-Logo (optional)" })}</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {meta.logo ? (
                // Kullanıcı yüklemesi (data URI) — next/image uygulanmaz; basit önizleme.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={meta.logo} alt={t({ tr: "Kapak logosu", en: "Cover logo", de: "Deckblatt-Logo" })} className="h-12 w-auto max-w-[180px] rounded border object-contain p-1" style={{ borderColor: brand.border, background: "#fff" }} />
              ) : (
                <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "Logo yok — kapakta firma adı görünür.", en: "No logo — the company name appears on the cover.", de: "Kein Logo — der Firmenname erscheint auf dem Deckblatt." })}</span>
              )}
              <label className="cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
                {meta.logo ? t({ tr: "Değiştir", en: "Change", de: "Ändern" }) : t({ tr: "📷 Logo yükle", en: "📷 Upload logo", de: "📷 Logo hochladen" })}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) logoYukle(f); e.currentTarget.value = ""; }} />
              </label>
              {meta.logo && (
                <button type="button" onClick={() => patchMeta({ logo: "" })} className="text-xs underline" style={{ color: brand.red }}>{t({ tr: "Kaldır", en: "Remove", de: "Entfernen" })}</button>
              )}
            </div>
            <p className="mt-1 text-[0.7rem]" style={{ color: brand.muted }}>{t({ tr: "PNG/JPG/SVG · otomatik küçültülür (kapak yüksekliği ~18 mm). Şeffaf arka plan için PNG önerilir.", en: "PNG/JPG/SVG · resized automatically (cover height ~18 mm). PNG recommended for a transparent background.", de: "PNG/JPG/SVG · wird automatisch verkleinert (Deckblatthöhe ~18 mm). PNG für transparenten Hintergrund empfohlen." })}</p>
          </div>
        </fieldset>
      </Panel>

      {/* İndirme */}
      <Panel baslik={t({ tr: "PDF Rapor", en: "PDF Report", de: "PDF-Bericht" })} aciklama={t({ tr: "Amblemli kapak + KPI (temel performans göstergesi) kartları + hat şeması + sinyalizasyon + blocking-time (blok işgal süresi) grafiği — baskıya hazır. Yazdırma diyalogunda “PDF olarak kaydet” seçilir.", en: "Branded cover + KPI (key performance indicator) cards + line diagram + signalling + blocking-time chart — print-ready. Choose “Save as PDF” in the print dialog.", de: "Gebrandetes Deckblatt + KPI-Karten (Leistungskennzahlen) + Liniendiagramm + Signaltechnik + Blockbelegungszeit-Diagramm — druckfertig. Wählen Sie im Druckdialog „Als PDF speichern“." })}>
        <div className="mb-3 flex items-center gap-2">
          <span className="field-label">{t({ tr: "Rapor dili", en: "Report language", de: "Berichtssprache" })}</span>
          <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: brand.borderStrong }}>
            {(["tr", "en"] as RaporDil[]).map((d) => (
              <button key={d} onClick={() => setDil(d)} className="px-3 py-1 text-xs font-semibold uppercase transition"
                style={dil === d ? { background: brand.ink, color: "#fff" } : { background: "#fff", color: brand.inkSoft }}>
                {d === "tr" ? t({ tr: "Türkçe", en: "Turkish", de: "Türkisch" }) : t({ tr: "English", en: "English", de: "Englisch" })}
              </button>
            ))}
          </div>
          <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "PDF rapor bu dilde üretilir (yapısal metinler; proje verisi/adlar kaynak dilde kalır).", en: "The PDF report is produced in this language (structural text; project data/names stay in their source language).", de: "Der PDF-Bericht wird in dieser Sprache erstellt (strukturelle Texte; Projektdaten/-namen bleiben in der Ausgangssprache)." })}</span>
        </div>

        {/* QR DEEP-LINK anahtarı — rapordaki kare kodun bu hattın canlı simülasyonuna
            gitmesi paylaşımın açık olmasını gerektirir (salt-okunur, linki bilen görür). */}
        {yazilabilir && (
          <label className="mb-3 flex items-start gap-2 rounded border p-2.5 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>
            <input type="checkbox" checked={paylasimAcik} onChange={(e) => paylasimDegistir(e.target.checked)} className="mt-0.5 shrink-0" />
            <span>
              <b>{t({ tr: "Kapaktaki QR → bu hattın canlı simülasyonu.", en: "QR on the cover → this line's live simulation.", de: "QR auf dem Deckblatt → Live-Simulation dieser Linie." })}</b> {t({ tr: "Açıkken rapordaki kare kod, ", en: "When on, the report's QR code goes to ", de: "Wenn aktiviert, führt der QR-Code im Bericht zur " })}<b>{t({ tr: "bu hattın", en: "this line's", de: "schreibgeschützten Live-Simulation dieser Linie" })}</b>{t({ tr: " salt-okunur canlı simülasyonuna gider — müşavir kamerayla tarayıp hattı işler hâlde görür. Kapalıyken QR ana sayfaya düşer.", en: " read-only live simulation — the consultant scans it with a camera and sees the line running. When off, the QR falls back to the home page.", de: " — der Berater scannt ihn mit der Kamera und sieht die Linie in Betrieb. Wenn deaktiviert, führt der QR zur Startseite." })}
              {paylasimAcik
                ? <span style={{ color: CK.good }}> {t({ tr: "✓ Açık — QR bu hatta gider (linki bilen yalnız görüntüler, düzenleyemez).", en: "✓ On — the QR goes to this line (anyone with the link can only view, not edit).", de: "✓ Aktiviert — der QR führt zu dieser Linie (wer den Link kennt, kann nur ansehen, nicht bearbeiten)." })}</span>
                : <span style={{ color: brand.muted }}> {t({ tr: "Kapalı. Açarsanız hat, linki bilen herkese salt-okunur görünür olur.", en: "Off. If you turn it on, the line becomes read-only visible to anyone with the link.", de: "Deaktiviert. Wenn Sie es aktivieren, wird die Linie für jeden mit dem Link schreibgeschützt sichtbar." })}</span>}
            </span>
          </label>
        )}

        {!hatTam && (
          <div className="mb-3 rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.ink }}>
            <div className="font-medium" style={{ color: brand.red }}>
              {rings.length === 0
                ? t({ tr: "⚠ Hat boş — resmî belge üretimi kapalı", en: "⚠ Line empty — official document generation disabled", de: "⚠ Linie leer — offizielle Dokumenterstellung deaktiviert" })
                : `${t({ tr: "⚠ Hat eksik — resmî belge üretimi kapalı", en: "⚠ Line incomplete — official document generation disabled", de: "⚠ Linie unvollständig — offizielle Dokumenterstellung deaktiviert" })} (${eksikler.length} ${t({ tr: "zorunlu şart", en: "required conditions", de: "Pflichtbedingungen" })})`}
            </div>
            {rings.length === 0 ? (
              <div className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                {t({ tr: "Bu hatta henüz durak arası ring tanımlı değil. Künyeyi şimdi doldurabilirsiniz; belgeler hattı kurduktan sonra üretilir.", en: "No inter-stop cell is defined on this line yet. You can fill in the details now; documents are produced once the line is built.", de: "Für diese Linie ist noch kein Streckenabschnitt definiert. Sie können die Angaben jetzt ausfüllen; Dokumente werden erstellt, sobald die Linie aufgebaut ist." })}
              </div>
            ) : (
              <ul className="ml-4 mt-1 list-disc text-xs" style={{ color: brand.inkSoft }}>
                {eksikler.slice(0, 6).map((m, i) => (<li key={i}>{m}</li>))}
                {eksikler.length > 6 && <li>{t({ tr: "… ve", en: "… and", de: "… und" })} {eksikler.length - 6} {t({ tr: "tane daha", en: "more", de: "weitere" })}</li>}
              </ul>
            )}
            <div className="mt-1 text-xs" style={{ color: brand.muted }}>
              {rings.length === 0 ? t({ tr: "Hattı", en: "Set up the line via the", de: "Richten Sie die Linie über das Modul" }) : t({ tr: "Eksikleri", en: "Complete the gaps via the", de: "Ergänzen Sie das Fehlende über das Modul" })} <b>Ringler</b> {t({ tr: "modülünden", en: "module", de: "" })} {rings.length === 0 ? t({ tr: "kurun", en: "", de: "" }) : t({ tr: "tamamlayın", en: "", de: "" })};{" "}
              {t({ tr: "belge ancak tam hattan üretilir.", en: "a document is produced only from a complete line.", de: "ein Dokument wird nur aus einer vollständigen Linie erzeugt." })}
            </div>
          </div>
        )}

        {/* BÖLÜM SEÇİCİ — hangi bölümler PDF'e girecek; fiyat KÜMÜLATİF (taban + seçilen). */}
        <div className="mb-3 rounded-md border p-3" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label">{t({ tr: "Rapor Bölümleri — dâhil etmek istediklerini seç", en: "Report Sections — select which to include", de: "Berichtsabschnitte — wählen Sie die gewünschten aus" })}</span>
            <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "Taban", en: "Base", de: "Basis" })} {RAPOR_TABAN_KREDI} {t({ tr: "kredi — kapak + künye + içindekiler + Girdi Parametreleri + Sinyalizasyon (SG) daima dâhil", en: "credits — cover + title page + contents + Input Parameters + Signalling (SG) always included", de: "Credits — Deckblatt + Impressum + Inhalt + Eingabeparameter + Signaltechnik (SG) immer enthalten" })}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RAPOR_BOLUMLER.map((b) => {
              const on = secim[b];
              return (
                <button key={b} type="button" onClick={() => secBolum(b)}
                  className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition"
                  style={on ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { background: "#fff", color: brand.inkSoft, borderColor: brand.border }}
                  title={on ? t({ tr: "Dâhil — çıkarmak için tıkla", en: "Included — click to remove", de: "Enthalten — zum Entfernen klicken" }) : t({ tr: "Hariç — eklemek için tıkla", en: "Excluded — click to add", de: "Ausgeschlossen — zum Hinzufügen klicken" })}>
                  <span>{on ? "✓ " : "＋ "}{dil === "en" ? RAPOR_BOLUM_AD[b].en : RAPOR_BOLUM_AD[b].tr}</span>
                  <span className="ml-1.5 rounded px-1 py-0.5 text-[0.6rem] font-bold" style={{ background: on ? "rgba(255,255,255,0.22)" : CK.track, color: on ? "#fff" : brand.muted }}>+{RAPOR_BOLUM_KREDI[b]} kr</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: brand.muted }}>
            <button type="button" onClick={() => setSecim(Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, true])) as Record<RaporBolum, boolean>)} className="underline">{t({ tr: "tümü", en: "all", de: "alle" })}</button>
            <button type="button" onClick={() => setSecim(Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, false])) as Record<RaporBolum, boolean>)} className="underline">{t({ tr: "yalnız taban", en: "base only", de: "nur Basis" })}</button>
            <span className="ml-auto text-sm font-semibold" style={{ color: brand.ink }}>{t({ tr: "Toplam:", en: "Total:", de: "Gesamt:" })} {toplamKredi} {t({ tr: "kredi", en: "credits", de: "Credits" })}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={raporUret} disabled={!!mesgul || !hatTam}
            className="rounded-md px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
            {mesgul === "rapor" ? t({ tr: "Açılıyor…", en: "Opening…", de: "Wird geöffnet…" }) : `🖨 ${t({ tr: "PDF Rapor", en: "PDF Report", de: "PDF-Bericht" })} · ${toplamKredi} ${t({ tr: "kredi", en: "credits", de: "Credits" })}`}
          </button>
          {durum && (
            <span className="text-sm" style={{ color: durum.tip === "err" ? brand.red : durum.tip === "ok" ? CK.good : brand.muted }}>
              {durum.tip === "ok" ? "✓ " : durum.tip === "err" ? "⚠ " : ""}{durum.metin}
            </span>
          )}
        </div>

        {/* Belge içeriği özeti — ekranda HER ZAMAN gerçek değerler (mod yok). */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat etiket={t({ tr: "Durak arası hücre", en: "Inter-stop cell", de: "Streckenabschnitt" })} deger={`${ozet.ring}`} alt={`${ozet.makas} makas`} />
          <MiniStat etiket={t({ tr: "Challenge (zorluk) kaydı", en: "Challenge records", de: "Herausforderungen" })} deger={`${ozet.chSayi}`} alt={`${ozet.kritik} ${t({ tr: "kritik", en: "critical", de: "kritisch" })}`} vurgu={ozet.kritik > 0 ? brand.red : undefined} />
          <MiniStat etiket={t({ tr: "Darboğaz", en: "Bottleneck", de: "Engpass" })} deger={ozet.darbogaz ? sure(ozet.darbogaz.worstToplam) : "—"} alt={ozet.darbogaz?.ad} vurgu={brand.red} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: rings.length === 0 ? brand.muted : (ozet.headwayUygun && ozet.dengeli) ? CK.good : CK.amber }}>
          {rings.length > 0 && <Durum tip={(ozet.headwayUygun && ozet.dengeli) ? "uygun" : "uyari"} />}
          {rings.length === 0
            ? t({ tr: "Hat kurulduğunda burada headway/denge değerlendirmesi görünür.", en: "Once the line is built, the headway/balance assessment appears here.", de: "Sobald die Linie aufgebaut ist, erscheint hier die Zugfolgezeit-/Ausgeglichenheits-Bewertung." })
            : (ozet.headwayUygun && ozet.dengeli) ? t({ tr: "Belge: tüm hücreler headway'e uygun ve dengeli.", en: "Document: all cells are headway-compliant and balanced.", de: "Dokument: alle Abschnitte sind zugfolgezeitkonform und ausgeglichen." }) : t({ tr: "Belge, headway ihlali / dengesizlik uyarılarını içerecek.", en: "The document will include headway-violation / imbalance warnings.", de: "Das Dokument enthält Warnungen zu Zugfolgezeit-Verstößen / Ungleichgewicht." })}
          {sunum && <span style={{ color: brand.muted }}> {t({ tr: "· Not: PDF ", en: "· Note: the PDF ", de: "· Hinweis: Das PDF " })}<b>{t({ tr: "müşteri sunumu", en: "customer presentation", de: "Kundenpräsentation" })}</b>{t({ tr: " olarak, onaylı tasarım dilinde üretilecek.", en: " will be produced as one, in the approved-design language.", de: " wird als solche in der Sprache der freigegebenen Planung erstellt." })}</span>}
        </div>
      </Panel>

      {/* MÜŞTERİ SUNUMU (yalnız PDF) — ekranı DEĞİŞTİRMEZ; sadece üretilecek PDF'in
          dilini belirler. Düzenlenebilir bağlamda görünür; paylaşım/demo görünümünde
          (yazilabilir=false) hiç render edilmez. */}
      {yazilabilir && (
        <label className="mt-6 flex items-start gap-2 rounded border p-2.5 text-xs" style={{ borderColor: sunum ? CK.good : brand.border, background: sunum ? CK.goodBgSoft : "transparent", color: brand.inkSoft }}>
          <input type="checkbox" checked={sunum} onChange={(e) => patchMeta({ sunumModu: e.target.checked })} className="mt-0.5 shrink-0" />
          <span>
            <b>{t({ tr: "PDF'i müşteri sunumu olarak üret", en: "Produce the PDF as a customer presentation", de: "PDF als Kundenpräsentation erstellen" })}</b>{t({ tr: " — üretilecek raporda ihlal/risk/denge uyarıları, hat ", en: " — in the generated report, violation/risk/balance warnings are presented as an ", de: " — im erstellten Bericht werden Verstoß-/Risiko-/Ausgeglichenheits-Warnungen als " })}<b>{t({ tr: "onaylı/kesinleşmiş tasarım", en: "approved/finalized design", de: "freigegebene/endgültige Planung" })}</b>{t({ tr: " dilinde sunulur (belirleyici kısıt nötr anlatılır).", en: " (the governing constraint is described neutrally).", de: " dargestellt (die maßgebende Einschränkung wird neutral beschrieben)." })}
            <span style={{ color: brand.faint }}> {t({ tr: "Bu seçenek yalnızca PDF çıktısını etkiler; ", en: "This option only affects the PDF output; ", de: "Diese Option betrifft nur die PDF-Ausgabe; " })}<b>{t({ tr: "ekranda her zaman gerçek", en: "on screen you always see the real", de: "auf dem Bildschirm sehen Sie stets die echten" })}</b>{t({ tr: " headway/denge/kritik değerleri görürsünüz. Mühendislik teslimi için KAPALI bırakın.", en: " headway/balance/critical values. Leave OFF for engineering delivery.", de: " Zugfolgezeit-/Ausgeglichenheits-/kritischen Werte. Für die Ingenieurabgabe AUS lassen." })}</span>
          </span>
        </label>
      )}

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        {t({ tr: "RaySim · Belge üretici — hat verisi Ringler modülünden, parametreler Sistem Merkezi'nden gelir; belgeler bu tek kaynaktan üretilir.", en: "RaySim · Document generator — line data comes from the Ringler module, parameters from the System Center; documents are produced from this single source.", de: "RaySim · Dokumentgenerator — Liniendaten stammen aus dem Modul Ringler, Parameter aus dem Systemzentrum; Dokumente werden aus dieser einzigen Quelle erstellt." })}
      </footer>
    </div>
  );
}

function Panel({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 ds-card p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      <AutoAciklama metin={aciklama} className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }} />
      {children}
    </div>
  );
}
