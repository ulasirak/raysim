// raysim — TARİFE (zaman çizelgesi) üretimi. Çevrim süresi (RTT) + hedef sefer aralığı
// (headway) + servis penceresinden kalkış saatleri ve ARAÇ DİYAGRAMI (hangi araç hangi
// seferi çeker) türetilir. Filo = ⌈çevrim ÷ headway⌉; her araç bir tam turu (çevrim)
// tamamlayıp headway×filo sonra tekrar kalkar (aradaki fark = terminal parkı/layover).

export interface Sefer { no: number; aracNo: number; kalkisSn: number; varisSn: number; }
export interface TarifeSonuc {
  seferler: Sefer[];
  filo: number;              // gereken araç (⌈çevrim ÷ headway⌉)
  seferSayisi: number;
  ilkKalkis: number; sonKalkis: number;
  layoverSn: number;         // araç başına tur başı boşta bekleme (headway×filo − çevrim)
  gecerli: boolean;
}

/** cevrimSn/headwaySn/pencere (s, gün içi saniye) → tarife + araç diyagramı. */
export function tarifeUret(cevrimSn: number, headwaySn: number, baslangicSn: number, bitisSn: number): TarifeSonuc {
  const gecerli = cevrimSn > 0 && headwaySn > 0 && bitisSn > baslangicSn;
  if (!gecerli) return { seferler: [], filo: 0, seferSayisi: 0, ilkKalkis: baslangicSn, sonKalkis: baslangicSn, layoverSn: 0, gecerli: false };
  const filo = Math.max(1, Math.ceil(cevrimSn / headwaySn));
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
    layoverSn: Math.max(0, Math.round(filo * headwaySn - cevrimSn)),
    gecerli: true,
  };
}

/** Araç diyagramı: her araç → çektiği seferlerin kalkış saatleri (sıralı). */
export function aracDiyagrami(t: TarifeSonuc): { aracNo: number; kalkislar: number[] }[] {
  const m = new Map<number, number[]>();
  for (const s of t.seferler) { const a = m.get(s.aracNo) ?? []; a.push(s.kalkisSn); m.set(s.aracNo, a); }
  return [...m.entries()].map(([aracNo, kalkislar]) => ({ aracNo, kalkislar })).sort((a, b) => a.aracNo - b.aracNo);
}
