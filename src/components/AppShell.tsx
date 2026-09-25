"use client";

// raysim — ortak uygulama kabuğu (tek sistem navigasyonu).
// Tüm modüller (Ringler / Sefer / Sistem / Teknik Belgeler) aynı Masthead + nav
// altında mantıksal olarak bağlıdır. Aktif modül yola (pathname) göre belirlenir;
// Masthead künyesi ve rota buradan beslenir. Sayfalar yalnız içeriklerini döner.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { SimConfigProvider } from "@/components/SimConfigProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { HesapKontrolleri, HesapBildirimleri } from "@/components/HesapCubugu";
import { CuzdanProvider } from "@/components/CuzdanProvider";
import { Kapi, useErisim } from "@/components/Kapi";
import { BOLUM_SLUG, type BolumSlug } from "@/components/TekSayfa";
import { BasaDonButonu } from "@/components/BasaDonButonu";
import { KayitBildirimi } from "@/components/KayitBildirimi";
import { OdemeModal } from "@/components/OdemeModal";
import { ParametreDuzenleButonu } from "@/components/ParametreDuzenleButonu";
import { Karsilama } from "@/components/Karsilama";
import { SunumModu } from "@/components/SunumModu";
import { DilProvider, useDil, DIL_ADI, type Ceviri, type Dil } from "@/components/DilProvider";

/** Header dil anahtarı (TR · EN · DE) — koyu mürekkep zemine göre. Her yerde görünür. */
function DilAnahtari() {
  const { dil, setDil } = useDil();
  return (
    <div className="flex items-center gap-0.5 rounded-full border px-0.5 py-0.5" style={{ borderColor: "rgba(255,255,255,0.25)" }} role="group" aria-label="Dil / Language / Sprache">
      {(["tr", "en", "de"] as Dil[]).map((d) => (
        <button key={d} type="button" onClick={() => setDil(d)} title={DIL_ADI[d]} aria-pressed={dil === d}
          className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide transition"
          style={dil === d ? { background: "#A8842C", color: "#0C2233" } : { color: "#B9C6D2" }}>{d}</button>
      ))}
    </div>
  );
}
import { brand } from "@/lib/anaray/brand";

interface Modul {
  /** Eski derin rota (uyumluluk + paylaşım/`?bolge=` linkleri için korunur). */
  href: string;
  /** Tek sayfadaki bölüm ankoru — TekSayfa'daki id ile AYNI. */
  slug: BolumSlug;
  ad: Ceviri;
  rol: Ceviri;
  kod: string;
  rota: string;
}

// Boru hattı sırası TEK SAYFA bölüm sırasıyla birebir aynı (BOLUM_SLUG) — veri
// akışı: KUR (Ringler) → ANALİZ (Sefer·Sistem) → BELGELE.
// Numaralı metro istasyonları bu akışı görselleştirir. (Guard aşağıda sırayı zorlar.)
const MODULLER: Modul[] = [
  { href: "/ringler", slug: "ringler", ad: { tr: "Durak Arası Ringler", en: "Inter-Stop Cells", de: "Streckenabschnitte" }, rol: { tr: "İşletim hücreleri · worst/best (en kötü/en iyi) · loop (çevrim)", en: "Operating cells · worst/best · loop (cycle)", de: "Betriebszellen · Worst/Best · Umlauf" }, kod: "SR-0001", rota: "Durak Arası Ring Şartları" },
  { href: "/", slug: "sefer", ad: { tr: "Sefer Simülasyonu", en: "Service Simulation", de: "Betriebssimulation" }, rol: { tr: "Canlı ağ · fizik · headway (sefer aralığı) · kapasite", en: "Live network · physics · headway · capacity", de: "Live-Netz · Physik · Zugfolgezeit · Kapazität" }, kod: "SR-0002", rota: "Ana Hat Sefer Analizi" },
  { href: "/sistem", slug: "sistem", ad: { tr: "Sistem Merkezi", en: "System Center", de: "Systemzentrale" }, rol: { tr: "Kapasite · blocking-time · teşhis", en: "Capacity · blocking-time · diagnosis", de: "Kapazität · Sperrzeit · Diagnose" }, kod: "SR-0003", rota: "Kapasite Analizi & Durum" },
  { href: "/belgeler", slug: "belgeler", ad: { tr: "Teknik Belgeler", en: "Technical Documents", de: "Technische Dokumente" }, rol: { tr: "Ücretli PDF rapor · tasarım el kitabı", en: "PDF report · design handbook", de: "PDF-Bericht · Planungshandbuch" }, kod: "SR-0005", rota: "Teknik Dokümantasyon Üretimi" },
  { href: "/karsilastirma", slug: "karsilastirma", ad: { tr: "Karşılaştırma", en: "Comparison", de: "Vergleich" }, rol: { tr: "Senaryo/proje kıyas · karar desteği", en: "Scenario/project comparison · decision support", de: "Szenarien-/Projektvergleich · Entscheidungshilfe" }, kod: "SR-0006", rota: "Senaryo Karşılaştırma & Karar" },
];

