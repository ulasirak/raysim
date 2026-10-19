"use client";

// raysim — HEMZEMİN GEÇİT GECİKMESİ & SİNYAL ÖNCELİĞİ (TSP) MODELİ.
// Tramvaylar sokakta çok geçitli çalışır. Her geçit tur süresine iki şey ekler:
//   (1) YAVAŞLAMA — geçit hızına düşmenin fiziksel ek süresi (W·(1/hiz−1/vmax)).
//   (2) BEKLEME — yalnız KARAYOLU geçidinde, trenin gerçekten durduğu süre. Bu süre TEK
//       kaynaktan (ring.hemzeminBeklemeSn) gelir: "elle" modda girilen değer; sinyal modunda
//       (yok/pasif/aktif) karayolu sinyal devrinden WEBSTER üniform gecikmesiyle TÜRETİLİR
//       (d = kırmızı²/2·devir). TSP önceliği etkin kırmızıyı kısar → bekleme düşer.
// Model motora bağlıdır: türeyen bekleme hemzeminDuruslari ile sim/çevrim/kapasiteyi besler.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { hemzeminBeklemeSn, type DurakArasiRing, type TspSeviye } from "@/lib/anaray/ring";
import type { SimConfig } from "@/lib/anaray/config";
import { sure } from "@/lib/anaray/format";
import { useDil } from "@/components/DilProvider";

const TSP_RENK: Record<TspSeviye, string> = { aktif: CK.good, pasif: CK.amber, yok: CK.red, elle: CK.blue };

