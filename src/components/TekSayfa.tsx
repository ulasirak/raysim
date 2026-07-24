"use client";

// raysim — TEK SAYFA STÜDYOSU.
// Yedi modülün TAMAMI tek uzun sayfada, boru hattı sırasıyla dikey akar:
// kullanıcı yukarıdan aşağıya kaydırarak sim yapa yapa iner. Hepsi aynı aktif
// hatta hizmet eder (SimConfigProvider) ve tek bir SALT-OKUNUR KALKAN altında
// durur — demo/paylaşım görünümünde bütün sayfa düzenlemeye kapanır.
//
// Her bölüm bir <section id="..."> taşır; üstteki navigasyon bu ankorlara
// kaydırır (bkz. AppShell scroll-spy). Bölüm sırası ve id'ler MODULLER ile
// aynı olmalı; tek kaynak `BOLUM_SLUG`'tır.

import { Studio } from "@/components/Studio";
import { RingEditor } from "@/components/RingEditor";
import { AnklasmanSim } from "@/components/AnklasmanSim";
import { HatSim } from "@/components/HatSim";
import { SistemMerkezi } from "@/components/SistemMerkezi";
import { Belgeler } from "@/components/Belgeler";
import { CografiHarita } from "@/components/CografiHarita";
import { SaltOkunurKalkan } from "@/components/SaltOkunurKalkan";
import { brand } from "@/lib/anaray/brand";

/** Bölüm ankorları — AppShell navigasyonu ve scroll-spy ile ORTAK kaynak. */
export const BOLUM_SLUG = [
  "sefer", "ringler", "anklasman", "tam-hat", "sistem", "belgeler", "cografi",
] as const;
export type BolumSlug = (typeof BOLUM_SLUG)[number];

const BOLUMLER: { slug: BolumSlug; el: React.ReactNode }[] = [
  { slug: "sefer", el: <Studio /> },
  { slug: "ringler", el: <RingEditor /> },
  { slug: "anklasman", el: <AnklasmanSim /> },
  { slug: "tam-hat", el: <HatSim /> },
  { slug: "sistem", el: <SistemMerkezi /> },
  { slug: "belgeler", el: <Belgeler /> },
  { slug: "cografi", el: <CografiHarita /> },
];

export function TekSayfa() {
  return (
    <SaltOkunurKalkan>
      <div>
        {BOLUMLER.map((b, i) => (
          <section
            key={b.slug}
            id={b.slug}
            // scroll-mt: sticky nav + hesap çubuğu yüksekliği kadar tepe payı,
            // ankora kayınca bölüm başlığı navigasyonun altında kalmasın.
            className={`scroll-mt-28 ${i > 0 ? "border-t" : ""}`}
            style={i > 0 ? { borderColor: brand.border } : undefined}
          >
            {b.el}
          </section>
        ))}
      </div>
    </SaltOkunurKalkan>
  );
}