// slug sırası ile BOLUM_SLUG'ın kaymadığını derleme anında yakalar.
BOLUM_SLUG.forEach((s, i) => {
  if (MODULLER[i]?.slug !== s) throw new Error(`AppShell/TekSayfa bölüm sırası uyuşmuyor: ${s}`);
});

function aktifModul(pathname: string): Modul {
  if (pathname === "/") return MODULLER[0];
  return MODULLER.find((m) => m.href !== "/" && pathname.startsWith(m.href)) ?? MODULLER[0];
}

/**
 * Ana sayfada görünür bölümü izler (scroll-spy). En üstte olan bölümün slug'ını
 * döndürür; ankor navigasyonu ile Masthead künyesi buna göre canlı güncellenir.
 * Ana sayfa dışında pasif kalır (null).
 */
function useAktifBolum(aktifMi: boolean): BolumSlug | null {
  const [slug, setSlug] = useState<BolumSlug | null>(null);
  useEffect(() => {
    // Ana sayfa dışında dinleyici kurulmaz; slug kullanılmadığı için sıfırlamaya
    // gerek yok (ana sayfaya dönünce yeniden kurulup günceller).
    if (!aktifMi) return;

    // Scroll-spy'ı kaydırma konumundan DETERMİNİSTİK hesaplıyoruz (IntersectionObserver
    // yerine): navigasyon çizgisini (nav alt kenarı) geçen SON bölüm aktiftir; böylece
    // ekrandan büyük bölümler ve sayfa sonundaki son bölüm de doğru vurgulanır.
    const NAV_ESIK = 150; // sticky nav + pay
    let bekliyor = false;

    const hesapla = () => {
      bekliyor = false;
      let secili: BolumSlug = BOLUM_SLUG[0];
      for (const s of BOLUM_SLUG) {
        const el = document.getElementById(s);
        if (el && el.getBoundingClientRect().top <= NAV_ESIK) secili = s;
      }
      // Sayfa dibine gelindiyse (son bölüm çizgiye ulaşamayabilir) son bölümü seç.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        secili = BOLUM_SLUG[BOLUM_SLUG.length - 1];
      }
      setSlug((onceki) => (onceki === secili ? onceki : secili));
    };

    const tetikle = () => {
      if (bekliyor) return;
      bekliyor = true;
      requestAnimationFrame(hesapla);
    };

    hesapla(); // ilk konum
    window.addEventListener("scroll", tetikle, { passive: true });
    window.addEventListener("resize", tetikle, { passive: true });
    return () => {
      window.removeEventListener("scroll", tetikle);
      window.removeEventListener("resize", tetikle);
    };
  }, [aktifMi]);
  return slug;
}

/**
 * Sayfanın toplam dikey kaydırma ilerlemesini 0..1 arası döndürür. Metro-hattı
 * navigasyonundaki "tren" bu değere göre rayda kesintisiz akar ve üstteki ince
 * ilerleme çizgisini besler. Ana sayfa dışında pasif (0).
 */
