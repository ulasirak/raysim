"use client";

// raysim — TEK SAYFA STÜDYOSU.
// Altı modülün TAMAMI tek uzun sayfada, boru hattı sırasıyla dikey akar:
// kullanıcı yukarıdan aşağıya kaydırarak sim yapa yapa iner. Hepsi aynı aktif
// hatta hizmet eder (SimConfigProvider) ve tek bir SALT-OKUNUR KALKAN altında
// durur — demo/paylaşım görünümünde bütün sayfa düzenlemeye kapanır.
//
// Her bölüm bir <section id="..."> taşır; üstteki navigasyon bu ankorlara
// kaydırır (bkz. AppShell scroll-spy). Bölüm sırası ve id'ler MODULLER ile
// aynı olmalı; tek kaynak `BOLUM_SLUG`'tır.
//
// PERFORMANS: Yedi ağır canlı modül aynı anda tam çizilirse ana iş parçacığı
// yorulur. `content-visibility: auto` ile ekran dışı bölümlerin ÇİZİM/YERLEŞİMİ
// atlanır — ama yükseklik `contain-intrinsic-size` ile KORUNUR, dolayısıyla
// ankor kaydırması (#slug) doğru çalışır. (Bölümleri ekran dışında UNMOUNT etmeyi
// denedik: donmayı azaltıyordu ama placeholder yükseklikleri gerçek yüksekliklerle
// uyuşmadığı için ankor yanlış bölüme kayıyordu — ankor sağlamlığı öncelikli.)

import { useEffect } from "react";

import { Studio } from "@/components/Studio";
import { RingEditor } from "@/components/RingEditor";
import { SistemMerkezi } from "@/components/SistemMerkezi";
import { Belgeler } from "@/components/Belgeler";
import { Karsilastirma } from "@/components/Karsilastirma";
import { SaltOkunurKalkan } from "@/components/SaltOkunurKalkan";
import { HataSiniri } from "@/components/HataSiniri";
import { brand } from "@/lib/anaray/brand";
import { panelAcVeGit } from "@/lib/anaray/panelGezinme";

/**
 * Global ankor yönlendirici: sayfa #slug ile açıldığında (QR/derin bağlantı/eski
 * rota yönlendirmesi/bookmark) ya da sayfa-içi düz `<a href="#x">` tıklamasında,
 * hedef GİZLİYSE (CSS-sekmesi içinde ya da kapalı <details>) `panelAcVeGit` ile
 * sekmeyi/çekmeceyi açıp kaydırır. Üst-düzey bölümlere (scroll-mt ile zaten doğru
 * kayan) dokunmaz — orada panelAcVeGit'in "ilk <details>'i aç" yan etkisi istenmez.
 * Not: Next <Link> hash gezinmesi history API kullanır ve `hashchange` TETİKLEMEZ;
 * sayfa-içi sekme hedefli Link'ler ayrıca kendi onClick'inde panelAcVeGit çağırır.
 */
function useAnkorYonlendirici() {
  useEffect(() => {
    const git = () => {
      const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!h) return;
      const el = document.getElementById(h);
      if (!el) return;
      const gizli = el.closest("[data-t]") || (el.matches("details") && !(el as HTMLDetailsElement).open);
      if (gizli) panelAcVeGit(h);
    };
    // İlk yük: content-visibility bölümleri yerleşsin diye bir tık bekle.
    const t = window.setTimeout(git, 140);
    window.addEventListener("hashchange", git);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", git); };
  }, []);
}

