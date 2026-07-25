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
//
// PERFORMANS: Yedi ağır CANLI modül aynı anda mount olursa (RAF/interval/harita
// çizimi) ana iş parçacığı kilitlenip sayfa donuyordu. Çözüm: her bölüm yalnız
// EKRANA YAKINken mount edilir (`GorunurdeMonte`); uzaktaki bölüm hiç render
// olmaz, dolayısıyla animasyon döngüleri de çalışmaz. Yetenek eksilmez — bölüme
// yaklaşınca tam mount olur. Ekran dışındayken yerini bir placeholder tutar
// (kaydırma çubuğu kararlı kalır).

import { useEffect, useRef, useState } from "react";
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
// Teknik Belgeler EN SONDA: kullanıcı önce hattı kurup analiz eder (Sefer→Coğrafi),
// en altta ücretli PDF raporu üretir — doğal iş akışının son adımı.
export const BOLUM_SLUG = [
  "sefer", "ringler", "anklasman", "tam-hat", "sistem", "cografi", "belgeler",
] as const;
export type BolumSlug = (typeof BOLUM_SLUG)[number];

const BOLUMLER: { slug: BolumSlug; el: React.ReactNode }[] = [
  { slug: "sefer", el: <Studio /> },
  { slug: "ringler", el: <RingEditor /> },
  { slug: "anklasman", el: <AnklasmanSim /> },
  { slug: "tam-hat", el: <HatSim /> },
  { slug: "sistem", el: <SistemMerkezi /> },
  { slug: "cografi", el: <CografiHarita /> },
  { slug: "belgeler", el: <Belgeler /> },
];

/**
 * Çocuklarını yalnız ekrana YAKINken (viewport ± buffer) mount eder; uzaktayken
 * yerini tahmini yükseklikte bir placeholder tutar. Böylece görünmeyen ağır
 * bölümlerin canlı döngüleri (RAF/interval/harita) hiç çalışmaz.
 */
function GorunurdeMonte({ ilkGorunur = false, children }: { ilkGorunur?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [gorunur, setGorunur] = useState(ilkGorunur);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (girisler) => setGorunur(girisler[0]?.isIntersecting ?? false),
      // Bölüm viewport'a 800px yaklaşınca mount edilir → kullanıcı oraya varmadan hazır.
      { rootMargin: "800px 0px 800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Ekran dışıyken ~1200px'lik yer tutucu (kaydırma çubuğu kararlı kalsın).
  return (
    <div ref={ref} style={gorunur ? undefined : { minHeight: 1200 }}>
      {gorunur ? children : null}
    </div>
  );
}

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
            style={i > 0 ? { borderTop: `1px solid ${brand.border}` } : undefined}
          >
            {/* İlk bölüm (Sefer) hep görünür başlar; gerisi ekrana yaklaşınca mount olur. */}
            <GorunurdeMonte ilkGorunur={i === 0}>{b.el}</GorunurdeMonte>
          </section>
        ))}
      </div>
    </SaltOkunurKalkan>
  );
}
