// raysim — LiveNetwork SUNUM KARTLARI (LiveNetwork.tsx'ten ayrıldı).
// Saf presentational bileşenler (yalnız useDil hook'u — i18n; iş mantığı prop'tan).
// LiveNetwork bunları çizer. Çıktı birebir aynı; metinler t({tr,en,de}) ile localize.
// Durum etiketleri motorun ürettiği enum `durum`'dan türetilir (t(DURUM_STIL[d].ad)) —
// motorun Türkçe `ad`'ı GÖSTERİLMEZ; golden motora dokunulmaz.

import { brand } from "@/lib/anaray/brand";
import { CK, ASPEKT } from "@/lib/anaray/chartkit";
import type { TersMod } from "@/lib/anaray/config";
import { saat } from "@/lib/anaray/format";
import type { LoopDurum, LoopYorunge } from "@/lib/anaray/signalling";
import { DURUM_STIL, UP_COL, DOWN } from "./liveNetworkGeo";
import { useDil } from "@/components/DilProvider";
import { Ikon } from "@/components/Ikon";

/** Arıza aktifken FAIL-SAFE bilgi kartı: döngü İÇİNDE kuyruk (motor değişmez, sahne
 *  sıfırlanmaz). Kuyruktaki tren sayısı render-güvenli `tutulanIdx` state'inden gelir. */
export function FailSafeKart({ faultCount, kuyruk }: { faultCount: number; kuyruk: number }) {
  const { t } = useDil();
  return (
    <div className="mb-2 overflow-hidden rounded-md border-l-4 text-xs" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.inkSoft }}>
      <div className="px-3 py-2">
        <b style={{ color: brand.red }}>⚠ {t({ tr: "Blok arızası", en: "Block fault", de: "Blockstörung" })} ({faultCount} {t({ tr: "blok", en: "blocks", de: "Blöcke" })})</b> — {t({ tr: "arızalı bloğa tekrar dokununca kalkar.", en: "tap the faulty block again to clear it.", de: "erneut auf den gestörten Block tippen, um sie aufzuheben." })}
      </div>
      <div className="px-3 py-2" style={{ background: DURUM_STIL.dwell.renk + "18", borderTop: `1px solid ${brand.border}` }}>
        <b style={{ color: brand.ink }}>🛡️ Fail-safe:</b> {kuyruk > 0 ? (<><b>{kuyruk} {t({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })}</b> {t({ tr: "arızalı bloğun gerisinde", en: "behind the faulty block", de: "hinter dem gestörten Block" })} <b>{t({ tr: "güvenle kuyrukta", en: "safely queued", de: "sicher in der Warteschlange" })}</b> — {t({ tr: "arkadan gelen önündekine", en: "a following train did", de: "ein nachfolgender Zug fuhr" })} <b>{t({ tr: "çarpmadı", en: "not hit the one ahead", de: "nicht auf den vorderen auf" })}</b> ({t({ tr: "tren boyu aralığıyla durdu", en: "it stopped at a train-length gap", de: "er hielt im Abstand einer Zuglänge" })}).</>) : (<>{t({ tr: "arızaya yaklaşan tramvay bloğun gerisinde", en: "a tram approaching the fault", de: "eine sich der Störung nähernde Straßenbahn" })} <b>{t({ tr: "güvenle durur", en: "stops safely behind the block", de: "hält sicher hinter dem Block" })}</b>, {t({ tr: "arkadan gelenler kuyruklanır.", en: "and those behind queue up.", de: "nachfolgende reihen sich ein." })}</>)} {t({ tr: "Bloğu", en: "Trams that have", de: "Straßenbahnen, die den Block" })} <b>{t({ tr: "geçmiş", en: "passed", de: "passiert haben," })}</b> {t({ tr: "tramvaylar akmaya devam eder.", en: "the block keep flowing.", de: "fahren weiter." })}
      </div>
      <div className="px-3 py-2" style={{ color: brand.muted, borderTop: `1px solid ${brand.border}` }}>
        {t({ tr: "Sahne sıfırlanmaz, tramvay ışınlanmaz; arıza kalkınca herkes", en: "The scene is not reset, no tram teleports; when the fault clears everyone resumes", de: "Die Szene wird nicht zurückgesetzt, keine Straßenbahn springt; wenn die Störung behoben ist, fahren alle" })} <b>{t({ tr: "kaldığı yerden", en: "from where they stopped", de: "an ihrer Stelle" })}</b> {t({ tr: "sürer — gerçek sinyalizasyonun tek-nokta arızasına dayanıklılığı. (Arıza sürerken ters işletme etkileşimi duraklar.)", en: "— the single-point-failure resilience of real signalling. (While the fault persists, reverse-operation interaction pauses.)", de: "weiter — die Ausfallsicherheit echter Signaltechnik bei Einzelfehlern. (Während die Störung besteht, pausiert die Kehrbetrieb-Interaktion.)" })}
      </div>
    </div>
  );
}

