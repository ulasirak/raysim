"use client";

// raysim — HEMZEMİN GEÇİT GECİKMESİ.
// Tramvaylar sokakta çok geçitli çalışır (OpenTrack bunu ayrı vurgulamaz). Her geçit tur
// süresine iki şey ekler: (1) YAVAŞLAMA — tren geçit hızına düşer (fizik: W·(1/hiz−1/vmax)),
// (2) BEKLEME — yalnız KARAYOLU geçidinde, kullanıcının Ringler'de girdiği DURMA süresi
// (motorda tren gerçekten durur). TSP MODELLENMEZ: bekleme doğrudan girilen veridir; sinyal
// önceliği (TSP) gerçek-dünyada o beklemeyi azaltan kaldıraçtır (tahmin üretmeyiz).

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { SimConfig } from "@/lib/anaray/config";
import { sure } from "@/lib/anaray/format";
import { useDil } from "@/components/DilProvider";

export function HemzeminAnaliz({ rings, cfg, cevrimSn }: { rings: DurakArasiRing[]; cfg: SimConfig; cevrimSn: number }) {
  const { t } = useDil();
  const veri = useMemo(() => {
    const W = cfg.kisitGenisligi || 40;
    let acc = 0;
    const g: { konum: number; ad: string; tip: string; yavas: number; bekle: number }[] = [];
    for (const r of rings) {
      const vmax = Math.max(0.1, r.vmax); // m/s
      for (const h of r.hemzeminler) {
        const hiz = Math.max(0.1, h.hiz); // m/s
        const yavas = hiz < vmax ? W * (1 / hiz - 1 / vmax) : 0; // ~zonu düşük hızda geçmenin ek süresi
        const bekle = h.tip === "karayolu" ? (h.bekleme ?? 0) : 0;
        g.push({ konum: acc + Math.max(0, Math.min(r.uzunluk, h.konum)), ad: h.ad || (h.tip === "karayolu" ? t({ tr: "Karayolu geçidi", en: "Road crossing", de: "Bahnübergang" }) : t({ tr: "Yaya geçidi", en: "Pedestrian crossing", de: "Fußgängerübergang" })), tip: h.tip, yavas, bekle });
      }
      acc += r.uzunluk;
    }
    g.sort((a, b) => a.konum - b.konum);
    const L = Math.max(acc, 1);
    const toplamTek = g.reduce((s, x) => s + x.yavas + x.bekle, 0);
    const toplamTur = toplamTek * 2; // gidiş + dönüş
    const karayolu = g.filter((x) => x.tip === "karayolu").length;
    const toplamBekle = g.reduce((s, x) => s + x.bekle, 0); // girilen toplam durma (TSP duyarlı bileşen)
    let worstIdx = 0;
    for (let i = 1; i < g.length; i++) if (g[i].yavas + g[i].bekle > g[worstIdx].yavas + g[worstIdx].bekle) worstIdx = i;
    return { g, L, toplamTur, karayolu, yaya: g.length - karayolu, top: Math.max(...g.map((x) => x.yavas + x.bekle), 1), toplamBekle, worstIdx };
  }, [rings, cfg, t]);

  if (!veri || veri.g.length === 0) {
    return <div className="text-sm" style={{ color: brand.muted }}>{t({ tr: "Bu hatta tanımlı hemzemin geçit yok.", en: "No level crossings defined on this line.", de: "Auf dieser Linie sind keine Bahnübergänge definiert." })}</div>;
  }
  const { g, L, toplamTur, karayolu, yaya, top, toplamBekle, worstIdx } = veri;
  const worst = g[worstIdx];
  const W = 860, H = 190, padL = 40, padR = 14, padT = 22, padB = 34;
  const pw = W - padL - padR, ph = H - padT - padB;
  const X = (k: number) => padL + (k / L) * pw;
  const Y = (s: number) => padT + (1 - s / top) * ph;
  const bw = Math.max(3, Math.min(18, pw / g.length * 0.6));
  const yuzde = cevrimSn > 0 ? (toplamTur / cevrimSn) * 100 : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: brand.inkSoft }}>
        <span><b>{g.length}</b>{t({ tr: " geçit (", en: " crossings (", de: " Übergänge (" })}{karayolu}{t({ tr: " karayolu · ", en: " road · ", de: " Straße · " })}{yaya}{t({ tr: " yaya)", en: " pedestrian)", de: " Fußgänger)" })}</span>
        <span>{t({ tr: "Tur başına geçit gecikmesi: ", en: "Crossing delay per round trip: ", de: "Übergangsverzögerung pro Umlauf: " })}<b style={{ color: yuzde > 8 ? CK.red : brand.ink }}>{sure(Math.round(toplamTur))}</b>{t({ tr: " (çevrimin %", en: " (", de: " (" })}{yuzde.toFixed(1)}{t({ tr: "'i)", en: "% of the cycle)", de: " % des Umlaufs)" })}</span>
        {worst && worst.yavas + worst.bekle > 0 && <span>{t({ tr: "En yüksek: ", en: "Highest: ", de: "Höchste: " })}<b style={{ color: brand.ink }}>{worst.ad}</b> ({Math.round(worst.yavas + worst.bekle)} s)</span>}
        {toplamBekle === 0 && karayolu > 0 && <span style={{ color: CK.amberInk }}>{t({ tr: "⚠ karayolu beklemesi girilmedi — Ringler → geçit “Bekleme (durma)”", en: "⚠ no road wait entered — Rings → crossing “Wait (stop)”", de: "⚠ keine Straßen-Wartezeit — Ringe → Übergang „Wartezeit (Halt)“" })}</span>}
      </div>
      <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="min-w-[680px] sm:min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Hemzemin geçit gecikme">
            <line x1={padL} y1={padT + ph} x2={padL + pw} y2={padT + ph} stroke={brand.border} strokeWidth={1} />
            {[0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f)).map((v, i) => (
              <g key={i}>
                <line x1={padL} y1={Y(v)} x2={padL + pw} y2={Y(v)} stroke={CK.track} strokeWidth={0.6} strokeOpacity={0.7} />
                <text x={padL - 4} y={Y(v) + 2.5} textAnchor="end" fontSize={7.5} fill={brand.muted}>{v}</text>
              </g>
            ))}
            {g.map((x, i) => {
              const cx = X(x.konum), base = padT + ph;
              const yBek = Y(x.bekle), yTop = Y(x.bekle + x.yavas);
              const toplam = x.yavas + x.bekle;
              const bekRenk = x.bekle > 20 ? CK.red : x.bekle > 8 ? CK.amber : CK.blue;
              return (
                <g key={i}>
                  {/* konum kılavuz çizgisi (bar → eksen) */}
                  <line x1={cx} y1={toplam > 0 ? yTop : base - 2} x2={cx} y2={base} stroke={CK.track} strokeWidth={0.6} />
                  {x.yavas > 0 && <rect x={cx - bw / 2} y={yTop} width={bw} height={Math.max(0, yBek - yTop)} fill="#9AA7B2"><title>{x.ad}{t({ tr: ": yavaşlama ", en: ": slowdown ", de: ": Verlangsamung " })}{Math.round(x.yavas)} s</title></rect>}
                  {x.bekle > 0 && <rect x={cx - bw / 2} y={yBek} width={bw} height={Math.max(0, base - yBek)} fill={bekRenk}><title>{x.ad}{t({ tr: ": bekleme (TSP/trafik) ", en: ": wait (TSP/traffic) ", de: ": Wartezeit (ÖPNV-Bevorrechtigung/Verkehr) " })}{Math.round(x.bekle)} s</title></rect>}
                  {x.yavas === 0 && x.bekle === 0 && <rect x={cx - bw / 2} y={base - 2} width={bw} height={2} fill="#9AA7B2" />}
                  {/* gecikme değeri (üstte) + tam km (altta) — DİNAMİK */}
                  {toplam > 0 && <text x={cx} y={yTop - 2} textAnchor="middle" fontSize={7} fontWeight={i === worstIdx ? 800 : 600} fill={i === worstIdx ? CK.red : brand.inkSoft}>{Math.round(toplam)}s</text>}
                  {i === worstIdx && toplam > 0 && <text x={cx} y={yTop - 10} textAnchor="middle" fontSize={8} fill={CK.red}>▼</text>}
                  <text x={cx} y={base + 21} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={brand.ink}>{(x.konum / 1000).toFixed(2)}</text>
                </g>
              );
            })}
            {/* eksen uçları (km) — geçit km'leri öne çıksın diye yalnız 0 ve son */}
            <text x={X(0)} y={padT + ph + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>0</text>
            <text x={X(L)} y={padT + ph + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{(L / 1000).toFixed(1)}</text>
            <text x={padL + pw / 2} y={H - 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft}>{t({ tr: "Mesafe (km) →", en: "Distance (km) →", de: "Entfernung (km) →" })}</text>
            <text x={10} y={padT + ph / 2} textAnchor="middle" fontSize={8} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 10 ${padT + ph / 2})`}>{t({ tr: "gecikme (s) ↑", en: "delay (s) ↑", de: "Verzögerung (s) ↑" })}</text>
          </svg>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: brand.muted }}>
        <span><span style={{ color: "#9AA7B2" }}>■</span>{t({ tr: " yavaşlama (fizik) · ", en: " slowdown (physics) · ", de: " Verlangsamung (Physik) · " })}<span style={{ color: CK.blue }}>■</span>/<span style={{ color: CK.amber }}>■</span>/<span style={{ color: CK.red }}>■</span>{t({ tr: " bekleme (girilen durma, artan) · ", en: " wait (entered stop, increasing) · ", de: " Wartezeit (eingegebener Halt, zunehmend) · " })}<span style={{ color: CK.red }}>▼</span>{t({ tr: " en yüksek geçit", en: " highest crossing", de: " höchster Übergang" })}</span>
        <span>{t({ tr: "Bekleme = Ringler → her karayolu geçidine girdiğin “Bekleme (durma)” süresidir (motorda tren gerçekten durur). Modellenen bir TSP yoktur; sinyal önceliği (TSP) gerçek-dünyada bu beklemeyi azaltan kaldıraçtır → düşürürsen tur kısalır, kapasite artar. Yavaşlama = geçit hızına düşmenin fiziksel ek süresi.", en: "Wait = the “Wait (stop)” time you enter per road crossing in Rings (the train actually stops in the engine). No TSP is modelled; signal priority (TSP) is the real-world lever that reduces this wait → lowering it shortens the round trip and raises capacity. Slowdown = the physical extra time from dropping to the crossing speed.", de: "Wartezeit = die „Wartezeit (Halt)“, die Sie je Straßenübergang in Ringe eingeben (der Zug hält im Modell wirklich an). Es wird keine TSP modelliert; die ÖPNV-Bevorrechtigung (TSP) ist der reale Hebel, der diese Wartezeit senkt → verringert sie, verkürzt sich der Umlauf und steigt die Kapazität. Verlangsamung = die physische Zusatzzeit durch das Absenken auf die Übergangsgeschwindigkeit." })}</span>
      </div>
    </div>
  );
}
