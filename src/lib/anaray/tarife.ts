// raysim — TARİFE (zaman çizelgesi) üretimi. Çevrim süresi (RTT) + hedef sefer aralığı
// (headway) + servis penceresinden kalkış saatleri ve ARAÇ DİYAGRAMI (hangi araç hangi
// seferi çeker) türetilir. Filo = ⌈çevrim ÷ headway⌉; her araç bir tam turu (çevrim)
// tamamlayıp headway×filo sonra tekrar kalkar (aradaki fark = terminal parkı/layover).

export interface Sefer { no: number; aracNo: number; kalkisSn: number; varisSn: number; }
export interface TarifeSonuc {
  seferler: Sefer[];
  filo: number;              // gereken araç (⌈(çevrim + mola) ÷ headway⌉)
  seferSayisi: number;
  ilkKalkis: number; sonKalkis: number;
  molaSn: number;            // tur başı zorunlu terminal molası (s) — çevrime eklenir
  layoverSn: number;         // araç başına molanın ÜSTÜNDE kalan boşta bekleme (headway×filo − çevrim − mola)
  gecerli: boolean;
}

/**
 * cevrimSn/headwaySn/pencere (s, gün içi saniye) + tur başı mola → tarife + araç diyagramı.
 * Mola tam tur süresine eklenir: araç, seferini bitirdikten sonra terminalde `molaSn` bekleyip
 * sıraya döner. Bu yüzden filo = ⌈(çevrim + mola) ÷ headway⌉ ve mola arttıkça (sabit filoda)
 * ulaşılan sıklık düşer / gereken araç artar. Kalkışlar yine headway aralıklıdır; varış = trip.
 */
export function tarifeUret(cevrimSn: number, headwaySn: number, baslangicSn: number, bitisSn: number, molaSn = 0): TarifeSonuc {
  const mola = Math.max(0, molaSn);
  const gecerli = cevrimSn > 0 && headwaySn > 0 && bitisSn > baslangicSn;
  if (!gecerli) return { seferler: [], filo: 0, seferSayisi: 0, ilkKalkis: baslangicSn, sonKalkis: baslangicSn, molaSn: mola, layoverSn: 0, gecerli: false };
  const filo = Math.max(1, Math.ceil((cevrimSn + mola) / headwaySn));
  const seferler: Sefer[] = [];
  let no = 1;
  for (let t = baslangicSn; t <= bitisSn + 1e-6; t += headwaySn) {
    seferler.push({ no, aracNo: ((no - 1) % filo) + 1, kalkisSn: Math.round(t), varisSn: Math.round(t + cevrimSn) });
    no++;
  }
  return {
    seferler, filo, seferSayisi: seferler.length,
    ilkKalkis: baslangicSn,
    sonKalkis: seferler.length ? seferler[seferler.length - 1].kalkisSn : baslangicSn,
    molaSn: mola,
    layoverSn: Math.max(0, Math.round(filo * headwaySn - cevrimSn - mola)),
    gecerli: true,
  };
}

/** Araç diyagramı: her araç → çektiği seferlerin kalkış saatleri (sıralı). */
export function aracDiyagrami(t: TarifeSonuc): { aracNo: number; kalkislar: number[] }[] {
  const m = new Map<number, number[]>();
  for (const s of t.seferler) { const a = m.get(s.aracNo) ?? []; a.push(s.kalkisSn); m.set(s.aracNo, a); }
  return [...m.entries()].map(([aracNo, kalkislar]) => ({ aracNo, kalkislar })).sort((a, b) => a.aracNo - b.aracNo);
}
