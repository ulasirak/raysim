"use client";

// raysim — header'a yakın hızlı "⚙ Parametreler" butonu + modal.
//
// Simülasyon parametreleri (Sistem Merkezi bölümünde) sayfanın en altında.
// Kullanıcı düzenlemek için ta aşağı inmek zorunda kalmasın diye header'daki bu
// buton, aynı parametre düzeltmesini bir modalda açar (paylaşılan ParametreEditoru
// → değişiklik anında cfg'ye yazılır + otomatik kaydedilir). Salt-okunur/demo
// oturumda buton gizlidir.

import { useEffect, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { useSimConfig } from "@/components/SimConfigProvider";
import { ParametreEditoru } from "@/components/ParametreEditoru";
import { PARAMETRELER_AC } from "@/components/Kaynak";
import { useDil } from "@/components/DilProvider";

export function ParametreDuzenleButonu() {
  const { sifirla, yazilabilir } = useSimConfig();
  const { t } = useDil();
  const [acik, setAcik] = useState(false);

  // Panellerdeki "⚙ Parametreler →" kısayolları bu olayla modalı açar (aşağı inmeden).
  useEffect(() => {
    const ac = () => setAcik(true);
    window.addEventListener(PARAMETRELER_AC, ac);
    return () => window.removeEventListener(PARAMETRELER_AC, ac);
  }, []);

  // Esc ile kapan; modal açıkken arka plan kaymasın.
  useEffect(() => {
    if (!acik) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAcik(false); };
    window.addEventListener("keydown", onKey);
    const eskiOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = eskiOverflow; };
  }, [acik]);

  // Yalnız kendi (yazılabilir) projesinde anlamlı — demo/paylaşımda gizli.
  if (!yazilabilir) return null;

  return (
    <>
      <button
        onClick={() => setAcik(true)}
        title={t({ tr: "Simülasyon parametrelerini düzenle (aşağı inmeden)", en: "Edit simulation parameters (without scrolling down)", de: "Simulationsparameter bearbeiten (ohne nach unten zu scrollen)" })}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition hover:bg-white/10"
        style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.22)", color: "#E7ECF1" }}
      >
        <span aria-hidden="true">⚙</span>
        <span className="hidden sm:inline">{t({ tr: "Parametreler", en: "Parameters", de: "Parameter" })}</span>
      </button>

      {acik && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={t({ tr: "Simülasyon parametreleri", en: "Simulation parameters", de: "Simulationsparameter" })}>
          {/* Arka plan — tıklayınca kapanır */}
          <div className="absolute inset-0" style={{ background: "rgba(12,34,51,0.55)" }} onClick={() => setAcik(false)} aria-hidden="true" />

          {/* Panel */}
          <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" style={{ border: `1px solid ${brand.border}` }}>
            {/* Başlık şeridi */}
            <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: brand.border }}>
              <div className="flex items-baseline gap-2">
                <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
                <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Simülasyon Parametreleri", en: "Simulation Parameters", de: "Simulationsparameter" })}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={sifirla} title={t({ tr: "Tüm parametreleri belge (el kitabı) varsayılanlarına döndür", en: "Reset all parameters to the document (handbook) defaults", de: "Alle Parameter auf die Dokument-(Handbuch-)Standardwerte zurücksetzen" })}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
                  ↺ {t({ tr: "Varsayılanlar", en: "Defaults", de: "Standardwerte" })}
                </button>
                <button onClick={() => setAcik(false)} title={t({ tr: "Kapat (Esc)", en: "Close (Esc)", de: "Schließen (Esc)" })}
                  className="rounded-md px-2 py-1 text-sm font-medium transition hover:bg-slate-100" style={{ color: brand.inkSoft }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Açıklama */}
            <p className="border-b px-5 py-2 text-xs" style={{ borderColor: brand.border, color: brand.muted }}>
              {t({ tr: "Tek kaynak — değiştirdiğin an Ringler / Sefer / Sistem modüllerinin tümü yeniden hesaplar ve otomatik kaydedilir.", en: "Single source — the moment you change it, the Ringler / Service / System modules all recompute and auto-save.", de: "Einzige Quelle — sobald Sie etwas ändern, berechnen die Module Streckenabschnitte / Betrieb / System alles neu und speichern automatisch." })}
            </p>

            {/* Kaydırılabilir gövde */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ParametreEditoru />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
