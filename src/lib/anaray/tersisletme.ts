// raysim — TERS İŞLETME ANALİZİ (kısa dönüş / makas varyasyonları / talep-dönüş / filo).
//
// Bütün tramvaylar TEK depodan çıkar; bazıları ilk makastan karşı şeride geçip ters
// yönde işe başlar, bazıları kendi yönünden çıkar. Her makas bölgesi bir kısa-dönüş
// (turnback) noktasıdır. Bu modül:
//   1) İstasyon rolünden yolcu TALEP profilini (OD-lite) kurar → hat-boyu yük eğrisi.
//   2) Her makas bölgesi için ters işletme VARYASYONLARINI + kısa-dönüş gerekliliğini
//      yorumlar (süreler değişmeden, yolcu yoğunluğuna karşı).
//   3) Hangi durakların yolcu birikimine göre DÖNÜŞE ihtiyaç duyacağını söyler.
//   4) Pik talebi tıkanmadan karşılamak için gereken FİLOYU önerir (arttır/azalt/yeterli),
//      kısa-dönüş tasarrufunu da hesaba katar.
//
// Talep girilmemişse istasyon rolünden (aktarma/hastane/stadyum/merkez…) tahmin edilir;
// ring'e gerçek iniş/biniş (inenYolcu/binenYolcu) girilirse otomatik ona döner.

import type { DurakArasiRing } from "./ring";
import { ringDuraklari } from "./ring";
import type { RollingStock } from "./types";
import type { Isletme, SimConfig } from "./config";
import { maksimumTren } from "./kapasite";

export interface DurakTalep {
  ad: string;
  konum: number;         // m — hat başından
  agirlik: number;       // talep ağırlığı (rolden veya override)
  binen: number;         // yolcu/saat (iki yön toplam biniş)
  inen: number;          // yolcu/saat (iki yön toplam iniş)
  yukGidis: number;      // gidiş yönü araç yükü bu duraktan sonra (yolcu/saat)
  yukDonus: number;      // dönüş yönü araç yükü
  tepeYuk: number;       // max(gidiş, dönüş)
  doluluk: number;       // tepeYuk / (mevcut frekans × araç kapasite)
  makasVar: boolean;
  terminal: boolean;
}

export interface MakasTers {
  ad: string;
  konum: number;         // m
  crossover: "s" | "x";
  makasSayisi: number;
  sSayi: number;         // istasyondaki S-makas adedi (karışık tip gösterimi için)
  xSayi: number;         // istasyondaki X-makas adedi
  yuksekYuk: number;     // makasın YOĞUN tarafındaki tepe yük
  dusukYuk: number;      // makasın SESSİZ (uç) tarafındaki tepe yük
  kisaDonusOnerilir: boolean;
  kisaDonusYuzde: number;    // sessiz taraf ne kadar sönükse o kadar tramvay buradan kısa döner
  varyasyonlar: { ad: string; aciklama: string }[];
  sureNotu: string;
  yorum: string;
}

export interface DonusIhtiyaci {
  durak: string;
  doluluk: number;
  segman: string;
  oneriMakas: string;
  sebep: string;
  siddet: "kritik" | "yuksek" | "orta";
}

export interface FiloOnerisi {
  gerekenArac: number;
  mevcutPik: number;
  fark: number;
  oneri: "arttir" | "azalt" | "yeterli" | "kapasiteYetmez";
  aciklama: string;
  kisaDonusTasarruf: number;
  gerekenAracKisaDonusle: number;
}

export interface TersIsletmeRapor {
  duraklar: DurakTalep[];
  makaslar: MakasTers[];
  donusIhtiyaclari: DonusIhtiyaci[];
  filo: FiloOnerisi;
  tepeYuk: number;
  tepeDurak: string;
  mevcutFrekans: number;   // tramvay/saat
  aracKapasite: number;
  cevrimSn: number;
  maksSurdurulebilir: number;
  gercekVeri: boolean;     // talep gerçek iniş/binişten mi (true) yoksa tahmin mi (false)
  depoDagilim: { gidis: number; donus: number; aciklama: string };
}