/** Sim altındaki açıklama/lejant satırı (şerit renkleri, sinyal/geçit işaretleri +
 *  koşullu depo/ters-işletme/terminal notları). Saf sunum; koşullar prop'tan gelir. */
export function LiveNetworkLegend({ depoVar, tersMakasVar, tersMod, terminalVar }: { depoVar: boolean; tersMakasVar: boolean; tersMod: TersMod; terminalVar: boolean }) {
  const { t } = useDil();
  return (
      <p className="text-xs" style={{ color: brand.muted }}>
        <span style={{ color: DOWN }}>▬</span> {t({ tr: "Üst şerit: Dönüş (sağ→sol)", en: "Upper track: Return (right→left)", de: "Oberes Gleis: Rückfahrt (rechts→links)" })} · <span style={{ color: UP_COL }}>▬</span> {t({ tr: "Alt şerit: Gidiş (sol→sağ)", en: "Lower track: Outbound (left→right)", de: "Unteres Gleis: Hinfahrt (links→rechts)" })} · <span style={{ color: CK.red }}>▬</span> {t({ tr: "işgal edilen blok.", en: "occupied block.", de: "besetzter Block." })}
        {" "}<span style={{ color: ASPEKT.yesil }}>●</span> {t({ tr: "blok sınırı işareti (blok = istasyon + koyulan sinyaller arası; sinyalsiz kesim tek blok). GERÇEK sinyaller elle metrajla konur: 3-aspect direk sinyali", en: "block-boundary marker (a block = between a station and the signals you place; a section without signals is one block). REAL signals are placed by hand with chainage: a 3-aspect mast signal", de: "Blockgrenzen-Markierung (ein Block = zwischen einer Station und den von Ihnen platzierten Signalen; ein Abschnitt ohne Signale ist ein Block). ECHTE Signale werden manuell mit Kilometrierung gesetzt: ein 3-begriffiges Mastsignal" })} <b>▶</b> {t({ tr: "giden", en: "outbound", de: "hin" })} / <b>◀</b> {t({ tr: "gelen yön,", en: "return direction,", de: "zurück," })} <span style={{ color: CK.amber }}>{t({ tr: "amber ↺", en: "amber ↺", de: "bernstein ↺" })}</span> = {t({ tr: "ters işletme (turnback) sinyali (kırmızı/sarı/yeşil = önündeki blok işgaline göre yanar). Hat özellikleri:", en: "reverse-operation (turnback) signal (red/yellow/green per the occupancy of the block ahead). Line features:", de: "Kehrbetriebs-(Turnback-)Signal (rot/gelb/grün je nach Belegung des vorausliegenden Blocks). Streckenmerkmale:" })} <span style={{ color: CK.blue }}>◉</span> {t({ tr: "yaya geçidi", en: "pedestrian crossing", de: "Fußgängerübergang" })} · <span style={{ color: CK.amber }}>⊞</span> {t({ tr: "karayolu geçidi", en: "road crossing", de: "Straßenübergang" })} · <span style={{ color: brand.ink }}>◆</span> {t({ tr: "makas —", en: "switch —", de: "Weiche —" })} <b>{t({ tr: "S-makas", en: "S-switch", de: "S-Weiche" })}</b> / <b>{t({ tr: "X-makas", en: "X-switch", de: "X-Weiche" })}</b> (✕). {t({ tr: "İşgal edilen blok kırmızı segmentle görünür.", en: "An occupied block is shown as a red segment.", de: "Ein besetzter Block wird als rotes Segment dargestellt." })}
        {depoVar && <> · 🅿 <b>{t({ tr: "Depo (parklanma):", en: "Depot (stabling):", de: "Depot (Abstellung):" })}</b> {t({ tr: "bekleyen trenler sırayla headway aralığıyla servise çıkar; kutudaki dolu kareler çıkışa hazır, soluk kareler çıkmış trenlerdir.", en: "waiting trains enter service in sequence at the headway interval; filled squares in the box are ready to depart, faded squares are trains that have left.", de: "wartende Züge gehen nacheinander im Zugfolgeabstand in Betrieb; gefüllte Quadrate im Kasten sind abfahrbereit, blasse Quadrate sind bereits ausgefahrene Züge." })}</>}
        {tersMakasVar && tersMod !== "kapali" && <> · <span style={{ color: CK.amber }}>↺</span> <b>{t({ tr: "Ters işletme (istasyon makası):", en: "Reverse operation (station switch):", de: "Kehrbetrieb (Stationsweiche):" })}</b> {tersMod === "ciftYonlu" ? t({ tr: "giden ya da gelen", en: "an outbound or return", de: "ein hin- oder rückfahrender" }) : t({ tr: "giden", en: "an outbound", de: "ein hinfahrender" })} {t({ tr: "bir tren", en: "train reaches a", de: "Zug erreicht eine" })} <b>{t({ tr: "istasyon", en: "station", de: "Stations" })}</b> {t({ tr: "makasına ulaşınca süre durur ve onay istenir; onaylarsanız karşı hatta geçer", en: "switch, time pauses and confirmation is requested; if you confirm it crosses to the opposite track", de: "weiche, die Zeit pausiert und eine Bestätigung wird verlangt; bei Bestätigung wechselt er auf das Gegengleis" })} ({tersMod === "ciftYonlu" ? t({ tr: "giden→başa döner, gelen→ileri gider", en: "outbound→returns to start, return→goes forward", de: "Hinfahrt→kehrt zum Anfang, Rückfahrt→fährt vorwärts" }) : t({ tr: "başa, sıranın en arkasına döner", en: "returns to the start, to the back of the queue", de: "kehrt zum Anfang, ans Ende der Warteschlange" })}). {t({ tr: "Yalnız istasyon makasları için geçerlidir.", en: "Applies only to station switches.", de: "Gilt nur für Stationsweichen." })}</>}
        {terminalVar && <> · <b>{t({ tr: "Terminal dönüş biçimi:", en: "Terminal turnback form:", de: "Terminal-Wendeform:" })}</b> {t({ tr: "hattın uçlarında dönüş tipine göre çizilir —", en: "drawn at the line ends per the turnback type —", de: "an den Streckenenden je nach Wendetyp gezeichnet —" })} <b>{t({ tr: "kör terminal", en: "stub terminal", de: "Stumpfterminal" })}</b> ({t({ tr: "tampon barı = çıkmaz, perondan ters döner", en: "buffer stop = dead end, reverses from the platform", de: "Prellbock = Sackgasse, wendet am Bahnsteig" })}) · <b>{t({ tr: "çift peron", en: "double platform", de: "Doppelbahnsteig" })}</b> ({t({ tr: "iki kol + X makas, biri dönerken diğeri girer", en: "two arms + X switch, one turns while the other enters", de: "zwei Arme + X-Weiche, einer wendet, der andere fährt ein" })}) · <b>{t({ tr: "balon loop", en: "balloon loop", de: "Gleisschleife" })}</b> ({t({ tr: "durmadan döner, dönüş beklemesi ≈ 0", en: "turns without stopping, turnback wait ≈ 0", de: "wendet ohne Halt, Wendezeit ≈ 0" })}) · <b>{t({ tr: "makaslı geçiş", en: "scissors crossover", de: "Gleiswechsel mit Weiche" })}</b> ({t({ tr: "uçta X-makas", en: "X switch at the end", de: "X-Weiche am Ende" })}). {t({ tr: "Ringler → Dönüş tipi değişince şekil değişir.", en: "Rings → the shape changes when the turnback type changes.", de: "Ringe → die Form ändert sich mit dem Wendetyp." })}</>}
      </p>
  );
}

