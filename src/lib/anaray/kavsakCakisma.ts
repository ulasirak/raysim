// raysim — KAVŞAK ZAMAN-ÇAKIŞMASI (merge/diverge conflict, dallanma #1 sonraki seviye)
//
// ortakKesim.ts ORTALAMA birleşik frekansın ortak kesimin fiziksel min headway'ine sığıp
// sığmadığına bakar (steady-state). Ama ana hat ile şube servisleri AYNI başlangıçtan
// (hat başı) kalkıp AYNI ortak kesimi aynı fizikle geçtiğinden, iki periyot birbirine
// VURDUĞUNDA belirli bir ana-hat treni ile belirli bir şube treni kavşakta min headway'den
// yakın geçebilir — ortalama sığsa bile. OpenTrack'in çözdüğü klasik kavşak (merge/diverge)
// çakışması budur. Bu modül onu ZAMAN-DOMENİNDE, servis penceresi üzerinde yakalar ve
// çakışmayı gideren en iyi KALKIŞ ÖTELEMESİNİ bulur (OpenTrack usulü çözüm).
//
// TEMEL İÇGÖRÜ (uydurma yok, saf aritmetik):
//   Ana hat trenleri hat başından hT = çevrim_ana / filo aralığıyla kalkar → kavşağa hep
//   aynı tJunc sonra varır (ortak kesim fiziği ikisi için aynı). Şube trenleri hB =
//   çevrim_şube / servisTren aralığıyla aynı başlangıçtan kalkar. Dolayısıyla kavşaktaki
//   geçiş aralığı = KALKIŞ aralığıdır. İki periyodik kalkış akışını bir SERVİS PENCERESİ
//   (ör. ~1 saat, periyotlarla sınırlı) boyunca örnekleyip, bir servisi diğerine göre φ
//   kadar öteleyerek en sıkı ana-hat↔şube geçiş aralığını bulur; φ üzerinden EN BÜYÜK
//   değeri veren öteleme = önerilen çözüm. Bu en büyük değer bile kavşak min headway'inin
//   (hJ) altındaysa çakışma KAÇINILMAZ (servisi azalt); değilse ÖNLENEBİLİR → öteleme öner.
//
// Neden sonsuz-ızgara g/2 DEĞİL: iki periyodun gcd'si çoğu zaman küçüktür (1–10 s) → sonsuz
// akışta ayrım g/2 ≈ 0 çıkar ve "her kavşak kaçınılmaz çakışır" gibi yanıltır. Gerçek işletme
// sonsuz-periyodik değildir; servis penceresi içindeki GERÇEK en sıkı yaklaşma anlamlıdır.
//
// OPT-IN + TAHMİN YOK: ortakKesim ile AYNI kapı — yalnız bir şubeye servisTren>0 girilince
// ve kavşak J≥1 olunca hesaplanır. Girilmezse hiçbir şey değişmez. Mod seçici yok.

import { type DurakArasiRing, type Sube } from "./ring";
import type { RollingStock } from "./types";
import type { SimConfig, Isletme } from "./config";
import { maksimumTren } from "./kapasite";
import { blockingTimeRing } from "./blockingtime";
import { subeEfektifRingler } from "./network";
import { subeIsletme } from "./ortakKesim";

/** Ortak kesimi paylaşan bir servisin (ana hat ya da şube) kalkış akışı. */
export interface ServisAkisi {
  ad: string;
  tur: "ana" | "sube";
  headway: number;    // s — ardışık kalkışlar arası (bu servisin kendi aralığı)
  trenSayisi: number; // bu servisteki tren (filo ya da servisTren)
}

/** İki servisin kavşaktaki yapısal en-sıkı geçiş ilişkisi (en iyi faz ötelemesiyle). */
export interface KavsakCift {
  aAd: string; bAd: string;       // çifti oluşturan iki servis (öteleme b'ye uygulanır)
  enIyiAralik: number;            // s — servis penceresinde erişilebilir en büyük min geçiş aralığı
  enIyiOfset: number;             // s — bu ayrımı veren kalkış ötelemesi (b, a'ya göre)
  cakismaKacinilmaz: boolean;     // enIyiAralik < hJ → hiçbir öteleme çözmez
}

