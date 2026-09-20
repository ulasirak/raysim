// raysim — MOTOR SÜRÜMÜ (engine version) + yöntem standartları.
// İZLENEBİLİRLİK / TEKRAR-ÜRETİLEBİLİRLİK künyesinin tek kaynağı (Büyük sıçrama B).
//
// Motor DETERMİNİSTİKtir: aynı girdi kümesi + aynı motor sürümü → AYNI sayı. Bu
// yüzden bir raporun her sayısı, girdileri + yöntemi + motor sürümü künyesiyle
// tam olarak yeniden üretilebilir. Sürüm, hesap çekirdeğini (fizik/kapasite)
// etkileyen her anlamlı değişiklikte ELLE yükseltilir (semantik sürümleme).
export const MOTOR_SURUMU = "1.0.0";

export const MOTOR_ADI = {
  tr: "RaySim Mikroskobik Sim + UIC 406 Kapasite Motoru",
  en: "RaySim Microscopic Sim + UIC 406 Capacity Engine",
} as const;

/** Motorun dayandığı kanonik yöntem standartları (izlenebilirlik künyesi). */
export const YONTEM_STANDARTLARI: { ad: string; tr: string; en: string }[] = [
  { ad: "UIC 406", tr: "Kapasite / doluluk (blocking-time sıkıştırma)", en: "Capacity / occupancy (blocking-time compression)" },
  { ad: "Sperrzeitentreppe", tr: "Blok işgal (blocking-time) merdiveni", en: "Block occupation (blocking-time) staircase" },
  { ad: "Trapez kinematik", tr: "Mikroskobik tren hareketi (hızlan–seyir–fren)", en: "Microscopic train motion (accelerate–cruise–brake)" },
  { ad: "Davis denklemi", tr: "Hareket direnci / denge hızı", en: "Running resistance / balancing speed" },
];
