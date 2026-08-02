"use client";

// raysim — Ring editörü PAYLAŞILAN sunum primitifleri (jenerik, domain'siz).
// RingEditor + RingSerit birlikte kullanır. Yalnız görünüm; iş kuralı yok.

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

const OK = CK.good;

export function Rozet({ ok, okText, hataText }: { ok: boolean; okText: string; hataText: string }) {
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium" style={ok ? { background: CK.goodBg, color: OK } : { background: CK.badBg, color: CK.red }}>
      {ok ? `✓ ${okText}` : `⚠ ${hataText}`}
    </span>
  );
}

export function Num({ label, value, onChange, step, suffix, hata, allowNeg }: { label: string; value: number; onChange: (v: number) => void; step: number; suffix: string; hata?: boolean; allowNeg?: boolean }) {
  return (
    <label className="block">
      <span className="field-label" style={{ fontSize: "0.6rem" }}>{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <input type="number" value={value} step={step} onChange={(e) => { const v = parseFloat(e.target.value) || 0; onChange(allowNeg ? v : Math.max(0, v)); }}
          className="w-full rounded border px-1.5 py-1 text-right text-sm" style={{ borderColor: hata ? brand.red : brand.border, color: hata ? brand.red : brand.ink }} />
        <span className="text-[0.65rem]" style={{ color: brand.muted }}>{suffix}</span>
      </div>
    </label>
  );
}

export function SubBaslik({ children }: { children: React.ReactNode }) {
  return <div className="field-label border-b pb-1" style={{ borderColor: brand.border }}>{children}</div>;
}

export function MiniStat({ etiket, deger, alt, vurgu }: { etiket: string; deger: string; alt?: string; vurgu?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: vurgu ?? brand.ink }}>{deger}</div>
      {alt && <div className="text-xs" style={{ color: brand.faint }}>{alt}</div>}
    </div>
  );
}

export function Panel({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
