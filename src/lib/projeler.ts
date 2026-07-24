// raysim — ÇOK KİRACILI PROJE DEPOSU (Firestore).
//
// Her kullanıcının kendi projeleri vardır; bir proje = tek bir HAT'ın tüm durumu
// (ring zinciri + simülasyon parametreleri + künye). Aktif proje seçilir ve o an
// bütün modüller (Sefer/Ringler/Anklaşman/Tam Hat/Sistem/Belgeler/Coğrafi) o tek
// hatta hizmet eder.
//
// İzolasyon YALNIZCA Firestore güvenlik kurallarıyla sağlanır (firestore.rules):
// istemci sorgusu filtreliyor olsa bile yetkisiz okuma sunucuda reddedilir.
// Yeni bir hassas alan eklerken kuralları da güncelle.
//
// Ring/cfg/meta tek bir JSON alanında (`veri`) saklanır: şema evrilse bile
// Firestore doküman yapısı sabit kalır, iç içe dizi kısıtları hiç devreye girmez.

import {
  collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, type Timestamp,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type { SimConfig, ProjeMeta } from "./anaray/config";
import type { DurakArasiRing } from "./anaray/ring";

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

/** Bir projenin taşıdığı tüm simülasyon durumu. */
export interface ProjeVerisi {
  rings: DurakArasiRing[];
  cfg: SimConfig;
  meta: ProjeMeta;
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

export async function projeOlustur(uid: string, ad: string, veri: ProjeVerisi): Promise<string> {
  const ref = await addDoc(collection(db(), COL), {
    sahipUid: uid,
    ad,
    veri: JSON.stringify(veri),
    paylasim: { acik: false },
    olusturma: serverTimestamp(),
    guncelleme: serverTimestamp(),
  });
  return ref.id;
}

/**
 * İLK proje — doküman kimliği uid'den TÜRETİLİR (`ilk_<uid>`), rastgele değil.
 *
 * Neden: kayıt olduktan sonra sayfa yeniden yükleniyor; yeni JS bağlamında
 * bellekteki "kurulum sürüyor" kilidi sıfırlanıyor, liste hâlâ boş görünüyor ve
 * hesaba İKİNCİ bir proje açılıyordu. Sabit kimlikle iki eşzamanlı deneme aynı
 * dokümanda birleşir.
 *
 * ÖNCE OKUMA YAPILMAZ — bilerek: kurallarda var olmayan bir dokümanın `get`i
 * `resource == null` olduğu için "permission-denied" ATAR, "yok" dönmez; varlık
 * kontrolü ilk girişi tamamen kırardı. Ezme riski yok, çünkü bu işlev yalnız
 * sunucu "bu hesapta hiç proje yok" dedikten sonra çağrılır ve eşzamanlı iki
 * çağrı da AYNI tohum veriyi yazar.
 */
export async function ilkProjeOlustur(uid: string, ad: string, veri: ProjeVerisi): Promise<string> {
  const id = `ilk_${uid}`;
  const ref = doc(db(), COL, id);
  await setDoc(ref, {
    sahipUid: uid,
    ad,
    veri: JSON.stringify(veri),
    paylasim: { acik: false },
    olusturma: serverTimestamp(),
    guncelleme: serverTimestamp(),
  });
  return id;
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
