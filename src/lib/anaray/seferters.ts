// raysim — SEFER (TARİFE) ↔ TERS İŞLETME ENTEGRE ALGORİTMASI.
//
// Amaç: verilen SEFER ARALIĞINDA (headway) o dakikada seferdeki araçların GERÇEK
// konumlarını (loop yörüngesinden — hız kısıtları, makas/sinyal/geçit yavaşlamaları,
// duruşlar DÂHİL) bulmak; girilen yolcu talebine göre yük dengesizliği olan makas
// bölgelerinde KISA DÖNÜŞ (ters işletme) yapılabilecek makasa YAKLAŞAN aracı bulup dönüş
// kararını O ARACA bağlamak; kazancı ve gerekçesiyle öneri üretmek.
//
// Konumlar canlı sim / kapasite ile AYNI loopYorunge'den gelir → tüm yavaşlatıcı etkiler
// (sinyal lambaları, karayolu/yaya geçitleri, makas geçiş hızı, eğim, dwell) hesaba katılıdır.

import type { DurakArasiRing } from "./ring";
import type { RollingStock, Line } from "./types";
import type { SimConfig, Isletme } from "./config";
import { loopToHat } from "./hatsim";
import { loopYorunge, type LoopYorunge } from "./signalling";
import { tersIsletmeAnaliz } from "./tersisletme";

export interface AracKonum {
  no: number;          // araç no (1..filo)
  km: number;          // hat başından konum (km)
  gidis: boolean;      // gidiş yönünde mi
  durum: string;       // o an ne yaşadığı (seyir/duruş/hızlanma/dönüş/kısıt)
}

export interface DonusOneri {
  makasAd: string;
  makasKm: number;
  crossover: "s" | "x";
  aracNo: number;         // dönüş kararı bağlanan araç
  aracKm: number;         // aracın mevcut konumu
  ulasimSn: number;       // aracın makasa GERÇEK ulaşma süresi (yörüngeden — yavaşlamalar dâhil)
  yuksekYuk: number;      // makasın yoğun tarafındaki tepe yük (yolcu/sa)
  dusukYuk: number;       // makasın sessiz (uç) tarafındaki tepe yük
  oran: number;           // yuksek/dusuk
  kazancSn: number;       // kısa dönüşün yoğun tarafta yaklaşık kazandırdığı ek sıklık (headway payı)
  gerekce: string;
}

// Filo yeterlilik durumu: talep arttıkça ters işletme (kısa dönüş) tek başına yetmeyebilir →
// tramvay ekleme ihtiyacı doğar; altyapı tavanı aşılırsa ekleme de yetmez.
export type FiloDurum = "dengeli" | "tersYeter" | "ekle" | "altyapi";
export interface FiloIhtiyac {
  durum: FiloDurum;
  problem: boolean;            // ekle | altyapi → rapora tramvay ekletme isteği düşer
  serviste: number;           // seçilen aralıkta serviste araç (headway'den)
  gereken: number;            // talep+doluluk hedefi için gereken (ham)
  gerekenKisaDonusle: number; // kısa dönüş (ters işletme) uygulanınca gereken
  eklenecek: number;          // önerilen eklenecek tramvay (üniform servis → hedefe iner)
  eklenecekKisaDonusle: number; // kısa dönüş (ters işletme) uygulanınca eklenecek tramvay
  kisaDonusZorunlu: boolean;  // üniform ekleme tavanı aşar → kısa dönüş zorunlu
  yeniServiste: number;       // ekleme sonrası serviste araç
  yeniHeadwaySn: number;      // ekleme sonrası ulaşılan aralık (s)
  surdurulebilirTavan: number;// UIC 406 sürdürülebilir tavan (araç)
  acikAdet: number;           // altyapı durumunda karşılanamayan araç (gereken − tavan)
  tepeDoluluk: number;        // serviste filoyla en yoğun kesim doluluğu (0..)
  yeniDoluluk: number;        // ekleme sonrası en yoğun kesim doluluğu
  hedefDoluluk: number;
  tepeYuk: number;            // pik yönlü yük (yolcu/sa) — duraklardan
  tepeDurak: string;
  aracKapasite: number;       // araç yolcu kapasitesi (C)
  mesaj: string;              // algoritmik gerekçe + öneri (kullanıcıya)
}

