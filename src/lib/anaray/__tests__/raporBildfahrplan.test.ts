import { describe, it, expect } from "vitest";
import { raporHTML } from "../rapor";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

describe("rapor Bildfahrplan (git-gel loop)", () => {
  it("birleşik hat raporu Bildfahrplan SVG üretir", () => {
    const h = hazirHatlar().find((x) => x.key === "birlesik")!;
    const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
    const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
    const stock = h.veri.arac ?? varsayilanArac;
    const html = raporHTML(h.veri.meta ?? { projeAdi: "T", hatAdi: h.ad } as any, cfg, h.veri.rings ?? [], stock, "tr", 15, isletme, "");
    expect(html).toContain("Bildfahrplan");
    expect(html).toContain("git-gel döngü");     // yeni altyazı
    expect(html).toContain("<polyline");           // tren çizgileri çizildi
    // gidiş (mavi) + dönüş (turuncu) her ikisi de var
    expect(html).toContain("#2A78D6");             // CK.blue
  });
});
