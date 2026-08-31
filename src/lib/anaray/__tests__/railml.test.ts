// railML içe aktarma çekirdeği testi — sentetik railML XML'den ring zinciri.
// İki konumlama stili (crossSection ocpRef+pos / ocp'nin kendi pos'u), pos'a göre
// sıralama ve hata durumları doğrulanır.

import { describe, it, expect } from "vitest";
import { railmlHatKur } from "@/lib/anaray/railml";

// (a) crossSection stili — doc sırası KARIŞIK (cs3 önce) ama pos'a göre sıralanmalı.
const xmlCross = `<?xml version="1.0"?>
<railml xmlns="https://www.railml.org/schemas/2021">
  <infrastructure>
    <operationControlPoints>
      <ocp id="a" name="İstasyon A"/>
      <ocp id="b" name="İstasyon B"/>
      <ocp id="c" name="İstasyon C"/>
    </operationControlPoints>
    <tracks>
      <track id="t1"><trackTopology><crossSections>
        <crossSection id="cs3" pos="2100" ocpRef="c"/>
        <crossSection id="cs1" pos="0" ocpRef="a"/>
        <crossSection id="cs2" pos="1200" ocpRef="b"/>
      </crossSections></trackTopology></track>
    </tracks>
  </infrastructure>
</railml>`;

// (b) ocp'nin kendi pos/absPos'u.
const xmlOcpPos = `<railml><infrastructure><operationControlPoints>
  <ocp id="x" name="X" pos="0"/>
  <ocp id="y" name="Y" absPos="1500"/>
</operationControlPoints></infrastructure></railml>`;

describe("railML import çekirdeği", () => {
  it("crossSection stili → 2 ring (3 durak), pos'a göre sıralı", () => {
    const s = railmlHatKur(xmlCross);
    expect(s.rings).toHaveLength(2);
    expect(s.durakSayisi).toBe(3);
    expect(s.rings[0].fromAd).toBe("İstasyon A");
    expect(s.rings[0].toAd).toBe("İstasyon B");
    expect(s.rings[0].uzunluk).toBe(1200);
    expect(s.rings[1].uzunluk).toBe(900);
    expect(s.toplamKm).toBeCloseTo(2.1, 5);
  });

  it("worst/best türetildi + kilometraj uyarısı", () => {
    const s = railmlHatKur(xmlCross);
    expect(s.rings[0].worstUzunluk).toBeGreaterThanOrEqual(1200);
    expect(s.rings[0].bestUzunluk).toBeLessThanOrEqual(1200);
    expect(s.uyarilar.some((u) => u.includes("kilometraj"))).toBe(true);
  });

  it("ocp-pos stili (pos/absPos) → 1 ring 1500 m", () => {
    const s = railmlHatKur(xmlOcpPos);
    expect(s.rings).toHaveLength(1);
    expect(s.rings[0].fromAd).toBe("X");
    expect(s.rings[0].uzunluk).toBe(1500);
  });

  it("railML olmayan → hata", () => {
    expect(() => railmlHatKur("<html><body>merhaba</body></html>")).toThrow();
  });

  it("konumlu ocp yoksa → anlamlı hata", () => {
    expect(() => railmlHatKur('<railml><infrastructure><operationControlPoints><ocp id="a" name="A"/></operationControlPoints></infrastructure></railml>')).toThrow(/konumlu/);
  });
});
