// raysim — CAD/GIS GEOMETRİSİNDEN HAT KURMA (DXF + shapefile ORTAK çekirdeği).
//
// Ham CAD/GIS'te GTFS'teki gibi hazır "sıralı durak" YOK, yalnız geometri var. Bu katman:
//  1) Seçili GÜZERGÂH katmanlarının çizgi/polyline parçalarını uç-uca DİKER → tek sıralı yol.
//  2) Seçili DURAK katmanlarındaki nokta/etiketleri yola İZDÜŞÜRÜP kilometraja göre sıralar.
//  3) Durak-arası mesafeleri yol boyunca ölçüp RaySim ring zincirini kurar (GTFS ile aynı çıktı).
//  4) Okunamayan/eksik yerler + "makas & sinyal elle girilecek" için UYARI notları düşer.
//
// Makas/sinyal ÇIKARILMAZ (karar: kapsam = güzergâh + duraklar); kullanıcı Ringler'de ekler.

import { yeniRing, type DurakArasiRing } from "./ring";

export interface CadNokta { x: number; y: number }
export interface CadPolyline { layer: string; pts: CadNokta[] }
export interface CadPoint { layer: string; x: number; y: number; blok?: string }
export interface CadLabel { layer: string; x: number; y: number; metin: string }

/** DXF/shapefile parse'ının ürettiği ortak ara-biçim. */
export interface CadGeometri {
  polylines: CadPolyline[];
  points: CadPoint[];
  labels: CadLabel[];
  katmanlar: string[];
  birimOlcek: number;   // 1 çizim/harita birimi kaç metre
}

export interface CadEsleme {
  guzergahKatman: string[]; // ray hizası çizgileri
  durakKatman: string[];    // durak işaretleri (nokta ve/veya adlandırılmış etiket)
}

export interface CadHatSonuc {
  rings: DurakArasiRing[];
  ad: string;
  durakSayisi: number;
  toplamKm: number;
  uyarilar: string[];
  // Önizleme için: dikilmiş yol + izdüşen duraklar (şema/harita çizmek için).
  yol: CadNokta[];
  duraklar: { ad: string; km: number; x: number; y: number }[];
}

const mesafe = (a: CadNokta, b: CadNokta) => Math.hypot(a.x - b.x, a.y - b.y);

/** Yolun kümülatif uzunlukları (birim cinsinden). */
function kumulatif(yol: CadNokta[]): number[] {
  const k = [0];
  for (let i = 1; i < yol.length; i++) k.push(k[i - 1] + mesafe(yol[i - 1], yol[i]));
  return k;
}

/**
 * Parçaları uç-uca DİK: en yakın uçları (tol içinde) zincirle → tek sıralı yol.
 * Bir uçta yalnız bir parça bağlıysa orası TERMİNAL; oradan başla. Çatal (>2 parça bir
 * düğümde) varsa yön açısına en yakın olanı seç + uyar.
 */
