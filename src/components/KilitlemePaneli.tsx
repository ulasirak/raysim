"use client";

// raysim — KİLİTLEME (INTERLOCKING) KONTROL TABLOSU — EKRAN ÖZETİ (Sistem Merkezi).
// Tam kontrol tablosu (her rota · makas konumu · kilitlenen hareketler · yan koruma ·
// süreler) PDF raporunun 3.2 bölümünde üretilir — sinyal mühendisliğinin doğal, resmi
// çıktısı orası. Ekranda yalnız CANLI ÖZET gösterilir (makaslar düzenlenirken anlık geri
// bildirim) + rapora yönlendirme. Çekirdek (kilitlemeTablosu/Ozet) rapor ile tek kaynak.

import { useMemo } from "react";
import Link from "next/link";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useProje, useSimConfig } from "@/components/SimConfigProvider";
import { kilitlemeTablosu, kilitlemeOzet } from "@/lib/anaray/kilitleme";
import { BosDurum } from "@/components/BosDurum";
import { useDil } from "@/components/DilProvider";
import { Not } from "@/components/Not";

export function KilitlemePaneli() {
  const { t } = useDil();
  const { rings } = useProje();
  const { cfg } = useSimConfig();

  const tablo = useMemo(() => kilitlemeTablosu(rings, cfg), [rings, cfg]);
  const ozet = useMemo(() => kilitlemeOzet(tablo), [tablo]);

  if (tablo.length === 0) {
    return (
      <div className="ds-card p-5">
        <BosDurum sik baslik={t({ tr: "Bu hatta makas bölgesi yok", en: "This line has no switch zones", de: "Diese Strecke hat keine Weichenbereiche" })} ipucu={t({ tr: "Ringler’de makas ekleyince kilitleme kontrol tablosu PDF raporunda türetilir.", en: "Add a switch in Ringler and the interlocking control table is derived in the PDF report.", de: "Wird in Ringler eine Weiche hinzugefügt, wird die Verschluss-Kontrolltabelle im PDF-Bericht abgeleitet." })} />
      </div>
    );
  }

  // makas bölgesi ile manevra sayısı eşit olmayabilir (crossover'sız blok makası manevra
  // üretmez) → ikisini slash ile tek kutuda göster: "makas / manevra".
  const KUTU = [
    { deger: `${ozet.makas} / ${ozet.manevra}`, ad: t({ tr: "makas bölgesi / manevra", en: "switch zones / maneuvers", de: "Weichenbereiche / Rangieren" }), renk: brand.ink },
    { deger: ozet.tccli, ad: "TCC", renk: ozet.tccli > 0 ? CK.gold : brand.ink },
    { deger: `${ozet.maxKilit} s`, ad: t({ tr: "maks kilit", en: "max lock", de: "max. Verschluss" }), renk: brand.ink },
  ];

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <h3 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Özet — tam tablo PDF raporunda", en: "Summary — full table in the PDF report", de: "Zusammenfassung — vollständige Tabelle im PDF-Bericht" })}</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          {t({ tr: "Hattın makaslarından sinyalizasyon mühendisliğinin klasik kontrol tablosu türetilir: her rota için makas konumu (Normal/Ters), kilitlenen çakışan hareketler, yan koruma ve tanzim/serbest süreleri. Bu tam tablo PDF raporunda tutulur, ekranda canlı özet gösterilir.", en: "The line's switches derive signalling engineering's classic control table: per route the switch position (Normal/Reverse), the conflicting moves locked out, flank protection and setting/release times. That full table is kept in the PDF report, and a live summary is shown here.", de: "Aus den Weichen der Strecke wird die klassische Verschluss-Kontrolltabelle abgeleitet: je Fahrstraße die Weichenlage (Normal/Umgestellt), die verschlossenen gegenläufigen Fahrten, Flankenschutz sowie Einstell-/Auflösezeiten. Diese vollständige Tabelle steht im PDF-Bericht, hier wird eine Live-Zusammenfassung gezeigt." })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 p-5">
        {KUTU.map((k, i) => (
          <div key={i} className="rounded-lg border px-3 py-3 text-center" style={{ borderColor: brand.border, background: brand.paper }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: k.renk }}>{k.deger}</div>
            <div className="mt-0.5 text-[0.7rem] font-medium" style={{ color: brand.muted }}>{k.ad}</div>
          </div>
        ))}
      </div>

      <div className="mx-5 mb-4">
        <Not>
          {t({ tr: "Her makasın her rotasını, Normal/Ters konumunu, kilitlenen hareketleri, yan korumayı ve süreleri içeren tam kilitleme kontrol tablosu ", en: "The full interlocking control table, with every route of every switch, the Normal/Reverse position, locked moves, flank protection and times, is produced in ", de: "Die vollständige Verschluss-Kontrolltabelle mit jeder Fahrstraße jeder Weiche, der Normal/Umgestellt-Lage, verschlossenen Fahrten, Flankenschutz und Zeiten wird in " })}
          <Link href="/#belgeler" className="font-semibold underline" style={{ color: brand.red }}>{t({ tr: "Teknik Belgeler’deki PDF raporunda (bölüm 3.2)", en: "the PDF report under Technical Documents (section 3.2)", de: "dem PDF-Bericht unter Technische Dokumente (Abschnitt 3.2)" })}</Link>
          {t({ tr: " üretilir.", en: ".", de: " erzeugt." })}
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <b style={{ color: brand.ink }}>{t({ tr: "Normal / Ters", en: "Normal / Reverse", de: "Normal / Umgestellt" })}</b> {t({ tr: "konumu gerçek sinyalizasyon pratiğidir: bir makas daima iki konumdan birinde kilitlenir. Normal, varsayılan konumdur (ana hat düz geçiş); Ters ise sapan yola ya da crossover'a çevrilidir. Rota, her makas gereken konuma getirilip kilitlenerek tesis edilir; kontrol tablosu bunu rota başına N/R olarak gösterir.", en: "is real signalling practice: a point is always locked in one of two positions. Normal is the default position (straight main-line move); Reverse is thrown to the diverging route or crossover. A route is set by driving each point to its required position and locking it; the control table records this as N/R per route.", de: "ist echte Signalpraxis: eine Weiche ist stets in einer von zwei Lagen verschlossen. Normal ist die Grundstellung (gerade Hauptgleisfahrt); Umgestellt ist in den abzweigenden Strang oder Gleiswechsel gestellt. Eine Fahrstraße wird gebildet, indem jede Weiche in ihre Soll-Lage gebracht und verschlossen wird; die Kontrolltabelle führt dies je Fahrstraße als N/R." })}
            </li>
            <li>
              <b style={{ color: brand.ink }}>TCC</b> {t({ tr: `onayı, makas tipi karşılaşmalı, barınma ya da depo olduğunda (veya makasta elle işaretlendiğinde) her geçiş için gerekir. Bu hatta ${ozet.tccli} rotada gereklidir.`, en: `approval is required at every pass when the switch type is crossover, siding or depot (or when flagged on the switch). It is required on ${ozet.tccli} routes on this line.`, de: `-Freigabe ist bei jeder Fahrt erforderlich, wenn der Weichentyp Gleiswechsel, Abstellung oder Depot ist (oder an der Weiche markiert). Auf dieser Strecke ist sie bei ${ozet.tccli} Fahrstraßen erforderlich.` })}
            </li>
            <li>
              <b style={{ color: brand.ink }}>{t({ tr: "Maks kilit", en: "Max lock", de: "Max. Verschluss" })}</b> {t({ tr: `tüm rotalar içindeki en yüksek kilit süresidir (bu hatta ${ozet.maxKilit} s). Bir rotanın kilidi, tanzim (makas hareketi × makas sayısı) ile rota serbest bırakma süresinin toplamıdır.`, en: `is the longest locking time across all routes (${ozet.maxKilit} s here). Each route's lock is the setting time (switch throw × count) plus route release.`, de: `ist die längste Verschlusszeit über alle Fahrstraßen (${ozet.maxKilit} s hier). Der Verschluss je Fahrstraße ist die Einstellzeit (Weichenumstellung × Anzahl) plus Fahrstraßenauflösung.` })}
            </li>
          </ul>
        </Not>
      </div>
    </div>
  );
}
