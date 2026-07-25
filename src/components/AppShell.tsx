"use client";

// raysim — ortak uygulama kabuğu (tek sistem navigasyonu).
// Tüm modüller (Sefer / Ringler / Anklaşman / Kural Kitabı) aynı Masthead + nav
// altında mantıksal olarak bağlıdır. Aktif modül yola (pathname) göre belirlenir;
// Masthead künyesi ve rota buradan beslenir. Sayfalar yalnız içeriklerini döner.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { SimConfigProvider, useHesap } from "@/components/SimConfigProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { HesapCubugu } from "@/components/HesapCubugu";
import { CuzdanProvider } from "@/components/CuzdanProvider";
import { Kapi, useErisim } from "@/components/Kapi";
import { BOLUM_SLUG, type BolumSlug } from "@/components/TekSayfa";
import { brand } from "@/lib/anaray/brand";

interface Modul {
  /** Eski derin rota (uyumluluk + paylaşım/`?bolge=` linkleri için korunur). */
  href: string;
  /** Tek sayfadaki bölüm ankoru — TekSayfa'daki id ile AYNI. */
  slug: BolumSlug;
  ad: string;
  rol: string;
  kod: string;
  rota: string;
}

// Boru hattı sırası TEK SAYFA bölüm sırasıyla birebir aynı (BOLUM_SLUG).
const MODULLER: Modul[] = [
  { href: "/", slug: "sefer", ad: "Sefer Simülasyonu", rol: "Ağ · fizik · headway · kapasite", kod: "SR-0001", rota: "Ana Hat Sefer Analizi" },
  { href: "/ringler", slug: "ringler", ad: "Durak Arası Ringler", rol: "İşletim hücreleri · worst/best · loop", kod: "SR-0002", rota: "Durak Arası Ring Şartları" },
  { href: "/anklasman", slug: "anklasman", ad: "Makas Bölgesi Anklaşman", rol: "Interlocking · çakışma matriksi · aspekt", kod: "SR-0003", rota: "Makas Bölgesi Anklaşman" },
  { href: "/hat", slug: "tam-hat", ad: "Tam Hat Simülasyonu", rol: "Ring + anklaşman · çok tren · darboğaz", kod: "SR-0005", rota: "Tam Hat Çok-Tren Canlı Simülasyon" },
  { href: "/sistem", slug: "sistem", ad: "Sistem Merkezi", rol: "Parametreler · canlı durum · bilgi", kod: "SR-0004", rota: "Simülasyon Parametreleri & Durum" },
  { href: "/cografi", slug: "cografi", ad: "Coğrafi Güzergah", rol: "GTFS · gerçek koordinat · harita", kod: "SR-0007", rota: "Gerçek Koordinatlı Hat Haritası" },
  { href: "/belgeler", slug: "belgeler", ad: "Teknik Belgeler", rol: "Ücretli PDF rapor · tasarım el kitabı", kod: "SR-0006", rota: "Teknik Dokümantasyon Üretimi" },
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
    <AuthProvider>
      <SimConfigProvider>
        <CuzdanProvider>
          <Govde>{children}</Govde>
        </CuzdanProvider>
      </SimConfigProvider>
    </AuthProvider>
  );
}

/** Kabuk gövdesi — sağlayıcıların İÇİNDE olduğu için oturum durumunu okuyabilir. */
function Govde({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const anaSayfa = pathname === "/";
  // Giriş yapılmadan modül navigasyonu ve hesap çubuğu gösterilmez: site,
  // ziyaretçiyi doğrudan giriş/kayıt ekranıyla karşılar.
  const erisim = useErisim();
  const icerikVar = erisim === "acik";
  // O an seçili hattın adı (çok kiracılı hesap çubuğuyla aynı kaynak).
  const { aktifAd } = useHesap();

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

  // Masthead künyesi: giriş yapılıp bir hat aktifse "AKTİF HAT" + hattın adı
  // (hesap çubuğuyla tutarlı); aksi halde modülün statik rota adı ("Rota").
  const hatAktif = icerikVar && Boolean(aktifAd) && aktifAd !== "—";
  const rotaEtiketi = hatAktif ? "AKTİF HAT" : "Rota";
  const rotaDeger = hatAktif ? aktifAd : aktif.rota;

  return (
    <>
      <Masthead rota={rotaDeger} rotaEtiketi={rotaEtiketi} hatAktif={hatAktif} />

      {/* Modül navigasyonu — sistemin mantıksal iş akışı bir METRO HATTI olarak:
          yedi istasyon soldan sağa boru hattı; kaydırma ilerlemesi rayda akan bir
          tren gibi kırmızı-altın çizgiyle ilerler. Ana sayfada bölüm ankorlarına
          kaydırır; eski rotalarda ana sayfadaki bölüme döner. */}
      {icerikVar && (
      <nav
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
        <div className="relative mx-auto max-w-6xl px-8 pb-3 pt-5" style={{ display: genisEkran ? "block" : "none" }}>
          {/* Ray tabanı: istasyon nokralarının merkezinden geçen sönük çizgi */}
          <div className="pointer-events-none absolute left-8 right-8 top-[30px] h-[2px] rounded-full" style={{ background: "#1E3A50" }} />
          {/* Kat edilen ray: baştan trene kadar kırmızı-altın */}
          <div
            className="pointer-events-none absolute left-8 top-[30px] h-[2px] rounded-full transition-[width] duration-150 ease-out"
            style={{ width: `calc((100% - 4rem) * ${ilerleme})`, background: `linear-gradient(90deg, ${brand.gold}, ${brand.red})` }}
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
                      {m.ad}
                    </span>
                    <span
                      className="mt-0.5 text-[0.6rem] leading-snug transition-colors"
                      style={{ color: on ? "#E7A9B2" : "#5A6C7C" }}
                    >
                      {m.rol}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── DAR/ORTA EKRAN (<1024px): kompakt istasyon ızgarası ─────────── */}
        <div className="mx-auto max-w-6xl grid-cols-2 gap-1.5 px-3 pb-2.5 pt-3.5 sm:grid-cols-4" style={{ display: genisEkran ? "none" : "grid" }}>
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
                    {m.ad}
                  </span>
                  <span className="block truncate text-[0.56rem]" style={{ color: on ? "#ffffffb0" : "#6E8091" }}>
                    {m.rol}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </nav>
      )}

      {/* Hesap & aktif hat şeridi — hangi kiracının hangi hattı işlendiğini gösterir */}
      {icerikVar && <HesapCubugu />}

      <main className="flex-1" style={{ background: brand.paper }}>
        <Kapi>{children}</Kapi>
      </main>

      {/* Global footer — sol: dürüst metodoloji notu · orta: amblem · sağ: künye */}
      <footer className="border-t-2" style={{ background: "#0C2233", borderColor: "#C8102E" }}>
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-5 px-6 py-6 sm:grid-cols-3">
          {/* Sol: OpenTrack ile ilişki — işbirliği/doğrulama beyanı (canlı entegre iddiası YOK) */}
          <div className="text-center text-[0.7rem] leading-relaxed text-slate-400 sm:text-left">
            <span className="text-slate-200">OpenTrack</span> ile işbirliğiyle doğrulanmış;
            blocking-time · Sperrzeitentreppe · UIC 406 metodolojisine dayanan
            <span className="text-slate-200"> bağımsız</span> çekirdek.
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
            Demiryolu Ağı Simülasyon Sistemi
            <br />
            <span className="text-slate-500">Sinyalizasyon · Kapasite · Dokümantasyon</span>
          </div>
        </div>
      </footer>
    </>
  );
}