function useKaydirmaIlerlemesi(aktifMi: boolean): number {
  const [oran, setOran] = useState(0);
  useEffect(() => {
    if (!aktifMi) return;
    let bekliyor = false;
    const hesapla = () => {
      bekliyor = false;
      const kat = document.documentElement.scrollHeight - window.innerHeight;
      setOran(kat > 0 ? Math.min(1, Math.max(0, window.scrollY / kat)) : 0);
    };
    const tetikle = () => {
      if (bekliyor) return;
      bekliyor = true;
      requestAnimationFrame(hesapla);
    };
    hesapla();
    window.addEventListener("scroll", tetikle, { passive: true });
    window.addEventListener("resize", tetikle, { passive: true });
    return () => {
      window.removeEventListener("scroll", tetikle);
      window.removeEventListener("resize", tetikle);
    };
  }, [aktifMi]);
  return oran;
}

/**
 * Sayfa bir eşiği (px) geçecek kadar kaydırıldı mı — metro-nav'ı kaydırınca ince
 * şeride indirmek (kompakt mod) için. Yalnız eşik geçilince state değişir (nadir
 * re-render); Govde'nin `children`'ı sabit referans olduğundan alt ağaç etkilenmez.
 */
function useKompaktNav(aktifMi: boolean, esik = 64): boolean {
  const [kompakt, setKompakt] = useState(false);
  useEffect(() => {
    if (!aktifMi) { setKompakt(false); return; }
    let bekliyor = false;
    const hesapla = () => {
      bekliyor = false;
      const y = window.scrollY > esik;
      setKompakt((k) => (k === y ? k : y));
    };
    const tetikle = () => { if (bekliyor) return; bekliyor = true; requestAnimationFrame(hesapla); };
    hesapla();
    window.addEventListener("scroll", tetikle, { passive: true });
    return () => window.removeEventListener("scroll", tetikle);
  }, [aktifMi, esik]);
  return kompakt;
}

/**
 * Geniş ekran (≥1024px) olup olmadığını döndürür — metro-hattı ile kompakt ızgara
 * navigasyonu arasında DETERMİNİSTİK geçiş için. (Tailwind responsive display
 * sınıfları yerine JS breakpoint: araç zinciri/önbellek kaprislerinden bağımsız.)
 * SSR'de false varsayılır (mobil-öncelikli), mount'ta gerçek değere geçer.
 */
function useGenisEkran(): boolean {
  const [genis, setGenis] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const uygula = () => setGenis(mq.matches);
    uygula();
    mq.addEventListener("change", uygula);
    return () => mq.removeEventListener("change", uygula);
  }, []);
  return genis;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DilProvider>
      <AuthProvider>
        <SimConfigProvider>
          <CuzdanProvider>
            <Govde>{children}</Govde>
          </CuzdanProvider>
        </SimConfigProvider>
      </AuthProvider>
    </DilProvider>
  );
}

