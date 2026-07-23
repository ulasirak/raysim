// aslanray — kurumsal marka jetonları (tek kaynak).
// Açık "resmî belge" teması: koyu mürekkep-lacivert + resmî Türk kırmızısı + nötr kağıt.
// Tüm bileşenler (kartlar, SVG grafikler) renkleri buradan alır → tek tutarlı sistem.

export const brand = {
  // Kurumsal yüzeyler
  ink: "#0C2233", // koyu mürekkep-lacivert — başlık, masthead, ana veri
  inkSoft: "#3A4A5A", // gövde metni
  muted: "#6B7A8A", // etiket / ikincil
  faint: "#9AA7B4",
  red: "#C8102E", // resmî kırmızı aksan (ölçülü)
  redSoft: "#E23B52",
  gold: "#A8842C", // nadir "mühür" cetveli
  paper: "#F5F6F8", // sayfa zemini
  surface: "#FFFFFF", // kartlar
  border: "#DCE1E7", // ince cetvel
  borderStrong: "#C3CBD4",

  // Grafik / veri renkleri (açık zeminde okunur)
  grid: "#E6E9ED",
  route: "#0C2233", // yörünge / rota çizgisi
  train: "#C8102E", // tren işareti
  speed: "#0C2233", // fiili hız eğrisi
  limit: "#C8102E", // hız limiti (kesikli)
} as const;

// Hareket rejimi renkleri (açık zeminde ayırt edilir)
export const rejimRenk = {
  hizlanma: "#0E7C57", // yeşil
  seyir: "#0C6DB8", // mavi
  yavaslama: "#C8102E", // kırmızı
  durak: "#6B7A8A", // gri
} as const;
