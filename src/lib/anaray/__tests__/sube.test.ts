import { describe, it, expect } from "vitest";
import { ringlerdenSebeke, flattenRoute, kavsakliRingler, subeEfektifRingler } from "@/lib/anaray/network";
import { yeniSube, yeniRing, type DurakArasiRing, type Sube } from "@/lib/anaray/ring";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";

function trunk(): DurakArasiRing[] {
  // 4 ringli basit ana hat (A→B→C→D→E)
  const adlar = [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]];
  return adlar.map(([f, t]) => { const r = yeniRing(f, t); r.uzunluk = 1000; return r; });
}

describe("#1 additive şube (dallanma)", () => {
  it("şubesiz → eskisi gibi; subeRotalar boş, trunk route sağlam", () => {
    const r = trunk();
    const s = ringlerdenSebeke(r, undefined, "Ana");
    expect(s).not.toBeNull();
    expect(s!.subeRotalar.length).toBe(0);
    expect(s!.network.nodes.length).toBe(5);   // dg0..dg4
    expect(s!.network.edges.length).toBe(4);
    const line = flattenRoute(s!.network, s!.route);
    expect(Math.round(line.length)).toBe(4000);
  });

  it("kavşaktan şube → düğüm/kenar eklenir, şube rotası düzleşir", () => {
    const r = trunk();
    // C düğümünde (index 2) 2 ringli şube: C→Ş1→Ş2, her 800 m
    const sube: Sube = { id: "sube1", ad: "Test Şubesi", atIndex: 2, rings: [
      (() => { const x = yeniRing("C", "Ş1"); x.uzunluk = 800; return x; })(),
      (() => { const x = yeniRing("Ş1", "Ş2"); x.uzunluk = 800; return x; })(),
    ] };
    const s = ringlerdenSebeke(r, undefined, "Ana", [sube])!;
    // Ağ: 5 trunk + 2 şube düğümü = 7; 4 trunk + 2 şube kenarı = 6
    expect(s.network.nodes.length).toBe(7);
    expect(s.network.edges.length).toBe(6);
    expect(s.subeRotalar.length).toBe(1);
    expect(s.subeRotalar[0].ad).toBe("Test Şubesi");
    // Şube rotası: A→B→C (2 trunk kenarı) + şube (2 kenar) = 4 kenar
    const rota = s.subeRotalar[0].route;
    expect(rota.edgeIds.length).toBe(4);
    // Düzleşince uzunluk = 2000 (A→C) + 1600 (şube) = 3600
    const line = flattenRoute(s.network, rota);
    expect(Math.round(line.length)).toBe(3600);
    // Kavşak düğümü şube ile paylaşılır (degree 3): dg2 hem trunk hem şubeye bağlı
    const dg2Bagli = s.network.edges.filter((e) => e.from === "dg2" || e.to === "dg2");
    expect(dg2Bagli.length).toBe(3); // rg2 (B→C), rg3 (C→D), se_0_1 (C→Ş1)
  });

  it("atIndex=0 → şube hat başından ayrılır", () => {
    const r = trunk();
    const sube: Sube = { id: "s0", ad: "Baş Şube", atIndex: 0, rings: [
      (() => { const x = yeniRing("A", "P1"); x.uzunluk = 500; return x; })(),
    ] };
    const s = ringlerdenSebeke(r, undefined, "Ana", [sube])!;
    const rota = s.subeRotalar[0].route;
    expect(rota.edgeIds.length).toBe(1); // sadece şube kenarı (trunk kısmı yok)
    const line = flattenRoute(s.network, rota);
    expect(Math.round(line.length)).toBe(500);
  });

  it("#1-A kavşak makası: şube efektif zinciri ayrımda karsilasmali makas taşır", () => {
    const r = trunk();
    const sube: Sube = { id: "s", ad: "Şube", atIndex: 2, rings: [
      (() => { const x = yeniRing("C", "Ş1"); x.uzunluk = 800; return x; })(),
    ] };
    const ef = subeEfektifRingler(r, sube);
    // Efektif zincir: 2 ana ring (A→B→C) + 1 şube ring = 3
    expect(ef.length).toBe(3);
    // Ayrım ring'i (ilk şube ring'i = index 2) bir karsilasmali kavşak makası kazanır
    const ayrimRing = ef[2];
    const kavsak = ayrimRing.makaslar.find((m) => m.tip === "karsilasmali" && (m.ad || "").includes("Kavşak"));
    expect(kavsak).toBeTruthy();
    // Kapasite bu kavşağı DÜZ KAVŞAK olarak görür (kavsakDetay üretilir)
    const maks = maksimumTren(ef, hazirHatlar()[0].veri.arac!, varsayilanConfig, varsayilanIsletme);
    expect(maks.gecerli).toBe(true);
    expect(maks.kavsakDetay).not.toBeNull();
  });

  it("#1-A kavşaklıRingler: ana hatta her şube için kavşak makası ekler; şubesiz no-op", () => {
    const r = trunk();
    expect(kavsakliRingler(r, [])).toBe(r); // şubesiz: aynı referans (no-op)
    const sube = yeniSube(2, "Ş");
    const k = kavsakliRingler(r, [sube]);
    const toplamMakas = k.reduce((n, x) => n + x.makaslar.length, 0);
    expect(toplamMakas).toBe(1); // bir kavşak makası eklendi
    expect(k.some((x) => x.makaslar.some((m) => m.tip === "karsilasmali"))).toBe(true);
  });

  it("yeniSube yardımcısı geçerli şube üretir", () => {
    const sb = yeniSube(3, "X");
    expect(sb.atIndex).toBe(3);
    expect(sb.rings.length).toBe(1);
    expect(sb.id).toContain("SUBE");
  });

  it("gerçek hatta şube (mevcut) → çift yön flatten çalışır", () => {
    const h = hazirHatlar().find((x) => x.key === "mevcut")!;
    const rings = h.veri.rings ?? [];
    const sube = yeniSube(2, "Depo Bağlantısı");
    sube.rings[0].uzunluk = 600;
    const s = ringlerdenSebeke(rings, h.veri.cfg, "Mevcut", [sube])!;
    expect(s.subeRotalar.length).toBe(1);
    const line = flattenRoute(s.network, s.subeRotalar[0].route);
    expect(line.length).toBeGreaterThan(0);
    expect(line.stations.length).toBeGreaterThan(1);
  });
});
