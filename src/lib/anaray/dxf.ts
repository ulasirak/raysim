// raysim — DXF (AutoCAD Drawing Exchange) PARSER.
//
// DXF ASCII, "grup kodu / değer" satır çiftlerinden oluşur. Burada YALNIZ hat kurmak
// için gereken varlıkları çıkarırız: çizgiler/polylineler (ray güzergâhı), noktalar +
// blok referansları (makas/sinyal/durak işaretleri) ve metinler (durak adları) — her
// biri KATMAN adıyla. Geometriyi katman-eşlemeli üst katman (cadHat) yorumlar.
//
// DWG (ikili/tescilli) burada DESTEKLENMEZ — çağıran taraf kullanıcıyı DXF'e çevirmeye
// yönlendirir. DXF metin olduğundan tarayıcıda sıfır bağımlılıkla, güvenle işlenir.

export interface DxfNokta { x: number; y: number }
export interface DxfPolyline { layer: string; pts: DxfNokta[]; kapali: boolean }
export interface DxfPoint { layer: string; x: number; y: number; blok?: string } // POINT veya INSERT (blok adı)
export interface DxfLabel { layer: string; x: number; y: number; metin: string }

export interface DxfCizim {
  polylines: DxfPolyline[];
  points: DxfPoint[];
  labels: DxfLabel[];
  katmanlar: string[];        // dosyada geçen tüm katman adları (eşleme UI'si için)
  birimOlcek: number;         // 1 çizim birimi kaç metre ($INSUNITS'ten; bilinmiyorsa 1)
  uyarilar: string[];
}

// $INSUNITS kodları → metre çarpanı (yaygın olanlar).
const INSUNITS_METRE: Record<number, number> = {
  1: 0.0254,   // inç
  2: 0.3048,   // foot
  4: 0.001,    // mm
  5: 0.01,     // cm
  6: 1,        // metre
  7: 1000,     // km
  8: 2.54e-5,  // mikroinç
  9: 0.0000254,
};

/** DXF metnini (code,value) çiftlerine böl. DXF satırları: tek satır kod, tek satır değer. */
function ciftler(metin: string): { code: number; val: string }[] {
  // \r\n ve \n ikisini de destekle; baş/son boşlukları at.
  const satir = metin.split(/\r\n|\r|\n/);
  const out: { code: number; val: string }[] = [];
  for (let i = 0; i + 1 < satir.length; i += 2) {
    const code = parseInt(satir[i].trim(), 10);
    if (Number.isNaN(code)) { i -= 1; continue; } // hizalama kayması güvenliği
    out.push({ code, val: satir[i + 1] });
  }
  return out;
}

