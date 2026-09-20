// raysim — KARAR DESTEK / OPTİMİZASYON (Büyük sıçrama F).
// SAF (yan-etkisiz). "Çizen değil karar verdiren" araç: filo ile ulaşılan sefer
// aralığı (headway) arasındaki ödünleşimi (trade-off) ve hedef-aramayı türetir.
// İlişki: ulaşılan headway = çevrim ÷ filo. Kapasite DUVARI: headway fiziksel
// minimumun (hMin) altına inemez → filo, çevrim÷hMin'i aşamaz. Motor değerlerinden
// (maksimumTren: çevrim, hMin, nSürdürülebilir) beslenir — uydurma yok.

export interface FiloNokta {
  filo: number;
  headwaySn: number;   // ulaşılan headway = çevrim ÷ filo
  uygun: boolean;      // headway ≥ hMin (kapasite duvarının altında mı)
}

/** Filo 1..üst için ulaşılan headway eğrisi (kapasite duvarı işaretli). */
export function filoHeadwayEgrisi(cevrimSn: number, hMinSn: number, ustFilo: number): FiloNokta[] {
  const out: FiloNokta[] = [];
  const ust = Math.max(1, Math.min(80, Math.round(ustFilo)));
  for (let f = 1; f <= ust; f++) {
    const hw = cevrimSn / f;
    out.push({ filo: f, headwaySn: hw, uygun: hw >= hMinSn - 1e-6 });
  }
  return out;
}

export interface HedefSonuc {
  filo: number;              // hedef headway için gereken en az filo
  ulasilanHeadwaySn: number; // o filoyla gerçekte ulaşılan headway (≤ hedef)
  uygun: boolean;            // gereken filo kapasiteyi (nMax) aşmıyor mu
  kapasiteFilo: number;      // kapasite duvarındaki en fazla filo
}

/** Hedef-arama: verilen hedef headway'e ulaşmak için gereken en az filo + uygunluk. */
export function hedefFilo(cevrimSn: number, hedefHeadwaySn: number, nMax: number): HedefSonuc {
  const hedef = Math.max(1, hedefHeadwaySn);
  const filo = Math.max(1, Math.ceil(cevrimSn / hedef));
  const kapasiteFilo = Math.max(1, Math.round(nMax));
  return {
    filo,
    ulasilanHeadwaySn: cevrimSn / filo,
    uygun: filo <= kapasiteFilo,
    kapasiteFilo,
  };
}

/** Fiziksel olarak ulaşılabilecek EN İYİ (en küçük) headway — kapasite duvarında. */
export function enIyiHeadwaySn(cevrimSn: number, nMax: number): number {
  const f = Math.max(1, Math.round(nMax));
  return cevrimSn / f;
}
