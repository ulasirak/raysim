"use client";

// raysim — TALEP → GEREKEN FİLO → DOLULUK zinciri. Yolcu talebinin işletmeyi nasıl
// belirlediğini üç aşamada gösterir: tepe talep → (hedef dolulukta) gereken filo →
// (mevcut filoda) ulaşılan doluluk. tersIsletmeAnaliz'in nedensel zincirini görselleştirir.

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

interface Zincir {
  tepeYuk: number; tepeDurak: string; aracKapasite: number;
  filo: { gerekenArac: number; mevcutPik: number };
  duraklar: { doluluk: number }[];
}

export function TalepZinciri({ t, dolulukHedefi = 0.85 }: { t: Zincir; dolulukHedefi?: number }) {
  const pikDoluluk = Math.max(...t.duraklar.map((d) => d.doluluk), 0);
  const dolRenk = pikDoluluk > 0.85 ? CK.red : pikDoluluk > 0.5 ? CK.amber : "#2E7D57";
  const fark = t.filo.gerekenArac - t.filo.mevcutPik;

  const kutu = (baslik: string, buyuk: string, alt: string, renk: string) => (
    <div className="flex-1 rounded-lg border p-3 text-center" style={{ borderColor: brand.border, background: "#fff", minWidth: 120 }}>
      <div className="text-xs font-semibold" style={{ color: brand.muted }}>{baslik}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: renk }}>{buyuk}</div>
      <div className="mt-0.5 text-xs" style={{ color: brand.inkSoft }}>{alt}</div>
    </div>
  );
  const ok = (etiket: string) => (
    <div className="flex flex-col items-center justify-center px-1" style={{ color: brand.muted }}>
      <div className="text-lg leading-none">→</div>
      <div className="mt-0.5 text-center text-[10px] leading-tight" style={{ maxWidth: 90 }}>{etiket}</div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {kutu("Tepe talep", `${t.tepeYuk}`, `yolcu/saat · ${t.tepeDurak}`, brand.ink)}
        {ok(`%${Math.round(dolulukHedefi * 100)} doluluk hedefinde`)}
        {kutu("Gereken filo", `${t.filo.gerekenArac}`, `tramvay (mevcut ${t.filo.mevcutPik})`, fark > 0 ? CK.red : brand.ink)}
        {ok("mevcut filoda")}
        {kutu("Ulaşılan doluluk", `%${Math.round(pikDoluluk * 100)}`, "en yoğun kesim", dolRenk)}
      </div>
      <div className="mt-2 text-xs" style={{ color: brand.muted }}>
        Tepe talep, {t.aracKapasite} kişilik araçlarla %{Math.round(dolulukHedefi * 100)} doluluk hedefine göre <b>{t.filo.gerekenArac} tramvay</b> gerektirir{fark > 0 ? ` (mevcuttan ${fark} fazla)` : fark < 0 ? ` (mevcuttan ${-fark} az yeterli)` : " (mevcut yeterli)"}. Filo azsa doluluk hedefi aşılır (kırmızı), fazlaysa düşer.
      </div>
    </div>
  );
}
