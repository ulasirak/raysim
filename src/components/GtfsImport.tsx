"use client";

// raysim — GTFS İÇE AKTARMA (UI). Bir GTFS .zip yükle → rota + yön seç → önizle →
// "İçe aktar" ile hattı RaySim ring zincirine çevir (mevcut hattın üzerine yazar;
// RingEditor'daki "geri al" ile dönülebilir). Çekirdek: lib/anaray/gtfs (test edilmiş).

import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { parseGtfsZip, gtfsRotalar, gtfsYonler, gtfsHatKur, type GtfsFeed } from "@/lib/anaray/gtfs";
import type { DurakArasiRing } from "@/lib/anaray/ring";

export function GtfsImport({ onIceAktar, disabled }: { onIceAktar: (rings: DurakArasiRing[], ad: string) => void; disabled?: boolean }) {
  const [feed, setFeed] = useState<GtfsFeed | null>(null);
  const [dosyaAd, setDosyaAd] = useState("");
  const [routeId, setRouteId] = useState("");
  const [dir, setDir] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const rotalar = useMemo(() => (feed ? gtfsRotalar(feed) : []), [feed]);
  const yonler = useMemo(() => (feed && routeId ? gtfsYonler(feed, routeId) : []), [feed, routeId]);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setMesgul(true); setHata(null); setFeed(null); setRouteId(""); setDir("");
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const parsed = parseGtfsZip(buf);
      setFeed(parsed); setDosyaAd(f.name);
      // Varsayılan: ilk TRAMVAY rotası (route_type 0), yoksa ilk rota.
      const r = gtfsRotalar(parsed);
      const ilk = r.find((x) => x.tip === "0") ?? r[0];
      if (ilk) setRouteId(ilk.id);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "GTFS okunamadı.");
    } finally { setMesgul(false); }
  };

  // Rota değişince ilk yönü seç.
  useEffect(() => {
    if (yonler.length && !yonler.some((y) => y.dir === dir)) setDir(yonler[0].dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, feed]);

  const sonuc = useMemo(() => {
    if (!feed || !routeId || !dir) return null;
    try { return gtfsHatKur(feed, routeId, dir); } catch { return null; }
  }, [feed, routeId, dir]);

  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>GTFS'ten İçe Aktar</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>bir toplu taşıma ağının .zip'inden hattı otomatik kur</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs" style={{ color: brand.muted }}>
          GTFS <b>.zip</b> yükle (stops/routes/trips/stop_times). Rota ve yön seç → sıralı duraklar, gerçek konumdan (haversine) mesafeler ve stop_times'tan duruş süreleriyle hat kurulur. Makas/sinyal GTFS'te yoktur; Ringler'de eklenir.
        </p>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
          📁 GTFS .zip seç
          <input type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
            onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {dosyaAd && <span className="ml-2 text-xs" style={{ color: brand.muted }}>{dosyaAd}{mesgul ? " · okunuyor…" : ""}</span>}
        {hata && <p className="mt-2 text-sm" style={{ color: brand.red }}>⚠ {hata}</p>}

        {feed && (
          <>
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

            {sonuc ? (
              <div className="mt-4 rounded-md border-l-4 px-3 py-2.5 text-sm" style={{ borderColor: brand.ink, background: "#F7F9FA", color: brand.inkSoft }}>
                <div><b style={{ color: brand.ink }}>{sonuc.ad}</b> — {sonuc.durakSayisi} durak · {sonuc.toplamKm.toFixed(1)} km · {sonuc.rings.length} ring</div>
                <ul className="mt-1 ml-4 list-disc text-xs" style={{ color: brand.muted }}>
                  {sonuc.uyarilar.map((u, i) => <li key={i}>{u}</li>)}
                </ul>
              </div>
            ) : <p className="mt-3 text-sm" style={{ color: brand.muted }}>Bu rota/yön için hat kurulamadı (yetersiz durak).</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={disabled || !sonuc}
                onClick={() => { if (sonuc && confirm(`“${sonuc.ad}” (${sonuc.durakSayisi} durak) içe aktarılsın mı? MEVCUT HAT ÜZERİNE YAZILIR (geri alınabilir).`)) onIceAktar(sonuc.rings, sonuc.ad); }}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
                ⬇ Bu hattı içe aktar
              </button>
              {disabled && <span className="text-xs" style={{ color: CK.amberInk }}>Salt-okunur görünümde içe aktarma kapalı.</span>}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
