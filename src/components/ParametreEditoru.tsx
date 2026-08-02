"use client";

// raysim — paylaşılan SİMÜLASYON PARAMETRELERİ düzenleyicisi.
//
// Tek kaynak: hem Sistem Merkezi bölümü hem de header'daki hızlı "Parametreler"
// modalı bu bileşeni kullanır → parametre UI'si tek yerde tanımlı, iki yerde de
// aynı. Değişiklik `patch({ [key]: ... })` ile cfg'ye yazılır → tüm modüller canlı
// güncellenir + otomatik kaydedilir (global "✓ Kaydedildi" bildirimi).

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig } from "@/components/SimConfigProvider";
import { PARAM_META, paramGoster, paramSI, birim, type ParamMeta, type ParamModul } from "@/lib/anaray/config";

// Modül etiketleri = 3 kategorik seri (valide: mavi · turkuaz · turuncu).
const MODUL_RENK: Record<ParamModul, string> = { sefer: CK.blue, ringler: CK.aqua, anklasman: CK.orange };

function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export function ParametreEditoru() {
  const { cfg, patch, yazilabilir } = useSimConfig();

  const gruplar = useMemo(() => {
    const g = new Map<string, ParamMeta[]>();
    for (const m of PARAM_META) g.set(m.grup, [...(g.get(m.grup) ?? []), m]);
    return [...g.entries()];
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {gruplar.map(([grup, params]) => (
        <div key={grup}>
          <div className="field-label mb-2 border-b pb-1" style={{ borderColor: brand.border }}>{grup}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {params.map((m) => (
              <div key={m.key} className="flex items-center gap-3 rounded border p-2.5" style={{ borderColor: brand.border }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: brand.ink }}>{m.ad}</div>
                  <div className="text-[0.7rem]" style={{ color: brand.muted }}>{m.etkiler}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.moduller.map((mm) => (<span key={mm} className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium" style={{ background: MODUL_RENK[mm] + "1A", color: MODUL_RENK[mm] }}>{mm}</span>))}
                    <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-mono" style={{ background: CK.track, color: brand.faint }}>{m.kaynak}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <input type="number" value={round(paramGoster(cfg, m), m.tur === "ivme" ? 1 : 0)} step={m.step} min={m.min} max={m.max}
                    disabled={!yazilabilir}
                    onChange={(e) => { const g = parseFloat(e.target.value); if (!Number.isNaN(g)) patch({ [m.key]: paramSI(m, g) }); }}
                    className="w-20 rounded border px-2 py-1 text-right text-sm tabular-nums disabled:opacity-50" style={{ borderColor: brand.border, color: brand.ink }} />
                  <span className="w-10 text-xs" style={{ color: brand.muted }}>{birim(m.tur)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
