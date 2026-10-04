// raysim — ORTAK KESİM YÜKÜ (dallanma birleşik kapasite, #1-B/D)
//
// Dallı bir ağın TANIMLAYICI özelliği: hat başı ile bir kavşak arasındaki ORTAK ana hat
// kesimi, hem ana hat hem o kavşaktan/sonrasından ayrılan şube trenlerini BİRLİKTE taşır.
// O kesimdeki birleşik frekans, tek tek rotaların analizinden daha yüksektir → gerçek
// darboğaz burasıdır.
//
// OPT-IN + TAHMİN YOK: yalnız bir şubeye `servisTren` (> 0) girildiğinde hesaplanır.
// Girilmezse hiçbir şey değişmez (şube kendi başına analiz edilir). Mod seçici YOK —
// tek girdi: kola giden tren sayısı.
//
// Model: her servis N tren / T çevrim → frekans = 3600·N/T (tren/saat). Ortak kesim
// [0..J-1] için birleşik frekans = ana + o kesimi kullanan tüm şubeler. Birleşik headway
// = 3600/birleşikFrekans; ortak kesimin fiziksel min headway'ine (blocking-time) sığmalı.

import { type DurakArasiRing, type Sube } from "./ring";
import type { RollingStock } from "./types";
import type { SimConfig, Isletme } from "./config";
import { maksimumTren, type MaksimumTrenSonuc } from "./kapasite";
import { blockingTimeRing } from "./blockingtime";
import { subeEfektifRingler } from "./network";

// ————————————————————————————————————————————————
// ŞUBE ÖZETİ (editör netliği, #1 Katman-1) — tanımın "nerede / ne kadar / ne işe yarar"
// sorularını tek bakışta yanıtlar. TÜM sayılar motordan türer (tahmin yok) ve raporun
// 4.4 Şubeler tablosuyla BİREBİR aynı kaynaktan hesaplanır (subeEfektifRingler + maksimumTren)
// → editörde gördüğün değer, rapordaki değerle aynıdır.
// ————————————————————————————————————————————————
export interface SubeOzet {
  kavsakIndex: number;   // ayrılma durağı indeksi (0..rings.length)
  kavsakAd: string;      // kavşak durağının adı
  kavsakKm: number;      // hat başı → kavşak (ortak ana hat kesimi) uzunluğu
  subeKm: number;        // şubenin kendi uzunluğu (kavşaktan uca)
  rotaKm: number;        // hat başı → kavşak → şube ucu (bir yön toplam)
  durakSayisi: number;   // şubeye eklenen durak sayısı
  maks: MaksimumTrenSonuc; // şube ROTASININ kapasitesi (hat başı → kavşak → şube)
}

/** Bir şubenin editör özeti — geometri + rota kapasitesi. rapor 4.4 ile aynı hesap. */
export function subeOzeti(
  rings: DurakArasiRing[],
  sube: Sube,
  stock: RollingStock,
  cfg: SimConfig,
  isletme: Isletme,
): SubeOzet {
  const n = rings.length;
  const at = Math.max(0, Math.min(n, Math.round(sube.atIndex)));
  const kavsakKm = rings.slice(0, at).reduce((a, r) => a + Math.max(0, r.uzunluk), 0) / 1000;
  const subeKm = sube.rings.reduce((a, r) => a + Math.max(0, r.uzunluk), 0) / 1000;
  const kavsakAd = at === 0 ? (rings[0]?.fromAd || "—") : (rings[at - 1]?.toAd || "—");
  const ef = subeEfektifRingler(rings, sube);
  const maks = maksimumTren(ef, stock, cfg, subeIsletme(isletme, sube));
  return { kavsakIndex: at, kavsakAd, kavsakKm, subeKm, rotaKm: kavsakKm + subeKm, durakSayisi: sube.rings.length, maks };
}

export interface OrtakKesim {
  junctionDurak: number;      // kavşak durak indeksi
  junctionAd: string;
  paylasilanKm: number;       // ortak kesim uzunluğu (hat başı → kavşak)
  anaFreq: number;            // ana hat frekansı (tren/saat)
  subeFreq: number;           // bu kesimi kullanan şubelerin birleşik frekansı (tren/saat)
  birlesikFreq: number;       // toplam (tren/saat)
  birlesikHeadway: number;    // s
  minHeadway: number;         // ortak kesimin fiziksel min headway'i (s)
  uygun: boolean;             // birleşik headway ≥ min headway
  subeAdlari: string[];       // bu kesimi paylaşan şubeler
}

export interface OrtakKesimSonuc {
  kesimler: OrtakKesim[];
  aktif: boolean;             // en az bir şubede servisTren > 0
  uygun: boolean;             // tüm kesimler uygun mu
  ozet: string;
}

