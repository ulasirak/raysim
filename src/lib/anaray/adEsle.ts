// raysim — GENEL istasyon-adı eşleştirici (gömülü/şehir-özel DEĞİL).
// Bir hattın durak adını, OSM'den çekilen istasyon listesine (ad→lat/lon) eşler:
// normalize (Türkçe + küçük harf + noktalama at) → tam eşleşme, olmazsa substring
// yedeği (biri diğerini içeriyorsa, ≥5 karakter). Küçük alias yalnız yaygın yazım
// varyantları içindir (CAD "Alaattin" ↔ OSM "Alaaddin" gibi — aynı fiziksel durak).

export interface OsmIst { ad: string; lat: number; lon: number }

function norm(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/i̇/g, "i")
    .replace(/[çğışöü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ş: "s", ö: "o", ü: "u" }[c] || c))
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// Yaygın yazım varyantları (fiziksel olarak aynı durak). Genel; genişletilebilir.
const ALIAS: Record<string, string> = { alaattin: "alaaddin" };

/** OSM istasyon listesinden normalize + substring + alias ile eşleşen koordinatı bul. */
export function adEsleKoordinat(hedefAd: string, osm: OsmIst[]): { lat: number; lon: number } | undefined {
  const idx = new Map<string, { lat: number; lon: number }>();
  for (const o of osm) if (Number.isFinite(o.lat) && Number.isFinite(o.lon)) idx.set(norm(o.ad), { lat: o.lat, lon: o.lon });
  const key = norm(hedefAd);
  if (idx.has(key)) return idx.get(key);
  if (ALIAS[key] && idx.has(ALIAS[key])) return idx.get(ALIAS[key]);
  if (key.length >= 5) {
    for (const [k, v] of idx) if (k.length >= 5 && (k.includes(key) || key.includes(k))) return v;
  }
  return undefined;
}

/** Bir hat için: durak adları → OSM koordinatları (eşleşenler). Tümü eşleşirse tam. */
export function osmKoordinatEsle(durakAdlari: string[], osm: OsmIst[]): Record<string, { lat: number; lon: number }> {
  const out: Record<string, { lat: number; lon: number }> = {};
  for (const ad of durakAdlari) { const c = adEsleKoordinat(ad, osm); if (c) out[ad] = c; }
  return out;
}
