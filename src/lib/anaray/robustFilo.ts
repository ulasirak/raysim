// raysim — ROBUSTLUK-KISITLI FİLO ÇÖZÜCÜSÜ (iki motoru bağlar: kapasite + Monte-Carlo).
// SAF (yan-etkisiz). Var olan iki motoru birbirine bağlayan gerçek çözücü:
//   • maksimumTren → çevrim, hMin, kapasite duvarı (nMax)
//   • signalling.monteCarlo → her filo/headway için GÜVENİLİRLİK (onTimePct %)
// GERİLİM: daha çok filo = daha kısa headway = daha az tampon → gecikme daha çok
// yayılır → GÜVENİLİRLİK DÜŞER. Konfor ise TERSİNE daha çok filo ister. Böylece
// FİZİBIL FİLO PENCERESİ doğar: [konfor alt sınırı .. robustluk üst sınırı].
// Çözücü, "kapasite + konfor + %X güvenilirlik kısıtları altında MİNİMUM filo"yu bulur.
//
// Güvenilirlik pahalı (Monte-Carlo) olduğundan bu modül onu bir GERİ ÇAĞRIYLA alır
// (guvenilirlikFn) → saf + testli kalır; panel gerçek monteCarlo'yu bağlar.

export interface RobustNokta {
  filo: number;
  headwaySn: number;       // etkin headway = max(hMin, çevrim÷filo)
  guvenilirlik: number;    // Monte-Carlo onTimePct (0..100) — eşik altında varan tren %
  beklemeDk: number;       // yolcu ortalama bekleme = headway ÷ 2 (dk)
  doluluk: number | null;  // araç doluluğu (talep yoksa null)
  robustUygun: boolean;    // guvenilirlik ≥ hedef
  konforUygun: boolean;    // doluluk ≤ tavan (talep yoksa daima true)
  uygun: boolean;          // robust + konfor + filo ≤ nMax (tüm kısıtlar)
}

export interface RobustSonuc {
  noktalar: RobustNokta[];
  hedefGuvenilirlik: number;     // %
  duvarFilo: number;             // nMax (kapasite duvarı)
  onerilenFilo: number | null;   // TÜM kısıtları sağlayan EN AZ filo (çözüm)
  robustMaxFilo: number | null;  // güvenilirliği hâlâ sağlayan EN FAZLA filo (üst sınır)
  konforMinFilo: number | null;  // konforu sağlayan EN AZ filo (alt sınır)
  fizibil: boolean;              // tüm kısıtları sağlayan bir filo var mı
  demandVar: boolean;
  konforTavani: number;
  cevrimSn: number;
  hMinSn: number;
}

export interface RobustGirdi {
  cevrimSn: number;
  hMinSn: number;
  nMax: number;                 // kapasite duvarı (maksimumTren.nTeorik)
  pikYolcuSaat?: number;
  aracKapasite?: number;
  konforTavani?: number;        // dolulukHedefi (0..1)
  hedefGuvenilirlik?: number;   // % (0..100), varsayılan 90
  ustFilo?: number;             // tarama üst sınırı (varsayılan nMax)
}

/**
 * Filo 1..nMax taranır; her filo için headway → guvenilirlikFn(headway, filo) ile
 * güvenilirlik (Monte-Carlo onTimePct %) alınır. Konfor + robustluk kısıtları uygulanır.
 * @param guvenilirlikFn (headwaySn, filo) → onTimePct (0..100)
 */
export function robustFiloPenceresi(
  g: RobustGirdi,
  guvenilirlikFn: (headwaySn: number, filo: number) => number,
): RobustSonuc {
  const cevrim = Math.max(1, g.cevrimSn);
  const hMin = Math.max(1, g.hMinSn);
  const nMax = Math.max(1, Math.round(g.nMax));
  const hedef = Math.min(100, Math.max(0, g.hedefGuvenilirlik ?? 90));
  const demandVar = !!(g.pikYolcuSaat && g.pikYolcuSaat > 0 && g.aracKapasite && g.aracKapasite > 0);
  const konforTavani = Math.min(1, Math.max(0, g.konforTavani ?? 0.85));
  const ust = Math.max(1, Math.min(60, g.ustFilo ? Math.round(g.ustFilo) : nMax));

  const noktalar: RobustNokta[] = [];
  for (let f = 1; f <= ust; f++) {
    const hw = Math.max(hMin, cevrim / f);
    const guv = Math.min(100, Math.max(0, guvenilirlikFn(hw, f)));
    const bek = hw / 2 / 60;
    const dol = demandVar ? (g.pikYolcuSaat! * (hw / 3600)) / g.aracKapasite! : null;
    const robustUygun = guv + 1e-9 >= hedef;
    const konforUygun = !demandVar || dol == null || dol <= konforTavani + 1e-9;
    const uygun = robustUygun && konforUygun && f <= nMax;
    noktalar.push({ filo: f, headwaySn: hw, guvenilirlik: guv, beklemeDk: bek, doluluk: dol, robustUygun, konforUygun, uygun });
  }

  const konforMinFilo = demandVar ? (noktalar.find((n) => n.konforUygun)?.filo ?? null) : null;
  const robustlar = noktalar.filter((n) => n.robustUygun && n.filo <= nMax);
  const robustMaxFilo = robustlar.length ? robustlar[robustlar.length - 1].filo : null;
  const uygunlar = noktalar.filter((n) => n.uygun);
  const onerilenFilo = uygunlar.length ? uygunlar[0].filo : null;

  return {
    noktalar,
    hedefGuvenilirlik: hedef,
    duvarFilo: nMax,
    onerilenFilo,
    robustMaxFilo,
    konforMinFilo,
    fizibil: onerilenFilo != null,
    demandVar,
    konforTavani,
    cevrimSn: cevrim,
    hMinSn: hMin,
  };
}
