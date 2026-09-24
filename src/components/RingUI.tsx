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

export function Num({ label, value, onChange, step, suffix, hata, allowNeg, max }: { label: string; value: number; onChange: (v: number) => void; step: number; suffix: string; hata?: boolean; allowNeg?: boolean; max?: number }) {
  return (
    <label className="block">
      <span className="field-label" style={{ fontSize: "0.6rem" }}>{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <input type="number" value={value} step={step} max={max} onChange={(e) => { let v = parseFloat(e.target.value) || 0; if (!allowNeg) v = Math.max(0, v); if (max != null) v = Math.min(max, v); onChange(v); }}
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

export function Panel({ baslik, aciklama, children, katlanir = false, ozet, acik = false }: { baslik: string; aciklama?: string; children: React.ReactNode; katlanir?: boolean; ozet?: React.ReactNode; acik?: boolean }) {
  // Katlanır (çekmece) — native <details> (JS/state YOK → freeze yok). Varsayılan
  // kapalı (acik=true → açık); başlıkta tek satır özet; tıkla → detay.
  if (katlanir) {
    return (
      <details className="group ds-card" style={{ overflow: "hidden" }} open={acik}>
        <summary className="flex cursor-pointer select-none items-baseline gap-2 p-5">
          <span className="h-4 w-[3px] shrink-0" style={{ background: brand.red }} aria-hidden="true" />
          <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
          {ozet && <span className="ml-auto text-right text-xs" style={{ color: brand.muted }}>{ozet}</span>}
          <span className="ml-2 shrink-0 text-xs" style={{ color: brand.muted }}><span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></span>
        </summary>
        <div className="px-5 pb-5">
          {aciklama && <p className="mb-4 text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
          {children}
        </div>
      </details>
    );
  }
  return (
    <div className="ds-card p-5">
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
