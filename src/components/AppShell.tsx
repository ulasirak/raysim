"use client";

// raysim — ortak uygulama kabuğu (tek sistem navigasyonu).
// Tüm modüller (Sefer / Ringler / Anklaşman / Kural Kitabı) aynı Masthead + nav
// altında mantıksal olarak bağlıdır. Aktif modül yola (pathname) göre belirlenir;
// Masthead künyesi ve rota buradan beslenir. Sayfalar yalnız içeriklerini döner.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { SimConfigProvider } from "@/components/SimConfigProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { HesapCubugu } from "@/components/HesapCubugu";
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
  { href: "/belgeler", slug: "belgeler", ad: "Teknik Belgeler", rol: "PDF + Word + Excel · tasarım el kitabı", kod: "SR-0006", rota: "Teknik Dokümantasyon Üretimi" },
  { href: "/cografi", slug: "cografi", ad: "Coğrafi Güzergah", rol: "GTFS · gerçek koordinat · harita", kod: "SR-0007", rota: "Gerçek Koordinatlı Hat Haritası" },
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
    // Ana sayfa dışında gözlemci kurulmaz; slug kullanılmadığı için sıfırlamaya
    // gerek yok (ana sayfaya dönünce gözlemci yeniden kurulup günceller).
    if (!aktifMi) return;
    const gorunur = new Map<string, number>();
    const gozlemci = new IntersectionObserver(
      (girisler) => {
        for (const g of girisler) gorunur.set(g.target.id, g.isIntersecting ? g.intersectionRatio : 0);
        // Görünürlerden BOLUM_SLUG sırasında en üsttekini seç (kararlı).
        let secili: BolumSlug | null = null;
        for (const s of BOLUM_SLUG) if ((gorunur.get(s) ?? 0) > 0) { secili = s; break; }
        if (secili) setSlug(secili);
      },
      // Sticky nav'ın hemen altındaki şerit gözlemlenir.
      { rootMargin: "-140px 0px -55% 0px", threshold: [0, 0.01] },
    );
    const bolumler = BOLUM_SLUG.map((s) => document.getElementById(s)).filter((el): el is HTMLElement => !!el);
    bolumler.forEach((el) => gozlemci.observe(el));
    return () => gozlemci.disconnect();
  }, [aktifMi]);
  return slug;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SimConfigProvider>
        <Govde>{children}</Govde>
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

  // Ana sayfada aktif bölüm kaydırmayla belirlenir; eski derin rotalarda yola göre.
  const aktifBolum = useAktifBolum(anaSayfa && icerikVar);
  const aktif = anaSayfa
    ? (MODULLER.find((m) => m.slug === aktifBolum) ?? MODULLER[0])
    : aktifModul(pathname);

  return (
    <>
      <Masthead belgeKodu={aktif.kod} rota={aktif.rota} />

      {/* Modül navigasyonu — sistemin mantıksal iş akışı (soldan sağa boru hattı).
          Ana sayfada tek-sayfa bölüm ankorlarına kaydırır; eski rotalarda sayfaya gider. */}
      {icerikVar && (
      <nav className="sticky top-0 z-20 border-b" style={{ background: "#0E2739", borderColor: "#1E3A50" }}>
        {/* Butonlar sayfanın yatayına eşit yayılır: dar ekranda 2, orta ekranda 4, geniş ekranda 7 sütun */}
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-1 px-4 py-2 sm:grid-cols-4 lg:grid-cols-7">
          {MODULLER.map((m, i) => {
            const on = anaSayfa ? m.slug === aktif.slug : m.href === aktif.href;
            // Ana sayfada bölüme kaydır (#slug); başka rotadaysak ana sayfadaki
            // bölüme dönmek için /#slug. Derin rota bağı yalnız uyumluluk içindir.
            const href = anaSayfa ? `#${m.slug}` : `/#${m.slug}`;
            return (
              <a key={m.slug} href={href}
                className="flex min-w-0 flex-col rounded-md px-2.5 py-1.5 leading-tight transition"
                style={{ background: on ? brand.red : "transparent" }}>
                <span className="text-[0.8rem] font-medium" style={{ color: on ? "#fff" : "#C7D2DC" }}>
                  {i + 1}. {m.ad}
                </span>
                <span className="text-[0.62rem]" style={{ color: on ? "#ffffffb0" : "#6E8091" }}>{m.rol}</span>
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
