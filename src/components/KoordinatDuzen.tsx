"use client";

// raysim — İSTASYON KOORDİNAT GİRİŞİ (Büyük sıçrama D — koordinat-duyarlı harita).
// Kullanıcı hattın istasyonlarına gerçek lat/lon girer → Canlı Ağ "Harita" modunda
// gerçek konumda çizilir. Girmezse yatay şematik kalır. Tek-tıkla "Konya gerçek
// koordinatları" preset'i (OSM kaynaklı 41 istasyon) ad eşleştirmesiyle doldurur.
// Koordinatlar Isletme.istasyonKoordinat'ta KALICI saklanır.

import { useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useDil } from "@/components/DilProvider";

type Koord = Record<string, { lat: number; lon: number }>;
type GeoYol = { insaat?: boolean; noktalar: [number, number][] };

export function KoordinatDuzen({
  istasyonlar,
  koordinat,
  onChange,
  onGeometri,
}: {
  istasyonlar: string[];
  koordinat?: Koord;
  onChange: (k: Koord) => void;
  /** Verilirse "OSM'den gerçek hattı çek" butonu görünür — hattın bbox'ından OSM
   *  geometrisi çekilip (sunucu, cache'li) haritada gerçek hiza olarak kullanılır. */
  onGeometri?: (g: GeoYol[]) => void;
}) {
  const { t } = useDil();
  const k = koordinat ?? {};
  const doluSay = istasyonlar.filter((s) => k[s] && Number.isFinite(k[s].lat) && Number.isFinite(k[s].lon)).length;
  const [osmDurum, setOsmDurum] = useState<"bos" | "yukleniyor" | "hata">("bos");
  const [osmMesaj, setOsmMesaj] = useState("");

  const osmCek = async () => {
    const noktalar = istasyonlar.map((s) => k[s]).filter((c): c is { lat: number; lon: number } => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lon));
    if (noktalar.length < 2 || !onGeometri) return;
    const lats = noktalar.map((c) => c.lat), lons = noktalar.map((c) => c.lon);
    const m = 0.004; // ~450 m pay (kenar hatlarını da yakala)
    const bbox: [number, number, number, number] = [Math.min(...lats) - m, Math.min(...lons) - m, Math.max(...lats) + m, Math.max(...lons) + m];
    setOsmDurum("yukleniyor"); setOsmMesaj("");
    try {
      const r = await fetch("/api/geometri/osm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bbox }) });
      const j = await r.json();
      if (!r.ok) { setOsmDurum("hata"); setOsmMesaj(j.hata || t({ tr: "Çekilemedi.", en: "Could not fetch.", de: "Konnte nicht abgerufen werden." })); return; }
      if (!j.geometri || j.geometri.length === 0) { setOsmDurum("hata"); setOsmMesaj(j.uyari || t({ tr: "Bu alanda OSM hattı bulunamadı.", en: "No OSM line found in this area.", de: "In diesem Gebiet wurde keine OSM-Trasse gefunden." })); return; }
      onGeometri(j.geometri as GeoYol[]);
      setOsmDurum("bos"); setOsmMesaj(`✓ ${j.geometri.length} ${t({ tr: "yol çekildi (© OpenStreetMap).", en: "ways fetched (© OpenStreetMap).", de: "Wege abgerufen (© OpenStreetMap)." })}`);
    } catch { setOsmDurum("hata"); setOsmMesaj(t({ tr: "Bağlantı hatası — tekrar deneyin.", en: "Connection error — please try again.", de: "Verbindungsfehler — bitte erneut versuchen." })); }
  };

  const set = (ad: string, alan: "lat" | "lon", v: number) => {
    const cur = k[ad] ?? { lat: 0, lon: 0 };
    onChange({ ...k, [ad]: { ...cur, [alan]: v } });
  };
  const temizle = () => onChange({});

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: doluSay === istasyonlar.length ? CK.goodBgSoft : CK.track, color: doluSay === istasyonlar.length ? CK.good : brand.muted }}>
          {doluSay}/{istasyonlar.length} {t({ tr: "istasyon koordinatlı", en: "stations with coordinates", de: "Haltestellen mit Koordinaten" })}
        </span>
        {onGeometri && doluSay >= 2 && (
          <button type="button" onClick={osmCek} disabled={osmDurum === "yukleniyor"}
            className="rounded px-2.5 py-1 font-semibold text-white disabled:opacity-60" style={{ background: "#2E7D57" }}
            title={t({ tr: "Hattın bölgesinden OpenStreetMap raylı-hat geometrisini çeker — haritada gerçek kavisli hiza", en: "Fetches OpenStreetMap rail geometry from the line's area — real curved alignment on the map", de: "Ruft die OpenStreetMap-Gleisgeometrie aus dem Streckenbereich ab — echte gekrümmte Trasse auf der Karte" })}>
            {osmDurum === "yukleniyor" ? t({ tr: "⟳ OSM'den çekiliyor…", en: "⟳ Fetching from OSM…", de: "⟳ Wird von OSM abgerufen…" }) : t({ tr: "⤓ OSM'den gerçek hattı çek", en: "⤓ Fetch real line from OSM", de: "⤓ Echte Trasse von OSM abrufen" })}
          </button>
        )}
        {doluSay > 0 && (
          <button type="button" onClick={temizle} className="rounded px-2 py-1" style={{ border: `1px solid ${brand.border}`, color: brand.muted }}>{t({ tr: "Temizle", en: "Clear", de: "Löschen" })}</button>
        )}
      </div>
      {osmMesaj && (
        <div className="mb-2 text-[0.72rem]" style={{ color: osmDurum === "hata" ? CK.red : CK.good }}>{osmMesaj}</div>
      )}
      <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-auto pr-1 sm:grid-cols-2">
        {istasyonlar.map((s) => {
          const dolu = k[s] && Number.isFinite(k[s].lat) && Number.isFinite(k[s].lon);
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-28 shrink-0 truncate text-[0.72rem]" style={{ color: dolu ? brand.ink : brand.muted }} title={s}>{s}</span>
              <input type="number" step="0.0001" inputMode="decimal" placeholder={t({ tr: "enlem", en: "latitude", de: "Breite" })} value={k[s]?.lat ?? ""}
                onChange={(e) => set(s, "lat", parseFloat(e.target.value))}
                className="w-24 rounded border px-1.5 py-0.5 text-xs tabular-nums" style={{ borderColor: brand.border, color: brand.ink }} />
              <input type="number" step="0.0001" inputMode="decimal" placeholder={t({ tr: "boylam", en: "longitude", de: "Länge" })} value={k[s]?.lon ?? ""}
                onChange={(e) => set(s, "lon", parseFloat(e.target.value))}
                className="w-24 rounded border px-1.5 py-0.5 text-xs tabular-nums" style={{ borderColor: brand.border, color: brand.ink }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-md border-l-2 pl-2 text-[0.68rem] leading-relaxed" style={{ borderColor: CK.good, color: brand.muted }}>
        <b style={{ color: brand.inkSoft }}>{t({ tr: "Gerçek hattı haritada görmenin 3 yolu:", en: "3 ways to see the real line on the map:", de: "3 Wege, die echte Trasse auf der Karte zu sehen:" })}</b>
        <div className="mt-0.5">① <b>{t({ tr: "GTFS içe aktar", en: "GTFS import", de: "GTFS-Import" })}</b> {t({ tr: "(transit verisi — gerçek geometri otomatik gelir) · ② ", en: "(transit data — real geometry comes automatically) · ② ", de: "(Transitdaten — echte Geometrie kommt automatisch) · ② " })}<b>{t({ tr: "koordinat gir", en: "enter coordinates", de: "Koordinaten eingeben" })}</b> + <b>{t({ tr: "“OSM'den çek”", en: "“Fetch from OSM”", de: "„Von OSM abrufen“" })}</b> {t({ tr: "(yukarıdaki yeşil buton) · ③ elle koordinat (düz-çizgi harita).", en: "(the green button above) · ③ manual coordinates (straight-line map).", de: "(die grüne Schaltfläche oben) · ③ manuelle Koordinaten (Karte mit geraden Linien)." })}</div>
        <div className="mt-0.5"><b>{t({ tr: "Tüm", en: "All", de: "Alle" })}</b> {t({ tr: "istasyonlar koordinatlı olunca Canlı Ağ ", en: "stations having coordinates draws the Live Network in ", de: "Haltestellen mit Koordinaten zeichnet das Live-Netz im " })}<b>{t({ tr: "Harita", en: "Map", de: "Karte" })}</b> {t({ tr: "modunda gerçek konumda çizilir. Koordinat + geometri ", en: "mode at the real position. Coordinates + geometry are saved ", de: "-Modus an der echten Position. Koordinaten + Geometrie werden " })}<b>{t({ tr: "kalıcı", en: "permanently", de: "dauerhaft" })}</b> {t({ tr: "kaydolur (© OpenStreetMap · ODbL).", en: "(© OpenStreetMap · ODbL).", de: "gespeichert (© OpenStreetMap · ODbL)." })}</div>
        <div className="mt-0.5" style={{ color: brand.inkSoft }}><b>{t({ tr: "Bunların hiçbiri kurduğun hattı değiştirmez", en: "None of this changes the line you built", de: "Nichts davon ändert die von Ihnen erstellte Strecke" })}</b> {t({ tr: "— durak/mesafe/makas/sinyal aynen kalır (simülasyon senin mesafelerini kullanır); yalnız ", en: "— stations/distances/switches/signals stay the same (the simulation uses your distances); only ", de: "— Haltestellen/Entfernungen/Weichen/Signale bleiben gleich (die Simulation nutzt Ihre Entfernungen); nur " })}<b>{t({ tr: "harita için", en: "for the map", de: "für die Karte" })}</b> {t({ tr: "koordinat + hiza eklenir. OSM eşleşmesi ", en: "coordinates + alignment are added. OSM matching is ", de: "werden Koordinaten + Trasse ergänzt. Die OSM-Zuordnung erfolgt " })}<b>{t({ tr: "durak adına", en: "by stop name", de: "nach Haltestellenname" })}</b> {t({ tr: "göredir.", en: ".", de: "." })}</div>
      </div>
    </div>
  );
}
