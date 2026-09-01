// raysim — SHAPEFILE (ESRI) → CAD geometri.
//
// Shapefile ikili: .shp (geometri) + .dbf (öznitelik/ad) + .prj (koordinat sistemi) +
// (ops.) .cpg (metin kodlaması) — genelde tek .zip içinde. shpjs gibi bir bağımlılık
// EKLEMEYİZ ve koordinatları WGS84'e ZORLA çevirmeyiz: ray verisi çoğu kez projeksiyonlu
// (UTM/ulusal grid, METRE) gelir; bunu OLDUĞU gibi kullanmak gerçek-metre doğruluğu verir.
// Coğrafi (derece) ise ekvatoral yaklaşımla yerel metreye indirilir. Sadece Point ve
// PolyLine (+ Z/M çeşitleri) desteklenir — hat kurmak için gereken bunlar.
//
// Çıktı: cadHat'ın beklediği CadGeometri (polylines=güzergâh adayı, points+labels=duraklar).

import { unzipSync } from "fflate";
import type { CadGeometri } from "./cadHat";

const le = (dv: DataView, o: number) => dv.getInt32(o, true);
const be = (dv: DataView, o: number) => dv.getInt32(o, false);
const dbl = (dv: DataView, o: number) => dv.getFloat64(o, true);

interface ShpKayit { tip: number; x?: number; y?: number; parcalar?: { x: number; y: number }[][] }

/** .shp baytlarını kayıtlara ayrıştır (Point=1, PolyLine=3 + Z/M çeşitleri). */
function shpAyristir(buf: Uint8Array): { kayitlar: ShpKayit[]; genelTip: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (be(dv, 0) !== 9994) throw new Error(".shp dosya imzası geçersiz.");
  const genelTip = le(dv, 32);
  const kayitlar: ShpKayit[] = [];
  let o = 100; // kayıtlar 100. bayttan
  while (o + 8 <= buf.byteLength) {
    const icerikSozcuk = be(dv, o + 4); // 16-bit sözcük
    const icerikBayt = icerikSozcuk * 2;
    let p = o + 8;
    const tip = le(dv, p); p += 4;
    if (tip === 0) { kayitlar.push({ tip: 0 }); }
    else if (tip === 1 || tip === 11 || tip === 21) { // Point / PointZ / PointM
      const x = dbl(dv, p), y = dbl(dv, p + 8);
      kayitlar.push({ tip: 1, x, y });
    } else if (tip === 3 || tip === 13 || tip === 23) { // PolyLine / Z / M
      p += 32; // box
      const nParts = le(dv, p); p += 4;
      const nPts = le(dv, p); p += 4;
      const parcaBas: number[] = [];
      for (let i = 0; i < nParts; i++) { parcaBas.push(le(dv, p)); p += 4; }
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < nPts; i++) { pts.push({ x: dbl(dv, p), y: dbl(dv, p + 8) }); p += 16; }
      const parcalar: { x: number; y: number }[][] = [];
      for (let i = 0; i < nParts; i++) {
        const a = parcaBas[i], b = i + 1 < nParts ? parcaBas[i + 1] : nPts;
        parcalar.push(pts.slice(a, b));
      }
      kayitlar.push({ tip: 3, parcalar });
    } else { kayitlar.push({ tip: -1 }); }
    o += 8 + icerikBayt;
  }
  return { kayitlar, genelTip };
}

