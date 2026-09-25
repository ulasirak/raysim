"use client";

// raysim — TERS İŞLETME bölümü: kısa dönüş / makas varyasyonları / talep-dönüş / filo.
// İki girdi modu: "Toplam" (pik yolcu/saat, rolden tahmin) ve "Her İstasyon" (durak-başı
// iniş/biniş → kümülatif yük). Sonuçlar çekmece (drawer) yapısında — az yer kaplar.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { dwellUygulanmisRings, maxYolcuKapasitesi } from "@/lib/anaray/yolcu";
import { tersIsletmeAnaliz, tavsiyeTramvaySayisi } from "@/lib/anaray/tersisletme";
import { Num, SubBaslik } from "@/components/RingUI";
import { brand } from "@/lib/anaray/brand";
import { Kart } from "@/components/Kart";
import { CK } from "@/lib/anaray/chartkit";
import { useDil } from "@/components/DilProvider";

function Kucuk({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[0.65rem] leading-snug" style={{ color: brand.muted }}>{children}</span>;
}

/** Çekmece (drawer) — tek tuşla aşağı açılır; kapalıyken yer kaplamaz. */
function Cekmece({ baslik, ozet, acik, onToggle, vurgu, children }: {
  baslik: string; ozet?: React.ReactNode; acik: boolean; onToggle: () => void; vurgu?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border" style={{ borderColor: vurgu || brand.border, background: brand.surface }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="text-sm font-semibold" style={{ color: brand.ink }}>{baslik}</span>
        <span className="flex items-center gap-2 text-xs" style={{ color: brand.muted }}>{ozet}<span style={{ color: brand.inkSoft }}>{acik ? "▲" : "▼"}</span></span>
      </button>
      {acik && <div className="border-t px-3 py-2" style={{ borderColor: brand.border }}>{children}</div>}
    </div>
  );
}

const FILO_RENK: Record<string, { bg: string; bd: string; ad: string }> = {
  arttir: { bg: "#FEF2F2", bd: CK.red, ad: "ARAÇ EKLE" },
  azalt: { bg: CK.goodBgSoft, bd: brand.ink, ad: "ARAÇ ÇEK" },
  yeterli: { bg: CK.goodBgSoft, bd: "#16794C", ad: "FİLO YETERLİ" },
  kapasiteYetmez: { bg: "#FEF2F2", bd: CK.red, ad: "KAPASİTE YETMEZ" },
};

type DrawerId = "girdi" | "depo" | "donus" | "makas" | "profil";

export function TersIsletme() {
  const { cfg } = useSimConfig();
  const { t } = useDil();
  const { rings: ringsHam } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);

  const [mod, setMod] = useState<"toplam" | "istasyon">("toplam");
  const [acik, setAcik] = useState<Record<DrawerId, boolean>>({ girdi: true, depo: false, donus: false, makas: false, profil: false });
  const topla = (id: DrawerId) => setAcik((a) => ({ ...a, [id]: !a[id] }));
  const hepsi = (v: boolean) => setAcik({ girdi: v, depo: v, donus: v, makas: v, profil: v });
  // Tavsiye kartından "etkileyen girdi"ye yönlendirme: talep çekmecesini aç + kaydır.
  const acGirdi = () => { setAcik((a) => ({ ...a, girdi: true })); requestAnimationFrame(() => document.getElementById("talep-girdileri")?.scrollIntoView({ behavior: "smooth", block: "start" })); };

  const rapor = useMemo(() => tersIsletmeAnaliz(rings, stock, isletme, cfg), [rings, stock, isletme, cfg]);
  const tavsiye = useMemo(() => tavsiyeTramvaySayisi(rings, stock, isletme, cfg), [rings, stock, isletme, cfg]);

  if (rings.length < 2 || !rapor) {
    return (
      <div>
        <SubBaslik>{t({ tr: "Ters İşletme", en: "Reverse Running", de: "Kehrbetrieb" })}</SubBaslik>
        <p className="mt-2 text-sm" style={{ color: brand.muted }}>{t({ tr: "Analiz için önce Durak Arası Ringler bölümünde en az iki duraklı bir hat kur.", en: "For analysis, first build a line with at least two stations in the Inter-Station Rings section.", de: "Erstellen Sie für die Analyse zuerst im Bereich Ringe zwischen Haltestellen eine Linie mit mindestens zwei Haltestellen." })}</p>
      </div>
    );
  }

  const f = rapor.filo;
  const renk = FILO_RENK[f.oneri];
  const pct = (x: number) => `%${Math.round(x * 100)}`;
  const hedef = isletme.dolulukHedefi || 0.85;
  const gercekVar = rapor.gercekVeri; // durak-başı gerçek iniş/biniş girildi mi
  const toplamBinen = rapor.duraklar.reduce((s, d) => s + d.binen, 0); // girili/etkin toplam biniş (yolcu/sa)

  const setIstYolcu = (ad: string, alan: "binen" | "inen", v: number) => {
    const cur = isletme.istasyonYolcu ?? {};
    const durak = cur[ad] ?? { binen: 0, inen: 0 };
    patchIsletme({ istasyonYolcu: { ...cur, [ad]: { ...durak, [alan]: Math.max(0, Math.round(v)) } } });
  };

  return (
    <div className="space-y-3">
      <div>
        <SubBaslik>{t({ tr: "Ters İşletme — Kısa Dönüş, Makas Varyasyonları & Filo", en: "Reverse Running — Short-Turns, Switch Variations & Fleet", de: "Kehrbetrieb — Kehren, Weichenvarianten & Flotte" })}</SubBaslik>
        <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>
          {t({ tr: "Bütün trenler tek depodan çıkar; bazıları ilk makastan karşı şeride geçip ters yönde işe başlar. Uç terminaller VE ara istasyonlardaki makas bölgeleri (özellikle S makaslar) birer kısa-dönüş noktasıdır. Sistem yolcu talep dağılımına göre her makasın ters-işletme varyasyonlarını, hangi durakların dönüşe ihtiyaç duyacağını ve pik talebi tıkanmadan karşılayacak filoyu yorumlar.", en: "All trains leave from a single depot; some cross to the opposite track at the first switch and start in the reverse direction. End terminals AND switch zones at intermediate stations (especially S-switches) are short-turn points. Based on the passenger demand distribution, the system interprets each switch's reverse-running variations, which stations will need a turn, and the fleet that meets peak demand without congestion.", de: "Alle Züge fahren aus einem einzigen Depot; einige wechseln an der ersten Weiche auf das Gegengleis und beginnen in Gegenrichtung. Endstellen UND Weichenbereiche an Zwischenstationen (besonders S-Weichen) sind Kehrpunkte. Anhand der Verteilung der Fahrgastnachfrage interpretiert das System die Kehrvarianten jeder Weiche, welche Haltestellen eine Kehre benötigen und die Flotte, die die Spitzennachfrage ohne Überlastung deckt." })}
        </p>
        <div className="mt-1 text-right">
          <button type="button" onClick={() => hepsi(!Object.values(acik).every(Boolean))} className="text-xs underline" style={{ color: brand.inkSoft }}>
            {Object.values(acik).every(Boolean) ? t({ tr: "tümünü kapat", en: "collapse all", de: "alle einklappen" }) : t({ tr: "tümünü aç", en: "expand all", de: "alle ausklappen" })}
          </button>
        </div>
      </div>

      {/* FİLO ÖNERİSİ — headline, daima görünür */}
      <div className="rounded-lg border-2 p-4" style={{ borderColor: renk.bd, background: renk.bg }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: renk.bd }}>{renk.ad}</span>
          <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "pik talebi", en: "peak demand at", de: "Spitzennachfrage bei" })} {pct(hedef)} {t({ tr: "dolulukla", en: "occupancy", de: "Auslastung" })} · {mod === "istasyon" ? t({ tr: "durak-başı veri", en: "per-station data", de: "Daten je Haltestelle" }) : t({ tr: "toplam tahmin", en: "total estimate", de: "Gesamtschätzung" })}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums" style={{ color: brand.ink }}>{f.gerekenArac}</span>
          <span className="text-sm" style={{ color: brand.inkSoft }}>{t({ tr: "gereken araç", en: "vehicles needed", de: "Fahrzeuge nötig" })} · {t({ tr: "mevcut pik", en: "current peak", de: "aktuelle Spitze" })} {f.mevcutPik} · {f.fark > 0 ? `+${f.fark} ${t({ tr: "ekle", en: "more", de: "mehr" })}` : f.fark < 0 ? `${f.fark} ${t({ tr: "çek", en: "fewer", de: "weniger" })}` : t({ tr: "değişim yok", en: "no change", de: "keine Änderung" })}</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>{f.aciklama}</p>
        {f.kisaDonusTasarruf > 0 && (
          <p className="mt-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "Kısa dönüşle dış kolda boş sefer azalır →", en: "Short-turning cuts empty runs on the outer leg →", de: "Kehren reduziert Leerfahrten auf dem Außenast →" })} ~{f.kisaDonusTasarruf} {t({ tr: "araç tasarruf", en: "vehicles saved", de: "Fahrzeuge gespart" })} ({f.gerekenAracKisaDonusle} {t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })}). {t({ tr: "Sürdürülebilir tavan", en: "Sustainable ceiling", de: "Nachhaltige Obergrenze" })} {rapor.maksSurdurulebilir} {t({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })}.</p>
        )}
        <p className="mt-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "Tepe yük:", en: "Peak load:", de: "Spitzenlast:" })} <b>{rapor.tepeDurak}</b> {rapor.tepeYuk} {t({ tr: "yolcu/saat", en: "pax/h", de: "Fahrgäste/h" })} · {t({ tr: "çevrim", en: "cycle", de: "Umlauf" })} {Math.round(rapor.cevrimSn / 60)} dk · {t({ tr: "frekans", en: "frequency", de: "Frequenz" })} {rapor.mevcutFrekans.toFixed(1)} {t({ tr: "tren/sa", en: "trains/h", de: "Züge/h" })} · {t({ tr: "araç", en: "vehicle", de: "Fahrzeug" })} {rapor.aracKapasite} {t({ tr: "kişi", en: "pax", de: "Pers." })}.</p>
      </div>

      {/* TAVSİYE EDİLEN TRAMVAY SAYISI — dinamik, talep + kurp konforu + tüm parametreler */}
      {tavsiye && (
        <div className="rounded-lg border-2 p-4" style={{ borderColor: brand.ink, background: "#F7F9FB" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: brand.ink }}>{t({ tr: "Tavsiye Edilen Tramvay Sayısı", en: "Recommended Number of Trams", de: "Empfohlene Anzahl Straßenbahnen" })}</span>
            <span className="text-xs" style={{ color: brand.muted }}>
              {t({ tr: "belirleyen:", en: "driven by:", de: "bestimmt durch:" })} {tavsiye.surucu === "talep" ? t({ tr: "yolcu talebi", en: "passenger demand", de: "Fahrgastnachfrage" }) : tavsiye.surucu === "frekans" ? t({ tr: "hedef sefer aralığı", en: "target headway", de: "Ziel-Zugfolgezeit" }) : t({ tr: "kapasite tavanı", en: "capacity ceiling", de: "Kapazitätsgrenze" })}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums" style={{ color: brand.ink }}>{tavsiye.tavsiye}</span>
            <span className="text-sm" style={{ color: brand.inkSoft }}>
              {t({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })} · {t({ tr: "aralık", en: "headway", de: "Zugfolgezeit" })} ~{Math.round(tavsiye.ulasilanHeadwaySn)} s · {t({ tr: "tepe doluluk", en: "peak occupancy", de: "Spitzenauslastung" })} %{Math.round(tavsiye.ulasilanDoluluk * 100)}
            </span>
          </div>
          {/* Sürücü kırılımı */}
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded p-1.5" style={{ background: "#EEF6EE" }}>
              <div className="font-bold tabular-nums" style={{ color: "#2E7D32" }}>{tavsiye.talepArac}</div>
              <div style={{ color: brand.muted }}>{t({ tr: "talep", en: "demand", de: "Nachfrage" })} (%{Math.round(tavsiye.dolulukHedefi * 100)} {t({ tr: "doluluk", en: "occupancy", de: "Auslastung" })})</div>
            </div>
            <div className="rounded p-1.5" style={{ background: "#EEF1F6" }}>
              <div className="font-bold tabular-nums" style={{ color: brand.ink }}>{tavsiye.frekansArac}</div>
              <div style={{ color: brand.muted }}>{t({ tr: "sefer sıklığı", en: "service frequency", de: "Taktdichte" })} ({t({ tr: "hedef", en: "target", de: "Ziel" })} {cfg.headway}s)</div>
            </div>
            <div className="rounded p-1.5" style={{ background: "#FBF6EA" }}>
              <div className="font-bold tabular-nums" style={{ color: "#8a6d1a" }}>{tavsiye.maksTavan}</div>
              <div style={{ color: brand.muted }}>{t({ tr: "sürdürülebilir tavan", en: "sustainable ceiling", de: "nachhaltige Obergrenze" })}</div>
            </div>
          </div>
          {tavsiye.kurpAdet > 0 && (
            <p className="mt-2 text-xs" style={{ color: tavsiye.kurpUyariTavsiye < tavsiye.kurpUyariMevcut ? "#2E7D32" : brand.muted }}>
              🛤 Kurp konforu: {tavsiye.kurpAdet} kurptan {tavsiye.kurpUyariMevcut}'inde ayakta-yolcu uyarısı vardı; bu filoda <b>{tavsiye.kurpUyariTavsiye}</b>'e iniyor{tavsiye.kurpUyariTavsiye < tavsiye.kurpUyariMevcut ? " (düşük doluluk → kurplarda konfor düzeliyor)" : ""}.
            </p>
          )}
          <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>{tavsiye.gerekce}</p>
          {/* Etkileyen girdilere yönlendirme */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 text-[0.72rem]" style={{ borderColor: brand.border }}>
            <span style={{ color: brand.muted }}>{t({ tr: "Etkileyen girdiler →", en: "Influencing inputs →", de: "Einflussgrößen →" })}</span>
            <button type="button" onClick={acGirdi} className="rounded border px-2 py-0.5 font-medium" style={{ borderColor: brand.border, color: brand.ink }}
              title={t({ tr: "Durak yolcu talebi + araç kapasitesi + doluluk hedefi (bu sayfada)", en: "Station passenger demand + vehicle capacity + occupancy target (on this page)", de: "Fahrgastnachfrage der Haltestelle + Fahrzeugkapazität + Auslastungsziel (auf dieser Seite)" })}>{t({ tr: "📊 Talep · kapasite · doluluk", en: "📊 Demand · capacity · occupancy", de: "📊 Nachfrage · Kapazität · Auslastung" })}</button>
            <Link href="/ringler" className="rounded border px-2 py-0.5 font-medium" style={{ borderColor: brand.border, color: brand.ink }}
              title={t({ tr: "Kurplar (çevrimi ve konforu etkiler) + sahasal hız — Ringler", en: "Curves (affect cycle and comfort) + field speed — Rings", de: "Kurven (beeinflussen Umlauf und Komfort) + Feldgeschwindigkeit — Ringe" })}>{t({ tr: "🛤 Kurplar & hız", en: "🛤 Curves & speed", de: "🛤 Kurven & Geschwindigkeit" })}</Link>
            <Link href="/sistem" className="rounded border px-2 py-0.5 font-medium" style={{ borderColor: brand.border, color: brand.ink }}
              title={t({ tr: "Hedef sefer aralığı (headway) + yanal ivme/konfor tavanı + ivme/fren — Sistem Merkezi", en: "Target headway + lateral acceleration/comfort ceiling + acceleration/braking — System Center", de: "Ziel-Zugfolgezeit + Querbeschleunigung/Komfortgrenze + Beschleunigung/Bremsung — Systemzentrum" })}>{t({ tr: "⚙ Hedef aralık · konfor", en: "⚙ Target headway · comfort", de: "⚙ Ziel-Zugfolgezeit · Komfort" })}</Link>
          </div>
        </div>
      )}

      {/* GİRDİ — Toplam / Her İstasyon sekmeleri (çekmece) */}
      <div id="talep-girdileri" className="scroll-mt-24">
      <Cekmece baslik={t({ tr: "Talep Girdileri", en: "Demand Inputs", de: "Nachfrage-Eingaben" })} acik={acik.girdi} onToggle={() => topla("girdi")}
        ozet={<span>{mod === "istasyon" ? t({ tr: "her istasyon", en: "each station", de: "jede Station" }) : t({ tr: "toplam", en: "total", de: "gesamt" })} · {toplamBinen}/sa</span>}>
        <div className="mb-2 flex gap-1">
          {([["toplam", t({ tr: "Toplam Talep", en: "Total demand", de: "Gesamtnachfrage" })], ["istasyon", t({ tr: "Her İstasyon", en: "Each station", de: "Jede Station" })]] as const).map(([m, ad]) => (
            <button key={m} type="button" onClick={() => setMod(m)}
              className="rounded border px-2.5 py-1 text-xs font-medium"
              style={mod === m ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}>
              {ad}
            </button>
          ))}
        </div>
        {/* ORTAK GİRDİLER — her iki görünümde de aynı; görünüm seçimi SONUCU DEĞİŞTİRMEZ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><Num label={t({ tr: "Pik saat yolcu (toplam)", en: "Peak-hour passengers (total)", de: "Fahrgäste Spitzenstunde (gesamt)" })} suffix={t({ tr: "yolcu/sa", en: "pax/h", de: "Fahrgäste/h" })} step={100} value={isletme.pikYolcuSaat}
            onChange={(v) => patchIsletme({ pikYolcuSaat: Math.max(0, Math.round(v)) })} /><Kucuk>{t({ tr: "toplam talep tabanı — rolden duraklara dağıtılır", en: "total demand base — distributed to stations by role", de: "Nachfragebasis gesamt — nach Rolle auf Haltestellen verteilt" })}{gercekVar ? ` · ${t({ tr: "girili toplam", en: "entered total", de: "eingegebene Summe" })} ≈ ${toplamBinen} ${t({ tr: "biniş/sa", en: "boardings/h", de: "Einstiege/h" })}` : ""}</Kucuk></div>
          <div><Num label={t({ tr: "Araç yolcu kapasitesi", en: "Vehicle passenger capacity", de: "Fahrgastkapazität Fahrzeug" })} suffix={t({ tr: "kişi", en: "pax", de: "Pers." })} step={10} value={isletme.aracYolcuKapasite}
            onChange={(v) => patchIsletme({ aracYolcuKapasite: Math.max(1, Math.round(v)) })} /><Kucuk>{t({ tr: "tıkanmadan taşınan — seçili araç", en: "carried without crowding — selected vehicle", de: "ohne Überfüllung befördert — gewähltes Fahrzeug" })} <b>{stock.name}</b> ~{maxYolcuKapasitesi(stock, isletme.konforIndeksi)}</Kucuk></div>
          <div><Num label={t({ tr: "Doluluk hedefi", en: "Occupancy target", de: "Auslastungsziel" })} suffix="%" step={5} value={Math.round(hedef * 100)}
            onChange={(v) => patchIsletme({ dolulukHedefi: Math.min(1, Math.max(0.3, v / 100)) })} /><Kucuk>{t({ tr: 'bu oranın üstü "tıkanma"', en: 'above this ratio is "crowding"', de: 'über diesem Wert "Überfüllung"' })}</Kucuk></div>
        </div>
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>
          ℹ️ <b>{t({ tr: "İki görünüm de AYNI modeli besler", en: "Both views feed the SAME model", de: "Beide Ansichten speisen DASSELBE Modell" })}</b> {t({ tr: "— sekme değiştirmek sonucu değiştirmez.", en: "— switching tabs does not change the result.", de: "— ein Wechsel des Tabs ändert das Ergebnis nicht." })} <b>{t({ tr: "Toplam Talep", en: "Total demand", de: "Gesamtnachfrage" })}</b>: {t({ tr: "tek sayı girersin, rolden (hastane/aktarma/stadyum/merkez=yoğun) duraklara dağıtılır.", en: "you enter a single number; it is distributed to stations by role (hospital/interchange/stadium/center=busy).", de: "Sie geben eine einzige Zahl ein; sie wird nach Rolle auf die Haltestellen verteilt (Krankenhaus/Umstieg/Stadion/Zentrum=voll)." })} <b>{t({ tr: "Her İstasyon", en: "Each station", de: "Jede Station" })}</b>: {t({ tr: "durak-başı gerçek iniş/biniş girersin (girilenler tahmini EZER). Girdiğin durak-başı değerler her iki görünümde de geçerlidir.", en: "you enter real per-station alighting/boarding (entries OVERRIDE the estimate). The per-station values you enter apply in both views.", de: "Sie geben reale Ausstiege/Einstiege je Haltestelle ein (Eingaben ÜBERSCHREIBEN die Schätzung). Die von Ihnen eingegebenen Werte je Haltestelle gelten in beiden Ansichten." })}
        </p>
        {mod === "istasyon" && (
          <div className="mt-2">
            <p className="mb-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "Her durakta pik saat iniş/biniş (yolcu/saat). Tablo, üstteki toplamdan rol-tahminiyle DOLU gelir — düzenlediğin değer kalıcı kaydolur ve tahmini ezer. Yük ", en: "Peak-hour alighting/boarding at each station (pax/h). The table is PRE-FILLED from the total above by role estimate — the value you edit is saved permanently and overrides the estimate. Load is ", de: "Ausstiege/Einstiege in der Spitzenstunde je Haltestelle (Fahrgäste/h). Die Tabelle ist aus der Summe oben per Rollenschätzung VORAUSGEFÜLLT — der von Ihnen bearbeitete Wert wird dauerhaft gespeichert und überschreibt die Schätzung. Die Last wird " })}<b>{t({ tr: "kümülatif", en: "cumulative", de: "kumulativ" })}</b>{t({ tr: " hesaplanır (Σbinen − Σinen). Dwell/kapasiteyi etkilemez. ", en: " (Σboarding − Σalighting). Does not affect dwell/capacity. ", de: " berechnet (Σ Einstiege − Σ Ausstiege). Beeinflusst Haltezeit/Kapazität nicht. " })}{gercekVar ? <>{t({ tr: "Girili toplam biniş:", en: "Entered total boardings:", de: "Eingegebene Einstiege gesamt:" })} <b>{toplamBinen}/sa</b>.</> : t({ tr: "Henüz elle giriş yok — hepsi tahmin.", en: "No manual entry yet — all estimated.", de: "Noch keine manuelle Eingabe — alles geschätzt." })}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: brand.inkSoft }}>
                <thead><tr style={{ color: brand.muted }}>
                  <th className="px-1 py-0.5 text-left">{t({ tr: "Durak", en: "Station", de: "Haltestelle" })}</th><th className="px-1 py-0.5 text-right">{t({ tr: "Binen", en: "Boarding", de: "Einstieg" })}</th><th className="px-1 py-0.5 text-right">{t({ tr: "İnen", en: "Alighting", de: "Ausstieg" })}</th><th className="px-1 py-0.5 text-right">{t({ tr: "Yük", en: "Load", de: "Last" })}</th>
                </tr></thead>
                <tbody>
                  {rapor.duraklar.map((d, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#FBFCFD" : "transparent" }}>
                      <td className="px-1 py-0.5 text-left">{d.makasVar ? "◆ " : ""}{d.terminal ? "⊚ " : ""}{d.ad}</td>
                      <td className="px-1 py-0.5 text-right"><input type="number" value={d.binen} onChange={(e) => setIstYolcu(d.ad, "binen", +e.target.value)}
                        className="w-16 rounded border px-1 py-0.5 text-right tabular-nums" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-0.5 text-right"><input type="number" value={d.inen} onChange={(e) => setIstYolcu(d.ad, "inen", +e.target.value)}
                        className="w-16 rounded border px-1 py-0.5 text-right tabular-nums" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-0.5 text-right tabular-nums font-semibold" style={{ color: d.doluluk > hedef ? CK.red : brand.inkSoft }}>{d.tepeYuk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isletme.istasyonYolcu && Object.keys(isletme.istasyonYolcu).length > 0 && (
              <button type="button" onClick={() => patchIsletme({ istasyonYolcu: {} })} className="mt-1 text-xs underline" style={{ color: brand.muted }}>{t({ tr: "tahmine sıfırla", en: "reset to estimate", de: "auf Schätzung zurücksetzen" })}</button>
            )}
          </div>
        )}
      </Cekmece>
      </div>

      {/* DEPO DAĞILIMI */}
      <Cekmece baslik={t({ tr: "Depo Çıkışı — Tek Depodan İki Yön", en: "Depot Exit — Two Directions from One Depot", de: "Depotausfahrt — Zwei Richtungen aus einem Depot" })} acik={acik.depo} onToggle={() => topla("depo")}
        ozet={<span>{rapor.depoDagilim.gidis} {t({ tr: "gidiş", en: "outbound", de: "Hinfahrt" })} / {rapor.depoDagilim.donus} {t({ tr: "ters", en: "reversed", de: "Kehr" })}</span>}>
        <div className="flex flex-wrap gap-4">
          <Kart ic="sm"><div className="text-xl font-bold tabular-nums" style={{ color: CK.blue }}>{rapor.depoDagilim.gidis}</div><div className="text-xs" style={{ color: brand.muted }}>{t({ tr: "gidiş (kendi yönünden çıkar)", en: "outbound (leaves in its own direction)", de: "Hinfahrt (fährt in eigener Richtung aus)" })}</div></Kart>
          <Kart ic="sm"><div className="text-xl font-bold tabular-nums" style={{ color: CK.orange }}>{rapor.depoDagilim.donus}</div><div className="text-xs" style={{ color: brand.muted }}>{t({ tr: "ters (ilk makastan karşı şeride geçer)", en: "reversed (crosses to the opposite track at the first switch)", de: "Kehr (wechselt an der ersten Weiche auf das Gegengleis)" })}</div></Kart>
        </div>
        <p className="mt-2 text-xs" style={{ color: brand.muted }}>{rapor.depoDagilim.aciklama}</p>
      </Cekmece>

      {/* DÖNÜŞE İHTİYAÇ DUYAN DURAKLAR */}
      <Cekmece baslik={t({ tr: "Dönüşe İhtiyaç Duyan Duraklar (yolcu birikimi)", en: "Stations Needing a Turn (passenger build-up)", de: "Haltestellen mit Kehrbedarf (Fahrgastanstau)" })} acik={acik.donus} onToggle={() => topla("donus")}
        vurgu={rapor.donusIhtiyaclari.length > 0 ? CK.red : undefined}
        ozet={<span>{rapor.donusIhtiyaclari.length === 0 ? t({ tr: "tıkanma yok", en: "no congestion", de: "keine Überlastung" }) : `${rapor.donusIhtiyaclari.length} ${t({ tr: "tıkanan", en: "congested", de: "überlastet" })}`}</span>}>
        {rapor.donusIhtiyaclari.length === 0 ? (
          <p className="text-sm" style={{ color: "#16794C" }}>✓ {t({ tr: "Hiçbir durak tıkanmıyor — talep", en: "No station is congested — demand is met below the", de: "Keine Haltestelle ist überlastet — Nachfrage wird unter dem" })} {pct(hedef)} {t({ tr: "doluluk hedefinin altında karşılanıyor.", en: "occupancy target.", de: "Auslastungsziel gedeckt." })}</p>
        ) : (
          <div className="space-y-2">
            {rapor.donusIhtiyaclari.map((d, i) => {
              const sev = d.siddet === "kritik" ? CK.red : d.siddet === "yuksek" ? CK.amber : brand.inkSoft;
              return (
                <div key={i} className="rounded border-l-4 px-3 py-1.5 text-sm" style={{ borderColor: sev, background: "#FBFCFD" }}>
                  <div className="flex items-center justify-between"><b style={{ color: brand.ink }}>{d.durak}</b><span className="text-xs font-semibold" style={{ color: sev }}>{t({ tr: "doluluk", en: "occupancy", de: "Auslastung" })} %{Math.round(d.doluluk * 100)} · {d.siddet.toLocaleUpperCase("tr")}</span></div>
                  <div className="text-xs" style={{ color: brand.muted }}>{d.sebep} → <b>{d.oneriMakas}</b> {t({ tr: "makasından kısa dönüş bu kesimin sıklığını artırır.", en: "— short-turning here raises frequency on this segment.", de: "— Kehren an dieser Weiche erhöht die Frequenz auf diesem Abschnitt." })}</div>
                </div>
              );
            })}
          </div>
        )}
      </Cekmece>

      {/* MAKAS-BAŞI TERS İŞLETME VARYASYONLARI */}
      <Cekmece baslik={t({ tr: "Makas Bölgesi Başına Ters İşletme Varyasyonları", en: "Reverse-Running Variations per Switch Zone", de: "Kehrbetriebsvarianten je Weichenbereich" })} acik={acik.makas} onToggle={() => topla("makas")}
        ozet={<span>{rapor.makaslar.length} {t({ tr: "makas", en: "switches", de: "Weichen" })} · {rapor.makaslar.filter((m) => m.kisaDonusOnerilir).length} {t({ tr: "kısa-dönüş adayı", en: "short-turn candidates", de: "Kehr-Kandidaten" })}</span>}>
        <p className="mb-2 text-xs" style={{ color: brand.muted }}>{t({ tr: "Ara istasyonlardaki makaslar dâhil her bölgenin kısa-dönüş rolü + tüm ters-işletme ihtimalleri; süreler değişmeden yoğunluğa karşı nasıl kullanılır.", en: "The short-turn role of each zone including switches at intermediate stations + all reverse-running possibilities; how they are used against demand without changing run times.", de: "Die Kehr-Rolle jedes Bereichs einschließlich Weichen an Zwischenstationen + alle Kehrbetriebsmöglichkeiten; wie sie ohne Änderung der Fahrzeiten gegen die Auslastung eingesetzt werden." })}</p>
        {rapor.makaslar.length === 0 ? (
          <p className="text-sm" style={{ color: brand.muted }}>{t({ tr: "Ara istasyonlarda makas bölgesi yok (yalnız uç terminaller dönüş yapıyor).", en: "No switch zone at intermediate stations (only end terminals turn).", de: "Kein Weichenbereich an Zwischenstationen (nur Endstellen kehren)." })}</p>
        ) : (
          <div className="space-y-3">
            {rapor.makaslar.map((m, i) => (
              <div key={i} className="rounded-md border p-3" style={{ borderColor: m.kisaDonusOnerilir ? brand.ink : brand.border }}>
                <div className="flex items-center justify-between">
                  <b style={{ color: brand.ink }}>{m.ad}</b>
                  <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold" style={{ background: m.crossover === "x" ? CK.goodBgSoft : "#F1F5F9", color: brand.inkSoft }}>
                    {m.makasSayisi} {m.crossover === "x" ? "X" : "S"}-{t({ tr: "makas", en: "switch", de: "Weiche" })} · {m.kisaDonusOnerilir ? `${t({ tr: "KISA DÖNÜŞ ADAYI", en: "SHORT-TURN CANDIDATE", de: "KEHR-KANDIDAT" })} (%${m.kisaDonusYuzde})` : t({ tr: "dengeli", en: "balanced", de: "ausgewogen" })}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: brand.muted }}>{m.yorum} {m.sureNotu}</div>
                <div className="mt-2 space-y-1">
                  {m.varyasyonlar.map((v, j) => (<div key={j} className="text-xs" style={{ color: brand.inkSoft }}><b>• {v.ad}:</b> {v.aciklama}</div>))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Cekmece>

      {/* YOLCU YÜK PROFİLİ */}
      <Cekmece baslik={t({ tr: "Yolcu Yük Profili (hat boyu)", en: "Passenger Load Profile (along the line)", de: "Fahrgastlastprofil (entlang der Linie)" })} acik={acik.profil} onToggle={() => topla("profil")}
        ozet={<span>{t({ tr: "tepe", en: "peak", de: "Spitze" })} {rapor.tepeYuk} @ {rapor.tepeDurak}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: brand.inkSoft }}>
            <thead><tr style={{ color: brand.muted }}>
              <th className="px-1 py-1 text-left">{t({ tr: "Durak", en: "Station", de: "Haltestelle" })}</th><th className="px-1 py-1 text-right">{t({ tr: "Binen", en: "Boarding", de: "Einstieg" })}</th><th className="px-1 py-1 text-right">{t({ tr: "İnen", en: "Alighting", de: "Ausstieg" })}</th><th className="px-1 py-1 text-right">{t({ tr: "Gidiş yük", en: "Outbound load", de: "Last Hinfahrt" })}</th><th className="px-1 py-1 text-right">{t({ tr: "Dönüş yük", en: "Return load", de: "Last Rückfahrt" })}</th><th className="px-1 py-1 text-right">{t({ tr: "Doluluk", en: "Occupancy", de: "Auslastung" })}</th>
            </tr></thead>
            <tbody>
              {rapor.duraklar.map((d, i) => {
                const tik = d.doluluk > hedef;
                return (
                  <tr key={i} style={{ background: d.ad === rapor.tepeDurak ? "#FEF2F2" : i % 2 ? "#FBFCFD" : "transparent" }}>
                    <td className="px-1 py-0.5 text-left">{d.makasVar ? "◆ " : ""}{d.terminal ? "⊚ " : ""}{d.ad}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.binen}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.inen}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.yukGidis}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{d.yukDonus}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums font-semibold" style={{ color: tik ? CK.red : brand.inkSoft }}>%{Math.round(d.doluluk * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "◆ makaslı durak · ⊚ terminal · kırmızı = tıkanan kesim.", en: "◆ station with switch · ⊚ terminal · red = congested segment.", de: "◆ Haltestelle mit Weiche · ⊚ Endstelle · rot = überlasteter Abschnitt." })}</p>
      </Cekmece>
    </div>
  );
}
