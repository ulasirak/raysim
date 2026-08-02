// raysim — ÇOK KİRACILI PROJE DEPOSU (Firestore).
//
// Her kullanıcının kendi projeleri vardır; bir proje = tek bir HAT'ın tüm durumu
// (ring zinciri + simülasyon parametreleri + künye). Aktif proje seçilir ve o an
// bütün modüller (Ringler/Anklaşman/Sefer/Sistem/Belgeler) o tek
// hatta hizmet eder.
//
// İzolasyon YALNIZCA Firestore güvenlik kurallarıyla sağlanır (firestore.rules):
// istemci sorgusu filtreliyor olsa bile yetkisiz okuma sunucuda reddedilir.
// Yeni bir hassas alan eklerken kuralları da güncelle.
//
// Ring/cfg/meta tek bir JSON alanında (`veri`) saklanır: şema evrilse bile
// Firestore doküman yapısı sabit kalır, iç içe dizi kısıtları hiç devreye girmez.

import {
  collection, getDocs, getDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, query, where, type Timestamp,
} from "firebase/firestore";
import { getDb, getAuthInstance } from "./firebase";
import type { SimConfig, ProjeMeta, Isletme } from "./anaray/config";
import type { DurakArasiRing } from "./anaray/ring";
import type { MakasBolgeTopolojisi } from "./anaray/interlocking";
import type { RollingStock } from "./anaray/types";

const COL = "projeler";

/**
 * Hesap başına açılabilecek en fazla hat. Yönetici muaftır.
 * Sınır İSTEMCİDE uygulanır: Firestore kuralları doküman SAYAMAZ, dolayısıyla
 * bu bir maliyet/kötüye kullanım freni; güvenlik sınırı değildir. Gerçek
 * izolasyonu kurallar sağlar (bkz. firestore.rules).
 */
export const PROJE_KOTASI = 10;

/** Tek projenin JSON boyutu üst sınırı — firestore.rules'daki değerle AYNI olmalı. */
export const VERI_BAYT_SINIRI = 900_000;

/** `veri` alanının Firestore'a gidecek gerçek boyutu (bayt). */
export function veriBoyutu(json: string): number {
  return new TextEncoder().encode(json).length;
}

/** Bir projenin taşıdığı tüm simülasyon durumu.
 *  `arac` ve `isletme` OPSİYONELDİR: eski (şema öncesi) kayıtlarda bulunmaz →
 *  okunurken varsayılanla doldurulur (bkz. SimConfigProvider.veriUygula). */
export interface ProjeVerisi {
  rings: DurakArasiRing[];
  cfg: SimConfig;
  meta: ProjeMeta;
  /** Projenin çeken aracı (tüm modüller tek kaynaktan okur). */
  arac?: RollingStock;
  /** İşletme/sefer parametreleri (sefer sayısı, kruvasman, sinyal modu vb.). */
  isletme?: Isletme;
  /** Kiracının makas bölgesi anklaşman topolojileri (Anklaşman modülü + Belgeler
   *  bunları okur). Eski kayıtlarda yoktur → okunurken şablonlarla doldurulur. */
  bolgeler?: MakasBolgeTopolojisi[];
}

/** Proje listesi satırı (ağır `veri` alanı olmadan). */
export interface ProjeOzet {
  id: string;
  ad: string;
  guncelleme: number | null;
  paylasimAcik: boolean;
  sahipUid: string;
}

function db() {
  const d = getDb();
  if (!d) throw new Error("Firebase yapılandırılmadı (.env.local eksik).");
  return d;
}

function msAl(t: unknown): number | null {
  const ts = t as Timestamp | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : null;
}

function ozetle(id: string, d: Record<string, unknown>): ProjeOzet {
  const p = d.paylasim as { acik?: boolean } | undefined;
  return {
    id,
    ad: (d.ad as string) || "(adsız proje)",
    guncelleme: msAl(d.guncelleme),
    paylasimAcik: Boolean(p?.acik),
    sahipUid: (d.sahipUid as string) ?? "",
  };
}

/** Kullanıcının projeleri (en son güncellenen üstte). */
export async function projeleriListele(uid: string): Promise<ProjeOzet[]> {
  // Yalnız eşitlik filtresi kullanılır; sıralama istemcide yapılır →
  // bileşik dizin (composite index) gerekmez, kurulum sürtünmesi olmaz.
  const snap = await getDocs(query(collection(db(), COL), where("sahipUid", "==", uid)));
  return snap.docs
    .map((s) => ozetle(s.id, s.data() as Record<string, unknown>))
    .sort((a, b) => (b.guncelleme ?? 0) - (a.guncelleme ?? 0));
}

/**
 * İLK proje — SUNUCUDA seed edilir (`/api/proje/ilk`, Admin SDK, ücretsiz).
 *
 * Neden sunucu: `projeler` create kuralı istemciye açık kaldığı sürece kötü
 * niyetli kullanıcı /api/proje/olustur ücretlendirmesini baypas edip sınırsız
 * ücretsiz proje açabiliyordu. İlk projeyi de sunucuya taşıyınca kural
 * `create: if false` yapılıp bu kapı kapanır (bkz. firestore.rules).
 *
 * Doküman kimliği yine uid'den türetilir (`ilk_<uid>`): kayıttan sonra sayfa
 * yeniden yüklenip bellekteki "kurulum sürüyor" kilidi sıfırlansa bile iki
 * eşzamanlı deneme aynı dokümanda birleşir; sunucu tarafı transaction mevcut
 * veriyi ezmez (idempotent).
 */
export async function ilkProjeOlustur(ad: string, veri: ProjeVerisi): Promise<string> {
  const token = await getAuthInstance()?.currentUser?.getIdToken();
  if (!token) throw new Error("Oturum bulunamadı.");
  const yanit = await fetch("/api/proje/ilk", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ad, veriJson: JSON.stringify(veri) }),
  });
  const veriYanit = await yanit.json().catch(() => ({}));
  if (!yanit.ok) throw new Error(veriYanit.hata ?? "İlk hat oluşturulamadı.");
  return veriYanit.id as string;
}

export interface ProjeKaydi extends ProjeOzet {
  veri: ProjeVerisi;
}

/** Tek projeyi getirir. Yetkisizse Firestore kuralları reddeder (hata fırlar). */
export async function projeGetir(id: string): Promise<ProjeKaydi> {
  const snap = await getDoc(doc(db(), COL, id));
  if (!snap.exists()) throw new Error("Proje bulunamadı.");
  const d = snap.data() as Record<string, unknown>;
  return { ...ozetle(snap.id, d), veri: JSON.parse(d.veri as string) as ProjeVerisi };
}

export async function projeKaydet(id: string, veri: ProjeVerisi, ad?: string): Promise<void> {
  await updateDoc(doc(db(), COL, id), {
    veri: JSON.stringify(veri),
    ...(ad ? { ad } : {}),
    guncelleme: serverTimestamp(),
  });
}

export async function projeAdiDegistir(id: string, ad: string): Promise<void> {
  await updateDoc(doc(db(), COL, id), { ad, guncelleme: serverTimestamp() });
}

export async function projeSil(id: string): Promise<void> {
  await deleteDoc(doc(db(), COL, id));
}

/**
 * Salt-okunur paylaşım: açıkken linki bilen herkes projeyi GÖRÜNTÜLER (yazamaz).
 * Link = <site>/?proje=<id>. Kapatınca erişim anında kesilir.
 */
export async function paylasimAyarla(id: string, acik: boolean): Promise<void> {
  await updateDoc(doc(db(), COL, id), { paylasim: { acik }, guncelleme: serverTimestamp() });
}
