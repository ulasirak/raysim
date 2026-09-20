// V&V motorunun kendisi test edilir: bağımsız analitik kontroller GERÇEKTEN geçmeli
// (küçük sapma) — yoksa ya motor ya da referans yanlış demektir. Bu test, "doğrulama
// geçti" iddiasının kendisini doğrular.

import { describe, it, expect } from "vitest";
import { dogrulamaCalistir } from "../dogrulama";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

describe("Doğrulama & Geçerleme motoru", () => {
  const r = dogrulamaCalistir();

  it("motor-sertifikasyon kontrolleri üretilir (kinematik+direnç+kurp)", () => {
    expect(r.sonuclar.length).toBeGreaterThanOrEqual(5);
    expect(r.sonuclar.some((x) => x.kategori === "Kinematik")).toBe(true);
    expect(r.sonuclar.some((x) => x.kategori === "Direnç")).toBe(true);
  });

  it("TÜM bağımsız analitik kontroller PASS (sapma ≤ tolerans)", () => {
    const bagimsizlar = r.sonuclar.filter((x) => x.bagimsiz);
    expect(bagimsizlar.length).toBeGreaterThanOrEqual(4);
    for (const s of bagimsizlar) {
      expect(s.gecti, `${s.ad}: sapma %${s.sapmaYuzde.toFixed(2)} > tol %${s.tolerans} (ref ${s.referans}, hes ${s.hesaplanan})`).toBe(true);
    }
  });

  it("bağımsız kinematik sapmaları GERÇEKTEN küçük (< %1,5) — motor doğru entegre ediyor", () => {
    const kin = r.sonuclar.filter((x) => x.kategori === "Kinematik" && x.bagimsiz);
    for (const s of kin) expect(s.sapmaYuzde, `${s.ad}: %${s.sapmaYuzde.toFixed(2)}`).toBeLessThan(1.5);
  });

  it("UIC 406 kapasite kimliği gerçek hatta doğrulanır (nTeorik = ⌊çevrim÷hMin⌋)", () => {
    const h = hazirHatlar().find((x) => x.key === "mevcut")!;
    const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
    const isl = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
    const rr = dogrulamaCalistir(h.veri.rings, h.veri.arac ?? varsayilanArac, cfg, isl);
    const kap = rr.sonuclar.find((x) => x.kategori === "Kapasite");
    expect(kap).toBeTruthy();
    expect(kap!.gecti).toBe(true);
  }, 30000);

  it("özet sayaçları tutarlı", () => {
    expect(r.gecen).toBe(r.sonuclar.filter((x) => x.gecti).length);
    expect(r.toplam).toBe(r.sonuclar.length);
  });
});
