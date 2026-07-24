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
