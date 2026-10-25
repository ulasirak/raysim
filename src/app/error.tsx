"use client";

// raysim — ROTA HATA SINIRI (Next.js App Router `error.tsx`).
// Bölüm-içi <HataSiniri> yakalayamadığı bir hatayı (sağlayıcı/kabuk düzeyinde) burada
// yakalar → çıplak "Application error" yerine markalı kurtarma ekranı + yeniden dene.

import { useEffect } from "react";

// Hata sınırında DilProvider erişilemeyebilir → dili doğrudan localStorage'tan oku.
function dilOku(): "tr" | "en" | "de" {
  try { const d = localStorage.getItem("raysim-dil"); return d === "en" ? "en" : d === "de" ? "de" : "tr"; } catch { return "tr"; }
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[RaySim] rota hatası:", error); }, [error]);
  const dil = dilOku();
  const m = (tr: string, en: string, de: string) => (dil === "en" ? en : dil === "de" ? de : tr);
  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "#1F2933" }}>Ray<span style={{ color: "#B3282D" }}>Sim</span></div>
        <div style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: "#334155" }}>{m("Beklenmeyen bir sorun oluştu", "Something went wrong", "Ein unerwarteter Fehler ist aufgetreten")}</div>
        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: "#64748B" }}>
          {m("Uygulama bu işlemi tamamlayamadı. Kaydedilmiş projelerin güvende. Tekrar deneyebilir ya da sayfayı yenileyebilirsin.", "The app couldn't complete this action. Your saved projects are safe. You can try again or reload the page.", "Die App konnte diese Aktion nicht abschließen. Deine gespeicherten Projekte sind sicher. Du kannst es erneut versuchen oder die Seite neu laden.")}
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={reset} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#B3282D", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{m("Tekrar dene", "Try again", "Erneut versuchen")}</button>
          <button onClick={() => location.reload()} style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{m("Sayfayı yenile", "Reload page", "Seite neu laden")}</button>
        </div>
      </div>
    </div>
  );
}