/** Bölüm ankorları — AppShell navigasyonu ve scroll-spy ile ORTAK kaynak. */
// SIRA = veri akışı (girdi → analiz → çıktı). Kullanıcı yukarıdan aşağı, 5 faz:
//   KUR:        Ringler (hattı/makasları kur + içe-aktar; hemzemin TSP)
//   ANALİZ ET:  Sefer (canlı ağ · fizik · filo · ters işletme · grafikler)
//   İNCELE:     Sistem Merkezi (kapasite · blocking-time · filo kararı · doğrulama)
//   BELGELE:    Teknik Belgeler (ücretli PDF rapor + railML/GTFS dışa aktar) — çıktı adımı
//   KARŞILAŞTIR: Karşılaştırma (senaryo/proje yan yana karar desteği)
// Önce girdi, sonra çıktı: yeni kullanıcı hattı KURDUĞU yerden başlar, boş bir
// simülasyona bakmaz.
export const BOLUM_SLUG = [
  "ringler", "sefer", "sistem", "belgeler", "karsilastirma",
] as const;
export type BolumSlug = (typeof BOLUM_SLUG)[number];

/** Faz başlığı olan bölümler yeni bir boru-hattı aşaması açar (KUR/ANALİZ/BELGELE). */
const BOLUMLER: { slug: BolumSlug; el: React.ReactNode; faz?: { ad: string; modul: string; not: string } }[] = [
  { slug: "ringler", el: <RingEditor />, faz: { ad: "KUR", modul: "Durak Arası Ringler", not: "Hattı ve makas bölgelerini tanımla — buradaki her veri kalıcıdır." } },
  { slug: "sefer", el: <Studio />, faz: { ad: "ANALİZ ET", modul: "Sefer Simülasyonu", not: "Kurduğun hattı simüle et — canlı ağ, ters işletme, tarife, kapasite ve darboğazlar." } },
  { slug: "sistem", el: <SistemMerkezi />, faz: { ad: "İNCELE", modul: "Sistem Merkezi", not: "Kapasite, darboğaz, motor doğruluğu ve filo kararını derinlemesine incele." } },
  { slug: "belgeler", el: <Belgeler />, faz: { ad: "BELGELE", modul: "Teknik Belgeler", not: "Analizden profesyonel tasarım dokümantasyonu üret." } },
  { slug: "karsilastirma", el: <Karsilastirma />, faz: { ad: "KARŞILAŞTIR", modul: "Karşılaştırma", not: "Senaryoları/projeleri yan yana koy — objektif karar desteği." } },
];

function FazBasligi({ ad, modul, not }: { ad: string; modul: string; not: string }) {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-12">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2" style={{ borderColor: brand.borderStrong }}>
        <span className="font-brand text-sm font-bold tracking-[0.22em]" style={{ color: brand.red }}>{ad}</span>
        {/* Nav istasyon adıyla hizalı — "ANALİZ ET" ↔ "Sefer Simülasyonu" göz eşleşmesi */}
        <span className="font-brand text-sm font-semibold" style={{ color: brand.ink }}>{modul}</span>
        <span className="text-xs" style={{ color: brand.muted }}>{not}</span>
      </div>
    </div>
  );
}

export function TekSayfa() {
  useAnkorYonlendirici();
  return (
    <SaltOkunurKalkan>
      <div>
        {BOLUMLER.map((b, i) => (
          <div key={b.slug}>
            {b.faz && <FazBasligi ad={b.faz.ad} modul={b.faz.modul} not={b.faz.not} />}
            <section
              id={b.slug}
              // scroll-mt: sticky nav yüksekliği kadar tepe payı, ankora kayınca
              // bölüm başlığı navigasyonun altında kalmasın.
              className="scroll-mt-28"
              style={i > 0 && !b.faz
                ? { contentVisibility: "auto", containIntrinsicSize: "auto 1400px", borderTop: `1px solid ${brand.border}` }
                : i > 0
                ? { contentVisibility: "auto", containIntrinsicSize: "auto 1400px" }
                : undefined}
            >
              {/* Her bölüm YALITILIR: biri çökse diğerleri + kaydetme çalışmaya devam eder. */}
              <HataSiniri ad={b.faz?.ad ?? b.slug}>{b.el}</HataSiniri>
            </section>
          </div>
        ))}
      </div>
    </SaltOkunurKalkan>
  );
}
