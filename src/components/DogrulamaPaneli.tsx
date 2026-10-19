"use client";

// raysim — DOĞRULAMA & GEÇERLEME (V&V) — EKRAN ÖZETİ (Sistem Merkezi).
// Tam V&V tablosu (her kontrol: referans · hesaplanan · sapma · sonuç) PDF raporunun
// 09. bölümünde üretilir — denetlenebilir resmi çıktının doğal yeri orası. Ekranda yalnız
// CANLI ÖZET gösterilir (girdi değişince anlık) + rapora yönlendirme. Çekirdek
// (dogrulamaCalistir) rapor ile TEK KAYNAK. Dürüst çerçeve: analitik vs iç tutarlılık ayrımı.

import { useMemo } from "react";
import Link from "next/link";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { dogrulamaCalistir } from "@/lib/anaray/dogrulama";
import { kavsakliRingler } from "@/lib/anaray/network";
import { useDil } from "@/components/DilProvider";

export function DogrulamaPaneli() {
  const { t } = useDil();
  const { cfg } = useSimConfig();
  const { rings: ringsHam, subeler } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  const rapor = useMemo(() => {
    // UIC 406 kapasite kimliği aktif hatta koşar; şube varsa kavşak turnout'ları dâhil
    // (Sefer/KUR kapasitesiyle aynı taban). Şubesizse kavsakliRingler rings'i aynen döndürür.
    const rings = dwellUygulanmisRings(kavsakliRingler(ringsHam, subeler), stock, isletme);
    return dogrulamaCalistir(rings, stock, cfg, isletme);
  }, [ringsHam, subeler, stock, cfg, isletme]);

  const hepGecti = rapor.gecen === rapor.toplam;
  const bagimsizN = rapor.sonuclar.filter((s) => s.bagimsiz).length;
  const tutarlilikN = rapor.toplam - bagimsizN;

  const KUTU = [
    { deger: `${rapor.gecen}/${rapor.toplam}`, ad: t({ tr: "kontrol geçti", en: "checks passed", de: "Prüfungen bestanden" }), renk: hepGecti ? CK.good : brand.red },
    { deger: `%${rapor.maxSapma.toFixed(2)}`, ad: t({ tr: "maks sapma", en: "max deviation", de: "max. Abweichung" }), renk: rapor.maxSapma > 2 ? brand.red : brand.ink },
    { deger: `${bagimsizN} / ${tutarlilikN}`, ad: t({ tr: "analitik / tutarlılık", en: "analytic / consistency", de: "analytisch / Konsistenz" }), renk: brand.ink },
  ];

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <h3 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Özet — tam tablo PDF raporunda", en: "Summary — full table in the PDF report", de: "Zusammenfassung — vollständige Tabelle im PDF-Bericht" })}</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          {t({ tr: "Simülasyon çıktıları bağımsız kapalı-form (analitik) referanslara karşı sınanır — mühendislik yazılımı V&V yöntemi. Dış araç ya da veriye gerek yok; fizik kapalı-formda bilindiği için motorun sayısal entegrasyonu doğrudan doğrulanır. Her kontrolün tam dökümü, ekranı yormaması için PDF raporunda tutulur; burada canlı özet gösterilir.", en: "Simulation outputs are tested against independent closed-form (analytic) references — the V&V method of engineering software. No external tool or data is needed; because the physics is known in closed form, the engine's numerical integration is verified directly. The full per-check breakdown lives in the PDF report to keep the screen uncluttered; a live summary is shown here.", de: "Die Simulationsausgaben werden gegen unabhängige geschlossene (analytische) Referenzen geprüft — die V&V-Methode technischer Software. Kein externes Werkzeug oder Daten nötig; da die Physik in geschlossener Form bekannt ist, wird die numerische Integration des Motors direkt verifiziert. Die vollständige Aufschlüsselung je Prüfung steht im PDF-Bericht; hier wird eine Live-Zusammenfassung gezeigt." })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 p-5">
        {KUTU.map((k, i) => (
          <div key={i} className="rounded-lg border px-3 py-3 text-center" style={{ borderColor: brand.border, background: "#F9FAFB" }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: k.renk }}>{k.deger}</div>
            <div className="mt-0.5 text-[0.7rem] font-medium" style={{ color: brand.muted }}>{k.ad}</div>
          </div>
        ))}
      </div>

      <div className="mx-5 mb-4 rounded-md border-l-4 px-4 py-3 text-[0.78rem] leading-relaxed" style={{ borderColor: brand.ink, background: "#F4F6F8", color: brand.inkSoft }}>
        {t({ tr: "Tam V&V tablosu — her kontrolün referansı, hesaplanan değeri, sapması ve sonucuyla — ", en: "The full V&V table — every check with its reference, computed value, deviation and result — is produced in ", de: "Die vollständige V&V-Tabelle — jede Prüfung mit Referenz, berechnetem Wert, Abweichung und Ergebnis — wird erzeugt in " })}
        <Link href="/#belgeler" className="font-semibold underline" style={{ color: brand.red }}>{t({ tr: "Teknik Belgeler → PDF raporu (bölüm 09)", en: "Technical Documents → PDF report (section 09)", de: "Technische Dokumente → PDF-Bericht (Abschnitt 09)" })}</Link>
        {t({ tr: " içinde üretilir.", en: ".", de: "." })}
        <ul className="mt-2 list-disc space-y-1 pl-4" style={{ color: brand.muted }}>
          <li>
            <b style={{ color: brand.inkSoft }}>{t({ tr: "analitik", en: "analytic", de: "analytisch" })}</b> {t({ tr: `= motordan BAĞIMSIZ kapalı-form referans (gerçek doğrulama) — ${bagimsizN} kontrol. Sonuç = geçti ancak sapma ≤ tolerans.`, en: `= engine-INDEPENDENT closed-form reference (true verification) — ${bagimsizN} checks. Result = passed only if deviation ≤ tolerance.`, de: `= engine-UNABHÄNGIGE geschlossene Referenz (echte Verifizierung) — ${bagimsizN} Prüfungen. Ergebnis = bestanden nur wenn Abweichung ≤ Toleranz.` })}
          </li>
          <li>
            <b style={{ color: brand.inkSoft }}>{t({ tr: "tutarlılık", en: "consistency", de: "Konsistenz" })}</b> {t({ tr: `= motorun kendi tanımı / tasarım değişmezleriyle uyumu (güvenilirlik göstergesi) — ${tutarlilikN} kontrol.`, en: `= agreement with the engine's own definition / design invariants (reliability indicator) — ${tutarlilikN} checks.`, de: `= Übereinstimmung mit der eigenen Definition / den Entwurfsinvarianten (Zuverlässigkeitsindikator) — ${tutarlilikN} Prüfungen.` })}
          </li>
          <li>
            <b style={{ color: brand.inkSoft }}>{t({ tr: "Maks sapma", en: "Max deviation", de: "Max. Abweichung" })}</b> {t({ tr: "= tüm kontroller içindeki en yüksek yüzde sapma; her kontrolün kendi toleransıyla kıyaslanır. Kinematik/direnç kontrolleri hat-bağımsız, UIC 406 kapasite kimliği aktif hatta koşar.", en: "= the largest percentage deviation across all checks; each is compared against its own tolerance. Kinematics/resistance checks are line-independent; the UIC 406 capacity identity runs on the active line.", de: "= die größte prozentuale Abweichung über alle Prüfungen; jede wird gegen ihre eigene Toleranz verglichen. Kinematik-/Widerstandsprüfungen sind streckenunabhängig; die UIC-406-Kapazitätsidentität läuft auf der aktiven Strecke." })}
          </li>
        </ul>
      </div>
    </div>
  );
}
