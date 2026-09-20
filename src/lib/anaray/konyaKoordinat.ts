// raysim — Konya Tramvay istasyon GERÇEK KOORDİNATLARI (Büyük sıçrama D hazır verisi).
//
// KAYNAK: © OpenStreetMap katkıcıları (ODbL). Konya Büyükşehir Belediyesi tram ağının
// OSM `railway=tram_stop` düğümlerinden çekildi (RailsMaps.com'un da gösterdiği veri;
// site OSM tabanlı). 41 tekil istasyon — Wikipedia "Konya Tram: 41 istasyon" ile birebir.
// Çift-yön platformları isimle tekilleştirilip koordinatları ortalandı. UYDURMA YOK.
//
// Kullanım: coğrafi/harita görünümü, hazır Konya hatlarının durak adlarını buradaki
// gerçek lat/lon ile eşler (Isletme.istasyonKoordinat doldurulur). Ad eşleşmesi
// gerektiğinde `konyaKoordinatBul(ad)` normalize ederek arar.

export const KONYA_TRAM_KOORDINAT: Record<string, { lat: number; lon: number }> = {
  "Kampüs": { lat: 38.019036, lon: 32.513731 },
  "Selçuk Üniversitesi Tıp Fakültesi": { lat: 38.022602, lon: 32.512293 },
  "Hukuk Fakultesi": { lat: 38.024637, lon: 32.506923 },
  "Fen Edebiyat Fakultesi": { lat: 38.026676, lon: 32.507876 },
  "Mühendislik Fakültesi": { lat: 38.026775, lon: 32.51139 },
  "MTA": { lat: 37.96554, lon: 32.514685 },
  "Kunduracılar": { lat: 37.893742, lon: 32.497502 },
  "Fırat Caddesi": { lat: 37.99546, lon: 32.518626 },
  "Kayalar Camii": { lat: 38.013727, lon: 32.51726 },
  "Eyüp Sultan": { lat: 37.936102, lon: 32.510757 },
  "Piri Reis": { lat: 37.989391, lon: 32.517815 },
  "Sancak": { lat: 37.982007, lon: 32.516825 },
  "Yazır": { lat: 37.971915, lon: 32.515498 },
  "Elmalılı Hamdi": { lat: 37.959198, lon: 32.51383 },
  "Medaş": { lat: 37.953885, lon: 32.513116 },
  "Erenkaya": { lat: 37.944138, lon: 32.511955 },
  "Şehitler Camii": { lat: 37.911549, lon: 32.50053 },
  "Teknik Lise": { lat: 37.924771, lon: 32.507944 },
  "Eski Sanayi": { lat: 37.899607, lon: 32.48997 },
  "Kule": { lat: 37.887892, lon: 32.494979 },
  "Nalçacı": { lat: 37.88178, lon: 32.489489 },
  "Alaaddin": { lat: 37.871634, lon: 32.49355 },
  "Zafer": { lat: 37.872179, lon: 32.49024 },
  "Belediye": { lat: 37.876673, lon: 32.488495 },
  "Aydınlıkevler": { lat: 37.906019, lon: 32.495616 },
  "Sakarya": { lat: 37.916212, lon: 32.505914 },
  "1.Organize Sanayi": { lat: 37.929351, lon: 32.509192 },
  "Binkonutlar": { lat: 37.940752, lon: 32.511456 },
  "Japon Parkı": { lat: 37.976911, lon: 32.516175 },
  "Buzlukbaşı Köprüsü": { lat: 38.002963, lon: 32.519655 },
  "Bosna Hersek": { lat: 38.009817, lon: 32.518582 },
  "Kampüs Giriş": { lat: 38.019229, lon: 32.515636 },
  "Hükümet": { lat: 37.872036, lon: 32.497703 },
  "Mevlana": { lat: 37.870565, lon: 32.506646 },
  "Mevlana Kültür Merkezi": { lat: 37.870531, lon: 32.514795 },
  "Fetih Caddesi": { lat: 37.870023, lon: 32.526042 },
  "Spor ve Kongre Merkezi": { lat: 37.868898, lon: 32.535806 },
  "Karşehir Caddesi": { lat: 37.868839, lon: 32.542214 },
  "Adliye": { lat: 37.861361, lon: 32.542985 },
  "Otogar": { lat: 37.949049, lon: 32.512598 },
  "Şehir Hastanesi": { lat: 37.85566, lon: 32.549917 },
};

/** Ad normalize (büyük/küçük + Türkçe + noktalama + boşluk toleransı). */
function norm(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/i̇/g, "i")
    .replace(/[çğışöü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ş: "s", ö: "o", ü: "u" }[c] || c))
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const NORM_INDEX: Record<string, { lat: number; lon: number }> = Object.fromEntries(
  Object.entries(KONYA_TRAM_KOORDINAT).map(([k, v]) => [norm(k), v]),
);

/** Bir durak adının gerçek koordinatını ara: önce tam (normalize) eşleşme; olmazsa
 *  normalize-substring yedeği (biri diğerini içeriyorsa — "Karşehir" ↔ "Karşehir Caddesi",
 *  "Selçuklu Belediyesi" ↔ "Belediye"). Kısa/genel adlarda yanlış eşleşmeyi önlemek için
 *  sorgu en az 5 karakter olmalı. Yoksa undefined. */
export function konyaKoordinatBul(ad: string): { lat: number; lon: number } | undefined {
  const key = norm(ad);
  if (NORM_INDEX[key]) return NORM_INDEX[key];
  if (key.length >= 5) {
    for (const [k, v] of Object.entries(NORM_INDEX)) {
      if (k.length >= 5 && (k.includes(key) || key.includes(k))) return v;
    }
  }
  return undefined;
}