/** Bir kavşağın (ortak kesim sonu) zaman-çakışma özeti. */
export interface KavsakAnaliz {
  junctionDurak: number;          // kavşak durak indeksi (J)
  junctionAd: string;
  paylasilanKm: number;           // ortak kesim uzunluğu (hat başı → kavşak)
  minHeadway: number;             // hJ — ortak kesimin fiziksel min headway'i (s)
  ortalamaHeadway: number;        // s — birleşik ortalama headway (ortakKesim ile aynı; kapasite kıyası)
  kapasiteAsimi: boolean;         // ortalamaHeadway < hJ → ortak kesim ortalamada bile yetmiyor
  servisler: ServisAkisi[];       // kavşağı kullanan servisler (ana + katkı veren şubeler)
  ciftler: KavsakCift[];          // tüm servis çiftleri (en sıkıdan gevşeğe)
  baglayan: KavsakCift | null;    // en sıkı çift (en küçük enIyiAralik)
  cakismaVar: boolean;            // baglayan.enIyiAralik < hJ (kaçınılmaz çakışma)
  enIyiOfsetSn: number;           // önerilen kalkış ötelemesi (baglayan.enIyiOfset), s
  oneri: string;
}

export interface KavsakCakismaSonuc {
  kavsaklar: KavsakAnaliz[];
  aktif: boolean;                 // en az bir şubede servisTren>0 ve kavşak J≥1
  cakismaVar: boolean;            // en az bir kavşakta kaçınılmaz çakışma
  pencereSn: number;              // analizde kullanılan servis penceresi (bilgi)
  ozet: string;
}

