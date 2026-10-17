import { describe, it, expect } from "vitest";
import { hatAdiTemiz, subeKavsakAdlari, hatOzetMetni, ringlerdenSebeke, flattenRoute } from "../network";
import { hazirHatlar } from "../hazirHatlar";
import type { DurakArasiRing, Sube } from "../ring";

describe("hatAdiTemiz — gömülü sayısal betimleyiciyi atar, editöryeli korur", () => {
  it("sondaki '… km · … istasyon …' parantezini siler", () => {
    expect(hatAdiTemiz("Alaaddin – Adliye (5,2 km · 8 istasyon)")).toBe("Alaaddin – Adliye");
    expect(hatAdiTemiz("Samsun · OMÜ – Tekkeköy (~27,0 km · 35 istasyon)")).toBe("Samsun · OMÜ – Tekkeköy");
  });
  it("sayı içeren birleşik parantezi tümüyle atar", () => {
    expect(hatAdiTemiz("Alaaddin – Stadyum (~25,5 km · 29 istasyon · Adliye & Aslım kavşaklı)")).toBe("Alaaddin – Stadyum");
  });
  it("sayısal OLMAYAN editöryel parantezi korur", () => {
    expect(hatAdiTemiz("Alaaddin – Stadyum (Adliye & Aslım kavşaklı)")).toBe("Alaaddin – Stadyum (Adliye & Aslım kavşaklı)");
    expect(hatAdiTemiz("Samsun · OMÜ Rektörlük (Eczaneler) – Tekkeköy")).toBe("Samsun · OMÜ Rektörlük (Eczaneler) – Tekkeköy");
  });
  it("parantezsiz adı değiştirmez, boş/parçalı girdide çökmez", () => {
    expect(hatAdiTemiz("Alaaddin – Adliye")).toBe("Alaaddin – Adliye");
    expect(hatAdiTemiz("")).toBe("");
  });
});

describe("subeKavsakAdlari — yalnız iç kavşaklar (şube ayrım durağı)", () => {
  const rings = [
    { fromAd: "Başı", toAd: "A" },
    { fromAd: "A", toAd: "B" },
    { fromAd: "B", toAd: "C" },
  ] as unknown as DurakArasiRing[];
  const sube = (atIndex: number): Sube => ({ id: "s", ad: "Şube", atIndex, rings: [{} as DurakArasiRing] } as unknown as Sube);

  it("atIndex iç durağa denk gelince o durağın adını verir", () => {
    expect(subeKavsakAdlari(rings, [sube(2)])).toEqual(["B"]);
  });
  it("hat başı (0) ve hat sonu (= rings.length) kavşak sayılmaz", () => {
    expect(subeKavsakAdlari(rings, [sube(0)])).toEqual([]);
    expect(subeKavsakAdlari(rings, [sube(3)])).toEqual([]);
  });
  it("şube yoksa boş", () => {
    expect(subeKavsakAdlari(rings, [])).toEqual([]);
  });
});

describe("hatOzetMetni — hazır hatların CANLI özeti (bayatlamaz)", () => {
  for (const h of hazirHatlar()) {
    it(`${h.key}: 'km · istasyon' canlı üretir ve ad sayı içermez`, () => {
      const v = h.veri;
      const seb = ringlerdenSebeke(v.rings, v.cfg, v.meta.hatAdi, v.subeler ?? []);
      expect(seb).not.toBeNull();
      const line = flattenRoute(seb!.network, seb!.route);
      const ozet = hatOzetMetni(line, v.rings, v.subeler ?? []);
      // Biçim: "<n.n> km · <N> istasyon …"
      expect(ozet).toMatch(/^\d+(\.\d)? km · \d+ istasyon/);
      // İstasyon sayısı line'dan gelir, elle yazılan sayı değil
      const sayi = line.stations.filter((s) => s.tip !== "gecit").length;
      expect(ozet).toContain(`${sayi} istasyon`);
      // Temizlenmiş ad artık gömülü km/istasyon taşımaz
      expect(hatAdiTemiz(v.meta.hatAdi)).not.toMatch(/\bkm\b|istasyon/i);
    });
  }

  it("mevcut hat canlı 8 istasyon verir (eski gömülü sayı ile tutarlı)", () => {
    const h = hazirHatlar().find((x) => x.key === "mevcut")!;
    const seb = ringlerdenSebeke(h.veri.rings, h.veri.cfg, h.veri.meta.hatAdi, h.veri.subeler ?? [])!;
    const line = flattenRoute(seb.network, seb.route);
    expect(hatOzetMetni(line, h.veri.rings)).toContain("8 istasyon");
  });
});
