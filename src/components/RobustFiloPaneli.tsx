"use client";

// raysim — ROBUSTLUK-KISITLI FİLO paneli (Sistem Merkezi). İKİ MOTORU BAĞLAR:
// kapasite (maksimumTren) + Monte-Carlo robustluk (signalling.monteCarlo). Her filo
// için headway → MC güvenilirliği (onTimePct) hesaplar; konfor + %X güvenilirlik
// kısıtları altında MİNİMUM filoyu bulur. MC pahalı → "Hesapla" ile on-demand,
// async tarama (arayüz donmaz). "Hesap makinesi"nden "planlama aracı"na taşıyan katman.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { ringlerdenSebeke, flattenRoute, duruslariEkle, kalkisEkle, hemzeminDuruslari, hatOzellikleri } from "@/lib/anaray/network";
import { monteCarlo } from "@/lib/anaray/signalling";
import { etkinArac } from "@/lib/anaray/config";
import { robustFiloPenceresi, type RobustSonuc } from "@/lib/anaray/robustFilo";
import { sure } from "@/lib/anaray/format";
import { BosDurum } from "@/components/BosDurum";
import { Kpi } from "@/components/Kpi";
import { useDil } from "@/components/DilProvider";

// Performans: MC pahalı. (1) Simüle tren sayısı sabit temsili pencereyle sınırlanır —
// gecikme yayılımı ~birkaç trende doygunlaşır, tüm filoyu simüle etmek gereksiz.
// (2) Her tam-sayı filo yerine ~ORNEK_SAYISI örneklem filo taranır; aradaki filolar
// monoton güvenilirlik varsayımıyla İNTERPOLE edilir. Böylece koşu sayısı nMax'tan bağımsız.
const MC_TREN_TAVAN = 10;  // MC'de simüle edilecek en fazla tren (temsili yayılım penceresi)
const MC_DENEME = 50;      // Monte-Carlo deneme sayısı (tarama için hızlı+yeterli)
const ORNEK_SAYISI = 9;    // taranacak örneklem filo sayısı (üst sınır)
const MC_DT = 1.0;         // sim adımı (s) — tarama için kaba (Studio 0,5); robustluk için yeterli

