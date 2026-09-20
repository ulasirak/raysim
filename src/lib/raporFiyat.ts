// raysim — PDF RAPOR BÖLÜM SEÇİMİ + FİYATLANDIRMA (saf; firestore/deps yok).
//
// Kullanıcı hangi bölümleri istediğini seçer; fiyat KÜMÜLATİF artar. SUNUCU bu
// tablodan bedeli ENFORCE eder (istemci fiyat yollamaz). Taban (kapak/künye/TOC +
// DAİMA dâhil Girdi Parametreleri ve Sinyalizasyon-SG bölümleri) + seçilen her
// bölümün kredisi. Klasik tam rapor (grafiksiz) = 3 taban + 7 bölüm = 10 kredi
// (eski 10-kredi tam rapor içeriğiyle birebir; grafikler yeni premium katman).
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
  duyarlilik: 1,  // 7. Duyarlılık (tornado)
  dogrulama: 1,   // 9. Doğrulama & Geçerleme (V&V) — motorun analitik referanslara karşı sertifikasyonu
  grafikler: 3,   // Görsel analiz — tüm şekiller/çizelgeler (Bildfahrplan, hız profili, yük, Sperrzeit, tornado…)
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

/** Bölüm etiketleri (UI seçici + rapor için). */
export const RAPOR_BOLUM_AD: Record<RaporBolum, { tr: string; en: string }> = {
  ozet: { tr: "Yönetici Özeti", en: "Executive Summary" },
  hat: { tr: "Hat & Kısıt Analizi", en: "Line & Constraint Analysis" },
  kurpKonfor: { tr: "Kurp & Yanal Konfor", en: "Curve & Lateral Comfort" },
  kapasite: { tr: "Kapasite Analizi", en: "Capacity Analysis" },
  isletme: { tr: "İşletme & Talep + Tavsiye Filo", en: "Operations & Demand + Fleet" },
  tarife: { tr: "Tarife", en: "Timetable" },
  duyarlilik: { tr: "Duyarlılık (Tornado)", en: "Sensitivity (Tornado)" },
  dogrulama: { tr: "Doğrulama & Geçerleme (V&V)", en: "Verification & Validation" },
  grafikler: { tr: "Grafikler (Görsel Analiz)", en: "Charts (Visual Analysis)" },
};
