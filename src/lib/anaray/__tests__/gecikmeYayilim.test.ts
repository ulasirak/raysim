import { describe, it, expect } from "vitest";
import { gecikmeYayilim } from "@/lib/anaray/gecikmeYayilim";
import { loopToHat } from "@/lib/anaray/hatsim";
import { sinyalKonumlari } from "@/lib/anaray/network";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";

function kur() {
  const h = hazirHatlar().find((x) => x.key === "mevcut")!;
  const cfg = h.veri.cfg;
  const stock = h.veri.arac!;
  const rings = h.veri.rings ?? [];
  const line = loopToHat(rings, true, cfg).line;
  const sinyaller = sinyalKonumlari(rings, cfg);
  return { line, stock, sinyaller, cfg };
}

describe("#3 gecikme yayılımı (knock-on)", () => {
  it("birincil gecikme = 0 → boş sonuç", () => {
    const { line, stock, sinyaller } = kur();
    const r = gecikmeYayilim(line, stock, { headway: 240, count: 6, sinyaller }, 0, 0);
    expect(r.zincir.length).toBe(0);
    expect(r.etkilenen).toBe(0);
  });

  it("sıkı headway'de birincil gecikme ardışık trenlere yansır", () => {
    const { line, stock, sinyaller } = kur();
    // Sıkı headway (min'e yakın) → toparlama payı az → knock-on oluşur
    const r = gecikmeYayilim(line, stock, { headway: 200, count: 8, sinyaller }, 0, 180);
    expect(r.hedefTren).toBe(0);
    expect(r.zincir.length).toBe(8);
    // Hedef trenin birincili korunur
    expect(r.zincir[0].birincil).toBe(180);
    // En az bir ardışık tren etkilenir
    expect(r.etkilenen).toBeGreaterThan(0);
    expect(r.maxIkincil).toBeGreaterThan(0);
    expect(r.ozet).toContain("ardışık tren");
  });

  it("bol headway'de gecikme sönümlenir (arka trenler etkilenmez ya da erken sönme)", () => {
    const { line, stock, sinyaller } = kur();
    // Geniş headway → toparlama payı bol → knock-on ya yok ya çok kısa sürede söner
    const r = gecikmeYayilim(line, stock, { headway: 600, count: 6, sinyaller }, 0, 90);
    // Bol payda hedefin arkasındaki trenler ya hiç etkilenmez ya da hızla söner
    expect(r.toplamIkincil).toBeLessThan(90 * 6);
  });

  it("zincir toplam = birincil + ikincil, tutarlı", () => {
    const { line, stock, sinyaller } = kur();
    const r = gecikmeYayilim(line, stock, { headway: 210, count: 6, sinyaller }, 1, 150);
    for (const z of r.zincir) expect(z.toplam).toBe(z.birincil + z.ikincil);
    expect(r.hedefTren).toBe(1);
    expect(r.zincir[0].tren).toBe(1); // zincir hedef trenden başlar
  });
});
