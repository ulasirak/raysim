"use client";

// raysim — ÇAKIŞMA ÇÖZÜCÜSÜ paneli (Sistem Merkezi). cakisma.ts tek-hat çakışmasını
// TESPİT eder + metinsel öneri verir; bu panel onu HESAPLANMIŞ bir çizelgeye çevirir:
// kalkış offset'lerini optimize edip (meet/pass zamanlaması) somut RETİMİNG önerir
// ("Tren k'yı +Δs kaydır → çakışma 320s→0"). Salt analiz; çekirdek sim'e dokunmaz.

import { useMemo, type ReactNode } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { ringlerdenSebeke, flattenRoute, duruslariEkle, kalkisEkle, hemzeminDuruslari } from "@/lib/anaray/network";
import { reverseRoute, loopYorunge } from "@/lib/anaray/signalling";
import { etkinArac } from "@/lib/anaray/config";
import { cakismaTespit } from "@/lib/anaray/cakisma";
import { cakismaCoz, cakismasizMaxFilo } from "@/lib/anaray/cakismaCozum";
import { BosDurum } from "@/components/BosDurum";
import { Kpi } from "@/components/Kpi";
import { useDil } from "@/components/DilProvider";

const dkSn = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.round(Math.abs(s) % 60)).padStart(2, "0")}`;

export function CakismaCozumPaneli() {
  const { t } = useDil();
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const stockSim = useMemo(() => etkinArac(stock, cfg), [stock, cfg]);
  const filo = Math.max(1, Math.min(Math.max(1, maks.nTeorik), isletme.toplamFilo || 1));

  const loopY = useMemo(() => {
    const proje = ringlerdenSebeke(rings, cfg, "Cozum", []);
    if (!proje?.network || !proje.route) return null;
    const gecit = hemzeminDuruslari(rings, cfg);
    const su = isletme.kalkisOluZamaniSn;
    const line = kalkisEkle(duruslariEkle(flattenRoute(proje.network, proje.route), gecit, false), su);
    const rev = kalkisEkle(duruslariEkle(flattenRoute(proje.network, reverseRoute(proje.route)), gecit, true), su);
    const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
    const peronSon = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
    return loopYorunge(line, rev, stockSim, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon });
  }, [rings, cfg, stockSim, isletme.kalkisOluZamaniSn, isletme.terminalBas, isletme.terminalSon]);

  const cak = useMemo(
    () => (loopY ? cakismaTespit(rings, stock, cfg, loopY, filo, isletme) : null),
    [rings, stock, cfg, loopY, filo, isletme],
  );
  const coz = useMemo(
    () => (loopY && cak && cak.spanOzet.length ? cakismaCoz(cak.spanlar, loopY, filo) : null),
    [loopY, cak, filo],
  );
  const maxFilo = useMemo(
    () => (loopY && cak && cak.spanlar.length ? cakismasizMaxFilo(cak.spanlar, loopY, Math.max(1, maks.nTeorik)) : null),
    [loopY, cak, maks.nTeorik],
  );

  const kart = (icerik: ReactNode) => (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div className="field-label">{t({ tr: "Çakışma Çözücüsü (Tek-Hat Meet/Pass)", en: "Conflict Resolver (Single-Track Meet/Pass)", de: "Konfliktlöser (Eingleis · Begegnung)" })}</div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Kalkış-offset ile çakışmasız çizelge", en: "Conflict-free schedule via departure offset", de: "Konfliktfreier Fahrplan durch Abfahrtsversatz" })}</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          {t({ tr: "Tek-hat kesimlerde zıt yönlü trenler aynı anda giremez. Çözücü, kalkış offset’lerini eşit-aralıktan küçük sapmalarla arayıp bu çakışmayı gideren", en: "On single-track sections, trains in opposite directions cannot enter at once. The solver searches departure offsets with small deviations from even spacing and derives the", de: "Auf eingleisigen Abschnitten können gegenläufige Züge nicht gleichzeitig einfahren. Der Löser sucht Abfahrtsversätze mit kleinen Abweichungen vom gleichmäßigen Takt und leitet das" })} <b>{t({ tr: "somut retiming", en: "concrete retiming", de: "konkrete Retiming" })}</b>{t({ tr: "i (meet/pass zamanlaması) türetir.", en: " (meet/pass timing) that removes this conflict.", de: " (Begegnungs-Timing) ab, das diesen Konflikt beseitigt." })}
        </p>
      </div>
      <div className="p-5">{icerik}</div>
    </div>
  );

  if (!maks.gecerli || !loopY || !cak) {
    return kart(<BosDurum sik baslik={t({ tr: "Hesaplanamıyor", en: "Cannot be computed", de: "Nicht berechenbar" })} ipucu={t({ tr: "Ringler’de bir hat kurulunca çakışma çözümü burada türetilir.", en: "Once a line is built in Ringler, the conflict solution is derived here.", de: "Sobald in Ringler eine Strecke eingerichtet ist, wird hier die Konfliktlösung abgeleitet." })} />);
  }
  if (!cak.spanlar.length) {
    return kart(<BosDurum sik baslik={t({ tr: "Hat tümüyle çift hat", en: "The line is fully double-track", de: "Die Strecke ist durchgehend zweigleisig" })} ipucu={t({ tr: "Meet/pass çakışması yok. Tek-hat kesim, Ringler’de durak-arası ‘tek hat’ ile işaretlenir.", en: "No meet/pass conflict. A single-track section is marked in Ringler as ‘single track’ between stops.", de: "Kein Begegnungskonflikt. Ein eingleisiger Abschnitt wird in Ringler zwischen Haltestellen als ‚Eingleis‘ markiert." })} />);
  }
  if (!coz) {
    return kart(
      <div className="rounded-md p-3 text-sm" style={{ background: CK.goodBgSoft, border: `1px solid ${CK.good}`, color: brand.inkSoft }}>
        <b style={{ color: CK.good }}>✓ {t({ tr: "Bu filoda", en: "At this fleet", de: "Bei dieser Flotte" })} ({filo}) {t({ tr: "çakışma yok.", en: "there is no conflict.", de: "gibt es keinen Konflikt." })}</b> {cak.spanlar.length} {t({ tr: "tek-hat kesim var ama mevcut çizelge çakışmasız.", en: "single-track sections exist, but the current schedule is conflict-free.", de: "eingleisige Abschnitte vorhanden, aber der aktuelle Fahrplan ist konfliktfrei." })}
        {maxFilo != null && <> {t({ tr: "Çakışmasız maksimum filo:", en: "Conflict-free maximum fleet:", de: "Konfliktfreie Maximalflotte:" })} <b>{maxFilo}</b>.</>}
      </div>,
    );
  }

  return kart(
    <div className="flex flex-col gap-4">
      {/* Verdict */}
      <div className="rounded-md p-3 text-sm" style={{
        background: coz.cozuldu ? CK.goodBgSoft : CK.amberBg,
        border: `1px solid ${coz.cozuldu ? CK.good : CK.amber}`, color: brand.inkSoft }}>
        {coz.cozuldu ? (
          <><b style={{ color: CK.good }}>✓ {t({ tr: "Çözüldü.", en: "Solved.", de: "Gelöst." })}</b> {t({ tr: "Kalkışları aşağıdaki gibi kaydırınca tek-hat çakışması giderilir", en: "Shifting the departures as below removes the single-track conflict", de: "Werden die Abfahrten wie unten verschoben, wird der eingleisige Konflikt beseitigt" })}
            (<b>{coz.bazOrtusme}s → 0</b>, {coz.iyilesme}s {t({ tr: "çakışma önlendi).", en: "of conflict avoided).", de: "Konflikt vermieden)." })}</>
        ) : (
          <><b style={{ color: CK.amberInk }}>⚠ {t({ tr: "Bu filoda", en: "At this fleet", de: "Bei dieser Flotte" })} ({filo}) {t({ tr: "tümüyle giderilemiyor.", en: "it cannot be fully removed.", de: "lässt er sich nicht vollständig beseitigen." })}</b> {t({ tr: "Kaydırma çakışmayı", en: "The shift reduces the conflict", de: "Die Verschiebung senkt den Konflikt" })}
            <b> {coz.bazOrtusme}s → {coz.cozumOrtusme}s</b> {t({ tr: "düşürür ama sıfırlamaz.", en: "but does not zero it.", de: "bringt ihn aber nicht auf null." })}
            {maxFilo != null && <> {t({ tr: "Çakışmasız işletmek için filoyu", en: "To run conflict-free, reduce the fleet to", de: "Für konfliktfreien Betrieb die Flotte auf" })} <b>{maxFilo}</b>{t({ tr: "’e indir", en: "", de: " senken" })}</>} {t({ tr: "ya da kesimi çift hatta çıkar.", en: "or raise the section to double track.", de: "oder den Abschnitt zweigleisig ausbauen." })}</>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        {/* Retiming tablosu */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ color: brand.muted }} className="text-left text-[0.68rem] uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">{t({ tr: "Tren", en: "Train", de: "Zug" })}</th>
                <th className="px-3 py-2 text-right font-medium">{t({ tr: "Eşit-aralık kalkış", en: "Even-spacing departure", de: "Gleichtakt-Abfahrt" })}</th>
                <th className="px-3 py-2 text-right font-medium">{t({ tr: "Önerilen kalkış", en: "Suggested departure", de: "Empfohlene Abfahrt" })}</th>
                <th className="px-3 py-2 text-right font-medium">{t({ tr: "Kaydırma", en: "Shift", de: "Verschiebung" })}</th>
              </tr>
            </thead>
            <tbody>
              {coz.offsetler.map((o, k) => {
                const d = coz.kaydirmalar[k];
                const even = Math.round((k * coz.periyot) / coz.filo);
                return (
                  <tr key={k} className="border-t" style={{ borderColor: brand.border }}>
                    <td className="px-3 py-2 font-medium" style={{ color: brand.ink }}>{t({ tr: "Tren", en: "Train", de: "Zug" })} {k + 1}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: brand.muted }}>{dkSn(even)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: brand.ink }}>{dkSn(o)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums"
                      style={{ color: d === 0 ? brand.muted : d > 0 ? CK.ink : CK.gold }}>
                      {d === 0 ? "—" : `${d > 0 ? "+" : "−"}${dkSn(d)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* KPI'lar */}
        <div className="flex flex-col gap-2">
          <Kpi etiket={t({ tr: "Çakışmasız maks filo", en: "Conflict-free max fleet", de: "Konfliktfreie max. Flotte" })} deger={maxFilo != null ? `${maxFilo}` : "—"} ton={maxFilo != null && maxFilo >= filo ? "success" : "danger"} boyut="lg"
            alt={t({ tr: "tek-hat kısıtı altında (block'tan ayrı)", en: "under the single-track constraint (separate from block)", de: "unter der Eingleis-Beschränkung (getrennt vom Block)" })} />
          <Kpi etiket={t({ tr: "Mevcut filo", en: "Current fleet", de: "Aktuelle Flotte" })} deger={`${filo}`} boyut="sm" alt={`${cak.spanlar.length} ${t({ tr: "tek-hat kesim", en: "single-track sections", de: "eingleisige Abschnitte" })}`} />
          <p className="text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
            {t({ tr: "Kaydırma = eşit-aralık kalkışa göre öteleme. Tren 1 referans (0) sabit; diğerleri buna göre kaydırılır. Öneri salt çizelge; canlı sim değişmez.", en: "Shift = offset relative to the even-spacing departure. Train 1 is the reference (0) and fixed; the others are shifted against it. The suggestion is schedule-only; the live sim is unchanged.", de: "Verschiebung = Versatz gegenüber der Gleichtakt-Abfahrt. Zug 1 ist die Referenz (0) und fest; die übrigen werden dagegen verschoben. Der Vorschlag betrifft nur den Fahrplan; die Live-Simulation bleibt unverändert." })}
          </p>
        </div>
      </div>
    </div>,
  );
}
