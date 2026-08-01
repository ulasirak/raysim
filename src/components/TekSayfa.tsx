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
import { AnklasmanSim } from "@/components/AnklasmanSim";
import { SistemMerkezi } from "@/components/SistemMerkezi";
import { Belgeler } from "@/components/Belgeler";
import { CografiHarita } from "@/components/CografiHarita";
import { SaltOkunurKalkan } from "@/components/SaltOkunurKalkan";
import { brand } from "@/lib/anaray/brand";

/** Bölüm ankorları — AppShell navigasyonu ve scroll-spy ile ORTAK kaynak. */
// Teknik Belgeler EN SONDA: kullanıcı önce hattı kurup analiz eder (Sefer→Coğrafi),
// en altta ücretli PDF raporu üretir — doğal iş akışının son adımı.
export const BOLUM_SLUG = [
  "sefer", "ringler", "anklasman", "sistem", "cografi", "belgeler",
] as const;
export type BolumSlug = (typeof BOLUM_SLUG)[number];

const BOLUMLER: { slug: BolumSlug; el: React.ReactNode }[] = [
  { slug: "sefer", el: <Studio /> },
  { slug: "ringler", el: <RingEditor /> },
  { slug: "anklasman", el: <AnklasmanSim /> },
  { slug: "sistem", el: <SistemMerkezi /> },
  { slug: "cografi", el: <CografiHarita /> },
  { slug: "belgeler", el: <Belgeler /> },
];

export function TekSayfa() {
  return (
    <SaltOkunurKalkan>
      <div>
        {BOLUMLER.map((b, i) => (
          <section
            key={b.slug}
            id={b.slug}
            // scroll-mt: sticky nav yüksekliği kadar tepe payı, ankora kayınca
            // bölüm başlığı navigasyonun altında kalmasın.
            className="scroll-mt-28"
            style={i > 0
              ? { contentVisibility: "auto", containIntrinsicSize: "auto 1400px", borderTop: `1px solid ${brand.border}` }
              : undefined}
          >
            {b.el}
          </section>
        ))}
      </div>
    </SaltOkunurKalkan>
  );
}