export interface SeferTersSonuc {
  gecerli: boolean;
  headwaySn: number;
  filo: number;
  cevrimSn: number;
  L: number;              // gidiş uzunluğu (m)
  anSn: number;           // snapshot zamanı
  araclar: AracKonum[];
  oneriler: DonusOneri[];
  makaslar: { ad: string; km: number; crossover: "s" | "x"; onerilir: boolean }[]; // diyagram için tüm makas bölgeleri
  filoIhtiyac: FiloIhtiyac | null; // tramvay ekleme ihtiyacı modülü
  bilgi: string[];        // kullanıcıya açıklamalar
}

const DURUM_AD: Record<string, string> = { seyir: "serbest seyir", hizlanma: "hızlanıyor", kisit: "hız kısıtı", dwell: "istasyon duruşu", donus: "terminal dönüşü" };

/** Yörüngede s'nin (kümülatif) hedefe ulaştığı faz (t). gidisMi ise s≤L kolunda arar. */
function fazAtS(orn: LoopYorunge["ornekler"], sHedef: number, L: number, gidisMi: boolean): number {
  let bt = 0, bd = Infinity;
  for (const o of orn) {
    if (gidisMi && o.s > L + 1e-6) continue;
    if (!gidisMi && o.s < L - 1e-6) continue;
    const d = Math.abs(o.s - sHedef);
    if (d < bd) { bd = d; bt = o.t; }
  }
  return bt;
}

/** Faz anındaki kümülatif s (+ o anki durum). */
function ornekle(orn: LoopYorunge["ornekler"], faz: number): { s: number; durum: string } {
  const n = orn.length;
  if (n === 0) return { s: 0, durum: "seyir" };
  if (faz <= orn[0].t) return { s: orn[0].s, durum: orn[0].durum };
  if (faz >= orn[n - 1].t) return { s: orn[n - 1].s, durum: orn[n - 1].durum };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (orn[m].t <= faz) lo = m; else hi = m; }
  const a = orn[lo], b = orn[hi], dt = b.t - a.t || 1;
  return { s: a.s + (b.s - a.s) * ((faz - a.t) / dt), durum: b.durum };
}

/**
 * Entegre analiz. headwaySn = manuel sefer aralığı (s). anSn = konum anlık-görüntü zamanı (s).
 * gercekVeri modunu tersIsletmeAnaliz kendisi seçer (istasyon yolcu girildiyse "istasyon").
 */