function gcdInt(a: number, b: number): number {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

/** A akışı (faz 0) ile B akışı (faz φ) arasındaki, [0,W) penceresindeki en sıkı geçiş aralığı.
 *  A kalkışları k·hA; her biri için en yakın B kalkışına (φ + m·hB) uzaklık. */
function pencereMinAralik(hA: number, hB: number, W: number, phi: number): number {
  let mn = Infinity;
  for (let t = 0; t < W - 1e-9; t += hA) {
    const m = Math.round((t - phi) / hB);
    mn = Math.min(mn, Math.abs(t - (phi + m * hB)));
    if (mn === 0) return 0;
  }
  return mn === Infinity ? 0 : mn;
}

/** İki servis akışının en iyi faz ötelemesi + o ötelemedeki en sıkı geçiş aralığı. */
function ciftAnaliz(a: ServisAkisi, b: ServisAkisi, hJ: number): KavsakCift {
  const hA = Math.max(1, Math.round(a.headway));
  const hB = Math.max(1, Math.round(b.headway));
  // Servis penceresi: tam vuru deseni (lcm) ama [~30 dk, 2 saat] ile sınırlı → operasyonel ufuk.
  const lcm = Math.round((hA * hB) / gcdInt(hA, hB));
  const W = Math.min(Math.max(lcm, Math.max(hA, hB) * 8, 1800), 7200);
  // φ'yi B periyodu boyunca tara → en sıkı geçiş aralığını MAKSİMİZE eden öteleme.
  let enIyi = -1, enIyiPhi = 0;
  for (let phi = 0; phi < hB; phi++) {
    const g = pencereMinAralik(hA, hB, W, phi);
    if (g > enIyi) { enIyi = g; enIyiPhi = phi; }
  }
  const enIyiAralik = Math.max(0, enIyi);
  return { aAd: a.ad, bAd: b.ad, enIyiAralik, enIyiOfset: enIyiPhi, cakismaKacinilmaz: enIyiAralik < hJ - 1e-6 };
}

export function kavsakCakismaAnaliz(
  rings: DurakArasiRing[],
  subeler: Sube[],
  stock: RollingStock,
  cfg: SimConfig,
  isletme: Isletme,
  anaFilo: number,
): KavsakCakismaSonuc {
  const aktifler = subeler.filter((s) => (s.servisTren ?? 0) > 0 && s.rings.length > 0);
  if (!aktifler.length || !rings.length) {
    return { kavsaklar: [], aktif: false, cakismaVar: false, pencereSn: 0, ozet: "Kavşak zaman-çakışması için bir şubeye servis treni gir (kaç tren o kola gider)." };
  }

  const maksMain = maksimumTren(rings, stock, cfg, isletme);
  const filo = Math.max(1, Math.round(anaFilo));
  // Ana hat kalkış aralığı = çevrim ÷ filo (herhangi bir noktada ardışık trenler arası).
  const anaHeadway = maksMain.gecerli && maksMain.cevrimSuresi > 0 ? maksMain.cevrimSuresi / filo : 0;

  // Her şubenin kendi kalkış aralığı = şube çevrimi ÷ o kola giden tren sayısı.
  const subeHeadway = new Map<string, number>();
  for (const s of aktifler) {
    const m = maksimumTren(subeEfektifRingler(rings, s), stock, cfg, subeIsletme(isletme, s));
    const n = Math.max(1, Math.round(s.servisTren!));
    subeHeadway.set(s.id, m.gecerli && m.cevrimSuresi > 0 ? m.cevrimSuresi / n : 0);
  }

  // Kavşaklar: yalnız J≥1 anlamlı (J=0 = hat başı, paylaşılan kesim yok).
  const junctions = [...new Set(aktifler.map((s) => Math.max(0, Math.min(rings.length, Math.round(s.atIndex)))))]
    .filter((J) => J >= 1).sort((a, b) => a - b);

  const kavsaklar: KavsakAnaliz[] = junctions.map((J) => {
    const kullanan = aktifler.filter((s) => Math.round(s.atIndex) >= J); // [0..J-1]'i paylaşan şubeler
    const sharedRings = rings.slice(0, J);
    const bt = blockingTimeRing(sharedRings, stock, cfg, isletme.kalkisOluZamaniSn);
    const minHeadway = bt.minHeadway > 0 ? bt.minHeadway : (maksMain.gecerli ? maksMain.hMin : 0);

    // Kavşağı kullanan servis akışları: ana hat + katkı veren her şube (geçerli headway'li).
    const servisler: ServisAkisi[] = [
      { ad: "Ana hat", tur: "ana" as const, headway: Math.round(anaHeadway), trenSayisi: filo },
      ...kullanan.map((s) => ({ ad: s.ad, tur: "sube" as const, headway: Math.round(subeHeadway.get(s.id) ?? 0), trenSayisi: Math.max(1, Math.round(s.servisTren!)) })),
    ].filter((v) => v.headway > 0);

    // Tüm servis çiftlerinin en iyi faz ötelemesi + en sıkı geçiş aralığı (merge/diverge).
    const ciftler: KavsakCift[] = [];
    for (let i = 0; i < servisler.length; i++)
      for (let j = i + 1; j < servisler.length; j++)
        ciftler.push(ciftAnaliz(servisler[i], servisler[j], minHeadway));
    ciftler.sort((a, b) => a.enIyiAralik - b.enIyiAralik);

    const baglayan = ciftler[0] ?? null;
    const cakismaVar = !!baglayan && baglayan.cakismaKacinilmaz;
    const enIyiOfsetSn = baglayan ? baglayan.enIyiOfset : 0;
    const junctionAd = rings[J - 1]?.toAd || "—";
    const paylasilanKm = sharedRings.reduce((a, r) => a + Math.max(0, r.uzunluk), 0) / 1000;
    // Birleşik ortalama headway (ortakKesim ile aynı mantık) → kapasite kıyası için.
    const toplamFreq = servisler.reduce((a, s) => a + (s.headway > 0 ? 1 / s.headway : 0), 0);
    const ortalamaHeadway = toplamFreq > 0 ? 1 / toplamFreq : Infinity;
    const kapasiteAsimi = ortalamaHeadway < minHeadway - 1e-6;

    let oneri: string;
    if (!baglayan) {
      oneri = `${junctionAd} kavşağında tek servis geçiyor — merge çakışması yok.`;
    } else if (!cakismaVar) {
      oneri = `${junctionAd} kavşağında çakışma ÖNLENEBİLİR: «${baglayan.bAd}» kalkışlarını «${baglayan.aAd}»'a göre ${enIyiOfsetSn} s ötele → en sıkı geçiş aralığı ${Math.round(baglayan.enIyiAralik)} s ≥ kavşak min ${Math.round(minHeadway)} s. Koordinasyonsuz kalkışlar çakışabilir; önerilen öteleme ${enIyiOfsetSn} s.`;
    } else if (kapasiteAsimi) {
      oneri = `${junctionAd} kavşağı AŞIRI YÜKLÜ: birleşik ortalama headway ${Math.round(ortalamaHeadway)} s, kavşağın fiziksel min ${Math.round(minHeadway)} s'nin altında — ortalamada bile sığmıyor. Servis tren sayısını azalt ya da ortak kesimi güçlendir (blok böl / hız artır).`;
    } else {
      // Ortalama sığıyor ama periyotlar uyumsuz → vuru (beating) çakışması; öteleme çözmez.
      oneri = `${junctionAd} kavşağında VURU ÇAKIŞMASI: ortalama birleşik headway (${Math.round(ortalamaHeadway)} s) kavşak min'ine (${Math.round(minHeadway)} s) sığsa da «${baglayan.aAd}» ve «${baglayan.bAd}» periyotları uyumsuz; en iyi ötelemeyle bile en sıkı ayrım ${Math.round(baglayan.enIyiAralik)} s kalıyor. Şube headway'ini ana hat headway'inin tam katı/böleni yap (trenler temiz saplansın) ya da nadir çakışan şube trenini kavşakta kısa süre beklet.`;
    }

    return { junctionDurak: J, junctionAd, paylasilanKm, minHeadway: Math.round(minHeadway), ortalamaHeadway: Math.round(ortalamaHeadway), kapasiteAsimi, servisler, ciftler, baglayan, cakismaVar, enIyiOfsetSn, oneri };
  });

  const cakismaVar = kavsaklar.some((k) => k.cakismaVar);
  const enSiki = kavsaklar.reduce<KavsakAnaliz | null>((a, k) => (!a || (k.baglayan?.enIyiAralik ?? Infinity) < (a.baglayan?.enIyiAralik ?? Infinity) ? k : a), null);
  const ozet = !kavsaklar.length
    ? "Şube hat başından ayrıldığından ortak kesim/kavşak çakışması yok."
    : cakismaVar
      ? (enSiki!.kapasiteAsimi
          ? `Kavşak AŞIRI YÜKLÜ: ${enSiki!.junctionAd} kavşağında birleşik ortalama headway ${enSiki!.ortalamaHeadway} s < min ${enSiki!.minHeadway} s — servisi azalt.`
          : `Kavşak VURU çakışması: ${enSiki!.junctionAd} kavşağında ortalama sığıyor ama periyotlar uyumsuz; en iyi ötelemeyle bile en sıkı ayrım ${Math.round(enSiki!.baglayan!.enIyiAralik)} s < min ${enSiki!.minHeadway} s. Headway'leri uyumla ya da çakışan treni beklet.`)
      : `Kavşak(lar) faz ötelemesiyle çakışmasız kurulabilir — en sıkı: ${enSiki!.junctionAd} (öteleme ${enSiki!.enIyiOfsetSn} s → ayrım ${Math.round(enSiki!.baglayan!.enIyiAralik)} s ≥ min ${enSiki!.minHeadway} s).`;

  // Bilgi amaçlı pencere (en sıkı çiftin penceresi mertebesinde) — rapora not düşmek için.
  const pencereSn = kavsaklar.length ? 3600 : 0;
  return { kavsaklar, aktif: true, cakismaVar, pencereSn, ozet };
}