const freqOf = (n: number, cycleSn: number) => (cycleSn > 0 ? (3600 * n) / cycleSn : 0);

/** Şube rotasının işletme bağlamı: UÇTAKİ terminal, şubenin kendi terminali varsa ONU
 *  kullanır (kör terminal/döngü + S/X makas) — yoksa ana hattın terminalSon'u (geriye
 *  uyumlu). Başlangıç terminali (terminalBas) daima hat başıdır. */
export function subeIsletme(isletme: Isletme, sube: Sube): Isletme {
  return sube.terminal ? { ...isletme, terminalSon: sube.terminal } : isletme;
}

export function ortakKesimAnaliz(
  rings: DurakArasiRing[],
  subeler: Sube[],
  stock: RollingStock,
  cfg: SimConfig,
  isletme: Isletme,
  anaFilo: number,
): OrtakKesimSonuc {
  const aktifler = subeler.filter((s) => (s.servisTren ?? 0) > 0 && s.rings.length > 0);
  if (!aktifler.length || !rings.length) {
    return { kesimler: [], aktif: false, uygun: true, ozet: "Ortak kesim analizi için bir şubeye servis treni gir (kaç tren o kola gider)." };
  }

  const maksMain = maksimumTren(rings, stock, cfg, isletme);
  const anaFreq = maksMain.gecerli ? freqOf(Math.max(1, anaFilo), maksMain.cevrimSuresi) : 0;

  const subeFreq = new Map<string, number>();
  for (const s of aktifler) {
    const m = maksimumTren(subeEfektifRingler(rings, s), stock, cfg, subeIsletme(isletme, s));
    subeFreq.set(s.id, m.gecerli ? freqOf(s.servisTren!, m.cevrimSuresi) : 0);
  }

  // Ortak kesim yalnız J ≥ 1 için anlamlı (J=0 = hat başı, paylaşılan kesim yok).
  const junctions = [...new Set(aktifler.map((s) => Math.max(0, Math.min(rings.length, Math.round(s.atIndex)))))]
    .filter((J) => J >= 1).sort((a, b) => a - b);

  const kesimler: OrtakKesim[] = junctions.map((J) => {
    const kullanan = aktifler.filter((s) => Math.round(s.atIndex) >= J); // [0..J-1]'i kullanan şubeler
    const sFreq = kullanan.reduce((a, s) => a + (subeFreq.get(s.id) ?? 0), 0);
    const birlesikFreq = anaFreq + sFreq;
    const birlesikHeadway = birlesikFreq > 0 ? 3600 / birlesikFreq : Infinity;
    const sharedRings = rings.slice(0, J);
    const bt = blockingTimeRing(sharedRings, stock, cfg, isletme.kalkisOluZamaniSn);
    const minHeadway = bt.minHeadway > 0 ? bt.minHeadway : (maksMain.gecerli ? maksMain.hMin : 0);
    return {
      junctionDurak: J,
      junctionAd: rings[J - 1]?.toAd || "—",
      paylasilanKm: sharedRings.reduce((a, r) => a + Math.max(0, r.uzunluk), 0) / 1000,
      anaFreq: Math.round(anaFreq * 10) / 10,
      subeFreq: Math.round(sFreq * 10) / 10,
      birlesikFreq: Math.round(birlesikFreq * 10) / 10,
      birlesikHeadway: Math.round(birlesikHeadway),
      minHeadway: Math.round(minHeadway),
      uygun: birlesikHeadway >= minHeadway - 1e-6,
      subeAdlari: kullanan.map((s) => s.ad),
    };
  });

  const uygun = kesimler.every((k) => k.uygun);
  const enSiki = kesimler.reduce<OrtakKesim | null>((a, k) => (!a || k.birlesikHeadway < a.birlesikHeadway ? k : a), null);
  const ozet = !kesimler.length
    ? "Şube hat başından ayrıldığından ortak kesim yok."
    : uygun
      ? `Ortak kesim(ler) birleşik yükü karşılıyor — en sıkı: ${enSiki!.junctionAd} kavşağı öncesi (birleşik ${enSiki!.birlesikHeadway} s ≥ min ${enSiki!.minHeadway} s).`
      : `Ortak kesim AŞIRI YÜKLÜ: ${enSiki!.junctionAd} kavşağı öncesi ana hat + şube birleşik ${enSiki!.birlesikFreq} tren/saat istiyor; kesimin fiziksel sınırı ${enSiki!.minHeadway} s headway (birleşik ${enSiki!.birlesikHeadway} s bunun altında). Servis trenlerini azalt ya da headway'i gevşet.`;

  return { kesimler, aktif: true, uygun, ozet };
}
