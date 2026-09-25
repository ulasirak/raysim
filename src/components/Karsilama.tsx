"use client";

// raysim — KULLANICI KILAVUZU / TANITIM SİHİRBAZI.
// Kullanıcı İLK KEZ giriş yaptıktan sonra ana sayfaya (henüz proje üstünde çalışmadan)
// düşünce BİR KEZ otomatik açılır. Sonraki her açılışta / yenilemede AÇILMAZ.
//
// BUG DÜZELTMESİ: bayrak, kılavuz GÖSTERİLİR GÖSTERİLMEZ yazılır (eskiden yalnız
// "kapat"ta yazılıyordu → kullanıcı kapatmadan yenilerse tekrar çıkıyordu). Böylece
// ana sayfada çalışırken yenileyince "ilk giriş" ekranı bir daha çıkmaz.
//
// Yeniden görmek için: hesap menüsü → "Tanıtımı göster" (tanitimAc, bayrağı yok sayar).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";
import { brand } from "@/lib/anaray/brand";

const BAYRAK = (uid: string) => `raysim_karsilama_v3_${uid}`; // ilk-giriş "görüldü" bayrağı
const OLAY = "raysim-tanitim-ac"; // "Tanıtımı göster" tetikleyicisi

/** Tanıtımı zorla aç (hesap menüsündeki "Tanıtımı göster"den). */
export function tanitimAc() {
  try { window.dispatchEvent(new CustomEvent(OLAY)); } catch { /* sessiz */ }
}

interface Adim {
  rozet: string;
  baslik: string;
  govde: React.ReactNode;
}

