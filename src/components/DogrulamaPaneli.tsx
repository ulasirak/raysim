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
import { Not } from "@/components/Not";

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
          {t({ tr: "Simülasyon çıktıları, bağımsız kapalı-form (analitik) referanslara karşı sınanır; bu, mühendislik yazılımlarında kullanılan doğrulama ve geçerleme (V&V) yöntemidir. Dış araç ya da veri gerekmez: fizik kapalı formda bilindiği için motorun sayısal entegrasyonu doğrudan doğrulanır. Her kontrolün ayrıntılı dökümü PDF raporunda tutulur, ekranda canlı özet gösterilir.", en: "Simulation outputs are tested against independent closed-form (analytic) references. This is the verification and validation (V&V) method used in engineering software. No external tool or data is needed: because the physics is known in closed form, the engine's numerical integration is verified directly. The full per-check breakdown is kept in the PDF report, and a live summary is shown here.", de: "Die Simulationsausgaben werden gegen unabhängige geschlossene (analytische) Referenzen geprüft. Das ist die Verifizierungs- und Validierungsmethode (V&V) technischer Software. Kein externes Werkzeug oder Daten nötig: Da die Physik in geschlossener Form bekannt ist, wird die numerische Integration des Motors direkt verifiziert. Die vollständige Aufschlüsselung je Prüfung steht im PDF-Bericht, hier wird eine Live-Zusammenfassung gezeigt." })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 p-5">
        {KUTU.map((k, i) => (
          <div key={i} className="rounded-lg border px-3 py-3 text-center" style={{ borderColor: brand.border, background: brand.paper }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: k.renk }}>{k.deger}</div>
            <div className="mt-0.5 text-xs font-medium" style={{ color: brand.muted }}>{k.ad}</div>
          </div>
        ))}
      </div>

      <div className="mx-5 mb-4">
        <Not>
          {t({ tr: "Her kontrolün referansını, hesaplanan değerini, sapmasını ve sonucunu içeren tam V&V tablosu ", en: "The full V&V table, with each check's reference, computed value, deviation and result, is produced in ", de: "Die vollständige V&V-Tabelle mit Referenz, berechnetem Wert, Abweichung und Ergebnis jeder Prüfung wird in " })}
          <Link href="/#belgeler" className="font-semibold underline" style={{ color: brand.red }}>{t({ tr: "Teknik Belgeler’deki PDF raporunda (bölüm 08)", en: "the PDF report under Technical Documents (section 08)", de: "dem PDF-Bericht unter Technische Dokumente (Abschnitt 08)" })}</Link>
          {t({ tr: " üretilir.", en: ".", de: " erzeugt." })}
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <b style={{ color: brand.ink }}>{t({ tr: "Analitik", en: "Analytic", de: "Analytisch" })}</b> {t({ tr: `kontrol, motordan bağımsız kapalı-form bir referansa göre yapılır; asıl doğrulama budur. Bir kontrol ancak sapması toleransın altındaysa geçer. Bu hatta ${bagimsizN} analitik kontrol var.`, en: `check runs against an engine-independent, closed-form reference; this is the real verification. A check passes only if its deviation stays within tolerance. This line has ${bagimsizN} analytic checks.`, de: `Prüfung läuft gegen eine engine-unabhängige, geschlossene Referenz; das ist die eigentliche Verifizierung. Eine Prüfung besteht nur, wenn die Abweichung innerhalb der Toleranz bleibt. Diese Strecke hat ${bagimsizN} analytische Prüfungen.` })}
            </li>
            <li>
              <b style={{ color: brand.ink }}>{t({ tr: "Tutarlılık", en: "Consistency", de: "Konsistenz" })}</b> {t({ tr: `kontrolü, motorun kendi tanımı ve tasarım değişmezleriyle uyumunu ölçer. Bu hatta ${tutarlilikN} kontrol.`, en: `measures agreement with the engine's own definition and design invariants. This line has ${tutarlilikN} checks.`, de: `misst die Übereinstimmung mit der eigenen Definition und den Entwurfsinvarianten des Motors. Diese Strecke hat ${tutarlilikN} Prüfungen.` })}
            </li>
            <li>
              <b style={{ color: brand.ink }}>{t({ tr: "Maks sapma", en: "Max deviation", de: "Max. Abweichung" })}</b> {t({ tr: "tüm kontroller içindeki en yüksek yüzde sapmadır; her kontrol kendi toleransıyla kıyaslanır. Kinematik ve direnç kontrolleri hattan bağımsızdır, UIC 406 kapasite kontrolü aktif hat üzerinde çalışır.", en: "is the largest percentage deviation across all checks; each is compared against its own tolerance. Kinematics and resistance checks are line-independent, and the UIC 406 capacity check runs on the active line.", de: "ist die größte prozentuale Abweichung über alle Prüfungen; jede wird gegen ihre eigene Toleranz verglichen. Kinematik- und Widerstandsprüfungen sind streckenunabhängig, die UIC-406-Kapazitätsprüfung läuft auf der aktiven Strecke." })}
            </li>
          </ul>
        </Not>
      </div>
    </div>
  );
}