/** Ters işletme MOD seçici (Kapalı / Sadece giden hat / Çift taraflı). Saf sunum;
 *  seçim mantığı (guard + setKarar) parent'ta kalır, buraya `onSec` ile iner. */
export function TersModSecici({ tersMod, disabled, tersMakasSayisi, onSec }: { tersMod: TersMod; disabled: boolean; tersMakasSayisi: number; onSec: (m: TersMod) => void }) {
  const { t } = useDil();
  const secenekler: { m: TersMod; ad: string; ip: string }[] = [
    { m: "kapali", ad: t({ tr: "Kapalı", en: "Off", de: "Aus" }), ip: t({ tr: "İstasyon makasında kısa dönüş sorulmaz — trenler kesintisiz döner.", en: "No short-turn is asked at station switches — trains loop continuously.", de: "An Stationsweichen wird keine Kurzwende abgefragt — Züge fahren durchgehend im Umlauf." }) },
    { m: "gidenHat", ad: t({ tr: "Sadece giden hat", en: "Outbound only", de: "Nur Hinfahrt" }), ip: t({ tr: "Yalnız GİDEN trenler istasyon makasından kısa dönüş yapabilir (karşı/dönüş şeride geçip başa döner).", en: "Only OUTBOUND trains can short-turn at a station switch (cross to the opposite/return track and go back to start).", de: "Nur HINFAHRENDE Züge können an einer Stationsweiche kehren (aufs Gegen-/Rückgleis wechseln und zum Anfang zurück)." }) },
    { m: "ciftYonlu", ad: t({ tr: "Çift taraflı", en: "Both directions", de: "Beidseitig" }), ip: t({ tr: "Giden + GELEN trenler istasyon makasından geçebilir; dönüş treni de gidiş hattına girip ileri gidebilir.", en: "Outbound + RETURN trains can cross at a station switch; a return train can also enter the outbound track and go forward.", de: "Hin- + RÜCKfahrende Züge können an einer Stationsweiche wechseln; ein Rückfahrzug kann auch aufs Hingleis und vorwärts fahren." }) },
  ];
  return (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: brand.border, background: CK.track }}>
          <span className="flex items-center gap-1 font-semibold" style={{ color: brand.ink }}><span style={{ color: CK.amber }}>↺</span> {t({ tr: "Ters işletme:", en: "Reverse operation:", de: "Kehrbetrieb:" })}</span>
          {secenekler.map(({ m, ad, ip }) => (
            <button key={m} title={ip} disabled={disabled}
              onClick={() => onSec(m)}
              className="rounded px-2.5 py-1 font-medium transition disabled:opacity-50"
              style={tersMod === m ? { background: brand.ink, color: "#fff" } : { background: brand.surface, color: brand.inkSoft, border: `1px solid ${brand.border}` }}>
              {ad}
            </button>
          ))}
          <span style={{ color: brand.faint }}>— {t({ tr: "yalnız", en: "applies only to switches", de: "gilt nur für Weichen" })} <b>{t({ tr: "istasyondaki", en: "at stations", de: "an Stationen" })}</b> {t({ tr: "makaslar için geçerli", en: "", de: "" })} ({tersMakasSayisi} {t({ tr: "istasyon", en: "stations", de: "Stationen" })})</span>
        </div>
  );
}