/** .dbf (dBASE) → kayıt başına {alan: değer}. metin kodlaması `dec` ile. */
function dbfAyristir(buf: Uint8Array, dec: TextDecoder): Record<string, string>[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nKayit = dv.getInt32(4, true);
  const baslikBoyu = dv.getInt16(8, true);
  const kayitBoyu = dv.getInt16(10, true);
  // Alan tanımları: 32. bayttan, her biri 32 bayt, 0x0D'e kadar.
  const alanlar: { ad: string; boy: number; ofset: number }[] = [];
  let fo = 32, ofset = 1; // kayıt içinde ilk bayt silme bayrağı
  while (fo < baslikBoyu - 1 && buf[fo] !== 0x0d) {
    const ad = dec.decode(buf.slice(fo, fo + 11)).replace(/\0.*$/, "").trim();
    const boy = buf[fo + 16];
    alanlar.push({ ad, boy, ofset });
    ofset += boy; fo += 32;
  }
  const out: Record<string, string>[] = [];
  for (let i = 0; i < nKayit; i++) {
    const rb = baslikBoyu + i * kayitBoyu;
    if (rb + kayitBoyu > buf.byteLength) break;
    const rec: Record<string, string> = {};
    for (const a of alanlar) rec[a.ad] = dec.decode(buf.slice(rb + a.ofset, rb + a.ofset + a.boy)).replace(/\0/g, "").trim();
    out.push(rec);
  }
  return out;
}

/** .prj metninden: coğrafi mi (derece) + birim ölçeği (metre/birim). */
function prjYorumla(prj: string | null): { cografi: boolean; olcek: number } {
  if (!prj) return { cografi: false, olcek: 1 }; // .prj yoksa projeksiyonlu-metre varsay
  const s = prj.toUpperCase();
  const cografi = s.includes("GEOGCS") && !s.includes("PROJCS");
  let olcek = 1;
  const m = s.match(/UNIT\s*\[\s*"([^"]+)"\s*,\s*([0-9.eE+-]+)/);
  if (!cografi && m) { const v = parseFloat(m[2]); if (Number.isFinite(v) && v > 0) olcek = v; } // metre/birim
  return { cografi, olcek };
}

const dbfMetin = (dec: string) => { try { return new TextDecoder(dec, { fatal: false }); } catch { return new TextDecoder("utf-8"); } };

/**
 * Shapefile .zip baytlarını CadGeometri'ye çevir. Ad özelliği verilmezse otomatik seçilir
 * (name/ad/isim/durak/stop_name benzeri) — UI onu değiştirebilsin diye adAlanlari da döner.
 */
