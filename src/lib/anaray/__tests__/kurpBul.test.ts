import { describe, it, expect } from "vitest";
import { kurplariBul, ucNoktaYaricap, yaricapKirisVersine } from "@/lib/anaray/kurpBul";

// Daire yayı üret: merkez (cx,cy), yarıçap R, açı [a0,a1] derece, n nokta.
function yay(cx: number, cy: number, R: number, a0: number, a1: number, n: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = ((a0 + (a1 - a0) * (i / (n - 1))) * Math.PI) / 180;
    pts.push({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) });
  }
  return pts;
}

describe("kurpBul — geometriden yarıçap", () => {
  it("çember üzerindeki 3 nokta tam R verir", () => {
    const p = yay(0, 0, 137, 0, 40, 3);
    expect(ucNoktaYaricap(p[0], p[1], p[2]).R).toBeCloseTo(137, 3);
  });

  it("düz hat → kurp yok", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 30, y: 0 }));
    expect(kurplariBul(pts)).toHaveLength(0);
  });

  it("R=100 yay → tek kurp, yarıçap ≈ 100", () => {
    // düz giriş + 90° yay + düz çıkış
    const giris = Array.from({ length: 4 }, (_, i) => ({ x: -120 + i * 30, y: 100 }));
    const ark = yay(0, 0, 100, 90, 0, 12); // (0,100)→(100,0)
    const cikis = Array.from({ length: 4 }, (_, i) => ({ x: 100, y: -30 * (i + 1) }));
    const k = kurplariBul([...giris, ...ark, ...cikis]);
    expect(k).toHaveLength(1);
    expect(k[0].yaricap).toBeCloseTo(100, 0);
    expect(k[0].uzunluk).toBeGreaterThan(100); // ~157 m (çeyrek çember)
  });

  it("S-kurp (sinüs dalgası, ters eğrilikler) → iki ayrı kurp", () => {
    // y = 60·sin(x/40); bir tam periyot → biri yukarı biri aşağı tepe = ters işaretli 2 kurp.
    const pts: { x: number; y: number }[] = [];
    for (let x = 0; x <= 2 * Math.PI * 40; x += 4) pts.push({ x, y: 60 * Math.sin(x / 40) });
    const k = kurplariBul(pts);
    expect(k.length).toBe(2);
    expect(k[0].yaricap).toBeGreaterThan(0);
    expect(k[1].yaricap).toBeGreaterThan(0);
  });

  it("versine ölçüsünden yarıçap: C=40, M=2 → R≈101", () => {
    expect(yaricapKirisVersine(40, 2)).toBeCloseTo(40 * 40 / 16 + 1, 5); // 100+1
  });
});
