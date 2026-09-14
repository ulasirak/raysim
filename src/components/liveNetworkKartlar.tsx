// raysim — LiveNetwork SUNUM KARTLARI (LiveNetwork.tsx'ten ayrıldı).
// Saf presentational bileşenler (hook YOK, sadece prop→JSX). LiveNetwork bunları
// çizer. Çıktı birebir aynı; JSX verbatim taşındı, yalnız değerler prop'a çevrildi.

import { brand } from "@/lib/anaray/brand";
import { CK, ASPEKT } from "@/lib/anaray/chartkit";
import type { TersMod } from "@/lib/anaray/config";
import { DURUM_STIL, UP_COL, DOWN } from "./liveNetworkGeo";

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

/** Sim altındaki açıklama/lejant satırı (şerit renkleri, sinyal/geçit işaretleri +
 *  koşullu depo/ters-işletme/terminal notları). Saf sunum; koşullar prop'tan gelir. */
export function LiveNetworkLegend({ depoVar, tersMakasVar, tersMod, terminalVar }: { depoVar: boolean; tersMakasVar: boolean; tersMod: TersMod; terminalVar: boolean }) {
  return (
      <p className="text-xs" style={{ color: brand.muted }}>
        <span style={{ color: DOWN }}>▬</span> Üst şerit: Dönüş (sağ→sol) · <span style={{ color: UP_COL }}>▬</span> Alt şerit: Gidiş (sol→sağ) · <span style={{ color: CK.red }}>▬</span> işgal edilen blok.
        {" "}<span style={{ color: ASPEKT.yesil }}>●</span> blok sınırı işareti (blok = istasyon + koyulan sinyaller arası; sinyalsiz kesim tek blok). GERÇEK sinyaller elle metrajla konur: 3-aspect direk sinyali <b>▶</b> giden / <b>◀</b> gelen yön, <span style={{ color: CK.amber }}>amber ↺</span> = ters işletme (turnback) sinyali (kırmızı/sarı/yeşil = önündeki blok işgaline göre yanar). Hat özellikleri: <span style={{ color: CK.blue }}>◉</span> yaya geçidi · <span style={{ color: CK.amber }}>⊞</span> karayolu geçidi · <span style={{ color: brand.ink }}>◆</span> makas — <b>S-makas</b> / <b>X-makas</b> (✕). İşgal edilen blok kırmızı segmentle görünür.
        {depoVar && <> · 🅿 <b>Depo (parklanma):</b> bekleyen trenler sırayla headway aralığıyla servise çıkar; kutudaki dolu kareler çıkışa hazır, soluk kareler çıkmış trenlerdir.</>}
        {tersMakasVar && tersMod !== "kapali" && <> · <span style={{ color: CK.amber }}>↺</span> <b>Ters işletme (istasyon makası):</b> {tersMod === "ciftYonlu" ? "giden ya da gelen" : "giden"} bir tren <b>istasyon</b> makasına ulaşınca süre durur ve onay istenir; onaylarsanız karşı hatta geçer ({tersMod === "ciftYonlu" ? "giden→başa döner, gelen→ileri gider" : "başa, sıranın en arkasına döner"}). Yalnız istasyon makasları için geçerlidir.</>}
        {terminalVar && <> · <b>Terminal dönüş biçimi:</b> hattın uçlarında dönüş tipine göre çizilir — <b>kör terminal</b> (tampon barı = çıkmaz, perondan ters döner) · <b>çift peron</b> (iki kol + X makas, biri dönerken diğeri girer) · <b>balon loop</b> (durmadan döner, dönüş beklemesi ≈ 0) · <b>makaslı geçiş</b> (uçta X-makas). Ringler → Dönüş tipi değişince şekil değişir.</>}
      </p>
  );
}
