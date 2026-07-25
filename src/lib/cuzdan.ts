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
 * Satın alınabilir kredi paketleri. Fiyatlar (TL) SUNUCUDA sabittir; istemci
 * fiyat yollayamaz, yalnız paket id seçer. Fiyatları netleştirince güncelle.
 * (Placeholder değerler — gerçek fiyatlandırmayı belirle.)
 */
export const KREDI_PAKETLERI = [
  { id: "p10", kredi: 10, tl: 100 },
  { id: "p50", kredi: 50, tl: 450 },
  { id: "p100", kredi: 100, tl: 800 },
] as const;

export type PaketId = (typeof KREDI_PAKETLERI)[number]["id"];

export function paketBul(id: string) {
  return KREDI_PAKETLERI.find((p) => p.id === id);
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
