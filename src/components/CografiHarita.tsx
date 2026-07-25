"use client";

// raysim — COĞRAFİ GÜZERGAH modülü.
// GTFS (stops.txt + shapes.txt) veya benzeri CSV'yi okur; şematik yerine gerçek
// koordinatlarda güzergah haritası çizer (eş-dikdörtgen projeksiyon + ölçek çubuğu).
// Karşı taraf gerçek hat verisini yükleyip görselleştirebilir.

import { useMemo, useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useProje } from "@/components/SimConfigProvider";
import {
  parseStops, parseShapes, makeProjector, polylineLength, gtfsToRings, tahminEtKisitlar, tahminEtHiz, tahminEtEgim, shapeElevations, egimProfili, hizProfili,
  ornekGtfsStops, ornekGtfsShapes, type GeoStop, type GeoShape, type EgimProfil, type HizProfil,
} from "@/lib/anaray/gtfs";

const VBW = 820, VBH = 460, PAD = 40;
const DOWN = "#0C6DB8";

function niceMeters(target: number): number {
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  for (const s of steps) if (s >= target) return s;
  return steps[steps.length - 1];
}

export function CografiHarita() {
  const [stops, setStops] = useState<GeoStop[]>(() => parseStops(ornekGtfsStops));
  const [shapes, setShapes] = useState<GeoShape[]>(() => parseShapes(ornekGtfsShapes));
  const [kaynak, setKaynak] = useState<string>("Konya T2 — Alaaddin → Adliye (yaklaşık koordinat)");
  const [hata, setHata] = useState<string>("");
  const [uretildi, setUretildi] = useState<{ rings: number; makas: number; hemzemin: number; hiz: number; minVmax: number | null; egim: number; maxEgim: number } | null>(null);
  const [tahmin, setTahmin] = useState(true);
  const { setRings, yazilabilir } = useProje();

  const yukseklikVar = useMemo(() => stops.some((s) => s.ele != null), [stops]);

  const hatUret = () => {
    const r = gtfsToRings(stops, shapes);
    if (r.length < 1) { setHata("Hat üretilemedi — en az 2 durak gerekli."); return; }
    const t = tahmin ? tahminEtKisitlar(r, stops, shapes) : { makas: 0, hemzemin: 0 };
    const h = tahmin ? tahminEtHiz(r, stops, shapes) : { ayarlanan: 0, minVmaxKmh: null };
    const g = tahminEtEgim(r, stops); // yükseklik varsa (gerçek veri, tahmin kutusundan bağımsız)
    setRings(r);
    setUretildi({ rings: r.length, makas: t.makas, hemzemin: t.hemzemin, hiz: h.ayarlanan, minVmax: h.minVmaxKmh, egim: g.ayarlanan, maxEgim: g.maxEgim });
    setHata("");
  };

  const tumNoktalar = useMemo(
    () => [...stops.map((s) => ({ lat: s.lat, lon: s.lon })), ...shapes.flatMap((sh) => sh.points)],
    [stops, shapes]
  );
  const proj = useMemo(() => makeProjector(tumNoktalar, VBW, VBH, PAD), [tumNoktalar]);
  const mainShape = useMemo(() => (shapes.length ? shapes.reduce((a, b) => (b.points.length > a.points.length ? b : a)) : null), [shapes]);
  const shapeEle = useMemo(() => shapeElevations(stops, shapes), [stops, shapes]);
  // Güzergah boyunca km taşları (her tam km'de ana shape üzerinde bir nokta)
  const kmPosts = useMemo(() => {
    const pts = mainShape?.points;
    if (!pts || pts.length < 2) return [] as { lat: number; lon: number; km: number }[];
    const out: { lat: number; lon: number; km: number }[] = [];
    let acc = 0, nextKm = 1000;
    for (let i = 1; i < pts.length; i++) {
      const seg = polylineLength([pts[i - 1], pts[i]]);
      while (acc + seg >= nextKm && seg > 0) {
        const f = (nextKm - acc) / seg;
        out.push({ lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f, lon: pts[i - 1].lon + (pts[i].lon - pts[i - 1].lon) * f, km: nextKm / 1000 });
        nextKm += 1000;
      }
      acc += seg;
    }
    return out;
  }, [mainShape]);
  const egim = useMemo(() => egimProfili(stops, shapes), [stops, shapes]);
  const hiz = useMemo(() => hizProfili(stops, shapes), [stops, shapes]);

  const uzunluk = useMemo(() => {
    if (shapes.length) return shapes.reduce((m, sh) => m + polylineLength(sh.points), 0);
    return polylineLength(stops);
  }, [shapes, stops]);

  const oku = (file: File | undefined, tip: "stops" | "shapes") => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const txt = String(rd.result || "");
        if (tip === "stops") {
          const s = parseStops(txt);
          if (!s.length) throw new Error("stops.txt içinde geçerli koordinat bulunamadı (stop_lat/stop_lon).");
          setStops(s); setKaynak(file.name); setHata("");
        } else {
          const sh = parseShapes(txt);
          setShapes(sh); setHata("");
        }
      } catch (e) {
        setHata(e instanceof Error ? e.message : String(e));
      }
    };
    rd.readAsText(file);
  };

  const ornekYukle = () => {
    setStops(parseStops(ornekGtfsStops));
    setShapes(parseShapes(ornekGtfsShapes));
    setKaynak("Konya T2 — Alaaddin → Adliye (yaklaşık koordinat)");
    setHata("");
  };

  // Ölçek çubuğu
  const olcek = useMemo(() => {
    if (!proj) return null;
    const m = niceMeters(140 * proj.mPerPx);
    return { m, px: m / proj.mPerPx };
  }, [proj]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Coğrafi Güzergah — GTFS / Gerçek Koordinat</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>Gerçek Koordinatlı Hat Haritası</h1>
        <p className="mt-2 max-w-3xl text-sm" style={{ color: brand.inkSoft }}>
          GTFS <code>stops.txt</code> (ve varsa <code>shapes.txt</code>) veya benzeri CSV yükle; güzergah şematik değil <b>gerçek coğrafi koordinatlarda</b> çizilir. <code>stop_elevation</code> sütunu varsa <b>eğim (‰)</b> de hesaplanır. Karşı tarafın hat verisini doğrudan görselleştirmek için.
        </p>
      </div>

      {/* Kabul edilen dosyalar + bu modül ana projeden bağımsız mı? */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>
          <div className="field-label mb-2">Kabul edilen dosyalar</div>
          <ul className="space-y-1.5">
            <li>📄 <b>stops.txt</b> / <b>.csv</b> — <span style={{ color: brand.muted }}>UTF-8, virgülle ayrılmış.</span><br />
              Zorunlu sütun: <code>stop_lat</code>, <code>stop_lon</code> (veya <code>lat</code>/<code>lon</code>). Ad: <code>stop_name</code>. <b>Eğim için</b> <code>stop_elevation</code> (ya da <code>elevation</code>/<code>ele</code>).</li>
            <li>📄 <b>shapes.txt</b> / <b>.csv</b> <span style={{ color: brand.muted }}>(opsiyonel)</span> — <code>shape_pt_lat</code>, <code>shape_pt_lon</code>, <code>shape_pt_sequence</code>. <span style={{ color: brand.muted }}>Gerçek kurp geometrisi → hız profili buradan çıkar.</span></li>
            <li>Standart <b>GTFS</b> (Google Transit) ile birebir uyumlu; herhangi bir raylı-sistem/GIS aracının GTFS dışa aktarımı çalışır.</li>
          </ul>
        </div>
        <div className="rounded-lg border-l-4 p-4 text-xs" style={{ background: CK.amberBg, borderColor: CK.amber, color: brand.inkSoft }}>
          <div className="field-label mb-2" style={{ color: CK.amberInk }}>Ana projeden bağımsız mı?</div>
          <p className="mb-1.5"><b>Veri akışı bağımsızdır.</b> Yüklediğin dosya <b>yalnız tarayıcında</b> okunur; <b>sunucuya gitmez</b> ve aktif projeye yazılmaz. Harita, eğim ve hız profili anında çizilir. (Uygulamaya girmek için hesap gerekir — bu tüm modüller için geçerli erişim kapısıdır, bu modüle özel değil.)</p>
          <p><b>Tek bağlantı noktası:</b> <span style={{ color: brand.red }}>⇥ Bu güzergahtan hat üret</span> düğmesi. O an bu güzergahı <b>aktif projenin paylaşılan hattına</b> yazar ve simülasyon (Ringler/Hat/Belgeler) bunu kullanır. Yani <b>bakmak</b> bağımsız, <b>üretmek</b> ana projeye işler.</p>
        </div>
      </div>

      {/* Kontroller */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-white p-4" style={{ borderColor: brand.border }}>
        <label className="text-sm" style={{ color: brand.inkSoft }}>
          <span className="field-label block">stops.txt</span>
          <input type="file" accept=".txt,.csv" onChange={(e) => oku(e.target.files?.[0], "stops")} className="mt-1 text-xs" />
        </label>
        <label className="text-sm" style={{ color: brand.inkSoft }}>
          <span className="field-label block">shapes.txt (opsiyonel)</span>
          <input type="file" accept=".txt,.csv" onChange={(e) => oku(e.target.files?.[0], "shapes")} className="mt-1 text-xs" />
        </label>
        <button onClick={ornekYukle} className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: brand.ink }}>
          Demo güzergahı yükle
        </button>
        {/* Aktif projenin hattını DEĞİŞTİRİR → yalnız kendi hattında çalışan kullanıcıya açık */}
        <button onClick={hatUret} disabled={!yazilabilir}
          title={yazilabilir ? "Bu güzergahtan durak-arası hücreleri üret ve aktif hatta yaz" : "Kendi hattınıza yazmak için giriş yapın"}
          className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: brand.red }}>
          ⇥ Bu güzergahtan hat üret
        </button>
        {!yazilabilir && (
          <span className="text-xs" style={{ color: brand.muted }}>
            (üretim için <Link href="/giris" className="underline" style={{ color: brand.red }}>giriş</Link> gerekir)
          </span>
        )}
        <label className="flex items-center gap-1.5 text-sm" style={{ color: brand.inkSoft }}>
          <input type="checkbox" checked={tahmin} onChange={(e) => setTahmin(e.target.checked)} />
          Makas/geçit/hız tahmin et
        </label>
      </div>

      {/* Butonların ne yaptığı — kısa kılavuz */}
      <ul className="mb-4 space-y-1 rounded-md border border-dashed px-4 py-3 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>
        <li><b>Dosya seç (stops.txt / shapes.txt)</b> — karşı taraftan gelen gerçek hat verisini yükler; harita anında bu koordinatlarda çizilir.</li>
        <li><b>Demo güzergahı yükle</b> — kendi dosyan yoksa denemek için Konya T2 örneğini koyar.</li>
        <li><b style={{ color: brand.red }}>⇥ Bu güzergahtan hat üret</b> — asıl aksiyon: bu coğrafi güzergahı simülasyonun <b>ring modeline</b> (durak-arası hücreler) çevirir ve <b>aktif hattına yazar</b>. Sonrasında <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link> / <Link href="/hat" className="underline" style={{ color: brand.red }}>Tam Hat</Link> / <Link href="/belgeler" className="underline" style={{ color: brand.red }}>Belgeler</Link> bu hattı kullanır.{" "}
          {yazilabilir
            ? <span style={{ color: CK.good }}>Hesabın buna hazır.</span>
            : <span style={{ color: brand.red }}>Şu an pasif — hattı değiştireceği için <Link href="/giris" className="underline" style={{ color: brand.red }}>giriş</Link> gerekir.</span>}
        </li>
        <li><b>Makas/geçit/hız tahmin et</b> — üretim sırasında shape geometrisinden <i>tahmini</i> makas, hemzemin geçit ve hız kısıtı ekler (GTFS&apos;te bu bilgi yoktur, sahayla düzeltilir).</li>
      </ul>

      {hata && <div className="mb-4 rounded-md border-l-4 px-4 py-2 text-sm" style={{ background: CK.badBg, borderColor: brand.red, color: brand.red }}>⚠ {hata}</div>}

      {uretildi != null && (
        <div className="mb-4 rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.goodBg, borderColor: CK.good, color: brand.ink }}>
          ✓ <b>{uretildi.rings} durak-arası hücre</b> gerçek koordinatlardan üretildi ve paylaşılan hatta yazıldı.
          {uretildi.makas + uretildi.hemzemin + uretildi.hiz > 0 ? (
            <> Ayrıca <b>{uretildi.makas} makas</b> (keskin dönüş + hat sonu U-dönüş), <b>{uretildi.hemzemin} hemzemin geçit</b>
            {uretildi.hiz > 0 && <> ve <b>{uretildi.hiz} hücrede hız kısıtı</b>{uretildi.minVmax != null ? ` (en düşük ${uretildi.minVmax} km/h, kurp yarıçapından)` : ""}</>} <i>tahmin edildi</i>.{" "}
            <span style={{ color: CK.amber }}>▲ Tahminler geometri sezgiseldir</span> (hemzemin konumu shape&apos;ten çıkarılamaz, eşit-aralık varsayımıdır; hız kısıtı yalnız yoğun shape&apos;te anlamlıdır) — 2. etap saha verisiyle veya{" "}
            <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link> editöründen düzeltin.</>
          ) : (
            <> Makas/hemzemin GTFS&apos;te olmadığından boş geldi — 2. etap verisiyle ya da <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link> editöründen eklenir.</>
          )}
          {uretildi.egim > 0 && (
            <> <b>{uretildi.egim} hücrede eğim</b> yükseklik verisinden <i>hesaplandı</i> (maks ±{uretildi.maxEgim}‰) — bu tahmin değil, gerçek veridir.</>
          )}
          {" "}Artık <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link>,{" "}
          <Link href="/hat" className="underline" style={{ color: brand.red }}>Tam Hat</Link> ve{" "}
          <Link href="/belgeler" className="underline" style={{ color: brand.red }}>Belgeler</Link> bu hattı kullanır.
        </div>
      )}

      {/* İstatistik */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat etiket="Durak" deger={`${stops.length}`} />
        <Stat etiket="Shape" deger={`${shapes.length}`} alt={shapes.length ? `${shapes.reduce((n, s) => n + s.points.length, 0)} nokta` : "yok"} />
        <Stat etiket="Güzergah uzunluğu" deger={`${(uzunluk / 1000).toFixed(2)} km`} />
        <Stat etiket="Kaynak" deger={kaynak.length > 18 ? kaynak.slice(0, 17) + "…" : kaynak} alt={proj ? `${proj.mPerPx.toFixed(0)} m/px` : ""} />
        <Stat etiket="Yükseklik" deger={yukseklikVar ? "var" : "yok"} alt={yukseklikVar ? "eğim hesaplanır" : "stop_elevation sütunu"} />
      </div>

      {/* Harita */}
      <div className="rounded-lg border bg-white p-3" style={{ borderColor: brand.border }}>
        {proj ? (
          <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Coğrafi güzergah haritası">
            <rect x={0} y={0} width={VBW} height={VBH} fill="#F7F9FB" />
            {/* hafif koordinat gridi */}
            {Array.from({ length: 9 }).map((_, i) => (
              <g key={`g${i}`}>
                <line x1={(VBW / 8) * i} y1={0} x2={(VBW / 8) * i} y2={VBH} stroke="#E9EDF1" strokeWidth={1} />
                <line x1={0} y1={(VBH / 6) * i} x2={VBW} y2={(VBH / 6) * i} stroke="#E9EDF1" strokeWidth={1} />
              </g>
            ))}

            {/* shape polyline(ler) — yükseklik varsa ana shape eğime göre renkli */}
            {shapes.map((sh, si) => {
              if (sh === mainShape && shapeEle) {
                return sh.points.slice(1).map((p, k) => {
                  const a = proj.project(sh.points[k].lat, sh.points[k].lon);
                  const b = proj.project(p.lat, p.lon);
                  const de = shapeEle[k + 1] - shapeEle[k];
                  const col = de > 0.03 ? brand.red : de < -0.03 ? DOWN : CK.faint;
                  return <line key={`gs${si}-${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={3.5} strokeLinecap="round" />;
                });
              }
              return (
                <polyline key={`sh${si}`} fill="none" stroke={DOWN} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
                  points={sh.points.map((p) => { const q = proj.project(p.lat, p.lon); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ")} />
              );
            })}
            {/* shape yoksa durakları bağla */}
            {!shapes.length && stops.length > 1 && (
              <polyline fill="none" stroke={DOWN} strokeWidth={2} strokeDasharray="5 4"
                points={stops.map((s) => { const q = proj.project(s.lat, s.lon); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ")} />
            )}

            {/* duraklar */}
            {stops.map((s) => {
              const q = proj.project(s.lat, s.lon);
              return (
                <g key={s.id}>
                  <circle cx={q.x} cy={q.y} r={5} fill={brand.surface} stroke={brand.ink} strokeWidth={2} />
                  <text x={q.x + 8} y={q.y + 3} fill={brand.ink} fontSize={9}>{s.name}</text>
                </g>
              );
            })}

            {/* km taşları */}
            {kmPosts.map((p) => {
              const q = proj.project(p.lat, p.lon);
              return (
                <g key={`km${p.km}`}>
                  <rect x={q.x - 1.5} y={q.y - 1.5} width={3} height={3} fill={brand.gold} transform={`rotate(45 ${q.x} ${q.y})`} />
                  <text x={q.x - 6} y={q.y - 4} textAnchor="end" fontSize={7.5} fill={brand.gold}>{p.km}k</text>
                </g>
              );
            })}

            {/* kuzey oku */}
            <g transform={`translate(${VBW - 28},28)`}>
              <path d="M0,-14 L5,6 L0,1 L-5,6 Z" fill={brand.ink} />
              <text x={0} y={20} textAnchor="middle" fontSize={9} fill={brand.muted}>K</text>
            </g>

            {/* ölçek çubuğu */}
            {olcek && (
              <g transform={`translate(20,${VBH - 24})`}>
                <line x1={0} y1={0} x2={olcek.px} y2={0} stroke={brand.ink} strokeWidth={2} />
                <line x1={0} y1={-4} x2={0} y2={4} stroke={brand.ink} strokeWidth={2} />
                <line x1={olcek.px} y1={-4} x2={olcek.px} y2={4} stroke={brand.ink} strokeWidth={2} />
                <text x={olcek.px / 2} y={-7} textAnchor="middle" fontSize={9} fill={brand.ink}>
                  {olcek.m >= 1000 ? `${olcek.m / 1000} km` : `${olcek.m} m`}
                </text>
              </g>
            )}
          </svg>
        ) : (
          <div className="p-10 text-center text-sm" style={{ color: brand.muted }}>Koordinat verisi yok — bir stops.txt yükle veya demo güzergahı seç.</div>
        )}
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>
          {shapeEle ? (
            <><span style={{ color: brand.red }}>▬</span> tırmanış · <span style={{ color: DOWN }}>▬</span> iniş · <span style={{ color: CK.faint }}>▬</span> düz (yükseklikten eğim) · </>
          ) : (
            <><span style={{ color: DOWN }}>▬</span> güzergah (shape) · </>
          )}
          <span style={{ color: brand.ink }}>●</span> durak.
          Eş-dikdörtgen projeksiyon (boylam enlemle sıkıştırılır); ölçek çubuğu haritadan ölçülür. Koordinat verisi girildiği gibi kullanılır.
        </p>
      </div>

      {/* Eğim profili — giriş/üretim gerekmeden, yükseklik verisi yüklenince görünür */}
      {egim ? (
        <EgimProfilStrip profil={egim} />
      ) : (
        <div className="mt-4 rounded-lg border border-dashed bg-white p-4 text-xs" style={{ borderColor: brand.border, color: brand.muted }}>
          <b>Eğim profili yok</b> — yüklediğin <code>stops.txt</code> dosyasında <code>stop_elevation</code> (veya <code>elevation</code>/<code>ele</code>) sütunu bulunamadı. Bu sütunu eklersen eğim burada, &quot;hat üret&quot;e basmadan çıkar. Demo verisinde bu sütun vardır.
        </div>
      )}

      {/* Hız profili — kurp yarıçapından, shape varsa; giriş/üretim gerekmez */}
      {hiz && <HizProfilStrip profil={hiz} />}

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Coğrafi Güzergah — GTFS stops/shapes içe aktarımı. Bu modül güzergahı gerçek koordinatlarda gösterir; simülasyon modeli (ring/anklaşman) ayrı Sefer/Ringler modüllerinden yürür.
      </footer>
    </div>
  );
}

function EgimProfilStrip({ profil }: { profil: EgimProfil }) {
  const W = 820, H = 180, PL = 52, PR = 18, PT = 24, PB = 40;
  const iw = W - PL - PR, ih = H - PT - PB;
  const { cumDist, ele, minEle, maxEle, totalDist, maxAbsGrade } = profil;
  const ePad = Math.max(1, maxEle - minEle) * 0.18;
  const eLo = minEle - ePad, eHi = maxEle + ePad;
  const x = (d: number) => PL + (totalDist ? (d / totalDist) * iw : 0);
  const y = (e: number) => PT + (1 - (e - eLo) / (eHi - eLo)) * ih;
  const col = (g: number) => (g > 0.5 ? brand.red : g < -0.5 ? DOWN : CK.faint);

  // Sıralı geçerli (yükseklikli) durak indeksleri
  const idx = cumDist.map((_, i) => i).filter((i) => isFinite(ele[i]));
  const areaPts = idx.map((i) => `${x(cumDist[i]).toFixed(1)},${y(ele[i]).toFixed(1)}`);
  const areaPath = areaPts.length
    ? `M ${x(cumDist[idx[0]]).toFixed(1)},${(PT + ih).toFixed(1)} L ${areaPts.join(" L ")} L ${x(cumDist[idx[idx.length - 1]]).toFixed(1)},${(PT + ih).toFixed(1)} Z`
    : "";

  return (
    <div className="mt-4 rounded-lg border bg-white p-3" style={{ borderColor: brand.border }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="field-label">Eğim profili — yükseklik / mesafe (&quot;hat üret&quot; gerekmez)</div>
        <div className="text-xs" style={{ color: brand.muted }}>
          en dik <b style={{ color: maxAbsGrade >= 40 ? brand.red : brand.ink }}>±{maxAbsGrade}‰</b> · yükseklik {minEle.toFixed(0)}–{maxEle.toFixed(0)} m · {(totalDist / 1000).toFixed(2)} km
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Eğim profili">
        <rect x={0} y={0} width={W} height={H} fill="#F7F9FB" />
        {/* yatay ızgara + yükseklik ekseni */}
        {[0, 0.5, 1].map((f, i) => {
          const e = eLo + (eHi - eLo) * (1 - f);
          const yy = PT + f * ih;
          return (
            <g key={`ax${i}`}>
              <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="#E9EDF1" strokeWidth={1} />
              <text x={PL - 6} y={yy + 3} textAnchor="end" fontSize={9} fill={brand.muted}>{e.toFixed(0)}</text>
            </g>
          );
        })}
        {/* istasyon kılavuz çizgileri (hız profiliyle ortak eksen) */}
        {cumDist.map((d, i) => (
          <line key={`sg${i}`} x1={x(d)} y1={PT} x2={x(d)} y2={PT + ih} stroke="#EDF1F5" strokeWidth={1} />
        ))}
        {/* dolgu */}
        {areaPath && <path d={areaPath} fill={brand.route} opacity={0.05} />}
        {/* eğime göre renkli segmentler + ‰ etiketi */}
        {cumDist.slice(0, -1).map((_, i) => {
          if (!isFinite(ele[i]) || !isFinite(ele[i + 1])) return null;
          const dx = cumDist[i + 1] - cumDist[i];
          const g = dx ? Math.round(((ele[i + 1] - ele[i]) / dx) * 1000 * 10) / 10 : 0;
          const x1 = x(cumDist[i]), y1 = y(ele[i]), x2 = x(cumDist[i + 1]), y2 = y(ele[i + 1]);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return (
            <g key={`seg${i}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col(g)} strokeWidth={3.5} strokeLinecap="round" />
              {cumDist.length <= 16 && (
                <text x={mx} y={my - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={col(g)}>
                  {g > 0 ? "+" : ""}{g}‰
                </text>
              )}
            </g>
          );
        })}
        {/* durak işaretleri */}
        {cumDist.map((d, i) => (isFinite(ele[i]) ? (
          <circle key={`p${i}`} cx={x(d)} cy={y(ele[i])} r={3.2} fill={brand.surface} stroke={brand.ink} strokeWidth={1.6} />
        ) : null))}
        {/* mesafe ekseni */}
        <line x1={PL} y1={PT + ih} x2={W - PR} y2={PT + ih} stroke={brand.borderStrong} strokeWidth={1} />
        <text x={PL} y={H - 8} fontSize={9} fill={brand.muted}>0 km</text>
        <text x={W - PR} y={H - 8} textAnchor="end" fontSize={9} fill={brand.muted}>{(totalDist / 1000).toFixed(2)} km</text>
        <text x={(PL + W - PR) / 2} y={H - 8} textAnchor="middle" fontSize={9} fill={brand.faint}>hat başından mesafe</text>
      </svg>
      <p className="mt-2 text-xs" style={{ color: brand.muted }}>
        <span style={{ color: brand.red }}>▬</span> tırmanış · <span style={{ color: DOWN }}>▬</span> iniş · <span style={{ color: CK.faint }}>▬</span> ~düz.
        Düşey eksen <b>otomatik ölçekli (düşey abartılı)</b> — küçük yükseklik farkları görünür olsun diye; ‰ değerleri gerçektir. Durak yüksekliklerinden hesaplanır; &quot;hat üret&quot; gerekmez.
      </p>
    </div>
  );
}

function HizProfilStrip({ profil }: { profil: HizProfil }) {
  const W = 820, H = 200, PL = 52, PR = 18, PT = 22, PB = 58;
  const iw = W - PL - PR, ih = H - PT - PB;
  const { samples, cumDist, stopNames, totalDist, minKmh, maxKmh } = profil;
  const vHi = Math.ceil((maxKmh + 5) / 10) * 10;
  const x = (d: number) => PL + (totalDist ? (d / totalDist) * iw : 0);
  const y = (v: number) => PT + (1 - v / vHi) * ih;
  const speedCol = (v: number) => (v <= 20 ? brand.red : v <= 40 ? CK.amber : CK.good);

  // Basamaklı (step) azami-hız çizgisi — OpenTrack v-s merdiveni
  const stepPts: string[] = [];
  samples.forEach((s, i) => {
    const px = x(s.cum);
    stepPts.push(`${px.toFixed(1)},${y(s.kmh).toFixed(1)}`);
    if (i < samples.length - 1) stepPts.push(`${x(samples[i + 1].cum).toFixed(1)},${y(s.kmh).toFixed(1)}`);
  });
  const areaPath = stepPts.length
    ? `M ${PL},${(PT + ih).toFixed(1)} L ${stepPts.join(" L ")} L ${(x(totalDist)).toFixed(1)},${(PT + ih).toFixed(1)} Z`
    : "";
  const yTicks = Array.from({ length: vHi / 20 + 1 }, (_, i) => i * 20);

  return (
    <div className="mt-4 rounded-lg border bg-white p-3" style={{ borderColor: brand.border }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="field-label">Hız profili — kurp yarıçapından azami hız (v–s, &quot;hat üret&quot; gerekmez)</div>
        <div className="text-xs" style={{ color: brand.muted }}>
          aralık <b style={{ color: brand.ink }}>{minKmh}–{maxKmh} km/h</b> · yanal ivme 0,65 m/s²
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Hız profili (kurp kısıtı)">
        <rect x={0} y={0} width={W} height={H} fill="#F7F9FB" />
        {/* hız ızgarası */}
        {yTicks.map((v) => (
          <g key={`vy${v}`}>
            <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke="#E9EDF1" strokeWidth={1} />
            <text x={PL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={brand.muted}>{v}</text>
          </g>
        ))}
        {/* istasyon kılavuzları + adları (eğim profiliyle ortak eksen) */}
        {cumDist.map((d, i) => (
          <g key={`st${i}`}>
            <line x1={x(d)} y1={PT} x2={x(d)} y2={PT + ih} stroke="#E3E8EE" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(d)} y={PT + ih + 12} transform={`rotate(35 ${x(d)} ${PT + ih + 12})`} fontSize={8.5} fill={brand.inkSoft}>
              {stopNames[i]}
            </text>
          </g>
        ))}
        {/* azami hız dolgu + merdiven */}
        {areaPath && <path d={areaPath} fill={CK.good} opacity={0.08} />}
        {samples.slice(0, -1).map((s, i) => {
          const c = speedCol(s.kmh);
          return (
            <g key={`sp${i}`}>
              <line x1={x(s.cum)} y1={y(s.kmh)} x2={x(samples[i + 1].cum)} y2={y(s.kmh)} stroke={c} strokeWidth={2.5} strokeLinecap="round" />
              <line x1={x(samples[i + 1].cum)} y1={y(s.kmh)} x2={x(samples[i + 1].cum)} y2={y(samples[i + 1].kmh)} stroke={c} strokeWidth={1.2} opacity={0.5} />
            </g>
          );
        })}
        {/* mesafe ekseni */}
        <line x1={PL} y1={PT + ih} x2={W - PR} y2={PT + ih} stroke={brand.borderStrong} strokeWidth={1} />
        <text x={PL - 40} y={PT + ih / 2} transform={`rotate(-90 ${PL - 40} ${PT + ih / 2})`} textAnchor="middle" fontSize={9} fill={brand.muted}>km/h</text>
      </svg>
      <p className="mt-1 text-xs" style={{ color: brand.muted }}>
        <span style={{ color: CK.good }}>▬</span> serbest · <span style={{ color: CK.amber }}>▬</span> yavaşlama · <span style={{ color: brand.red }}>▬</span> makas/keskin kurp rejimi.
        Merdiven, shape&apos;in yerel kurp yarıçapından (v=√(a·R)) türetilir; yoğun/gerçek shape ne kadar iyiyse profil o kadar isabetli. Ana hat tavanı 70 km/h.
      </p>
    </div>
  );
}

function Stat({ etiket, deger, alt }: { etiket: string; deger: string; alt?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>{deger}</div>
      {alt && <div className="truncate text-xs" style={{ color: brand.faint }} title={alt}>{alt}</div>}
    </div>
  );
}