export function shapefileGeometri(zipBytes: Uint8Array, adAlani?: string): CadGeometri & { adAlanlari: string[] } {
  let z: Record<string, Uint8Array>;
  try { z = unzipSync(zipBytes); } catch { throw new Error("Geçersiz ZIP (shapefile)."); }
  const bul = (uzanti: string) => Object.keys(z).find((k) => k.toLowerCase().endsWith(uzanti));
  const shpAd = bul(".shp");
  if (!shpAd) throw new Error("ZIP içinde .shp bulunamadı (shapefile değil).");

  // Aynı taban ada sahip tüm shapefile'ları topla (track.shp, stations.shp gibi çoklu olabilir).
  const tabanlar = [...new Set(Object.keys(z).filter((k) => k.toLowerCase().endsWith(".shp")).map((k) => k.replace(/\.shp$/i, "")))];
  const cpgAd = bul(".cpg");
  const kodlama = cpgAd ? new TextDecoder().decode(z[cpgAd]).trim().toLowerCase().replace("windows-", "windows-").replace(/^cp/, "windows-") : "utf-8";
  const dec = dbfMetin(/utf/.test(kodlama) ? "utf-8" : kodlama || "utf-8");

  const uyarilar: string[] = [];
  const polylines: CadGeometri["polylines"] = [];
  const points: CadGeometri["points"] = [];
  const labels: CadGeometri["labels"] = [];
  const katmanSet = new Set<string>();
  let cografiVar = false, olcekOrtak = 1;
  const adAlanSet = new Set<string>();

  for (const taban of tabanlar) {
    const shp = z[Object.keys(z).find((k) => k.toLowerCase() === (taban + ".shp").toLowerCase())!];
    const dbfKey = Object.keys(z).find((k) => k.toLowerCase() === (taban + ".dbf").toLowerCase());
    const prjKey = Object.keys(z).find((k) => k.toLowerCase() === (taban + ".prj").toLowerCase());
    const { kayitlar } = shpAyristir(shp);
    const oznitelik = dbfKey ? dbfAyristir(z[dbfKey], dec) : [];
    const { cografi, olcek } = prjYorumla(prjKey ? new TextDecoder().decode(z[prjKey]) : null);
    if (cografi) cografiVar = true; else olcekOrtak = olcek;
    const katman = taban.split(/[\\/]/).pop() || taban;
    katmanSet.add(katman);

    kayitlar.forEach((k, i) => {
      if (k.tip === 3 && k.parcalar) {
        for (const pr of k.parcalar) if (pr.length >= 2) polylines.push({ layer: katman, pts: pr.map((p) => ({ x: p.x, y: p.y })) });
      } else if (k.tip === 1 && Number.isFinite(k.x) && Number.isFinite(k.y)) {
        points.push({ layer: katman, x: k.x!, y: k.y! });
        const oz = oznitelik[i] || {};
        Object.keys(oz).forEach((a) => adAlanSet.add(a));
        // Ad: seçili alan → yoksa sezgisel → yoksa boş (cadHat "Durak N" verir).
        const alan = adAlani && oz[adAlani] != null ? adAlani : adAlanSez(Object.keys(oz));
        const ad = alan ? oz[alan] : "";
        if (ad) labels.push({ layer: katman, x: k.x!, y: k.y!, metin: ad });
      }
    });
  }

  if (polylines.length === 0) uyarilar.push("Shapefile'da çizgi (PolyLine) geometrisi yok — güzergâh için hat/çizgi shapefile'ı gerekir.");
  if (points.length === 0) uyarilar.push("Shapefile'da nokta (Point) geometrisi yok — duraklar için nokta shapefile'ı gerekir.");

  // Coğrafi (derece) → yerel metre (ekvatoral yaklaşım, ağın ortasına göre).
  let birimOlcek = olcekOrtak;
  if (cografiVar) {
    const tumX = [...polylines.flatMap((p) => p.pts.map((q) => q.x)), ...points.map((p) => p.x)];
    const tumY = [...polylines.flatMap((p) => p.pts.map((q) => q.y)), ...points.map((p) => p.y)];
    const lon0 = tumX.reduce((a, b) => a + b, 0) / (tumX.length || 1);
    const lat0 = tumY.reduce((a, b) => a + b, 0) / (tumY.length || 1);
    const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180), mLat = 110540;
    const don = (x: number, y: number) => ({ x: (x - lon0) * mLon, y: (y - lat0) * mLat });
    polylines.forEach((p) => { p.pts = p.pts.map((q) => don(q.x, q.y)); });
    points.forEach((p) => { const d = don(p.x, p.y); p.x = d.x; p.y = d.y; });
    labels.forEach((l) => { const d = don(l.x, l.y); l.x = d.x; l.y = d.y; });
    birimOlcek = 1; // artık metre
    uyarilar.push("Koordinatlar coğrafi (derece) idi → yerel metreye çevrildi (ekvatoral yaklaşım); büyük hatlarda küçük sapma olabilir.");
  }

  return {
    polylines, points, labels,
    katmanlar: [...katmanSet].sort(),
    birimOlcek,
    adAlanlari: [...adAlanSet].sort(),
    uyarilar,
  } as CadGeometri & { adAlanlari: string[]; uyarilar: string[] };
}

/** Öznitelik alan adlarından durak-adı olma ihtimali en yüksek olanı seç. */
function adAlanSez(alanlar: string[]): string | undefined {
  const puan = (a: string) => {
    const s = a.toLowerCase();
    if (/^(name|ad|isim|durak|stop_?name|istasyon|station|label|title)$/.test(s)) return 3;
    if (/name|ad|isim|durak|istasyon|station|label/.test(s)) return 2;
    return 0;
  };
  const sirali = [...alanlar].sort((a, b) => puan(b) - puan(a));
  return sirali[0] && puan(sirali[0]) > 0 ? sirali[0] : alanlar[0];
}
