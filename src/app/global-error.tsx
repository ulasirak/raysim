"use client";

// raysim — KÖK HATA SINIRI (Next.js App Router `global-error.tsx`).
// Root layout'un kendisi çökerse devreye girer; kendi <html>/<body>'sini render eder.
// error.tsx yalnız rota alt-ağacını sarar; bu ise layout düzeyindeki hataları yakalar.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#EAEEF2", color: "#1F2933" }}>
        <div style={{ maxWidth: 460, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Ray<span style={{ color: "#B3282D" }}>Sim</span></div>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: "#334155" }}>Uygulama yeniden başlatılıyor</div>
          <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: "#64748B" }}>Beklenmeyen bir sorun oluştu. Kaydedilmiş verilerin güvende.</div>
          <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={reset} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#B3282D", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Tekrar dene</button>
            <button onClick={() => location.reload()} style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Sayfayı yenile</button>
          </div>
        </div>
      </body>
    </html>
  );
}
