"use client";

// raysim — TEKNİK BELGELER modülü.
// Karşı taraf proje künyesini girer; mevcut hat (ringler) + parametrelerden
// amblemli, baskıya hazır PROFESYONEL PDF rapor üretir (sunucuda; /api/rapor,
// kredi düşülür). İçerik tamamen girilen projeden türer (Konya'ya bağlı değil).

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { sure } from "@/lib/anaray/format";
import { useSimConfig, useProje, useArac, useIsletme, useHesap } from "@/components/SimConfigProvider";
import { PROJE_META_ALANLAR } from "@/lib/anaray/config";
import { loopDenge, olceklenme, ringChallenge, ringDogrula, loopTamMi } from "@/lib/anaray/ring";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { type RaporDil } from "@/lib/anaray/rapor";
import { RAPOR_BOLUMLER, RAPOR_BOLUM_KREDI, RAPOR_BOLUM_AD, RAPOR_TABAN_KREDI, raporKredi, type RaporBolum } from "@/lib/raporFiyat";
import { useCuzdan } from "@/components/CuzdanProvider";
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
  const hazirKey = aktifId?.match(/^hazir_(mevcut|etap1|etap2|birlesik)_/)?.[1];
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
    if (!token) { setDurum({ tip: "err", metin: "Oturum bulunamadı — lütfen yeniden giriş yapın." }); return null; }
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
          ? `PDF rapor ${v.gereken} kredi ister; ${v.mevcut} krediniz var. Hesap çubuğundaki “Kredi al”dan yükleyin.`
          : (v.hata ?? "Rapor üretilemedi."),
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
      setDurum({ tip: "err", metin: "Açılır pencere engellendi — tarayıcı pop-up iznini bu site için açıp tekrar deneyin." });
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
      setDurum({ tip: "ok", metin: "Rapor yeni sekmede açıldı — yazdırma diyalogunda “Hedef: PDF olarak kaydet”i seçin." });
    } catch (e) {
      try { w.close(); } catch { /* yok say */ }
      setDurum({ tip: "err", metin: `Rapor açılamadı: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setMesgul(""); }
  };

  // Kapak logosu: yüklenen görseli küçült (kapak için ~18 mm yeterli) → PNG data URI.
  // Projeye kaydedilir; büyükse (data URI > ~300 KB) reddedilir (Firestore doküman sınırı).
  const logoYukle = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setDurum({ tip: "err", metin: "Logo okunamadı." });
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setDurum({ tip: "err", metin: "Görsel çözümlenemedi — PNG/JPG deneyin." });
      img.onload = () => {
        const maxW = 640, maxH = 220;
        const oran = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * oran)), h = Math.max(1, Math.round(img.height * oran));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setDurum({ tip: "err", metin: "Logo işlenemedi." }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const uri = canvas.toDataURL("image/png");
        if (uri.length > 300000) { setDurum({ tip: "err", metin: "Logo çok büyük — daha sade/küçük bir görsel deneyin." }); return; }
        patchMeta({ logo: uri });
        setDurum({ tip: "ok", metin: "Logo eklendi — PDF kapağında görünür." });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };


  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Teknik Belgeler — PDF Rapor Üretimi</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>Sinyalizasyon Tasarım Dokümantasyonu</h1>
        <p className="mt-2 max-w-3xl text-sm" style={{ color: brand.inkSoft }}>
          Proje künyeni gir; mevcut hat (ringler), filo ve parametrelerden amblemli, baskıya hazır <b>PDF rapor</b> üretilir. Hat şeması, ringler, sinyalizasyon, kapasite ve blocking-time bölümlerinin tamamı <b>senin projenden türer</b>.
        </p>
      </div>

      {/* Proje künyesi */}
      <Panel baslik="Proje Künyesi" aciklama={yazilabilir
        ? "Belgelerin kapağında ve künyesinde görünür. Hesabınıza otomatik kaydedilir."
        : "Belgelerin kapağında ve künyesinde görünür. Demo/paylaşım görünümünde düzenlenemez."}>
        {/* Künye proje verisidir → salt-okunur modda kapalı; belge üretimi AÇIK kalır
            (ziyaretçi demo hattının belgesini indirip kaliteyi görebilsin). */}
        <fieldset disabled={!yazilabilir} className="contents">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROJE_META_ALANLAR.map((a) => (
              <label key={a.key} className={a.genis ? "sm:col-span-2" : ""}>
                <span className="field-label">{a.ad}</span>
                <input value={typeof meta[a.key] === "string" ? (meta[a.key] as string) : ""} onChange={(e) => patchMeta({ [a.key]: e.target.value })}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-60" style={{ borderColor: brand.border, color: brand.ink }} />
              </label>
            ))}
          </div>

          {/* Müşavir/firma LOGOSU — PDF kapağına basılır. Küçültülüp data URI olarak
              projeye kaydedilir (boşsa firma adı/amblem gösterilir). */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <span className="field-label">Kapak logosu (opsiyonel)</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {meta.logo ? (
                // Kullanıcı yüklemesi (data URI) — next/image uygulanmaz; basit önizleme.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={meta.logo} alt="Kapak logosu" className="h-12 w-auto max-w-[180px] rounded border object-contain p-1" style={{ borderColor: brand.border, background: "#fff" }} />
              ) : (
                <span className="text-xs" style={{ color: brand.muted }}>Logo yok — kapakta firma adı görünür.</span>
              )}
              <label className="cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
                {meta.logo ? "Değiştir" : "📷 Logo yükle"}
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) logoYukle(f); e.currentTarget.value = ""; }} />
              </label>
              {meta.logo && (
                <button type="button" onClick={() => patchMeta({ logo: "" })} className="text-xs underline" style={{ color: brand.red }}>Kaldır</button>
              )}
            </div>
            <p className="mt-1 text-[0.7rem]" style={{ color: brand.muted }}>PNG/JPG/SVG · otomatik küçültülür (kapak yüksekliği ~18 mm). Şeffaf arka plan için PNG önerilir.</p>
          </div>
        </fieldset>
      </Panel>

      {/* İndirme */}
      <Panel baslik="PDF Rapor" aciklama="Amblemli kapak + KPI (temel performans göstergesi) kartları + hat şeması + sinyalizasyon + blocking-time (blok işgal süresi) grafiği — baskıya hazır. Yazdırma diyalogunda “PDF olarak kaydet” seçilir.">
        <div className="mb-3 flex items-center gap-2">
          <span className="field-label">Rapor dili</span>
          <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: brand.borderStrong }}>
            {(["tr", "en"] as RaporDil[]).map((d) => (
              <button key={d} onClick={() => setDil(d)} className="px-3 py-1 text-xs font-semibold uppercase transition"
                style={dil === d ? { background: brand.ink, color: "#fff" } : { background: "#fff", color: brand.inkSoft }}>
                {d === "tr" ? "Türkçe" : "English"}
              </button>
            ))}
          </div>
          <span className="text-xs" style={{ color: brand.muted }}>PDF rapor bu dilde üretilir (yapısal metinler; proje verisi/adlar kaynak dilde kalır).</span>
        </div>

        {/* QR DEEP-LINK anahtarı — rapordaki kare kodun bu hattın canlı simülasyonuna
            gitmesi paylaşımın açık olmasını gerektirir (salt-okunur, linki bilen görür). */}
        {yazilabilir && (
          <label className="mb-3 flex items-start gap-2 rounded border p-2.5 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>
            <input type="checkbox" checked={paylasimAcik} onChange={(e) => paylasimDegistir(e.target.checked)} className="mt-0.5 shrink-0" />
            <span>
              <b>Kapaktaki QR → bu hattın canlı simülasyonu.</b> Açıkken rapordaki kare kod, <b>bu hattın</b> salt-okunur canlı simülasyonuna gider — müşavir kamerayla tarayıp hattı işler hâlde görür. Kapalıyken QR ana sayfaya düşer.
              {paylasimAcik
                ? <span style={{ color: CK.good }}> ✓ Açık — QR bu hatta gider (linki bilen yalnız görüntüler, düzenleyemez).</span>
                : <span style={{ color: brand.muted }}> Kapalı. Açarsanız hat, linki bilen herkese salt-okunur görünür olur.</span>}
            </span>
          </label>
        )}

        {!hatTam && (
          <div className="mb-3 rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.ink }}>
            <div className="font-medium" style={{ color: brand.red }}>
              {rings.length === 0
                ? "⚠ Hat boş — resmî belge üretimi kapalı"
                : `⚠ Hat eksik — resmî belge üretimi kapalı (${eksikler.length} zorunlu şart)`}
            </div>
            {rings.length === 0 ? (
              <div className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                Bu hatta henüz durak arası ring tanımlı değil. Künyeyi şimdi doldurabilirsiniz; belgeler
                hattı kurduktan sonra üretilir.
              </div>
            ) : (
              <ul className="ml-4 mt-1 list-disc text-xs" style={{ color: brand.inkSoft }}>
                {eksikler.slice(0, 6).map((m, i) => (<li key={i}>{m}</li>))}
                {eksikler.length > 6 && <li>… ve {eksikler.length - 6} tane daha</li>}
              </ul>
            )}
            <div className="mt-1 text-xs" style={{ color: brand.muted }}>
              {rings.length === 0 ? "Hattı" : "Eksikleri"} <b>Ringler</b> modülünden {rings.length === 0 ? "kurun" : "tamamlayın"};
              belge ancak tam hattan üretilir.
            </div>
          </div>
        )}

        {/* BÖLÜM SEÇİCİ — hangi bölümler PDF'e girecek; fiyat KÜMÜLATİF (taban + seçilen). */}
        <div className="mb-3 rounded-md border p-3" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="field-label">Rapor Bölümleri — dâhil etmek istediklerini seç</span>
            <span className="text-xs" style={{ color: brand.muted }}>Taban {RAPOR_TABAN_KREDI} kredi — kapak + künye + içindekiler + Girdi Parametreleri + Sinyalizasyon (SG) daima dâhil</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RAPOR_BOLUMLER.map((b) => {
              const on = secim[b];
              return (
                <button key={b} type="button" onClick={() => secBolum(b)}
                  className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition"
                  style={on ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { background: "#fff", color: brand.inkSoft, borderColor: brand.border }}
                  title={on ? "Dâhil — çıkarmak için tıkla" : "Hariç — eklemek için tıkla"}>
                  <span>{on ? "✓ " : "＋ "}{dil === "en" ? RAPOR_BOLUM_AD[b].en : RAPOR_BOLUM_AD[b].tr}</span>
                  <span className="ml-1.5 rounded px-1 py-0.5 text-[0.6rem] font-bold" style={{ background: on ? "rgba(255,255,255,0.22)" : CK.track, color: on ? "#fff" : brand.muted }}>+{RAPOR_BOLUM_KREDI[b]} kr</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: brand.muted }}>
            <button type="button" onClick={() => setSecim(Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, true])) as Record<RaporBolum, boolean>)} className="underline">tümü</button>
            <button type="button" onClick={() => setSecim(Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, false])) as Record<RaporBolum, boolean>)} className="underline">yalnız taban</button>
            <span className="ml-auto text-sm font-semibold" style={{ color: brand.ink }}>Toplam: {toplamKredi} kredi</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={raporUret} disabled={!!mesgul || !hatTam}
            className="rounded-md px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
            {mesgul === "rapor" ? "Açılıyor…" : `🖨 PDF Rapor · ${toplamKredi} kredi`}
          </button>
          {durum && (
            <span className="text-sm" style={{ color: durum.tip === "err" ? brand.red : durum.tip === "ok" ? CK.good : brand.muted }}>
              {durum.tip === "ok" ? "✓ " : durum.tip === "err" ? "⚠ " : ""}{durum.metin}
            </span>
          )}
        </div>

        {/* Belge içeriği özeti */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat etiket="Durak arası hücre" deger={`${ozet.ring}`} alt={`${ozet.makas} makas`} />
          {sunum
            ? <MiniStat etiket="Değerlendirme" deger="Uygun" alt="tasarım onaylı" vurgu={CK.good} />
            : <MiniStat etiket="Challenge (zorluk) kaydı" deger={`${ozet.chSayi}`} alt={`${ozet.kritik} kritik`} vurgu={ozet.kritik > 0 ? brand.red : undefined} />}
          <MiniStat etiket={sunum ? "Belirleyici hücre" : "Darboğaz"} deger={ozet.darbogaz ? sure(ozet.darbogaz.worstToplam) : "—"} alt={ozet.darbogaz?.ad} vurgu={sunum ? undefined : brand.red} />
        </div>
        <div className="mt-2 text-xs" style={{ color: rings.length === 0 ? brand.muted : (sunum || (ozet.headwayUygun && ozet.dengeli)) ? CK.good : CK.amber }}>
          {rings.length === 0
            ? "Hat kurulduğunda burada headway/denge değerlendirmesi görünür."
            : (sunum || (ozet.headwayUygun && ozet.dengeli)) ? "✓ Belge: tüm hücreler headway'e uygun ve dengeli." : "▲ Belge, headway ihlali / dengesizlik uyarılarını içerecek."}
        </div>
      </Panel>

      {/* Sunum modu anahtarı — SADECE düzenleme modunda (yazilabilir) ve VARSAYILAN
          KAPALI bir açılır blok içinde: sunum sırasında ekranda göze çarpmaz; demo/
          paylaşım görünümünde (yazilabilir=false) hiç render edilmez. */}
      {yazilabilir && (
        <details className="mt-6 text-xs">
          <summary className="cursor-pointer select-none" style={{ color: brand.faint }}>⚙ Düzenleme araçları</summary>
          <label className="mt-2 flex items-start gap-2 rounded border p-2.5" style={{ borderColor: brand.border, color: brand.inkSoft }}>
            <input type="checkbox" checked={sunum} onChange={(e) => patchMeta({ sunumModu: e.target.checked })} className="mt-0.5 shrink-0" />
            <span>
              <b>Sunum modu</b> — açıkken rapor ve arayüzde uyarı/risk/denge işaretleri gizlenir, hat uygun/onaylı görünür.
              <span style={{ color: brand.faint }}> Değer düzenlerken KAPAT → gerçek headway/denge/kritik uyarılarını görürsün; sunumdan önce tekrar AÇ.</span>
            </span>
          </label>
        </details>
      )}

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Belge üretici — hat verisi Ringler modülünden, parametreler Sistem Merkezi&apos;nden gelir; belgeler bu tek kaynaktan üretilir.
      </footer>
    </div>
  );
}

function MiniStat({ etiket, deger, alt, vurgu }: { etiket: string; deger: string; alt?: string; vurgu?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: vurgu ?? brand.ink }}>{deger}</div>
      {alt && <div className="truncate text-xs" style={{ color: brand.faint }} title={alt}>{alt}</div>}
    </div>
  );
}

function Panel({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
