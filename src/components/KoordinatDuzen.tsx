"use client";

// raysim — İSTASYON KOORDİNAT GİRİŞİ (Büyük sıçrama D — koordinat-duyarlı harita).
// Kullanıcı hattın istasyonlarına gerçek lat/lon girer → Canlı Ağ "Harita" modunda
// gerçek konumda çizilir. Girmezse yatay şematik kalır. Tek-tıkla "Konya gerçek
// koordinatları" preset'i (OSM kaynaklı 41 istasyon) ad eşleştirmesiyle doldurur.
// Koordinatlar Isletme.istasyonKoordinat'ta KALICI saklanır.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { konyaKoordinatBul } from "@/lib/anaray/konyaKoordinat";

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
  const k = koordinat ?? {};
  const doluSay = istasyonlar.filter((s) => k[s] && Number.isFinite(k[s].lat) && Number.isFinite(k[s].lon)).length;
  const konyaEsles = useMemo(() => istasyonlar.filter((s) => konyaKoordinatBul(s)).length, [istasyonlar]);
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
      if (!r.ok) { setOsmDurum("hata"); setOsmMesaj(j.hata || "Çekilemedi."); return; }
      if (!j.geometri || j.geometri.length === 0) { setOsmDurum("hata"); setOsmMesaj(j.uyari || "Bu alanda OSM hattı bulunamadı."); return; }
      onGeometri(j.geometri as GeoYol[]);
      setOsmDurum("bos"); setOsmMesaj(`✓ ${j.geometri.length} yol çekildi (© OpenStreetMap).`);
    } catch { setOsmDurum("hata"); setOsmMesaj("Bağlantı hatası — tekrar deneyin."); }
  };

  const set = (ad: string, alan: "lat" | "lon", v: number) => {
    const cur = k[ad] ?? { lat: 0, lon: 0 };
    onChange({ ...k, [ad]: { ...cur, [alan]: v } });
  };
  const konyaYukle = () => {
    const yeni: Koord = { ...k };
    for (const s of istasyonlar) { const c = konyaKoordinatBul(s); if (c) yeni[s] = { lat: c.lat, lon: c.lon }; }
    onChange(yeni);
  };
  const temizle = () => onChange({});

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: doluSay === istasyonlar.length ? CK.goodBgSoft : CK.track, color: doluSay === istasyonlar.length ? CK.good : brand.muted }}>
          {doluSay}/{istasyonlar.length} istasyon koordinatlı
        </span>
        {konyaEsles > 0 && (
          <button type="button" onClick={konyaYukle} className="rounded px-2.5 py-1 font-semibold text-white" style={{ background: brand.ink }}>
            Konya gerçek koordinatlarını yükle ({konyaEsles} eşleşme)
          </button>
        )}
        {onGeometri && doluSay >= 2 && (
          <button type="button" onClick={osmCek} disabled={osmDurum === "yukleniyor"}
            className="rounded px-2.5 py-1 font-semibold text-white disabled:opacity-60" style={{ background: "#2E7D57" }}
            title="Hattın bölgesinden OpenStreetMap raylı-hat geometrisini çeker — haritada gerçek kavisli hiza">
            {osmDurum === "yukleniyor" ? "⟳ OSM'den çekiliyor…" : "⤓ OSM'den gerçek hattı çek"}
          </button>
        )}
        {doluSay > 0 && (
          <button type="button" onClick={temizle} className="rounded px-2 py-1" style={{ border: `1px solid ${brand.border}`, color: brand.muted }}>Temizle</button>
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
              <input type="number" step="0.0001" inputMode="decimal" placeholder="enlem" value={k[s]?.lat ?? ""}
                onChange={(e) => set(s, "lat", parseFloat(e.target.value))}
                className="w-24 rounded border px-1.5 py-0.5 text-xs tabular-nums" style={{ borderColor: brand.border, color: brand.ink }} />
              <input type="number" step="0.0001" inputMode="decimal" placeholder="boylam" value={k[s]?.lon ?? ""}
                onChange={(e) => set(s, "lon", parseFloat(e.target.value))}
                className="w-24 rounded border px-1.5 py-0.5 text-xs tabular-nums" style={{ borderColor: brand.border, color: brand.ink }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 rounded-md border-l-2 pl-2 text-[0.68rem] leading-relaxed" style={{ borderColor: CK.good, color: brand.muted }}>
        <b style={{ color: brand.inkSoft }}>Gerçek hattı haritada görmenin 3 yolu:</b>
        <div className="mt-0.5">① <b>GTFS içe aktar</b> (transit verisi — gerçek geometri otomatik gelir) · ② <b>koordinat gir</b> + <b>“OSM'den çek”</b> (yukarıdaki yeşil buton) · ③ elle koordinat (düz-çizgi harita).</div>
        <div className="mt-0.5"><b>Tüm</b> istasyonlar koordinatlı olunca Canlı Ağ <b>Harita</b> modunda gerçek konumda çizilir. Koordinat + geometri <b>kalıcı</b> kaydolur (© OpenStreetMap · ODbL).</div>
      </div>
    </div>
  );
}
