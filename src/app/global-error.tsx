"use client";

// raysim — KÖK HATA SINIRI (Next.js App Router `global-error.tsx`).
// Root layout'un kendisi çökerse devreye girer; kendi <html>/<body>'sini render eder.
// error.tsx yalnız rota alt-ağacını sarar; bu ise layout düzeyindeki hataları yakalar.

function dilOku(): "tr" | "en" | "de" {
  try { const d = localStorage.getItem("raysim-dil"); return d === "en" ? "en" : d === "de" ? "de" : "tr"; } catch { return "tr"; }
}

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const dil = dilOku();
  const m = (tr: string, en: string, de: string) => (dil === "en" ? en : dil === "de" ? de : tr);
  return (
    <html lang={dil}>
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#EAEEF2", color: "#1F2933" }}>
        <div style={{ maxWidth: 460, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Ray<span style={{ color: "#B3282D" }}>Sim</span></div>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: "#334155" }}>{m("Uygulama yeniden başlatılıyor", "Restarting the app", "Die App wird neu gestartet")}</div>
          <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: "#64748B" }}>{m("Beklenmeyen bir sorun oluştu. Kaydedilmiş verilerin güvende.", "An unexpected problem occurred. Your saved data is safe.", "Ein unerwartetes Problem ist aufgetreten. Deine gespeicherten Daten sind sicher.")}</div>
          <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={reset} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#B3282D", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{m("Tekrar dene", "Try again", "Erneut versuchen")}</button>
            <button onClick={() => location.reload()} style={{ padding: "8px 18px", borderRadius: 7, border: "1px solid #CBD5E1", background: "#fff", color: "#334155", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{m("Sayfayı yenile", "Reload page", "Seite neu laden")}</button>
          </div>
        </div>
      </body>
    </html>
  );
}
