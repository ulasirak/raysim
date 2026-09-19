"use client";

// raysim — ROTA HATA SINIRI (Next.js App Router `error.tsx`).
// Bölüm-içi <HataSiniri> yakalayamadığı bir hatayı (sağlayıcı/kabuk düzeyinde) burada
// yakalar → çıplak "Application error" yerine markalı kurtarma ekranı + yeniden dene.

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[RaySim] rota hatası:", error); }, [error]);
  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "#1F2933" }}>Ray<span style={{ color: "#B3282D" }}>Sim</span></div>
        <div style={{ marginTop: 18, fontSize: 16, fontWeight: 700, color: "#334155" }}>Beklenmeyen bir sorun oluştu</div>
        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: "#64748B" }}>
          Uygulama bu işlemi tamamlayamadı. Kaydedilmiş projelerin güvende. Tekrar deneyebilir ya da sayfayı yenileyebilirsin.
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={reset} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#B3282D", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Tekrar dene</button>
          <button onClick={() => location.reload()} style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Sayfayı yenile</button>
        </div>
      </div>
    </div>
  );
}
