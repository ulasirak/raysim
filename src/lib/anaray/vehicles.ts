// raysim — çeken araç veritabanı (hazır tipler).
// Kalkış çekiş kuvveti ~ etkin kütle × ~1.0 m/s² (gerçekçi kalkış ivmesi).

import type { RollingStock } from "./types";

const KMH = 1 / 3.6;

export const araclar: RollingStock[] = [
  {
    id: "tramvay", name: "Düşük Tabanlı Tramvay (5 modül)",
    mass: 41000, rotatingMassFactor: 0.08, length: 33, maxSpeed: 70 * KMH,
    startingTractiveEffort: 46000, power: 500_000, maxBraking: 1.2,
    davisA: 1500, davisB: 40, davisC: 3,
    kapiSayisi: 6, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "hizli-tramvay", name: "Hızlı Tramvay (LRV)",
    mass: 55000, rotatingMassFactor: 0.08, length: 42, maxSpeed: 80 * KMH,
    startingTractiveEffort: 62000, power: 720_000, maxBraking: 1.2,
    davisA: 2000, davisB: 50, davisC: 4,
    kapiSayisi: 8, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "hafif-metro", name: "Hafif Metro",
    mass: 90000, rotatingMassFactor: 0.09, length: 60, maxSpeed: 80 * KMH,
    startingTractiveEffort: 100_000, power: 1_200_000, maxBraking: 1.3,
    davisA: 3000, davisB: 60, davisC: 5,
    kapiSayisi: 8, kapiGenisligi: 1.4, aracGenisligi: 2.8, kullanilabilirAlanOrani: 0.4,
  },
  {
    id: "metro", name: "Metro (B tipi, 4 vagon)",
    mass: 200000, rotatingMassFactor: 0.1, length: 110, maxSpeed: 90 * KMH,
    startingTractiveEffort: 230_000, power: 2_600_000, maxBraking: 1.3,
    davisA: 6000, davisB: 90, davisC: 8,
    kapiSayisi: 16, kapiGenisligi: 1.4, aracGenisligi: 2.9, kullanilabilirAlanOrani: 0.4,
  },
];

export const varsayilanArac = araclar[0];

