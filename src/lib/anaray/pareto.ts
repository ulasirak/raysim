// raysim — PARETO ÇOK-AMAÇLI OPTİMİZASYON (Büyük sıçrama F — karar destek derinliği).
// SAF (yan-etkisiz). Filo kararına karşı ÇAKIŞAN amaçları birlikte değerlendirir:
//   1) İşletme yükü (maliyet)  ~ filo (araç sayısı)        → küçült
//   2) Yolcu bekleme süresi    = etkin headway ÷ 2         → küçült
//   3) Araç doluluğu (konfor)  = pik biniş × headway ÷ kap → küçült  (talep varsa)
// Etkin headway = max(hMin, çevrim÷filo): kapasite duvarını (hMin) aşan filo
// headway'i düşürmez → o noktalar BASKIN ALTINDADIR (aşırı filo, servis kazancı yok).
// Pareto-etkin küme + DİZ noktası (en iyi denge) + ağırlıklı optimum türetilir.
// Değerler motordan (maksimumTren: çevrim, hMin, nMax) gelir — uydurma yok.

export interface ParetoNokta {
  filo: number;
  headwaySn: number;       // etkin headway = max(hMin, çevrim÷filo)
  beklemeDk: number;       // yolcu ortalama bekleme = headway ÷ 2 (dk)
  maliyet: number;         // işletme yükü göstergesi = filo
  doluluk: number | null;  // araç doluluğu (0..1+); talep yoksa null
  konforUygun: boolean;    // doluluk ≤ konfor tavanı (talep yoksa daima true)
  etkin: boolean;          // Pareto-etkin (baskın altında değil)
  diz: boolean;            // diz (knee) noktası — en iyi denge (matematiksel dirsek)
  optimum: boolean;        // ağırlıklı optimum (konfor-uygun kümede)
  skor: number;            // ağırlıklı normalize skor (küçük = iyi)
}

export interface ParetoSonuc {
  noktalar: ParetoNokta[];
  duvarFilo: number;       // nMax — kapasite duvarındaki en fazla anlamlı filo
  dizFilo: number;         // diz noktası filosu (matematiksel dirsek)
  optimumFilo: number;     // ağırlıklı optimum filo (konfor-uygun kümede)
  konforFilo: number | null; // konforu (doluluk ≤ tavan) sağlayan en az filo; talep yoksa/hiç yoksa null
  konforSaglanabilir: boolean; // etkin küme içinde konfor sağlanabiliyor mu
  agirlik: number;         // 0 = maliyet önceliği .. 1 = servis (bekleme) önceliği
  demandVar: boolean;
  konforTavani: number;    // dolulukHedefi — bu oranın üstü "tıkanma"
  cevrimSn: number;
  hMinSn: number;
}

export interface ParetoGirdi {
  cevrimSn: number;
  hMinSn: number;
  nMax: number;                 // kapasite duvarı filosu (maksimumTren.nTeorik)
  pikYolcuSaat?: number;        // tek yön pik talep (yolcu/saat)
  aracKapasite?: number;        // araç yolcu kapasitesi
  konforTavani?: number;        // dolulukHedefi (0..1)
  agirlik?: number;             // 0..1 (maliyet↔servis), varsayılan 0,5
  ustFilo?: number;             // üst filo taraması (baskın kuyruğu göstermek için)
}

/** A, B'yi baskılar mı? (tüm amaçlarda ≤ ve en az birinde <). */
function baskilar(a: number[], b: number[]): boolean {
  let kucuk = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i] + 1e-9) return false;
    if (a[i] < b[i] - 1e-9) kucuk = true;
  }
  return kucuk;
}

