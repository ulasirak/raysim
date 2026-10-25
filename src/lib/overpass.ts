// raysim — OVERPASS ÇOK-AYNA YARIŞTIRICI (OSM sorguları için dayanıklı sunucu istemcisi).
//
// Public Overpass instance'ları sık sık yavaşlar, 406/504 döner ya da tamamen düşer.
// Aynaları TEK TEK sırayla (her birine 18-45 s) denemek, baştaki büyük sunucu takılınca
// sağlıklı aynaya ulaşmadan tüm işlemi ~40 s bekletip başarısız kılıyordu (ve 4×18 s
// Vercel'in fonksiyon bütçesini de aşabiliyordu).
//
// Bunun yerine TÜM aynalar PARALEL yarıştırılır (Promise.any): ilk GEÇERLİ JSON kazanır,
// kalan (yavaş/çöken) istekler anında iptal edilir. Böylece bir aynanın çökmesi işlemi
// bloklamaz; gecikme = en hızlı sağlıklı aynanın süresi (~2-4 s). © OSM · ODbL.

// Sağlık bakımı: ayna listesi zaman zaman gözden geçirilmeli (public instance'lar gelir-gider).
// Hem sunucu (overpassSorgu) hem istemci fallback (overpassIstemci.ts) aynı listeyi kullanır.
export const OVERPASS_AYNALAR = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const UA = "raysim/1.0 (https://raysim.vercel.app; raysim OSM hat içe aktarma)";

// SAĞLIK KAPISI: bazı aynalar BOZUK/BOŞ bir DB servis eder — hızlı ama boş cevap verip
// yarışı yanlışlıkla kazanır ("rota yok" gibi görünür). Geçerli bir Overpass yanıtı taze bir
// `timestamp_osm_base` (ISO, <30 gün) taşır; aksi halde o aynayı elenmiş say. Bu, bozuk-boş
// ile gerçekten-boş'u ayırır ve ayna listesini kendi kendine temizler. Sunucu+istemci ortak.
export function overpassTaze(veri: unknown): boolean {
  const ts = (veri as { osm3s?: { timestamp_osm_base?: string } } | null)?.osm3s?.timestamp_osm_base;
  return typeof ts === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ts) && Date.now() - Date.parse(ts) < 30 * 864e5;
}

/**
 * Overpass QL sorgusunu tüm aynalarda paralel çalıştırır; ilk geçerli JSON yanıtı döndürür.
 * Hepsi başarısızsa (406/504/zaman aşımı/erişilemez) hata fırlatır.
 * @param aynaBasiMs her aynaya tanınan süre (ağır `out geom` sorguları için daha uzun ver).
 */
export async function overpassSorgu<T = { elements: unknown[] }>(q: string, aynaBasiMs = 25000): Promise<T> {
  const ust = new AbortController(); // kazanan belli olunca kaybedenleri iptal eder
  const dene = async (url: string): Promise<T> => {
    const ctrl = new AbortController();
    const ilet = () => ctrl.abort();
    ust.signal.addEventListener("abort", ilet);
    const zaman = setTimeout(() => ctrl.abort(), aynaBasiMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Accept: "application/json" },
        body: "data=" + encodeURIComponent(q),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const veri = (await r.json()) as T;
      if (!overpassTaze(veri)) throw new Error("ayna bayat/bozuk veri");
      return veri;
    } finally {
      clearTimeout(zaman);
      ust.signal.removeEventListener("abort", ilet);
    }
  };
  try {
    return await Promise.any(OVERPASS_AYNALAR.map(dene));
  } catch {
    throw new Error("Overpass aynalarının hiçbiri yanıt vermedi");
  } finally {
    ust.abort(); // hâlâ bekleyen (yavaş) aynaları iptal et
  }
}
