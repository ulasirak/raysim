"use client";

// raysim — SUNUM / HİKAYE MODU (kapsamlı, çok dilli rehberli pitch).
// Sistemin HER parçasını doğru sırayla + doğru dille anlatır. 3 DİL: Türkçe (varsayılan),
// İngilizce, Almanca — anlatım + kontrol etiketleri canlı değişir. Akış:
//  Kapak → KUR → ANALİZ (Filo·Canlı Harita·Grafikler·Dayanıklılık) →
//  SİSTEM (Kapasite·Terminal·Doğruluk·Karar) → BELGELE → KARŞILAŞTIR → Kapanış kartı.
// Her (kapak-olmayan) adımda: (1) modüle kaydırır, (2) gereken SEKMEYİ açar (radio .click()),
// (3) o an anlatılan paneli altın "spot" halkasıyla vurgular (.sunum-vurgu), (4) altta şık
// anlatım şeridi. Giriş/kapanış tam ekran kapak kartıdır. ← → gez, Esc çık, ⏵ oto-oynat.

import { useEffect, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import type { BolumSlug } from "@/components/TekSayfa";

type Dil = "tr" | "en" | "de";
type Metin = { faz: string; baslik: string; anlatim: string };
type Adim = {
  no: string;
  slug: BolumSlug;        // kaydırılacak modül bölümü
  sekme?: string;         // açılacak sekme radio id'si (ör. "sm-t3", "sf-t2")
  tikla?: string[];       // ek OTO-tıklanacak butonlar (data-sunum anahtarı)
  hedefId?: string;       // slug yerine özel kaydırma/vurgu hedefi (ör. "canli")
  kapak?: boolean;        // tam ekran kapak kartı (giriş/kapanış)
  metin: Record<Dil, Metin>;
};

const DILLER: Dil[] = ["tr", "en", "de"];

// Kontrol/etiket sözlüğü (dile göre).
const UI: Record<Dil, { basla: string; ileri: string; geri: string; bitir: string; bastan: string; oynat: string; duraklat: string; cik: string }> = {
  tr: { basla: "Başla", ileri: "İleri", geri: "Geri", bitir: "Bitir", bastan: "Baştan", oynat: "Otomatik ilerlet", duraklat: "Duraklat", cik: "Sunumdan çık" },
  en: { basla: "Start", ileri: "Next", geri: "Back", bitir: "Finish", bastan: "Restart", oynat: "Auto-play", duraklat: "Pause", cik: "Exit" },
  de: { basla: "Starten", ileri: "Weiter", geri: "Zurück", bitir: "Beenden", bastan: "Neustart", oynat: "Autoplay", duraklat: "Pause", cik: "Schließen" },
};

const ADIMLAR: Adim[] = [
  {
    no: "1", slug: "ringler", kapak: true,
    metin: {
      tr: { faz: "GENEL BAKIŞ", baslik: "RaySim", anlatim: "Bir raylı sistem hattını gerçek veriyle KURAN, mikroskobik fizik motoruyla SİMÜLE EDEN ve UIC 406 metodolojisiyle RAPORLAYAN bütünleşik karar-destek platformu. Akış: Kur → Analiz Et → Sistem → Belgele → Karşılaştır." },
      en: { faz: "OVERVIEW", baslik: "RaySim", anlatim: "An integrated decision-support platform that BUILDS a rail line from real data, SIMULATES it with a microscopic physics engine and REPORTS it with the UIC 406 methodology. Flow: Build → Analyze → System → Document → Compare." },
      de: { faz: "ÜBERBLICK", baslik: "RaySim", anlatim: "Eine integrierte Entscheidungsplattform, die eine Bahnstrecke aus echten Daten AUFBAUT, mit einem mikroskopischen Physikmodell SIMULIERT und nach UIC-406-Methodik DOKUMENTIERT. Ablauf: Aufbauen → Analysieren → System → Dokumentieren → Vergleichen." },
    },
  },
  {
    no: "2", slug: "ringler",
    metin: {
      tr: { faz: "KUR", baslik: "Hattı tanımla", anlatim: "Her şey hattın kendisiyle başlar: durak-arası hücreler (ring) gerçek mesafe ve saha hızıyla; makas bölgeleri (S/X geometrisi), yön-duyarlı sinyal lambaları ve yatay kurplar. GTFS · railML · CAD (DXF) · Shapefile'dan tek tıkla içe aktar; her veri projeye kalıcı yazılır." },
      en: { faz: "BUILD", baslik: "Define the line", anlatim: "Everything starts with the line itself: inter-stop cells (rings) with real distance and field speed; switch zones (S/X geometry), direction-aware signals and horizontal curves. Import in one click from GTFS · railML · CAD (DXF) · Shapefile; every value is stored permanently in the project." },
      de: { faz: "AUFBAUEN", baslik: "Strecke definieren", anlatim: "Alles beginnt mit der Strecke selbst: Abschnitte zwischen Haltestellen mit realer Entfernung und Streckengeschwindigkeit; Weichenbereiche (S/X-Geometrie), richtungsabhängige Signale und Gleisbögen. Import per Klick aus GTFS · railML · CAD (DXF) · Shapefile; jeder Wert wird dauerhaft gespeichert." },
    },
  },
  {
    no: "3", slug: "sefer", sekme: "sf-t1",
    metin: {
      tr: { faz: "ANALİZ · FİLO", baslik: "Önerilen filoyu belirle", anlatim: "Sefer modülü hattı işletmeye çevirir. Sistem, tüm girdilerine göre gereken tramvay sayısını ÖNERİR; onayladığında filo öneriye eşitlenir. Ulaşılan sefer aralığı = çevrim ÷ filo. Araçları depolara elle parklarsın — rastgele dağıtım yok." },
      en: { faz: "ANALYZE · FLEET", baslik: "Set the recommended fleet", anlatim: "The Service module turns the line into an operation. From all your inputs it RECOMMENDS the required number of trams; once confirmed, the fleet is set to it. Achieved headway = cycle ÷ fleet. You park vehicles into depots by hand — no random assignment." },
      de: { faz: "ANALYSE · FLOTTE", baslik: "Empfohlene Flotte festlegen", anlatim: "Das Betriebsmodul macht aus der Strecke einen Betrieb. Aus allen Eingaben EMPFIEHLT es die nötige Zahl an Straßenbahnen; nach Bestätigung wird die Flotte darauf gesetzt. Erreichte Zugfolgezeit = Umlauf ÷ Flotte. Fahrzeuge werden von Hand in Depots gestellt — keine Zufallsverteilung." },
    },
  },
  {
    no: "4", slug: "sefer", sekme: "sf-t2", tikla: ["filo-onayla", "harita"], hedefId: "canli",
    metin: {
      tr: { faz: "ANALİZ · CANLI", baslik: "Gerçek haritada işlet", anlatim: "Aynı ağı GERÇEK haritada, çift-ray gidiş-geliş izle (mavi gidiş · turuncu dönüş). Koordinatlar işleyen hatta OpenStreetMap'ten otomatik gelir; hız sınırları, kurp konforu ve makaslarda ters işletme kısa dönüşleri canlı görünür. Bir işarete tıkla → detay." },
      en: { faz: "ANALYZE · LIVE", baslik: "Run on the real map", anlatim: "Watch the same network on a REAL map as two-track there-and-back (blue outbound · orange return). Coordinates come automatically from OpenStreetMap for an operating line; speed limits, curve comfort and short-turns at switches show live. Click any marker for detail." },
      de: { faz: "ANALYSE · LIVE", baslik: "Auf der echten Karte fahren", anlatim: "Dasselbe Netz auf einer ECHTEN Karte als zweigleisigen Hin- und Rücklauf (blau hin · orange zurück). Koordinaten kommen bei einer Bestandsstrecke automatisch aus OpenStreetMap; Geschwindigkeitsgrenzen, Bogenkomfort und Kehren an Weichen erscheinen live. Für Details ein Symbol anklicken." },
    },
  },
  {
    no: "5", slug: "sefer", sekme: "sf-t3",
    metin: {
      tr: { faz: "ANALİZ · GRAFİK", baslik: "Mühendislik grafikleri", anlatim: "Klasik demiryolu analizi tek yerde: Bildfahrplan (zaman–mesafe / Marey), gecikme yayılımı (knock-on), hız profili v(x), yük & duruş (dwell) ve talep → doluluk zinciri. Tüm grafikler canlı simülasyonla BİREBİR aynı veriden türer." },
      en: { faz: "ANALYZE · CHARTS", baslik: "Engineering charts", anlatim: "Classic railway analysis in one place: Bildfahrplan (time–distance / Marey), delay propagation (knock-on), speed profile v(x), load & dwell, and the demand → occupancy chain. Every chart derives from EXACTLY the same data as the live simulation." },
      de: { faz: "ANALYSE · DIAGRAMME", baslik: "Ingenieur-Diagramme", anlatim: "Klassische Eisenbahnanalyse an einem Ort: Bildfahrplan (Zeit–Weg / Marey), Verspätungsausbreitung (Folgeverspätung), Geschwindigkeitsprofil v(x), Last & Haltezeit sowie die Kette Nachfrage → Auslastung. Jedes Diagramm stammt aus GENAU denselben Daten wie die Live-Simulation." },
    },
  },
  {
    no: "6", slug: "sefer", sekme: "sf-t4",
    metin: {
      tr: { faz: "ANALİZ · RİSK", baslik: "Etkiler & dayanıklılık", anlatim: "Filoyu oynattıkça ulaşılan sıklık, kapasite/park aşımı ve tıkanan duraklar canlı güncellenir. Monte-Carlo dayanıklılık analizi, rastgele gecikmelere rağmen hedef güvenilirlik ve konfor için gereken MİNİMUM filoyu verir." },
      en: { faz: "ANALYZE · RISK", baslik: "Effects & robustness", anlatim: "As you change the fleet, achieved frequency, capacity/parking overflow and congested stops update live. A Monte-Carlo robustness analysis gives the MINIMUM fleet needed to hold target reliability and comfort despite random delays." },
      de: { faz: "ANALYSE · RISIKO", baslik: "Auswirkungen & Robustheit", anlatim: "Wenn Sie die Flotte ändern, aktualisieren sich erreichte Taktzeit, Kapazitäts-/Abstellüberlauf und überlastete Haltestellen live. Eine Monte-Carlo-Robustheitsanalyse liefert die MINIMALE Flotte, um Zuverlässigkeit und Komfort trotz zufälliger Verspätungen zu halten." },
    },
  },
  {
    no: "7", slug: "sistem", sekme: "sm-t1",
    metin: {
      tr: { faz: "SİSTEM · KAPASİTE", baslik: "Kapasite & kısıt", anlatim: "Hattı fiziksel olarak ne bağlıyor? Blocking-time (Sperrzeitentreppe) her sinyal bloğunun rezerve süresini; UIC 406 doluluk hedefe yakınlığı; belirleyici kısıt (blok · terminal · tek-hat · kavşak · sinyal) hangi etkenin bağladığını gösterir. Kilitleme kontrol tablosu da burada." },
      en: { faz: "SYSTEM · CAPACITY", baslik: "Capacity & constraint", anlatim: "What physically limits the line? Blocking-time (Sperrzeitentreppe) gives each signal block's reserved time; UIC 406 occupancy its closeness to target; the governing constraint (block · terminal · single-track · junction · signal) shows which factor binds. The interlocking control table is here too." },
      de: { faz: "SYSTEM · KAPAZITÄT", baslik: "Kapazität & Engpass", anlatim: "Was begrenzt die Strecke physikalisch? Die Sperrzeitentreppe gibt die Sperrzeit jedes Blocks; die UIC-406-Auslastung die Nähe zum Ziel; der maßgebende Engpass (Block · Endstelle · Eingleis · Kreuzung · Signal) zeigt, welcher Faktor bindet. Auch die Verschlusstabelle (Interlocking) ist hier." },
    },
  },
  {
    no: "8", slug: "sistem", sekme: "sm-t2",
    metin: {
      tr: { faz: "SİSTEM · TERMİNAL", baslik: "Terminal & yol etkileri", anlatim: "Tramvay hatlarını çoğu kez TERMİNAL DÖNÜŞÜ bağlar: turnback kapasitesi makas geometrisi (S/X) ve peron sayısından hesaplanır. Sokak geçitlerinin (hemzemin) yavaşlaması + sinyal önceliği (TSP) beklemesi de tur süresine eklenir." },
      en: { faz: "SYSTEM · TERMINAL", baslik: "Terminal & line effects", anlatim: "Tram lines are most often bound by the TERMINAL turnback: turnback capacity is computed from switch geometry (S/X) and platform count. Level crossings add slow-down plus transit-signal-priority (TSP) waiting to the round-trip time." },
      de: { faz: "SYSTEM · ENDSTELLE", baslik: "Endstellen- & Streckeneffekte", anlatim: "Straßenbahnstrecken werden meist durch die WENDE an der Endstelle begrenzt: die Wendekapazität ergibt sich aus Weichengeometrie (S/X) und Bahnsteigzahl. Bahnübergänge fügen Verlangsamung plus Wartezeit der Ampelvorrangschaltung (TSP) zur Umlaufzeit hinzu." },
    },
  },
  {
    no: "9", slug: "sistem", sekme: "sm-t3",
    metin: {
      tr: { faz: "SİSTEM · DOĞRULUK", baslik: "Motor doğruluğu", anlatim: "Sonuçlara güven: duyarlılık (tornado) hangi girdinin kapasiteyi en çok oynattığını sıralar; Doğrulama & Geçerleme (V&V) motoru kanonik analitik referanslara (UIC, Sperrzeit) karşı sertifikalar — 'AI yapımı' değil, mühendislik disiplinli." },
      en: { faz: "SYSTEM · ACCURACY", baslik: "Engine accuracy", anlatim: "Trust the results: sensitivity (tornado) ranks which input moves capacity most; Verification & Validation (V&V) certifies the engine against canonical analytical references (UIC, Sperrzeit) — engineering-disciplined, not 'AI-made'." },
      de: { faz: "SYSTEM · GENAUIGKEIT", baslik: "Modellgenauigkeit", anlatim: "Vertrauen in die Ergebnisse: die Sensitivität (Tornado) reiht, welche Eingabe die Kapazität am stärksten bewegt; Verifizierung & Validierung (V&V) zertifiziert das Modell gegen kanonische analytische Referenzen (UIC, Sperrzeit) — ingenieurmäßig, nicht 'KI-gemacht'." },
    },
  },
  {
    no: "10", slug: "sistem", sekme: "sm-t4",
    metin: {
      tr: { faz: "SİSTEM · KARAR", baslik: "Filo & kapasite kararı", anlatim: "Aynı temel kapasiteden iki karar: Operasyonel (istenen aralığı hangi filo verir) ve Risk (gecikmeye rağmen güvenilirlik + konfor için minimum filo) — artı tek-hat için kalkış-offset ile çakışmasız çizelge çözücüsü." },
      en: { faz: "SYSTEM · DECISION", baslik: "Fleet & capacity decision", anlatim: "Two decisions from the same base capacity: Operational (which fleet gives the desired headway) and Risk (minimum fleet for reliability + comfort despite delays) — plus a single-track conflict solver using departure offsets for a clash-free schedule." },
      de: { faz: "SYSTEM · ENTSCHEIDUNG", baslik: "Flotten- & Kapazitätsentscheidung", anlatim: "Zwei Entscheidungen aus derselben Grundkapazität: Betrieblich (welche Flotte liefert die gewünschte Zugfolgezeit) und Risiko (minimale Flotte für Zuverlässigkeit + Komfort trotz Verspätungen) — plus ein Eingleis-Konfliktlöser mit Abfahrtsversatz für einen konfliktfreien Fahrplan." },
    },
  },
  {
    no: "11", slug: "belgeler",
    metin: {
      tr: { faz: "BELGELE", baslik: "Profesyonel rapor", anlatim: "Tüm analizden markalı, baskıya hazır PDF tasarım dokümantasyonu üretilir — her sayı girdi ve yöntem künyeli, izlenebilir. İstersen 'müşteri sunumu' olarak, onaylı tasarım dilinde de dışa aktarılır." },
      en: { faz: "DOCUMENT", baslik: "Professional report", anlatim: "From the whole analysis a branded, print-ready PDF design document is produced — every number carries its input and method, fully traceable. It can also be exported as a 'client presentation' in approved-design language." },
      de: { faz: "DOKUMENTIEREN", baslik: "Professioneller Bericht", anlatim: "Aus der gesamten Analyse entsteht ein markiertes, druckfertiges PDF-Planungsdokument — jede Zahl trägt ihre Eingabe und Methode, voll nachvollziehbar. Auf Wunsch auch als 'Kundenpräsentation' in freigegebener Planungssprache exportierbar." },
    },
  },
  {
    no: "12", slug: "karsilastirma",
    metin: {
      tr: { faz: "KARŞILAŞTIR", baslik: "Senaryo karşılaştırma", anlatim: "Farklı senaryoları veya projeleri yan yana koy — objektif, sayıya dayalı karar desteği: hangi tasarım hangi kapasiteyi, hangi filoyla, hangi maliyetle veriyor." },
      en: { faz: "COMPARE", baslik: "Scenario comparison", anlatim: "Put different scenarios or projects side by side — objective, number-based decision support: which design delivers which capacity, with which fleet, at which cost." },
      de: { faz: "VERGLEICHEN", baslik: "Szenarienvergleich", anlatim: "Stellen Sie verschiedene Szenarien oder Projekte nebeneinander — objektive, zahlenbasierte Entscheidungshilfe: welcher Entwurf liefert welche Kapazität, mit welcher Flotte, zu welchen Kosten." },
    },
  },
  {
    no: "13", slug: "ringler", kapak: true,
    metin: {
      tr: { faz: "KAPANIŞ", baslik: "Kur → Analiz → Karar", anlatim: "İşte bütün akış: gerçek veriyle kur, mikroskobik fizikle simüle et, kanonik yöntemle doğrula ve raporla. Şimdi kendi hattınla dene." },
      en: { faz: "WRAP-UP", baslik: "Build → Analyze → Decide", anlatim: "That's the whole flow: build from real data, simulate with microscopic physics, validate with canonical methods and report. Now try it with your own line." },
      de: { faz: "ABSCHLUSS", baslik: "Aufbauen → Analysieren → Entscheiden", anlatim: "Das ist der gesamte Ablauf: aus echten Daten aufbauen, mit mikroskopischer Physik simulieren, mit kanonischen Methoden validieren und dokumentieren. Jetzt mit Ihrer eigenen Strecke ausprobieren." },
    },
  },
];

const TOPLAM = ADIMLAR.length;

function vurguTemizle() {
  document.querySelectorAll(".sunum-vurgu").forEach((el) => el.classList.remove("sunum-vurgu"));
}

function hedefEleman(a: Adim): HTMLElement | null {
  if (a.sekme) {
    const [pre] = a.sekme.split("-");
    const n = a.sekme.slice(-1);
    const panel = document.querySelector<HTMLElement>(`.${pre}-panel[data-t="${n}"]`);
    if (panel) return panel;
  }
  return document.getElementById(a.hedefId ?? a.slug);
}

// Dil seçici (TR · EN · DE) — üst düzey (render içinde tanımlanmaz).
function DilSecici({ dil, setDil, koyu }: { dil: Dil; setDil: (d: Dil) => void; koyu?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-full p-0.5" style={{ background: koyu ? "#0A1826" : "#12314A" }}>
      {DILLER.map((d) => (
        <button key={d} type="button" onClick={() => setDil(d)}
          className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide transition"
          style={dil === d ? { background: brand.gold, color: "#0C2233" } : { color: "#93A6B6" }}>{d}</button>
      ))}
    </div>
  );
}

// İlerleme noktaları — üst düzey; adıma atlar.
function Noktalar({ i, git, dil, gizliMobil }: { i: number; git: (n: number) => void; dil: Dil; gizliMobil?: boolean }) {
  return (
    <div className={`${gizliMobil ? "hidden md:flex" : "flex"} flex-wrap items-center justify-center gap-1.5`}>
      {ADIMLAR.map((s, k) => (
        <button key={s.no} type="button" onClick={() => git(k)} aria-label={`${k + 1}: ${s.metin[dil].baslik}`} title={`${s.no}. ${s.metin[dil].baslik}`}
          className="h-2 rounded-full transition-all"
          style={{ width: k === i ? 18 : 8, background: k === i ? brand.gold : k < i ? "#6C5A2E" : "#31536B" }} />
      ))}
    </div>
  );
}

export function SunumModu() {
  const [aktif, setAktif] = useState(false);
  const [i, setI] = useState(0);
  const [oto, setOto] = useState(false);
  const [dil, setDil] = useState<Dil>("tr");

  const git = (n: number) => setI(Math.max(0, Math.min(TOPLAM - 1, n)));
  const kapat = () => { setOto(false); setAktif(false); };

  // Oto-oynat: her adımda ~8 s sonra ilerle; son adımda oto kapanır.
  useEffect(() => {
    if (!aktif || !oto) return;
    const son = i >= TOPLAM - 1;
    const id = setTimeout(() => { if (son) setOto(false); else setI(i + 1); }, son ? 3500 : 8000);
    return () => clearTimeout(id);
  }, [aktif, oto, i]);

  // Adım değişince: kapak değilse sekmeyi aç + butonları tıkla + kaydır + vurgula.
  useEffect(() => {
    if (!aktif) { vurguTemizle(); return; }
    const a = ADIMLAR[i];
    if (a.kapak) { vurguTemizle(); return; }
    if (a.sekme) document.getElementById(a.sekme)?.click();
    for (const key of a.tikla ?? []) {
      document.querySelector<HTMLButtonElement>(`[data-sunum="${key}"]`)?.click();
    }
    const t = setTimeout(() => {
      vurguTemizle();
      document.getElementById(a.hedefId ?? a.slug)?.scrollIntoView({ behavior: "smooth", block: a.hedefId ? "center" : "start" });
      hedefEleman(a)?.classList.add("sunum-vurgu");
    }, (a.sekme || a.tikla?.length) ? 320 : 60);
    return () => clearTimeout(t);
  }, [aktif, i]);

  useEffect(() => () => vurguTemizle(), []);

  // Klavye: ← → gezinir, Esc çıkar.
  useEffect(() => {
    if (!aktif) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); git(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); git(i - 1); }
      else if (e.key === "Escape") kapat();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [aktif, i]);

  if (!aktif) {
    return (
      <button
        type="button"
        data-noprint
        onClick={() => { setI(0); setOto(false); setAktif(true); }}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
        style={{ background: "#0C2233", borderColor: "#A8842C", color: "#fff" }}
        title="Sistemin her parçasını sırayla gezdiren kapsamlı rehberli sunum (TR · EN · DE)"
      >
        <span aria-hidden="true">▷</span> Sunum Modu
      </button>
    );
  }

  const a = ADIMLAR[i];
  const m = a.metin[dil];
  const t = UI[dil];

  // ——— KAPAK KARTI (giriş / kapanış) ———
  if (a.kapak) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center" data-noprint
        style={{ background: "radial-gradient(130% 130% at 50% 0%, #123048 0%, #0A1826 55%, #060D16 100%)" }}>
        <button type="button" onClick={kapat} aria-label={t.cik}
          className="absolute right-5 top-5 rounded-md px-2.5 py-1.5 text-sm" style={{ color: "#8494A3" }}>✕</button>
        <div className="absolute left-1/2 top-6 -translate-x-1/2"><DilSecici dil={dil} setDil={setDil} koyu /></div>

        <div className="font-brand text-[0.72rem] font-bold tracking-[0.32em]" style={{ color: "#E7D9B0" }}>{m.faz}</div>
        <h1 className="font-brand mt-3 text-5xl font-semibold tracking-tight text-white sm:text-6xl">{m.baslik}</h1>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed sm:text-base" style={{ color: "#C4D2DE" }}>{m.anlatim}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {i === 0 ? (
            <button type="button" onClick={() => git(1)}
              className="rounded-lg px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105" style={{ background: brand.red }}>
              {t.basla} ▷
            </button>
          ) : (
            <>
              <button type="button" onClick={() => git(0)}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold" style={{ border: "1px solid #31536B", color: "#fff" }}>↻ {t.bastan}</button>
              <button type="button" onClick={kapat}
                className="rounded-lg px-6 py-2.5 text-sm font-bold shadow-lg transition-transform hover:scale-105" style={{ background: brand.gold, color: "#0C2233" }}>{t.bitir} ✓</button>
            </>
          )}
          {i > 0 && (
            <button type="button" onClick={() => git(i - 1)}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold" style={{ border: "1px solid #31536B", color: "#fff" }}>◁ {t.geri}</button>
          )}
        </div>

        <div className="absolute bottom-8"><Noktalar i={i} git={git} dil={dil} /></div>
      </div>
    );
  }

  // ——— ANLATIM ŞERİDİ (orta adımlar) ———
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 shadow-2xl" data-noprint
      style={{ background: "linear-gradient(180deg,#0F2B40 0%,#0C2233 100%)", borderColor: brand.gold }}>
      {/* Genel ilerleme çizgisi */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "#12314A" }}>
        <div className="h-full transition-[width] duration-300 ease-out"
          style={{ width: `${((i + 1) / TOPLAM) * 100}%`, background: `linear-gradient(90deg, ${brand.gold}, ${brand.red})` }} />
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        {/* Faz rozeti + adım */}
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold tabular-nums"
            style={{ background: brand.red, color: "#fff", boxShadow: `0 0 0 4px ${brand.red}33` }}>{a.no}</span>
          <div className="min-w-0">
            <div className="font-brand text-[0.68rem] font-bold tracking-[0.2em]" style={{ color: "#E7D9B0" }}>
              {m.faz}<span className="ml-1 font-mono tracking-normal" style={{ color: "#7E93A6" }}>· {i + 1}/{TOPLAM}</span>
            </div>
            <div className="text-sm font-semibold text-white">{m.baslik}</div>
          </div>
        </div>

        {/* Anlatım */}
        <p className="min-w-0 flex-1 text-xs leading-relaxed sm:px-3" style={{ color: "#C4D2DE" }}>{m.anlatim}</p>

        {/* Dil + noktalar */}
        <div className="flex items-center gap-2">
          <DilSecici dil={dil} setDil={setDil} />
          <Noktalar i={i} git={git} dil={dil} gizliMobil />
        </div>

        {/* Kontroller */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOto((o) => !o)} aria-label={oto ? t.duraklat : t.oynat} title={oto ? t.duraklat : t.oynat}
            className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={{ background: oto ? brand.gold : "#12314A", color: oto ? "#0C2233" : "#fff" }}>
            {oto ? "⏸" : "⏵"}
          </button>
          <button type="button" onClick={() => git(i - 1)} disabled={i === 0}
            className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            style={{ border: "1px solid #31536B", color: "#fff" }}>◁ {t.geri}</button>
          <button type="button" onClick={() => git(i + 1)}
            className="rounded-md px-3 py-1.5 text-xs font-bold text-white" style={{ background: brand.red }}>{t.ileri} ▷</button>
          <button type="button" onClick={kapat} aria-label={t.cik}
            className="rounded-md px-2 py-1.5 text-xs" style={{ color: "#8494A3" }}>✕</button>
        </div>
      </div>
    </div>
  );
}