/** DÖNGÜ — seçili tren detay kutusu: anlık durum + bir turda hangi nedene ne kadar
 *  süre. Saf sunum; türetmeler (yüzde/sıralama) prop'lardan hesaplanır. Durum etiketi
 *  motor `durum` enum'undan localize edilir (t(DURUM_STIL[d].ad)). */
export function TrenDetayKutusu({ st, no, dokum, periyot, cakismaVar, onKapat }: {
  st: { durum: LoopDurum; ad: string; v: number; fp: number; up: boolean };
  no: number; dokum: LoopYorunge["dokum"]; periyot: number; cakismaVar: boolean; onKapat: () => void;
}) {
  const { t } = useDil();
  const stil = DURUM_STIL[st.durum];
  const topSn = Object.values(dokum).reduce((a, b) => a + b, 0) || 1;
  const sirali = (Object.entries(dokum) as [LoopDurum, number][]).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  // ÜRETKEN (hareket: seyir+hızlanma) ↔ DURUŞ/KISIT (dwell+dönüş+hız kısıtı) ayrımı —
  // turun ne kadarı yol alıyor, ne kadarı durak/dönüş/kısıtta geçiyor.
  const hareketSn = (dokum.seyir || 0) + (dokum.hizlanma || 0);
  const duruklamaSn = (dokum.dwell || 0) + (dokum.donus || 0) + (dokum.kisit || 0);
  const hareketPct = (hareketSn / topSn) * 100;
  const legAd = st.up
    ? t({ tr: "gidiş (sol→sağ)", en: "outbound (left→right)", de: "Hinfahrt (links→rechts)" })
    : t({ tr: "dönüş (sağ→sol)", en: "return (right→left)", de: "Rückfahrt (rechts→links)" });
  return (
          <div className="mt-2 rounded-lg border p-3" style={{ borderColor: cakismaVar ? brand.red : brand.ink, background: brand.surface }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: brand.ink }}><Ikon ad="tramvay" size={14} className="mr-0.5 inline-block align-[-2px]" />{t({ tr: "Tren", en: "Train", de: "Zug" })} {no} — {t({ tr: "şu an:", en: "now:", de: "jetzt:" })} <span style={{ color: cakismaVar ? brand.red : stil.renk }}>{cakismaVar ? `⚠ ${t({ tr: "kavşak çakışması", en: "junction conflict", de: "Knotenkonflikt" })}` : `${stil.ikon} ${t(stil.ad)}`}</span> · {Math.round(st.v * 3.6)} km/h</span>
              <button onClick={onKapat} className="text-xs underline" style={{ color: brand.muted }}>{t({ tr: "kapat", en: "close", de: "schließen" })}</button>
            </div>
            {/* Anlık durum: konum (km) + şerit + hareket/duruş özeti */}
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: brand.inkSoft }}>
              <span>📍 <b>{(st.fp / 1000).toFixed(2)} km</b> · {legAd}</span>
              <span>▶ {t({ tr: "hareket", en: "moving", de: "in Fahrt" })} <b style={{ color: CK.good }}>{Math.round(hareketPct)}%</b></span>
              <span>‖ {t({ tr: "duruş/kısıt", en: "stop/restriction", de: "Halt/Beschränkung" })} <b style={{ color: CK.amber }}>{Math.round(100 - hareketPct)}%</b> ({Math.round(duruklamaSn)} {t({ tr: "s/tur", en: "s/round", de: "s/Runde" })})</span>
            </div>
            {cakismaVar && (
              <div className="mt-1.5 rounded border-l-2 px-2 py-1 text-xs" style={{ borderColor: brand.red, background: CK.badBgSoft, color: brand.inkSoft }}>
                {t({ tr: "Bu tramvay, bir ters-işletme treninin geçtiği", en: "This tram is in a", de: "Diese Straßenbahn befindet sich in einer" })} <b>{t({ tr: "crossover fouling bölgesinde", en: "crossover fouling zone", de: "Kreuzungs-Gefahrenzone" })}</b> {t({ tr: "— gerçek interlocking'de kavşak boşalana dek bekletilirdi.", en: "that a reverse-operation train is passing — in real interlocking it would be held until the junction clears.", de: ", die ein Kehrbetriebszug durchfährt — in echter Verriegelung würde sie bis zum Freiwerden des Knotens angehalten." })}
              </div>
            )}
            <div className="mt-2 text-xs" style={{ color: brand.inkSoft }}>{t({ tr: "Bir tam turda (çevrim", en: "In one full round (cycle", de: "In einer vollen Runde (Umlauf" })} {saat(periyot)}) {t({ tr: "hangi nedene ne kadar süre geçiriyor:", en: "how much time it spends on each cause:", de: "wie viel Zeit je Ursache verbracht wird:" })}</div>
            <div className="mt-1 space-y-1">
              {sirali.map(([d, v]) => {
                const s = DURUM_STIL[d]; const yuzde = (v / topSn) * 100;
                return (
                  <div key={d} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0" style={{ color: s.renk }}>{s.ikon} {t(s.ad)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: CK.track }}><div style={{ width: `${yuzde}%`, height: "100%", background: s.renk }} /></div>
                    <span className="w-20 shrink-0 text-right tabular-nums" style={{ color: brand.inkSoft }}>{Math.round(v)} s · %{Math.round(yuzde)}</span>
                  </div>
                );
              })}
            </div>
          </div>
  );
}