export function Karsilama() {
  const { user } = useAuth();
  const { paylasimGorunumu, demoMu } = useHesap();
  const { t } = useDil();
  const [acik, setAcik] = useState(false);
  const [i, setI] = useState(0);

  // Boru hattı istasyonları — AppShell metro hattıyla aynı sıra/anlam.
  const ISTASYONLAR: { no: number; ad: string; not: string }[] = [
    { no: 1, ad: t({ tr: "Durak Arası Ringler", en: "Inter-Stop Rings", de: "Haltestellen-Ringe" }), not: t({ tr: "Hattı ve makas bölgelerini kur — buradaki her veri kalıcı.", en: "Build the line and switch zones — every value here is persistent.", de: "Baue die Linie und Weichenbereiche auf — jeder Wert hier ist dauerhaft." }) },
    { no: 2, ad: t({ tr: "Sefer Simülasyonu", en: "Service Simulation", de: "Fahrtsimulation" }), not: t({ tr: "Kurduğun hattı simüle et: canlı ağ, fizik, sefer aralığı.", en: "Simulate the line you built: live network, physics, headway.", de: "Simuliere die aufgebaute Linie: Live-Netz, Physik, Taktzeit." }) },
    { no: 3, ad: t({ tr: "Sistem Merkezi", en: "System Center", de: "Systemzentrale" }), not: t({ tr: "Kapasite · blocking-time · darboğaz teşhisi.", en: "Capacity · blocking-time · bottleneck diagnosis.", de: "Kapazität · Blocking-Time · Engpassdiagnose." }) },
    { no: 4, ad: t({ tr: "Ters İşletme", en: "Reverse Operation", de: "Umkehrbetrieb" }), not: t({ tr: "Kısa dönüş, makas varyasyonları, talebe göre filo.", en: "Short turns, switch variations, demand-based fleet.", de: "Kurzwenden, Weichenvarianten, nachfragebasierte Flotte." }) },
    { no: 5, ad: t({ tr: "Teknik Belgeler", en: "Technical Documents", de: "Technische Dokumente" }), not: t({ tr: "Analizden profesyonel PDF rapor üret.", en: "Produce a professional PDF report from the analysis.", de: "Erstelle aus der Analyse einen professionellen PDF-Bericht." }) },
    { no: 6, ad: t({ tr: "Karşılaştırma", en: "Comparison", de: "Vergleich" }), not: t({ tr: "Senaryoları yan yana koy — karar desteği.", en: "Put scenarios side by side — decision support.", de: "Stelle Szenarien nebeneinander — Entscheidungshilfe." }) },
  ];

  const ADIMLAR: Adim[] = [
    {
      rozet: t({ tr: "HOŞ GELDİN", en: "WELCOME", de: "WILLKOMMEN" }),
      baslik: t({ tr: "RaySim'e hoş geldin", en: "Welcome to RaySim", de: "Willkommen bei RaySim" }),
      govde: (
        <p className="text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
          {t({ tr: "RaySim, bir demiryolu/tramvay hattını uçtan uca kurup simüle ettiğin, kapasitesini ve darboğazlarını çözümlediğin, sonra bunlardan profesyonel dokümantasyon ürettiğin bir ", en: "RaySim is a ", de: "RaySim ist ein " })}<strong>{t({ tr: "ağ simülasyon sistemidir", en: "network simulation system", de: "Netzwerk-Simulationssystem" })}</strong>{t({ tr: ". Blocking-time · Sperrzeitentreppe · UIC 406 metodolojisine dayanan bağımsız bir çekirdek kullanır. Aşağıda nasıl çalıştığını 30 saniyede gösterelim.", en: " where you build and simulate a rail/tram line end to end, analyze its capacity and bottlenecks, then produce professional documentation from them. It uses an independent core based on blocking-time · Sperrzeitentreppe · UIC 406 methodology. Below, let us show how it works in 30 seconds.", de: ", mit dem du eine Bahn-/Straßenbahnlinie durchgängig aufbaust und simulierst, ihre Kapazität und Engpässe analysierst und daraus professionelle Dokumentation erstellst. Es nutzt einen unabhängigen Kern nach der Methodik Blocking-Time · Sperrzeitentreppe · UIC 406. Im Folgenden zeigen wir in 30 Sekunden, wie es funktioniert." })}
        </p>
      ),
    },
    {
      rozet: t({ tr: "BORU HATTI", en: "PIPELINE", de: "PIPELINE" }),
      baslik: t({ tr: "Altı istasyonluk bir iş akışı", en: "A six-station workflow", de: "Ein Arbeitsablauf mit sechs Stationen" }),
      govde: (
        <div>
          <p className="mb-3 text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
            {t({ tr: "Üstteki metro hattı, verinin akışıdır: soldan sağa ", en: "The metro line above is the flow of data: from left to right ", de: "Die Metrolinie oben ist der Datenfluss: von links nach rechts " })}<strong>{t({ tr: "kur → analiz et → belgele", en: "build → analyze → document", de: "aufbauen → analysieren → dokumentieren" })}</strong>{t({ tr: ". Yukarıdan aşağı kaydırarak ilerlersin.", en: ". You progress by scrolling from top to bottom.", de: ". Du gehst weiter, indem du von oben nach unten scrollst." })}
          </p>
          <ul className="flex flex-col gap-2">
            {ISTASYONLAR.map((s) => (
              <li key={s.no} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[0.68rem] font-semibold tabular-nums"
                  style={{ background: brand.ink, borderColor: brand.ink, color: "#fff" }}
                >
                  {s.no}
                </span>
                <span className="min-w-0 text-sm leading-tight">
                  <span className="font-medium" style={{ color: brand.ink }}>{s.ad}</span>
                  <span className="block text-[0.78rem]" style={{ color: brand.muted }}>{s.not}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      rozet: t({ tr: "BAŞLARKEN", en: "GETTING STARTED", de: "ERSTE SCHRITTE" }),
      baslik: t({ tr: "Kendi hattınla başla", en: "Start with your own line", de: "Beginne mit deiner eigenen Linie" }),
      govde: (
        <div className="flex flex-col gap-3 text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
          <p>
            {t({ tr: "Hesabın ", en: "Your account opens ", de: "Dein Konto öffnet " })}<strong>{t({ tr: "boş bir hatla", en: "with an empty line", de: "mit einer leeren Linie" })}</strong>{t({ tr: " açılır. Sıra şu:", en: ". The order is:", de: ". Die Reihenfolge:" })}
          </p>
          <ol className="flex flex-col gap-2">
            {[
              ["1", t({ tr: "Hattı kur", en: "Build the line", de: "Linie aufbauen" }), t({ tr: "Ringler'de durakları, mesafeleri ve makasları gir — GTFS / railML / DXF / shapefile içe aktarabilir ya da coğrafi koordinattan üretebilirsin.", en: "Enter stops, distances and switches in Rings — you can import GTFS / railML / DXF / shapefile or generate from geographic coordinates.", de: "Gib Haltestellen, Entfernungen und Weichen in den Ringen ein — du kannst GTFS / railML / DXF / Shapefile importieren oder aus geografischen Koordinaten erzeugen." })],
              ["2", t({ tr: "Simüle et", en: "Simulate", de: "Simulieren" }), t({ tr: "Sefer ve Sistem Merkezi'nde canlı ağı, kapasiteyi ve darboğazları çöz.", en: "Solve the live network, capacity and bottlenecks in Service and System Center.", de: "Löse das Live-Netz, die Kapazität und die Engpässe in Fahrt und Systemzentrale." })],
              ["3", t({ tr: "Belgele", en: "Document", de: "Dokumentieren" }), t({ tr: "Teknik Belgeler'den amblemli, baskıya hazır PDF raporu üret.", en: "Produce a branded, print-ready PDF report from Technical Documents.", de: "Erstelle aus den technischen Dokumenten einen gebrandeten, druckfertigen PDF-Bericht." })],
            ].map(([n, b, a]) => (
              <li key={n} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white" style={{ background: brand.red }}>{n}</span>
                <span className="min-w-0">
                  <span className="font-medium" style={{ color: brand.ink }}>{b}</span>
                  <span className="block text-[0.82rem]" style={{ color: brand.muted }}>{a}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ),
    },
  ];

  // İLK GİRİŞ: kullanıcı ilk kez giriş yapıp ana sayfaya düşünce bir kez açılır.
  // Bayrak GÖSTERİLİR GÖSTERİLMEZ yazılır → yenilemede/tekrar girişte bir daha açılmaz.
  useEffect(() => {
    if (!user || paylasimGorunumu || demoMu) return;
    try {
      if (localStorage.getItem(BAYRAK(user.uid))) return;
      localStorage.setItem(BAYRAK(user.uid), "1"); // görüldü — kalıcı işaretle (bir kez)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAcik(true);
      setI(0);
    } catch { /* sessiz */ }
  }, [user, paylasimGorunumu, demoMu]);

  // "Tanıtımı göster" — bayrağı yok say, zorla aç.
  useEffect(() => {
    const ac = () => { setI(0); setAcik(true); };
    window.addEventListener(OLAY, ac);
    return () => window.removeEventListener(OLAY, ac);
  }, []);

  const kapat = () => setAcik(false);

  // ESC ile kapat.
  useEffect(() => {
    if (!acik) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAcik(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [acik]);

  if (!acik) return null;

  const sonAdim = i === ADIMLAR.length - 1;
  const adim = ADIMLAR[i];

  const bitir = () => {
    kapat();
    // İlk adıma (Ringler) kaydır — kullanıcı hattı kurmaya başlasın.
    setTimeout(() => {
      document.getElementById("ringler")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/55 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={t({ tr: "RaySim tanıtımı", en: "RaySim tour", de: "RaySim-Einführung" })}
      onClick={(e) => { if (e.target === e.currentTarget) kapat(); }}
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Başlık şeridi */}
        <div className="flex items-center justify-between rounded-t-xl px-5 py-3"
          style={{ background: "linear-gradient(180deg, #0F2B40 0%, #0C2233 100%)" }}>
          <span className="font-brand text-sm font-semibold tracking-[0.16em] text-white">RaySim</span>
          <button onClick={kapat} title={t({ tr: "Kapat", en: "Close", de: "Schließen" })}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">
            ✕ {t({ tr: "Atla", en: "Skip", de: "Überspringen" })}
          </button>
        </div>

        {/* İçerik */}
        <div className="px-5 pb-2 pt-5">
          <span className="font-brand text-[0.7rem] font-bold tracking-[0.22em]" style={{ color: brand.red }}>
            {adim.rozet}
          </span>
          <h2 className="mb-3 mt-1 text-lg font-semibold" style={{ color: brand.ink }}>{adim.baslik}</h2>
          {adim.govde}
        </div>

        {/* İlerleme noktaları */}
        <div className="flex items-center justify-center gap-1.5 py-4">
          {ADIMLAR.map((_, k) => (
            <span key={k} className="h-1.5 rounded-full transition-all"
              style={{ width: k === i ? 18 : 6, background: k === i ? brand.red : brand.borderStrong }} />
          ))}
        </div>

        {/* Bu tanıtım yalnız ilk girişte bir kez gösterilir — bilgilendirme */}
        <div className="border-t px-5 py-2 text-[0.68rem]" style={{ borderColor: brand.border, color: brand.faint }}>
          {t({ tr: "Bu tanıtım yalnız ilk girişte bir kez açılır. İstediğinde hesap menüsünden ", en: "This tour opens only once, on first sign-in. You can reopen it anytime from the account menu with ", de: "Diese Einführung öffnet sich nur einmal, bei der ersten Anmeldung. Du kannst sie jederzeit über das Kontomenü mit " })}<b>{t({ tr: "“Tanıtımı göster”", en: "“Show tour”", de: "„Tour anzeigen“" })}</b>{t({ tr: " ile tekrar açabilirsin.", en: ".", de: " erneut öffnen." })}
        </div>

        {/* Aksiyonlar */}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: brand.border }}>
          <button
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={i === 0}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition enabled:hover:bg-slate-50 disabled:opacity-40"
            style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}
          >
            ← {t({ tr: "Geri", en: "Back", de: "Zurück" })}
          </button>

          {!sonAdim ? (
            <button
              onClick={() => setI((v) => Math.min(ADIMLAR.length - 1, v + 1))}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: brand.red }}
            >
              {t({ tr: "İleri", en: "Next", de: "Weiter" })} →
            </button>
          ) : (
            <button
              onClick={bitir}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: brand.red }}
            >
              {t({ tr: "Hattı kurmaya başla", en: "Start building the line", de: "Linie aufbauen starten" })} →
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
