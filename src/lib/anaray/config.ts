// türkray — PAYLAŞILAN SİMÜLASYON PARAMETRELERİ (tek kaynak).
//
// Belge kabullerinden (MAZ-VA-AKS-001 v6.0) türeyen tüm sayısal parametreler
// burada tek bir `SimConfig` nesnesinde toplanır. Tüm modüller (Sefer, Ringler,
// Anklaşman) bu config'i okur; Sistem modülünden değiştirilince simülasyon her
// yerde canlı güncellenir. Birimler SI (hız m/s, süre s, mesafe m, ivme m/s²).

const KMH = 1 / 3.6;

export interface SimConfig {
  // Hızlar (m/s)
  vAnahat: number; // ana hat azami
  vSahasal: number; // ortalama sahasal işletme
  vMakas: number; // makas bölgesi geçiş (Şartname 3.4.8.2)
  vHemzemin: number; // yaya/hemzemin yavaşlama
  vAcil: number; // acil frenleme / tehlike noktası worst-case hızı
  // Dinamik (m/s²)
  ivme: number;
  yavaslama: number;
  // Headway & mesafe
  headway: number; // sözleşme headway (s)
  ortalamaDurakArasi: number; // m
  enUzunHeadwayMesafesi: number; // m — worst-case referans
  // Zamanlayıcılar (s)
  routeReleaseAnahat: number;
  routeReleaseDepo: number;
  makasAdimMax: number;
  acilRotaKilidi: number;
  // Blok / geometri (m)
  kisitGenisligi: number; // makas/geçit kısıt bölgesi genişliği
  blokMaxUzunluk: number; // sinyal bloğu azami uzunluğu
}

export const varsayilanConfig: SimConfig = {
  vAnahat: 70 * KMH,
  vSahasal: 40 * KMH,
  vMakas: 15 * KMH,
  vHemzemin: 25 * KMH,
  vAcil: 10 * KMH,
  ivme: 1.0,
  yavaslama: 1.0,
  headway: 240,
  ortalamaDurakArasi: 800,
  enUzunHeadwayMesafesi: 1500,
  routeReleaseAnahat: 5,
  routeReleaseDepo: 8,
  makasAdimMax: 6,
  acilRotaKilidi: 120,
  kisitGenisligi: 40,
  blokMaxUzunluk: 500,
};

export type ParamTur = "hiz" | "ivme" | "sure" | "mesafe";
export type ParamModul = "sefer" | "ringler" | "anklasman";

export interface ParamMeta {
  key: keyof SimConfig;
  ad: string;
  grup: string;
  tur: ParamTur;
  kaynak: string; // belge maddesi
  etkiler: string; // neyi değiştirir
  moduller: ParamModul[];
  min: number; // gösterim biriminde
  max: number;
  step: number;
}

