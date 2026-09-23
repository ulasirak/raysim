// raysim — ASPECT DİZİLİM (SIGNAL ASPECT SEQUENCE) — Büyük sıçrama G, sinyalizasyon derinliği.
// SAF (yan-etkisiz). Hattın ileri-yön sinyallerinden + istasyon blok sınırlarından
// klasik 3-aspect (Yol / Tedbir / Dur) blok dizilimini türetir ve her bloğun
// UYARI (sarı) mesafesini hattın tasarım hızındaki servis-fren mesafesine karşı
// denetler — sinyalizasyon mühendisliğinin "aspect spacing / sighting" kontrolü.
// Veriler ring modelinden gelir (genel + her simülasyon için); uydurma yok.

import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { SimConfig } from "@/lib/anaray/config";

export type Aspect = "yesil" | "sari" | "kirmizi";

/** Aspect Türkçe demiryolu karşılıkları. */
export const ASPECT_AD: Record<Aspect, string> = {
  yesil: "Yol",       // proceed
  sari: "Tedbir",     // caution — bir sonraki sinyal Dur, durmaya hazırlan
  kirmizi: "Dur",     // stop — blok işgal
};

export interface AspectBlok {
  no: number;             // 1..n
  basKm: number;          // blok girişi (giriş sinyali) — hat başından m
  sonKm: number;          // blok sonu (bir sonraki sınır) — m
  uzunluk: number;        // m
  yeterli: boolean;       // uzunluk >= fren mesafesi (uyarı bloğu görüş/fren için yeterli mi)
}

export interface AspectSinyalDurum {
  no: number;             // blok girişi sinyali (blok no ile aynı)
  km: number;             // m
  aspect: Aspect;         // seçili işgal senaryosunda gösterdiği aspect
}

export interface AspectDizilimSonuc {
  yon: "giden";
  tasarimHizKmh: number;      // tasarım hızı (vAnahat) — km/h
  frenSaniye: number;         // servis fren süresi v/b — s
  frenMesafesi: number;       // v²/(2·b) — m (uyarı bloğu için gerekli asgari uzunluk)
  bloklar: AspectBlok[];
  isgalBlok: number;          // seçili işgal bloğu (1..n) — Dur sinyalinin koruduğu blok
  sinyaller: AspectSinyalDurum[];
  hatUzunluk: number;         // m
  minBlok: number;            // en kısa blok — m
  yetersizBlok: number;       // fren mesafesinden kısa blok sayısı
}

/** İleri-yön (giden, ters-işletme değil) blok SINIRLARINI çıkarır:
 *  her istasyon (ring başı/sonu) + ileri sinyal. Sıralı, tekilleştirilmiş. */
export function aspectSinirlar(rings: DurakArasiRing[]): number[] {
  const s = new Set<number>();
  let off = 0;
  s.add(0);
  for (const r of rings) {
    for (const sig of r.sinyaller ?? []) {
      if (sig.yon === "giden" && !sig.tersIsletme) s.add(Math.round(off + sig.konum));
    }
    off += r.uzunluk;
    s.add(Math.round(off));
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * 3-aspect blok dizilimi + fren-mesafesi denetimi + seçili işgal için aspect durumu.
 * @param isgalBlok Dur gösterecek (işgal) blok no (1..n). Verilmezse en kısıtlayıcı
 *   (ilk yetersiz, yoksa orta) blok seçilir — deterministik.
 */
export function aspectDizilim(
  rings: DurakArasiRing[],
  cfg: SimConfig,
  isgalBlok?: number,
): AspectDizilimSonuc {
  const sinirlar = aspectSinirlar(rings);
  const hatUzunluk = sinirlar.length ? sinirlar[sinirlar.length - 1] : 0;

  // Tasarım hızı = ana hat azami; servis fren = cfg.yavaslama (m/s²).
  const v = Math.max(0, cfg.vAnahat);              // m/s
  const b = Math.max(0.1, cfg.yavaslama);          // m/s² (0'a bölme koruması)
  const frenMesafesi = (v * v) / (2 * b);
  const frenSaniye = v / b;
  const tasarimHizKmh = v * 3.6;

  // Bloklar = ardışık sınır çiftleri (son sınır = terminal, blok yok).
  const bloklar: AspectBlok[] = [];
  for (let i = 0; i < sinirlar.length - 1; i++) {
    const bas = sinirlar[i];
    const son = sinirlar[i + 1];
    const uz = son - bas;
    bloklar.push({
      no: i + 1,
      basKm: bas,
      sonKm: son,
      uzunluk: uz,
      yeterli: uz + 1e-6 >= frenMesafesi,
    });
  }

  const minBlok = bloklar.reduce((a, blk) => Math.min(a, blk.uzunluk), Infinity);
  const yetersizBlok = bloklar.filter((blk) => !blk.yeterli).length;

  // İşgal bloğu seçimi (deterministik): verilen → yoksa ilk yetersiz → yoksa orta.
  let isgal = isgalBlok ?? 0;
  if (!isgal || isgal < 1 || isgal > bloklar.length) {
    const ilkYetersiz = bloklar.find((blk) => !blk.yeterli);
    isgal = ilkYetersiz ? ilkYetersiz.no : Math.max(1, Math.ceil(bloklar.length / 2));
  }

  // Aspect durumu — her blok girişi sinyali için (3-aspect step-down):
  //   işgal bloğunun girişi → Dur (kırmızı)
  //   bir gerideki (uyarı) blok girişi → Tedbir (sarı)
  //   diğer tüm sinyaller → Yol (yeşil)
  const sinyaller: AspectSinyalDurum[] = bloklar.map((blk) => {
    let aspect: Aspect = "yesil";
    if (blk.no === isgal) aspect = "kirmizi";
    else if (blk.no === isgal - 1) aspect = "sari";
    return { no: blk.no, km: blk.basKm, aspect };
  });

  return {
    yon: "giden",
    tasarimHizKmh,
    frenSaniye,
    frenMesafesi,
    bloklar,
    isgalBlok: isgal,
    sinyaller,
    hatUzunluk,
    minBlok: bloklar.length ? minBlok : 0,
    yetersizBlok,
  };
}
