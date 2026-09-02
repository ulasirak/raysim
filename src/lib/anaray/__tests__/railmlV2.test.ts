import { describe, it, expect } from "vitest";
import { railmlIhrac } from "@/lib/anaray/railml";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";

describe("railML V2 export — makas/sinyal/eğim", () => {
  it("makaslı hatta <switch> üretilir + gradientChange var", () => {
    const h = hazirHatlar().find((x) => x.key === "birlesik")!;
    const rings = h.veri.rings ?? [];
    const xml = railmlIhrac(rings, h.ad);
    // Bu hatta makas var → switch elemanları
    const makasSayisi = rings.reduce((n, r) => n + r.makaslar.length, 0);
    if (makasSayisi > 0) {
      expect(xml).toContain("<switches>");
      expect((xml.match(/<switch /g) || []).length).toBe(makasSayisi);
      expect(xml).toContain("<ocsElements>");
    }
    // Eğim değişimleri (en az bir gradientChange — ilk ring)
    expect(xml).toContain("<gradientChanges>");
    expect(xml).toContain("slope=");
  });

  it("sinyalli hatta <signal> dir up/down üretilir", () => {
    const rings = (hazirHatlar().find((x) => x.key === "birlesik")!.veri.rings ?? []);
    const sinyalSayisi = rings.reduce((n, r) => n + (r.sinyaller?.length ?? 0), 0);
    const xml = railmlIhrac(rings, "T");
    if (sinyalSayisi > 0) {
      expect(xml).toContain("<signals>");
      expect(xml).toMatch(/dir="(up|down)"/);
    }
  });
});
