"use client";

// raysim — "BAŞA DÖN" düğmesi.
// Tek sayfa stüdyo çok uzun olduğu için sağ-alta sabit, küçük bir daire koyar:
// belli bir kaydırmadan sonra yumuşakça belirir, tıklayınca sayfanın en üstüne
// pürüzsüzce döner. Header koyu-mürekkep + altın kenar temasıyla aynı dildedir.

import { useEffect, useState } from "react";

export function BasaDonButonu() {
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    let bekliyor = false;
    const hesapla = () => {
      bekliyor = false;
      // Bir ekran boyundan fazla inilince belirir (kısa sayfalarda hiç çıkmaz).
      setGorunur(window.scrollY > 400);
    };
    const tetikle = () => {
      if (bekliyor) return;
      bekliyor = true;
      requestAnimationFrame(hesapla);
    };
    hesapla(); // ilk konum
    window.addEventListener("scroll", tetikle, { passive: true });
    return () => window.removeEventListener("scroll", tetikle);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Sayfanın başına dön"
      title="Başa dön"
      // Görünürlük opacity + pointer-events ile (transform'u hover'a bıraktık ki
      // çakışmasın); hover'da hafif büyüme + parlaklık.
      className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-all duration-300 hover:scale-105 hover:brightness-110"
      style={{
        background: "#0C2233",
        borderColor: "#A8842C",
        color: "#fff",
        opacity: gorunur ? 1 : 0,
        pointerEvents: gorunur ? "auto" : "none",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
