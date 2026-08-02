"use client";

// raysim — İYZİCO ÖDEME MODALI.
// Eskiden ödeme, tam sayfa yönlendirmeyle (window.location) iyzico'ya gidiyordu;
// kullanıcı ÖDEMEDEN VAZGEÇİP geri dönemiyordu (iyzico sayfasında temiz "geri" yok).
// Artık iyzico Checkout Form, SİTE İÇİNDE bir modalda gömülü açılır: kullanıcı
// siteden hiç ayrılmaz, "Vazgeç" ile anında geri döner. Başarılı ödemede iyzico
// üst pencereyi callback'e yönlendirir (mevcut akış korunur).

import { useEffect, useRef } from "react";
import { useCuzdan } from "@/components/CuzdanProvider";
import { brand } from "@/lib/anaray/brand";

export function OdemeModal() {
  const { odemeIcerik, odemeUrlYedek, odemeKapat } = useCuzdan();
  const scriptHost = useRef<HTMLDivElement>(null);

  // iyzico'nun checkoutFormContent'i <script> içerir; React script çalıştırmaz →
  // HTML'i koy, sonra <script>leri YENİDEN oluşturarak çalıştır. Form, aşağıdaki
  // sabit id'li kutuya (#iyzipay-checkout-form) render eder.
  useEffect(() => {
    const host = scriptHost.current;
    if (!host || !odemeIcerik) return;
    host.innerHTML = odemeIcerik;
    host.querySelectorAll("script").forEach((eski) => {
      const s = document.createElement("script");
      Array.from(eski.attributes).forEach((a) => s.setAttribute(a.name, a.value));
      s.text = eski.textContent ?? "";
      eski.replaceWith(s); // yeniden ekleme = çalıştırma
    });
    return () => { host.innerHTML = ""; };
  }, [odemeIcerik]);

  // ESC ile de vazgeçilebilsin.
  useEffect(() => {
    if (odemeIcerik == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") odemeKapat(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [odemeIcerik, odemeKapat]);

  if (odemeIcerik == null) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Güvenli ödeme">
      <div className="relative w-full max-w-xl rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: brand.border }}>
          <span className="font-brand text-sm font-semibold" style={{ color: brand.ink }}>🔒 Güvenli Ödeme — iyzico</span>
          <button onClick={odemeKapat} title="Ödemeden vazgeç ve geri dön"
            className="rounded-md border px-3 py-1 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
            ✕ Vazgeç
          </button>
        </div>
        <div className="p-4">
          {/* iyzico formu bu kutuya render eder (sabit id gerekli) */}
          <div id="iyzipay-checkout-form" className="responsive" />
          {/* checkoutFormContent script'i buraya enjekte edilip çalıştırılır */}
          <div ref={scriptHost} />
          {!odemeIcerik && odemeUrlYedek && (
            <div className="py-6 text-center text-sm" style={{ color: brand.muted }}>
              Ödeme formu yüklenemedi.{" "}
              <a href={odemeUrlYedek} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: brand.red }}>Yeni sekmede aç →</a>
            </div>
          )}
          <p className="mt-3 text-center text-[0.7rem] leading-relaxed" style={{ color: brand.faint }}>
            Kart bilgileri doğrudan iyzico&apos;da işlenir; RaySim kart bilgisi görmez.
            Vazgeçmek için “Vazgeç”e basın (ya da ESC) — sitede kalırsınız.
          </p>
        </div>
      </div>
    </div>
  );
}
