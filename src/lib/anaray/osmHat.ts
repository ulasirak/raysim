// raysim — OSM'DEN HAT KUR çekirdeği (saf TS; UI'dan bağımsız, test edilebilir).
//
// Bir OSM tram / hafif-raylı `route` relation'ından (ya da BİRKAÇININ birleşiminden)
// RaySim ring zinciri kurar. Backend (/api/geometri/osm/rota, mod "hat") her rota için
// SIRALI durakları (relation member role="stop" düğümleri, yolcu sırası) + rota
// geometrisini (way üyeleri) verir. Burada:
//   ① Çok rota seçildiyse ortak uç durağından STITCH (birleştir) — yön otomatik.
//   ② Haversine ile durak-arası GERÇEK mesafe → DurakArasiRing[] (Konya "Mevcut" ile
//      aynı yöntem: OSM istasyon koordinatından kuş-uçuşu).
//   ③ Rota geometrisinden yatay KAVİSLER (kurp) otomatik çıkarılır (yarıçaptan hız).
// Çıktı GTFS içe-aktarma (gtfsHatKur) ile AYNI şekle yakınsar → HatIceAktar aynı uygulama
// yolunu (rings + koord + geometri) kullanır. Makas/sinyal OSM'de yok → boş; Ringler'de eklenir.

import { yeniRing, yeniKurp, kurpHizi, type DurakArasiRing } from "./ring";
import { kurplariBul } from "./kurpBul";

export interface OsmDurak { ad: string; lat: number; lon: number }
/** Backend'in her rota (relation) için döndürdüğü segment. */
export interface OsmSegment { ad: string; duraklar: OsmDurak[]; geometri: [number, number][] }

export interface OsmHatSonuc {
  rings: DurakArasiRing[];
  ad: string;
  durakSayisi: number;
  toplamKm: number;
  uyarilar: string[];
  duraklar: OsmDurak[];                 // sıralı, koordinatlı (istasyonKoordinat + GTFS export için)
  geometri: [number, number][];         // birleşik, sadeleştirilmiş polyline (harita)
  yol: { x: number; y: number }[];       // önizleme (planar projeksiyon)
  onizleme: { ad: string; km: number; x: number; y: number }[];
}