function dikisAlignment(parcalar: CadNokta[][], tol: number): { yol: CadNokta[]; kullanilan: number; toplam: number; catalVar: boolean } {
  const segs = parcalar.filter((p) => p.length >= 2).map((p) => [...p]);
  if (segs.length === 0) return { yol: [], kullanilan: 0, toplam: 0, catalVar: false };
  if (segs.length === 1) return { yol: segs[0], kullanilan: 1, toplam: 1, catalVar: false };

  const uc = (s: CadNokta[], bas: boolean) => (bas ? s[0] : s[s.length - 1]);
  const yakinMi = (a: CadNokta, b: CadNokta) => mesafe(a, b) <= tol;

  // Her ucun kaç parçaya değdiğini say → terminal (derece 1) bul.
  const uclar: { seg: number; bas: boolean; p: CadNokta }[] = [];
  segs.forEach((s, i) => { uclar.push({ seg: i, bas: true, p: uc(s, true) }); uclar.push({ seg: i, bas: false, p: uc(s, false) }); });
  const derece = (p: CadNokta) => uclar.filter((u) => yakinMi(u.p, p)).length;

  let baslangic = uclar.find((u) => derece(u.p) === 1);
  if (!baslangic) baslangic = uclar[0]; // kapalı çevrim → herhangi bir uç

  const kullanildi = new Array(segs.length).fill(false);
  let yol: CadNokta[] = [];
  // İlk parçayı başlangıç ucu BAŞTA olacak yönde ekle.
  const s0 = [...segs[baslangic.seg]];
  if (!baslangic.bas) s0.reverse();
  yol = s0; kullanildi[baslangic.seg] = true;
  let kullanilan = 1; let catalVar = false;

  // Zinciri ilerlet: yolun son ucundan devam eden parçayı bul.
  for (let adim = 0; adim < segs.length; adim++) {
    const kuyruk = yol[yol.length - 1];
    // Aday parçalar: kuyruğa yakın ucu olan, henüz kullanılmamışlar.
    const adaylar: { i: number; bas: boolean; d: number }[] = [];
    for (let i = 0; i < segs.length; i++) {
      if (kullanildi[i]) continue;
      const db = mesafe(uc(segs[i], true), kuyruk), de = mesafe(uc(segs[i], false), kuyruk);
      if (db <= tol) adaylar.push({ i, bas: true, d: db });
      if (de <= tol) adaylar.push({ i, bas: false, d: de });
    }
    if (adaylar.length === 0) break;
    if (adaylar.length > 1) {
      catalVar = true;
      // Yön sürekliliği: yolun son yönüne en yakın parçayı seç.
      const yon = yolSonYonu(yol);
      adaylar.sort((a, b) => aciFarki(yon, segYonu(segs[a.i], a.bas)) - aciFarki(yon, segYonu(segs[b.i], b.bas)));
    } else {
      adaylar.sort((a, b) => a.d - b.d);
    }
    const sec = adaylar[0];
    const parca = [...segs[sec.i]];
    if (!sec.bas) parca.reverse();
    // İlk noktası kuyrukla çakışıyorsa atla (tekrarı önle).
    yol.push(...(mesafe(parca[0], kuyruk) < tol ? parca.slice(1) : parca));
    kullanildi[sec.i] = true; kullanilan++;
  }
  return { yol, kullanilan, toplam: segs.length, catalVar };
}

function yolSonYonu(yol: CadNokta[]): CadNokta {
  const n = yol.length; const a = yol[Math.max(0, n - 2)], b = yol[n - 1];
  const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; return { x: dx / L, y: dy / L };
}
function segYonu(s: CadNokta[], bas: boolean): CadNokta {
  const a = bas ? s[0] : s[s.length - 1], b = bas ? s[1] : s[s.length - 2];
  const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; return { x: dx / L, y: dy / L };
}
function aciFarki(u: CadNokta, v: CadNokta): number { return 1 - (u.x * v.x + u.y * v.y); } // 0 = aynı yön

/** Bir noktayı yola izdüşür → {km (kümülatif uzunluk), sapma (yola dik uzaklık)}. */
function izdusum(yol: CadNokta[], kum: number[], p: CadNokta): { km: number; sapma: number } {
  let enKm = 0, enSapma = Infinity;
  for (let i = 0; i < yol.length - 1; i++) {
    const a = yol[i], b = yol[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy || 1e-9;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2; t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < enSapma) { enSapma = d; enKm = kum[i] + Math.hypot(px - a.x, py - a.y); }
  }
  return { km: enKm, sapma: enSapma };
}

/**
 * CAD geometri + katman eşlemesi → RaySim hat sonucu. `ad` = dosya/hat adı.
 * `birimOlcek` geometriden gelir (m/birim). Duraklar önce nokta katmanlarından, yoksa
 * o katmanlardaki etiketlerden alınır; ad en yakın etiketten (yoksa "Durak N").
 */
