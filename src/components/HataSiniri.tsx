"use client";

// raysim — BÖLÜM HATA SINIRI (React error boundary).
// Tek sayfada 7 ağır modül aynı anda mount olur; sınır OLMADAN herhangi birinde
// yakalanmamış bir render hatası TÜM ağacı Next.js'in çıplak "Application error"
// ekranına düşürür (kaydedilmemiş düzenlemeler kaybolur). Bu sınır her bölümü
// YALITIR: bir modül çökse bile diğerleri (ve hesap çubuğu/kaydetme) çalışmaya
// devam eder; çöken bölümde markalı bir kurtarma kutusu + "Tekrar dene" gösterilir.

import React from "react";

// Hata sınırında DilProvider erişilemeyebilir → dili doğrudan localStorage'tan oku.
function dilOku(): "tr" | "en" | "de" {
  try { const d = localStorage.getItem("raysim-dil"); return d === "en" ? "en" : d === "de" ? "de" : "tr"; } catch { return "tr"; }
}

interface Props { ad: string; children: React.ReactNode }
interface State { hata: Error | null }

export class HataSiniri extends React.Component<Props, State> {
  state: State = { hata: null };

  static getDerivedStateFromError(hata: Error): State { return { hata }; }

  componentDidCatch(hata: Error, info: React.ErrorInfo) {
    // Teşhis için konsola — kullanıcıya sızmaz. (Sunucuya log yollanmaz: gizlilik.)
    console.error(`[RaySim] "${this.props.ad}" bölümünde hata:`, hata, info.componentStack);
  }

  private tekrarDene = () => this.setState({ hata: null });

  render() {
    if (this.state.hata) {
      const dil = dilOku();
      const m = (tr: string, en: string, de: string) => (dil === "en" ? en : dil === "de" ? de : tr);
      return (
        <div style={{ margin: "16px auto", maxWidth: 720, padding: "20px 22px", border: "1px solid #E6C9CB", borderRadius: 10, background: "#FCF4F4", color: "#5A2A2C", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{m(`“${this.props.ad}” bölümü yüklenemedi`, `The “${this.props.ad}” section failed to load`, `Der Abschnitt „${this.props.ad}“ konnte nicht geladen werden`)}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#7A4A4C" }}>
            {m("Bu bölümde beklenmeyen bir sorun oluştu. Sayfanın geri kalanı ve kaydettiğin veriler etkilenmedi. Tekrar deneyebilir ya da sayfayı yenileyebilirsin.", "An unexpected problem occurred in this section. The rest of the page and your saved data are unaffected. You can try again or reload the page.", "In diesem Abschnitt ist ein unerwartetes Problem aufgetreten. Der Rest der Seite und deine gespeicherten Daten sind nicht betroffen. Du kannst es erneut versuchen oder die Seite neu laden.")}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={this.tekrarDene} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#B3282D", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{m("Tekrar dene", "Try again", "Erneut versuchen")}</button>
            <button onClick={() => location.reload()} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #C9B3B4", background: "#fff", color: "#5A2A2C", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{m("Sayfayı yenile", "Reload page", "Seite neu laden")}</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