// Gerçek tramvay modelleri (hazır preset kütüphanesi). DÜRÜSTLÜK NOTU: uzunluk,
// kütle, azami hız ve modül sayısı üreticinin KAMUYA AÇIK verisidir; çekiş kuvveti,
// güç ve Davis (A/B/C) direnç katsayıları ise araç sınıfına göre FİZİK-TUTARLI
// TİPİK tahminlerdir (üretici sertifikalı sayı değil) — kalkış çekişi ≈ etkin kütle
// × ~1,0 m/s² kabulüyle. Kullanıcı seçtikten sonra tüm bu değerleri panelden
// düzenleyebilir; kesin datasheet varsa oradan girmelidir.
export const gercekModeller: RollingStock[] = [
  {
    id: "skoda-28t", name: "Škoda ForCity Classic 28T",
    mass: 41_500, rotatingMassFactor: 0.08, length: 32.52, maxSpeed: 70 * KMH,
    startingTractiveEffort: 46_000, power: 480_000, maxBraking: 1.2,
    davisA: 2500, davisB: 30, davisC: 6,
    kapiSayisi: 6, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "citadis-302", name: "Alstom Citadis 302",
    mass: 40_000, rotatingMassFactor: 0.08, length: 32.4, maxSpeed: 70 * KMH,
    startingTractiveEffort: 43_000, power: 440_000, maxBraking: 1.2,
    davisA: 2400, davisB: 28, davisC: 6,
    kapiSayisi: 6, kapiGenisligi: 1.3, aracGenisligi: 2.4, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "flexity-2", name: "Bombardier Flexity 2",
    mass: 40_000, rotatingMassFactor: 0.08, length: 32, maxSpeed: 70 * KMH,
    startingTractiveEffort: 43_000, power: 480_000, maxBraking: 1.2,
    davisA: 2400, davisB: 28, davisC: 6,
    kapiSayisi: 6, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "urbos-3", name: "CAF Urbos 3",
    mass: 39_000, rotatingMassFactor: 0.08, length: 32, maxSpeed: 70 * KMH,
    startingTractiveEffort: 42_000, power: 440_000, maxBraking: 1.2,
    davisA: 2300, davisB: 28, davisC: 6,
    kapiSayisi: 6, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
  {
    id: "avenio", name: "Siemens Avenio",
    mass: 46_000, rotatingMassFactor: 0.08, length: 37, maxSpeed: 70 * KMH,
    startingTractiveEffort: 50_000, power: 560_000, maxBraking: 1.2,
    davisA: 2800, davisB: 34, davisC: 7,
    kapiSayisi: 8, kapiGenisligi: 1.3, aracGenisligi: 2.65, kullanilabilirAlanOrani: 0.35,
  },
];

// Tramvay tipleri — Studio "Çeken Araç" ve RingEditor seçicileri: jenerik tramvay
// tipleri + gerçek modeller (metro/hafif metro seçicide gösterilmez). Müşteri buradan
// seçip üstünde oynar ya da tümüyle "Özel araç" tanımlar.
export const tramvaylar: RollingStock[] = [
  ...araclar.filter((a) => a.id === "tramvay" || a.id === "hizli-tramvay"),
  ...gercekModeller,
];

/** Özel/seçili aracın parametreleri fiziksel/işletmesel olarak tutarlı mı? Motoru
 *  DEĞİŞTİRMEZ; yalnız kullanıcı girdisini denetler (onay akışı). Uyarı listesi döner
 *  (boşsa "uygun"). Etiketler i18n (Ceviri) — çağıran t() ile gösterir. */
export function aracDogrula(s: RollingStock): { seviye: "uyari"; ad: { tr: string; en: string; de: string } }[] {
  const u: { seviye: "uyari"; ad: { tr: string; en: string; de: string } }[] = [];
  const etkinKutle = s.mass * (1 + (s.rotatingMassFactor || 0));
  const a0 = s.startingTractiveEffort / etkinKutle;               // kalkış ivmesi (m/s²)
  const guçKutle = s.power / s.mass;                              // W/kg
  const vKmh = s.maxSpeed * 3.6;
  if (a0 < 0.4) u.push({ seviye: "uyari", ad: { tr: `Kalkış ivmesi düşük (${a0.toFixed(2)} m/s²) — çekiş kuvveti kütleye göre az; kalkış yavaş olur.`, en: `Low starting acceleration (${a0.toFixed(2)} m/s²) — tractive effort is small for the mass; departures will be slow.`, de: `Niedrige Anfahrbeschleunigung (${a0.toFixed(2)} m/s²) — Zugkraft ist für die Masse gering; Anfahrten sind langsam.` } });
  if (a0 > 1.8) u.push({ seviye: "uyari", ad: { tr: `Kalkış ivmesi gerçekçi değil (${a0.toFixed(2)} m/s²) — yolcu konforu için tramvayda tipik üst sınır ~1,3 m/s².`, en: `Unrealistic starting acceleration (${a0.toFixed(2)} m/s²) — the typical tram comfort ceiling is ~1.3 m/s².`, de: `Unrealistische Anfahrbeschleunigung (${a0.toFixed(2)} m/s²) — die übliche Komfortobergrenze bei Straßenbahnen liegt bei ~1,3 m/s².` } });
  if (guçKutle < 6) u.push({ seviye: "uyari", ad: { tr: `Güç/kütle düşük (${guçKutle.toFixed(1)} W/kg) — araç azami hıza zor ulaşır.`, en: `Low power-to-mass (${guçKutle.toFixed(1)} W/kg) — the vehicle will struggle to reach top speed.`, de: `Niedriges Leistungs-Masse-Verhältnis (${guçKutle.toFixed(1)} W/kg) — das Fahrzeug erreicht die Höchstgeschwindigkeit kaum.` } });
  if (s.maxBraking < 0.8 || s.maxBraking > 1.6) u.push({ seviye: "uyari", ad: { tr: `Servis freni sıra dışı (${s.maxBraking.toFixed(2)} m/s²) — tramvayda tipik aralık 0,9–1,3 m/s².`, en: `Unusual service braking (${s.maxBraking.toFixed(2)} m/s²) — the typical tram range is 0.9–1.3 m/s².`, de: `Ungewöhnliche Betriebsbremsung (${s.maxBraking.toFixed(2)} m/s²) — der übliche Bereich bei Straßenbahnen ist 0,9–1,3 m/s².` } });
  if (s.davisA <= 0 || s.davisC <= 0) u.push({ seviye: "uyari", ad: { tr: "Davis direnç katsayıları geçersiz (A ve C > 0 olmalı) — yuvarlanma/aero direnç modeli çalışmaz.", en: "Invalid Davis resistance (A and C must be > 0) — the rolling/aero resistance model won't work.", de: "Ungültige Davis-Widerstände (A und C müssen > 0 sein) — das Roll-/Luftwiderstandsmodell funktioniert nicht." } });
  if (vKmh < 20 || vKmh > 120) u.push({ seviye: "uyari", ad: { tr: `Azami hız tramvay için sıra dışı (${Math.round(vKmh)} km/h) — tipik 50–80 km/h.`, en: `Unusual max speed for a tram (${Math.round(vKmh)} km/h) — typical is 50–80 km/h.`, de: `Ungewöhnliche Höchstgeschwindigkeit für eine Straßenbahn (${Math.round(vKmh)} km/h) — typisch sind 50–80 km/h.` } });
  return u;
}
