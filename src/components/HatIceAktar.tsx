"use client";

// raysim — BİRLEŞİK İÇE AKTARMA (UI). Tek giriş: dosyayı otomatik tanır →
//   • .zip  → GTFS feed (rota/yön seç)
//   • .xml  → railML altyapı
//   • .dxf  → CAD çizim (katman eşle: güzergâh + durak)
// Hepsi AYNI önizlemeye (ad · durak · km · uyarılar + mini şema) ve AYNI uygulama yoluna
// yakınsar. Uygulama modu seçilir — hiçbiri OTO değil:
//   • Değiştir  → mevcut hattın üzerine yazar (geri alınabilir)
//   • Ekle      → mevcut hattın sonuna ring olarak ekler (mevcut ringlere dokunmaz)
//   • Yeni hat  → mevcut hatta HİÇ dokunmaz; ayrı yeni hatta iner (kredi düşer)
// Çekirdekler test edilmiştir: lib/anaray/{gtfs,railml,dxf,cadHat}.

import { useEffect, useMemo, useState } from "react";
import { useDil } from "@/components/DilProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur, type GtfsFeed } from "@/lib/anaray/gtfs";
import { osmHatKur, type OsmHatSonuc, type OsmSegment } from "@/lib/anaray/osmHat";
import { railmlHatKur } from "@/lib/anaray/railml";
import { dxfAyristir } from "@/lib/anaray/dxf";
import { shapefileGeometri } from "@/lib/anaray/shapefile";
import { cadHatKur, katmanTahmini, type CadGeometri, type CadEsleme, type CadHatSonuc } from "@/lib/anaray/cadHat";
import type { DurakArasiRing } from "@/lib/anaray/ring";

export type IceAktarMod = "degistir" | "ekle" | "yeniHat";
interface HatSonuc { rings: DurakArasiRing[]; ad: string; durakSayisi: number; toplamKm: number; uyarilar: string[]; yol?: { x: number; y: number }[]; duraklar?: { ad: string; km: number; x: number; y: number }[]; }