export const PARAM_META: ParamMeta[] = [
  { key: "vAnahat", ad: "Ana hat azami hız", grup: "Hızlar", tur: "hiz", kaynak: "4.1", etkiler: "Serbest seyir üst hızı", moduller: ["sefer"], min: 20, max: 100, step: 5 },
  { key: "vSahasal", ad: "Sahasal işletme hızı", grup: "Hızlar", tur: "hiz", kaynak: "4.1", etkiler: "Ring/durak arası ortalama hız", moduller: ["ringler", "sefer"], min: 20, max: 70, step: 5 },
  { key: "vMakas", ad: "Makas geçiş hızı", grup: "Hızlar", tur: "hiz", kaynak: "3.4.8.2", etkiler: "Makas bölgesi geçiş + tanzim hızı", moduller: ["ringler", "anklasman"], min: 5, max: 30, step: 1 },
  { key: "vHemzemin", ad: "Hemzemin/yaya hızı", grup: "Hızlar", tur: "hiz", kaynak: "4.3", etkiler: "Geçit yavaşlama hızı", moduller: ["ringler"], min: 10, max: 40, step: 1 },
  { key: "vAcil", ad: "Acil frenleme hızı", grup: "Hızlar", tur: "hiz", kaynak: "worst-case", etkiler: "Tehlike/acil frenleme noktasında worst-case hız", moduller: ["ringler"], min: 0, max: 25, step: 1 },
  { key: "ivme", ad: "Hızlanma ivmesi (a)", grup: "Dinamik", tur: "ivme", kaynak: "4.3", etkiler: "Kalkış / seyir süresi", moduller: ["ringler", "sefer"], min: 0.3, max: 1.5, step: 0.1 },
  { key: "yavaslama", ad: "Yavaşlama (b)", grup: "Dinamik", tur: "ivme", kaynak: "4.3", etkiler: "Fren eğrisi / duruş süresi", moduller: ["ringler", "sefer"], min: 0.3, max: 1.5, step: 0.1 },
  { key: "headway", ad: "Hedef headway", grup: "Headway & Mesafe", tur: "sure", kaynak: "4.3 · sözleşme", etkiler: "Sefer sıklığı hedefi + ring uygunluk eşiği", moduller: ["sefer", "ringler"], min: 60, max: 600, step: 10 },
  { key: "ortalamaDurakArasi", ad: "Ortalama durak arası", grup: "Headway & Mesafe", tur: "mesafe", kaynak: "4.3", etkiler: "Yeni ring nominal mesafesi", moduller: ["ringler"], min: 200, max: 2000, step: 50 },
  { key: "enUzunHeadwayMesafesi", ad: "Worst-case mesafe", grup: "Headway & Mesafe", tur: "mesafe", kaynak: "4.3", etkiler: "Ring worst-case referans mesafesi", moduller: ["ringler"], min: 500, max: 2500, step: 50 },
  { key: "routeReleaseAnahat", ad: "Route release (ana hat)", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek L", etkiler: "Ana hat makas rota serbest bırakma", moduller: ["anklasman", "ringler"], min: 1, max: 20, step: 1 },
  { key: "routeReleaseDepo", ad: "Route release (depo)", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek L", etkiler: "Depo manevra rota serbest bırakma", moduller: ["anklasman"], min: 1, max: 30, step: 1 },
  { key: "makasAdimMax", ad: "Makas adım süresi", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek Ö", etkiler: "Her makas hareketi (tanzim) süresi", moduller: ["anklasman", "ringler"], min: 1, max: 12, step: 1 },
  { key: "acilRotaKilidi", ad: "Acil rota kilidi", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek M", etkiler: "Acil rota iptali emniyet kilidi", moduller: ["anklasman"], min: 30, max: 240, step: 10 },
  { key: "kisitGenisligi", ad: "Kısıt bölge genişliği", grup: "Blok", tur: "mesafe", kaynak: "türetme", etkiler: "Makas/geçit hız-kısıt bölgesi uzunluğu", moduller: ["ringler"], min: 10, max: 120, step: 5 },
  { key: "blokMaxUzunluk", ad: "Sinyal bloğu azami", grup: "Blok", tur: "mesafe", kaynak: "2.1", etkiler: "Blok sayısı + gecikmesiz aralık", moduller: ["sefer"], min: 100, max: 1500, step: 50 },
];

/** Gösterim değeri (km/h için m/s→km/h). */
export function paramGoster(cfg: SimConfig, m: ParamMeta): number {
  const v = cfg[m.key];
  return m.tur === "hiz" ? v * 3.6 : v;
}
/** Gösterim değerinden SI'ye (km/h→m/s). */
export function paramSI(m: ParamMeta, gosterim: number): number {
  return m.tur === "hiz" ? gosterim * KMH : gosterim;
}

export function birim(tur: ParamTur): string {
  return tur === "hiz" ? "km/h" : tur === "ivme" ? "m/s²" : tur === "sure" ? "s" : "m";
}

// ————————————————————————————————————————————————
// Proje künyesi (GENEL — herhangi bir hat/karşı taraf için)
// ————————————————————————————————————————————————
// Belge üretiminde (Word/Excel) kapak + künye buradan gelir. Konya'ya bağlı
// değildir; karşı taraf kendi proje bilgilerini girer.

export interface ProjeMeta {
  projeAdi: string;
  idare: string; // idare / işveren
  yuklenici: string;
  musavir: string;
  sinyalizasyonFirmasi: string;
  dokumanNo: string;
  revizyon: string;
  tarih: string; // serbest metin (istemci doldurur)
  hatAdi: string;
  hazirlayan: string;
  onaylayan: string;
}

export const varsayilanMeta: ProjeMeta = {
  projeAdi: "Kentsel Raylı Sistem Sinyalizasyon Projesi",
  idare: "İdare / İşveren",
  yuklenici: "Yüklenici Firma",
  musavir: "Müşavir Firma",
  sinyalizasyonFirmasi: "AslanRAY",
  dokumanNo: "TR-VA-AKS-001",
  revizyon: "v1.0",
  tarih: "",
  hatAdi: "Ana Hat",
  hazirlayan: "Tasarım Mühendisi",
  onaylayan: "Firma Yetkilisi",
};

export interface ProjeMetaAlan {
  key: keyof ProjeMeta;
  ad: string;
  genis?: boolean; // tam satır
}

export const PROJE_META_ALANLAR: ProjeMetaAlan[] = [
  { key: "projeAdi", ad: "Proje adı", genis: true },
  { key: "hatAdi", ad: "Hat adı" },
  { key: "dokumanNo", ad: "Doküman no" },
  { key: "revizyon", ad: "Revizyon" },
  { key: "tarih", ad: "Tarih" },
  { key: "idare", ad: "İdare / İşveren" },
  { key: "yuklenici", ad: "Yüklenici" },
  { key: "musavir", ad: "Müşavir" },
  { key: "sinyalizasyonFirmasi", ad: "Sinyalizasyon firması" },
  { key: "hazirlayan", ad: "Hazırlayan" },
  { key: "onaylayan", ad: "Onaylayan" },
];
