// raysim — KİLİTLEME (INTERLOCKING) KONTROL TABLOSU (Büyük sıçrama G — sinyalizasyon derinliği).
// SAF (yan-etkisiz). Hattın makas bölgelerinden + sinyallerinden sinyalizasyon
// mühendisliğinin klasik "kontrol tablosunu" (control table / güzergâh-kilit tablosu)
// türetir: her rota için gereken MAKAS KONUMU (Normal/Ters), kilitlenen çakışan
// hareketler, flank/overlap koruması ve tanzim/serbest-bırakma süreleri. Veriler ring
// modelinden gelir (genel + her simülasyon için) — uydurma yok.

import type { DurakArasiRing, MakasBolgesi, MakasTip } from "@/lib/anaray/ring";
import { tccGerekli, MAKAS_TIP_AD } from "@/lib/anaray/ring";

export interface KilitlemeRota {
  makasAd: string;
  km: number;                       // hat başından mutlak kilometraj (m)
  tip: MakasTip;
  tipAd: string;
  rota: string;                     // hareket tanımı
  makasKonum: "Normal" | "Ters";    // gerekli makas konumu (düz / crossover)
  tcc: boolean;                     // her geçişte TCC (trafik kontrol) onayı şart mı
  cakisan: string;                  // kilitlenen / çakışan karşı hareketler
  flankOverlap: string;             // flank + overlap koruma notu
  tanzimSn: number;                 // rota tanzimi (makas hareketi × adet)
  serbestSn: number;                // rota serbest bırakma (kilit açılışı)
  kilitSn: number;                  // toplam kilit süresi (tanzim + serbest)
}

/** Bir makas bölgesinin ürettiği rota(lar) — ana hat düz geçiş + tipe özgü manevra.
 *  `overlapM` = makastan sonraki blok sınırına (sinyal/istasyon) gerçek mesafe. */
function makasRotalari(m: MakasBolgesi, km: number, overlapM: number): KilitlemeRota[] {
  const ov = `overlap ~${overlapM} m`;
  const tanzim = Math.max(1, m.makasSayisi) * Math.max(0, m.makasAdimSuresi);
  const serbest = m.routeRelease;
  const tcc = tccGerekli(m.tip) || m.tccZorunlu;
  const capraz = m.crossover === "x"; // scissors (çift) — ardışık iki yol

  const taban = {
    makasAd: m.ad,
    km: Math.round(km),
    tip: m.tip,
    tipAd: MAKAS_TIP_AD[m.tip],
  };

  // Her makas bölgesi ANA HAT DÜZ geçişe izin verir (makas Normal, çakışma yok).
  const duz: KilitlemeRota = {
    ...taban,
    rota: "Ana hat düz geçiş",
    makasKonum: "Normal",
    tcc: false,
    cakisan: "—",
    flankOverlap: `Çıkış sinyali + overlap bloğu serbest · ${ov}`,
    tanzimSn: 0, // düz konumda ek makas hareketi gerekmez
    serbestSn: serbest,
    kilitSn: serbest,
  };

  // Tipe özgü MANEVRA rotası (makas Ters/crossover) — çakışan hareketleri kilitler.
  let manevra: KilitlemeRota | null = null;
  const mv = (rota: string, cakisan: string, flank: string): KilitlemeRota => ({
    ...taban, rota, makasKonum: "Ters", tcc, cakisan, flankOverlap: `${flank} · ${ov}`,
    tanzimSn: tanzim, serbestSn: serbest, kilitSn: tanzim + serbest,
  });

  switch (m.tip) {
    case "udonus":
      manevra = mv(
        `U-dönüş (şerit değişimi${capraz ? " · scissors" : ""})`,
        "Karşı yön ana hat geçişi kilitli",
        "Karşı hat flank korumalı + dönüş overlap'ı",
      );
      break;
    case "karsilasmali":
      manevra = mv(
        `Karşılaşmalı geçiş (crossover${capraz ? " ×2" : ""})`,
        "Karşı yön ana hat + eşzamanlı karşılaşma kilitli",
        "Her iki hat flank korumalı + overlap",
      );
      break;
    case "barinma":
      manevra = mv(
        "Barınma yoluna giriş (3. yön)",
        "Her iki ana hat geçişi kilitli",
        "Ana hat flank + barınma overlap'ı",
      );
      break;
    case "depo":
      manevra = mv(
        "Depo giriş/çıkış",
        "Ana hat kilitli — tek tren",
        "Ana hat flank + depo boğazı overlap'ı",
      );
      break;
    case "headway":
      // Headway/blok makası: crossover varsa şerit değişimi rotası, yoksa yalnız düz.
      if (m.crossover) {
        manevra = mv(
          `Şerit değişimi (headway makası${capraz ? " ×2" : ""})`,
          "Karşı yön ana hat geçişi kilitli",
          "Karşı hat flank + overlap",
        );
      }
      break;
  }

  return manevra ? [duz, manevra] : [duz];
}

/**
 * Hattın tam kilitleme kontrol tablosu — tüm ringlerin makasları, hat başından
 * mutlak kilometraja göre sıralı. Her satır bir rotayı (makas konumu + kilit +
 * flank/overlap + süreler) betimler.
 */
export function kilitlemeTablosu(rings: DurakArasiRing[]): KilitlemeRota[] {
  // Blok SINIRLARI = istasyonlar (ring başları/sonu) + sinyal lambaları — overlap mesafesi
  // bir makastan bir SONRAKİ blok sınırına kadardır (çıkış sinyali ötesi güvenlik payı).
  const sinirlar: number[] = [];
  let off0 = 0;
  for (const r of rings) {
    sinirlar.push(off0);
    for (const s of r.sinyaller ?? []) sinirlar.push(off0 + s.konum);
    off0 += r.uzunluk;
  }
  sinirlar.push(off0);
  const hatSonu = off0;
  sinirlar.sort((a, b) => a - b);
  const overlapAt = (km: number) => {
    const nx = sinirlar.find((s) => s > km + 1e-6);
    return Math.max(0, Math.round((nx ?? hatSonu) - km));
  };

  const out: KilitlemeRota[] = [];
  let offset = 0;
  for (const r of rings) {
    for (const m of r.makaslar) {
      const gkm = offset + m.konum;
      out.push(...makasRotalari(m, gkm, overlapAt(gkm)));
    }
    offset += r.uzunluk;
  }
  out.sort((a, b) => a.km - b.km);
  return out;
}

/** Özet sayaçlar (panel/rapor başlığı için). */
export function kilitlemeOzet(tablo: KilitlemeRota[]) {
  const makasSet = new Set(tablo.map((t) => `${t.makasAd}@${t.km}`));
  const manevra = tablo.filter((t) => t.makasKonum === "Ters").length;
  const tccli = tablo.filter((t) => t.tcc).length;
  const maxKilit = tablo.reduce((a, t) => Math.max(a, t.kilitSn), 0);
  return { makas: makasSet.size, rota: tablo.length, manevra, tccli, maxKilit };
}
