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

  const KUTU = [
    { deger: ozet.makas, ad: t({ tr: "makas bölgesi", en: "switch zones", de: "Weichenbereiche" }), renk: brand.ink },
    { deger: ozet.manevra, ad: t({ tr: "manevra rotası", en: "shunt routes", de: "Rangierfahrstraßen" }), renk: brand.ink },
    { deger: ozet.tccli, ad: "TCC", renk: ozet.tccli > 0 ? CK.gold : brand.ink },
    { deger: `${ozet.maxKilit} s`, ad: t({ tr: "maks kilit", en: "max lock", de: "max. Verschluss" }), renk: brand.ink },
  ];

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div className="field-label">{t({ tr: "Kilitleme (Interlocking) Kontrol Tablosu", en: "Interlocking Control Table", de: "Verschluss-Kontrolltabelle (Interlocking)" })}</div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Özet — tam tablo PDF raporunda", en: "Summary — full table in the PDF report", de: "Zusammenfassung — vollständige Tabelle im PDF-Bericht" })}</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          {t({ tr: "Hattın makaslarından sinyalizasyon mühendisliğinin klasik kontrol tablosu türetilir: her rota için makas konumu (Normal/Ters), kilitlenen çakışan hareketler, yan koruma / emniyet payı ve tanzim/serbest süreleri. Bu tam tablo, ekranı yormaması için PDF raporunda tutulur; burada canlı özet gösterilir.", en: "The line's switches derive signalling engineering's classic control table: per route the switch position (Normal/Reverse), the conflicting moves locked out, flank/overlap protection and setting/release times. That full table lives in the PDF report to keep the screen uncluttered; a live summary is shown here.", de: "Aus den Weichen der Strecke wird die klassische Verschluss-Kontrolltabelle abgeleitet: je Fahrstraße die Weichenlage (Normal/Umgestellt), die verschlossenen gegenläufigen Fahrten, Flank-/Overlap-Schutz sowie Einstell-/Auflösezeiten. Diese vollständige Tabelle steht im PDF-Bericht; hier wird eine Live-Zusammenfassung gezeigt." })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
        {KUTU.map((k, i) => (
          <div key={i} className="rounded-lg border px-3 py-3 text-center" style={{ borderColor: brand.border, background: "#F9FAFB" }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: k.renk }}>{k.deger}</div>
            <div className="mt-0.5 text-[0.7rem] font-medium" style={{ color: brand.muted }}>{k.ad}</div>
          </div>
        ))}
      </div>

      <div className="mx-5 mb-4 rounded-md border-l-4 px-4 py-3 text-[0.78rem] leading-relaxed" style={{ borderColor: brand.ink, background: "#F4F6F8", color: brand.inkSoft }}>
        {t({ tr: "Tam kilitleme kontrol tablosu — her makasın her rotası, Normal/Ters konumu, kilitlenen hareketler, yan koruma ve süreleriyle — ", en: "The full interlocking control table — every route of every switch, with Normal/Reverse position, locked moves, flank protection and times — is produced in ", de: "Die vollständige Verschluss-Kontrolltabelle — jede Fahrstraße jeder Weiche mit Normal/Umgestellt-Lage, verschlossenen Fahrten, Flankenschutz und Zeiten — wird erzeugt in " })}
        <Link href="/#belgeler" className="font-semibold underline" style={{ color: brand.red }}>{t({ tr: "Teknik Belgeler → PDF raporu (bölüm 3.2)", en: "Technical Documents → PDF report (section 3.2)", de: "Technische Dokumente → PDF-Bericht (Abschnitt 3.2)" })}</Link>
        {t({ tr: " içinde üretilir.", en: ".", de: "." })}
        <div className="mt-1.5" style={{ color: brand.muted }}>
          <b style={{ color: brand.inkSoft }}>Normal</b> {t({ tr: "= makas düz (ana hat) ·", en: "= switch straight (main line) ·", de: "= Weiche gerade (Hauptgleis) ·" })} <b style={{ color: brand.inkSoft }}>Ters</b> {t({ tr: "= makas dönük (crossover/manevra) ·", en: "= switch reversed (crossover/shunt) ·", de: "= Weiche umgestellt (Kreuzung/Rangieren) ·" })} <b style={{ color: brand.inkSoft }}>TCC</b> {t({ tr: "= her geçişte trafik kontrol onayı zorunlu (karşılaşmalı/barınma/depo).", en: "= traffic-control approval required at every move (crossover/siding/depot).", de: "= betriebliche Freigabe bei jeder Fahrt erforderlich (Gleiswechsel/Abstellung/Depot)." })}
        </div>
      </div>
    </div>
  );
}