export function cadHatKur(geo: CadGeometri, esle: CadEsleme, ad: string): CadHatSonuc {
  const uyarilar: string[] = [];
  const gset = new Set(esle.guzergahKatman), dset = new Set(esle.durakKatman);

  // 1) Güzergâh parçaları → dikilmiş yol.
  const parcalar = geo.polylines.filter((p) => gset.has(p.layer)).map((p) => p.pts);
  if (parcalar.length === 0) throw new Error("Seçili güzergâh katman(lar)ında çizgi/polyline yok. Doğru katmanı seçtiğinden emin ol.");
  // Tolerans: geometri ölçeğine göre (parçaların ortalama uzunluğunun küçük bir payı, en az 0.5).
  const ortUz = parcalar.reduce((s, p) => s + mesafe(p[0], p[p.length - 1]), 0) / parcalar.length;
  const tol = Math.max(0.5, ortUz * 0.02);
  const { yol, kullanilan, toplam, catalVar } = dikisAlignment(parcalar, tol);
  if (yol.length < 2) throw new Error("Güzergâh parçaları birleştirilemedi (uçlar birbirine değmiyor olabilir).");
  if (kullanilan < toplam) uyarilar.push(`${toplam} güzergâh parçasının ${kullanilan}'i tek yola dizildi; ${toplam - kullanilan} parça bağlanamadı (kopuk/ayrık) — Ringler'de mesafeleri kontrol et.`);
  if (catalVar) uyarilar.push("Güzergâhta çatallanma (makas/sapma) sezildi; ana hat yön sürekliliğine göre seçildi — yanlışsa mesafeleri elle düzelt.");

  const kum = kumulatif(yol);
  const olc = geo.birimOlcek || 1;

  // 2) Durak konumları: önce durak katmanlarındaki NOKTALAR; yoksa o katmanlardaki ETİKETLER.
  const durakNoktalar = geo.points.filter((p) => dset.has(p.layer));
  const durakEtiketler = geo.labels.filter((l) => dset.has(l.layer));
  type Ham = { x: number; y: number; ad?: string };
  let ham: Ham[] = [];
  if (durakNoktalar.length > 0) {
    ham = durakNoktalar.map((p) => ({ x: p.x, y: p.y }));
  } else if (durakEtiketler.length > 0) {
    ham = durakEtiketler.map((l) => ({ x: l.x, y: l.y, ad: l.metin }));
    uyarilar.push("Durak katmanında nokta bulunamadı; durak konumları METİN etiketlerinden alındı (metin dayanak noktası).");
  } else {
    throw new Error("Seçili durak katman(lar)ında nokta veya metin yok. Doğru katmanı seç.");
  }

  // Adı olmayan duraklara en yakın etiketten ad ver (herhangi bir katmandan, makul uzaklıkta).
  const adTol = Math.max(tol * 3, ortUz * 0.05);
  const tumEtiket = geo.labels;
  let adsiz = 0;
  const durakIzd = ham.map((h, i) => {
    let ad2 = h.ad;
    if (!ad2) {
      let en = Infinity, bul = "";
      for (const e of tumEtiket) { const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < en && d <= adTol) { en = d; bul = e.metin; } }
      ad2 = bul || "";
    }
    if (!ad2) { adsiz++; ad2 = `Durak ${i + 1}`; }
    const { km, sapma } = izdusum(yol, kum, { x: h.x, y: h.y });
    return { ad: ad2, kmBirim: km, sapma, x: h.x, y: h.y };
  });
  if (adsiz > 0) uyarilar.push(`${adsiz} durağın adı çıkarılamadı → "Durak N" verildi; Ringler'de yeniden adlandır.`);

  // Yoldan ÇOK uzak izdüşen (yanlış katman/ayrık işaret) durakları ayıkla + uyar.
  const sapmaTol = Math.max(tol * 6, ortUz * 0.15);
  const uzak = durakIzd.filter((d) => d.sapma > sapmaTol);
  if (uzak.length > 0) uyarilar.push(`${uzak.length} işaret güzergâhtan uzak (≈${Math.round(uzak[0].sapma * olc)} m) — durak olmayabilir; çıktı sonrası kontrol et.`);

  // 3) Kilometraja göre sırala + ardışık çok yakın (aynı) durakları sıkıştır.
  durakIzd.sort((a, b) => a.kmBirim - b.kmBirim);
  const yakinTol = Math.max(tol, ortUz * 0.01);
  const dz = durakIzd.filter((d, i) => i === 0 || (d.kmBirim - durakIzd[i - 1].kmBirim) * olc > Math.max(20, yakinTol * olc));
  if (dz.length < durakIzd.length) uyarilar.push(`${durakIzd.length - dz.length} çok yakın işaret tek durağa sıkıştırıldı.`);
  if (dz.length < 2) throw new Error(`Hat için en az 2 durak gerekli (bulunan: ${dz.length}). Durak katmanı seçimini gözden geçir.`);

  // 4) Ring zinciri.
  const rings: DurakArasiRing[] = [];
  let toplamM = 0, kisaSayi = 0;
  for (let i = 0; i < dz.length - 1; i++) {
    let uz = Math.round((dz[i + 1].kmBirim - dz[i].kmBirim) * olc);
    if (!Number.isFinite(uz) || uz < 20) { uz = 600; kisaSayi++; }
    toplamM += uz;
    const r = yeniRing(dz[i].ad, dz[i + 1].ad);
    r.uzunluk = uz;
    r.worstUzunluk = Math.max(uz, Math.round(uz * 1.15));
    r.bestUzunluk = Math.max(50, Math.round(uz * 0.7));
    r.dwell = 20;
    rings.push(r);
  }
  if (kisaSayi > 0) uyarilar.push(`${kisaSayi} durak arası mesafe ölçülemedi/çok kısaydı → varsayılan 600 m kullanıldı.`);

  uyarilar.push("Mesafeler güzergâh geometrisinden (viraj dâhil) hesaplandı — gerçek ray uzunluğuna yakın.");
  // KARAR gereği: makas/sinyal içe aktarılmaz — zorunlu hatırlatma.
  uyarilar.push("⚠ Makas ve sinyaller içe AKTARILMADI. Duruş süreleri (dwell) 20 s varsayıldı. Bunları ve okunamayan/eksik mesafeleri Ringler'de elle girin.");

  return {
    rings,
    ad: ad || "İçe aktarılan hat",
    durakSayisi: dz.length,
    toplamKm: toplamM / 1000,
    uyarilar,
    yol,
    duraklar: dz.map((d) => ({ ad: d.ad, km: (d.kmBirim - dz[0].kmBirim) * olc, x: d.x, y: d.y })),
  };
}

