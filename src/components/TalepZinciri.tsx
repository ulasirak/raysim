"use client";

// raysim — TALEP → GEREKEN FİLO → DOLULUK zinciri. Yolcu talebinin işletmeyi nasıl
// belirlediğini üç aşamada gösterir: tepe talep → (hedef dolulukta) gereken filo →
// (mevcut filoda) ulaşılan doluluk. tersIsletmeAnaliz'in nedensel zincirini görselleştirir.

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { Kart } from "@/components/Kart";
import { Kpi } from "@/components/Kpi";
import { useDil } from "@/components/DilProvider";

interface Zincir {
  tepeYuk: number; tepeDurak: string; aracKapasite: number;
  filo: { gerekenArac: number; mevcutPik: number };
  duraklar: { doluluk: number }[];
}

export function TalepZinciri({ t, dolulukHedefi = 0.85 }: { t: Zincir; dolulukHedefi?: number }) {
  const { t: tt } = useDil();
  const pikDoluluk = Math.max(...t.duraklar.map((d) => d.doluluk), 0);
  const dolRenk = pikDoluluk > 0.85 ? CK.red : pikDoluluk > 0.5 ? CK.amber : "#2E7D57";
  const fark = t.filo.gerekenArac - t.filo.mevcutPik;

  const kutu = (baslik: string, buyuk: string, alt: string, renk: string) => (
    <Kart ic="sm" className="flex-1" style={{ minWidth: 120 }}>
      <Kpi etiket={baslik} deger={buyuk} alt={alt} renk={renk} boyut="lg" hiza="orta" />
    </Kart>
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
        {kutu(tt({ tr: "Tepe talep", en: "Peak demand", de: "Spitzennachfrage" }), `${t.tepeYuk}`, `${tt({ tr: "yolcu/saat ·", en: "pax/hour ·", de: "Fahrgäste/h ·" })} ${t.tepeDurak}`, brand.ink)}
        {ok(`%${Math.round(dolulukHedefi * 100)} ${tt({ tr: "doluluk hedefinde", en: "occupancy target", de: "Auslastungsziel" })}`)}
        {kutu(tt({ tr: "Gereken filo", en: "Required fleet", de: "Benötigte Flotte" }), `${t.filo.gerekenArac}`, `${tt({ tr: "tramvay (mevcut", en: "trams (current", de: "Straßenbahnen (aktuell" })} ${t.filo.mevcutPik})`, fark > 0 ? CK.red : brand.ink)}
        {ok(tt({ tr: "mevcut filoda", en: "with current fleet", de: "mit aktueller Flotte" }))}
        {kutu(tt({ tr: "Ulaşılan doluluk", en: "Resulting occupancy", de: "Erreichte Auslastung" }), `%${Math.round(pikDoluluk * 100)}`, tt({ tr: "en yoğun kesim", en: "busiest section", de: "belebtester Abschnitt" }), dolRenk)}
      </div>
      <div className="mt-2 text-xs" style={{ color: brand.muted }}>
        {tt({ tr: "Tepe talep,", en: "Peak demand,", de: "Spitzennachfrage:" })} {t.aracKapasite} {tt({ tr: "kişilik araçlarla", en: "-seat vehicles,", de: "-Personen-Fahrzeuge," })} %{Math.round(dolulukHedefi * 100)} {tt({ tr: "doluluk hedefine göre", en: "per occupancy target,", de: "gemäß Auslastungsziel," })} <b>{t.filo.gerekenArac} {tt({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })}</b> {tt({ tr: "gerektirir", en: "are required", de: "sind erforderlich" })}{fark > 0 ? ` (${tt({ tr: "mevcuttan", en: "", de: "" })} ${fark} ${tt({ tr: "fazla", en: "more than current", de: "mehr als aktuell" })})` : fark < 0 ? ` (${tt({ tr: "mevcuttan", en: "", de: "" })} ${-fark} ${tt({ tr: "az yeterli", en: "fewer suffice", de: "weniger genügen" })})` : ` (${tt({ tr: "mevcut yeterli", en: "current is enough", de: "aktuell ausreichend" })})`}. {tt({ tr: "Filo azsa doluluk hedefi aşılır (kırmızı), fazlaysa düşer.", en: "If the fleet is too small the occupancy target is exceeded (red); if larger, it drops.", de: "Ist die Flotte zu klein, wird das Auslastungsziel überschritten (rot); ist sie größer, sinkt sie." })}
      </div>
    </div>
  );
}
