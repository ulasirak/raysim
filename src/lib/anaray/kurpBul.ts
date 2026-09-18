// raysim — GEOMETRİDEN KURP (yarıçap) TESPİTİ (saf TS; bağımlılıksız, node-test edilebilir).
//
// Bir hizalama polyline'ının (ardışık x,y köşeleri, METRE) yerel yarıçapını hesaplar ve
// kavis (kurp) bölgelerini çıkarır. Kaynak fark etmez: CAD/DXF dikilmiş yolu, GTFS shape,
// ya da kullanıcının elle girdiği/yapıştırdığı koordinat listesi — hepsi aynı motoru besler.
//
// Yöntem: her iç köşede ardışık 3 noktanın ÇEVREL ÇEMBER yarıçapı R = (a·b·c)/(4·Alan).
// Yakın-doğrusal (alan ~ 0) → R=∞ (tanjant). Dönüş İŞARETİ (sol/sağ) = alanın işareti;
// işaret değişince (S-kurp) kurp ikiye ayrılır. Ardışık "kavisli" köşeler bir kurpta
// gruplanır; temsilî R = grup medyanı (köşe titremesine dayanıklı).

export interface AlignKurp {
  kmMerkez: number;  // m — kurp merkezinin hizalama başından kümülatif kilometrajı
  uzunluk: number;   // m — kurp boyu
  yaricap: number;   // m — temsilî yarıçap (grup medyanı)
}

export interface KurpBulOpts {
  rMax?: number;          // m — bundan büyük yarıçap tanjant sayılır (varsayılan 1000)
  minUzunluk?: number;    // m — bundan kısa kurplar atılır (varsayılan 12)
  birlestirmeAralik?: number; // m — bu kadar yakın aynı-yönlü gruplar birleştirilir (varsayılan 15)
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Üç noktanın çevrel çember yarıçapı (m) + dönüş işareti (+1 sol / −1 sağ / 0 düz). */
export function ucNoktaYaricap(
  A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number },
): { R: number; isaret: number } {
  const a = dist(B, C), b = dist(A, C), c = dist(A, B);
  // İşaretli alan ×2 (çapraz çarpım): (B−A) × (C−A)
  const alan2 = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
  const alan = Math.abs(alan2) / 2;
  if (alan < 1e-9 || a < 1e-9 || b < 1e-9 || c < 1e-9) return { R: Infinity, isaret: 0 };
  const R = (a * b * c) / (4 * alan);
  return { R, isaret: Math.sign(alan2) };
}

const medyan = (xs: number[]): number => {
  if (xs.length === 0) return Infinity;
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Hizalama köşelerinden (METRE) kurp bölgelerini çıkarır. Noktalar kümülatif kilometraja
 * göre işlenir; sonuç kmMerkez artan sırada.
 */
export function kurplariBul(pts: { x: number; y: number }[], opts?: KurpBulOpts): AlignKurp[] {
  const rMax = opts?.rMax ?? 1000;
  const minUz = opts?.minUzunluk ?? 12;
  const birlestir = opts?.birlestirmeAralik ?? 15;
  const n = pts.length;
  if (n < 3) return [];

  // Kümülatif kilometraj (m).
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));

  // İç köşe başına yarıçap + işaret.
  type Kose = { i: number; R: number; isaret: number; kavisli: boolean };
  const koseler: Kose[] = [];
  for (let i = 1; i < n - 1; i++) {
    const { R, isaret } = ucNoktaYaricap(pts[i - 1], pts[i], pts[i + 1]);
    koseler.push({ i, R, isaret, kavisli: R <= rMax && isaret !== 0 });
  }

  // Ardışık kavisli + AYNI işaretli köşeleri grupla (işaret değişince/düzlükte kes).
  type Grup = { bas: number; son: number; Rler: number[]; isaret: number };
  const gruplar: Grup[] = [];
  let g: Grup | null = null;
  for (const k of koseler) {
    if (k.kavisli && g && k.isaret === g.isaret) {
      g.son = k.i; g.Rler.push(k.R);
    } else if (k.kavisli) {
      if (g) gruplar.push(g);
      g = { bas: k.i, son: k.i, Rler: [k.R], isaret: k.isaret };
    } else {
      if (g) { gruplar.push(g); g = null; }
    }
  }
  if (g) gruplar.push(g);

  // Grup → kurp (kilometraj: köşe s değerleri). Tek köşeli grubu komşu yarım
  // segmentlerle genişlet → sıfır-uzunluk olmasın. `isaret` birleştirmede taşınır.
  type IcKurp = AlignKurp & { isaret: number };
  const kurplar: IcKurp[] = gruplar.map((gr) => {
    const sBas = s[Math.max(0, gr.bas - 1)];
    const sSon = s[Math.min(n - 1, gr.son + 1)];
    const uz = Math.max(minUz, sSon - sBas);
    return { kmMerkez: (sBas + sSon) / 2, uzunluk: uz, yaricap: medyan(gr.Rler), isaret: gr.isaret };
  });

  // Çok yakın + AYNI YÖNLÜ + benzer yarıçaplı ardışık kurpları birleştir (tek kurpun titreme
  // yüzünden bölünmesini önle). Ters yönlü (S-kurp) komşular ASLA birleşmez.
  kurplar.sort((p, q) => p.kmMerkez - q.kmMerkez);
  const birlesik: IcKurp[] = [];
  for (const k of kurplar) {
    const o = birlesik[birlesik.length - 1];
    const kBas = k.kmMerkez - k.uzunluk / 2;
    const oSon = o ? o.kmMerkez + o.uzunluk / 2 : -Infinity;
    if (o && o.isaret === k.isaret && kBas - oSon <= birlestir && Math.abs(o.yaricap - k.yaricap) / Math.max(o.yaricap, k.yaricap) < 0.35) {
      const yeniBas = o.kmMerkez - o.uzunluk / 2;
      const yeniSon = k.kmMerkez + k.uzunluk / 2;
      o.kmMerkez = (yeniBas + yeniSon) / 2;
      o.uzunluk = yeniSon - yeniBas;
      o.yaricap = Math.min(o.yaricap, k.yaricap); // muhafazakâr: en dar
    } else {
      birlesik.push({ ...k });
    }
  }
  return birlesik
    .filter((k) => k.uzunluk >= minUz && Number.isFinite(k.yaricap) && k.yaricap > 0)
    .map(({ kmMerkez, uzunluk, yaricap }) => ({ kmMerkez, uzunluk, yaricap }));
}

/** Kiriş (chord C) + orta dikme (versine/mid-ordinate M) ölçüsünden yarıçap (m).
 *  R = C²/(8M) + M/2. Pafta/haritadan CAD'siz ölçen kullanıcı için. */
export function yaricapKirisVersine(kiris: number, versine: number): number {
  const C = Math.max(0, kiris), M = Math.max(1e-6, versine);
  return (C * C) / (8 * M) + M / 2;
}
