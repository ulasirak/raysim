"use client";

// raysim — İSTASYON KOORDİNAT GİRİŞİ (Büyük sıçrama D — koordinat-duyarlı harita).
// Kullanıcı hattın istasyonlarına gerçek lat/lon girer → Canlı Ağ "Harita" modunda
// gerçek konumda çizilir. Girmezse yatay şematik kalır. Tek-tıkla "Konya gerçek
// koordinatları" preset'i (OSM kaynaklı 41 istasyon) ad eşleştirmesiyle doldurur.
// Koordinatlar Isletme.istasyonKoordinat'ta KALICI saklanır.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { konyaKoordinatBul } from "@/lib/anaray/konyaKoordinat";

type Koord = Record<string, { lat: number; lon: number }>;

export function KoordinatDuzen({
  istasyonlar,
  koordinat,
  onChange,
}: {
  istasyonlar: string[];
  koordinat?: Koord;
  onChange: (k: Koord) => void;
}) {
  const k = koordinat ?? {};
  const doluSay = istasyonlar.filter((s) => k[s] && Number.isFinite(k[s].lat) && Number.isFinite(k[s].lon)).length;
  const konyaEsles = useMemo(() => istasyonlar.filter((s) => konyaKoordinatBul(s)).length, [istasyonlar]);

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
        {doluSay > 0 && (
          <button type="button" onClick={temizle} className="rounded px-2 py-1" style={{ border: `1px solid ${brand.border}`, color: brand.muted }}>Temizle</button>
        )}
      </div>
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
      <p className="mt-2 text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
        <b>Tüm</b> istasyonlar koordinatlı olunca Canlı Ağ <b>Harita</b> modunda gerçek konumda (equirectangular, kuzey yukarı) çizilir; eksikse ölçekli/şematik kalır. Koordinatlar kalıcı kaydolur (© OpenStreetMap · ODbL).
      </p>
    </div>
  );
}
