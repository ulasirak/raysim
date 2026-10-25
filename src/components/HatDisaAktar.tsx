"use client";

// raysim — HAT DIŞA AKTAR (railML 2.2 · GTFS). Context'ten beslenen, kendi-kendine yeten
// bileşen. ÇIKTI adımı olduğu için akışta Belgeler (BELGELE) modülünde durur — Ringler'den
// (KUR) taşındı: önce kur/analiz et, en son dışa aktar. Ücretsiz (istemci-taraflı indirme).

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { ringDuraklari, ringSenaryo } from "@/lib/anaray/ring";
import { railmlIhrac } from "@/lib/anaray/railml";
import { gtfsIhrac, type GtfsDurakZaman } from "@/lib/anaray/gtfs";
import { indir } from "@/lib/anaray/format";
import { useDil } from "@/components/DilProvider";

export function HatDisaAktar() {
  const { t } = useDil();
  const { cfg } = useSimConfig();
  const { rings, meta, subeler, yazilabilir } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();

  const duraklar = useMemo(() => ringDuraklari(rings), [rings]);
  const gtfsKoordVar = duraklar.length > 0 && duraklar.every((d) => {
    const k = isletme.istasyonKoordinat?.[d.ad];
    return !!k && Number.isFinite(k.lat) && Number.isFinite(k.lon);
  });
  const koordSayisi = duraklar.filter((d) => { const k = isletme.istasyonKoordinat?.[d.ad]; return !!k && Number.isFinite(k.lat) && Number.isFinite(k.lon); }).length;
  const koordGuncelle = (ad: string, alan: "lat" | "lon", v: number) => {
    const cur = isletme.istasyonKoordinat ?? {};
    const mevcut = cur[ad] ?? { lat: NaN, lon: NaN };
    patchIsletme({ istasyonKoordinat: { ...cur, [ad]: { ...mevcut, [alan]: v } }, koordinatKaynak: "manuel" });
  };

  if (rings.length === 0) return null;

  return (
    <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
      <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Dışa Aktar", en: "Export", de: "Export" })}</span>
        <span className="ml-2 text-xs" style={{ color: brand.muted }}>{t({ tr: "hattı başka yazılımlarda açmak için dosya indir — opsiyonel", en: "download the line as a file to open in other software — optional", de: "die Strecke als Datei für andere Software herunterladen — optional" })}</span>
      </summary>
      <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
        <p className="mb-3 text-xs" style={{ color: brand.muted }}>
          {t({ tr: "Kurduğun hattı standart bir dosya olarak indirir — yalnızca RaySim DIŞINDA kullanmak içindir (gerekmiyorsa atlayabilirsin; RaySim'deki hattın değişmez).", en: "Downloads the line you built as a standard file — only for use OUTSIDE RaySim (skip it if you don't need it; your line in RaySim stays the same).", de: "Lädt die aufgebaute Strecke als Standarddatei herunter — nur zur Nutzung AUSSERHALB von RaySim (überspringbar, wenn nicht benötigt; Ihre Strecke in RaySim bleibt gleich)." })}
          {" "}<b>railML 2.2</b> {t({ tr: "→ profesyonel demiryolu simülatörleri (OpenTrack / RailSys): altyapı + araç + çift-yön çizelge.", en: "→ professional railway simulators (OpenTrack / RailSys): infrastructure + rolling stock + two-way timetable.", de: "→ professionelle Eisenbahnsimulatoren (OpenTrack / RailSys): Infrastruktur + Fahrzeuge + Zwei-Wege-Fahrplan." })}
          {" "}<b>GTFS</b> {t({ tr: "→ harita / toplu-taşıma uygulamaları (Google Maps vb.): duraklar + çift-yön çizelge + servis penceresi.", en: "→ map / transit apps (Google Maps etc.): stops + two-way timetable + service window.", de: "→ Karten-/ÖPNV-Apps (Google Maps usw.): Haltestellen + Zwei-Wege-Fahrplan + Betriebsfenster." })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            onClick={() => {
              const hhmm = (s?: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : undefined; };
              const xml = railmlIhrac(rings, meta.hatAdi || "RaySim hattı", {
                stock, cfg, headwaySn: cfg.headway,
                servisBasSn: hhmm(isletme.servisBas), servisBitSn: hhmm(isletme.servisBit),
                subeler,
              });
              const ad = (meta.hatAdi || "raysim-hat").trim().replace(/[^\w.-]+/g, "_") || "raysim-hat";
              indir(new Blob([xml], { type: "application/xml" }), `${ad}.railml.xml`);
            }}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>
            {t({ tr: "⬆ railML (.xml)", en: "⬆ railML (.xml)", de: "⬆ railML (.xml)" })}
          </button>
          <button type="button" disabled={!gtfsKoordVar}
            title={gtfsKoordVar ? t({ tr: "GTFS .zip indir (duraklar + RaySim çizelgesi)", en: "Download GTFS .zip (stops + RaySim timetable)", de: "GTFS-.zip herunterladen (Haltestellen + RaySim-Fahrplan)" }) : t({ tr: "GTFS için durak koordinatı (lat/lon) gerekli — hattı GTFS'ten içe aktarın", en: "Stop coordinates (lat/lon) required for GTFS — import the line from GTFS", de: "Für GTFS sind Haltestellenkoordinaten (lat/lon) erforderlich — Strecke aus GTFS importieren" })}
            onClick={() => {
              const kmap = isletme.istasyonKoordinat ?? {};
              const dz: GtfsDurakZaman[] = [];
              let tt = 0;
              for (let i = 0; i < duraklar.length; i++) {
                const k = kmap[duraklar[i].ad];
                if (!k || !Number.isFinite(k.lat) || !Number.isFinite(k.lon)) return;
                const dwell = i === 0 ? 0 : Math.max(0, rings[i - 1]?.dwell ?? 0);
                const varis = tt;
                const kalkis = varis + dwell;
                dz.push({ id: `S${i}`, ad: duraklar[i].ad, lat: k.lat, lon: k.lon, varisSn: varis, kalkisSn: kalkis });
                if (i < rings.length) tt = kalkis + ringSenaryo(rings[i], stock, cfg).nominalSeyir;
              }
              const trunkIdByAd = new Map(duraklar.map((d, i) => [d.ad, `S${i}`]));
              const subeGtfs = subeler.map((s, bi) => {
                const bDur = ringDuraklari(s.rings);
                if (bDur.length < 2) return null;
                const dzs: GtfsDurakZaman[] = [];
                let tb = 0;
                for (let i = 0; i < bDur.length; i++) {
                  const k = kmap[bDur[i].ad];
                  if (!k || !Number.isFinite(k.lat) || !Number.isFinite(k.lon)) return null;
                  const dwell = i === 0 ? 0 : Math.max(0, s.rings[i - 1]?.dwell ?? 0);
                  const varis = tb;
                  const kalkis = varis + dwell;
                  const id = i === 0 ? (trunkIdByAd.get(bDur[i].ad) ?? `Sb${bi}_0`) : `Sb${bi}_${i}`;
                  dzs.push({ id, ad: bDur[i].ad, lat: k.lat, lon: k.lon, varisSn: varis, kalkisSn: kalkis });
                  if (i < s.rings.length) tb = kalkis + ringSenaryo(s.rings[i], stock, cfg).nominalSeyir;
                }
                return { ad: s.ad || `Şube ${bi + 1}`, duraklar: dzs, headwaySn: cfg.headway };
              }).filter((x): x is { ad: string; duraklar: GtfsDurakZaman[]; headwaySn: number } => x !== null);
              const hhmm = (s?: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : undefined; };
              const zip = gtfsIhrac({
                hatAdi: meta.hatAdi || "RaySim hattı",
                agency: meta.idare || meta.sinyalizasyonFirmasi || "RaySim",
                duraklar: dz,
                headwaySn: cfg.headway,
                baslangicSn: hhmm(isletme.servisBas),
                bitisSn: hhmm(isletme.servisBit),
                subeler: subeGtfs,
              });
              const ad = (meta.hatAdi || "raysim-hat").trim().replace(/[^\w.-]+/g, "_") || "raysim-hat";
              indir(new Blob([new Uint8Array(zip)], { type: "application/zip" }), `${ad}.gtfs.zip`);
            }}
            className="rounded-md border px-4 py-2 text-sm font-semibold transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            style={{ borderColor: brand.borderStrong, color: brand.ink }}>
            {t({ tr: "⬆ GTFS (.zip)", en: "⬆ GTFS (.zip)", de: "⬆ GTFS (.zip)" })}
          </button>
        </div>
        {subeler.length > 0 && (
          <p className="mt-2 rounded border-l-2 px-2 py-1 text-xs" style={{ borderColor: brand.red, background: CK.badBgSoft, color: brand.inkSoft }}>
            ◆ {subeler.length} {t({ tr: "tali hat da dışa aktarılır", en: "branch line(s) are also exported", de: "Abzweigung(en) werden ebenfalls exportiert" })}: <b>railML</b> {t({ tr: "her şubeyi ayrı <track> olarak (kavşak ocp'sinde ayrılır) yazar — durak ve geometri kaybı yok. ", en: "writes each branch as a separate <track> (diverging at the junction ocp) — no loss of stops or geometry. ", de: "schreibt jede Abzweigung als separaten <track> (Abzweig am Knoten-ocp) — kein Verlust von Haltestellen oder Geometrie. " })}<b>GTFS</b> {t({ tr: "her şubeyi ayrı route + çift yön sefer yapar (koordinatı tam olan şubeler).", en: "makes each branch a separate route + both-way service (branches with complete coordinates).", de: "macht jede Abzweigung zu einer eigenen Route + Betrieb in beide Richtungen (Abzweigungen mit vollständigen Koordinaten)." })}
          </p>
        )}
        {!gtfsKoordVar && (
          <p className="mt-2 text-xs" style={{ color: brand.muted }}>
            {t({ tr: "GTFS için durakların ", en: "For GTFS, the stops need their ", de: "Für GTFS benötigen die Haltestellen ihre " })}<b>{t({ tr: "coğrafi koordinatı (lat/lon)", en: "geographic coordinates (lat/lon)", de: "geografischen Koordinaten (lat/lon)" })}</b>{t({ tr: " gerekir — GTFS'ten içe aktarınca otomatik gelir, ya da ", en: " — they come automatically when importing from GTFS, or ", de: " — sie kommen automatisch beim Import aus GTFS, oder " })}<b>{t({ tr: "aşağıdan elle gir", en: "enter them manually below", de: "unten manuell eingeben" })}</b>{t({ tr: ". railML her hatta çalışır.", en: ". railML works for every line.", de: ". railML funktioniert für jede Strecke." })}
          </p>
        )}
        {yazilabilir && duraklar.length > 0 && (
          <details className="mt-3 rounded border" style={{ borderColor: brand.border }}>
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium" style={{ color: brand.ink }}>
              {t({ tr: "İstasyon koordinatları (GTFS için) — ", en: "Station coordinates (for GTFS) — ", de: "Stationskoordinaten (für GTFS) — " })}<span style={{ color: koordSayisi === duraklar.length ? "#16794C" : CK.amberInk }}>{koordSayisi}/{duraklar.length}</span> {t({ tr: "girildi", en: "entered", de: "eingegeben" })}
            </summary>
            <div className="max-h-64 overflow-auto border-t px-3 py-2" style={{ borderColor: brand.border }}>
              <p className="mb-2 text-xs" style={{ color: brand.muted }}>{t({ tr: "Enlem/boylam (WGS84, ondalık derece). Tümü dolunca GTFS indirilebilir. ", en: "Latitude/longitude (WGS84, decimal degrees). Once all are filled, GTFS can be downloaded. ", de: "Breite/Länge (WGS84, Dezimalgrad). Sobald alle ausgefüllt sind, kann GTFS heruntergeladen werden. " })}<b>{t({ tr: "İpucu:", en: "Tip:", de: "Tipp:" })}</b>{t({ tr: " Google Maps'te durağa sağ tık → koordinat çiftini kopyala.", en: " In Google Maps, right-click the stop → copy the coordinate pair.", de: " In Google Maps mit Rechtsklick auf die Haltestelle → das Koordinatenpaar kopieren." })}</p>
              {duraklar.map((d, i) => {
                const k = isletme.istasyonKoordinat?.[d.ad];
                return (
                  <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className="w-40 shrink-0 truncate" title={d.ad} style={{ color: brand.inkSoft }}>{i + 1}. {d.ad}</span>
                    <input type="number" step="0.000001" placeholder={t({ tr: "enlem", en: "latitude", de: "Breite" })} value={k && Number.isFinite(k.lat) ? k.lat : ""} onChange={(e) => koordGuncelle(d.ad, "lat", parseFloat(e.target.value))}
                      className="w-28 rounded border px-1.5 py-0.5" style={{ borderColor: brand.border, color: brand.ink }} />
                    <input type="number" step="0.000001" placeholder={t({ tr: "boylam", en: "longitude", de: "Länge" })} value={k && Number.isFinite(k.lon) ? k.lon : ""} onChange={(e) => koordGuncelle(d.ad, "lon", parseFloat(e.target.value))}
                      className="w-28 rounded border px-1.5 py-0.5" style={{ borderColor: brand.border, color: brand.ink }} />
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
