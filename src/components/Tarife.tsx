"use client";

// raysim — TARİFE (zaman çizelgesi) paneli. Çevrim + ulaşılan sefer aralığından servis
// penceresi boyunca kalkış saatleri ve araç diyagramı üretir. Çekirdek: lib/tarife.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { tarifeUret, aracDiyagrami } from "@/lib/anaray/tarife";
import { useIsletme } from "@/components/SimConfigProvider";

const hhmm = (sn: number) => `${String(Math.floor(sn / 3600)).padStart(2, "0")}:${String(Math.floor((sn % 3600) / 60)).padStart(2, "0")}`;

export function Tarife({ cevrimSn, headwaySn }: { cevrimSn: number; headwaySn: number }) {
  const { isletme, patchIsletme } = useIsletme();
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
      <div className="rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
          <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>Tarife (Zaman Çizelgesi)</h2>
          <span className="text-xs" style={{ color: brand.muted }}>çevrim + sefer aralığından kalkış saatleri ve araç diyagramı</span>
        </div>
        <p className="mb-4 text-xs" style={{ color: brand.muted }}>
          Servis penceresi boyunca ulaşılan sefer aralığında (≈{(headwaySn / 60).toFixed(1)} dk) kalkışlar üretilir; her araç bir tam turu (çevrim {Math.round(cevrimSn / 60)} dk){molaDk > 0 ? ` + ${molaDk} dk mola` : ""} tamamlayıp sıraya döner.
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label>
            <span className="field-label">Servis başlangıcı</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={0} max={23} value={basSaat} onChange={(e) => setBasSaat(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>:00</span>
            </div>
          </label>
          <label>
            <span className="field-label">Servis bitişi</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={1} max={30} value={bitSaat} onChange={(e) => setBitSaat(Math.max(1, Math.min(30, parseInt(e.target.value) || 24)))}
                className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>:00 (24+ = gece yarısı sonrası)</span>
            </div>
          </label>
          <label>
            <span className="field-label">Tur başı mola</span>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" min={0} max={5} step={0.5} value={molaDk}
                onChange={(e) => setMolaDk(parseFloat(e.target.value))}
                className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>dk (terminalde bekleme, en çok 5)</span>
            </div>
          </label>
        </div>

        {!t.gecerli ? (
          <p className="text-sm" style={{ color: brand.muted }}>Tarife için geçerli çevrim, sefer aralığı ve pencere gerekir.</p>
        ) : (
          <>
            {/* Özet */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Ozet et="Gereken filo" d={`${t.filo}`} alt={molaDk > 0 ? "⌈(çevrim + mola) ÷ aralık⌉" : "⌈çevrim ÷ aralık⌉"} />
              <Ozet et="Sefer sayısı" d={`${t.seferSayisi}`} alt={`${hhmm(t.ilkKalkis)}–${hhmm(t.sonKalkis)}`} />
              <Ozet et="Tur başı mola" d={`${molaDk} dk`} alt="terminalde zorunlu bekleme" />
              <Ozet et="Boşta bekleme (layover)" d={`${Math.round(t.layoverSn)} s`} alt="molanın üstünde kalan pay" />
            </div>

            {/* Araç diyagramı — her araç, ilk kalkışları */}
            <div className="mb-4 overflow-x-auto">
              <div className="field-label mb-1">Araç Diyagramı (ilk kalkışlar)</div>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {diyagram.map((a) => (
                    <tr key={a.aracNo}>
                      <td className="whitespace-nowrap py-1 pr-3 text-right font-semibold" style={{ color: brand.ink }}>Araç {a.aracNo}</td>
                      <td className="py-1" style={{ color: brand.inkSoft }}>
                        {a.kalkislar.slice(0, 8).map(hhmm).join(" · ")}{a.kalkislar.length > 8 ? ` · … (${a.kalkislar.length} sefer)` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Kalkış listesi (kaydırılabilir) */}
            <div className="field-label mb-1">Kalkış Listesi</div>
            <div className="max-h-52 overflow-y-auto rounded border" style={{ borderColor: brand.border }}>
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0" style={{ background: brand.ink }}>
                  <tr>
                    <th className="p-1.5 text-left text-white">Sefer</th>
                    <th className="p-1.5 text-left text-white">Kalkış</th>
                    <th className="p-1.5 text-left text-white">Dönüş varış</th>
                    <th className="p-1.5 text-left text-white">Araç</th>
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
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="text-[0.6rem] uppercase" style={{ color: brand.muted }}>{et}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color: brand.ink }}>{d}</div>
      <div className="text-[0.6rem]" style={{ color: brand.muted }}>{alt}</div>
    </div>
  );
}
