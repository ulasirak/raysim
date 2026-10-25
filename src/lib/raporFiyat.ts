// raysim — PDF RAPOR BÖLÜM SEÇİMİ + FİYATLANDIRMA (saf; firestore/deps yok).
//
// Kullanıcı hangi bölümleri istediğini seçer; fiyat KÜMÜLATİF artar. SUNUCU bu
// tablodan bedeli ENFORCE eder (istemci fiyat yollamaz). Taban (kapak/künye/TOC +
// DAİMA dâhil Girdi Parametreleri ve Sinyalizasyon-SG bölümleri) + seçilen her
// bölümün kredisi. Klasik tam rapor (grafiksiz) = 3 taban + 6 bölüm = 9 kredi
// (grafikler ayrı premium katman).
//
// DEĞİŞİKLİK (2026-09-19): "girdi" ve "sinyal" artık SEÇENEK değil — her raporun
// tabanında yer alır (kullanıcı isteği). Yerine "grafikler" (görsel analiz — tüm
// OpenTrack-esintili şekiller/çizelgeler) 3 kredilik tek seçenek eklendi.

export const RAPOR_TABAN_KREDI = 3; // kapak + künye + içindekiler + Girdi Parametreleri (01) + Sinyalizasyon-SG (03) DAİMA

/** Seçilebilir bölümler ve kredi bedelleri (TEK KAYNAK — UI gösterimi + sunucu düşümü). */
export const RAPOR_BOLUM_KREDI = {
  ozet: 1,        // Yönetici Özeti
  hat: 1,         // 2. Hat & Kısıt Analizi (ring/challenge)
  kurpKonfor: 1,  // 2.2 Kurp Geometrisi & Yanal Konfor
  kapasite: 1,    // 4. Kapasite (blocking-time, robustluk, çakışma…)
  isletme: 1,     // 5. İşletme & Talep + Tavsiye Edilen Tramvay Sayısı
  tarife: 1,      // 6. Tarife
  kilitleme: 1,   // 3.2 Kilitleme (Interlocking) Kontrol Tablosu — rota/makas konumu/kilit
  dogrulama: 1,   // 9. Doğrulama & Geçerleme (V&V) — motorun analitik referanslara karşı sertifikasyonu
  izlenebilirlik: 1, // 10. İzlenebilirlik & Tekrar-Üretilebilirlik — motor sürümü + girdi künyesi + her sayının yöntem kaynağı
  grafikler: 3,   // Görsel analiz — tüm şekiller/çizelgeler (Bildfahrplan, hız profili, yük, Sperrzeit…)
} as const;

export type RaporBolum = keyof typeof RAPOR_BOLUM_KREDI;
/** Bölüm seçim haritası. Bir bölüm `false` DEĞİLSE (undefined dâhil) DAHİL sayılır → geriye uyumlu. */
export type RaporSecim = Partial<Record<RaporBolum, boolean>>;

export const RAPOR_BOLUMLER = Object.keys(RAPOR_BOLUM_KREDI) as RaporBolum[];

/** Bir bölüm dâhil mi? (secim yoksa ya da alan false değilse dâhil.) */
export function bolumDahil(secim: RaporSecim | undefined, b: RaporBolum): boolean {
  return !secim || secim[b] !== false;
}

/** Seçime göre toplam kredi bedeli (taban + seçilen bölümler). */
export function raporKredi(secim?: RaporSecim): number {
  let k = RAPOR_TABAN_KREDI;
  for (const b of RAPOR_BOLUMLER) if (bolumDahil(secim, b)) k += RAPOR_BOLUM_KREDI[b];
  return k;
}

/** Bölüm etiketleri (UI seçici + rapor için) — TR·EN·DE. */
export const RAPOR_BOLUM_AD: Record<RaporBolum, { tr: string; en: string; de: string }> = {
  ozet: { tr: "Yönetici Özeti", en: "Executive Summary", de: "Zusammenfassung" },
  hat: { tr: "Hat & Kısıt Analizi", en: "Line & Constraint Analysis", de: "Strecken- & Engpassanalyse" },
  kurpKonfor: { tr: "Kurp & Yanal Konfor", en: "Curve & Lateral Comfort", de: "Bogen & Querkomfort" },
  kapasite: { tr: "Kapasite Analizi", en: "Capacity Analysis", de: "Kapazitätsanalyse" },
  isletme: { tr: "İşletme & Talep + Tavsiye Filo", en: "Operations & Demand + Fleet", de: "Betrieb & Nachfrage + Flotte" },
  tarife: { tr: "Tarife", en: "Timetable", de: "Fahrplan" },
  kilitleme: { tr: "Kilitleme Kontrol Tablosu (Interlocking)", en: "Interlocking Control Table", de: "Verschluss-Kontrolltabelle" },
  dogrulama: { tr: "Doğrulama & Geçerleme (V&V)", en: "Verification & Validation", de: "Verifizierung & Validierung" },
  izlenebilirlik: { tr: "İzlenebilirlik & Tekrar-Üretilebilirlik", en: "Traceability & Reproducibility", de: "Nachvollziehbarkeit & Reproduzierbarkeit" },
  grafikler: { tr: "Grafikler (Görsel Analiz)", en: "Charts (Visual Analysis)", de: "Diagramme (Visuelle Analyse)" },
};
