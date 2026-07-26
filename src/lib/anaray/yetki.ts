// raysim — YÖNETİCİ (demo sahibi) tespiti.
//
// Yönetici hesabı, sistemin vitrin hattını (Konya Tramvay 2. Etap taslağı) HAZIR
// olarak görür. Başka herkes kendi hesabıyla SIFIRDAN boş bir hat kurar; kimse
// başkasının verisini görmez (satır güvenliğini firestore.rules sağlar — burası
// yalnız "hangi tohumla başlansın" kararıdır, bir yetki kapısı DEĞİLDİR).
//
// Liste `NEXT_PUBLIC_YONETICI_EPOSTALAR` ile (virgülle ayırarak) genişletilebilir.

const VARSAYILAN = "ulasirak073@gmail.com";

function liste(): string[] {
  const ham = process.env.NEXT_PUBLIC_YONETICI_EPOSTALAR ?? VARSAYILAN;
  return ham
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Verilen e-posta yönetici (vitrin hattının sahibi) mi? */
export function yoneticiMi(eposta: string | null | undefined): boolean {
  if (!eposta) return false;
  return liste().includes(eposta.trim().toLowerCase());
}

/**
 * SUNUCU tarafı, uid tabanlı yönetici allowlist'i (ücret muafiyeti gibi HASSAS
 * kapılar için). `YONETICI_UIDLER` (NEXT_PUBLIC DEĞİL) virgülle ayrılmış Firebase
 * uid listesi. E-posta tabanlı tespitten daha güçlü: doğrulanmamış e-posta claim'i
 * taklit edilemez (uid imzalı token'ın `sub`'ıdır). Boşsa yalnız e-posta yolu kalır.
 */
export function yoneticiUidMi(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const ham = process.env.YONETICI_UIDLER;
  if (!ham) return false;
  return ham.split(",").map((u) => u.trim()).filter(Boolean).includes(uid);
}
