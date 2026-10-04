import { describe, it, expect } from "vitest";
import { parkAnahtar, durakKonumu, konumDurakIndex, queuedYaz, queuedOku } from "@/lib/anaray/parklanma";
import { yeniRing, type DurakArasiRing } from "@/lib/anaray/ring";

function trunk(): DurakArasiRing[] {
  // A→B→C→D : 1000 + 1200 + 800
  return [["A", "B", 1000], ["B", "C", 1200], ["C", "D", 800]].map(([f, t, u]) => {
    const r = yeniRing(f as string, t as string); r.uzunluk = u as number; return r;
  });
}

describe("parklanma iki yönlü ayna eşlemesi", () => {
  it("parkAnahtar konumu yuvarlar", () => {
    expect(parkAnahtar(0)).toBe("d0");
    expect(parkAnahtar(2199.6)).toBe("d2200");
  });

  it("durakKonumu kümülatif konum verir (k=0 → 0)", () => {
    const r = trunk();
    expect(durakKonumu(r, 0)).toBe(0);
    expect(durakKonumu(r, 1)).toBe(1000);
    expect(durakKonumu(r, 2)).toBe(2200);
    expect(durakKonumu(r, 3)).toBe(3000);
  });

  it("konumDurakIndex, durakKonumu'nun tersidir (round-trip)", () => {
    const r = trunk();
    for (let k = 0; k <= r.length; k++) {
      expect(konumDurakIndex(r, durakKonumu(r, k))).toBe(k);
    }
    expect(konumDurakIndex(r, 999999)).toBe(-1); // eşleşmeyen konum
  });

  it("queuedYaz/queuedOku: k=0 fromQueued, k≥1 queued", () => {
    let r = trunk();
    r = queuedYaz(r, 0, 3);   // hat başı
    r = queuedYaz(r, 2, 5);   // C durağı (ring[1].queued)
    expect(queuedOku(r, 0)).toBe(3);
    expect(r[0].fromQueued).toBe(3);
    expect(queuedOku(r, 2)).toBe(5);
    expect(r[1].queued).toBe(5);
    expect(queuedOku(r, 1)).toBe(0); // dokunulmamış
  });

  it("queuedYaz üst sınırı 40, alt sınırı 0", () => {
    let r = trunk();
    r = queuedYaz(r, 1, 999);
    expect(queuedOku(r, 1)).toBe(40);
    r = queuedYaz(r, 1, -5);
    expect(queuedOku(r, 1)).toBe(0);
  });

  it("tam ayna senaryosu: Studio konumdan yazar → RingEditor index'ten okur, eşit", () => {
    const r = trunk();
    // Studio: C deposuna (konum 2200) 4 araç dizdi
    const di = konumDurakIndex(r, 2200);
    const r2 = queuedYaz(r, di, 4);
    // RingEditor aynı durağı (index 2) okur
    expect(queuedOku(r2, 2)).toBe(4);
    // ve parklanmaDagilim anahtarı tutarlı
    expect(parkAnahtar(durakKonumu(r2, 2))).toBe("d2200");
  });
});