// "Ekle" süreklilik eşiği — mevcut hattın sonu ile eklenecek hattın başı bundan uzaksa KOPUK
// sayılır (osmHat.stitch BAGLANTI_ESIK ile aynı). Bu değerin üstünde "ekle" ışınlanma yaratır.
const KOPUK_ESIK = 1600;
function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return NaN;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function HatIceAktar({ onIceAktar, disabled, mesgulDis, gomulu = false, mevcutSonKoord = null }: {
  onIceAktar: (rings: DurakArasiRing[], ad: string, mod: IceAktarMod, koord?: Record<string, { lat: number; lon: number }>, geometri?: { insaat?: boolean; noktalar: [number, number][] }[]) => void | Promise<void>;
  disabled?: boolean;
  mesgulDis?: boolean;
  /** Gömülü (ör. "+ Yeni hat" modalı): daima YENİ hat modu, mod seçici + details sarmalı yok. */
  gomulu?: boolean;
  /** Mevcut hattın SON durak koordinatı — "Ekle" modunda süreklilik (kopukluk) kontrolü için. */
  mevcutSonKoord?: { ad: string; lat: number; lon: number } | null;
}) {
  const { t } = useDil();
  const [kaynak, setKaynak] = useState<"gtfs" | "railml" | "cad" | "osm" | null>(null);
  const [feed, setFeed] = useState<GtfsFeed | null>(null);
  // OSM / Şehir hattı kaynağı
  type OsmRota = { id: number; ref: string; ad: string; from: string; to: string; network: string; operator: string; renk: string; tip: string };
  const [osmSehir, setOsmSehir] = useState("");
  const [osmRotalar, setOsmRotalar] = useState<OsmRota[]>([]);
  const [osmSecili, setOsmSecili] = useState<number[]>([]);
  const [osmFull, setOsmFull] = useState<OsmHatSonuc | null>(null);
  const [osmDurum, setOsmDurum] = useState<"" | "ara" | "getir">("");
  const [osmMesaj, setOsmMesaj] = useState<string | null>(null);
  const [railmlSonuc, setRailmlSonuc] = useState<HatSonuc | null>(null);
  const [dxfGeo, setDxfGeo] = useState<CadGeometri | null>(null);
  const [shpBuf, setShpBuf] = useState<Uint8Array | null>(null);   // shapefile ham zip (ad alanı değişince yeniden ayrıştırılır)
  const [adAlani, setAdAlani] = useState("");                       // shapefile durak-adı özniteliği ("" = otomatik)
  const [adAlanlari, setAdAlanlari] = useState<string[]>([]);
  const [shpUyari, setShpUyari] = useState<string[]>([]);
  const [esle, setEsle] = useState<CadEsleme>({ guzergahKatman: [], durakKatman: [] });
  const [dosyaAd, setDosyaAd] = useState("");
  const [routeId, setRouteId] = useState("");
  const [dir, setDir] = useState("");
  const [mod, setMod] = useState<IceAktarMod>(gomulu ? "yeniHat" : "degistir");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const rotalar = useMemo(() => (feed ? gtfsRotalar(feed) : []), [feed]);
  const yonler = useMemo(() => (feed && routeId ? gtfsYonler(feed, routeId) : []), [feed, routeId]);

  const sifirla = () => { setKaynak(null); setFeed(null); setRailmlSonuc(null); setDxfGeo(null); setShpBuf(null); setAdAlani(""); setAdAlanlari([]); setShpUyari([]); setEsle({ guzergahKatman: [], durakKatman: [] }); setRouteId(""); setDir(""); setHata(null); setOsmRotalar([]); setOsmSecili([]); setOsmFull(null); setOsmMesaj(null); };

  // —— OSM / Şehir hattı ——
  const osmAra = async () => {
    const sehir = osmSehir.trim();
    if (!sehir) return;
    sifirla(); setKaynak("osm"); setOsmDurum("ara"); setOsmMesaj(null);
    try {
      const r = await fetch("/api/geometri/osm/rota", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mod: "ara", sehir }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Aranamadı.");
      const list: OsmRota[] = Array.isArray(j.rotalar) ? j.rotalar : [];
      setOsmRotalar(list);
      setOsmMesaj(list.length ? `${list.length} ${t({ tr: "raylı rota bulundu — hattı kur için seç.", en: "rail routes found — select to build the line.", de: "Bahnstrecken gefunden — zum Aufbau der Strecke auswählen." })}` : "Bu bölgede OSM'de tram/hafif-raylı/metro rotası bulunamadı.");
    } catch (e) {
      setOsmMesaj(e instanceof Error ? e.message : "Aranamadı.");
    } finally { setOsmDurum(""); }
  };
  const osmSec = (id: number) => setOsmSecili((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const osmGetir = async () => {
    if (osmSecili.length === 0) return;
    setOsmDurum("getir"); setOsmMesaj(null); setOsmFull(null);
    try {
      const r = await fetch("/api/geometri/osm/rota", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mod: "hat", relIds: osmSecili }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.hata || "Getirilemedi.");
      const segs: OsmSegment[] = (Array.isArray(j.segmentler) ? j.segmentler : []).map((s: { ad: string; duraklar: OsmSegment["duraklar"]; geometri: [number, number][] }) => ({ ad: s.ad, duraklar: s.duraklar ?? [], geometri: s.geometri ?? [] }));
      const sec = osmRotalar.filter((x) => osmSecili.includes(x.id));
      const net = sec[0]?.network || "";
      const hatAd = sec.length === 1 ? sec[0].ad : (net ? `${net} — birleşik hat` : "OSM birleşik hat");
      const full = osmHatKur(segs, hatAd);
      setOsmFull(full);
    } catch (e) {
      setOsmMesaj(e instanceof Error ? e.message : "Getirilemedi.");
    } finally { setOsmDurum(""); }
  };

  // CAD geometrisi: DXF doğrudan; shapefile ham zip'ten (ad alanı seçimiyle) türetilir.
  const geo = useMemo<CadGeometri | null>(() => {
    if (dxfGeo) return dxfGeo;
    if (shpBuf) { try { return shapefileGeometri(shpBuf, adAlani || undefined); } catch { return null; } }
    return null;
  }, [dxfGeo, shpBuf, adAlani]);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setMesgul(true); sifirla();
    try {
      const ad = f.name.toLowerCase();
      if (ad.endsWith(".dxf")) {
        const g = dxfAyristir(await f.text());
        if (g.uyarilar.length && g.polylines.length === 0) throw new Error(g.uyarilar[0]);
        setDxfGeo(g); setEsle(katmanTahmini(g)); setShpUyari(g.uyarilar); setKaynak("cad");
      } else if (ad.endsWith(".dwg")) {
        throw new Error(t({ tr: "DWG (ikili CAD) doğrudan desteklenmez. Lütfen AutoCAD'de DXF'e çevir (SAVEAS → DXF) ve onu yükle.", en: "DWG (binary CAD) is not directly supported. Please convert it to DXF in AutoCAD (SAVEAS → DXF) and upload that.", de: "DWG (binäres CAD) wird nicht direkt unterstützt. Bitte in AutoCAD in DXF konvertieren (SAVEAS → DXF) und diese hochladen." }));
      } else if (ad.endsWith(".xml") || ad.endsWith(".railml")) {
        setRailmlSonuc(railmlHatKur(await f.text())); setKaynak("railml");
      } else {
        // .zip → shapefile (.shp içeriyorsa) yoksa GTFS.
        const buf = new Uint8Array(await f.arrayBuffer());
        let shp: (CadGeometri & { adAlanlari: string[]; uyarilar: string[] }) | null = null;
        try { shp = shapefileGeometri(buf) as CadGeometri & { adAlanlari: string[]; uyarilar: string[] }; } catch { shp = null; }
        if (shp) {
          setShpBuf(buf); setEsle(katmanTahmini(shp)); setAdAlanlari(shp.adAlanlari); setShpUyari(shp.uyarilar); setAdAlani(""); setKaynak("cad");
        } else {
          const parsed = parseGtfsZip(buf);
          setFeed(parsed); setKaynak("gtfs");
          const r = gtfsRotalar(parsed);
          const ilk = r.find((x) => x.tip === "0") ?? r[0];
          if (ilk) setRouteId(ilk.id);
        }
      }
      setDosyaAd(f.name);
    } catch (e) {
      setHata(e instanceof Error ? e.message : t({ tr: "Dosya okunamadı.", en: "Could not read the file.", de: "Datei konnte nicht gelesen werden." }));
    } finally { setMesgul(false); }
  };

  useEffect(() => {
    // Rota/feed değişince geçersiz kalan yön seçimini ilk geçerli yöne senkronla — türetilmiş
    // state düzeltmesi (kullanıcı seçimini korur, yalnız geçersizse sıfırlar).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (yonler.length && !yonler.some((y) => y.dir === dir)) setDir(yonler[0].dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, feed]);

  const gtfsFull = useMemo(() => {
    if (!feed || !routeId || !dir) return null;
    try { return gtfsHatKur(feed, routeId, dir); } catch { return null; }
  }, [feed, routeId, dir]);
  // GtfsHatSonuc.duraklar (lat/lon) yerel HatSonuc.duraklar (x/y) ile farklı; koordinatı
  // ayrı taşırız (GTFS export için isletme.istasyonKoordinat'a yazılır).
  const gtfsSonuc: HatSonuc | null = gtfsFull
    ? { rings: gtfsFull.rings, ad: gtfsFull.ad, durakSayisi: gtfsFull.durakSayisi, toplamKm: gtfsFull.toplamKm, uyarilar: gtfsFull.uyarilar }
    : null;

  const cadSonuc = useMemo<{ sonuc: CadHatSonuc | null; hata: string | null }>(() => {
    if (!geo || esle.guzergahKatman.length === 0 || esle.durakKatman.length === 0) return { sonuc: null, hata: null };
    try {
      const s = cadHatKur(geo, esle, dosyaAd.replace(/\.[^.]+$/, ""));
      return { sonuc: { ...s, uyarilar: [...shpUyari, ...s.uyarilar] }, hata: null };
    } catch (e) { return { sonuc: null, hata: e instanceof Error ? e.message : t({ tr: "Hat kurulamadı.", en: "Could not build the line.", de: "Strecke konnte nicht aufgebaut werden." }) }; }
  }, [geo, esle, dosyaAd, shpUyari, t]);

  // OSM: lib çıktısını (lat/lon duraklar + geometri) ayrı taşırız; önizleme yol/durak (x/y) HatSonuc'a.
  const osmSonuc: HatSonuc | null = osmFull
    ? { rings: osmFull.rings, ad: osmFull.ad, durakSayisi: osmFull.durakSayisi, toplamKm: osmFull.toplamKm, uyarilar: osmFull.uyarilar, yol: osmFull.yol, duraklar: osmFull.onizleme }
    : null;

  const sonuc: HatSonuc | null = kaynak === "gtfs" ? gtfsSonuc : kaynak === "railml" ? railmlSonuc : kaynak === "osm" ? osmSonuc : cadSonuc.sonuc;
  const kurHata = kaynak === "cad" ? cadSonuc.hata : null;

  // "Ekle" SÜREKLİLİK KONTROLÜ: eklenecek hattın İLK durağının koordinatı (yalnız koordinatlı
  // kaynaklarda: OSM/GTFS). Mevcut hattın son durağından KOPUK_ESIK'ten uzaksa "ekle" ışınlanma
  // yaratır → önizlemede kırmızı uyarı + Uygula'da ek onay. Koordinat yoksa kontrol atlanır.
  const ilkImportKoord = kaynak === "osm" ? osmFull?.duraklar?.[0] : kaynak === "gtfs" ? gtfsFull?.duraklar?.[0] : null;
  const ekleKopukMesafe = (mod === "ekle" && mevcutSonKoord && ilkImportKoord)
    ? haversineM(mevcutSonKoord, ilkImportKoord) : NaN;
  const ekleKopuk = Number.isFinite(ekleKopukMesafe) && ekleKopukMesafe > KOPUK_ESIK;

  const katmanTikla = (k: string, alan: "guzergahKatman" | "durakKatman") =>
    setEsle((e) => ({ ...e, [alan]: e[alan].includes(k) ? e[alan].filter((x) => x !== k) : [...e[alan], k] }));

  const modAd: Record<IceAktarMod, string> = {
    degistir: t({ tr: "Mevcut hattın ÜZERİNE YAZILIR (geri alınabilir)", en: "OVERWRITES the current line (undoable)", de: "ÜBERSCHREIBT die aktuelle Strecke (rückgängig machbar)" }),
    ekle: t({ tr: "Mevcut hattın SONUNA eklenir (mevcut ringlere dokunulmaz)", en: "Appended to the END of the current line (existing rings untouched)", de: "Wird an das ENDE der aktuellen Strecke angehängt (bestehende Ringe unberührt)" }),
    yeniHat: t({ tr: "AYRI yeni hatta iner (mevcut hatta hiç dokunulmaz, kredi düşer)", en: "Lands on a SEPARATE new line (current line untouched, credit deducted)", de: "Landet auf einer SEPARATEN neuen Strecke (aktuelle Strecke unberührt, Guthaben wird abgezogen)" }),
  };

  const uygula = async () => {
    if (!sonuc) return;
    if (!confirm(`“${sonuc.ad}” (${sonuc.durakSayisi} ${t({ tr: "durak", en: "stops", de: "Halt." })}) ${t({ tr: "içe aktarılsın mı?", en: "— import?", de: "— importieren?" })}\n\n${modAd[mod]}`)) return;
    // Ekle + kopuk: mevcut hatla eklenen hat fiziksel olarak bağlı değil → ek onay iste.
    if (ekleKopuk && !confirm(
      `⚠ KOPUK EKLEME\n\nEklenecek hattın başı (“${ilkImportKoord!.ad ?? "?"}”), mevcut hattın sonundan (“${mevcutSonKoord!.ad}”) ~${(ekleKopukMesafe / 1000).toFixed(1)} km uzak.\n\nBunlar fiziksel olarak BAĞLI DEĞİL — “Ekle” dersen sistem aralarında ışınlanma olan tek bir hat kurar. Genelde bunun yerine “Değiştir” veya “Yeni hat” istenir.\n\nYine de birleştirilsin mi?`,
    )) return;
    // GTFS ise durak koordinatlarını (lat/lon) da geçir → GTFS export için saklanır.
    let koord: Record<string, { lat: number; lon: number }> | undefined;
    if (kaynak === "gtfs" && gtfsFull?.duraklar?.length) {
      koord = {};
      for (const d of gtfsFull.duraklar) koord[d.ad] = { lat: d.lat, lon: d.lon };
    }
    // GTFS shape'i varsa GERÇEK track geometrisini de geçir → harita kavisli hizada çizer.
    let geometri = kaynak === "gtfs" && gtfsFull?.geometri && gtfsFull.geometri.length >= 2
      ? [{ noktalar: gtfsFull.geometri }] : undefined;
    // OSM: gerçek durak koordinatları + rota geometrisi → harita gerçek hizada çizer.
    if (kaynak === "osm" && osmFull) {
      koord = {};
      for (const d of osmFull.duraklar) koord[d.ad] = { lat: d.lat, lon: d.lon };
      if (osmFull.geometri.length >= 2) geometri = [{ noktalar: osmFull.geometri }];
    }
    await onIceAktar(sonuc.rings, sonuc.ad, mod, koord, geometri);
  };

  const govde = (
      <div className={gomulu ? "px-1 pb-1 pt-1" : "border-t px-4 pb-4 pt-3"} style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs" style={{ color: brand.muted }}>
          <b>GTFS .zip</b>, <b>railML .xml</b>, <b>CAD .dxf</b> {t({ tr: "veya", en: "or", de: "oder" })} <b>Shapefile .zip</b> (.shp/.dbf/.prj) {t({ tr: "yükle. Sıralı duraklar + gerçek mesafelerle hat kurulur.", en: "— upload. The line is built with ordered stops and real distances.", de: "— hochladen. Die Strecke wird mit geordneten Haltestellen und echten Entfernungen aufgebaut." })}
          {" "}{t({ tr: "Makas/sinyal içe aktarılmaz; Ringler'de eklenir.", en: "Switches/signals are not imported; add them in Ringler.", de: "Weichen/Signale werden nicht importiert; im Bereich Ringler hinzufügen." })} <b>DWG</b> {t({ tr: "için önce DXF'e çevir.", en: "must first be converted to DXF.", de: "muss zuerst in DXF konvertiert werden." })}
        </p>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
          📁 {t({ tr: "Dosya seç", en: "Select file", de: "Datei wählen" })} (.zip / .xml / .dxf)
          <input type="file" accept=".zip,.xml,.railml,.dxf,application/zip,text/xml,application/xml,image/vnd.dxf" className="hidden"
            onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {dosyaAd && <span className="ml-2 text-xs" style={{ color: brand.muted }}>{dosyaAd}{kaynak && kaynak !== "osm" ? ` · ${kaynak.toUpperCase()}` : ""}{mesgul ? " · " + t({ tr: "okunuyor…", en: "reading…", de: "wird gelesen…" }) : ""}</span>}
        {hata && <p className="mt-2 text-sm" style={{ color: brand.red }}>⚠ {hata}</p>}

        {/* OSM / Şehir hattı — sistemin kendi çekmesi (dosya gerektirmez) */}
        <div className="mt-3 rounded-md border p-3" style={{ borderColor: brand.border, background: "#F7FBFC" }}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: brand.ink }}>🌍 {t({ tr: "OSM'den şehir hattı", en: "City line from OSM", de: "Stadtstrecke aus OSM" })}</span>
            <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "dosya gerekmez — şehir yaz, sistem OpenStreetMap'ten gerçek hattı çeker", en: "no file needed — type a city, the system fetches the real line from OpenStreetMap", de: "keine Datei nötig — Stadt eingeben, das System holt die echte Strecke aus OpenStreetMap" })}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={osmSehir} onChange={(e) => setOsmSehir(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); osmAra(); } }}
              placeholder={t({ tr: "Şehir (ör. Samsun, Antalya, Eskişehir)", en: "City (e.g. Samsun, Antalya, Eskişehir)", de: "Stadt (z. B. Samsun, Antalya, Eskişehir)" })}
              className="min-w-[220px] flex-1 rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
            <button type="button" onClick={osmAra} disabled={osmDurum !== "" || !osmSehir.trim()}
              className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
              {osmDurum === "ara" ? t({ tr: "aranıyor…", en: "searching…", de: "wird gesucht…" }) : `🔎 ${t({ tr: "Rotaları ara", en: "Search routes", de: "Routen suchen" })}`}
            </button>
          </div>
          {osmMesaj && <p className="mt-2 text-xs" style={{ color: /bulunamadı|Overpass|yoğun|çekile|Aranamadı|Getirilemedi/.test(osmMesaj) ? brand.red : brand.muted }}>{osmMesaj}</p>}

          {osmRotalar.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 field-label">{t({ tr: "Rota(lar) seç", en: "Select route(s)", de: "Route(n) wählen" })} <span style={{ color: brand.muted }}>{t({ tr: "(birden çok seçersen uçlarından birleştirilir)", en: "(select several to join them at their ends)", de: "(mehrere wählen, um sie an ihren Enden zu verbinden)" })}</span></div>
              <div className="flex max-h-48 flex-col gap-1 overflow-auto rounded border p-2" style={{ borderColor: brand.border }}>
                {osmRotalar.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={osmSecili.includes(r.id)} onChange={() => osmSec(r.id)} className="mt-1" />
                    <span>
                      <b style={{ color: brand.ink }}>{r.ref ? `${r.ref}: ` : ""}{r.ad}</b>
                      {(r.from || r.to) && <span className="text-xs" style={{ color: brand.muted }}> · {r.from}{r.to ? ` → ${r.to}` : ""}</span>}
                      {r.tip !== "tram" && <span className="ml-1 text-xs" style={{ color: brand.muted }}>[{r.tip}]</span>}
                    </span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={osmGetir} disabled={osmDurum !== "" || osmSecili.length === 0}
                className="mt-2 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: brand.ink }}>
                {osmDurum === "getir" ? t({ tr: "getiriliyor…", en: "fetching…", de: "wird geholt…" }) : `⬇ ${t({ tr: "Hattı kur", en: "Build line", de: "Strecke aufbauen" })} (${osmSecili.length} ${t({ tr: "rota", en: "routes", de: "Routen" })})`}
              </button>
            </div>
          )}
        </div>

        {/* GTFS: rota + yön */}
        {kaynak === "gtfs" && feed && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">{t({ tr: "Rota", en: "Route", de: "Route" })} ({rotalar.length})</span>
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {rotalar.map((r) => <option key={r.id} value={r.id}>{r.tipAd} · {r.ad}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">{t({ tr: "Yön", en: "Direction", de: "Richtung" })}</span>
              <select value={dir} onChange={(e) => setDir(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {yonler.map((y) => <option key={y.dir} value={y.dir}>{y.headsign || `${t({ tr: "Yön", en: "Direction", de: "Richtung" })} ${y.dir}`} · {y.duraklar} {t({ tr: "durak", en: "stops", de: "Halt." })}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* CAD: katman eşleme */}
        {kaynak === "cad" && geo && (
          <div className="mt-4 rounded-md border p-3 text-xs" style={{ borderColor: brand.border }}>
            <div className="mb-2 font-semibold" style={{ color: brand.ink }}>{t({ tr: "Katman eşleme — hangi katman ne?", en: "Layer mapping — which layer is what?", de: "Ebenenzuordnung — welche Ebene ist was?" })} ({geo.katmanlar.length} {t({ tr: "katman", en: "layers", de: "Ebenen" })} · {geo.polylines.length} {t({ tr: "çizgi", en: "lines", de: "Linien" })} · {geo.points.length} {t({ tr: "nokta", en: "points", de: "Punkte" })} · {geo.labels.length} {t({ tr: "metin", en: "texts", de: "Texte" })})</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-medium" style={{ color: brand.inkSoft }}>🛤 {t({ tr: "Güzergâh (ray çizgileri)", en: "Alignment (rail lines)", de: "Trasse (Schienenlinien)" })}</div>
                <div className="flex flex-wrap gap-1.5">
                  {geo.katmanlar.map((k) => {
                    const secili = esle.guzergahKatman.includes(k);
                    const cizgi = geo.polylines.some((p) => p.layer === k);
                    return <button key={k} type="button" onClick={() => katmanTikla(k, "guzergahKatman")} disabled={!cizgi}
                      className="rounded border px-1.5 py-0.5 disabled:opacity-30" style={{ borderColor: secili ? brand.red : brand.border, background: secili ? brand.red : "#fff", color: secili ? "#fff" : brand.ink }}>{k}</button>;
                  })}
                </div>
              </div>
              <div>
                <div className="mb-1 font-medium" style={{ color: brand.inkSoft }}>🚏 {t({ tr: "Duraklar (nokta/etiket)", en: "Stops (point/label)", de: "Haltestellen (Punkt/Beschriftung)" })}</div>
                <div className="flex flex-wrap gap-1.5">
                  {geo.katmanlar.map((k) => {
                    const secili = esle.durakKatman.includes(k);
                    const im = geo.points.some((p) => p.layer === k) || geo.labels.some((l) => l.layer === k);
                    return <button key={k} type="button" onClick={() => katmanTikla(k, "durakKatman")} disabled={!im}
                      className="rounded border px-1.5 py-0.5 disabled:opacity-30" style={{ borderColor: secili ? brand.ink : brand.border, background: secili ? brand.ink : "#fff", color: secili ? "#fff" : brand.ink }}>{k}</button>;
                  })}
                </div>
              </div>
            </div>
            {shpBuf && adAlanlari.length > 0 && (
              <label className="mt-3 block">
                <span className="field-label">🏷 {t({ tr: "Durak adı özelliği", en: "Stop name attribute", de: "Haltestellenname-Attribut" })} (.dbf)</span>
                <select value={adAlani} onChange={(e) => setAdAlani(e.target.value)} className="mt-1 w-full max-w-xs rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                  <option value="">{t({ tr: "otomatik seç", en: "auto select", de: "automatisch wählen" })}</option>
                  {adAlanlari.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            )}
            {kurHata && <p className="mt-2" style={{ color: brand.red }}>⚠ {kurHata}</p>}
          </div>
        )}

        {/* Önizleme + mini şema + uygulama modu */}
        {kaynak && sonuc && (
          <>
            <div className="mt-4 rounded-md border-l-4 px-3 py-2.5 text-sm" style={{ borderColor: brand.ink, background: "#F7F9FA", color: brand.inkSoft }}>
              <div><b style={{ color: brand.ink }}>{sonuc.ad}</b> — {sonuc.durakSayisi} {t({ tr: "durak", en: "stops", de: "Halt." })} · {sonuc.toplamKm.toFixed(1)} km · {sonuc.rings.length} {t({ tr: "ring", en: "rings", de: "Ringe" })}</div>
              {sonuc.yol && sonuc.duraklar && <SemaOnizleme yol={sonuc.yol} duraklar={sonuc.duraklar} />}
              <ul className="mt-1 ml-4 list-disc text-xs" style={{ color: brand.muted }}>
                {sonuc.uyarilar.map((u, i) => <li key={i} style={/AKTARILMADI/i.test(u) ? { color: CK.amberInk, fontWeight: 600 } : undefined}>{u}</li>)}
              </ul>
            </div>

            {gomulu ? (
              <div className="mt-3 text-xs" style={{ color: brand.muted }}>{t({ tr: "Bu dosya", en: "This file opens as a", de: "Diese Datei wird als" })} <b style={{ color: brand.ink }}>{t({ tr: "ayrı yeni bir hat", en: "separate new line", de: "separate neue Strecke" })}</b> {t({ tr: "olarak açılır (1 kredi düşer).", en: "(1 credit is deducted).", de: "geöffnet (1 Guthaben wird abgezogen)." })}</div>
            ) : (
            <div className="mt-3 text-sm">
              <div className="mb-1 field-label">{t({ tr: "Nasıl uygulansın?", en: "How to apply?", de: "Wie anwenden?" })}</div>
              <div className="flex flex-col gap-1">
                {(["degistir", "ekle", "yeniHat"] as IceAktarMod[]).map((m) => (
                  <label key={m} className="flex cursor-pointer items-start gap-2">
                    <input type="radio" name="iceMod" checked={mod === m} onChange={() => setMod(m)} className="mt-0.5" />
                    <span><b style={{ color: brand.ink }}>{m === "degistir" ? t({ tr: "Değiştir", en: "Replace", de: "Ersetzen" }) : m === "ekle" ? t({ tr: "Ekle", en: "Append", de: "Anhängen" }) : t({ tr: "Yeni hat olarak", en: "As a new line", de: "Als neue Strecke" })}</b> <span className="text-xs" style={{ color: brand.muted }}>— {modAd[m]}</span></span>
                  </label>
                ))}
              </div>
            </div>
            )}

            {/* "Ekle" süreklilik uyarısı — eklenecek hattın başı mevcut hattın sonundan çok uzaksa */}
            {ekleKopuk && (
              <div className="mt-2 rounded-md border-l-4 px-3 py-2 text-xs" style={{ borderColor: CK.red, background: "#FDF2F4", color: brand.inkSoft }}>
                <b style={{ color: CK.red }}>{t({ tr: "⚠ Kopuk ekleme.", en: "⚠ Disconnected append.", de: "⚠ Getrenntes Anhängen." })}</b> {t({ tr: "Eklenecek hattın başı", en: "The start of the line to append", de: "Der Anfang der anzuhängenden Strecke" })} (“{ilkImportKoord?.ad ?? "?"}”) {t({ tr: "mevcut hattın sonundan", en: "is, from the end of the current line", de: "ist, vom Ende der aktuellen Strecke" })}
                (“{mevcutSonKoord?.ad}”) <b>~{(ekleKopukMesafe / 1000).toFixed(1)} km</b> {t({ tr: "uzak — fiziksel olarak bağlı değil.", en: "away — not physically connected.", de: "entfernt — physisch nicht verbunden." })}
                “{t({ tr: "Ekle", en: "Append", de: "Anhängen" })}” {t({ tr: "dersen aralarında ışınlanma olan tek hat kurulur; genelde", en: "builds a single line with a teleport between them; usually", de: "baut eine einzige Strecke mit einem Sprung dazwischen; normalerweise wird" })} <b>{t({ tr: "Değiştir", en: "Replace", de: "Ersetzen" })}</b> {t({ tr: "ya da", en: "or", de: "oder" })} <b>{t({ tr: "Yeni hat", en: "New line", de: "Neue Strecke" })}</b> {t({ tr: "istenir.", en: "is preferred.", de: "bevorzugt." })}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={disabled || mesgulDis}
                onClick={uygula}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
                ⬇ {t({ tr: "İçe aktar", en: "Import", de: "Importieren" })}
              </button>
              {disabled && <span className="text-xs" style={{ color: CK.amberInk }}>{t({ tr: "Salt-okunur görünümde içe aktarma kapalı.", en: "Import is disabled in read-only view.", de: "Import ist in der schreibgeschützten Ansicht deaktiviert." })}</span>}
            </div>
          </>
        )}
        {kaynak === "cad" && !sonuc && !kurHata && <p className="mt-3 text-xs" style={{ color: brand.muted }}>{t({ tr: "Güzergâh ve durak katmanlarını seç → hat kurulur.", en: "Select the alignment and stop layers → the line is built.", de: "Trassen- und Haltestellen-Ebenen wählen → die Strecke wird aufgebaut." })}</p>}
      </div>
  );
  // Gömülü ("+ Yeni hat" modalı): düz kart, hep açık. Aksi halde katlanır details.
  if (gomulu) return govde;
  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Dosyadan İçe Aktar", en: "Import from File", de: "Aus Datei importieren" })}</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>GTFS · railML · CAD (DXF) · Shapefile → {t({ tr: "hattı otomatik kur", en: "build the line automatically", de: "Strecke automatisch aufbauen" })}</span>
      </summary>
      {govde}
    </details>
  );
}

/** İçe aktarılan hattın kuşbakışı mini şeması (dikilmiş yol + duraklar) — doğrulama için. */
function SemaOnizleme({ yol, duraklar }: { yol: { x: number; y: number }[]; duraklar: { ad: string; km: number; x: number; y: number }[] }) {
  const { t } = useDil();
  const W = 320, H = 90, pad = 10;
  const xs = yol.map((p) => p.x), ys = yol.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1;
  const sc = Math.min((W - 2 * pad) / sx, (H - 2 * pad) / sy);
  const px = (p: { x: number; y: number }) => ({ x: pad + (p.x - minX) * sc, y: H - pad - (p.y - minY) * sc });
  const d = yol.map((p, i) => `${i === 0 ? "M" : "L"}${px(p).x.toFixed(1)},${px(p).y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-md rounded border" style={{ borderColor: brand.border, background: "#fff" }} role="img" aria-label={t({ tr: "İçe aktarılan hat şeması", en: "Imported line diagram", de: "Diagramm der importierten Strecke" })}>
      <path d={d} fill="none" stroke={brand.ink} strokeWidth={1.4} />
      {duraklar.map((s, i) => { const p = px(s); return <circle key={i} cx={p.x} cy={p.y} r={2} fill={brand.red} />; })}
    </svg>
  );
}
