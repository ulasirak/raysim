// ÇAKIŞMA ÇÖZÜCÜSÜ (advisory) — kilidi.
import { describe, it, expect } from "vitest";
import { cakismaCoz, cakismasizMaxFilo } from "../cakismaCozum";
import type { LoopYorunge } from "../signalling";
import type { TekHatSpan } from "../cakisma";

// Sentetik loopY: tren s'i 0→loopLen (2000) linstable, P=400. real-km = s≤L ? s : loopLen−s
// → üçgen (0→1000→0), tepe faz=200. Sabit hızlı gidiş-dönüş.
const loopY = {
  ornekler: [{ t: 0, s: 0 }, { t: 400, s: 2000 }],
  periyot: 400, L: 1000, loopLen: 2000, dokum: {},
} as unknown as LoopYorunge;

const midSpan: TekHatSpan[] = [{ kmBas: 400, kmSon: 600, ad: "Orta kesim" }];

describe("cakismaCoz", () => {
  it("hat çift-hat (span yok) → çözülecek çakışma yok", () => {
    const r = cakismaCoz([], loopY, 3);
    expect(r.bazOrtusme).toBe(0);
    expect(r.cozuldu).toBe(true);
    expect(r.kaydirmalar.every((k) => k === 0)).toBe(true);
  });

  it("tek tren → çakışma olmaz", () => {
    const r = cakismaCoz(midSpan, loopY, 1);
    expect(r.bazOrtusme).toBe(0);
    expect(r.cozuldu).toBe(true);
  });

  it("orta tek-hat kesimde 2 tren EVEN-SPACING'de karşılaşır → baz çakışma > 0", () => {
    const r = cakismaCoz(midSpan, loopY, 2);
    expect(r.bazOrtusme).toBeGreaterThan(0); // ortada meet/pass
  });

  it("çözücü kalkış-offset'i kaydırıp çakışmayı azaltır/giderir", () => {
    const r = cakismaCoz(midSpan, loopY, 2);
    expect(r.cozumOrtusme).toBeLessThan(r.bazOrtusme); // iyileşme
    expect(r.iyilesme).toBeGreaterThan(0);
    // Referans tren 0 sabit; en az bir tren kaydırılmış olmalı.
    expect(r.kaydirmalar[0]).toBe(0);
    if (r.cozuldu) expect(r.kaydirmalar.some((k) => k !== 0)).toBe(true);
  });

  it("cakismasizMaxFilo: span yoksa nMax döner", () => {
    expect(cakismasizMaxFilo([], loopY, 8)).toBe(8);
  });

  it("cakismasizMaxFilo: tek-hat kesimde ≥1 döndürür (fiziksel sınır)", () => {
    const m = cakismasizMaxFilo(midSpan, loopY, 8);
    expect(m).toBeGreaterThanOrEqual(1);
    expect(m).toBeLessThanOrEqual(8);
  });
});
