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
// Doğrulanmış değerler. BLOK MODELİ DEĞİŞTİ: blok sınırları artık yapay "her N metrede bir"
// bölmeyle değil, GERÇEK sinyal lambaları + istasyonlarla belirlenir (Sinyalizasyon Projesi
// V0808 metrajı). Sinyalsiz kesim tek bloktur → kritik blok, hattın en uzun sinyalsiz açık
// kesimidir; hMin buna göre yükseldi (yapay 500 m bölme kaldırıldığı için kapasite ~%15–25
// düştü — dürüst sonuç). cevrim/sinyal/filo/tepe blok modelinden bağımsız → değişmedi. Kilit budur.
const GOLDEN: Record<string, Golden> = {
  mevcut:   { nTeorik: 13, nSurd: 9,  hMin: 154, cevrim: 2068, baglayan: "Kritik blok — Mevlana Kültür Merkezi", sinyal: 23, gerekenFilo: 5,  tepeYuk: 1391 },
  etap1:    { nTeorik: 20, nSurd: 14, hMin: 175, cevrim: 3666, baglayan: "Kritik blok — Gülistan Caddesi",       sinyal: 30, gerekenFilo: 9,  tepeYuk: 1607 },
  etap2:    { nTeorik: 18, nSurd: 12, hMin: 157, cevrim: 2900, baglayan: "Kritik blok — TÜYAP",                  sinyal: 25, gerekenFilo: 6,  tepeYuk: 1372 },
  birlesik: { nTeorik: 42, nSurd: 30, hMin: 185, cevrim: 7947, baglayan: "Kritik blok — Depo",                   sinyal: 78, gerekenFilo: 15, tepeYuk: 1206 },
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
      const tia = tersIsletmeAnaliz(rings, stock, isletme, cfg);
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
