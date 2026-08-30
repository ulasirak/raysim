"use client";

// raysim — TEKNİK BELGELER modülü.
// Karşı taraf proje künyesini girer; mevcut hat (ringler) + parametrelerden
// profesyonel Word (.docx) Tasarım El Kitabı ve Excel (.xlsx) çalışma kitabı
// üretir. İçerik tamamen girilen projeden türer (Konya'ya bağlı değil).

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { sure, indir } from "@/lib/anaray/format";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { PROJE_META_ALANLAR } from "@/lib/anaray/config";
import { loopDenge, olceklenme, ringChallenge, ringDogrula, loopTamMi } from "@/lib/anaray/ring";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
// wordUret/excelUret ağır (docx + exceljs ~1MB) — statik import etmiyoruz; yalnız
// ilgili buton tıklandığında await import() ile tembel yüklenir (indir hafif, format'ta).
import { type RaporDil } from "@/lib/anaray/rapor";
import { useCuzdan } from "@/components/CuzdanProvider";
import { getAuthInstance } from "@/lib/firebase";

export function Belgeler() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam, meta, patchMeta, yazilabilir } = useProje();
  const { yenile } = useCuzdan();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();
  const turnaroundSn = Math.max(0, isletme.turnaroundDk) * 60; // dönüş bekleme → çevrim/filo hesabı
  // Yolcu dinamiği: dwell OTO ringlerin dwell'i hesaplanır → RAPOR da hesaplı dwell'i
  // kullanır (kapasite/canlı sim ile tutarlı). Ham ring yerine hesaplı ring geçilir.
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  // Sunum modu (bkz. rapor.ts): challenge/risk kaydı ve "ihlal/dengesizlik" uyarıları
  // gösterilmez; belge özeti uygun/dengeli olarak yansıtılır.
  const sunum = !!meta.sunumModu;
  const [durum, setDurum] = useState<{ tip: "ok" | "err" | "info"; metin: string } | null>(null);
  const [mesgul, setMesgul] = useState<"" | "word" | "excel" | "rapor" | "html">("");
  const [dil, setDil] = useState<RaporDil>("tr");

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

  const dosyaAdi = (ext: string) => `${meta.dokumanNo || "raysim"}_${(meta.hatAdi || "hat").replace(/\s+/g, "_")}.${ext}`;

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
      body: JSON.stringify({ veri: { rings, cfg, meta, arac: stock, turnaroundSn }, dil }),
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
    // Pencereyi TIKLAMA jesti içinde aç (popup engeline takılmasın); içeriği
    // sunucudan gelince doldur.
    const w = window.open("", "_blank", "width=920,height=1000");
    try {
      const html = await raporAl();
      if (!html) { w?.close(); return; }
      if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      setDurum({ tip: "ok", metin: "Rapor yeni sekmede açıldı — yazdırma diyalogunda “Hedef: PDF olarak kaydet”i seçin." });
    } catch (e) {
      w?.close();
      setDurum({ tip: "err", metin: `Rapor açılamadı: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setMesgul(""); }
  };

  const raporHTMLIndir = async () => {
    setMesgul("html"); setDurum(null);
    try {
      const html = await raporAl();
      if (!html) return;
      indir(new Blob([html], { type: "text/html;charset=utf-8" }), dosyaAdi(`${dil}.html`));
      setDurum({ tip: "ok", metin: `Rapor (HTML) indirildi: ${dosyaAdi("html")}` });
    } catch (e) {
      setDurum({ tip: "err", metin: `HTML üretilemedi: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setMesgul(""); }
  };

  const wordIndir = async () => {
    setMesgul("word"); setDurum(null);
    try {
      const { wordUret } = await import("@/lib/anaray/dokuman");
      const blob = await wordUret(meta, cfg, rings, stock, turnaroundSn);
      indir(blob, dosyaAdi("docx"));
      setDurum({ tip: "ok", metin: `Word belgesi üretildi: ${dosyaAdi("docx")}` });
    } catch (e) {
      setDurum({ tip: "err", metin: `Word üretilemedi: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setMesgul(""); }
  };

  const excelIndir = async () => {
    setMesgul("excel"); setDurum(null);
    try {
      const { excelUret } = await import("@/lib/anaray/dokuman");
      const blob = await excelUret(meta, cfg, rings, stock, turnaroundSn);
      indir(blob, dosyaAdi("xlsx"));
      setDurum({ tip: "ok", metin: `Excel çalışma kitabı üretildi: ${dosyaAdi("xlsx")}` });
    } catch (e) {
      setDurum({ tip: "err", metin: `Excel üretilemedi: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setMesgul(""); }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Teknik Belgeler — Word & Excel Üretimi</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>Sinyalizasyon Tasarım Dokümantasyonu</h1>
        <p className="mt-2 max-w-3xl text-sm" style={{ color: brand.inkSoft }}>
          Proje künyeni gir; mevcut hat (ringler) ve parametrelerden profesyonel <b>Tasarım El Kitabı (.docx)</b> ve <b>çalışma kitabı (.xlsx)</b> üretilir. Hat şeması, ringler, kapasite ve blocking-time bölümlerinin tamamı <b>senin projenden türer</b>.
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
        </fieldset>
      </Panel>

      {/* İndirme */}
      <Panel baslik="Belge Üret" aciklama="Şık PDF = amblemli kapak + KPI (temel performans göstergesi) kartları + hat şeması + blocking-time (blok işgal süresi) grafiği (baskıya hazır). Word = düzenlenebilir Tasarım El Kitabı. Excel = çok sayfalı çalışma kitabı.">
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
          <span className="text-xs" style={{ color: brand.muted }}>PDF/HTML rapor bu dilde üretilir (yapısal metinler; proje verisi/adlar kaynak dilde kalır).</span>
        </div>
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

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={raporUret} disabled={!!mesgul || !hatTam}
            className="rounded-md px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
            {mesgul === "rapor" ? "Açılıyor…" : "🖨 Şık PDF Rapor"}
          </button>
          <button onClick={raporHTMLIndir} disabled={!!mesgul || !hatTam}
            className="rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
            {mesgul === "html" ? "İndiriliyor…" : "⭳ HTML indir (tek tık)"}
          </button>
          <button onClick={wordIndir} disabled={!!mesgul || !hatTam}
            className="rounded-md px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.ink }}>
            {mesgul === "word" ? "Üretiliyor…" : "📄 Word (.docx) indir"}
          </button>
          <button onClick={excelIndir} disabled={!!mesgul || !hatTam}
            className="rounded-md px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: CK.good }}>
            {mesgul === "excel" ? "Üretiliyor…" : "📊 Excel (.xlsx) indir"}
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
