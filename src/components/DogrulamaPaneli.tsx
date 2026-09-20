"use client";

// raysim — DOĞRULAMA & GEÇERLEME paneli (Sistem Merkezi).
// Motorun çıktılarını bağımsız analitik referanslara karşı sınayan V&V tablosunu gösterir.
// Amaç: "sayılar doğru mu?" sorusuna kanıtlı cevap — aracı oyuncaktan mühendislik aracına
// ayıran güvenilirlik katmanı. Dürüst çerçeve: bağımsız analitik vs iç tutarlılık ayrımı.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { dogrulamaCalistir } from "@/lib/anaray/dogrulama";

const say = (v: number, birim: string) => {
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return `${v.toFixed(d)}${birim ? " " + birim : ""}`;
};

export function DogrulamaPaneli() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  const rapor = useMemo(() => {
    const rings = dwellUygulanmisRings(ringsHam, stock, isletme);
    return dogrulamaCalistir(rings, stock, cfg, isletme);
  }, [ringsHam, stock, cfg, isletme]);

  const hepGecti = rapor.gecen === rapor.toplam;
  const bagimsizN = rapor.sonuclar.filter((s) => s.bagimsiz).length;

  return (
    <div className="rounded-lg border" style={{ borderColor: brand.border, background: "#fff" }}>
      {/* Başlık + özet */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Doğrulama & Geçerleme (V&amp;V)</div>
          <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Motor doğruluk sertifikasyonu</h3>
          <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
            Simülasyon çıktıları bağımsız kapalı-form (analitik) referanslara karşı sınanır — mühendislik yazılımı V&amp;V yöntemi.
            Dış araç ya da veriye gerek yok; fizik kapalı-formda bilindiği için motorun sayısal entegrasyonu doğrudan doğrulanır.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{ color: hepGecti ? CK.good : brand.red }}>
            {rapor.gecen}/{rapor.toplam}
          </div>
          <div className="text-xs font-medium" style={{ color: hepGecti ? CK.good : brand.red }}>
            {hepGecti ? "kontrol geçti" : "kontrol — sapma var"}
          </div>
          <div className="mt-0.5 text-[0.7rem]" style={{ color: brand.muted }}>maks sapma %{rapor.maxSapma.toFixed(2)}</div>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto px-2 py-1">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ color: brand.muted }} className="text-left text-[0.7rem] uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Kontrol</th>
              <th className="px-3 py-2 text-right font-medium">Referans</th>
              <th className="px-3 py-2 text-right font-medium">Hesaplanan</th>
              <th className="px-3 py-2 text-right font-medium">Sapma</th>
              <th className="px-3 py-2 text-right font-medium">Sonuç</th>
            </tr>
          </thead>
          <tbody>
            {rapor.sonuclar.map((s, i) => (
              <tr key={i} className="border-t align-top" style={{ borderColor: brand.border }}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium" style={{ color: brand.ink }}>{s.ad}</span>
                    <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase"
                      style={s.bagimsiz
                        ? { background: "rgba(46,125,87,0.12)", color: CK.good }
                        : { background: CK.track, color: brand.muted }}>
                      {s.bagimsiz ? "analitik" : "tutarlılık"}
                    </span>
                    <span className="text-[0.65rem]" style={{ color: brand.muted }}>· {s.kategori}</span>
                  </div>
                  <div className="mt-0.5 text-[0.7rem] leading-snug" style={{ color: brand.muted }}>{s.yontem}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.inkSoft }}>{say(s.referans, s.birim)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.ink }}>{say(s.hesaplanan, s.birim)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.inkSoft }}>%{s.sapmaYuzde.toFixed(2)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" style={{ color: s.gecti ? CK.good : brand.red }}>
                  {s.gecti ? "Geçti" : "Kaldı"}
                  <span className="ml-1 text-[0.65rem] font-normal" style={{ color: brand.muted }}>(≤%{s.tolerans})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dürüstlük notu */}
      <div className="border-t px-5 py-3 text-[0.72rem] leading-relaxed" style={{ borderColor: brand.border, color: brand.muted }}>
        <b style={{ color: brand.inkSoft }}>analitik</b> = motordan bağımsız kapalı-form referans (gerçek doğrulama; {bagimsizN} kontrol).{" "}
        <b style={{ color: brand.inkSoft }}>tutarlılık</b> = motorun kendi tanımıyla/tasarım değişmezleriyle uyumu (güvenilirlik göstergesi).
        Kinematik ve direnç kontrolleri hat-bağımsızdır; UIC 406 kapasite kimliği aktif hatta koşar.
      </div>
    </div>
  );
}