export function paretoAnaliz(g: ParetoGirdi): ParetoSonuc {
  const cevrim = Math.max(1, g.cevrimSn);
  const hMin = Math.max(1, g.hMinSn);
  const nMax = Math.max(1, Math.round(g.nMax));
  const agirlik = Math.min(1, Math.max(0, g.agirlik ?? 0.5));
  const demandVar = !!(g.pikYolcuSaat && g.pikYolcuSaat > 0 && g.aracKapasite && g.aracKapasite > 0);
  const konforTavani = Math.min(1, Math.max(0, g.konforTavani ?? 0.85));

  // Baskın kuyruğu görünür olsun diye duvarın ötesine birkaç filo tara.
  const kuyruk = Math.max(3, Math.round(nMax * 0.3));
  const ust = Math.max(1, Math.min(80, g.ustFilo ? Math.round(g.ustFilo) : nMax + kuyruk));

  // Ham noktalar + amaç vektörleri.
  type Ham = { filo: number; hw: number; bek: number; mal: number; dol: number | null; amac: number[] };
  const ham: Ham[] = [];
  for (let f = 1; f <= ust; f++) {
    const hw = Math.max(hMin, cevrim / f);              // etkin headway (duvarda sabitlenir)
    const bek = hw / 2 / 60;                             // dk
    const mal = f;
    const dol = demandVar ? (g.pikYolcuSaat! * (hw / 3600)) / g.aracKapasite! : null;
    const amac = demandVar ? [mal, bek, dol!] : [mal, bek];
    ham.push({ filo: f, hw, bek, mal, dol, amac });
  }

  // Pareto-etkinlik (baskın altında olmayanlar).
  const etkinBayrak = ham.map((p) => !ham.some((q) => q !== p && baskilar(q.amac, p.amac)));
  // Konfor uygunluğu: doluluk ≤ tavan (talep yoksa daima uygun).
  const konforBayrak = ham.map((p) => !demandVar || p.dol == null || p.dol <= konforTavani + 1e-9);

  // Konforu sağlayan EN AZ filo (doluluk filo arttıkça düşer → ilk uygun = en az).
  const ilkKonfor = demandVar ? ham.find((p) => konforBayrak[p.filo - 1]) : undefined;
  const konforFilo = ilkKonfor ? ilkKonfor.filo : null;
  // Etkin küme içinde konfor sağlanabiliyor mu.
  const konforSaglanabilir = !demandVar || etkinBayrak.some((e, i) => e && konforBayrak[i]);

  // Normalizasyon (maliyet & bekleme) — diz + ağırlıklı skor için.
  const malMin = 1, malMax = ust;
  const bekVals = ham.map((h) => h.bek);
  const bekMin = Math.min(...bekVals), bekMax = Math.max(...bekVals);
  const nrm = (v: number, lo: number, hi: number) => (hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo));

  // Diz noktası: TÜM etkin frontte ütopyaya (0,0) en yakın nokta (matematiksel dirsek — bilgi).
  let dizFilo = 1, dizEnYakin = Infinity;
  // Ağırlıklı optimum: skor = w·nBekleme + (1−w)·nMaliyet. KONFOR KISITI: uygun küme içinde ara
  // (konfor sağlanamıyorsa tüm etkin kümeye düş). Böylece optimum aşırı-kalabalık filo önermez.
  let optimumFilo = 1, optEnKucuk = Infinity;
  const skorlar: number[] = [];
  ham.forEach((p, i) => {
    const nm = nrm(p.mal, malMin, malMax);
    const nb = nrm(p.bek, bekMin, bekMax);
    const skor = agirlik * nb + (1 - agirlik) * nm;
    skorlar.push(skor);
    if (etkinBayrak[i]) {
      const uzak = Math.hypot(nm, nb);
      if (uzak < dizEnYakin - 1e-9) { dizEnYakin = uzak; dizFilo = p.filo; }
      const optUygun = etkinBayrak[i] && (!konforSaglanabilir || konforBayrak[i]);
      if (optUygun && skor < optEnKucuk - 1e-9) { optEnKucuk = skor; optimumFilo = p.filo; }
    }
  });

  const noktalar: ParetoNokta[] = ham.map((p, i) => ({
    filo: p.filo,
    headwaySn: p.hw,
    beklemeDk: p.bek,
    maliyet: p.mal,
    doluluk: p.dol,
    konforUygun: konforBayrak[i],
    etkin: etkinBayrak[i],
    diz: p.filo === dizFilo,
    optimum: p.filo === optimumFilo,
    skor: skorlar[i],
  }));

  return {
    noktalar,
    duvarFilo: nMax,
    dizFilo,
    optimumFilo,
    konforFilo,
    konforSaglanabilir,
    agirlik,
    demandVar,
    konforTavani,
    cevrimSn: cevrim,
    hMinSn: hMin,
  };
}
