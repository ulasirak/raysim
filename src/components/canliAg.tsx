"use client";

// raysim — CANLI AĞ SİMÜLASYONU paylaşımlı hesap hook'u + mobil sayfa.
// useCanliAgProps: Studio'nun LiveNetwork'e beslediği aynı deterministik boru hattını
// (ağ→rota→hat→gidiş/dönüş sim→döngü) context'ten hesaplar. CanliAgSayfa: QR'dan gelen
// oturumsuz ziyaretçi için sade, MOBİL-uyumlu tam ekran sim (ters işletme KAPALI gelir).

import { useMemo, useState } from "react";
import type { RailNetwork, Route } from "@/lib/anaray/types";
import { flattenRoute, ringlerdenSebeke, hemzeminDuruslari, duruslariEkle, kalkisEkle, hatOzellikleri } from "@/lib/anaray/network";
import { simulate } from "@/lib/anaray/sim";
import { simulateSignalled, reverseRoute, planDepotDispatch, loopYorunge } from "@/lib/anaray/signalling";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import type { TersMod } from "@/lib/anaray/config";
import { etkinArac } from "@/lib/anaray/config";
import { brand } from "@/lib/anaray/brand";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { LiveNetwork } from "@/components/LiveNetwork";
import { useDil } from "@/components/DilProvider";

const KMH = 1 / 3.6;
const BOS_SEBEKE: RailNetwork = {
  id: "sebeke_bos", name: "Hat tanımlı değil",
  nodes: [
    { id: "bos_a", name: "—", type: "istasyon", x: 60, y: 70, dwell: 0 },
    { id: "bos_b", name: "—", type: "istasyon", x: 760, y: 70, dwell: 0 },
  ],
  edges: [{ id: "bos_e", from: "bos_a", to: "bos_b", length: 1000, segments: [{ start: 0, end: 1000, vmax: 40 * KMH, gradient: 0 }] }],
};
const BOS_ROTA: Route = { id: "rota_bos", name: "—", edgeIds: ["bos_e"], startNodeId: "bos_a" };

