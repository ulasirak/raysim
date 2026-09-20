"use client";

// raysim — KİLİTLEME (INTERLOCKING) KONTROL TABLOSU paneli (Sistem Merkezi).
// Büyük sıçrama G: sinyalizasyon derinliği. Hattın makaslarından sinyalizasyon
// mühendisliğinin klasik kontrol tablosunu türetir — her rota için makas konumu
// (Normal/Ters), kilitlenen çakışan hareketler, flank/overlap ve tanzim/serbest
// süreleri. AYGM sinyalizasyon kitlesinin doğrudan tanıdığı çıktı.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useProje } from "@/components/SimConfigProvider";
import { kilitlemeTablosu, kilitlemeOzet } from "@/lib/anaray/kilitleme";
import { BosDurum } from "@/components/BosDurum";

export function KilitlemePaneli() {
  const { rings } = useProje();

  const tablo = useMemo(() => kilitlemeTablosu(rings), [rings]);
  const ozet = useMemo(() => kilitlemeOzet(tablo), [tablo]);

  const kmFmt = (m: number) => `${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, "0")}`;

  return (
    <div className="ds-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Kilitleme (Interlocking) Kontrol Tablosu</div>
          <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Rota tesisi · makas konumu · kilit</h3>
          <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
            Hattın makas bölgelerinden türetilen güzergâh–kilit tablosu: her rota için gereken makas konumu (Normal/Ters),
            kilitlenen çakışan hareketler, flank/overlap koruması ve tanzim/serbest-bırakma süreleri. Veriler ring modelinden gelir.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{ color: brand.ink }}>{ozet.makas}</div>
          <div className="text-xs font-medium" style={{ color: brand.muted }}>makas bölgesi · {ozet.rota} rota</div>
          <div className="mt-0.5 text-[0.7rem]" style={{ color: brand.muted }}>{ozet.manevra} manevra · {ozet.tccli} TCC · maks kilit {ozet.maxKilit} s</div>
        </div>
      </div>

      {tablo.length === 0 ? (
        <div className="p-5">
          <BosDurum sik baslik="Bu hatta makas bölgesi yok" ipucu="Ringler’de makas ekleyince kontrol tablosu burada türetilir." />
        </div>
      ) : (
        <div className="overflow-x-auto px-2 py-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ color: brand.muted }} className="text-left text-[0.68rem] uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Makas / Konum</th>
                <th className="px-3 py-2 font-medium">Rota</th>
                <th className="px-3 py-2 font-medium">Makas konumu</th>
                <th className="px-3 py-2 font-medium">Kilitlenen (çakışan)</th>
                <th className="px-3 py-2 font-medium">Flank / Overlap</th>
                <th className="px-3 py-2 text-right font-medium">Tanzim</th>
                <th className="px-3 py-2 text-right font-medium">Serbest</th>
                <th className="px-3 py-2 text-right font-medium">Kilit</th>
              </tr>
            </thead>
            <tbody>
              {tablo.map((r, i) => (
                <tr key={i} className="border-t align-top" style={{ borderColor: brand.border }}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium" style={{ color: brand.ink }}>{r.makasAd}</div>
                    <div className="text-[0.68rem] tabular-nums" style={{ color: brand.muted }}>k{kmFmt(r.km)} · {r.tipAd}{r.tcc ? " · TCC" : ""}</div>
                  </td>
                  <td className="px-3 py-2.5" style={{ color: brand.inkSoft }}>{r.rota}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase"
                      style={r.makasKonum === "Ters"
                        ? { background: "rgba(168,132,44,0.15)", color: CK.gold }
                        : { background: CK.track, color: brand.muted }}>
                      {r.makasKonum}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[0.8rem]" style={{ color: r.cakisan === "—" ? brand.muted : brand.inkSoft }}>{r.cakisan}</td>
                  <td className="px-3 py-2.5 text-[0.75rem]" style={{ color: brand.muted }}>{r.flankOverlap}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.inkSoft }}>{r.tanzimSn ? `${r.tanzimSn} s` : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.inkSoft }}>{r.serbestSn} s</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums" style={{ color: brand.ink }}>{r.kilitSn} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t px-5 py-3 text-[0.72rem] leading-relaxed" style={{ borderColor: brand.border, color: brand.muted }}>
        <b style={{ color: brand.inkSoft }}>Normal</b> = makas düz (ana hat geçişi) · <b style={{ color: brand.inkSoft }}>Ters</b> = makas dönük (crossover/manevra).
        <b style={{ color: brand.inkSoft }}> TCC</b> = her geçişte trafik kontrol onayı zorunlu (karşılaşmalı/barınma/depo). Kilit = tanzim (makas hareketi × adet) + rota serbest bırakma;
        blocking-time (Sperrzeit) tanzim/serbest bileşenleriyle tutarlıdır.
      </div>
    </div>
  );
}
