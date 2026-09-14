// raysim — LiveNetwork SUNUM KARTLARI (LiveNetwork.tsx'ten ayrıldı).
// Saf presentational bileşenler (hook YOK, sadece prop→JSX). LiveNetwork bunları
// çizer. Çıktı birebir aynı; JSX verbatim taşındı, yalnız değerler prop'a çevrildi.

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { DURUM_STIL } from "./liveNetworkGeo";

/** Arıza aktifken FAIL-SAFE bilgi kartı: döngü İÇİNDE kuyruk (motor değişmez, sahne
 *  sıfırlanmaz). Kuyruktaki tren sayısı render-güvenli `tutulanIdx` state'inden gelir. */
export function FailSafeKart({ faultCount, kuyruk }: { faultCount: number; kuyruk: number }) {
  return (
    <div className="mb-2 overflow-hidden rounded-md border-l-4 text-xs" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.inkSoft }}>
      <div className="px-3 py-2">
        <b style={{ color: brand.red }}>⚠ Blok arızası ({faultCount} blok)</b> — arızalı bloğa tekrar dokununca kalkar.
      </div>
      <div className="px-3 py-2" style={{ background: DURUM_STIL.dwell.renk + "18", borderTop: `1px solid ${brand.border}` }}>
        <b style={{ color: brand.ink }}>🛡️ Fail-safe:</b> {kuyruk > 0 ? (<><b>{kuyruk} tramvay</b> arızalı bloğun gerisinde <b>güvenle kuyrukta</b> — arkadan gelen önündekine <b>çarpmadı</b> (tren boyu aralığıyla durdu).</>) : (<>arızaya yaklaşan tramvay bloğun gerisinde <b>güvenle durur</b>, arkadan gelenler kuyruklanır.</>)} Bloğu <b>geçmiş</b> tramvaylar akmaya devam eder.
      </div>
      <div className="px-3 py-2" style={{ color: brand.muted, borderTop: `1px solid ${brand.border}` }}>
        Sahne sıfırlanmaz, tramvay ışınlanmaz; arıza kalkınca herkes <b>kaldığı yerden</b> sürer — gerçek sinyalizasyonun tek-nokta arızasına dayanıklılığı. (Arıza sürerken ters işletme etkileşimi duraklar.)
      </div>
    </div>
  );
}
