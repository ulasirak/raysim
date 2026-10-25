// raysim — OSM İSTEMCİ FALLBACK (tarayıcı tarafı).
//
// Sorun: Vercel'in sunucu (datacenter) IP'si public Overpass tarafından sık sık engellenir
// (406) ya da aynalar o an erişilemez olur → sunucu çekemez. Tarayıcı ise RESIDENTIAL IP'den
// çıkar (datacenter engeli YOK) ve Overpass CORS'u destekler.
//
// `osmFetch(url, govde)` = `fetch` yerine geçen ince sarmalayıcı: ÖNCE sunucu ucunu dener
// (cache + tek-yerde ayrıştırma korunur → HARİTA BORU HATTI DEĞİŞMEZ). Sunucu Overpass'a
// erişemez ama çalıştırılacak sorguyu (`istemciSorgu`) dönerse, tarayıcı o sorguyu kendisi
// çeker ve HAM JSON'u sunucuya AYRIŞTIRILMAK üzere geri yollar; sonuç yine sunucudaki aynı
// ayrıştırmadan geçer → normalleştirilmiş veri birebir aynı. Çağıran, dönen Response'u
// aynen `fetch` gibi kullanır (`await r.json()`, `r.ok`) — çağrı yerlerinde başka değişiklik yok.

import { OVERPASS_AYNALAR, overpassTaze } from "@/lib/overpass";

// Tarayıcıdan paralel yarış. User-Agent AYARLANMAZ (tarayıcı koyar; forbidden header).
// Yalnız CORS-safelisted Content-Type → preflight yok.
async function overpassTarayici(q: string, aynaBasiMs = 25000): Promise<{ elements: unknown[] }> {
  const ust = new AbortController();
  const dene = async (url: string): Promise<{ elements: unknown[] }> => {
    const ctrl = new AbortController();
    const ilet = () => ctrl.abort();
    ust.signal.addEventListener("abort", ilet);
    const zaman = setTimeout(() => ctrl.abort(), aynaBasiMs);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const veri = (await r.json()) as { elements: unknown[] };
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
    ust.abort();
  }
}

type SunucuHata = { istemciSorgu?: string; aynaBasiMs?: number; baglam?: unknown };

/**
 * `fetch` yerine geçen OSM sarmalayıcı. Sunucu Overpass'a erişemez ama `istemciSorgu` dönerse
 * tarayıcıdan çeker ve ham veriyi sunucuya ayrıştırılmak üzere geri yollar. Her durumda, çağıranın
 * `fetch` gibi kullanabileceği (gövdesi okunmamış) bir Response döndürür.
 */
export async function osmFetch(url: string, govde: Record<string, unknown>): Promise<Response> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  if (r.ok) return r;
  // Sunucu hata döndü — istemci sorgusu verdiyse tarayıcıdan dene (gövdeyi klon üzerinden oku).
  let bilgi: SunucuHata | null = null;
  try { bilgi = (await r.clone().json()) as SunucuHata; } catch { return r; }
  if (!bilgi?.istemciSorgu) return r; // fallback yok → özgün hata yanıtını çağıran işler
  let ham: { elements: unknown[] };
  try { ham = await overpassTarayici(bilgi.istemciSorgu, bilgi.aynaBasiMs ?? 25000); }
  catch { return r; } // tarayıcı da erişemedi → özgün sunucu hatasını döndür
  // Ham veriyi sunucuya ayrıştırt (aynı normalleştirme → harita değişmez).
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...govde, hamElemanlar: ham.elements, baglam: bilgi.baglam }) });
}
