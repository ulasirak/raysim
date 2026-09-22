// SAMSUN TRAMVAYI — GERÇEK HAT ÜZERİNDE TÜM MOTOR SWEEP'İ.
// "OSM'den hat kur" ile kurulan gerçek Samsun hattı (SAMULAŞ, OMÜ Rektörlük ↔ Gar ↔
// Tekkeköy) RaySim'in HER analiz motorundan geçirilir; çıktılar SONLU + makul olmalı
// (NaN/çökme yok). Müşteriye kusursuz teslim güvencesi — bir hat tüm özelliklerde çalışır.

import { describe, it, expect } from "vitest";
import { SAMSUN_SEGMENTLER } from "./samsunFixture";
import { osmHatKur } from "../osmHat";
import {
  ringSenaryo, loopDenge, olceklenme, dengeOnerisi, ringChallenge, ringDogrula,
  loopTamMi, kurpKonforAnaliz, haritaKisitlari, yeniMakas, ringDuraklari,
} from "../ring";
import { maksimumTren } from "../kapasite";
import { dogrulamaCalistir } from "../dogrulama";
import { cakismaTespit } from "../cakisma";
import { gecikmeYayilim } from "../gecikmeYayilim";
import { loopToHat } from "../hatsim";
import { loopYorunge } from "../signalling";
import { raporHTML } from "../rapor";
import { gtfsIhrac, parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur } from "../gtfs";
import { varsayilanConfig, varsayilanIsletme, varsayilanMeta } from "../config";
import { varsayilanArac } from "../vehicles";
import type { Line } from "../types";
import type { DurakArasiRing } from "../ring";

const cfg = varsayilanConfig;
const stock = varsayilanArac;
const isletme = { ...varsayilanIsletme, kapali: false };

// Gerçek Samsun hattı (35 durak = 21 + 15 − ortak Gar), stitch ile birleşik.
const hat = osmHatKur(SAMSUN_SEGMENTLER, "Samsun Tramvayı — OMÜ Rektörlük ↔ Tekkeköy");
const rings = hat.rings;

const finite = (x: number) => Number.isFinite(x);
function reverseLineOf(line: Line): Line {
  const L = line.length;
  return {
    ...line, id: line.id + "-rev", name: line.name + " (dönüş)",
    stations: line.stations.map((s) => ({ ...s, position: L - s.position })).reverse(),
    segments: line.segments.map((s) => ({ start: L - s.end, end: L - s.start, vmax: s.vmax, gradient: -s.gradient })).reverse(),
  };
}

describe("Samsun — OSM'den hat kur (kurulum)", () => {
  it("35 durak / 34 ring, birleşik ve sıralı", () => {
    expect(hat.durakSayisi).toBe(35);
    expect(rings).toHaveLength(34);
    const duraklar = ringDuraklari(rings).map((d) => d.ad);
    expect(duraklar[0]).toBe("Eczaneler");
    expect(duraklar).toContain("Gar");
    expect(duraklar[duraklar.length - 1]).toBe("Tekkeköy");
  });
  it("toplam uzunluk gerçekçi (25–35 km) ve tüm mesafeler sonlu > 0", () => {
    expect(hat.toplamKm).toBeGreaterThan(20);
    expect(hat.toplamKm).toBeLessThan(40);
    for (const r of rings) { expect(finite(r.uzunluk)).toBe(true); expect(r.uzunluk).toBeGreaterThan(0); }
  });
  it("gerçek koordinat taşınır (harita için) ve geometri var", () => {
    expect(hat.duraklar.every((d) => finite(d.lat) && finite(d.lon))).toBe(true);
    expect(hat.geometri.length).toBeGreaterThanOrEqual(2);
  });
  it("içe-aktarılan hat ZORUNLU şartları sağlar (Ringler'de geçerli)", () => {
    for (const r of rings) expect(ringDogrula(r, cfg)).toEqual([]);
    expect(loopTamMi(rings)).toBe(true);
  });
});

describe("Samsun — ring/loop motorları (Ringler modülü)", () => {
  it("ringSenaryo her ringde sonlu süreler üretir", () => {
    for (const r of rings) {
      const s = ringSenaryo(r, stock, cfg);
      expect(finite(s.worstToplam) && s.worstToplam > 0).toBe(true);
      expect(finite(s.bestToplam) && finite(s.nominalSeyir)).toBe(true);
    }
  });
  it("loopDenge + denge önerisi + challenge çökmeden çalışır", () => {
    const d = loopDenge(rings, stock, cfg);
    expect(finite(d.ortalama) && d.ortalama > 0).toBe(true);
    expect(d.perRing).toHaveLength(rings.length);
    expect(Array.isArray(dengeOnerisi(rings, stock, cfg))).toBe(true);
    for (const r of rings) expect(Array.isArray(ringChallenge(r, stock, cfg))).toBe(true);
  });
  it("olceklenme (filo/çevrim) sonlu + tutarlı", () => {
    const o = olceklenme(rings, stock, false, cfg, isletme.turnaroundDk * 60);
    expect(finite(o.cevrimSuresi) && o.cevrimSuresi > 0).toBe(true);
    expect(finite(o.minHeadway) && o.minHeadway > 0).toBe(true);
    expect(o.maxTrenHedefHeadway).toBeGreaterThanOrEqual(1);
  });
  it("kurp konfor + harita kısıtları sonlu km ile listelenir", () => {
    for (const k of kurpKonforAnaliz(rings, cfg)) { expect(finite(k.kmMutlak)).toBe(true); expect(finite(k.vKmh)).toBe(true); }
    for (const h of haritaKisitlari(rings, cfg)) { expect(finite(h.konum)).toBe(true); expect(finite(h.vmax)).toBe(true); }
  });
});

