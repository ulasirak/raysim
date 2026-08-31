"use client";

// raysim — DUYARLILIK (tornado) paneli. Hedef metriği hangi parametrenin en çok
// oynattığını gösterir; her çubuk parametreyi ±Δ oynattığındaki alt/üst değeri, taban
// (dikey çizgi) etrafında gösterir. En güçlü kaldıraç tepede. Çekirdek: lib/duyarlilik.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { duyarlilikAnaliz, type DuyarlilikHedef } from "@/lib/anaray/duyarlilik";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { RollingStock } from "@/lib/anaray/types";
import type { SimConfig, Isletme } from "@/lib/anaray/config";

export function Duyarlilik({ ringsHam, stock, cfg, isletme }: { ringsHam: DurakArasiRing[]; stock: RollingStock; cfg: SimConfig; isletme: Isletme }) {
  const [hedef, setHedef] = useState<DuyarlilikHedef>("isletmeKap");
  const [delta, setDelta] = useState(20);
  const s = useMemo(() => duyarlilikAnaliz(ringsHam, stock, cfg, isletme, hedef, delta), [ringsHam, stock, cfg, isletme, hedef, delta]);

  if (ringsHam.length < 1 || s.taban <= 0) {
    return (
      <div className="mt-6 rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
        <PanelBaslik ad="Duyarlılık (Tornado)" not="hangi parametre kapasiteyi en çok oynatıyor" />
        <p className="text-sm" style={{ color: brand.muted }}>Analiz için kurulu bir hat gerekir (Ringler).</p>
      </div>
    );
  }

  // Eksen: tüm alt/üst değerler + taban.
  const hepsi = [s.taban, ...s.satirlar.flatMap((x) => [x.eksi, x.arti])];
  const min = Math.min(...hepsi), max = Math.max(...hepsi), span = max - min || 1;
  const yuzde = (v: number) => ((v - min) / span) * 100;

  return (
    <div className="mt-6 rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <PanelBaslik ad="Duyarlılık (Tornado)" not="hangi parametre hedef metriği en çok oynatıyor — en güçlü kaldıraç tepede" />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label>
          <span className="field-label">Hedef metrik</span>
          <select value={hedef} onChange={(e) => setHedef(e.target.value as DuyarlilikHedef)}
            className="mt-1 block rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
            <option value="isletmeKap">İşletme kapasitesi (tren/saat)</option>
            <option value="nTeorik">Teorik maks tramvay</option>
          </select>
        </label>
        <label>
          <span className="field-label">Oynatma (±)</span>
          <div className="mt-1 flex items-center gap-1">
            <input type="number" min={5} max={50} step={5} value={delta} onChange={(e) => setDelta(Math.max(5, Math.min(50, parseFloat(e.target.value) || 20)))}
              className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
            <span className="text-xs" style={{ color: brand.muted }}>%</span>
          </div>
        </label>
        <div className="text-sm" style={{ color: brand.inkSoft }}>
          Taban <b style={{ color: brand.ink }}>{s.taban}</b> · {s.hedefAd}
        </div>
      </div>

      {/* Taban etiketli eksen */}
      <div className="relative mb-1 h-4 text-[0.6rem]" style={{ color: brand.muted }}>
        <span className="absolute" style={{ left: 0 }}>{Math.round(min * 10) / 10}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${yuzde(s.taban)}%`, color: brand.ink, fontWeight: 700 }}>taban {s.taban}</span>
        <span className="absolute" style={{ right: 0 }}>{Math.round(max * 10) / 10}</span>
      </div>

      <div className="space-y-2">
        {s.satirlar.map((r) => {
          const dusuk = Math.min(r.eksi, r.arti), yuksek = Math.max(r.eksi, r.arti);
          const sol = yuzde(dusuk), gen = Math.max(1.5, yuzde(yuksek) - yuzde(dusuk));
          return (
            <div key={r.ad} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-right text-xs" style={{ color: brand.inkSoft }}>{r.ad}</span>
              <div className="relative h-5 flex-1 rounded" style={{ background: "#F1F4F7" }}>
                {/* taban dikey çizgi */}
                <div className="absolute top-0 h-full" style={{ left: `${yuzde(s.taban)}%`, width: 1.5, background: brand.borderStrong }} />
                {/* salınım çubuğu */}
                <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded" style={{ left: `${sol}%`, width: `${gen}%`, background: r.salinim < 1e-6 ? "#C9D2DA" : CK.gold, opacity: 0.9 }} />
              </div>
              <span className="w-24 shrink-0 text-xs tabular-nums" style={{ color: brand.ink }}>
                {r.salinim < 1e-6 ? "etkisiz" : <>{dusuk}–{yuksek} <span style={{ color: brand.muted }}>(Δ{r.salinim})</span></>}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs" style={{ color: brand.muted }}>
        Her parametre tek başına ±%{s.deltaYuzde} oynatıldı (diğerleri sabit). Çubuk uzunluğu = <b>salınım (Δ)</b> = o parametrenin metrik üzerindeki etkisi; en uzun çubuk en güçlü kaldıraçtır. Değerler simülasyonun aynı çekirdeğinden gelir.
      </p>
    </div>
  );
}

function PanelBaslik({ ad, not }: { ad: string; not: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
      <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{ad}</h2>
      <span className="text-xs" style={{ color: brand.muted }}>{not}</span>
    </div>
  );
}
