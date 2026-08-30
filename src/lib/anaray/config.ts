// raysim — PAYLAŞILAN SİMÜLASYON PARAMETRELERİ (tek kaynak).
//
// Belge kabullerinden (MAZ-VA-AKS-001 v6.0) türeyen tüm sayısal parametreler
// burada tek bir `SimConfig` nesnesinde toplanır. Tüm modüller (Ringler, Sefer,
// Sistem) bu config'i okur; Sistem modülünden değiştirilince simülasyon her
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
  // Blok / geometri (m)
  kisitGenisligi: number; // makas/geçit kısıt bölgesi genişliği
  blokMaxUzunluk: number; // sinyal bloğu azami uzunluğu
  // Kapasite planlama
  dolulukTavani?: number; // UIC 406 önerilen doluluk tavanı (0..1) — pratik kapasite = teorik × tavan; varsayılan 0,70
}

/** UIC 406 pratik doluluk tavanı — yoğun saatte sürdürülebilir işletme sınırı. */
export const VARSAYILAN_DOLULUK_TAVANI = 0.70;

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
  kisitGenisligi: 40,
  blokMaxUzunluk: 500,
  dolulukTavani: 0.70,
};

export type ParamTur = "hiz" | "ivme" | "sure" | "mesafe" | "oran";
export type ParamModul = "sefer" | "ringler";

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
  { key: "vMakas", ad: "Makas geçiş hızı", grup: "Hızlar", tur: "hiz", kaynak: "3.4.8.2", etkiler: "Makas bölgesi geçiş hızı", moduller: ["ringler"], min: 5, max: 30, step: 1 },
  { key: "vHemzemin", ad: "Hemzemin/yaya hızı", grup: "Hızlar", tur: "hiz", kaynak: "4.3", etkiler: "Geçit yavaşlama hızı", moduller: ["ringler"], min: 10, max: 40, step: 1 },
  { key: "vAcil", ad: "Acil frenleme hızı", grup: "Hızlar", tur: "hiz", kaynak: "worst-case", etkiler: "Tehlike/acil frenleme noktasında worst-case hız", moduller: ["ringler"], min: 0, max: 25, step: 1 },
  { key: "ivme", ad: "Hızlanma ivmesi (a)", grup: "Dinamik", tur: "ivme", kaynak: "4.3", etkiler: "Kalkış / seyir süresi", moduller: ["ringler", "sefer"], min: 0.3, max: 1.5, step: 0.1 },
  { key: "yavaslama", ad: "Yavaşlama (b)", grup: "Dinamik", tur: "ivme", kaynak: "4.3", etkiler: "Fren eğrisi / duruş süresi", moduller: ["ringler", "sefer"], min: 0.3, max: 1.5, step: 0.1 },
  { key: "headway", ad: "Hedef headway", grup: "Headway & Mesafe", tur: "sure", kaynak: "4.3 · sözleşme", etkiler: "Sefer sıklığı hedefi + ring uygunluk eşiği", moduller: ["sefer", "ringler"], min: 60, max: 600, step: 10 },
  { key: "ortalamaDurakArasi", ad: "Ortalama durak arası", grup: "Headway & Mesafe", tur: "mesafe", kaynak: "4.3", etkiler: "Yeni ring nominal mesafesi", moduller: ["ringler"], min: 200, max: 2000, step: 50 },
  { key: "enUzunHeadwayMesafesi", ad: "Worst-case mesafe", grup: "Headway & Mesafe", tur: "mesafe", kaynak: "4.3", etkiler: "Ring worst-case referans mesafesi", moduller: ["ringler"], min: 500, max: 2500, step: 50 },
  { key: "routeReleaseAnahat", ad: "Route release (ana hat)", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek L", etkiler: "Ana hat makas rota serbest bırakma", moduller: ["ringler"], min: 1, max: 20, step: 1 },
  { key: "routeReleaseDepo", ad: "Route release (depo)", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek L", etkiler: "Depo manevra rota serbest bırakma", moduller: ["ringler"], min: 1, max: 30, step: 1 },
  { key: "makasAdimMax", ad: "Makas adım süresi", grup: "Zamanlayıcılar", tur: "sure", kaynak: "Ek Ö", etkiler: "Her makas hareketi süresi", moduller: ["ringler"], min: 1, max: 12, step: 1 },
  { key: "kisitGenisligi", ad: "Kısıt bölge genişliği", grup: "Blok", tur: "mesafe", kaynak: "türetme", etkiler: "Makas/geçit hız-kısıt bölgesi uzunluğu", moduller: ["ringler"], min: 10, max: 120, step: 5 },
  { key: "blokMaxUzunluk", ad: "Sinyal bloğu azami", grup: "Blok", tur: "mesafe", kaynak: "2.1", etkiler: "Blok sayısı + gecikmesiz aralık", moduller: ["sefer"], min: 100, max: 1500, step: 50 },
  { key: "dolulukTavani", ad: "UIC 406 doluluk tavanı", grup: "Kapasite planlama", tur: "oran", kaynak: "UIC 406", etkiler: "İşletme (pratik) kapasite = teorik × tavan", moduller: ["sefer"], min: 40, max: 90, step: 5 },
];

/** Gösterim değeri (km/h için m/s→km/h). */
export function paramGoster(cfg: SimConfig, m: ParamMeta): number {
  const v = cfg[m.key] ?? (m.key === "dolulukTavani" ? VARSAYILAN_DOLULUK_TAVANI : 0);
  return m.tur === "hiz" ? v * 3.6 : m.tur === "oran" ? v * 100 : v; // oran 0..1 → %
}
/** Gösterim değerinden SI'ye (km/h→m/s, %→oran). */
export function paramSI(m: ParamMeta, gosterim: number): number {
  return m.tur === "hiz" ? gosterim * KMH : m.tur === "oran" ? gosterim / 100 : gosterim;
}

export function birim(tur: ParamTur): string {
  return tur === "hiz" ? "km/h" : tur === "ivme" ? "m/s²" : tur === "sure" ? "s" : tur === "oran" ? "%" : "m";
}

// ————————————————————————————————————————————————
// İşletme parametreleri (KALICI — projeye kaydedilir)
// ————————————————————————————————————————————————
// Simülasyonu TANIMLAYAN ama cfg (fiziksel sabitler) ve rings (hat) dışında kalan
// işletme girdileri: sefer sayısı, dönüş bekleme, kruvasman, sinyal modu vb. Her
// modül bunları context'ten okur/yazar → projeyle kaydedilir, yenilemede kalır.
// (headway ayrı DEĞİL: tek kaynak cfg.headway'dir — Sefer ve Tam Hat onu kullanır.)

// ————————————————————————————————————————————————
// Terminal (dönüş) kapasitesi — maksimum tramvay hesabının girdileri
// ————————————————————————————————————————————————
// MODEL KURALI: hat DAİMA çift hat, gidiş-dönüş çalışır — tramvay terminale gider,
// ters döner, geri gelir, tekrar gider (durmadan bir çevrim). Mod seçimi yoktur;
// tek işletim modeli budur. Maksimum tramvay = çevrim süresi ÷ minimum headway.

/** Bir dönüş noktasının (terminal) fiziksel dönüş biçimi → terminal headway'ini belirler. */
export type DonusTip =
  | "korTerminal"    // kör (stub) terminal — peronda ters döner
  | "ciftPeron"      // çift peron + makas — biri dönerken diğeri girer
  | "dongu"          // balon/döngü (loop) — dönüş beklemesi ~0
  | "makasliGecis";  // makaslı geçiş (mekik ortası ya da hat üstü ters dönüş)

export interface TerminalConfig {
  tip: DonusTip;
  peronSayisi: number;    // eşzamanlı dönebilen tren sayısı (stub/island)
  peronIsgali: number;    // s — PERON İŞGAL SÜRESİ (YETKİLİ toplam): trenin peronu tuttuğu tam süre.
                          //   Bileşenler varsa = varisTampon + inisBinis + tersDonus + kalkisTemizleme.
  /** Peron işgali bileşenleri (ince model). Verilmezse peronIsgali tek değer; UI bileşenleri ondan türetir. */
  varisTampon?: number;     // s — varış→duruş (boğaz girişi işgali)
  inisBinis?: number;       // s — terminalde iniş/biniş
  tersDonus?: number;       // s — ters dönüş (reversing)
  kalkisTemizleme?: number; // s — kalkış→boğaz temizleme
  toparlanma?: number;      // s — schedule recovery / toparlanma marjı (terminalde bekleme payı)
  bogazPaylasimli: boolean;// peronlar tek boğazı (lead/crossover) paylaşıyor mu?
  bogazIsgali: number;    // s — boğaz/crossover işgali (tanzim+geçiş+serbest); yalnız paylaşımlıysa bağlar
  bogazOto: boolean;      // true → boğaz işgali terminal makas config'inden otomatik türetilir
  bogazMakasSayisi: number;// terminal boğazındaki makas (crossover) adedi — oto türetmede tanzim süresi
}

export const VARSAYILAN_TERMINAL: TerminalConfig = {
  tip: "korTerminal", peronSayisi: 1, peronIsgali: 210,
  bogazPaylasimli: true, bogazIsgali: 45, bogazOto: true, bogazMakasSayisi: 2,
};

/** Boğaz işgali (s) terminal makas config'inden: tanzim (makas×adım) + geçiş (bölge/vMakas) + rota serbest. */
export function bogazIsgaliOto(t: TerminalConfig, cfg: SimConfig): number {
  const ADIM = 4;      // s — makas başına tanzim (ring makas varsayılanıyla uyumlu)
  const RELEASE = 5;   // s — ana hat rota serbest bırakma
  const tanzim = Math.max(1, t.bogazMakasSayisi || 1) * ADIM;
  const gecis = cfg.kisitGenisligi / Math.max(0.1, cfg.vMakas);
  return Math.round(tanzim + gecis + RELEASE);
}

/** Etkin boğaz işgali: oto ise makastan türetilir, değilse elle girilen. */
export function etkinBogazIsgali(t: TerminalConfig, cfg: SimConfig): number {
  return t.bogazOto ? bogazIsgaliOto(t, cfg) : (t.bogazIsgali || 0);
}

export interface Isletme {
  // Sefer simülasyonu (Studio)
  seferSayisi: number;          // tren adedi (manuel değer / son elle girilen)
  seferSayisiOto: boolean;      // true → tren sayısı hattan türetilir (çevrim ÷ işletme headway); false → seferSayisi elle
  seferHeadwayDk: number;       // sefer aralığı (dk) — simüle dispatch aralığı
  turnaroundDk: number;         // dönüş bekleme (dk) — terminal config yoksa geriye-uyumlu varsayılan
  seferBaslangicSaati: string;  // hat şeması ilk kalkış saati "SS:DD"
  mcMeanEntrySn: number;        // Monte-Carlo: ort. giriş gecikmesi (s)
  mcMeanDwellSn: number;        // Monte-Carlo: ort. durak sapması (s)
  // Kapasite gerçekçiliği
  kalkisOluZamaniSn: number;    // s — kalkış ölü zamanı VARSAYILANI (start-up lost time); ring başına override edilebilir (ring.kalkisOlu)
  // Ring/ölçeklenme + kapasite girdileri
  kapali: boolean;              // (legacy) — kapasite modeli her zaman gidiş-dönüş varsayar
  terminalBas: TerminalConfig;  // başlangıç ucundaki dönüş noktası (terminal)
  terminalSon: TerminalConfig;  // bitiş ucundaki dönüş noktası (terminal)
  // Gün içi servis profili (parklanma / depoya giriş-çıkış)
  servisBas: string;    // "SS:DD" — servis başlangıcı (ilk tren depodan çıkar)
  servisBit: string;    // "SS:DD" — servis bitişi (son tren depoya döner)
  pikSabahBas: string;  // sabah pik başlangıcı
  pikSabahBit: string;
  pikAksamBas: string;  // akşam pik başlangıcı
  pikAksamBit: string;
  pikFilo: number;      // pik saatte hatta çalışan tren (en yüksek filo)
  pikDisiFilo: number;  // pik-dışı saatte hatta çalışan tren (fazlası depoda bekler)
}

// Not: cfg.headway (sözleşme hedef headway'i) AYRIDIR — ring uygunluk eşiği için
// kullanılır; buradaki aralıklar simülasyonların denenen dispatch aralığıdır.
export const varsayilanIsletme: Isletme = {
  seferSayisi: 6,
  seferSayisiOto: true,
  seferHeadwayDk: 4,
  turnaroundDk: 3,
  seferBaslangicSaati: "08:00",
  mcMeanEntrySn: 30,
  mcMeanDwellSn: 5,
  kalkisOluZamaniSn: 5,
  kapali: false,
  terminalBas: { ...VARSAYILAN_TERMINAL },
  terminalSon: { ...VARSAYILAN_TERMINAL },
  servisBas: "06:00",
  servisBit: "24:00",
  pikSabahBas: "07:00",
  pikSabahBit: "09:00",
  pikAksamBas: "17:00",
  pikAksamBit: "19:00",
  pikFilo: 6,
  pikDisiFilo: 4,
};

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
  /** Sunum modu: hat onaylı/kesinleşmiş tasarım gibi sunulur — rapor ve arayüzde
   *  challenge (risk/uyarı) bayrakları, denge sapması ve "ihlal" işaretleri
   *  gösterilmez; göstergeler uygun/dengeli yansıtılır. Opsiyonel (varsayılan kapalı). */
  sunumModu?: boolean;
}

// Yeni bir hesabın/hattın künyesi NÖTRDÜR: hiçbir gerçek projeye ait ad taşımaz.
// Kullanıcı kendi proje bilgilerini Belgeler modülünden girer.
export const varsayilanMeta: ProjeMeta = {
  projeAdi: "Yeni Sinyalizasyon Projesi",
  idare: "İdare / İşveren",
  yuklenici: "Yüklenici Firma",
  musavir: "Müşavir Firma",
  sinyalizasyonFirmasi: "RaySim",
  dokumanNo: "PRJ-VA-AKS-001",
  revizyon: "v1.0 (TASLAK)",
  tarih: "",
  hatAdi: "Adsız Hat",
  hazirlayan: "Tasarım Mühendisi",
  onaylayan: "Firma Yetkilisi",
  sunumModu: false,
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
