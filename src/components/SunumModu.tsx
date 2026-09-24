"use client";

// raysim — SUNUM / HİKAYE MODU (kapsamlı rehberli pitch).
// Sistemin HER parçasını doğru sırayla, doğru dille anlatır: Genel Bakış → KUR →
// ANALİZ (Filo · Canlı Harita · Grafikler · Dayanıklılık) → SİSTEM (Kapasite ·
// Terminal · Doğruluk · Karar) → BELGELE → KARŞILAŞTIR → Kapanış. Her adımda:
//  (1) ilgili modüle kaydırır, (2) gereken SEKMEYİ açar (radio .click()),
//  (3) o an anlatılan bölümü altın "spot" halkasıyla vurgular (.sunum-vurgu),
//  (4) altta şık bir anlatım şeridi gösterir. ← → gezinir, Esc çıkar, ⏵ oto-oynatır.
// Ana sayfada (tek-sayfa stüdyo) çalışır; tüm modüller aynı anda render olduğu için
// sekme radioları (sf-t*, sm-t*) doğrudan tıklanabilir.

import { useEffect, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import type { BolumSlug } from "@/components/TekSayfa";

type Adim = {
  no: string;
  faz: string;
  baslik: string;
  anlatim: string;
  slug: BolumSlug;        // kaydırılacak modül bölümü
  sekme?: string;         // açılacak sekme radio id'si (ör. "sm-t3", "sf-t2")
  tikla?: string[];       // ek OTO-tıklanacak butonlar (data-sunum anahtarı)
  hedefId?: string;       // slug yerine özel kaydırma/vurgu hedefi (ör. "canli")
};

const ADIMLAR: Adim[] = [
  {
    no: "1", faz: "GENEL BAKIŞ", baslik: "RaySim nedir", slug: "ringler",
    anlatim: "RaySim; bir raylı sistem hattını gerçek veriyle KURAN, mikroskobik fizik motoruyla SİMÜLE EDEN ve UIC 406 kapasite metodolojisiyle RAPORLAYAN bütünleşik bir karar-destek platformudur. Akışı birlikte gezelim: Kur → Analiz Et → Sistem → Belgele → Karşılaştır.",
  },
  {
    no: "2", faz: "KUR", baslik: "Hattı tanımla", slug: "ringler",
    anlatim: "Her şey hattın kendisiyle başlar: durak-arası hücreler (ring) gerçek mesafe ve saha hızıyla; makas bölgeleri (S/X geometrisi), yön-duyarlı sinyal lambaları ve yatay kurplar. GTFS · railML · CAD (DXF) · Shapefile'dan tek tıkla içe aktarabilir; her veri projeye kalıcı yazılır.",
  },
  {
    no: "3", faz: "ANALİZ · FİLO", baslik: "Önerilen filoyu belirle", slug: "sefer", sekme: "sf-t1",
    anlatim: "Sefer modülü hattı işletmeye çevirir. Sistem, tüm girdilerine göre gereken tramvay sayısını ÖNERİR; onayladığında filo öneriye eşitlenir. Ulaşılan sefer aralığı = çevrim ÷ filo. Araçları depolara elle parklarsın — rastgele dağıtım yok.",
  },
  {
    no: "4", faz: "ANALİZ · CANLI", baslik: "Gerçek haritada işlet", slug: "sefer", sekme: "sf-t2", tikla: ["filo-onayla", "harita"], hedefId: "canli",
    anlatim: "Aynı ağı GERÇEK haritada, çift-ray gidiş-geliş olarak izle (mavi gidiş · turuncu dönüş). Koordinatlar işleyen hatta OpenStreetMap'ten otomatik gelir; hız sınırları, kurp konforu ve makaslarda ters işletme kısa dönüşleri canlı görünür. Bir işarete tıkla → detay.",
  },
  {
    no: "5", faz: "ANALİZ · GRAFİK", baslik: "Mühendislik grafikleri", slug: "sefer", sekme: "sf-t3",
    anlatim: "Klasik demiryolu analizi tek yerde: Bildfahrplan (zaman–mesafe / Marey), gecikme yayılımı (knock-on), hız profili v(x), yük & duruş (dwell) ve talep → doluluk zinciri. Tüm grafikler canlı simülasyon ile BİREBİR aynı veriden türer.",
  },
  {
    no: "6", faz: "ANALİZ · RİSK", baslik: "Etkiler & dayanıklılık", slug: "sefer", sekme: "sf-t4",
    anlatim: "Filoyu oynattıkça ulaşılan sıklık, kapasite/park aşımı ve tıkanan duraklar canlı güncellenir. Monte-Carlo dayanıklılık analizi, rastgele gecikmelere rağmen hedef güvenilirlik ve konfor için gereken MİNİMUM filoyu verir.",
  },
  {
    no: "7", faz: "SİSTEM · KAPASİTE", baslik: "Kapasite & kısıt", slug: "sistem", sekme: "sm-t1",
    anlatim: "Hattı fiziksel olarak ne bağlıyor? Blocking-time (Sperrzeitentreppe) her sinyal bloğunun rezerve süresini; UIC 406 doluluk hedefe yakınlığı; belirleyici kısıt (blok · terminal · tek-hat · kavşak · sinyal) hangi etkenin bağladığını gösterir. Kilitleme kontrol tablosu da burada.",
  },
  {
    no: "8", faz: "SİSTEM · TERMİNAL", baslik: "Terminal & yol etkileri", slug: "sistem", sekme: "sm-t2",
    anlatim: "Tramvay hatlarını çoğu kez TERMİNAL DÖNÜŞÜ bağlar: turnback kapasitesi makas geometrisi (S/X) ve peron sayısından hesaplanır. Sokak geçitlerinin (hemzemin) yavaşlaması + sinyal önceliği (TSP) beklemesi de tur süresine eklenir.",
  },
  {
    no: "9", faz: "SİSTEM · DOĞRULUK", baslik: "Motor doğruluğu", slug: "sistem", sekme: "sm-t3",
    anlatim: "Sonuçlara güven: duyarlılık (tornado) hangi girdinin kapasiteyi en çok oynattığını sıralar; Doğrulama & Geçerleme (V&V) motoru kanonik analitik referanslara (UIC, Sperrzeit) karşı sertifikalar — 'AI yapımı' değil, mühendislik disiplinli.",
  },
  {
    no: "10", faz: "SİSTEM · KARAR", baslik: "Filo & kapasite kararı", slug: "sistem", sekme: "sm-t4",
    anlatim: "Aynı temel kapasiteden iki karar: Operasyonel (istenen aralığı hangi filo verir) ve Risk (gecikmeye rağmen güvenilirlik + konfor için minimum filo) — artı tek-hat için kalkış-offset ile çakışmasız çizelge çözücüsü.",
  },
  {
    no: "11", faz: "BELGELE", baslik: "Profesyonel rapor", slug: "belgeler",
    anlatim: "Tüm analizden markalı, baskıya hazır PDF tasarım dokümantasyonu üretilir — her sayı girdi ve yöntem künyeli, izlenebilir. İstersen 'müşteri sunumu' olarak, onaylı tasarım dilinde de dışa aktarılır.",
  },
  {
    no: "12", faz: "KARŞILAŞTIR", baslik: "Senaryo karşılaştırma", slug: "karsilastirma",
    anlatim: "Farklı senaryoları veya projeleri yan yana koy — objektif, sayıya dayalı karar desteği: hangi tasarım hangi kapasiteyi, hangi filoyla, hangi maliyetle veriyor.",
  },
  {
    no: "13", faz: "KAPANIŞ", baslik: "Kur → Analiz → Karar", slug: "ringler",
    anlatim: "İşte bütün akış: gerçek veriyle kur, mikroskobik fizikle simüle et, kanonik yöntemle doğrula ve raporla. Şimdi kendi hattınla dene — istediğin adıma noktalardan dönebilirsin.",
  },
];

const TOPLAM = ADIMLAR.length;

// Vurguyu (spot halkası) tüm sayfadan temizler.
function vurguTemizle() {
  document.querySelectorAll(".sunum-vurgu").forEach((el) => el.classList.remove("sunum-vurgu"));
}

// Bir adımın vurgulanacak hedef elemanını bulur: sekme varsa o modülün AKTİF panelini
// (ör. .sm-panel[data-t="3"]), yoksa kaydırma hedefini/modülü.
function hedefEleman(a: Adim): HTMLElement | null {
  if (a.sekme) {
    const [pre] = a.sekme.split("-");
    const n = a.sekme.slice(-1);
    const panel = document.querySelector<HTMLElement>(`.${pre}-panel[data-t="${n}"]`);
    if (panel) return panel;
  }
  return document.getElementById(a.hedefId ?? a.slug);
}

export function SunumModu() {
  const [aktif, setAktif] = useState(false);
  const [i, setI] = useState(0);
  const [oto, setOto] = useState(false);

  const git = (n: number) => setI(Math.max(0, Math.min(TOPLAM - 1, n)));

  // Oto-oynat: her adımda ~8 s sonra ilerle; son adımda oto kapanır (hands-free pitch).
  useEffect(() => {
    if (!aktif || !oto) return;
    const son = i >= TOPLAM - 1;
    const id = setTimeout(() => { if (son) setOto(false); else setI(i + 1); }, son ? 3500 : 8000);
    return () => clearTimeout(id);
  }, [aktif, oto, i]);

  // Adım değişince: (1) sekmeyi aç + ek butonları tıkla, (2) hedefe kaydır, (3) vurgula.
  useEffect(() => {
    if (!aktif) { vurguTemizle(); return; }
    const a = ADIMLAR[i];
    if (a.sekme) document.getElementById(a.sekme)?.click();
    for (const key of a.tikla ?? []) {
      document.querySelector<HTMLButtonElement>(`[data-sunum="${key}"]`)?.click();
    }
    // Görünüm (sekme paneli / harita) render'ı için küçük gecikme, sonra kaydır + vurgula.
    const t = setTimeout(() => {
      vurguTemizle();
      const scrollEl = document.getElementById(a.hedefId ?? a.slug);
      scrollEl?.scrollIntoView({ behavior: "smooth", block: a.hedefId ? "center" : "start" });
      hedefEleman(a)?.classList.add("sunum-vurgu");
    }, (a.sekme || a.tikla?.length) ? 320 : 60);
    return () => clearTimeout(t);
  }, [aktif, i]);

  // Çıkışta vurguyu temizle (bileşen kalıcıysa da güvenli).
  useEffect(() => () => vurguTemizle(), []);

  // Klavye: ← → gezinir, Esc çıkar.
  useEffect(() => {
    if (!aktif) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); git(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); git(i - 1); }
      else if (e.key === "Escape") { setOto(false); setAktif(false); }
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
        title="Sistemin her parçasını sırayla gezdiren kapsamlı rehberli sunum"
      >
        <span aria-hidden="true">▷</span> Sunum Modu
      </button>
    );
  }

  const a = ADIMLAR[i];
  const son = i === TOPLAM - 1;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 shadow-2xl" data-noprint
      style={{ background: "linear-gradient(180deg,#0F2B40 0%,#0C2233 100%)", borderColor: brand.gold }}>
      {/* Genel ilerleme çizgisi (üst kenar) */}
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
              {a.faz}
              <span className="ml-1 font-mono tracking-normal" style={{ color: "#7E93A6" }}>· {i + 1}/{TOPLAM}</span>
            </div>
            <div className="text-sm font-semibold text-white">{a.baslik}</div>
          </div>
        </div>

        {/* Anlatım */}
        <p className="min-w-0 flex-1 text-xs leading-relaxed sm:px-3" style={{ color: "#C4D2DE" }}>{a.anlatim}</p>

        {/* İlerleme noktaları */}
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {ADIMLAR.map((s, k) => (
            <button key={s.no} type="button" onClick={() => git(k)} aria-label={`Adım ${k + 1}: ${s.baslik}`} title={`${s.no}. ${s.baslik}`}
              className="h-2 rounded-full transition-all"
              style={{ width: k === i ? 18 : 8, background: k === i ? brand.gold : k < i ? "#6C5A2E" : "#31536B" }} />
          ))}
        </div>

        {/* Kontroller */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOto((o) => !o)} aria-label={oto ? "Duraklat" : "Oto-oynat"}
            title={oto ? "Duraklat" : "Otomatik ilerlet"}
            className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={{ background: oto ? brand.gold : "#12314A", color: oto ? "#0C2233" : "#fff" }}>
            {oto ? "⏸" : "⏵"}
          </button>
          <button type="button" onClick={() => git(i - 1)} disabled={i === 0}
            className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            style={{ border: "1px solid #31536B", color: "#fff" }}>◁ Geri</button>
          {son ? (
            <button type="button" onClick={() => { setOto(false); setAktif(false); }}
              className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ background: brand.gold, color: "#0C2233" }}>Bitir ✓</button>
          ) : (
            <button type="button" onClick={() => git(i + 1)}
              className="rounded-md px-3 py-1.5 text-xs font-bold text-white" style={{ background: brand.red }}>İleri ▷</button>
          )}
          <button type="button" onClick={() => { setOto(false); setAktif(false); }} aria-label="Sunumdan çık"
            className="rounded-md px-2 py-1.5 text-xs" style={{ color: "#8494A3" }}>✕</button>
        </div>
      </div>
    </div>
  );
}