const R_EARTH = 6371000;
function haversine(a: OsmDurak | { lat: number; lon: number }, b: OsmDurak | { lat: number; lon: number }): number {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return NaN;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

const norm = (s: string) => s.trim().toLocaleLowerCase("tr");

/** İki durak "aynı" mı? (ad eşit ya da ~120 m'den yakın — ortak kavşak/uç durağı). */
function ayniDurak(a: OsmDurak, b: OsmDurak): boolean {
  if (norm(a.ad) && norm(a.ad) === norm(b.ad)) return true;
  const d = haversine(a, b);
  return Number.isFinite(d) && d < 120;
}

const BAGLANTI_ESIK = 1600; // m — iki segment ucu bundan uzaksa birleştirilmez (kopuk)

/**
 * Segmentleri tek sıralı durak dizisine STITCH eder (greedy): her adımda kalan
 * segmentlerden, mevcut hattın bir UCUNA (baş/son) en yakın ucu olanı, gereğinde ters
 * çevirerek ekler; ortak uç durağı (ad eşit ya da <120 m) bir kez sayılır. Bağlantı
 * eşiği aşılırsa segment atlanır (uyarı). Tek segment → aynen döner.
 */
function stitch(segmentler: OsmSegment[]): { duraklar: OsmDurak[]; geometri: [number, number][]; uyarilar: string[] } {
  const uyarilar: string[] = [];
  const gecerli = segmentler.filter((s) => s.duraklar.length >= 2);
  if (gecerli.length === 0) return { duraklar: [], geometri: [], uyarilar: ["Yeterli durak yok."] };
  let hat = gecerli[0].duraklar.slice();
  let geo = gecerli[0].geometri.slice();
  const kalan = gecerli.slice(1);

  while (kalan.length) {
    let enIyi = -1, enIyiMesafe = Infinity;
    let ekle: { dur: OsmDurak[]; g: [number, number][]; onEk: boolean } | null = null;
    for (let i = 0; i < kalan.length; i++) {
      const seg = kalan[i];
      const bas = hat[0], son = hat[hat.length - 1];
      const sBas = seg.duraklar[0], sSon = seg.duraklar[seg.duraklar.length - 1];
      // 4 seçenek: (hat sonu ↔ seg başı/sonu) ve (hat başı ↔ seg başı/sonu)
      const secenekler: { m: number; onEk: boolean; ters: boolean }[] = [
        { m: haversine(son, sBas), onEk: false, ters: false }, // son→seg (ileri)
        { m: haversine(son, sSon), onEk: false, ters: true },  // son→seg (ters)
        { m: haversine(bas, sSon), onEk: true, ters: false },  // seg(ileri)→baş
        { m: haversine(bas, sBas), onEk: true, ters: true },   // seg(ters)→baş
      ];
      for (const sec of secenekler) {
        if (Number.isFinite(sec.m) && sec.m < enIyiMesafe) {
          enIyiMesafe = sec.m; enIyi = i;
          const dur = sec.ters ? seg.duraklar.slice().reverse() : seg.duraklar.slice();
          const g = sec.ters ? seg.geometri.slice().reverse() : seg.geometri.slice();
          ekle = { dur, g, onEk: sec.onEk };
        }
      }
    }
    if (enIyi < 0 || !ekle || enIyiMesafe > BAGLANTI_ESIK) {
      uyarilar.push(`${kalan.length} rota mevcut hatta bağlanamadı (uçlar ${Math.round(enIyiMesafe)} m uzak) — ayrı kaldı.`);
      break;
    }
    const { dur, g, onEk } = ekle;
    if (onEk) {
      // seg → hattın BAŞINA: dur[...], sonundaki durak hat[0] ile aynıysa at
      const kesisAyni = ayniDurak(dur[dur.length - 1], hat[0]);
      hat = [...dur.slice(0, kesisAyni ? -1 : undefined), ...hat];
      geo = [...g, ...geo];
    } else {
      // seg → hattın SONUNA: başındaki durak hat[son] ile aynıysa at
      const kesisAyni = ayniDurak(dur[0], hat[hat.length - 1]);
      hat = [...hat, ...dur.slice(kesisAyni ? 1 : 0)];
      geo = [...geo, ...g];
    }
    kalan.splice(enIyi, 1);
  }
  return { duraklar: hat, geometri: geo, uyarilar };
}

// Bir polyline boyunca kümülatif mesafe (m) + bir noktaya en yakın köşe indeksi.
function kumulatif(pts: { lat: number; lon: number }[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + (haversine(pts[i - 1], pts[i]) || 0));
  return cum;
}
function enYakinIdx(pts: { lat: number; lon: number }[], p: OsmDurak): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) { const d = haversine(pts[i], p); if (Number.isFinite(d) && d < bd) { bd = d; bi = i; } }
  return bi;
}

/**
 * Segment(ler)den RaySim hattını kurar. `hatAd` boşsa segment adlarından türetilir.
 * Tek segment → o rotanın hattı; çok segment → stitch ile birleşik hat.
 */
