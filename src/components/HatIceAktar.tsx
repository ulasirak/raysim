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
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur, type GtfsFeed } from "@/lib/anaray/gtfs";
import { railmlHatKur } from "@/lib/anaray/railml";
import { dxfAyristir } from "@/lib/anaray/dxf";
import { cadHatKur, katmanTahmini, type CadGeometri, type CadEsleme, type CadHatSonuc } from "@/lib/anaray/cadHat";
import type { DurakArasiRing } from "@/lib/anaray/ring";

export type IceAktarMod = "degistir" | "ekle" | "yeniHat";
interface HatSonuc { rings: DurakArasiRing[]; ad: string; durakSayisi: number; toplamKm: number; uyarilar: string[]; yol?: { x: number; y: number }[]; duraklar?: { ad: string; km: number; x: number; y: number }[]; }

export function HatIceAktar({ onIceAktar, disabled, mesgulDis }: {
  onIceAktar: (rings: DurakArasiRing[], ad: string, mod: IceAktarMod) => void | Promise<void>;
  disabled?: boolean;
  mesgulDis?: boolean;
}) {
  const [kaynak, setKaynak] = useState<"gtfs" | "railml" | "cad" | null>(null);
  const [feed, setFeed] = useState<GtfsFeed | null>(null);
  const [railmlSonuc, setRailmlSonuc] = useState<HatSonuc | null>(null);
  const [geo, setGeo] = useState<CadGeometri | null>(null);
  const [esle, setEsle] = useState<CadEsleme>({ guzergahKatman: [], durakKatman: [] });
  const [dosyaAd, setDosyaAd] = useState("");
  const [routeId, setRouteId] = useState("");
  const [dir, setDir] = useState("");
  const [mod, setMod] = useState<IceAktarMod>("degistir");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const rotalar = useMemo(() => (feed ? gtfsRotalar(feed) : []), [feed]);
  const yonler = useMemo(() => (feed && routeId ? gtfsYonler(feed, routeId) : []), [feed, routeId]);

  const sifirla = () => { setKaynak(null); setFeed(null); setRailmlSonuc(null); setGeo(null); setEsle({ guzergahKatman: [], durakKatman: [] }); setRouteId(""); setDir(""); setHata(null); };

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setMesgul(true); sifirla();
    try {
      const ad = f.name.toLowerCase();
      if (ad.endsWith(".dxf")) {
        const g = dxfAyristir(await f.text());
        if (g.uyarilar.length && g.polylines.length === 0) throw new Error(g.uyarilar[0]);
        setGeo(g); setEsle(katmanTahmini(g)); setKaynak("cad");
      } else if (ad.endsWith(".dwg")) {
        throw new Error("DWG (ikili CAD) doğrudan desteklenmez. Lütfen AutoCAD'de DXF'e çevir (SAVEAS → DXF) ve onu yükle.");
      } else if (ad.endsWith(".xml") || ad.endsWith(".railml")) {
        setRailmlSonuc(railmlHatKur(await f.text())); setKaynak("railml");
      } else {
        // .zip → GTFS (ileride: shapefile .shp barındıran zip ayrımı).
        const parsed = parseGtfsZip(new Uint8Array(await f.arrayBuffer()));
        setFeed(parsed); setKaynak("gtfs");
        const r = gtfsRotalar(parsed);
        const ilk = r.find((x) => x.tip === "0") ?? r[0];
        if (ilk) setRouteId(ilk.id);
      }
      setDosyaAd(f.name);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Dosya okunamadı.");
    } finally { setMesgul(false); }
  };

  useEffect(() => {
    if (yonler.length && !yonler.some((y) => y.dir === dir)) setDir(yonler[0].dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, feed]);

  const gtfsSonuc = useMemo<HatSonuc | null>(() => {
    if (!feed || !routeId || !dir) return null;
    try { return gtfsHatKur(feed, routeId, dir); } catch { return null; }
  }, [feed, routeId, dir]);

  const cadSonuc = useMemo<{ sonuc: CadHatSonuc | null; hata: string | null }>(() => {
    if (!geo || esle.guzergahKatman.length === 0 || esle.durakKatman.length === 0) return { sonuc: null, hata: null };
    try { return { sonuc: cadHatKur(geo, esle, dosyaAd.replace(/\.[^.]+$/, "")), hata: null }; }
    catch (e) { return { sonuc: null, hata: e instanceof Error ? e.message : "Hat kurulamadı." }; }
  }, [geo, esle, dosyaAd]);

  const sonuc: HatSonuc | null = kaynak === "gtfs" ? gtfsSonuc : kaynak === "railml" ? railmlSonuc : cadSonuc.sonuc;
  const kurHata = kaynak === "cad" ? cadSonuc.hata : null;

  const katmanTikla = (k: string, alan: "guzergahKatman" | "durakKatman") =>
    setEsle((e) => ({ ...e, [alan]: e[alan].includes(k) ? e[alan].filter((x) => x !== k) : [...e[alan], k] }));

  const modAd: Record<IceAktarMod, string> = { degistir: "Mevcut hattın ÜZERİNE YAZILIR (geri alınabilir)", ekle: "Mevcut hattın SONUNA eklenir (mevcut ringlere dokunulmaz)", yeniHat: "AYRI yeni hatta iner (mevcut hatta hiç dokunulmaz, kredi düşer)" };

  const uygula = async () => {
    if (!sonuc) return;
    if (!confirm(`“${sonuc.ad}” (${sonuc.durakSayisi} durak) içe aktarılsın mı?\n\n${modAd[mod]}`)) return;
    await onIceAktar(sonuc.rings, sonuc.ad, mod);
  };

  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>Dosyadan İçe Aktar</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>GTFS · railML · CAD (DXF) → hattı otomatik kur</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs" style={{ color: brand.muted }}>
          <b>GTFS .zip</b>, <b>railML .xml</b> veya <b>CAD .dxf</b> yükle. Sıralı duraklar + gerçek mesafelerle hat kurulur.
          {" "}Makas/sinyal içe aktarılmaz; Ringler'de eklenir. <b>DWG</b> için önce DXF'e çevir.
        </p>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
          📁 Dosya seç (.zip / .xml / .dxf)
          <input type="file" accept=".zip,.xml,.railml,.dxf,application/zip,text/xml,application/xml,image/vnd.dxf" className="hidden"
            onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {dosyaAd && <span className="ml-2 text-xs" style={{ color: brand.muted }}>{dosyaAd}{kaynak ? ` · ${kaynak.toUpperCase()}` : ""}{mesgul ? " · okunuyor…" : ""}</span>}
        {hata && <p className="mt-2 text-sm" style={{ color: brand.red }}>⚠ {hata}</p>}

        {/* GTFS: rota + yön */}
        {kaynak === "gtfs" && feed && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">Rota ({rotalar.length})</span>
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {rotalar.map((r) => <option key={r.id} value={r.id}>{r.tipAd} · {r.ad}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">Yön</span>
              <select value={dir} onChange={(e) => setDir(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {yonler.map((y) => <option key={y.dir} value={y.dir}>{y.headsign || `Yön ${y.dir}`} · {y.duraklar} durak</option>)}
              </select>
            </label>
          </div>
        )}

        {/* CAD: katman eşleme */}
        {kaynak === "cad" && geo && (
          <div className="mt-4 rounded-md border p-3 text-xs" style={{ borderColor: brand.border }}>
            <div className="mb-2 font-semibold" style={{ color: brand.ink }}>Katman eşleme — hangi katman ne? ({geo.katmanlar.length} katman · {geo.polylines.length} çizgi · {geo.points.length} nokta · {geo.labels.length} metin)</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-medium" style={{ color: brand.inkSoft }}>🛤 Güzergâh (ray çizgileri)</div>
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
                <div className="mb-1 font-medium" style={{ color: brand.inkSoft }}>🚏 Duraklar (nokta/etiket)</div>
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
            {kurHata && <p className="mt-2" style={{ color: brand.red }}>⚠ {kurHata}</p>}
          </div>
        )}

        {/* Önizleme + mini şema + uygulama modu */}
        {kaynak && sonuc && (
          <>
            <div className="mt-4 rounded-md border-l-4 px-3 py-2.5 text-sm" style={{ borderColor: brand.ink, background: "#F7F9FA", color: brand.inkSoft }}>
              <div><b style={{ color: brand.ink }}>{sonuc.ad}</b> — {sonuc.durakSayisi} durak · {sonuc.toplamKm.toFixed(1)} km · {sonuc.rings.length} ring</div>
              {sonuc.yol && sonuc.duraklar && <SemaOnizleme yol={sonuc.yol} duraklar={sonuc.duraklar} />}
              <ul className="mt-1 ml-4 list-disc text-xs" style={{ color: brand.muted }}>
                {sonuc.uyarilar.map((u, i) => <li key={i} style={/AKTARILMADI/i.test(u) ? { color: CK.amberInk, fontWeight: 600 } : undefined}>{u}</li>)}
              </ul>
            </div>

            <div className="mt-3 text-sm">
              <div className="mb-1 field-label">Nasıl uygulansın?</div>
              <div className="flex flex-col gap-1">
                {(["degistir", "ekle", "yeniHat"] as IceAktarMod[]).map((m) => (
                  <label key={m} className="flex cursor-pointer items-start gap-2">
                    <input type="radio" name="iceMod" checked={mod === m} onChange={() => setMod(m)} className="mt-0.5" />
                    <span><b style={{ color: brand.ink }}>{m === "degistir" ? "Değiştir" : m === "ekle" ? "Ekle" : "Yeni hat olarak"}</b> <span className="text-xs" style={{ color: brand.muted }}>— {modAd[m]}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={disabled || mesgulDis}
                onClick={uygula}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
                ⬇ İçe aktar
              </button>
              {disabled && <span className="text-xs" style={{ color: CK.amberInk }}>Salt-okunur görünümde içe aktarma kapalı.</span>}
            </div>
          </>
        )}
        {kaynak === "cad" && !sonuc && !kurHata && <p className="mt-3 text-xs" style={{ color: brand.muted }}>Güzergâh ve durak katmanlarını seç → hat kurulur.</p>}
      </div>
    </details>
  );
}

/** İçe aktarılan hattın kuşbakışı mini şeması (dikilmiş yol + duraklar) — doğrulama için. */
function SemaOnizleme({ yol, duraklar }: { yol: { x: number; y: number }[]; duraklar: { ad: string; km: number; x: number; y: number }[] }) {
  const W = 320, H = 90, pad = 10;
  const xs = yol.map((p) => p.x), ys = yol.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1;
  const sc = Math.min((W - 2 * pad) / sx, (H - 2 * pad) / sy);
  const px = (p: { x: number; y: number }) => ({ x: pad + (p.x - minX) * sc, y: H - pad - (p.y - minY) * sc });
  const d = yol.map((p, i) => `${i === 0 ? "M" : "L"}${px(p).x.toFixed(1)},${px(p).y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-md rounded border" style={{ borderColor: brand.border, background: "#fff" }} role="img" aria-label="İçe aktarılan hat şeması">
      <path d={d} fill="none" stroke={brand.ink} strokeWidth={1.4} />
      {duraklar.map((s, i) => { const p = px(s); return <circle key={i} cx={p.x} cy={p.y} r={2} fill={brand.red} />; })}
    </svg>
  );
}
