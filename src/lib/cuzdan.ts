// raysim — KREDİ CÜZDANI (ortak tipler + fiyatlar + istemci okuma).
//
// Model: kullanıcı önceden KREDİ satın alır; ücretli eylemler krediden düşer.
// İki ücretli eylem: (1) RAPOR çıkarma, (2) PROJE (hat) yükleme/kaydetme.
// Bakiye ve hareketler Firestore'da; YAZMA yalnız sunucudan (Admin SDK),
// OKUMA istemciden güvenli (kurallar sahibi okumaya izin verir).
//
// FİYATLAR burada TEK KAYNAK; sunucu bu değerleri ENFORCE eder (istemci fiyat
// yollamaz). TL karşılığı kredi paketleri ödeme adımında (iyzico) tanımlanır.

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getDb } from "./firebase";

/** Ücretli eylemlerin kredi bedeli. Sunucu bu değerlere göre düşer. */
export const KREDI_BEDELI = {
  /** Resmî PDF teknik rapor — asıl değerli çıktı, proje yüklemeden ÇOK pahalı. */
  rapor: 10,
  /** Bir hattın hesaba yüklenmesi (yeni hat oluşturma). */
  projeYukleme: 1,
} as const;

export type KrediEylemi = keyof typeof KREDI_BEDELI;

/**
 * Satın alınabilir kredi paketleri. Fiyatlar (TL, KDV dâhil) SUNUCUDA sabittir;
 * istemci fiyat yollayamaz, yalnız paket id seçer.
 *
 * Fiyatlandırma (Dengeli): 1 kredi tabanı 20₺; hacimde kredi başına ucuzlar
 * (Standart %15, Profesyonel %25 avantaj). Buna göre PDF rapor (10 kredi) = 200₺,
 * yeni hat (1 kredi) = 20₺. Değiştirmek istersen yalnız `tl` değerlerini güncelle.
 */
export const KREDI_PAKETLERI = [
  { id: "p10", ad: "Başlangıç", kredi: 10, tl: 200 },
  { id: "p50", ad: "Standart", kredi: 50, tl: 850 },
  { id: "p100", ad: "Profesyonel", kredi: 100, tl: 1500 },
] as const;

/** Paketin kredi başına TL fiyatı ve en ucuz pakete göre indirim oranı (%). */
export function paketAvantaj(p: { kredi: number; tl: number }): { birim: number; indirimYuzde: number } {
  const birim = p.tl / p.kredi;
  const taban = KREDI_PAKETLERI[0].tl / KREDI_PAKETLERI[0].kredi; // en küçük paket = referans
  const indirimYuzde = Math.round(((taban - birim) / taban) * 100);
  return { birim, indirimYuzde };
}

export function paketBul(id: string) {
  return KREDI_PAKETLERI.find((p) => p.id === id);
}

/**
 * Ödeme dönüşü için güvenli SİTE-İÇİ yol. Açık yönlendirme (open-redirect) ve
 * protokole-göreli (`//evil.com`) saldırılarını engeller: yalnız tek `/` ile
 * başlayan, şema/host içermeyen göreli yol kabul edilir; aksi halde "/".
 * Query bırakılmaz (callback `?odeme=` ekler); hash korunur. Uzunluk sınırlı.
 */
export function guvenliDonusYolu(ham: unknown): string {
  if (typeof ham !== "string") return "/";
  let y = ham.trim().slice(0, 512);
  if (!y.startsWith("/") || y.startsWith("//") || y.startsWith("/\\")) return "/";
  // Şema veya host sızıntısı (satır sonu/backslash ile) → reddet.
  if (/[\n\r\t\\]/.test(y) || y.includes("://")) return "/";
  y = y.split("?")[0]; // mevcut query'yi at
  return y || "/";
}

/** Kredi hareketinin türü (denetim izi). */
export type HareketTuru = "satinalma" | "rapor" | "projeYukleme" | "duzeltme";

export interface Cuzdan {
  bakiye: number;
  guncelleme: number | null;
}

export interface KrediHareket {
  id: string;
  uid: string;
  tur: HareketTuru;
  /** Pozitif = eklendi (satın alma/düzeltme), negatif = harcandı. */
  miktar: number;
  bakiyeSonra: number;
  /** İlgili kayıt (ödeme id'si, rapor türü, proje id'si…). */
  ref?: string;
  olusturma: number | null;
}

function msAl(t: unknown): number | null {
  const ts = t as { toMillis?: () => number } | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : null;
}

function db() {
  const d = getDb();
  if (!d) throw new Error("Firebase yapılandırılmadı (.env.local eksik).");
  return d;
}

/** Kullanıcının güncel bakiyesi. Cüzdan hiç yoksa 0 (henüz kredi almamış). */
export async function bakiyeGetir(uid: string): Promise<Cuzdan> {
  const snap = await getDoc(doc(db(), "cuzdan", uid));
  if (!snap.exists()) return { bakiye: 0, guncelleme: null };
  const d = snap.data() as Record<string, unknown>;
  return { bakiye: Number(d.bakiye ?? 0), guncelleme: msAl(d.guncelleme) };
}

/**
 * Son kredi hareketleri (en yeni üstte) — cüzdan/makbuz ekranı için.
 * Yalnız eşitlik filtresi + istemcide sıralama → bileşik dizin gerekmez
 * (projeler.ts ile aynı desen).
 */
export async function hareketleriGetir(uid: string, adet = 20): Promise<KrediHareket[]> {
  const snap = await getDocs(query(collection(db(), "krediHareket"), where("uid", "==", uid)));
  return snap.docs
    .map((s) => {
      const d = s.data() as Record<string, unknown>;
      return {
        id: s.id,
        uid: String(d.uid ?? ""),
        tur: (d.tur as HareketTuru) ?? "duzeltme",
        miktar: Number(d.miktar ?? 0),
        bakiyeSonra: Number(d.bakiyeSonra ?? 0),
        ref: d.ref as string | undefined,
        olusturma: msAl(d.olusturma),
      };
    })
    .sort((a, b) => (b.olusturma ?? 0) - (a.olusturma ?? 0))
    .slice(0, adet);
}
