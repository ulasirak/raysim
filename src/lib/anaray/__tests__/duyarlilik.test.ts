// Duyarlılık (tornado) çekirdeği testi — Bütünleşik hatta.

import { describe, it, expect } from "vitest";
import { duyarlilikAnaliz } from "@/lib/anaray/duyarlilik";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

const h = hazirHatlar().find((x) => x.key === "birlesik")!;
const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
const stock = h.veri.arac ?? varsayilanArac;
const rings = h.veri.rings ?? [];

describe("Duyarlılık analizi", () => {
  const s = duyarlilikAnaliz(rings, stock, cfg, isletme, "isletmeKap", 20);

  it("taban = işletme kapasitesi (17)", () => expect(Math.round(s.taban)).toBe(17));
  it("7 parametre, salınıma göre azalan sıralı", () => {
    expect(s.satirlar).toHaveLength(7);
    for (let i = 1; i < s.satirlar.length; i++) expect(s.satirlar[i - 1].salinim).toBeGreaterThanOrEqual(s.satirlar[i].salinim);
  });
  it("en güçlü kaldıraç sıfırdan büyük etkili", () => expect(s.satirlar[0].salinim).toBeGreaterThan(0));

  it("doluluk tavanı ARTINCA kapasite artar (yön +1)", () => {
    const d = s.satirlar.find((x) => x.ad === "Doluluk tavanı")!;
    expect(d.yon).toBe(1);
    expect(d.salinim).toBeGreaterThan(0);
  });
  it("blok uzunluğu ARTINCA kapasite azalır (yön −1)", () => {
    const b = s.satirlar.find((x) => x.ad === "Blok uzunluğu")!;
    expect(b.yon).toBe(-1);
  });

  it("hedef nTeorik ise doluluk tavanının etkisi YOK (nTeorik doluluktan bağımsız)", () => {
    const n = duyarlilikAnaliz(rings, stock, cfg, isletme, "nTeorik", 20);
    expect(Math.round(n.taban)).toBe(54);
    expect(n.satirlar.find((x) => x.ad === "Doluluk tavanı")!.salinim).toBe(0);
  });
});