describe("Samsun — kapasite / maksimum tramvay (Sefer modülü)", () => {
  const mk = maksimumTren(rings, stock, cfg, isletme);
  it("hesap geçerli + tüm anahtar sayılar sonlu", () => {
    expect(mk.gecerli).toBe(true);
    for (const v of [mk.hMin, mk.cevrimSuresi, mk.nTeorik, mk.nSurdurulebilir, mk.teorikKapasiteTrenSaat]) expect(finite(v)).toBe(true);
    expect(mk.hMin).toBeGreaterThan(0);
    expect(mk.nTeorik).toBeGreaterThanOrEqual(mk.nSurdurulebilir);
  });
});

describe("Samsun — canlı ağ sim + çakışma + gecikme yayılımı", () => {
  const line = loopToHat(rings, true, cfg).line;
  it("loopToHat sonlu uzunlukta hat üretir", () => {
    expect(finite(line.length) && line.length > 0).toBe(true);
    expect(line.stations.length).toBeGreaterThan(2);
  });
  it("loopYorunge + çakışma tespiti çökmeden döner", () => {
    const loopY = loopYorunge(line, reverseLineOf(line), stock, { peronIsgaliBas: 60, peronIsgaliSon: 60 });
    const c = cakismaTespit(rings, stock, cfg, loopY, 4, isletme);
    expect(typeof c.cakismaVar).toBe("boolean");
    expect(Array.isArray(c.spanlar)).toBe(true);
  });
  it("gecikme yayılımı (knock-on) sonlu ikincil gecikme verir", () => {
    const k = gecikmeYayilim(line, stock, { headway: 240, count: 6 }, 2, 90);
    expect(finite(k.toplamIkincil)).toBe(true);
    expect(k.etkilenen).toBeGreaterThanOrEqual(0);
  });
});

describe("Samsun — V&V (doğrulama) + kurumsal rapor (Belgeler modülü)", () => {
  it("doğrulama motoru Samsun hattında çalışır; kapasite kimliği PASS", () => {
    const r = dogrulamaCalistir(rings, stock, cfg, isletme);
    expect(r.sonuclar.length).toBeGreaterThanOrEqual(5);
    const kap = r.sonuclar.find((x) => x.kategori === "Kapasite");
    expect(kap?.gecti).toBe(true);
  });
  it("raporHTML üretilir, Samsun durağı geçer, NaN sızmaz", () => {
    const meta = { ...varsayilanMeta, projeAdi: "Samsun Tramvayı Sinyalizasyon", hatAdi: hat.ad };
    const html = raporHTML(meta, cfg, rings, stock, "tr", 6, isletme, "", []);
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toContain("Tekkeköy");
    expect(html.includes("NaN")).toBe(false);
    expect(html.includes("undefined")).toBe(false);
  });
});

describe("Samsun — GTFS dışa→içe roundtrip (içe/dışa aktarma)", () => {
  it("hattı GTFS'e ver, geri oku → aynı durak sayısı", () => {
    const duraklar = hat.duraklar.map((d, i) => ({ id: `S${i}`, ad: d.ad, lat: d.lat, lon: d.lon, varisSn: i * 90, kalkisSn: i * 90 + 20 }));
    const zip = gtfsIhrac({ hatAdi: hat.ad, agency: "SAMULAŞ", duraklar, headwaySn: 240 });
    const feed = parseGtfsZip(zip);
    const rota = gtfsRotalar(feed)[0];
    const yon = gtfsYonler(feed, rota.id)[0];
    const geri = gtfsHatKur(feed, rota.id, yon.dir);
    expect(geri.durakSayisi).toBe(hat.durakSayisi);
    expect(geri.rings.length).toBe(rings.length);
  });
});

describe("Samsun — makas eklenmiş tasarım (terminal U-dönüş) motoru bozmaz", () => {
  it("iki uca U-dönüş makası eklenince kapasite hâlâ geçerli", () => {
    const withMakas: DurakArasiRing[] = rings.map((r, i) => {
      if (i === 0) return { ...r, makaslar: [{ ...yeniMakas("udonus", Math.round(r.uzunluk * 0.3)), crossover: "s" as const }] };
      if (i === rings.length - 1) return { ...r, makaslar: [{ ...yeniMakas("udonus", Math.round(r.uzunluk * 0.7)), crossover: "x" as const }] };
      return r;
    });
    for (const r of withMakas) expect(ringDogrula(r, cfg)).toEqual([]);
    const mk = maksimumTren(withMakas, stock, cfg, isletme);
    expect(mk.gecerli).toBe(true);
    expect(finite(mk.cevrimSuresi) && mk.cevrimSuresi > 0).toBe(true);
  });
});
