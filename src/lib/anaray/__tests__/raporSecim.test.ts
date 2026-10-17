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
import { MOTOR_SURUMU } from "@/lib/anaray/surum";

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

  // ANA DÜZELTME: yalnız grafikler seçilince artık AYRI "Görsel Analiz" bölümü (08) gelir —
  // içerik bölümlerine bağlı değil; tek başına dolu, figürlü bir görsel bölüm üretir.
  it("yalnız grafikler açık → ayrı Görsel Analiz bölümü + figürler", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "grafikler"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).toContain('<span class="no">08</span>'); // Görsel Analiz bölüm başlığı
    expect(html).toContain("GÖRSEL ANALİZ (GRAFİKLER)");
    expect(html).toContain('<div class="fig">');
    expect(html).toContain("Şekil 3"); // Bildfahrplan
    expect(html).toContain("Sperrzeitentreppe"); // Şekil 4
    // içerik bölümleri kapalı → hat/kapasite BANNER'ları yok (sadece figür bölümü)
    expect(html).not.toContain('<span class="no">02</span>');
    expect(html).not.toContain('<span class="no">04</span>');
  }, TO);

  it("grafikler + kapasite → kapasite metni VE Görsel Analiz figürleri ayrı", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "grafikler" || b === "kapasite"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).toContain('<span class="no">04</span>'); // kapasite bölümü (metin/tablo)
    expect(html).toContain('<span class="no">08</span>'); // grafikler bölümü ayrı
    expect(html).toContain('<div class="fig">');
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
  it("raporKredi: grafiksiz tam rapor = taban 3 + 10 bölüm = 13 kredi", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b !== "grafikler"])) as RaporSecim;
    expect(raporKredi(secim)).toBe(13);
  });
  it("raporKredi: her şey açık = 3 + 10 + grafikler(3) = 16 kredi", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, true])) as RaporSecim;
    expect(raporKredi(secim)).toBe(16);
  });

  // İZLENEBİLİRLİK (Büyük sıçrama B) — motor sürümü DAİMA kapakta; seçilince bölüm 10
  // motor künyesi + girdi digest'i + "sayı → yöntem" izleme tablosuyla render olur.
  it("izlenebilirlik seçilince bölüm 10 (motor sürümü + izleme tablosu) render olur", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "izlenebilirlik"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).toContain("İZLENEBİLİRLİK");
    expect(html).toContain(`v${MOTOR_SURUMU}`);
    expect(html).toContain("Çevrim süresi (RTT)"); // izleme tablosu satırı
    expect(html).toContain("Girdi Künyesi"); // yeniden üretim girdileri tablosu
  }, TO);
  it("kilitleme seçilince 3.2 Kilitleme Kontrol Tablosu render olur (makaslı hat)", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b === "kilitleme"])) as RaporSecim;
    const html = uret(secim);
    saglamHtml(html);
    expect(html).toContain("Kilitleme Kontrol Tablosu"); // 3.2 alt başlık
    expect(html).toContain("Ana hat düz geçiş");          // en az bir rota satırı
  }, TO);
  it("kilitleme kapalıyken kontrol tablosu render olmaz", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, b !== "kilitleme"])) as RaporSecim;
    const html = uret(secim);
    expect(html).not.toContain("Kilitleme Kontrol Tablosu");
  }, TO);
  it("motor sürümü kapak künyesinde DAİMA (izlenebilirlik kapalı olsa da)", () => {
    const secim = Object.fromEntries(RAPOR_BOLUMLER.map((b) => [b, false])) as RaporSecim;
    const html = uret(secim);
    expect(html).toContain("Motor sürümü");
    expect(html).toContain(`v${MOTOR_SURUMU}`);
    expect(html).not.toContain("İZLENEBİLİRLİK"); // bölüm 10 kapalı → banner yok
  }, TO);
});
