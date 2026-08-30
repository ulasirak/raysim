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

import { Studio } from "@/components/Studio";
import { RingEditor } from "@/components/RingEditor";
import { SistemMerkezi } from "@/components/SistemMerkezi";
import { TersIsletme } from "@/components/TersIsletme";
import { Belgeler } from "@/components/Belgeler";
import { SaltOkunurKalkan } from "@/components/SaltOkunurKalkan";
import { brand } from "@/lib/anaray/brand";

/** Bölüm ankorları — AppShell navigasyonu ve scroll-spy ile ORTAK kaynak. */
// SIRA = veri akışı (girdi → analiz → çıktı). Kullanıcı yukarıdan aşağı:
//   KUR:     Ringler (hattı kur) · Coğrafi (koordinattan üret/gör)
//   ANALİZ:  Sefer (canlı ağ) · Sistem (kapasite/blocking-time)
//   BELGELE: Teknik Belgeler (ücretli PDF rapor) — doğal iş akışının son adımı.
// Önce girdi, sonra çıktı: yeni kullanıcı hattı KURDUĞU yerden başlar, boş bir
// simülasyona bakmaz.
export const BOLUM_SLUG = [
  "ringler", "sefer", "sistem", "tersisletme", "belgeler",
] as const;
export type BolumSlug = (typeof BOLUM_SLUG)[number];

/** Faz başlığı olan bölümler yeni bir boru-hattı aşaması açar (KUR/ANALİZ/BELGELE). */
const BOLUMLER: { slug: BolumSlug; el: React.ReactNode; faz?: { ad: string; not: string } }[] = [
  { slug: "ringler", el: <RingEditor />, faz: { ad: "KUR", not: "Hattı ve makas bölgelerini tanımla — buradaki her veri kalıcıdır." } },
  { slug: "sefer", el: <Studio />, faz: { ad: "ANALİZ ET", not: "Kurduğun hattı simüle et — canlı ağ, kapasite ve darboğazlar." } },
  { slug: "sistem", el: <SistemMerkezi /> },
  { slug: "tersisletme", el: <TersIsletme /> },
  { slug: "belgeler", el: <Belgeler />, faz: { ad: "BELGELE", not: "Analizden profesyonel tasarım dokümantasyonu üret." } },
];

function FazBasligi({ ad, not }: { ad: string; not: string }) {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-12">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2" style={{ borderColor: brand.borderStrong }}>
        <span className="font-brand text-sm font-bold tracking-[0.22em]" style={{ color: brand.red }}>{ad}</span>
        <span className="text-xs" style={{ color: brand.muted }}>{not}</span>
      </div>
    </div>
  );
}

export function TekSayfa() {
  return (
    <SaltOkunurKalkan>
      <div>
        {BOLUMLER.map((b, i) => (
          <div key={b.slug}>
            {b.faz && <FazBasligi ad={b.faz.ad} not={b.faz.not} />}
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
              {b.el}
            </section>
          </div>
        ))}
      </div>
    </SaltOkunurKalkan>
  );
}
