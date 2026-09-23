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

const dkSn = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.round(Math.abs(s) % 60)).padStart(2, "0")}`;

export function CakismaCozumPaneli() {
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
        <div className="field-label">Çakışma Çözücüsü (Tek-Hat Meet/Pass)</div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Kalkış-offset ile çakışmasız çizelge</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          Tek-hat kesimlerde zıt yönlü trenler aynı anda giremez. Çözücü, kalkış offset’lerini eşit-aralıktan
          küçük sapmalarla arayıp bu çakışmayı gideren <b>somut retiming</b>i (meet/pass zamanlaması) türetir.
        </p>
      </div>
      <div className="p-5">{icerik}</div>
    </div>
  );

  if (!maks.gecerli || !loopY || !cak) {
    return kart(<BosDurum sik baslik="Hesaplanamıyor" ipucu="Ringler’de bir hat kurulunca çakışma çözümü burada türetilir." />);
  }
  if (!cak.spanlar.length) {
    return kart(<BosDurum sik baslik="Hat tümüyle çift hat" ipucu="Meet/pass çakışması yok. Tek-hat kesim, Ringler’de durak-arası ‘tek hat’ ile işaretlenir." />);
  }
  if (!coz) {
    return kart(
      <div className="rounded-md p-3 text-sm" style={{ background: CK.goodBgSoft, border: `1px solid ${CK.good}`, color: brand.inkSoft }}>
        <b style={{ color: CK.good }}>✓ Bu filoda ({filo}) çakışma yok.</b> {cak.spanlar.length} tek-hat kesim var ama mevcut çizelge çakışmasız.
        {maxFilo != null && <> Çakışmasız maksimum filo: <b>{maxFilo}</b>.</>}
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
          <><b style={{ color: CK.good }}>✓ Çözüldü.</b> Kalkışları aşağıdaki gibi kaydırınca tek-hat çakışması giderilir
            (<b>{coz.bazOrtusme}s → 0</b>, {coz.iyilesme}s çakışma önlendi).</>
        ) : (
          <><b style={{ color: CK.amberInk }}>⚠ Bu filoda ({filo}) tümüyle giderilemiyor.</b> Kaydırma çakışmayı
            <b> {coz.bazOrtusme}s → {coz.cozumOrtusme}s</b> düşürür ama sıfırlamaz.
            {maxFilo != null && <> Çakışmasız işletmek için filoyu <b>{maxFilo}</b>’e indir</>} ya da kesimi çift hatta çıkar.</>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_220px]">
        {/* Retiming tablosu */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ color: brand.muted }} className="text-left text-[0.68rem] uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Tren</th>
                <th className="px-3 py-2 text-right font-medium">Eşit-aralık kalkış</th>
                <th className="px-3 py-2 text-right font-medium">Önerilen kalkış</th>
                <th className="px-3 py-2 text-right font-medium">Kaydırma</th>
              </tr>
            </thead>
            <tbody>
              {coz.offsetler.map((o, k) => {
                const d = coz.kaydirmalar[k];
                const even = Math.round((k * coz.periyot) / coz.filo);
                return (
                  <tr key={k} className="border-t" style={{ borderColor: brand.border }}>
                    <td className="px-3 py-2 font-medium" style={{ color: brand.ink }}>Tren {k + 1}</td>
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
          <Kpi etiket="Çakışmasız maks filo" deger={maxFilo != null ? `${maxFilo}` : "—"} ton={maxFilo != null && maxFilo >= filo ? "success" : "danger"} boyut="lg"
            alt="tek-hat kısıtı altında (block'tan ayrı)" />
          <Kpi etiket="Mevcut filo" deger={`${filo}`} boyut="sm" alt={`${cak.spanlar.length} tek-hat kesim`} />
          <p className="text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
            Kaydırma = eşit-aralık kalkışa göre öteleme. Tren 1 referans (0) sabit; diğerleri buna göre kaydırılır.
            Öneri salt çizelge; canlı sim değişmez.
          </p>
        </div>
      </div>
    </div>,
  );
}