export function HemzeminAnaliz({ rings, cfg, cevrimSn }: { rings: DurakArasiRing[]; cfg: SimConfig; cevrimSn: number }) {
  const { t } = useDil();
  const veri = useMemo(() => {
    const W = cfg.kisitGenisligi || 40;
    const g: { ad: string; tip: string; tsp: TspSeviye | null; yavas: number; bekle: number }[] = [];
    for (const r of rings) {
      const vmax = Math.max(0.1, r.vmax); // m/s
      for (const h of r.hemzeminler) {
        const hiz = Math.max(0.1, h.hiz); // m/s
        const yavas = hiz < vmax ? W * (1 / hiz - 1 / vmax) : 0;
        const bekle = hemzeminBeklemeSn(h);
        g.push({
          ad: h.ad || (h.tip === "karayolu" ? t({ tr: "Karayolu geçidi", en: "Road crossing", de: "Bahnübergang" }) : t({ tr: "Yaya geçidi", en: "Pedestrian crossing", de: "Fußgängerübergang" })),
          tip: h.tip, tsp: h.tip === "karayolu" ? (h.tsp ?? "elle") : null, yavas, bekle,
        });
      }
    }
    const karayolu = g.filter((x) => x.tip === "karayolu").length;
    const toplamTur = g.reduce((s, x) => s + x.yavas + x.bekle, 0) * 2; // gidiş + dönüş
    const toplamBekle = g.reduce((s, x) => s + x.bekle, 0);
    const sirali = [...g].sort((a, b) => b.yavas + b.bekle - (a.yavas + a.bekle));
    const maxTot = Math.max(...g.map((x) => x.yavas + x.bekle), 1);
    return { g, sirali, karayolu, yaya: g.length - karayolu, toplamTur, toplamBekle, maxTot };
  }, [rings, cfg, t]);

  if (veri.g.length === 0) {
    return <div className="text-sm" style={{ color: brand.muted }}>{t({ tr: "Bu hatta tanımlı hemzemin geçit yok.", en: "No level crossings defined on this line.", de: "Auf dieser Linie sind keine Bahnübergänge definiert." })}</div>;
  }
  const { sirali, karayolu, yaya, toplamTur, toplamBekle, maxTot } = veri;
  const yuzde = cevrimSn > 0 ? (toplamTur / cevrimSn) * 100 : 0;
  const TSP_AD: Record<TspSeviye, string> = {
    elle: t({ tr: "elle", en: "manual", de: "manuell" }),
    yok: t({ tr: "öncelik yok", en: "no priority", de: "keine Priorität" }),
    pasif: t({ tr: "pasif TSP", en: "passive TSP", de: "passive TSP" }),
    aktif: t({ tr: "aktif TSP", en: "active TSP", de: "aktive TSP" }),
  };

  return (
    <div>
      {/* Özet */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: brand.inkSoft }}>
        <span><b>{veri.g.length}</b>{t({ tr: " geçit (", en: " crossings (", de: " Übergänge (" })}{karayolu}{t({ tr: " karayolu · ", en: " road · ", de: " Straße · " })}{yaya}{t({ tr: " yaya)", en: " pedestrian)", de: " Fußgänger)" })}</span>
        <span>{t({ tr: "Tur gecikmesi: ", en: "Round-trip delay: ", de: "Umlaufverzögerung: " })}<b style={{ color: yuzde > 8 ? CK.red : brand.ink }}>{sure(Math.round(toplamTur))}</b>{cevrimSn > 0 ? ` (${t({ tr: "çevrimin %", en: "", de: "" })}${yuzde.toFixed(1)}${t({ tr: "'i)", en: "% of cycle)", de: " % des Umlaufs)" })}` : ""}</span>
        {toplamBekle === 0 && karayolu > 0 && <span style={{ color: CK.amberInk }}>{t({ tr: "⚠ karayolu beklemesi yok — Ringler → geçit “Sinyal önceliği”", en: "⚠ no road wait — Rings → crossing “Signal priority”", de: "⚠ keine Straßen-Wartezeit — Ringe → Übergang „Signalpriorität“" })}</span>}
      </div>

      {/* Yatay sıralı çubuklar — en yüksek üstte */}
      <div className="flex flex-col gap-1.5">
        {sirali.map((x, i) => {
          const toplam = x.yavas + x.bekle;
          const waitRenk = x.tsp ? TSP_RENK[x.tsp] : CK.blue;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: x.tip === "karayolu" ? brand.ink : "#9AA7B2" }} title={x.tip} />
              <span className="w-24 shrink-0 truncate sm:w-32" style={{ color: brand.inkSoft }} title={x.ad}>{x.ad}</span>
              <div className="flex h-3.5 flex-1 overflow-hidden rounded" style={{ background: CK.track }}>
                <div style={{ width: `${(x.yavas / maxTot) * 100}%`, background: "#9AA7B2" }} title={`${t({ tr: "yavaşlama", en: "slowdown", de: "Verlangsamung" })} ${Math.round(x.yavas)} s`} />
                <div style={{ width: `${(x.bekle / maxTot) * 100}%`, background: waitRenk }} title={`${t({ tr: "bekleme", en: "wait", de: "Wartezeit" })} ${Math.round(x.bekle)} s`} />
              </div>
              <span className="w-10 shrink-0 text-right tabular-nums" style={{ color: i === 0 ? CK.red : brand.ink, fontWeight: i === 0 ? 800 : 600 }}>{Math.round(toplam)}s</span>
              {x.tsp && <span className="w-20 shrink-0 text-right text-[0.62rem] font-semibold" style={{ color: waitRenk }}>{TSP_AD[x.tsp]}</span>}
            </div>
          );
        })}
      </div>

      {/* Açıklama + lejant */}
      <div className="mt-3 flex flex-col gap-1 text-[0.72rem]" style={{ color: brand.muted }}>
        <span>
          <span style={{ color: "#9AA7B2" }}>■</span> {t({ tr: "yavaşlama (fizik)", en: "slowdown (physics)", de: "Verlangsamung (Physik)" })} · {t({ tr: "bekleme rengi = TSP modu:", en: "wait colour = TSP mode:", de: "Wartezeitfarbe = TSP-Modus:" })}
          {" "}<span style={{ color: CK.blue }}>■</span> {TSP_AD.elle} · <span style={{ color: CK.red }}>■</span> {TSP_AD.yok} · <span style={{ color: CK.amber }}>■</span> {TSP_AD.pasif} · <span style={{ color: CK.good }}>■</span> {TSP_AD.aktif}
        </span>
        <span>{t({
          tr: "Sinyal modunda (öncelik yok/pasif/aktif) bekleme, Ringler'de girdiğin karayolu sinyal devri (C) ve tram yeşili (g) üzerinden Webster üniform gecikmesiyle (kırmızı²/2C) TÜRETİLİR; aktif öncelik etkin kırmızıyı ~%95, pasif ~%50 kısar → bekleme düşer. “elle” modda süreyi doğrudan girersin. Türeyen bekleme motora bağlıdır (çevrim/kapasiteyi besler).",
          en: "In signal mode (no/passive/active priority) the wait is DERIVED from the road signal cycle (C) and tram green (g) you enter in Rings, via Webster uniform delay (red²/2C); active priority cuts the effective red by ~95%, passive by ~50% → the wait drops. In “manual” mode you enter the time directly. The derived wait is engine-connected (feeds cycle/capacity).",
          de: "Im Signalmodus (keine/passive/aktive Priorität) wird die Wartezeit aus dem in Ringe eingegebenen Straßen-Signalumlauf (C) und Tram-Grün (g) über die Webster-Gleichung (Rot²/2C) ABGELEITET; aktive Priorität senkt das effektive Rot um ~95 %, passive um ~50 % → die Wartezeit sinkt. Im Modus „manuell“ geben Sie die Zeit direkt ein. Die abgeleitete Wartezeit ist motorgebunden (speist Umlauf/Kapazität).",
        })}</span>
      </div>
    </div>
  );
}
