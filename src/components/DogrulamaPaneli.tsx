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
import { useDil } from "@/components/DilProvider";

const say = (v: number, birim: string) => {
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return `${v.toFixed(d)}${birim ? " " + birim : ""}`;
};

export function DogrulamaPaneli() {
  const { t } = useDil();
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
    <div className="ds-card">
      {/* Başlık + özet */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">{t({ tr: "Doğrulama & Geçerleme (V&V)", en: "Verification & Validation (V&V)", de: "Verifizierung & Validierung (V&V)" })}</div>
          <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Motor doğruluk sertifikasyonu", en: "Engine accuracy certification", de: "Motor-Genauigkeitszertifizierung" })}</h3>
          <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
            {t({ tr: "Simülasyon çıktıları bağımsız kapalı-form (analitik) referanslara karşı sınanır — mühendislik yazılımı V&V yöntemi. Dış araç ya da veriye gerek yok; fizik kapalı-formda bilindiği için motorun sayısal entegrasyonu doğrudan doğrulanır.", en: "Simulation outputs are tested against independent closed-form (analytic) references — the V&V method of engineering software. No external tool or data is needed; because the physics is known in closed form, the engine's numerical integration is verified directly.", de: "Die Simulationsausgaben werden gegen unabhängige geschlossene (analytische) Referenzen geprüft — die V&V-Methode technischer Software. Kein externes Werkzeug oder Daten nötig; da die Physik in geschlossener Form bekannt ist, wird die numerische Integration des Motors direkt verifiziert." })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{ color: hepGecti ? CK.good : brand.red }}>
            {rapor.gecen}/{rapor.toplam}
          </div>
          <div className="text-xs font-medium" style={{ color: hepGecti ? CK.good : brand.red }}>
            {hepGecti ? t({ tr: "kontrol geçti", en: "checks passed", de: "Prüfungen bestanden" }) : t({ tr: "kontrol — sapma var", en: "checks — deviation found", de: "Prüfungen — Abweichung" })}
          </div>
          <div className="mt-0.5 text-[0.7rem]" style={{ color: brand.muted }}>{t({ tr: "maks sapma", en: "max deviation", de: "max. Abweichung" })} %{rapor.maxSapma.toFixed(2)}</div>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto px-2 py-1">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ color: brand.muted }} className="text-left text-[0.7rem] uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">{t({ tr: "Kontrol", en: "Check", de: "Prüfung" })}</th>
              <th className="px-3 py-2 text-right font-medium">{t({ tr: "Referans", en: "Reference", de: "Referenz" })}</th>
              <th className="px-3 py-2 text-right font-medium">{t({ tr: "Hesaplanan", en: "Computed", de: "Berechnet" })}</th>
              <th className="px-3 py-2 text-right font-medium">{t({ tr: "Sapma", en: "Deviation", de: "Abweichung" })}</th>
              <th className="px-3 py-2 text-right font-medium">{t({ tr: "Sonuç", en: "Result", de: "Ergebnis" })}</th>
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
                      {s.bagimsiz ? t({ tr: "analitik", en: "analytic", de: "analytisch" }) : t({ tr: "tutarlılık", en: "consistency", de: "Konsistenz" })}
                    </span>
                    <span className="text-[0.65rem]" style={{ color: brand.muted }}>· {s.kategori}</span>
                  </div>
                  <div className="mt-0.5 text-[0.7rem] leading-snug" style={{ color: brand.muted }}>{s.yontem}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.inkSoft }}>{say(s.referans, s.birim)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.ink }}>{say(s.hesaplanan, s.birim)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" style={{ color: brand.inkSoft }}>%{s.sapmaYuzde.toFixed(2)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold" style={{ color: s.gecti ? CK.good : brand.red }}>
                  {s.gecti ? t({ tr: "Geçti", en: "Passed", de: "Bestanden" }) : t({ tr: "Kaldı", en: "Failed", de: "Nicht bestanden" })}
                  <span className="ml-1 text-[0.65rem] font-normal" style={{ color: brand.muted }}>(≤%{s.tolerans})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dürüstlük notu */}
      <div className="border-t px-5 py-3 text-[0.72rem] leading-relaxed" style={{ borderColor: brand.border, color: brand.muted }}>
        <b style={{ color: brand.inkSoft }}>{t({ tr: "analitik", en: "analytic", de: "analytisch" })}</b> {t({ tr: "= motordan bağımsız kapalı-form referans (gerçek doğrulama;", en: "= engine-independent closed-form reference (true verification;", de: "= engine-unabhängige geschlossene Referenz (echte Verifizierung;" })} {bagimsizN} {t({ tr: "kontrol).", en: "checks).", de: "Prüfungen)." })}{" "}
        <b style={{ color: brand.inkSoft }}>{t({ tr: "tutarlılık", en: "consistency", de: "Konsistenz" })}</b> {t({ tr: "= motorun kendi tanımıyla/tasarım değişmezleriyle uyumu (güvenilirlik göstergesi).", en: "= agreement with the engine's own definition / design invariants (a reliability indicator).", de: "= Übereinstimmung mit der eigenen Definition / den Entwurfsinvarianten des Motors (Zuverlässigkeitsindikator)." })}
        {t({ tr: "Kinematik ve direnç kontrolleri hat-bağımsızdır; UIC 406 kapasite kimliği aktif hatta koşar.", en: "Kinematics and resistance checks are line-independent; the UIC 406 capacity identity runs on the active line.", de: "Kinematik- und Widerstandsprüfungen sind streckenunabhängig; die UIC-406-Kapazitätsidentität läuft auf der aktiven Strecke." })}
      </div>
    </div>
  );
}
