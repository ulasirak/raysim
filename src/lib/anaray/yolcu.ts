// raysim — YOLCU İNİŞ-BİNİŞ DİNAMİĞİ → İSTASYON DURUŞ SÜRESİ (dwell).
//
// Dwell keyfi bir sayı değildir; yolcu akışından fiziksel olarak hesaplanır:
//   Net taban alanı  = araç boyu × araç genişliği × kullanılabilir alan oranı
//   Max yolcu        = net taban alanı × konfor indeksi (yolcu/m²)
//   Yolcu akış süresi= (inen + binen) / (kapı sayısı × kapı genişliği × akış hızı)
//   Duruş süresi     = max(min duruş, yolcu akış süresi) + kapı aç + kapı kapa
//
// Her istasyon için AYRI hesaplanır; toplam tur süresine (RTT) kümülatif girer.

import type { RollingStock } from "./types";
import type { Isletme } from "./config";
import type { DurakArasiRing } from "./ring";

// Araç yolcu-dinamiği varsayılanları (tipik düşük tabanlı tramvay).
const D_KAPI = 4;        // kapı adedi
const D_KAPI_GEN = 1.3;  // m — kapı açıklık genişliği
const D_ARAC_GEN = 2.65; // m — araç gövde genişliği
const D_ALAN_ORAN = 0.35;// kullanılabilir taban oranı (koltuk/ekipman düşülmüş)

export function netTabanAlani(stock: RollingStock): number {
  const gen = stock.aracGenisligi ?? D_ARAC_GEN;
  const oran = stock.kullanilabilirAlanOrani ?? D_ALAN_ORAN;
  return Math.max(0, stock.length * gen * oran);
}

export function maxYolcuKapasitesi(stock: RollingStock, konforIndeksi: number): number {
  return Math.round(netTabanAlani(stock) * Math.max(0, konforIndeksi));
}

/** Bir durakta yolcu akış (iniş-biniş) süresi (s). */
export function yolcuAkisSuresi(inen: number, binen: number, stock: RollingStock, akisHizi: number): number {
  const kapasite = Math.max(0.1, (stock.kapiSayisi ?? D_KAPI) * (stock.kapiGenisligi ?? D_KAPI_GEN) * Math.max(0.1, akisHizi));
  return Math.max(0, (Math.max(0, inen) + Math.max(0, binen)) / kapasite);
}

/** Bir durağın (varış) HESAPLANAN duruş süresi (dwell, s) — fiziksel yolcu akışından. */
export function hesaplananDwell(ring: DurakArasiRing, stock: RollingStock, isletme: Isletme): number {
  const flow = yolcuAkisSuresi(ring.inenYolcu ?? 0, ring.binenYolcu ?? 0, stock, isletme.yolcuAkisHizi);
  const kapiAcma = ring.kapiAcma ?? 2;
  const kapiKapama = ring.kapiKapama ?? 2;
  return Math.max(isletme.minDurusSuresi, flow) + kapiAcma + kapiKapama;
}

/** Dwell OTO açık ringlerin dwell'ini yolcu dinamiğinden hesaplayıp yazar; diğerleri
 *  elle. `dwell` YETKİLİ toplam kalır (motorlar bunu okur) → tek kaynak. */
export function dwellUygulanmisRings(rings: DurakArasiRing[], stock: RollingStock, isletme: Isletme): DurakArasiRing[] {
  if (!rings.some((r) => r.dwellOto)) return rings; // hiç oto yoksa dokunma (regresyon yok)
  return rings.map((r) => {
    if (!r.dwellOto) return r;
    const flow = yolcuAkisSuresi(r.inenYolcu ?? 0, r.binenYolcu ?? 0, stock, isletme.yolcuAkisHizi);
    const yolcu = Math.max(isletme.minDurusSuresi, flow);
    const kapiAcma = r.kapiAcma ?? 2;
    const kapiKapama = r.kapiKapama ?? 2;
    return { ...r, kapiAcma, kapiKapama, yolcuDegisimi: yolcu, dwell: yolcu + kapiAcma + kapiKapama };
  });
}
