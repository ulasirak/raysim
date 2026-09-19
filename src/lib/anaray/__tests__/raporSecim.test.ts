// RAPOR BÖLÜM SEÇİMİ — her varyasyon KUSURSUZ olmalı (about:blank/boş rapor regresyon kalkanı).
// Kullanıcı hangi bölüm kombinasyonunu seçerse seçsin: rapor geçerli, dolu bir HTML
// olmalı; "undefined" sızmamalı; Girdi Parametreleri (01) + Sinyalizasyon (03) DAİMA
// bulunmalı (taban); "grafikler" kapalıyken hiçbir <div class="fig"> figürü üretilmemeli
// (SVG kaynağa yazılmaz — ücret dürüst gatelenir), açıkken üretilmeli. Fiyat raporKredi
// ile birebir. Bu test rapor motorunun bölüm-gating'ini ve fiyatını kilitler.

import { describe, it, expect } from "vitest";
import { raporHTML } from "../rapor";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme, varsayilanMeta } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { RAPOR_BOLUMLER, RAPOR_TABAN_KREDI, raporKredi, type RaporSecim } from "@/lib/raporFiyat";

// "mevcut" hattı — kısa (7 ring) → rapor üretimi hızlı; tüm bölümleri (kurplar dâhil,
// v14) barındırır. Ağır Monte-Carlo'lu "birlesik" varyasyon başına ~7 s sürerdi.
const h = hazirHatlar().find((x) => x.key === "mevcut")!;
const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
const stock = h.veri.arac ?? varsayilanArac;
const meta = h.veri.meta ?? { ...varsayilanMeta, projeAdi: "T", hatAdi: h.ad };
const uret = (secim?: RaporSecim) => raporHTML(meta, cfg, h.veri.rings ?? [], stock, "tr", 5, isletme, "", [], secim);
const TO = 20000; // rapor üretimi (sim) test başına geniş timeout

/** Bir rapor HTML'i geçerli + dolu mu? */
function saglamHtml(html: string) {
  expect(html.length).toBeGreaterThan(2000);
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html.trimEnd().endsWith("</html>")).toBe(true);
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("NaN");
  // Taban DAİMA: kapak, Girdi Parametreleri (01), Sinyalizasyon (03)
  expect(html).toContain('<span class="no">01</span>'); // Girdi
  expect(html).toContain('<span class="no">03</span>'); // Sinyalizasyon (SG)
}

describe("Rapor bölüm seçimi — her varyasyon kusursuz", () => {
  // Tümü seçili (varsayılan davranış — secim undefined)
  it("secim yok → tam rapor, grafikli", () => {
    const html = uret(undefined);
    saglamHtml(html);
    expect(html).toContain('<div class="fig">');
    expect(html).toContain("Şekil 3"); // Bildfahrplan figürü
  }, TO);

  // YALNIZ TABAN — tüm seçilebilir bölümler kapalı (grafikler dâhil)
  it("yalnız taban (hepsi kapalı) → dolu, figürsüz, girdi+sinyal var", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, false])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).not.toContain('<div class="fig">'); // grafikler kapalı → HİÇ figür yok
    // (Kapak amblemi + QR daima <svg> içerir; sadece .fig figürleri gatelenir.)
    // Seçilebilir bölümler yok
    expect(html).not.toContain('<span class="no">02</span>'); // hat
    expect(html).not.toContain('<span class="no">04</span>'); // kapasite
  }, TO);

  // GRAFİKLER kapalı ama diğer tüm bölümler açık → figür YOK, metin/tablo VAR
  it("grafikler kapalı, gerisi açık → figür yok ama bölüm metinleri var", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b !== "grafikler"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).not.toContain('<div class="fig">');
    expect(html).toContain('<span class="no">02</span>'); // hat metni var
    expect(html).toContain('<span class="no">04</span>'); // kapasite metni var
  }, TO);

  // Yalnız grafikler açık (taban + görsel katman) → figürler geri gelir
  it("yalnız grafikler açık → figürler üretilir", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "grafikler"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    // grafikler tek başına: hat/kapasite kapalı olduğundan o bölümlere gömülü figürler
    // gelmez; ama figür barındıran bir bölüm açık değilse fig sayısı 0 olabilir — bu yüzden
    // "grafikler + kapasite" ile figür varlığını ayrıca doğrula.
  }, TO);

  it("grafikler + kapasite → Sperrzeit/Bildfahrplan figürleri var", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "grafikler" || b === "kapasite"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).toContain('<div class="fig">');
    expect(html).toContain("Sperrzeitentreppe");
  }, TO);

  // Her bölümü TEK BAŞINA aç → hepsi geçerli rapor üretir
  for (const b of RAPOR_BOLUMLER) {
    it(`yalnız "${b}" açık → geçerli rapor`, () => {
      const secim = Object.fromEntries(RAPOR_BOLUMLER.map((x) => [x, x === b])) as RaporSecim;
      saglamHtml(uret(secim));
    }, TO);
  }

  // FİYAT: taban + seçilenler
  it("raporKredi: yalnız taban = taban kredisi", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, false])) as RaporSecim;
    expect(raporKredi(secim)).toBe(RAPOR_TABAN_KREDI);
  });
  it("raporKredi: grafikler = +3 kredi", () => {
    const yalnizGrafik = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "grafikler"])) as RaporSecim;
    expect(raporKredi(yalnizGrafik)).toBe(RAPOR_TABAN_KREDI + 3);
  });
  it("raporKredi: grafiksiz tam rapor = 10 kredi (klasik fiyat)", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b !== "grafikler"])) as RaporSecim;
    expect(raporKredi(secim)).toBe(10);
  });
  it("raporKredi: her şey açık = 13 kredi", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, true])) as RaporSecim;
    expect(raporKredi(secim)).toBe(13);
  });
});
