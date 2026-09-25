"use client";

// raysim — TARİFE (zaman çizelgesi) paneli. Çevrim + ulaşılan sefer aralığından servis
// penceresi boyunca kalkış saatleri ve araç diyagramı üretir. Çekirdek: lib/tarife.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { tarifeUret, aracDiyagrami } from "@/lib/anaray/tarife";
import { useIsletme } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";

const hhmm = (sn: number) => `${String(Math.floor(sn / 3600)).padStart(2, "0")}:${String(Math.floor((sn % 3600) / 60)).padStart(2, "0")}`;

export function Tarife({ cevrimSn, headwaySn }: { cevrimSn: number; headwaySn: number }) {
  const { isletme, patchIsletme } = useIsletme();
  const { t: tt } = useDil();
  const [basSaat, setBasSaat] = useState(6);
  const [bitSaat, setBitSaat] = useState(24);
  // Tur başı zorunlu terminal molası (dk, 0–5) — KALICI (isletme.molaDk). Çevrime eklenir:
  // araç, seferini bitirince molaSn bekleyip sıraya döner → filo/ulaşılan sıklık buna göre.
  const molaDk = Math.max(0, Math.min(5, isletme.molaDk || 0));
  const setMolaDk = (v: number) => patchIsletme({ molaDk: Math.max(0, Math.min(5, Number.isFinite(v) ? v : 0)) });

  const t = useMemo(
    () => tarifeUret(cevrimSn, headwaySn, basSaat * 3600, bitSaat * 3600, molaDk * 60),
    [cevrimSn, headwaySn, basSaat, bitSaat, molaDk]
  );
  const diyagram = useMemo(() => aracDiyagrami(t), [t]);

  return (
    <section className="mt-6">
      <div className="ds-card p-5">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
          <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{tt({ tr: "Tarife (Zaman Çizelgesi)", en: "Timetable (Schedule)", de: "Fahrplan (Zeitplan)" })}</h2>
          <span className="text-xs" style={{ color: brand.muted }}>{tt({ tr: "çevrim + sefer aralığından kalkış saatleri ve araç diyagramı", en: "departure times and vehicle diagram from cycle + headway", de: "Abfahrtszeiten und Umlaufplan aus Umlauf + Zugfolgezeit" })}</span>
        </div>
        <p className="mb-4 text-xs" style={{ color: brand.muted }}>
          Servis penceresi boyunca ulaşılan sefer aralığında (≈{(headwaySn / 60).toFixed(1)} dk) kalkışlar üretilir; her araç bir tam turu (çevrim {Math.round(cevrimSn / 60)} dk){molaDk > 0 ? ` + ${molaDk} dk mola` : ""} tamamlayıp sıraya döner.
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label>
            <span className="field-label">{tt({ tr: "Servis başlangıcı", en: "Service start", de: "Betriebsbeginn" })}</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={0} max={23} value={basSaat} onChange={(e) => setBasSaat(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>:00</span>
            </div>
          </label>
          <label>
            <span className="field-label">{tt({ tr: "Servis bitişi", en: "Service end", de: "Betriebsende" })}</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={1} max={30} value={bitSaat} onChange={(e) => setBitSaat(Math.max(1, Math.min(30, parseInt(e.target.value) || 24)))}
                className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>{tt({ tr: ":00 (24+ = gece yarısı sonrası)", en: ":00 (24+ = after midnight)", de: ":00 (24+ = nach Mitternacht)" })}</span>
            </div>
          </label>
          <label>
            <span className="field-label">{tt({ tr: "Tur başı mola", en: "Layover per trip", de: "Pause pro Umlauf" })}</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={0} max={5} step={0.5} value={molaDk}
                onChange={(e) => setMolaDk(parseFloat(e.target.value))}
                className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>{tt({ tr: "dk (terminalde bekleme, en çok 5)", en: "min (dwell at terminal, max 5)", de: "min (Warten an Endstelle, max. 5)" })}</span>
            </div>
          </label>
        </div>

        {!t.gecerli ? (
          <p className="text-sm" style={{ color: brand.muted }}>{tt({ tr: "Tarife için geçerli çevrim, sefer aralığı ve pencere gerekir.", en: "A valid cycle, headway and time window are required for the timetable.", de: "Für den Fahrplan sind ein gültiger Umlauf, eine Zugfolgezeit und ein Zeitfenster erforderlich." })}</p>
        ) : (
          <>
            {/* Özet */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Ozet et={tt({ tr: "Gereken filo", en: "Required fleet", de: "Benötigte Flotte" })} d={`${t.filo}`} alt={molaDk > 0 ? tt({ tr: "⌈(çevrim + mola) ÷ aralık⌉", en: "⌈(cycle + layover) ÷ headway⌉", de: "⌈(Umlauf + Pause) ÷ Zugfolgezeit⌉" }) : tt({ tr: "⌈çevrim ÷ aralık⌉", en: "⌈cycle ÷ headway⌉", de: "⌈Umlauf ÷ Zugfolgezeit⌉" })} />
              <Ozet et={tt({ tr: "Sefer sayısı", en: "Number of trips", de: "Anzahl Fahrten" })} d={`${t.seferSayisi}`} alt={`${hhmm(t.ilkKalkis)}–${hhmm(t.sonKalkis)}`} />
              <Ozet et={tt({ tr: "Tur başı mola", en: "Layover per trip", de: "Pause pro Umlauf" })} d={`${molaDk} dk`} alt={tt({ tr: "terminalde zorunlu bekleme", en: "mandatory dwell at terminal", de: "obligatorisches Warten an Endstelle" })} />
              <Ozet et={tt({ tr: "Boşta bekleme (layover)", en: "Idle wait (layover)", de: "Standzeit (Layover)" })} d={`${Math.round(t.layoverSn)} s`} alt={tt({ tr: "molanın üstünde kalan pay", en: "margin beyond the layover", de: "Anteil über der Pause hinaus" })} />
            </div>

            {/* Araç diyagramı — her araç, ilk kalkışları */}
            <div className="mb-4 overflow-x-auto">
              <div className="field-label mb-1">{tt({ tr: "Araç Diyagramı (ilk kalkışlar)", en: "Vehicle diagram (first departures)", de: "Umlaufplan (erste Abfahrten)" })}</div>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {diyagram.map((a) => (
                    <tr key={a.aracNo}>
                      <td className="whitespace-nowrap py-1 pr-3 text-right font-semibold" style={{ color: brand.ink }}>{tt({ tr: "Araç", en: "Vehicle", de: "Fahrzeug" })} {a.aracNo}</td>
                      <td className="py-1" style={{ color: brand.inkSoft }}>
                        {a.kalkislar.slice(0, 8).map(hhmm).join(" · ")}{a.kalkislar.length > 8 ? ` · … (${a.kalkislar.length} sefer)` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kalkış listesi (kaydırılabilir) */}
            <div className="field-label mb-1">{tt({ tr: "Kalkış Listesi", en: "Departure list", de: "Abfahrtsliste" })}</div>
            <div className="max-h-52 overflow-y-auto rounded border" style={{ borderColor: brand.border }}>
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0" style={{ background: brand.ink }}>
                  <tr>
                    <th className="p-1.5 text-left text-white">{tt({ tr: "Sefer", en: "Trip", de: "Fahrt" })}</th>
                    <th className="p-1.5 text-left text-white">{tt({ tr: "Kalkış", en: "Departure", de: "Abfahrt" })}</th>
                    <th className="p-1.5 text-left text-white">{tt({ tr: "Dönüş varış", en: "Return arrival", de: "Rückankunft" })}</th>
                    <th className="p-1.5 text-left text-white">{tt({ tr: "Araç", en: "Vehicle", de: "Fahrzeug" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {t.seferler.map((s) => (
                    <tr key={s.no} style={{ background: s.no % 2 ? "#F7F9FA" : "#fff" }}>
                      <td className="p-1.5 tabular-nums" style={{ color: brand.muted }}>{s.no}</td>
                      <td className="p-1.5 tabular-nums" style={{ color: brand.ink }}>{hhmm(s.kalkisSn)}</td>
                      <td className="p-1.5 tabular-nums" style={{ color: brand.inkSoft }}>{hhmm(s.varisSn)}</td>
                      <td className="p-1.5 tabular-nums" style={{ color: brand.inkSoft }}>{s.aracNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Ozet({ et, d, alt }: { et: string; d: string; alt: string }) {
  return (
    <div className="ds-card p-2.5">
      <div className="text-[0.6rem] uppercase" style={{ color: brand.muted }}>{et}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: brand.ink }}>{d}</div>
      <div className="text-[0.6rem]" style={{ color: brand.muted }}>{alt}</div>
    </div>
  );
}