/** Studio'daki LiveNetwork boru hattının deterministik özü (tek kaynak: context). */
export function useCanliAgProps() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam, meta, subeler } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  // Canlı sim/çizim için config dinamik tavanları (ivme/servis freni) araca bağlanır.
  const stockSim = useMemo(() => etkinArac(stock, cfg), [stock, cfg]);

  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  const proje = useMemo(() => ringlerdenSebeke(rings, cfg, meta.hatAdi || "Proje Hattı", subeler), [rings, cfg, meta.hatAdi, subeler]);
  const network: RailNetwork = proje?.network ?? BOS_SEBEKE;
  const route: Route = proje?.route ?? BOS_ROTA;

  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const [ariza, setAriza] = useState<number[]>([]);
  const arizaToggle = (i: number) => setAriza((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]));

  const gecitDuruslari = useMemo(() => hemzeminDuruslari(rings, cfg), [rings, cfg]);
  const hatOzellik = useMemo(() => hatOzellikleri(rings, cfg), [rings, cfg]);
  const sinyalSimKonum = useMemo(() => hatOzellik.filter((f) => f.kind === "sinyal" && !f.tersIsletme).map((f) => f.pos), [hatOzellik]);
  const kalkisSu = isletme.kalkisOluZamaniSn;
  const line = useMemo(() => {
    const l = kalkisEkle(duruslariEkle(flattenRoute(network, route), gecitDuruslari, false), kalkisSu);
    simulate(l, stockSim, 0.5); // hat modelini ısıt (Studio ile birebir)
    return l;
  }, [network, stockSim, route, gecitDuruslari, kalkisSu]);
  const reverseLine = useMemo(
    () => kalkisEkle(duruslariEkle(flattenRoute(network, reverseRoute(route)), gecitDuruslari, true), kalkisSu),
    [network, route, gecitDuruslari, kalkisSu],
  );

  const nMax = maks.gecerli ? maks.nTeorik : 999;
  const filoTek = Math.max(1, isletme.toplamFilo || 1);
  const parkAnahtar = (pos: number) => `d${Math.round(pos)}`;
  const depoPozlar = useMemo(() => line.stations.filter((s) => s.depot && s.position < line.length - 1e-6).map((s) => s.position), [line]);
  const parkToplam = useMemo(() => {
    const dz = isletme.parklanmaDagilim || {};
    return depoPozlar.reduce((s, p) => s + Math.max(0, Math.round(dz[parkAnahtar(p)] ?? 0)), 0);
  }, [isletme.parklanmaDagilim, depoPozlar]);
  const filo = Math.min(nMax, parkToplam > 0 ? parkToplam : filoTek);
  const hedefHeadwaySn = Math.max(1, isletme.seferHeadwayDk * 60);
  const ulasilanHeadwaySn = maks.gecerli ? maks.cevrimSuresi / Math.max(1, filo) : hedefHeadwaySn;
  const depotPlan = useMemo(() => planDepotDispatch(line, ulasilanHeadwaySn), [line, ulasilanHeadwaySn]);
  // Bu VİTRİN sayfasında depo/parklanma ŞART DEĞİL: depo yoksa trenler hat başından
  // (origin) dağıtılır → 2. Etap gibi deposuz hatlar da "hazırlanıyor"da takılmaz.
  const simHazir = !!isletme.filoOnaylandi && filo > 0 && line.stations.length > 1;

  const gidisOrigins = useMemo(() => {
    const depolar = depotPlan.depots;
    if (depolar.length === 0) return undefined;
    const dz = isletme.parklanmaDagilim;
    if (dz && depolar.some((d) => (dz[parkAnahtar(d.position)] ?? 0) > 0)) {
      const out: number[] = [];
      depolar.forEach((d) => { const n = Math.max(0, Math.round(dz[parkAnahtar(d.position)] ?? 0)); for (let k = 0; k < n; k++) out.push(d.position); });
      return out.length > 0 ? out.slice(0, filo) : Array.from({ length: filo }, (_, k) => depolar[k % depolar.length].position);
    }
    return Array.from({ length: filo }, (_, k) => depolar[k % depolar.length].position);
  }, [depotPlan, filo, isletme.parklanmaDagilim]);
  const canliGidis = useMemo(
    () => simulateSignalled(line, stockSim, { headway: ulasilanHeadwaySn, count: filo, blocked: ariza, origins: gidisOrigins, sinyaller: sinyalSimKonum }),
    [line, stockSim, ulasilanHeadwaySn, filo, gidisOrigins, ariza, sinyalSimKonum],
  );
  const donusSim = useMemo(
    () => simulateSignalled(reverseLine, stockSim, { headway: ulasilanHeadwaySn, count: filo, sinyaller: sinyalSimKonum.map((p) => reverseLine.length - p) }),
    [reverseLine, stockSim, ulasilanHeadwaySn, filo, sinyalSimKonum],
  );
  const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSon = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopY = useMemo(() => loopYorunge(line, reverseLine, stockSim, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon }), [line, reverseLine, stockSim, peronBas, peronSon]);
  const dagitim = useMemo(() => {
    const orn = loopY.ornekler;
    const sToT = (hedefS: number) => { let en = 0, bd = Infinity; for (const o of orn) { const dd = Math.abs(o.s - hedefS); if (dd < bd) { bd = dd; en = o.t; } } return en; };
    // VİTRİN dağıtımı — SADE ve TEK TİP: bütün tramvaylar AYNI başlangıç noktasından
    // (depo/başlangıç terminali), AYNI yönde (gidiş, alt şerit), SIRAYLA (headway aralığıyla)
    // yola çıkar; her biri tam turu (gidiş→dönüş) yapıp sırayla çıktığı yere geri döner.
    // Ters/karşı-şerit başlangıcı YOK → "ikinci tren karşı hatta geçip çıkıyor" davranışı biter.
    const origins = gidisOrigins ?? [];
    return Array.from({ length: filo }, (_, k) => {
      const parkPos = origins.length > 0 ? origins[k % origins.length] : 0;
      return { parkPos, gidis: true, dispatchT: k * ulasilanHeadwaySn, startPhase: sToT(Math.min(loopY.L, parkPos)) };
    });
  }, [gidisOrigins, filo, loopY, ulasilanHeadwaySn]);
  const loopVeri = useMemo(() => ({ ...loopY, count: filo, offset: loopY.periyot / Math.max(1, filo), dagitim }), [loopY, filo, dagitim]);

  return {
    network, route, line, canliGidis, donusSim, loopVeri, depotPlan, hatOzellik, ariza, arizaToggle,
    simHazir, filo, ulasilanHeadwaySn, trainLen: stock.length,
    terminalBas: isletme.terminalBas, terminalSon: isletme.terminalSon,
    tersMod: isletme.tersMod ?? "kapali", patchIsletme, hatAdi: meta.hatAdi, projeAdi: meta.projeAdi,
  };
}

