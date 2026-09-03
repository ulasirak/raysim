import { describe, it, expect } from "vitest";
import { raporHTML } from "../rapor";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme, varsayilanMeta } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

describe("rapor Bildfahrplan (git-gel loop)", () => {
  it("birleşik hat raporu Bildfahrplan SVG üretir", () => {
    const h = hazirHatlar().find((x) => x.key === "birlesik")!;
    const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
    const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
    const stock = h.veri.arac ?? varsayilanArac;
    const html = raporHTML(h.veri.meta ?? { ...varsayilanMeta, projeAdi: "T", hatAdi: h.ad }, cfg, h.veri.rings ?? [], stock, "tr", 15, isletme, "");
    expect(html).toContain("Bildfahrplan");
    expect(html).toContain("git-gel döngü");     // yeni altyazı
    expect(html).toContain("<polyline");           // tren çizgileri çizildi
    // gidiş (mavi) + dönüş (turuncu) her ikisi de var
    expect(html).toContain("#2A78D6");             // CK.blue
  }, 20000);

  it("yeni grafik/analiz figürleri raporda var", () => {
    const h = hazirHatlar().find((x) => x.key === "birlesik")!;
    const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
    const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
    const stock = h.veri.arac ?? varsayilanArac;
    const html = raporHTML(h.veri.meta ?? { ...varsayilanMeta, projeAdi: "T", hatAdi: h.ad }, cfg, h.veri.rings ?? [], stock, "tr", 15, isletme, "");
    expect(html).toContain("Hız profili");                  // Şekil 3b
    expect(html).toContain("Yük profili");                  // Şekil 5b
    expect(html).toContain("Belirleyici kısıt");            // Şekil 2c
    expect(html).toContain("Terminal Turnback Kapasitesi"); // tablo
    expect(html).toContain("geçit");                        // hemzemin/TSP (Şekil 2e ya da not)
    expect(html).toContain("Talep → Gereken Filo → Doluluk"); // talep zinciri
    expect(html).toContain("Sefer ↔ Ters İşletme (Entegre)"); // 5.6 entegre bölüm
    expect(html).toContain("Şekil 5c");                        // entegre konum diyagramı
    // Monte-Carlo robustluk bölümü (A: analizi rapora taşı)
    expect(html).toContain("Monte-Carlo Gecikme Analizi");     // 4.1 alt başlık
    expect(html).toContain("Dakiklik");                        // KPI
    expect(html).toContain("Şekil 6");                          // gecikme dağılımı histogramı
    expect(html).toContain("Şekil 7");                          // gecikme yayılımı
  }, 20000);
});