/** DXF metnini ayrıştır → çizim varlıkları. Hataya dayanıklı: tanımadığı varlığı atlar. */
export function dxfAyristir(metin: string): DxfCizim {
  const uyarilar: string[] = [];
  const cp = ciftler(metin);
  const katmanSet = new Set<string>();
  const polylines: DxfPolyline[] = [];
  const points: DxfPoint[] = [];
  const labels: DxfLabel[] = [];

  // Birim ölçeği HEADER'daki $INSUNITS'ten (varsa).
  let birimOlcek = 1;
  for (let i = 0; i < cp.length - 2; i++) {
    if (cp[i].code === 9 && cp[i].val.trim() === "$INSUNITS") {
      const kod = parseInt(cp[i + 2]?.val ?? "", 10);
      if (INSUNITS_METRE[kod]) birimOlcek = INSUNITS_METRE[kod];
      break;
    }
  }

  // ENTITIES bölümünü bul (yoksa tüm dosyayı tara — kimi export'lar bölümsüz olabilir).
  let bas = 0, son = cp.length;
  for (let i = 0; i < cp.length - 1; i++) {
    if (cp[i].code === 2 && cp[i].val.trim() === "ENTITIES") { bas = i + 1; break; }
  }
  for (let i = bas; i < cp.length - 1; i++) {
    if (cp[i].code === 0 && cp[i].val.trim() === "ENDSEC") { son = i; break; }
  }

  // Varlıkları 0-kodunda böl.
  let i = bas;
  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
  while (i < son) {
    if (cp[i].code !== 0) { i++; continue; }
    const tip = cp[i].val.trim().toUpperCase();
    // Bu varlığın kod bloğunu topla (sonraki 0-koduna kadar).
    let j = i + 1;
    const blok: { code: number; val: string }[] = [];
    while (j < son && cp[j].code !== 0) { blok.push(cp[j]); j++; }
    const g = (code: number) => blok.find((b) => b.code === code)?.val;
    const layer = (g(8) ?? "0").trim();
    if (tip !== "VERTEX" && tip !== "SEQEND") katmanSet.add(layer);

    if (tip === "LINE") {
      const x1 = num(g(10) ?? ""), y1 = num(g(20) ?? ""), x2 = num(g(11) ?? ""), y2 = num(g(21) ?? "");
      if ([x1, y1, x2, y2].every(Number.isFinite)) polylines.push({ layer, kapali: false, pts: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
    } else if (tip === "LWPOLYLINE") {
      // Vertexler blok içinde 10/20 çiftleri olarak sırayla gelir.
      const pts: DxfNokta[] = [];
      let cx: number | null = null;
      for (const b of blok) {
        if (b.code === 10) { cx = num(b.val); }
        else if (b.code === 20 && cx !== null) { const y = num(b.val); if (Number.isFinite(cx) && Number.isFinite(y)) pts.push({ x: cx, y }); cx = null; }
      }
      const kapali = (parseInt(g(70) ?? "0", 10) & 1) === 1;
      if (pts.length >= 2) polylines.push({ layer, kapali, pts });
    } else if (tip === "POLYLINE") {
      // Eski tip: vertexler ayrı VERTEX varlıkları (SEQEND'e kadar).
      const kapali = (parseInt(g(70) ?? "0", 10) & 1) === 1;
      const pts: DxfNokta[] = [];
      let k = j; // POLYLINE bloğu bitti; şimdi VERTEX'ler geliyor
      while (k < son && cp[k].code === 0 && cp[k].val.trim().toUpperCase() === "VERTEX") {
        let m = k + 1; const vb: { code: number; val: string }[] = [];
        while (m < son && cp[m].code !== 0) { vb.push(cp[m]); m++; }
        const vx = num(vb.find((b) => b.code === 10)?.val ?? ""), vy = num(vb.find((b) => b.code === 20)?.val ?? "");
        if (Number.isFinite(vx) && Number.isFinite(vy)) pts.push({ x: vx, y: vy });
        k = m;
      }
      // SEQEND'i atla
      if (k < son && cp[k].code === 0 && cp[k].val.trim().toUpperCase() === "SEQEND") { let m = k + 1; while (m < son && cp[m].code !== 0) m++; k = m; }
      if (pts.length >= 2) polylines.push({ layer, kapali, pts });
      j = k; // ana döngü buradan devam etsin
    } else if (tip === "POINT") {
      const x = num(g(10) ?? ""), y = num(g(20) ?? "");
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ layer, x, y });
    } else if (tip === "INSERT") {
      const x = num(g(10) ?? ""), y = num(g(20) ?? ""); const blokAd = (g(2) ?? "").trim();
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ layer, x, y, blok: blokAd || undefined });
    } else if (tip === "CIRCLE") {
      const x = num(g(10) ?? ""), y = num(g(20) ?? "");
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ layer, x, y });
    } else if (tip === "TEXT" || tip === "MTEXT") {
      const x = num(g(10) ?? ""), y = num(g(20) ?? "");
      const metin = mtextTemizle(g(1) ?? g(3) ?? "");
      if (Number.isFinite(x) && Number.isFinite(y) && metin.trim()) labels.push({ layer, x, y, metin: metin.trim() });
    }
    i = j;
  }

  if (polylines.length === 0) uyarilar.push("DXF'te çizgi/polyline (ray güzergâhı) bulunamadı. Dosya boş, blok içinde gömülü ya da desteklenmeyen varlık tipinde olabilir.");
  return { polylines, points, labels, katmanlar: [...katmanSet].sort(), birimOlcek, uyarilar };
}

/** MTEXT biçim kodlarını (\P satır sonu, \f... {} vs.) temizleyip düz metne indir. */
function mtextTemizle(s: string): string {
  return s
    .replace(/\\P/g, " ")            // satır sonu
    .replace(/\\[A-Za-z][^;]*;/g, "") // \f...; \H...; gibi biçim komutları
    .replace(/[{}]/g, "")
    .replace(/\\[\\{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