export function osmHatKur(segmentler: OsmSegment[], hatAd?: string): OsmHatSonuc {
  const { duraklar: dizi, geometri: geoLL, uyarilar } = stitch(segmentler);
  if (dizi.length < 2) throw new Error("Hat için en az 2 durak gerekli (OSM rotasında sıralı durak bulunamadı).");

  // Ardışık AYNI durağı sıkıştır (ad eşit + <120 m).
  const duraklar: OsmDurak[] = [dizi[0]];
  for (let i = 1; i < dizi.length; i++) if (!ayniDurak(dizi[i], duraklar[duraklar.length - 1])) duraklar.push(dizi[i]);

  const geometriVar = geoLL.length >= 2;
  const geoPts = geoLL.map(([lat, lon]) => ({ lat, lon }));
  // Durakların GEOMETRİ boyunca kümülatif km'si (kavis→ring eşlemesi için); monoton değilse kullanma.
  let stopGeoKm: number[] | null = null;
  if (geometriVar) {
    const cum = kumulatif(geoPts);
    const km = duraklar.map((d) => cum[enYakinIdx(geoPts, d)]);
    if (km.every(Number.isFinite) && km.every((v, i) => i === 0 || v >= km[i - 1] - 1)) stopGeoKm = km;
  }

  // Ring zinciri — durak-arası mesafe HAVERSINE (kuş-uçuşu, Konya "Mevcut" yöntemi).
  const rings: DurakArasiRing[] = [];
  let toplam = 0;
  for (let i = 0; i < duraklar.length - 1; i++) {
    let mesafe = haversine(duraklar[i], duraklar[i + 1]);
    if (!Number.isFinite(mesafe) || mesafe < 20) mesafe = 600;
    const uz = Math.round(mesafe);
    toplam += uz;
    const r = yeniRing(duraklar[i].ad || `Durak ${i + 1}`, duraklar[i + 1].ad || `Durak ${i + 2}`);
    r.uzunluk = uz;
    r.worstUzunluk = Math.max(uz, Math.round(uz * 1.15));
    r.bestUzunluk = Math.max(50, Math.round(uz * 0.7));
    r.dwell = 20;
    rings.push(r);
  }

  // Yatay KAVİSLER: geometri varsa projeksiyondan otomatik → ilgili ringe (geometri-km ile eşle).
  let kurpEklenen = 0;
  if (geometriVar && stopGeoKm && geoPts.length >= 3) {
    const d2r = Math.PI / 180, lat0 = geoPts[0].lat * d2r, lon0 = geoPts[0].lon;
    const proj = geoPts.map((pt) => ({ x: (pt.lon - lon0) * d2r * R_EARTH * Math.cos(lat0), y: (pt.lat - geoPts[0].lat) * d2r * R_EARTH }));
    for (const c of kurplariBul(proj)) {
      let ri = -1;
      for (let i = 0; i < rings.length; i++) {
        if (c.kmMerkez >= stopGeoKm[i] - 1e-6 && c.kmMerkez < stopGeoKm[i + 1] + 1e-6) { ri = i; break; }
      }
      if (ri < 0) continue;
      const r = rings[ri];
      const araGeo = Math.max(1, stopGeoKm[ri + 1] - stopGeoKm[ri]);
      const frac = Math.max(0, Math.min(1, (c.kmMerkez - stopGeoKm[ri]) / araGeo));
      const konum = Math.round(frac * r.uzunluk);
      const uz = Math.max(10, Math.min(r.uzunluk, Math.round(c.uzunluk)));
      const kurp = { ...yeniKurp(konum), uzunluk: uz, yaricap: Math.round(c.yaricap) };
      if (kurpHizi(kurp) < r.vmax - 1e-6) { r.kurplar = [...(r.kurplar ?? []), kurp]; kurpEklenen++; }
    }
  }

  const ad = (hatAd && hatAd.trim()) || `${duraklar[0].ad} – ${duraklar[duraklar.length - 1].ad}`;
  const tumUyari = [...uyarilar];
  tumUyari.push("Mesafeler OpenStreetMap istasyon koordinatlarından kuş-uçuşu (haversine) hesaplandı; gerçek ray uzunluğundan bir miktar kısa olabilir — Ringler'de düzeltebilirsiniz.");
  if (kurpEklenen > 0) tumUyari.push(`${kurpEklenen} kavis (kurp) rota geometrisinden otomatik çıkarıldı; hızları yarıçaptan hesaplandı — Ringler'de kontrol edin.`);
  tumUyari.push("Makas, sinyal ve hemzemin geçit bilgisi OSM rotasında bulunmaz → boş bırakıldı; Ringler'de ekleyin.");
  tumUyari.push("© OpenStreetMap katkıcıları · ODbL.");

  // Önizleme (planar projeksiyon) — mini şema için.
  const lat0 = duraklar[0].lat, k = Math.cos((lat0 * Math.PI) / 180);
  const yol = (geometriVar ? geoLL.map(([lat, lon]) => ({ lat, lon })) : duraklar).map((p) => ({ x: p.lon * k, y: p.lat }));
  let km = 0;
  const onizleme = duraklar.map((d, i) => {
    if (i > 0) km += haversine(duraklar[i - 1], d) || 0;
    return { ad: d.ad, km: Math.round(km), x: d.lon * k, y: d.lat };
  });

  // Harita geometrisi: birleşik polyline (zaten backend'de sadeleştirilmiş).
  const geometri: [number, number][] = geometriVar ? geoLL : duraklar.map((d) => [d.lat, d.lon]);

  return { rings, ad, durakSayisi: duraklar.length, toplamKm: toplam / 1000, uyarilar: tumUyari, duraklar, geometri, yol, onizleme };
}