// ————————————————————————————————————————————————
// İstasyon rolünden talep ağırlığı (şeffaf, ad-tabanlı). 1 = sıradan durak.
// ————————————————————————————————————————————————
export function durakAgirlik(ad: string): number {
  const a = (ad || "").toLocaleLowerCase("tr");
  let w = 1;
  const ek = (re: RegExp, v: number) => { if (re.test(a)) w += v; };
  ek(/hastane|tıp|sağlık/, 4.0);              // hastane — güçlü çekim (tüm gün)
  ek(/stadyum|stad|spor|arena/, 2.5);          // stadyum/spor
  ek(/üniversite|selçuk|kampüs|fakülte|okul|lise/, 3.0); // eğitim
  ek(/otogar|terminal|gar|banliyö|aktarma|transfer/, 3.0); // aktarma/terminal
  ek(/adliye|mahkeme|hükümet|valilik|belediye/, 2.0);      // kamu/idari
  ek(/mevlana|alaad|alaat|meydan|merkez|çarşı|pazar|kültür/, 2.5); // merkez/turizm/ticaret
  ek(/kavşak|köprü/, 1.5);                     // kavşak düğümü
  ek(/sanayi|osb|organize|tümosan|büsan/, 1.5);// sanayi (işe gidiş-geliş)
  ek(/depo|rezerv|park\b/, -0.5);              // depo/rezerv — düşük yolcu
  return Math.max(0.3, w);
}

// Suffix toplamı: Sw[i] = Σ_{k≥i} w[k]
function suffix(w: number[]): number[] {
  const s = new Array(w.length + 1).fill(0);
  for (let i = w.length - 1; i >= 0; i--) s[i] = s[i + 1] + w[i];
  return s;
}

// Tek yönde OD-lite yük profili: origin ağırlığıyla biniş, downstream ağırlığıyla varış.
// L[i] = Σ_{o≤i} board(o) × Sw[i+1]/Sw[o+1]  (i durağından SONRAKİ segment yükü).
// Ayrıca binen[i], inen[i] döner. Toplam biniş = B.
function yonYuk(w: number[], B: number): { yuk: number[]; binen: number[]; inen: number[] } {
  const N = w.length;
  const Sw = suffix(w);
  const Worig = Sw[0] - w[N - 1]; // son durakta biniş yok (ileri gidecek yer yok)
  const board = w.map((wi, i) => (i < N - 1 && Worig > 0 ? B * wi / Worig : 0));
  const yuk = new Array(N).fill(0);
  const inen = new Array(N).fill(0);
  // Kümülatif: her origin o'nun i'yi geçen payı = Sw[i+1]/Sw[o+1]
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let o = 0; o <= i; o++) {
      if (Sw[o + 1] <= 0) continue;
      acc += board[o] * (Sw[i + 1] / Sw[o + 1]);
    }
    yuk[i] = acc;
  }
  // inen[i] = i durağında araçtan inen = yuk[i-1] - yuk[i] + binen[i]
  for (let i = 0; i < N; i++) {
    const oncekiYuk = i > 0 ? yuk[i - 1] : 0;
    inen[i] = Math.max(0, oncekiYuk - yuk[i] + board[i]);
  }
  return { yuk, binen: board, inen };
}

/** Kümülatif araç yükü: her durakta Σbinen − Σinen (birikim), negatif olamaz. */
function kumulatifYuk(binen: number[], inen: number[]): number[] {
  const out = new Array(binen.length).fill(0);
  let acc = 0;
  for (let i = 0; i < binen.length; i++) {
    acc += (binen[i] || 0) - (inen[i] || 0);
    out[i] = Math.max(0, acc);
  }
  return out;
}

/** Ana analiz. mod="toplam": talep rolden tahmin (pikYolcuSaat ölçekli). mod="istasyon":
 *  durak-başı girilen (yoksa tahminle dolu) iniş/binişten KÜMÜLATİF yük. */