// Tren üstü rozet açıklamaları (mobil-uyumlu).
const ROZETLER: { s: string; ad: string }[] = [
  { s: "→", ad: "seyir (blok içinde ilerliyor)" },
  { s: "↗", ad: "hızlanma (kalkış / hız artışı)" },
  { s: "⤵", ad: "hız kısıtı (makas / geçit / eğim yavaşlaması)" },
  { s: "⏸", ad: "istasyon duruşu (yolcu iniş-biniş)" },
  { s: "🔄", ad: "terminal dönüşü (uçta turnback)" },
];

/** QR'dan gelen ziyaretçi için sade, mobil tam ekran canlı ağ simülasyonu sayfası. */
export function CanliAgSayfa() {
  const { t } = useDil();
  const p = useCanliAgProps();
  const [acikLegend, setAcikLegend] = useState(false);
  // Ters işletme bu sayfada DAİMA kapalı başlar (yerel kontrol); ziyaretçi mod butonlarıyla açar.
  const [tm, setTm] = useState<TersMod>("kapali");

  if (!p.simHazir) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="text-3xl">🚋</div>
        <h1 className="mt-3 text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Canlı Ağ Simülasyonu hazırlanıyor…", en: "Live Network Simulation is loading…", de: "Live-Netz-Simulation wird vorbereitet…" })}</h1>
        <p className="mt-2 text-sm" style={{ color: brand.muted }}>
          {t({ tr: "Bu hat için filo/parklanma verisi bulunamadı. Bağlantı bir hattın canlı simülasyonuna gitmelidir (rapor QR’ı). Sorun sürerse hattı uygulamada açıp filoyu onaylayın.", en: "No fleet/parking data found for this line. The link should point to a line's live simulation (report QR). If the problem persists, open the line in the app and confirm the fleet.", de: "Für diese Strecke wurden keine Flotten-/Abstelldaten gefunden. Der Link sollte zur Live-Simulation einer Strecke führen (Bericht-QR). Bleibt das Problem, öffnen Sie die Strecke in der App und bestätigen Sie die Flotte." })}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ background: brand.paper }}>
      {/* Üst şerit — sade başlık + rozet açıklaması aç/kapa (mobil dostu) */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur"
        style={{ borderColor: brand.border, background: "rgba(255,255,255,0.9)" }}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" style={{ color: brand.ink }}>{p.hatAdi || p.projeAdi || t({ tr: "Canlı Ağ Simülasyonu", en: "Live Network Simulation", de: "Live-Netz-Simulation" })}</div>
          <div className="text-[11px]" style={{ color: brand.muted }}>{t({ tr: "Canlı Ağ Simülasyonu", en: "Live Network Simulation", de: "Live-Netz-Simulation" })} · {p.filo} {t({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })}</div>
        </div>
        <button type="button" onClick={() => setAcikLegend((v) => !v)}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>
          {acikLegend ? t({ tr: "İşaretleri gizle", en: "Hide markers", de: "Markierungen ausblenden" }) : t({ tr: "İşaretler ℹ️", en: "Markers ℹ️", de: "Markierungen ℹ️" })}
        </button>
      </header>

      {/* Rozet açıklaması — tren üstündeki işaretler ne demek (mobilde katlanır) */}
      {acikLegend && (
        <div className="border-b px-3 py-2 text-xs" style={{ borderColor: brand.border, background: "#F7F9FA", color: brand.inkSoft }}>
          <div className="mb-1 font-semibold" style={{ color: brand.ink }}>{t({ tr: "Trenin üstündeki işaretler", en: "Markers above the train", de: "Markierungen über dem Zug" })}</div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {ROZETLER.map((r) => (
              <li key={r.s} className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: brand.ink, color: "#fff" }}>{r.s}</span>
                <span>{r.ad}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 leading-snug">
            {t({ tr: "Bir trene", en: "Tap a train", de: "Auf einen Zug tippen" })} <b>{t({ tr: "dokun", en: "", de: "" })}</b> {t({ tr: "→ bir tam turda hangi nedene kaç saniye harcadığının dökümü açılır.", en: "→ a breakdown of how many seconds are spent on each cause over one full round opens.", de: "→ eine Aufschlüsselung, wie viele Sekunden pro Ursache in einer vollen Runde anfallen, öffnet sich." })}
            {" "}{t({ tr: "Bir", en: "Tap a", de: "Auf einen" })} <b>{t({ tr: "bloğa dokun", en: "block", de: "Block tippen" })}</b> {t({ tr: "→ o bloğu", en: "→ makes that block", de: "→ macht diesen Block" })} <b>{t({ tr: "arızalı", en: "faulty", de: "gestört" })}</b> {t({ tr: "yaparsın; trenler arızalı bloğun gerisinde güvenle kuyruklanır (arkadan gelen önündekine çarpmaz — fail-safe), geçmiş trenler akmaya devam eder; tekrar dokununca arıza kalkar ve herkes kaldığı yerden sürer.", en: "; trains queue safely behind the faulty block (a following train does not hit the one ahead — fail-safe), trains that already passed keep flowing; tap again and the fault clears and everyone resumes from where they stopped.", de: "; Züge stauen sich sicher hinter dem gestörten Block (ein nachfolgender Zug fährt nicht auf den vorderen auf — Fail-Safe), bereits vorbeigefahrene Züge fließen weiter; erneut tippen und die Störung ist behoben, alle fahren an ihrer Stelle weiter." })}
            {" "}{t({ tr: "Alttaki", en: "Use the", de: "Mit" })} <b>{t({ tr: "▶ Oynat", en: "▶ Play", de: "▶ Abspielen" })}</b>, <b>{t({ tr: "hız", en: "speed", de: "Geschwindigkeit" })}</b> {t({ tr: "ve", en: "and", de: "und" })} <b>{t({ tr: "zaman çubuğu", en: "time bar", de: "Zeitleiste" })}</b> {t({ tr: "ile oynat/durdur;", en: "below to play/stop;", de: "unten abspielen/anhalten;" })} <b>{t({ tr: "Ters işletme", en: "Reverse operation", de: "Kehrbetrieb" })}</b>
            {" "}{t({ tr: "kapalı gelir, istersen üstteki butonlarla açabilirsin.", en: "starts off, you can enable it with the buttons above if you wish.", de: "startet ausgeschaltet, Sie können ihn bei Bedarf mit den Schaltflächen oben aktivieren." })}
          </div>
        </div>
      )}

      {/* Tam genişlik canlı sim — ters işletme KAPALI gelir; mod/hız/oynat LiveNetwork içinde.
          Mobil okunurluk (SVG'yi yatay kaydırma) LiveNetwork'ün KENDİ içinde çözülür —
          böylece yalnız şema kayar, oynat/hız/zaman çubuğu tam genişlik kalır. */}
      <div className="px-2 py-3 sm:px-4">
        <div className="mb-1 text-center text-[11px] sm:hidden" style={{ color: brand.muted }}>
          {t({ tr: "şemayı yana kaydırabilirsin →", en: "you can scroll the diagram sideways →", de: "Sie können das Schema seitlich scrollen →" })}
        </div>
        {/* Blok tıklaması AÇIK: arıza artık döngü İÇİNDE ele alınıyor (motor değişmez,
            ışınlanma/donma yok) → ziyaretçi bir bloğa dokunup arıza yaratabilir, trenlerin
            arızalı bloğun gerisinde güvenle kuyruklanmasını izler; tekrar dokununca kalkar. */}
        <LiveNetwork
          autoOynat network={p.network} route={p.route} line={p.line} blocks={p.canliGidis.blocks}
          up={p.canliGidis.trains} down={p.donusSim.trains} tMax={Math.max(p.canliGidis.tMax, p.donusSim.tMax)}
          trainLen={p.trainLen} faultBlocks={p.ariza} onBlockClick={p.arizaToggle} depots={p.depotPlan.depots}
          features={p.hatOzellik} loop={p.loopVeri} terminalBas={p.terminalBas} terminalSon={p.terminalSon}
          tersMod={tm} onTersMod={setTm} />
      </div>
    </div>
  );
}