/** Kabuk gövdesi — sağlayıcıların İÇİNDE olduğu için oturum durumunu okuyabilir. */
function Govde({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const anaSayfa = pathname === "/";
  const { t } = useDil();
  // Giriş yapılmadan modül navigasyonu ve hesap çubuğu gösterilmez: site,
  // ziyaretçiyi doğrudan giriş/kayıt ekranıyla karşılar.
  const erisim = useErisim();
  const icerikVar = erisim === "acik";

  // Ana sayfada aktif bölüm kaydırmayla belirlenir; eski derin rotalarda yola göre.
  const aktifBolum = useAktifBolum(anaSayfa && icerikVar);
  const aktif = anaSayfa
    ? (MODULLER.find((m) => m.slug === aktifBolum) ?? MODULLER[0])
    : aktifModul(pathname);
  const aktifIndex = Math.max(0, MODULLER.findIndex((m) => m.slug === aktif.slug));

  // Rayda akan "tren": ana sayfada kesintisiz kaydırma ilerlemesi; eski derin
  // rotalarda aktif istasyonun oransal konumu (durağan gösterim).
  const kaydirma = useKaydirmaIlerlemesi(anaSayfa && icerikVar);
  const ilerleme = anaSayfa ? kaydirma : aktifIndex / Math.max(1, MODULLER.length - 1);
  const genisEkran = useGenisEkran();
  // Kaydırınca nav ince şeride iner (alt-başlıklar gizlenir, dolgu daralır); ray
  // hizası dinamik `top` ile korunur, --ray-nav-h ResizeObserver ile kendini günceller.
  const kompakt = useKompaktNav(icerikVar);
  const rayTop = kompakt ? 18 : 30; // istasyon nokrası merkezine hizalı (dolgu + 11px)

  // Yapışkan metro-nav'ın GERÇEK yüksekliğini `--ray-nav-h` CSS değişkenine yazar →
  // modüllerin yapışkan sekme çubukları (TabBar) tam nav altına oturur. ResizeObserver
  // ile breakpoint/etiket-sarma/yeniden-boyut değişimlerinde kendini günceller.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const yaz = () => document.documentElement.style.setProperty("--ray-nav-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    yaz();
    const ro = new ResizeObserver(yaz);
    ro.observe(el);
    window.addEventListener("resize", yaz);
    return () => { ro.disconnect(); window.removeEventListener("resize", yaz); };
  }, [icerikVar, genisEkran]);

  // ÇIPLAK sayfa (/canli) — QR'dan gelen mobil ziyaretçi için nav/masthead YOK; sade tam
  // ekran canlı simülasyon (paylaşım görünümü Kapı'yı açar, oturum gerekmez).
  if (pathname.startsWith("/canli")) {
    return (
      <main className="min-h-full flex-1" style={{ background: brand.paper }}>
        <Kapi>{children}</Kapi>
      </main>
    );
  }

  return (
    <>
      {/* Header: marka + sağ slotta hesap/hat kontrolleri (girişsizken slot boş → sade) */}
      <Masthead altBaslik={t({ tr: "Demiryolu Ağı Simülasyon Sistemi", en: "Railway Network Simulation System", de: "Bahnnetz-Simulationssystem" })} sag={<div className="flex flex-wrap items-center justify-end gap-3"><DilAnahtari /><ParametreDuzenleButonu /><HesapKontrolleri /></div>} />

      {/* Modül navigasyonu — sistemin mantıksal iş akışı bir METRO HATTI olarak:
          altı istasyon soldan sağa boru hattı; kaydırma ilerlemesi rayda akan bir
          tren gibi kırmızı-altın çizgiyle ilerler. Ana sayfada bölüm ankorlarına
          kaydırır; eski rotalarda ana sayfadaki bölüme döner. */}
      {icerikVar && (
      <nav
        ref={navRef}
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{
          background: "linear-gradient(180deg, #0F2B40 0%, #0C2233 100%)",
          borderColor: "#1E3A50",
        }}
      >
        {/* Üst kenar ince ilerleme çizgisi — global kaydırma konumu (mobilde de görünür) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px]" style={{ background: "#12314A" }}>
          <div
            className="h-full transition-[width] duration-150 ease-out"
            style={{ width: `${ilerleme * 100}%`, background: `linear-gradient(90deg, ${brand.gold}, ${brand.red})` }}
          />
        </div>

        {/* ── GENİŞ EKRAN (≥1024px): metro hattı ─────────────────────────── */}
        <div className={`relative mx-auto max-w-6xl px-8 transition-[padding] duration-200 ${kompakt ? "pb-2 pt-2.5" : "pb-3 pt-5"}`} style={{ display: genisEkran ? "block" : "none" }}>
          {/* Ray tabanı: istasyon nokralarının merkezinden geçen sönük çizgi */}
          <div className="pointer-events-none absolute left-8 right-8 h-[2px] rounded-full transition-[top] duration-200" style={{ top: rayTop, background: "#1E3A50" }} />
          {/* Kat edilen ray: baştan trene kadar kırmızı-altın */}
          <div
            className="pointer-events-none absolute left-8 h-[2px] rounded-full transition-[width,top] duration-150 ease-out"
            style={{ top: rayTop, width: `calc((100% - 4rem) * ${ilerleme})`, background: `linear-gradient(90deg, ${brand.gold}, ${brand.red})` }}
          />

          <ul className="relative flex items-start justify-between">
            {MODULLER.map((m, i) => {
              const on = m.slug === aktif.slug;
              const gecildi = i < aktifIndex;
              const href = anaSayfa ? `#${m.slug}` : `/#${m.slug}`;
              // Nokra (istasyon) görünümü: aktif = kırmızı dolu + halka; geçilmiş =
              // altın kenarlı dolu; gelecek = sönük kenar.
              const nokra: React.CSSProperties = on
                ? { background: brand.red, borderColor: brand.red, color: "#fff", boxShadow: `0 0 0 4px ${brand.red}33` }
                : gecildi
                ? { background: "#12314A", borderColor: brand.gold, color: "#E7D9B0" }
                : { background: "#0C2233", borderColor: "#274A63", color: "#6E8091" };
              return (
                <li key={m.slug} className="flex min-w-0 flex-1 flex-col items-center px-1.5 text-center">
                  <a href={href} className="group flex w-full flex-col items-center">
                    {/* İstasyon nokrası — numara; rayı örtmek için dolu zemin */}
                    <span
                      className="relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border font-mono text-[0.68rem] font-semibold tabular-nums transition-all duration-200 group-hover:scale-110"
                      style={nokra}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="mt-2.5 text-[0.78rem] font-medium leading-tight transition-colors"
                      style={{ color: on ? "#fff" : gecildi ? "#AEBECB" : "#8494A3" }}
                    >
                      {t(m.ad)}
                    </span>
                    <span
                      className={`text-[0.6rem] leading-snug transition-all ${kompakt ? "mt-0 h-0 overflow-hidden opacity-0" : "mt-0.5 opacity-100"}`}
                      style={{ color: on ? "#E7A9B2" : "#5A6C7C" }}
                    >
                      {t(m.rol)}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── DAR/ORTA EKRAN (<1024px): kompakt istasyon ızgarası ─────────── */}
        <div className={`mx-auto max-w-6xl grid-cols-2 gap-1.5 px-3 transition-[padding] duration-200 sm:grid-cols-3 ${kompakt ? "pb-1.5 pt-2" : "pb-2.5 pt-3.5"}`} style={{ display: genisEkran ? "none" : "grid" }}>
          {MODULLER.map((m, i) => {
            const on = m.slug === aktif.slug;
            const gecildi = i < aktifIndex;
            const href = anaSayfa ? `#${m.slug}` : `/#${m.slug}`;
            return (
              <a
                key={m.slug}
                href={href}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 leading-tight transition-colors"
                style={{ background: on ? brand.red : "#0F2B40", border: `1px solid ${on ? brand.red : "#1E3A50"}` }}
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border font-mono text-[0.6rem] font-semibold tabular-nums"
                  style={
                    on
                      ? { background: "#ffffff22", borderColor: "#ffffff55", color: "#fff" }
                      : gecildi
                      ? { background: "#12314A", borderColor: brand.gold, color: "#E7D9B0" }
                      : { background: "#0C2233", borderColor: "#274A63", color: "#6E8091" }
                  }
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.72rem] font-medium" style={{ color: on ? "#fff" : "#C7D2DC" }}>
                    {t(m.ad)}
                  </span>
                  <span className={`block truncate text-[0.56rem] transition-all ${kompakt ? "h-0 overflow-hidden opacity-0" : "opacity-100"}`} style={{ color: on ? "#ffffffb0" : "#6E8091" }}>
                    {t(m.rol)}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </nav>
      )}

      {/* Bağlamsal bildirim şeritleri (ödeme sonucu · salt-okunur paylaşım) —
          hesap/hat kontrolleri artık header'a taşındı; burada yalnız tam-genişlik
          bildirimler kalır (kendi içinde koşullu; yoksa hiçbir şey çizmez). */}
      <HesapBildirimleri />

      <main className="flex-1" style={{ background: brand.paper }}>
        <Kapi>{children}</Kapi>
      </main>

      {/* Sağ-alt "başa dön" düğmesi — uzun tek sayfada bir anda en üste döner
          (kısa sayfalarda kendini gizler) */}
      <BasaDonButonu />

      {/* Global kayıt bildirimi (toast) — her otomatik kayıt döngüsünde kısa süre
          "✓ Kaydedildi" belirir; tüm modülleri kapsar. */}
      <KayitBildirimi />

      {/* Global ödeme modalı — iyzico Checkout Form gömülü; kullanıcı siteden çıkmaz,
          "Vazgeç" ile geri döner. Yalnız ödeme başlatılınca görünür. */}
      <OdemeModal />

      {/* Kullanıcı kılavuzu — kullanıcı İLK KEZ giriş yaptıktan sonra ana sayfaya düşünce
          bir kez otomatik açılır (bir daha açılmaz). "Tanıtımı göster" ile tekrar açılabilir.
          /giris rotasında (henüz içerik yok) render edilmez. */}
      {icerikVar && !pathname.startsWith("/giris") && <Karsilama />}

      {/* Sunum/hikaye modu — sistemi tek nefeste gezdiren rehberli pitch (H). Yalnız
          tek-sayfa stüdyoda (ana sayfa) bölüm ankorları bulunduğu için görünür. */}
      {icerikVar && anaSayfa && <SunumModu />}

      {/* Global footer — sol: dürüst metodoloji notu · orta: amblem · sağ: künye */}
      <footer className="border-t-2" style={{ background: "#0C2233", borderColor: "#C8102E" }}>
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-5 px-6 py-6 sm:grid-cols-3">
          {/* Sol: OpenTrack ile ilişki — işbirliği/doğrulama beyanı (canlı entegre iddiası YOK) */}
          <div className="text-center text-[0.7rem] leading-relaxed text-slate-400 sm:text-left">
            <span className="text-slate-200">OpenTrack</span>{" "}
            {t({
              tr: "ile işbirliğiyle doğrulanmış; blocking-time · Sperrzeitentreppe · UIC 406 metodolojisine dayanan bağımsız çekirdek.",
              en: "verified in collaboration; an independent core based on the blocking-time · Sperrzeitentreppe · UIC 406 methodology.",
              de: "in Zusammenarbeit verifiziert; ein unabhängiger Kern auf Basis der Methodik blocking-time · Sperrzeitentreppe · UIC 406.",
            })}
          </div>

          {/* Orta: RaySim amblemi */}
          <div className="flex flex-col items-center gap-1.5">
            <svg width="38" height="38" viewBox="0 0 46 46" fill="none" aria-hidden="true">
              <circle cx="23" cy="23" r="21.5" stroke="#A8842C" strokeWidth="1" />
              <circle cx="23" cy="23" r="18" stroke="#E7ECF1" strokeWidth="1" opacity="0.5" />
              <path d="M17 34 L21.5 13 M29 34 L24.5 13" stroke="#E7ECF1" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M18.4 28 L27.6 28 M19.3 24 L26.7 24 M20 20.5 L26 20.5 M20.7 17.5 L25.3 17.5" stroke="#C8102E" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="font-brand text-sm font-semibold tracking-[0.15em] text-white">RaySim</span>
          </div>

          {/* Sağ: künye */}
          <div className="text-center text-[0.7rem] leading-relaxed text-slate-400 sm:text-right">
            {t({ tr: "Demiryolu Ağı Simülasyon Sistemi", en: "Railway Network Simulation System", de: "Bahnnetz-Simulationssystem" })}
            <br />
            <span className="text-slate-500">{t({ tr: "Sinyalizasyon · Kapasite · Dokümantasyon", en: "Signalling · Capacity · Documentation", de: "Signaltechnik · Kapazität · Dokumentation" })}</span>
          </div>
        </div>
      </footer>
    </>
  );
}