export function seferTersEntegre(
  rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig, isletme: Isletme,
  headwaySn: number, anSn = 0,
): SeferTersSonuc {
  const bos: SeferTersSonuc = { gecerli: false, headwaySn, filo: 0, cevrimSn: 0, L: 0, anSn, araclar: [], oneriler: [], makaslar: [], filoIhtiyac: null, bilgi: [] };
  if (rings.length < 2 || headwaySn <= 0) return bos;

  const line: Line = loopToHat(rings, true, cfg).line;
  const rev: Line = {
    ...line, id: line.id + "-rev",
    stations: line.stations.map((s) => ({ ...s, position: line.length - s.position })).reverse(),
    segments: line.segments.map((s) => ({ start: line.length - s.end, end: line.length - s.start, vmax: s.vmax, gradient: -s.gradient })).reverse(),
  };
  const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSon = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopY = loopYorunge(line, rev, stock, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon });
  const { periyot, L, loopLen, ornekler } = loopY;
  if (periyot <= 0 || L <= 0) return bos;

  const filo = Math.max(1, Math.ceil(periyot / headwaySn));
  const offset = periyot / filo; // ulaşılan gerçek aralık (filo tam sayı olduğundan headway'e yakın)
  const an = ((anSn % periyot) + periyot) % periyot;

  // 1) O anda araç konumları (gerçek yörünge → tüm yavaşlamalar dâhil)
  const araclar: AracKonum[] = [];
  for (let k = 0; k < filo; k++) {
    const faz = ((an + k * offset) % periyot + periyot) % periyot;
    const { s, durum } = ornekle(ornekler, faz);
    const gidis = s <= L + 1e-6;
    const fp = gidis ? Math.min(L, s) : Math.max(0, loopLen - s);
    araclar.push({ no: k + 1, km: fp / 1000, gidis, durum: DURUM_AD[durum] || durum });
  }

  // 2) Talep analizi → makas yük dengesizlikleri (kısa dönüş adayları)
  const yolcuVar = !!isletme.istasyonYolcu && Object.keys(isletme.istasyonYolcu).length > 0;
  const tia = tersIsletmeAnaliz(rings, stock, isletme, cfg, yolcuVar ? "istasyon" : "toplam");
  if (!tia) return { gecerli: true, headwaySn, filo, cevrimSn: periyot, L, anSn: an, araclar, oneriler: [], makaslar: [], filoIhtiyac: null, bilgi: ["Talep analizi üretilemedi (yetersiz veri)."] };

  // 3) Her kısa-dönüş adayı makas için: makasa GİDİŞ yönünde en yakın (arkadaki) aracı bul,
  //    dönüş kararını ona bağla; makasa gerçek ulaşma süresini yörüngeden hesapla.
  const oneriler: DonusOneri[] = [];
  const adaylar = tia.makaslar.filter((m) => m.kisaDonusOnerilir).sort((a, b) => b.yuksekYuk / Math.max(1, b.dusukYuk) - a.yuksekYuk / Math.max(1, a.dusukYuk));
  for (const m of adaylar) {
    const K = Math.max(0, Math.min(L, m.konum));
    const fazMakas = fazAtS(ornekler, K, L, true); // makasın gidiş legindeki fazı
    // Bu makasa gidiş yönünde YAKLAŞAN (fp < K) araçlar; en yakını (en büyük fp) seç.
    let enArac = -1, enFp = -Infinity, enUlasim = Infinity;
    for (const a of araclar) {
      if (!a.gidis) continue;
      const fp = a.km * 1000;
      if (fp <= K + 1e-6) {
        // gidiş fazı (fp konumundaki gidiş faz) → makasa dt
        const fazArac = fazAtS(ornekler, fp, L, true);
        const dt = ((fazMakas - fazArac) % periyot + periyot) % periyot;
        if (fp > enFp) { enFp = fp; enArac = a.no; enUlasim = dt; }
      }
    }
    if (enArac < 0) continue; // gidişte yaklaşan araç yok (hepsi geçmiş) → bir sonraki tur arayabilir; şimdilik atla
    const oran = m.yuksekYuk / Math.max(1, m.dusukYuk);
    // Kısa dönüş yoğun kolun sıklığını ~ikiye katlar → o kolda ek aralık payı ≈ offset/2
    const kazancSn = Math.round(offset / 2);
    oneriler.push({
      makasAd: m.ad, makasKm: K / 1000, crossover: m.crossover,
      aracNo: enArac, aracKm: enFp / 1000, ulasimSn: Math.round(enUlasim),
      yuksekYuk: m.yuksekYuk, dusukYuk: m.dusukYuk, oran, kazancSn,
      gerekce: `${enArac} nolu araç şu an ${(enFp / 1000).toFixed(2)} km'de; ${(K / 1000).toFixed(2)} km'deki ${m.ad} makasına gerçek yörüngede ~${saatKisa(enUlasim)} sonra ulaşır. Bu makasın yoğun kolu ${Math.round(m.yuksekYuk)} yolcu/sa taşırken sessiz uç ${Math.round(m.dusukYuk)} taşıyor (${oran.toFixed(1)}×). Aracı burada kısa döndürmek yoğun kolun sıklığını artırır (≈${saatKisa(kazancSn)} daha sık), boş uca sefer harcamaz.`,
    });
  }

  // 4) TRAMVAY EKLEME İHTİYACI: yoğunluk arttıkça ters işletme yetmezse araç ekle.
  //    Doluluk = pik yönlü yük (yolcu/sa, duraklardan) ÷ (serviste frekans × araç kapasitesi).
  //    Serviste frekans = filo × 3600 / çevrim → aralığın ürettiği arz.
  const C = tia.aracKapasite;
  const hedef = Math.min(1, Math.max(0.3, isletme.dolulukHedefi || 0.85));
  const tavan = Math.max(1, tia.maksSurdurulebilir);
  const gereken = tia.filo.gerekenArac;                    // ham (kısa dönüşsüz) gereken
  const gerekenKD = tia.filo.gerekenAracKisaDonusle;       // kısa dönüşle gereken
  const frekansServiste = (filo * 3600) / periyot;         // tramvay/saat
  const arzServiste = Math.max(1, frekansServiste * C);    // kişi/saat kapasite
  const tepeDoluluk = tia.tepeYuk / arzServiste;
  // Üniform servis hedefe iner: yeniServiste = gereken (aynı formül garanti eder). Kısa dönüş
  // yoğun çekirdeğe yönlendirerek eklenecek sayısını azaltır (gerekenKD). Tavan = altyapı sınırı.
  const eklenecekUniform = Math.max(0, Math.min(tavan, gereken) - filo);
  const eklenecekKD = Math.max(0, Math.min(tavan, gerekenKD) - filo);
  let durum: FiloDurum; let eklenecek = 0; let acikAdet = 0; let kisaDonusZorunlu = false;
  if (filo >= gereken) { durum = "dengeli"; }
  else if (filo >= gerekenKD) { durum = "tersYeter"; }               // kısa dönüş tek başına (eklemesiz) yeter
  else if (gereken <= tavan) { durum = "ekle"; eklenecek = eklenecekUniform; } // üniform ekleme hedefe iner
  else if (gerekenKD <= tavan) { durum = "ekle"; eklenecek = eklenecekKD; kisaDonusZorunlu = true; } // üniform tavanı aşar → kısa dönüş zorunlu
  else { durum = "altyapi"; eklenecek = Math.max(0, tavan - filo); acikAdet = gerekenKD - tavan; }
  const yeniServiste = filo + eklenecek;
  const yeniHeadwaySn = yeniServiste > 0 ? periyot / yeniServiste : periyot;
  const yeniDoluluk = tia.tepeYuk / Math.max(1, (yeniServiste * 3600 / periyot) * C);
  const py = (r: number) => `%${Math.round(r * 100)}`;
  const kdNot = eklenecekKD < eklenecekUniform ? ` (${tia.tepeDurak} çekirdeğinde kısa dönüş uygulanırsa ${eklenecekKD} tramvay yeterli)` : "";
  const mesajlar: Record<FiloDurum, string> = {
    dengeli: `Serviste ${filo} tramvay, ${tia.tepeDurak} çekirdeğindeki pik yükü (${Math.round(tia.tepeYuk)} yolcu/sa) hedef dolulukla (${py(hedef)}) karşılıyor — en yoğun kesim ${py(tepeDoluluk)}. Yeni tramvay eklemeye gerek yok.`,
    tersYeter: `Serviste ${filo} tramvayla en yoğun kesim ${py(tepeDoluluk)} doluluğa çıkıyor (hedef ${py(hedef)}). Ancak ${tia.tepeDurak} çekirdeğinde kısa dönüş (ters işletme) uygulanınca mevcut filo yoğun kola yönlendirilerek hedefe iner — yeni tramvay eklemeye gerek yok.`,
    ekle: kisaDonusZorunlu
      ? `Yoğunluk, üniform seferle tavanı (${tavan} tramvay) zorluyor: hedefi kısa dönüşle karşılamak için hatta ${eklenecek} tramvay daha çıkarılmalı (${filo} → ${yeniServiste}; aralık ${saatKisa(headwaySn)} → ${saatKisa(yeniHeadwaySn)}) ve ${tia.tepeDurak} çekirdeğinde kısa dönüş uygulanmalı. Bu ikisi birlikte en yoğun kolu hedefe indirir.`
      : `Yoğunluk arttı: serviste ${filo} tramvayla en yoğun kesim ${py(tepeDoluluk)} doluluğa ulaşıyor (hedef ${py(hedef)}). Ters işletme tek başına yetmiyor — hatta ${eklenecek} tramvay daha çıkarılmalı (${filo} → ${yeniServiste}; aralık ${saatKisa(headwaySn)} → ${saatKisa(yeniHeadwaySn)}). Bununla en yoğun kesim ≈${py(yeniDoluluk)} dolulukla hedefe iner${kdNot}.`,
    altyapi: `Yoğunluk, hattın sürdürülebilir tavanını (${tavan} tramvay) aşıyor: kısa dönüşle bile ${gerekenKD} araç gerekiyor. Yapılabilecek en fazla ${eklenecek} tramvay eklense de ${acikAdet} araçlık açık kalır. Kalıcı çözüm için blok/terminal altyapısının iyileştirilmesi (min. aralığı düşürmek) veya daha yüksek kapasiteli araç gerekir.`,
  };
  const filoIhtiyac: FiloIhtiyac = {
    durum, problem: durum === "ekle" || durum === "altyapi",
    serviste: filo, gereken, gerekenKisaDonusle: gerekenKD,
    eklenecek, eklenecekKisaDonusle: eklenecekKD, kisaDonusZorunlu,
    yeniServiste, yeniHeadwaySn: Math.round(yeniHeadwaySn),
    surdurulebilirTavan: tavan, acikAdet, tepeDoluluk, yeniDoluluk, hedefDoluluk: hedef,
    tepeYuk: tia.tepeYuk, tepeDurak: tia.tepeDurak, aracKapasite: C, mesaj: mesajlar[durum],
  };

  const bilgi: string[] = [];
  bilgi.push(`Sefer aralığı ${saatKisa(headwaySn)} → ${filo} araç serviste; ulaşılan gerçek aralık ${saatKisa(offset)} (çevrim ${saatKisa(periyot)} ÷ ${filo}).`);
  bilgi.push("Araç konumları canlı sim/kapasite ile AYNI yörüngeden gelir: hız kısıtları, makas geçiş hızı, sinyal lambaları, karayolu/yaya geçitleri, eğim ve istasyon duruşları hesaba katılıdır.");
  if (!yolcuVar) bilgi.push("Yolcu sayıları rolden tahmin edildi (istasyon başına iniş-biniş girilmedi). Gerçek sayımlar girilirse öneriler doğrudan ölçüme dayanır.");
  if (oneriler.length === 0) bilgi.push(tia.makaslar.some((m) => m.kisaDonusOnerilir) ? "Kısa dönüş adayı makas(lar) var ancak şu anlık-görüntüde makasa gidiş yönünde yaklaşan araç yok; zaman çubuğunu oynatınca bağlanır." : "Talep dengeli — hiçbir makasta kısa dönüş gerekmiyor (tüm kollar hedef dolulukta).");

  if (filoIhtiyac.problem) bilgi.push(filoIhtiyac.durum === "altyapi"
    ? `Filo yeterliliği: talep sürdürülebilir tavanı aşıyor — ekleme tek başına yetmez (aşağıdaki modüle bakınız).`
    : `Filo yeterliliği: yoğunluk için ${filoIhtiyac.eklenecek} tramvay eklenmesi öneriliyor (aşağıdaki modüle bakınız).`);

  const makaslar = tia.makaslar.map((m) => ({ ad: m.ad, km: Math.max(0, Math.min(L, m.konum)) / 1000, crossover: m.crossover, onerilir: m.kisaDonusOnerilir }));
  return { gecerli: true, headwaySn, filo, cevrimSn: periyot, L, anSn: an, araclar, oneriler, makaslar, filoIhtiyac, bilgi };
}

function saatKisa(sn: number): string {
  const s = Math.max(0, Math.round(sn));
  const d = Math.floor(s / 60), k = s % 60;
  return d > 0 ? `${d}:${String(k).padStart(2, "0")}` : `${k}s`;
}
