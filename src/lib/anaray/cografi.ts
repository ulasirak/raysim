// raysim — COĞRAFİ / ÖLÇEKLİ AĞ GEOMETRİSİ (Büyük sıçrama D).
// SAF (yan-etkisiz): hattı 2B düzleme yansıtır. İki kip, veriye göre otomatik:
//   • KOORDİNATLI: istasyonların gerçek lat/lon'u varsa (GTFS içe aktarımı) —
//     equirectangular projeksiyonla gerçek harita düzlemine oturur (kuzey yukarı).
//     İstasyonlar arası iz, istasyon noktalarını birleştiren doğru parçalarıdır
//     (ara CAD geometrisi kalıcı OLMADIĞINDAN — dürüst istasyon-graf geometrisi).
//   • ÖLÇEKLİ (koordinatsız): gerçek uzunluk oranlı düz plan — istasyonlar
//     kilometrajlarına (position) orantılı yerleşir. Koordinat UYDURULMAZ.
// konum(chain) her iki kipte de kilometraj → 2B nokta verir (tren/sinyal/blok yerleşimi).

import type { Line, Station } from "@/lib/anaray/types";

export interface GeoNokta {
  x: number;
  y: number;
}

export interface CografiGeometri {
  /** Gerçek koordinat kullanıldı mı (aksi halde ölçekli plan). */
  coordluMu: boolean;
  /** SVG viewBox boyutu. */
  vb: { w: number; h: number };
  /** İstasyonlar ekran noktalarıyla (çizim + etiket). */
  istasyonlar: { ad: string; nokta: GeoNokta; pos: number; depot?: boolean; tip?: Station["tip"] }[];
  /** İz poligonu (istasyon noktaları sırayla) — track çizimi. */
  yol: GeoNokta[];
  /** Kilometraj (m, 0..length) → 2B nokta. */
  konum: (chain: number) => GeoNokta;
  /** Kilometrajdaki birim dik normal (çift-şerit ofseti + etiket yerleşimi). */
  normal: (chain: number) => GeoNokta;
  /** Gerçek-koordinat kipinde bir lat/lon'u AYNI projeksiyonla 2B'ye taşır (gerçek
   *  track geometrisi backdrop'u için). Ölçekli plan kipinde undefined. */
  projekteEt?: (lat: number, lon: number) => GeoNokta;
}

const PAD = 46;

function lerp(a: GeoNokta, b: GeoNokta, f: number): GeoNokta {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * Hattı 2B düzleme yansıt. `koordinat` verilir ve TÜM istasyonlarda karşılığı varsa
 * gerçek-koordinat kipi; aksi halde ölçekli plan kipi. w = hedef viewBox genişliği.
 */
export function cografiGeometri(
  line: Line,
  koordinat?: Record<string, { lat: number; lon: number }>,
  w = 900,
): CografiGeometri {
  const st = line.stations;
  const n = st.length;
  const uz = Math.max(1, line.length);

  // Koordinat kipi: EN AZ 2 istasyonun geçerli lat/lon'u varsa (KISMI de olur). Eksik
  // koordinatlı istasyonlar kilometrajlarına göre komşu koordinatlılar arasına konur →
  // yarım koordinatlı hat da GERÇEK harita gösterir (eksikler yaklaşık, koordinatlılar tam).
  const koordlu = st.map((s) => {
    const k = koordinat?.[s.name];
    return k && Number.isFinite(k.lat) && Number.isFinite(k.lon) ? { lat: k.lat, lon: k.lon } : null;
  });
  const koordSay = koordlu.filter((k): k is { lat: number; lon: number } => !!k).length;
  const koordVar = koordSay >= 2;

  let noktalar: GeoNokta[];
  let h: number;
  let projekteEt: ((lat: number, lon: number) => GeoNokta) | undefined;

  if (koordVar) {
    // Equirectangular projeksiyon YALNIZ koordinatlı istasyonların bbox'undan kurulur.
    const kl = koordlu.filter((k): k is { lat: number; lon: number } => !!k);
    const ortLat = (kl.reduce((a, b) => a + b.lat, 0) / kl.length) * (Math.PI / 180);
    const kx = Math.cos(ortLat) || 1;
    const xs = kl.map((k) => k.lon * kx), ys = kl.map((k) => k.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX || 1e-6, spanY = maxY - minY || 1e-6;
    const oran = spanY / spanX;
    h = Math.min(620, Math.max(200, (w - 2 * PAD) * oran + 2 * PAD));
    const olcek = Math.min((w - 2 * PAD) / spanX, (h - 2 * PAD) / spanY);
    const offX = PAD + ((w - 2 * PAD) - spanX * olcek) / 2;
    const offY = PAD + ((h - 2 * PAD) - spanY * olcek) / 2;
    projekteEt = (lat: number, lon: number) => ({ x: offX + (lon * kx - minX) * olcek, y: offY + (maxY - lat) * olcek });
    void minY;
    // Koordinatlıları projekte et; eksikleri kilometraja göre komşular arası enterpolasyon.
    const proj = koordlu.map((k) => (k ? projekteEt!(k.lat, k.lon) : null));
    noktalar = proj.map((p, i) => {
      if (p) return p;
      let j = i - 1; while (j >= 0 && !proj[j]) j--;
      let kk = i + 1; while (kk < n && !proj[kk]) kk++;
      const pj = j >= 0 ? proj[j] : null, pk = kk < n ? proj[kk] : null;
      if (pj && pk) {
        const d = st[kk].position - st[j].position || 1;
        const f = Math.max(0, Math.min(1, (st[i].position - st[j].position) / d));
        return lerp(pj, pk, f);
      }
      return (pj || pk)!; // uçtaki eksik → en yakın koordinatlıya yasla
    });
  } else {
    // Ölçekli plan: düz yatay, x = kilometraja orantılı.
    h = 150;
    const y = h / 2;
    noktalar = st.map((s) => ({ x: PAD + (Math.max(0, Math.min(uz, s.position)) / uz) * (w - 2 * PAD), y }));
  }

  const istasyonlar = st.map((s, i) => ({ ad: s.name, nokta: noktalar[i], pos: s.position, depot: s.depot, tip: s.tip }));

  // Kilometraj → nokta: istasyon aralığında doğrusal enterpolasyon (position'a göre).
  const konum = (chain: number): GeoNokta => {
    const c = Math.max(0, Math.min(uz, chain));
    if (n === 1) return noktalar[0];
    for (let i = 0; i < n - 1; i++) {
      const p0 = st[i].position, p1 = st[i + 1].position;
      if (c <= p1 || i === n - 2) {
        const d = p1 - p0 || 1;
        return lerp(noktalar[i], noktalar[i + 1], Math.max(0, Math.min(1, (c - p0) / d)));
      }
    }
    return noktalar[n - 1];
  };

  const normal = (chain: number): GeoNokta => {
    const c = Math.max(0, Math.min(uz, chain));
    let i = 0;
    for (; i < n - 2; i++) if (c <= st[i + 1].position) break;
    const a = noktalar[Math.min(i, n - 2)], b = noktalar[Math.min(i + 1, n - 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    return { x: -dy / L, y: dx / L }; // 90° dik, birim
  };

  return { coordluMu: koordVar, vb: { w, h }, istasyonlar, yol: noktalar, konum, normal, projekteEt };
}