/** Katman rolü OTOMATİK tahmini: adına göre güzergâh/durak katmanlarını öner (UI ön-doldurma). */
export function katmanTahmini(geo: CadGeometri): CadEsleme {
  const g: string[] = [], d: string[] = [];
  const polyKat = new Set(geo.polylines.map((p) => p.layer));
  const noktaKat = new Set([...geo.points.map((p) => p.layer), ...geo.labels.map((l) => l.layer)]);
  for (const k of geo.katmanlar) {
    const s = k.toLowerCase();
    const guzergahIm = /ray|rail|track|hat|guzerg|güzerg|axis|aks|alignment|centerl|eksen|line/.test(s);
    const durakIm = /durak|stop|stat|istasyon|istas|peron|platform|station|halt/.test(s);
    if (durakIm && noktaKat.has(k)) d.push(k);
    else if (guzergahIm && polyKat.has(k)) g.push(k);
  }
  // İpucu yoksa: en çok polyline barındıran katman güzergâh; nokta/etiket olan katmanlar durak.
  if (g.length === 0 && polyKat.size > 0) {
    const say: Record<string, number> = {};
    geo.polylines.forEach((p) => { say[p.layer] = (say[p.layer] || 0) + 1; });
    g.push(Object.entries(say).sort((a, b) => b[1] - a[1])[0][0]);
  }
  if (d.length === 0) noktaKat.forEach((k) => { if (!g.includes(k)) d.push(k); });
  return { guzergahKatman: g, durakKatman: d };
}