export function tersIsletmeAnaliz(
  rings: DurakArasiRing[],
  stock: RollingStock,
  isletme: Isletme,
  cfg: SimConfig,
  mod: "toplam" | "istasyon" = "toplam",
): TersIsletmeRapor | null {
  const duraklar = ringDuraklari(rings);
  const N = duraklar.length;
  if (N < 2) return null;

  const maks = maksimumTren(rings, stock, cfg, isletme);
  const cevrimSn = maks.cevrimSuresi || 1;
  const maksSurdurulebilir = maks.nSurdurulebilir || maks.nTeorik || 1;
  const C = Math.max(1, isletme.aracYolcuKapasite || 220);
  const pikFilo = Math.max(1, isletme.pikFilo || 1);
  const mevcutFrekans = pikFilo * 3600 / cevrimSn; // tramvay/saat
  const dolulukHedefi = Math.min(1, Math.max(0.3, isletme.dolulukHedefi || 0.85));
  const B = Math.max(0, isletme.pikYolcuSaat || 0);

  // Makasları hat-boyu metre konumuna eşle + en yakın durağa ata.
  type MakasM = { ad: string; konum: number; crossover: "s" | "x"; makasSayisi: number; durakIdx: number };
  const makaslarM: MakasM[] = [];
  {
    let off = 0;
    rings.forEach((r) => {
      for (const m of r.makaslar) {
        const konum = off + Math.max(0, Math.min(r.uzunluk, m.konum));
        // en yakın durak
        let bi = 0, bd = Infinity;
        duraklar.forEach((d, i) => { const dd = Math.abs(d.konum - konum); if (dd < bd) { bd = dd; bi = i; } });
        makaslarM.push({ ad: m.ad || duraklar[bi]?.ad || "Makas", konum, crossover: m.crossover ?? "s", makasSayisi: m.makasSayisi ?? 1, durakIdx: bi });
      }
      off += r.uzunluk;
    });
  }
  const makasliDurak = new Set(makaslarM.map((m) => m.durakIdx));

  // Ters işletme sinyali olan durakları belirle (turnback'i güvenli kılan sinyal).
  const tersSinyalDurak = new Set<number>();
  {
    let off = 0;
    rings.forEach((r) => {
      for (const s of r.sinyaller ?? []) {
        if (!s.tersIsletme) continue;
        const konum = off + Math.max(0, Math.min(r.uzunluk, s.konum));
        let bi = 0, bd = Infinity;
        duraklar.forEach((d, i) => { const dd = Math.abs(d.konum - konum); if (dd < bd) { bd = dd; bi = i; } });
        tersSinyalDurak.add(bi);
      }
      off += r.uzunluk;
    });
  }

  // Rol ağırlıkları + OD-lite tahmini (her modda hesaplanır — istasyon modunda
  // girilmemiş durakların VARSAYILANI bu tahmindir).
  const wGidis = duraklar.map((d) => isletme.talepAgirliklari?.[d.ad] ?? durakAgirlik(d.ad));
  const estGidis = yonYuk(wGidis, B);
  const estDonusR = yonYuk([...wGidis].reverse(), B);
  const estDonusYuk = [...estDonusR.yuk].reverse();
  const estDonusBinen = [...estDonusR.binen].reverse();
  const estDonusInen = [...estDonusR.inen].reverse();

  // Kullanılan binen/inen ve iki yön yük profili — moda göre.
  let binenArr: number[], inenArr: number[], yukGidisArr: number[], yukDonusArr: number[];
  const gercekVeri = mod === "istasyon";
  if (mod === "istasyon") {
    // Durak-başı girilen (yoksa tahminle dolu) iniş/biniş → KÜMÜLATİF yük.
    binenArr = duraklar.map((d, i) => isletme.istasyonYolcu?.[d.ad]?.binen ?? Math.round(estGidis.binen[i]));
    inenArr = duraklar.map((d, i) => isletme.istasyonYolcu?.[d.ad]?.inen ?? Math.round(estGidis.inen[i]));
    yukGidisArr = kumulatifYuk(binenArr, inenArr);
    // Dönüş yönü: binen↔inen yer değiştirir (gidişte inen, dönüşte biner), ters sıra.
    yukDonusArr = [...kumulatifYuk([...inenArr].reverse(), [...binenArr].reverse())].reverse();
  } else {
    // Toplam: rol-tahmini OD yükü (iki yön).
    yukGidisArr = estGidis.yuk;
    yukDonusArr = estDonusYuk;
    binenArr = duraklar.map((_, i) => Math.round(estGidis.binen[i] + estDonusBinen[i]));
    inenArr = duraklar.map((_, i) => Math.round(estGidis.inen[i] + estDonusInen[i]));
  }

  const arzKisiSaat = mevcutFrekans * C; // kişi/saat (bir yön)
  const duraklarT: DurakTalep[] = duraklar.map((d, i) => {
    const yukG = yukGidisArr[i];
    const yukD = yukDonusArr[i];
    const tepe = Math.max(yukG, yukD);
    return {
      ad: d.ad, konum: d.konum,
      agirlik: wGidis[i],
      binen: Math.round(binenArr[i]),
      inen: Math.round(inenArr[i]),
      yukGidis: Math.round(yukG), yukDonus: Math.round(yukD),
      tepeYuk: Math.round(tepe),
      doluluk: arzKisiSaat > 0 ? tepe / arzKisiSaat : 0,
      makasVar: makasliDurak.has(i),
      terminal: i === 0 || i === N - 1,
    };
  });

  const tepeIdx = duraklarT.reduce((bi, d, i, arr) => (d.tepeYuk > arr[bi].tepeYuk ? i : bi), 0);
  const tepeYuk = duraklarT[tepeIdx].tepeYuk;
  const tepeDurak = duraklarT[tepeIdx].ad;

  // ————— Makas-başı ters işletme analizi —————
  const makaslar: MakasTers[] = makaslarM
    // her durakta bir kez (aynı duraktaki çoklu makası birleştir: en güçlü crossover)
    .filter((m, i, arr) => arr.findIndex((x) => x.durakIdx === m.durakIdx) === i)
    .filter((m) => m.durakIdx > 0 && m.durakIdx < N - 1) // uç terminaller ayrı (turnback zaten)
    .map((m) => {
      const idx = m.durakIdx;
      const tersSinyalVar = tersSinyalDurak.has(idx);
      // aynı duraktaki tüm makaslar
      const grup = makaslarM.filter((x) => x.durakIdx === idx);
      const xVar = grup.some((x) => x.crossover === "x");
      const solMax = Math.max(...duraklarT.slice(0, idx + 1).map((d) => d.tepeYuk)); // başlangıç tarafı
      const sagMax = Math.max(...duraklarT.slice(idx).map((d) => d.tepeYuk));        // bitiş tarafı
      const yuksek = Math.max(solMax, sagMax);
      const dusuk = Math.min(solMax, sagMax);
      const sessizUc = sagMax <= solMax ? "bitiş" : "başlangıç";
      const oran = yuksek > 0 ? dusuk / yuksek : 1;
      const onerilir = oran < 0.6; // sessiz taraf yoğun tarafın %60'ından azsa kısa dönüş kazançlı
      const kisaDonusYuzde = Math.round(Math.max(0, 1 - oran) * 100);
      const sureNotu = xVar
        ? "X-makas: kısa dönen tramvaylar ardışık ve hızlı çevrilir; makas boğazı yalnızca bir kez işgal edilir."
        : "S-makas: kısa dönüşler sırayla gerçekleşir ve makas boğazını iki kez işgal eder; bu nedenle sık kısa dönüş talebinde kuyruk (bekleme) oluşabilir.";
      return {
        ad: duraklarT[idx].ad, konum: m.konum, crossover: xVar ? "x" as const : "s" as const,
        makasSayisi: grup.reduce((s, x) => s + x.makasSayisi, 0),
        sSayi: grup.filter((x) => x.crossover !== "x").reduce((s, x) => s + x.makasSayisi, 0),
        xSayi: grup.filter((x) => x.crossover === "x").reduce((s, x) => s + x.makasSayisi, 0),
        yuksekYuk: Math.round(yuksek), dusukYuk: Math.round(dusuk),
        kisaDonusOnerilir: onerilir, kisaDonusYuzde,
        varyasyonlar: [
          { ad: "Depo çıkışı — ters yön", aciklama: `Depodan çıkan tramvay bu makastan karşı şeride geçip ${sessizUc === "bitiş" ? "gidiş" : "dönüş"} yönünde işe başlar (tek depodan iki yönü dengeler).` },
          { ad: "Kısa dönüş (turnback)", aciklama: onerilir ? `Düşük talepli ${sessizUc} yakası yoğun taraftan belirgin biçimde daha az yük taşıdığından, tramvayların yaklaşık %${kisaDonusYuzde}'i burada geri dönerek yalnızca yoğun çekirdeği besler; böylece dış yakada boş sefer oluşmaz.` : `İki yaka da benzer yoğunlukta olduğundan kısa dönüş kazancı düşüktür; tam tur işletim daha verimlidir.` },
          { ad: "Yoğunluk atağı", aciklama: `Ani biniş dalgasında (etkinlik/pik) bu makastan ek tramvay verilerek yoğun tarafın aralığı düşürülür; hat süreleri değişmeden sıklık artar.` },
        ],
        sureNotu: sureNotu + (tersSinyalVar
          ? " Bu noktada ters işletme sinyali mevcut olduğundan, karşı yönden gelen tramvayla çakışma önlenir ve dönüş güvenli biçimde gerçekleştirilebilir."
          : (onerilir ? " Kısa dönüşün bu noktada güvenle uygulanabilmesi için, gidiş yönünün tersine bir ters işletme sinyali tesis edilmesi gerekmektedir; mevcut tasarımda bu sinyal bulunmamaktadır." : "")),
        yorum: onerilir
          ? `Bu istasyon, kısa dönüş (turnback) için bir aday noktadır: makasın ayırdığı iki yakadan biri diğerinden belirgin biçimde daha yoğun olduğundan, tramvayların bir bölümünü burada geri döndürmek düşük talepli yakaya boş tramvay gönderilmesini önler.`
          : `Bu kesimde makasın iki yakası benzer yoğunlukta olduğundan kısa dönüşe gerek yoktur; tam tur işletim daha verimlidir.`,
      };
    });

  // ————— Hangi duraklar dönüşe ihtiyaç duyar (tıkanma) —————
  const donusIhtiyaclari: DonusIhtiyaci[] = [];
  duraklarT.forEach((d, i) => {
    if (d.doluluk > dolulukHedefi) {
      // en yakın YUKARI (merkeze/depoya doğru) makas
      let oneri = "—";
      for (const m of makaslarM.filter((x) => x.durakIdx <= i).sort((a, b) => b.durakIdx - a.durakIdx)) {
        oneri = duraklarT[m.durakIdx].ad; break;
      }
      if (oneri === "—") for (const m of makaslarM.sort((a, b) => Math.abs(a.durakIdx - i) - Math.abs(b.durakIdx - i))) { oneri = duraklarT[m.durakIdx].ad; break; }
      const sd = d.doluluk > 1.15 ? "kritik" as const : d.doluluk > 1.0 ? "yuksek" as const : "orta" as const;
      donusIhtiyaclari.push({
        durak: d.ad, doluluk: d.doluluk,
        segman: `${duraklarT[Math.max(0, i - 1)].ad} – ${d.ad}`,
        oneriMakas: oneri,
        sebep: `Tepe yük ${d.tepeYuk} yolcu/saat, arz ${Math.round(arzKisiSaat)} kişi/saat → doluluk %${Math.round(d.doluluk * 100)} (hedef %${Math.round(dolulukHedefi * 100)}).`,
        siddet: sd,
      });
    }
  });
  donusIhtiyaclari.sort((a, b) => b.doluluk - a.doluluk);

  // ————— Filo önerisi (pik talebi tıkanmadan) —————
  const gerekenFrekans = tepeYuk / (C * dolulukHedefi); // tramvay/saat
  const gerekenArac = Math.max(1, Math.ceil(gerekenFrekans * cevrimSn / 3600));
  // Kısa dönüş tasarrufu: en iyi kısa-dönüş makası dış kolu sönükse, dış kola daha az tramvay.
  let tasarruf = 0;
  const enIyi = makaslar.filter((m) => m.kisaDonusOnerilir).sort((a, b) => b.kisaDonusYuzde - a.kisaDonusYuzde)[0];
  if (enIyi) {
    // dış kolun tam tura oranı × sönüklük × gereken araç ≈ tasarruf
    tasarruf = Math.floor(gerekenArac * (enIyi.kisaDonusYuzde / 100) * 0.5);
  }
  const gerekenKisaDonusle = Math.max(1, gerekenArac - tasarruf);

  let oneri: FiloOnerisi["oneri"];
  let aciklama: string;
  if (gerekenArac > maksSurdurulebilir) {
    oneri = "kapasiteYetmez";
    aciklama = `Pik talep için ${gerekenArac} araç gerekiyor; hattın sürdürülebilir tavanı ise ${maksSurdurulebilir} tramvay. Tek başına araç eklemek yeterli değildir; yoğun çekirdeği sıklaştıran kısa dönüş ile blok/terminal altyapı iyileştirmesi birlikte gereklidir.`;
  } else if (gerekenArac > pikFilo) {
    oneri = "arttir";
    aciklama = `Pik talebi (%${Math.round(dolulukHedefi * 100)} doluluk) karşılamak için ${gerekenArac} araç gerekiyor; mevcut filo ${pikFilo}. Pik saatte hatta ${gerekenArac - pikFilo} araç daha çıkarılmalıdır${tasarruf > 0 ? ` (kısa dönüşle ${gerekenKisaDonusle} araca inebilir)` : ""}.`;
  } else if (gerekenArac < pikFilo) {
    oneri = "azalt";
    aciklama = `Talep mevcut ${pikFilo} araca göre düşük; ${gerekenArac} araç %${Math.round(dolulukHedefi * 100)} dolulukla yeterlidir. Pik filodan ${pikFilo - gerekenArac} araç çekilip depoda tutulabilir (enerji/işletme tasarrufu).`;
  } else {
    oneri = "yeterli";
    aciklama = `Mevcut pik filo (${pikFilo}) pik talebi %${Math.round(dolulukHedefi * 100)} dolulukla tam karşılıyor; ekleme veya çıkarma gerekmiyor.`;
  }

  // ————— Depo dağılımı (tek depodan iki yön) —————
  const depoGidis = Math.ceil(pikFilo / 2);
  const depoDonus = pikFilo - depoGidis;

  return {
    duraklar: duraklarT, makaslar, donusIhtiyaclari,
    filo: { gerekenArac, mevcutPik: pikFilo, fark: gerekenArac - pikFilo, oneri, aciklama, kisaDonusTasarruf: tasarruf, gerekenAracKisaDonusle: gerekenKisaDonusle },
    tepeYuk, tepeDurak, mevcutFrekans, aracKapasite: C, cevrimSn, maksSurdurulebilir, gercekVeri,
    depoDagilim: {
      gidis: depoGidis, donus: depoDonus,
      aciklama: `Servis başında ${pikFilo} tramvay tek depodan çıkar: yaklaşık ${depoGidis} tanesi kendi yönünde (gidiş), ${depoDonus} tanesi ilk makastan karşı şeride geçip ters (dönüş) yönde işe başlar; böylece iki yön eşzamanlı dolar.`,
    },
  };
}
