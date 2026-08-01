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
  parseStops, parseShapes, makeProjector, polylineLength, gtfsToRings, tahminEtKisitlar, tahminEtHiz,
  ornekGtfsStops, ornekGtfsShapes, type GeoStop, type GeoShape,
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
  const [uretildi, setUretildi] = useState<{ rings: number; makas: number; hemzemin: number; hiz: number; minVmax: number | null } | null>(null);
  const [tahmin, setTahmin] = useState(true);
  const { setRings, yazilabilir } = useProje();


  const hatUret = () => {
    const r = gtfsToRings(stops, shapes);
    if (r.length < 1) { setHata("Hat üretilemedi — en az 2 durak gerekli."); return; }
    const t = tahmin ? tahminEtKisitlar(r, stops, shapes) : { makas: 0, hemzemin: 0 };
    const h = tahmin ? tahminEtHiz(r, stops, shapes) : { ayarlanan: 0, minVmaxKmh: null };
    setRings(r);
    setUretildi({ rings: r.length, makas: t.makas, hemzemin: t.hemzemin, hiz: h.ayarlanan, minVmax: h.minVmaxKmh });
    setHata("");
  };

  const tumNoktalar = useMemo(
    () => [...stops.map((s) => ({ lat: s.lat, lon: s.lon })), ...shapes.flatMap((sh) => sh.points)],
    [stops, shapes]
  );
  const proj = useMemo(() => makeProjector(tumNoktalar, VBW, VBH, PAD), [tumNoktalar]);
  const mainShape = useMemo(() => (shapes.length ? shapes.reduce((a, b) => (b.points.length > a.points.length ? b : a)) : null), [shapes]);
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
          GTFS <code>stops.txt</code> (ve varsa <code>shapes.txt</code>) veya benzeri CSV yükle; güzergah şematik değil <b>gerçek coğrafi koordinatlarda</b> çizilir. Karşı tarafın hat verisini doğrudan görselleştirmek için.
        </p>
      </div>

      {/* Kabul edilen dosyalar + bu modül ana projeden bağımsız mı? */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>
          <div className="field-label mb-2">Kabul edilen dosyalar</div>
          <ul className="space-y-1.5">
            <li>📄 <b>stops.txt</b> / <b>.csv</b> — <span style={{ color: brand.muted }}>UTF-8, virgülle ayrılmış.</span><br />
              Zorunlu sütun: <code>stop_lat</code>, <code>stop_lon</code> (veya <code>lat</code>/<code>lon</code>). Ad: <code>stop_name</code>.</li>
            <li>📄 <b>shapes.txt</b> / <b>.csv</b> <span style={{ color: brand.muted }}>(opsiyonel)</span> — <code>shape_pt_lat</code>, <code>shape_pt_lon</code>, <code>shape_pt_sequence</code>. <span style={{ color: brand.muted }}>Gerçek kurp geometrisi → hız kısıtı tahmini buradan çıkar.</span></li>
            <li>Standart <b>GTFS</b> (Google Transit) ile birebir uyumlu; herhangi bir raylı-sistem/GIS aracının GTFS dışa aktarımı çalışır.</li>
          </ul>
        </div>
        <div className="rounded-lg border-l-4 p-4 text-xs" style={{ background: CK.amberBg, borderColor: CK.amber, color: brand.inkSoft }}>
          <div className="field-label mb-2" style={{ color: CK.amberInk }}>Ana projeden bağımsız mı?</div>
          <p className="mb-1.5"><b>Veri akışı bağımsızdır.</b> Yüklediğin dosya <b>yalnız tarayıcında</b> okunur; <b>sunucuya gitmez</b> ve aktif projeye yazılmaz. Harita anında çizilir. (Uygulamaya girmek için hesap gerekir — bu tüm modüller için geçerli erişim kapısıdır, bu modüle özel değil.)</p>
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

            {/* shape polyline(ler) */}
            {shapes.map((sh, si) => (
              <polyline key={`sh${si}`} fill="none" stroke={DOWN} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
                points={sh.points.map((p) => { const q = proj.project(p.lat, p.lon); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ")} />
            ))}
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
          <span style={{ color: DOWN }}>▬</span> güzergah (shape) · <span style={{ color: brand.ink }}>●</span> durak.
          Eş-dikdörtgen projeksiyon (boylam enlemle sıkıştırılır); ölçek çubuğu haritadan ölçülür. Koordinat verisi girildiği gibi kullanılır.
        </p>
      </div>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Coğrafi Güzergah — GTFS stops/shapes içe aktarımı. Bu modül güzergahı gerçek koordinatlarda gösterir; simülasyon modeli (ring/anklaşman) ayrı Sefer/Ringler modüllerinden yürür.
      </footer>
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