export function RobustFiloPaneli() {
  const { t } = useDil();
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  const [hedef, setHedef] = useState(90);          // hedef güvenilirlik (%)
  const [calisiyor, setCalisiyor] = useState(false);
  const [ilerleme, setIlerleme] = useState(0);     // taranan filo / toplam
  // Sonuç, hesaplandığı girdilerin İMZASIYLA saklanır → girdi değişince otomatik "eskir"
  // (effect'le state sıfırlamaya gerek yok; imza uyuşmazsa gösterilmez).
  const [hesap, setHesap] = useState<{ sig: string; data: RobustSonuc } | null>(null);

  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const stockSim = useMemo(() => etkinArac(stock, cfg), [stock, cfg]);

  // Sim hattı (Studio ile aynı kurulum): ring zinciri → şebeke → düz hat + geçit duruşları + kalkış.
  const line = useMemo(() => {
    const proje = ringlerdenSebeke(rings, cfg, "Robustluk", []);
    if (!proje?.network || !proje.route) return null;
    const gecit = hemzeminDuruslari(rings, cfg);
    return kalkisEkle(duruslariEkle(flattenRoute(proje.network, proje.route), gecit, false), isletme.kalkisOluZamaniSn);
  }, [rings, cfg, isletme.kalkisOluZamaniSn]);
  const sinyalSimKonum = useMemo(
    () => hatOzellikleri(rings, cfg).filter((f) => f.kind === "sinyal" && !f.tersIsletme).map((f) => f.pos),
    [rings, cfg],
  );

  // Girdi imzası — hesabı belirleyen her değer. Değişince saklı sonuç "eskir".
  const sig = useMemo(() => JSON.stringify([
    maks.cevrimSuresi, maks.hMin, maks.nTeorik, hedef,
    isletme.pikYolcuSaat, isletme.aracYolcuKapasite, isletme.dolulukHedefi,
    isletme.mcMeanEntrySn, isletme.mcMeanDwellSn, rings.length,
  ]), [maks.cevrimSuresi, maks.hMin, maks.nTeorik, hedef, isletme.pikYolcuSaat, isletme.aracYolcuKapasite, isletme.dolulukHedefi, isletme.mcMeanEntrySn, isletme.mcMeanDwellSn, rings.length]);
  const sonuc = hesap && hesap.sig === sig ? hesap.data : null;

  const hesapla = async () => {
    if (!line || !maks.gecerli) return;
    setCalisiyor(true); setIlerleme(0);
    const nMax = Math.max(1, maks.nTeorik);
    const cevrim = maks.cevrimSuresi, hMin = maks.hMin;

    // Örneklem filolar: 1..nMax arasından ~ORNEK_SAYISI filo (nMax daima dâhil).
    const adim = Math.max(1, Math.round(nMax / ORNEK_SAYISI));
    const ornekler: number[] = [];
    for (let f = 1; f <= nMax; f += adim) ornekler.push(f);
    if (ornekler[ornekler.length - 1] !== nMax) ornekler.push(nMax);

    const guvMap = new Map<number, number>();
    try {
      for (let i = 0; i < ornekler.length; i++) {
        const f = ornekler[i];
        const hw = Math.max(hMin, cevrim / f);
        const r = monteCarlo(line, stockSim, { headway: hw, count: Math.min(f, MC_TREN_TAVAN), dt: MC_DT, sinyaller: sinyalSimKonum },
          { trials: MC_DENEME, meanEntry: isletme.mcMeanEntrySn, meanDwell: isletme.mcMeanDwellSn, threshold: 120 });
        guvMap.set(f, r.onTimePct);
        setIlerleme((i + 1) / ornekler.length);
        await new Promise((res) => setTimeout(res, 0)); // arayüzü boşa çıkar (donma yok)
      }
      // Örneklenmemiş filolar için monoton (azalan) İNTERPOLASYON — komşu örneklerden.
      const key = [...guvMap.keys()].sort((a, b) => a - b);
      const guvenilirlikFn = (_hw: number, f: number): number => {
        if (guvMap.has(f)) return guvMap.get(f)!;
        if (f <= key[0]) return guvMap.get(key[0])!;
        if (f >= key[key.length - 1]) return guvMap.get(key[key.length - 1])!;
        let lo = key[0], hi = key[key.length - 1];
        for (const k of key) { if (k <= f) lo = k; if (k >= f) { hi = k; break; } }
        const t = hi === lo ? 0 : (f - lo) / (hi - lo);
        return guvMap.get(lo)! + t * (guvMap.get(hi)! - guvMap.get(lo)!);
      };
      const s = robustFiloPenceresi(
        { cevrimSn: cevrim, hMinSn: hMin, nMax, pikYolcuSaat: isletme.pikYolcuSaat, aracKapasite: isletme.aracYolcuKapasite, konforTavani: isletme.dolulukHedefi, hedefGuvenilirlik: hedef, ustFilo: nMax },
        guvenilirlikFn,
      );
      setHesap({ sig, data: s });
    } finally { setCalisiyor(false); }
  };

  if (!maks.gecerli || !line) {
    return (
      <div className="ds-card p-5">
        <div className="field-label">{t({ tr: "Robustluk-Kısıtlı Filo", en: "Robustness-Constrained Fleet", de: "Robustheitsbeschränkte Flotte" })}</div>
        <div className="mt-3"><BosDurum sik baslik={t({ tr: "Kapasite hesaplanamıyor", en: "Capacity cannot be computed", de: "Kapazität nicht berechenbar" })} ipucu={t({ tr: "Ringler’de bir hat kurulunca robustluk-kısıtlı filo çözümü burada hesaplanır.", en: "Once a line is built in Ringler, the robustness-constrained fleet solution is computed here.", de: "Sobald in Ringler eine Strecke eingerichtet ist, wird hier die robustheitsbeschränkte Flottenlösung berechnet." })} /></div>
      </div>
    );
  }

  const oneri = sonuc ? (sonuc.onerilenFilo != null ? sonuc.noktalar.find((n) => n.filo === sonuc.onerilenFilo) : null) : null;

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div className="flex items-center gap-2">
          <span className="ds-chip" style={{ background: CK.amberBg, color: CK.amberInk, border: `1px solid ${CK.amber}` }}>{t({ tr: "Risk", en: "Risk", de: "Risiko" })}</span>
          <div className="field-label">{t({ tr: "Robustluk-Kısıtlı Filo (Kapasite × Monte-Carlo)", en: "Robustness-Constrained Fleet (Capacity × Monte-Carlo)", de: "Robustheitsbeschränkte Flotte (Kapazität × Monte-Carlo)" })}</div>
        </div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>%{hedef} {t({ tr: "güvenilirlik altında minimum filo", en: "reliability — minimum fleet", de: "Zuverlässigkeit — Mindestflotte" })}</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          {t({ tr: "Her filo için Monte-Carlo, gecikmelerin ne kadar dakik (eşik ≤2 dk) taşındığını ölçer. Daha çok filo = daha kısa aralık = daha az tampon →", en: "For each fleet, Monte-Carlo measures how punctually delays are carried (threshold ≤2 min). More fleet = shorter interval = less buffer →", de: "Für jede Flotte misst Monte-Carlo, wie pünktlich Verspätungen aufgefangen werden (Schwelle ≤2 min). Mehr Flotte = kürzeres Intervall = weniger Puffer →" })} <b>{t({ tr: "güvenilirlik düşer", en: "reliability falls", de: "Zuverlässigkeit sinkt" })}</b>{t({ tr: "; konfor ise", en: "; comfort, on the other hand,", de: "; der Komfort hingegen" })} <b>{t({ tr: "daha çok filo", en: "more fleet", de: "mehr Flotte" })}</b> {t({ tr: "ister. Çözücü,", en: "demands. The solver finds the", de: "verlangt. Der Löser findet die" })} <b>{t({ tr: "kapasite + konfor +", en: "capacity + comfort +", de: "Kapazität + Komfort +" })} %{hedef} {t({ tr: "güvenilirlik", en: "reliability", de: "Zuverlässigkeit" })}</b> {t({ tr: "kısıtlarını birlikte sağlayan", en: "constraints jointly, i.e. the", de: "Beschränkungen gemeinsam erfüllt, also die" })} <b>{t({ tr: "en az filoyu", en: "minimum fleet", de: "kleinste Flotte" })}</b> {t({ tr: "bulur.", en: "needed.", de: "benötigt wird." })}
        </p>
      </div>

      {/* Hedef + Hesapla */}
      <div className="flex flex-wrap items-end gap-4 border-b px-5 py-3" style={{ borderColor: brand.border }}>
        <div>
          <span className="field-label block">{t({ tr: "Hedef güvenilirlik", en: "Target reliability", de: "Ziel-Zuverlässigkeit" })}</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="number" min={50} max={100} step={1} value={hedef}
              onChange={(e) => setHedef(Math.min(100, Math.max(50, Math.round(parseFloat(e.target.value) || 90))))}
              className="w-20 rounded border px-2 py-1 text-sm tabular-nums" style={{ borderColor: CK.good, color: brand.ink }} />
            <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "% dakik (≤2 dk)", en: "% on-time (≤2 min)", de: "% pünktlich (≤2 min)" })}</span>
          </div>
        </div>
        <button onClick={hesapla} disabled={calisiyor}
          className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: brand.ink }}>
          {calisiyor ? `${t({ tr: "Hesaplanıyor…", en: "Computing…", de: "Berechnung…" })} %${Math.round(ilerleme * 100)}` : sonuc ? t({ tr: "Yeniden hesapla", en: "Recompute", de: "Neu berechnen" }) : t({ tr: "Hesapla (Monte-Carlo taraması)", en: "Compute (Monte-Carlo sweep)", de: "Berechnen (Monte-Carlo-Durchlauf)" })}
        </button>
        {calisiyor && (
          <div className="h-1.5 w-32 overflow-hidden rounded-full" style={{ background: CK.track }}>
            <div style={{ width: `${Math.round(ilerleme * 100)}%`, height: "100%", background: CK.good, transition: "width .15s" }} />
          </div>
        )}
      </div>

      {!sonuc ? (
        <div className="p-5"><BosDurum sik baslik={t({ tr: "Henüz hesaplanmadı", en: "Not computed yet", de: "Noch nicht berechnet" })}
          ipucu={t({ tr: "Monte-Carlo, her filo için güvenilirliği ölçer (kısa bir hesap). “Hesapla” ile robustluk-kısıtlı filo penceresini çıkarır.", en: "Monte-Carlo measures reliability for each fleet (a short computation). Use “Compute” to derive the robustness-constrained fleet window.", de: "Monte-Carlo misst die Zuverlässigkeit für jede Flotte (eine kurze Berechnung). Mit „Berechnen“ wird das robustheitsbeschränkte Flottenfenster abgeleitet." })} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_260px]">
          {/* Güvenilirlik eğrisi + fizibıl pencere */}
          <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${brand.border}` }}>
            {(() => {
              const W = 660, H = 280, padL = 44, padR = 16, padT = 16, padB = 42;
              const cw = W - padL - padR, ch = H - padT - padB;
              const N = sonuc.noktalar.length;
              const X = (f: number) => padL + ((f - 1) / Math.max(1, N - 1)) * cw;
              const Y = (g: number) => padT + (1 - Math.min(100, Math.max(0, g)) / 100) * ch;
              const cizgi = sonuc.noktalar.map((n, i) => `${i === 0 ? "M" : "L"}${X(n.filo).toFixed(1)},${Y(n.guvenilirlik).toFixed(1)}`).join(" ");
              const konforMin = sonuc.konforMinFilo, robustMax = sonuc.robustMaxFilo;
              return (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t({ tr: "Robustluk-kısıtlı filo eğrisi", en: "Robustness-constrained fleet curve", de: "Robustheitsbeschränkte Flottenkurve" })}>
                  {/* fizibıl pencere gölgesi [konforMin .. robustMax] */}
                  {sonuc.fizibil && konforMin && robustMax && robustMax >= konforMin && (
                    <rect x={X(konforMin)} y={padT} width={Math.max(0, X(robustMax) - X(konforMin))} height={ch} fill={CK.good} opacity={0.08} />
                  )}
                  {/* eksenler */}
                  <line x1={padL} y1={padT + ch} x2={padL + cw} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
                  <line x1={padL} y1={padT} x2={padL} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
                  {/* hedef güvenilirlik yatay çizgi */}
                  <line x1={padL} y1={Y(sonuc.hedefGuvenilirlik)} x2={padL + cw} y2={Y(sonuc.hedefGuvenilirlik)} stroke={CK.amber} strokeWidth={1} strokeDasharray="3 3" />
                  <text x={padL + cw} y={Y(sonuc.hedefGuvenilirlik) - 3} textAnchor="end" fontSize={8} fill={CK.amberInk}>{t({ tr: "hedef", en: "target", de: "Ziel" })} %{sonuc.hedefGuvenilirlik}</text>
                  {/* kapasite duvarı */}
                  <line x1={X(sonuc.duvarFilo)} y1={padT} x2={X(sonuc.duvarFilo)} y2={padT + ch} stroke={CK.red} strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.6} />
                  {/* konfor alt sınırı */}
                  {sonuc.demandVar && konforMin && konforMin > 1 && (
                    <line x1={X(konforMin)} y1={padT} x2={X(konforMin)} y2={padT + ch} stroke={CK.amber} strokeWidth={1} strokeDasharray="2 3" />
                  )}
                  {/* güvenilirlik eğrisi */}
                  <path d={cizgi} fill="none" stroke={brand.ink} strokeWidth={2} />
                  {sonuc.noktalar.map((n) => (
                    <circle key={n.filo} cx={X(n.filo)} cy={Y(n.guvenilirlik)} r={n.uygun ? 3.2 : 2.2}
                      fill={n.uygun ? CK.good : n.robustUygun ? brand.ink : brand.faint} />
                  ))}
                  {/* öneri işareti */}
                  {oneri && <circle cx={X(oneri.filo)} cy={Y(oneri.guvenilirlik)} r={5.5} fill="none" stroke={CK.good} strokeWidth={2} />}
                  {/* eksen başlıkları */}
                  <text x={padL + cw / 2} y={H - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft}>{t({ tr: "Filo (araç) →", en: "Fleet (vehicles) →", de: "Flotte (Fahrzeuge) →" })}</text>
                  <text x={12} y={padT + ch / 2} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 12 ${padT + ch / 2})`}>{t({ tr: "Güvenilirlik (%) ↑", en: "Reliability (%) ↑", de: "Zuverlässigkeit (%) ↑" })}</text>
                  {[1, Math.ceil(sonuc.duvarFilo / 2), sonuc.duvarFilo].filter((v, i, a) => a.indexOf(v) === i && v <= N).map((f) => (
                    <text key={f} x={X(f)} y={padT + ch + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{f}</text>
                  ))}
                </svg>
              );
            })()}
          </div>

          {/* Çözüm */}
          <div className="flex flex-col gap-3">
            {sonuc.fizibil && oneri ? (
              <div className="rounded-md p-3" style={{ background: CK.goodBgSoft, border: `1px solid ${CK.good}` }}>
                <Kpi etiket={t({ tr: "Önerilen minimum filo", en: "Recommended minimum fleet", de: "Empfohlene Mindestflotte" })} deger={`${oneri.filo}`} ton="success" boyut="lg"
                  alt={`${t({ tr: "güvenilirlik", en: "reliability", de: "Zuverlässigkeit" })} %${Math.round(oneri.guvenilirlik)} · ${t({ tr: "aralık", en: "interval", de: "Intervall" })} ${sure(oneri.headwaySn)} · ${t({ tr: "bekleme", en: "wait", de: "Wartezeit" })} ${oneri.beklemeDk.toFixed(1)} dk${oneri.doluluk != null ? ` · ${t({ tr: "doluluk", en: "load", de: "Auslastung" })} %${Math.round(oneri.doluluk * 100)}` : ""}`} />
              </div>
            ) : (
              <div className="rounded-md p-3 text-[0.8rem]" style={{ background: CK.amberBg, border: `1px solid ${CK.amber}`, color: CK.amberInk }}>
                <b>{t({ tr: "⚠ Kısıtlar çakışıyor — fizibıl filo yok.", en: "⚠ Constraints conflict — no feasible fleet.", de: "⚠ Beschränkungen widersprechen sich — keine machbare Flotte." })}</b><br />
                {sonuc.demandVar && sonuc.konforMinFilo && sonuc.robustMaxFilo != null
                  ? `${t({ tr: "Konfor en az", en: "Comfort needs at least", de: "Komfort verlangt mindestens" })} ${sonuc.konforMinFilo} ${t({ tr: "araç ister ama", en: "vehicles, but", de: "Fahrzeuge, aber" })} %${sonuc.hedefGuvenilirlik} ${t({ tr: "güvenilirlik en fazla", en: "reliability allows at most", de: "Zuverlässigkeit erlaubt höchstens" })} ${sonuc.robustMaxFilo} ${t({ tr: "araca izin verir. Araç kapasitesini büyüt, hattı güçlendir (hMin düşür) ya da güvenilirlik hedefini düşür.", en: "vehicles. Increase vehicle capacity, strengthen the line (lower hMin) or lower the reliability target.", de: "Fahrzeuge. Fahrzeugkapazität erhöhen, die Strecke verstärken (hMin senken) oder das Zuverlässigkeitsziel senken." })}`
                  : `%${sonuc.hedefGuvenilirlik} ${t({ tr: "güvenilirlik hiçbir filoda sağlanamıyor. Gecikme girdilerini (giriş/duruş sapması) düşür ya da hedefi gevşet.", en: "reliability cannot be met by any fleet. Lower the delay inputs (entry/dwell variability) or relax the target.", de: "Zuverlässigkeit ist von keiner Flotte erreichbar. Die Verspätungseingaben (Einstiegs-/Haltestreuung) senken oder das Ziel lockern." })}`}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Kpi etiket={t({ tr: "Robustluk üst sınırı", en: "Robustness upper bound", de: "Robustheits-Obergrenze" })} deger={sonuc.robustMaxFilo != null ? `${sonuc.robustMaxFilo}` : "—"} boyut="sm" renk={CK.amber} alt={`%${sonuc.hedefGuvenilirlik} ${t({ tr: "güvenilir en fazla filo", en: "reliable — max fleet", de: "zuverlässig — max. Flotte" })}`} />
              <Kpi etiket={t({ tr: "Konfor alt sınırı", en: "Comfort lower bound", de: "Komfort-Untergrenze" })} deger={sonuc.konforMinFilo != null ? `${sonuc.konforMinFilo}` : "—"} boyut="sm" renk={CK.amber} alt={sonuc.demandVar ? t({ tr: "doluluk tavanı için en az filo", en: "min fleet for the load cap", de: "Mindestflotte für die Auslastungsgrenze" }) : t({ tr: "talep girilmedi", en: "no demand entered", de: "keine Nachfrage eingegeben" })} />
            </div>
            <Kpi etiket={t({ tr: "Kapasite duvarı", en: "Capacity wall", de: "Kapazitätsgrenze" })} deger={`${sonuc.duvarFilo}`} boyut="sm" alt={`${t({ tr: "min aralık", en: "min interval", de: "Mindestintervall" })} ${sure(sonuc.hMinSn)}`} />
            <p className="text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
              {t({ tr: "Yeşil bölge =", en: "Green zone =", de: "Grüner Bereich =" })} <b>{t({ tr: "fizibıl filo penceresi", en: "feasible fleet window", de: "machbares Flottenfenster" })}</b> {t({ tr: "(konfor alt sınırı ↔ robustluk üst sınırı). Yeşil halka = önerilen en az filo. Eğri Monte-Carlo güvenilirliği; hedefin altına inen filolar dakiklik kısıtını çiğner.", en: "(comfort lower bound ↔ robustness upper bound). Green ring = recommended minimum fleet. The curve is Monte-Carlo reliability; fleets below the target violate the punctuality constraint.", de: "(Komfort-Untergrenze ↔ Robustheits-Obergrenze). Grüner Ring = empfohlene Mindestflotte. Die Kurve zeigt die Monte-Carlo-Zuverlässigkeit; Flotten unterhalb des Ziels verletzen die Pünktlichkeitsbeschränkung." })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
