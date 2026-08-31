// GOLDEN-MASTER — kapasite motoru çıktılarını SABİTLER (regresyon kalkanı).
// 4 gerçek Konya hattı (hazır CAD verisi) için nTeorik/sürdürülebilir/min headway/
// çevrim/darboğaz/sinyal/talep değerleri bilinen-doğru değerlere KİLİTLENİR. Motorda
// bir değişiklik bu sayıları oynatırsa test kırılır → sessiz regresyon (ör. 130↔148
// blocking-time bug'ı) anında yakalanır. Ayrıca hMin == blockingTime tutarlılığı ve
// tersIsletmeAnaliz talep çıktısı doğrulanır. Tümü rapor/karşılaştırma/canlı sim ile
// AYNI çekirdek fonksiyonlarıdır → bu testler o üç yüzeyi de korur.

import { describe, it, expect } from "vitest";
import { hazirHatlar } from "@/lib/anaray/hazirHatlar";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { blockingTimeRing } from "@/lib/anaray/blockingtime";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { hatOzellikleri } from "@/lib/anaray/network";
import { varsayilanConfig, varsayilanIsletme } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";

interface Golden {
  nTeorik: number; nSurd: number; hMin: number; cevrim: number;
  baglayan: string; sinyal: number; gerekenFilo: number; tepeYuk: number;
}
// Doğrulanmış değerler (bu oturumda motorla iki kez teyit edildi). Kilit budur.
const GOLDEN: Record<string, Golden> = {
  mevcut:   { nTeorik: 15, nSurd: 10, hMin: 135, cevrim: 2080, baglayan: "Kritik blok — Hükümet",     sinyal: 23, gerekenFilo: 5,  tepeYuk: 1466 },
  etap1:    { nTeorik: 26, nSurd: 18, hMin: 139, cevrim: 3703, baglayan: "Kritik blok — Ravza Camii",  sinyal: 30, gerekenFilo: 9,  tepeYuk: 1605 },
  etap2:    { nTeorik: 23, nSurd: 16, hMin: 125, cevrim: 2885, baglayan: "Kritik blok — Betoncular",   sinyal: 25, gerekenFilo: 7,  tepeYuk: 1405 },
  birlesik: { nTeorik: 54, nSurd: 37, hMin: 148, cevrim: 7986, baglayan: "Kritik blok — Adliye",       sinyal: 78, gerekenFilo: 15, tepeYuk: 1213 },
};

const hatlar = hazirHatlar();

describe("Kapasite motoru — golden-master (4 Konya hattı)", () => {
  for (const [key, g] of Object.entries(GOLDEN)) {
    describe(key, () => {
      const h = hatlar.find((x) => x.key === key);
      if (!h) throw new Error(`Hazır hat bulunamadı: ${key}`);
      const cfg = { ...varsayilanConfig, ...(h.veri.cfg ?? {}) };
      const isletme = { ...varsayilanIsletme, ...(h.veri.isletme ?? {}) };
      const stock = h.veri.arac ?? varsayilanArac;
      const rings = dwellUygulanmisRings(h.veri.rings ?? [], stock, isletme);
      const m = maksimumTren(rings, stock, cfg, isletme);
      const bt = blockingTimeRing(rings, stock, cfg, isletme.kalkisOluZamaniSn);
      const tia = tersIsletmeAnaliz(rings, stock, isletme, cfg, "toplam");
      const sinyal = hatOzellikleri(rings, cfg).filter((f) => f.kind === "sinyal").length;

      it("hesap geçerli", () => expect(m.gecerli).toBe(true));
      it(`teorik maks tramvay = ${g.nTeorik}`, () => expect(m.nTeorik).toBe(g.nTeorik));
      it(`sürdürülebilir (UIC 406) = ${g.nSurd}`, () => expect(m.nSurdurulebilir).toBe(g.nSurd));
      it(`min headway = ${g.hMin} s`, () => expect(Math.round(m.hMin)).toBe(g.hMin));
      it(`çevrim = ${g.cevrim} s`, () => expect(Math.round(m.cevrimSuresi)).toBe(g.cevrim));
      it(`belirleyici kısıt = "${g.baglayan}"`, () => expect(m.baglayanAd).toBe(g.baglayan));
      it(`sinyal (SG) sayısı = ${g.sinyal}`, () => expect(sinyal).toBe(g.sinyal));

      // TUTARLILIK: kapasite min-headway'i, blocking-time Sperrzeit'i ile BİREBİR olmalı
      // (rapor & Sistem Merkezi bu ikisini ayrı yüzeyde gösterir; ayrışırsa 130↔148 bug'ı).
      it("min headway == blockingTime (tutarlı)", () => expect(Math.round(bt.minHeadway)).toBe(Math.round(m.hMin)));

      // TALEP çekirdeği (rapor 5.5 / karşılaştırma "gereken filo" & "tepe yük")
      it("talep analizi üretildi", () => expect(tia).not.toBeNull());
      it(`gereken filo (talep) = ${g.gerekenFilo}`, () => expect(tia?.filo.gerekenArac).toBe(g.gerekenFilo));
      it(`tepe yük = ${g.tepeYuk} yolcu/saat`, () => expect(tia?.tepeYuk).toBe(g.tepeYuk));
    });
  }
});
