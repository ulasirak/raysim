"use client";

// raysim — İÇE AKTARMA (UI): GTFS (.zip) veya railML (.xml). Dosya yükle → (GTFS ise
// rota+yön seç) → önizle → "İçe aktar" ile RaySim ring zincirine çevir (mevcut hattın
// üzerine yazar; RingEditor "geri al" ile dönülebilir). Çekirdekler test edilmiştir:
// lib/anaray/gtfs + lib/anaray/railml.

import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur, type GtfsFeed } from "@/lib/anaray/gtfs";
import { railmlHatKur } from "@/lib/anaray/railml";
import type { DurakArasiRing } from "@/lib/anaray/ring";

interface HatSonuc { rings: DurakArasiRing[]; ad: string; durakSayisi: number; toplamKm: number; uyarilar: string[]; }

export function GtfsImport({ onIceAktar, disabled }: { onIceAktar: (rings: DurakArasiRing[], ad: string) => void; disabled?: boolean }) {
  const [kaynak, setKaynak] = useState<"gtfs" | "railml" | null>(null);
  const [feed, setFeed] = useState<GtfsFeed | null>(null);       // GTFS
  const [railmlSonuc, setRailmlSonuc] = useState<HatSonuc | null>(null); // railML
  const [dosyaAd, setDosyaAd] = useState("");
  const [routeId, setRouteId] = useState("");
  const [dir, setDir] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const rotalar = useMemo(() => (feed ? gtfsRotalar(feed) : []), [feed]);
  const yonler = useMemo(() => (feed && routeId ? gtfsYonler(feed, routeId) : []), [feed, routeId]);

  const sifirla = () => { setKaynak(null); setFeed(null); setRailmlSonuc(null); setRouteId(""); setDir(""); setHata(null); };

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setMesgul(true); sifirla();
    try {
      const ad = f.name.toLowerCase();
      const railmlMi = ad.endsWith(".xml") || ad.endsWith(".railml");
      if (railmlMi) {
        setRailmlSonuc(railmlHatKur(await f.text())); setKaynak("railml");
      } else {
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

  const sonuc: HatSonuc | null = kaynak === "gtfs" ? gtfsSonuc : railmlSonuc;

  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>GTFS / railML'den İçe Aktar</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>bir ağın dosyasından hattı otomatik kur</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs" style={{ color: brand.muted }}>
          <b>GTFS .zip</b> (toplu taşıma feed'i) veya <b>railML .xml</b> (demiryolu altyapısı) yükle. Sıralı duraklar + gerçek mesafeler + (GTFS'te) duruş süreleriyle hat kurulur. Makas/sinyal içe aktarılmaz; Ringler'de eklenir.
        </p>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
          📁 Dosya seç (.zip / .xml)
          <input type="file" accept=".zip,.xml,.railml,application/zip,application/x-zip-compressed,text/xml,application/xml" className="hidden"
            onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {dosyaAd && <span className="ml-2 text-xs" style={{ color: brand.muted }}>{dosyaAd}{kaynak ? ` · ${kaynak.toUpperCase()}` : ""}{mesgul ? " · okunuyor…" : ""}</span>}
        {hata && <p className="mt-2 text-sm" style={{ color: brand.red }}>⚠ {hata}</p>}

        {kaynak === "gtfs" && feed && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">Rota ({rotalar.length})</span>
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {rotalar.map((r) => <option key={r.id} value={r.id}>{r.tipAd} · {r.ad}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">Yön</span>
              <select value={dir} onChange={(e) => setDir(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {yonler.map((y) => <option key={y.dir} value={y.dir}>{y.headsign || `Yön ${y.dir}`} · {y.duraklar} durak</option>)}
              </select>
            </label>
          </div>
        )}

        {kaynak && (sonuc ? (
          <>
            <div className="mt-4 rounded-md border-l-4 px-3 py-2.5 text-sm" style={{ borderColor: brand.ink, background: "#F7F9FA", color: brand.inkSoft }}>
              <div><b style={{ color: brand.ink }}>{sonuc.ad}</b> — {sonuc.durakSayisi} durak · {sonuc.toplamKm.toFixed(1)} km · {sonuc.rings.length} ring</div>
              <ul className="mt-1 ml-4 list-disc text-xs" style={{ color: brand.muted }}>
                {sonuc.uyarilar.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={disabled}
                onClick={() => { if (confirm(`“${sonuc.ad}” (${sonuc.durakSayisi} durak) içe aktarılsın mı? MEVCUT HAT ÜZERİNE YAZILIR (geri alınabilir).`)) onIceAktar(sonuc.rings, sonuc.ad); }}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
                ⬇ Bu hattı içe aktar
              </button>
              {disabled && <span className="text-xs" style={{ color: CK.amberInk }}>Salt-okunur görünümde içe aktarma kapalı.</span>}
            </div>
          </>
        ) : <p className="mt-3 text-sm" style={{ color: brand.muted }}>Hat kurulamadı (yetersiz durak/konum).</p>)}
      </div>
    </details>
  );
}
