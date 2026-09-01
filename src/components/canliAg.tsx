"use client";

// raysim — CANLI AĞ SİMÜLASYONU paylaşımlı hesap hook'u + mobil sayfa.
// useCanliAgProps: Studio'nun LiveNetwork'e beslediği aynı deterministik boru hattını
// (ağ→rota→hat→gidiş/dönüş sim→döngü) context'ten hesaplar. CanliAgSayfa: QR'dan gelen
// oturumsuz ziyaretçi için sade, MOBİL-uyumlu tam ekran sim (ters işletme KAPALI gelir).

import { useEffect, useMemo, useState } from "react";
import type { RailNetwork, Route } from "@/lib/anaray/types";
import { flattenRoute, ringlerdenSebeke, hemzeminDuruslari, duruslariEkle, kalkisEkle, hatOzellikleri } from "@/lib/anaray/network";
import { simulate } from "@/lib/anaray/sim";
import { simulateSignalled, reverseRoute, planDepotDispatch, loopYorunge } from "@/lib/anaray/signalling";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import type { TersMod } from "@/lib/anaray/config";
import { brand } from "@/lib/anaray/brand";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { LiveNetwork } from "@/components/LiveNetwork";

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
  const { rings: ringsHam, meta } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  const BLOK_MAXLEN = cfg.blokMaxUzunluk;

  const rings = useMemo(() => dwellUygulanmisRings(ringsHam, stock, isletme), [ringsHam, stock, isletme]);
  const proje = useMemo(() => ringlerdenSebeke(rings, cfg, meta.hatAdi || "Proje Hattı"), [rings, cfg, meta.hatAdi]);
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
    simulate(l, stock, 0.5); // hat modelini ısıt (Studio ile birebir)
    return l;
  }, [network, stock, route, gecitDuruslari, kalkisSu]);
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
  const yolcuVeriVar = !!isletme.istasyonYolcu && Object.keys(isletme.istasyonYolcu).length > 0;
  const tersRapor = useMemo(() => tersIsletmeAnaliz(rings, stock, isletme, cfg, yolcuVeriVar ? "istasyon" : "toplam"), [rings, stock, isletme, cfg, yolcuVeriVar]);
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
    () => simulateSignalled(line, stock, { headway: ulasilanHeadwaySn, count: filo, maxBlockLen: BLOK_MAXLEN, blocked: ariza, origins: gidisOrigins, sinyaller: sinyalSimKonum }),
    [line, stock, ulasilanHeadwaySn, filo, gidisOrigins, ariza, BLOK_MAXLEN, sinyalSimKonum],
  );
  const donusSim = useMemo(
    () => simulateSignalled(reverseLine, stock, { headway: ulasilanHeadwaySn, count: filo, maxBlockLen: BLOK_MAXLEN, sinyaller: sinyalSimKonum.map((p) => reverseLine.length - p) }),
    [reverseLine, stock, ulasilanHeadwaySn, filo, BLOK_MAXLEN, sinyalSimKonum],
  );
  const peronBas = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSon = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopY = useMemo(() => loopYorunge(line, reverseLine, stock, { peronIsgaliBas: peronBas, peronIsgaliSon: peronSon }), [line, reverseLine, stock, peronBas, peronSon]);
  const dagitim = useMemo(() => {
    const orn = loopY.ornekler;
    const sToT = (hedefS: number) => { let en = 0, bd = Infinity; for (const o of orn) { const dd = Math.abs(o.s - hedefS); if (dd < bd) { bd = dd; en = o.t; } } return en; };
    // Depo/parklanma YOK → depo dağıtımı (gidiş/ters + turnback başlangıcı) uygulanamaz;
    // trenler loop üzerine EŞİT yayılır, hepsi gidiş yönünde, hemen dolaşır. Aksi halde ters
    // yön trenleri loop sonundan (turnback) doğar → "çıkar çıkmaz kendi etrafında döner+bekler".
    if (depotPlan.depots.length === 0) {
      const arali = loopY.periyot / Math.max(1, filo);
      return Array.from({ length: filo }, (_, k) => ({ parkPos: 0, gidis: true, dispatchT: 0, startPhase: arali * k }));
    }
    const origins = gidisOrigins ?? [];
    let gKalan = tersRapor ? tersRapor.depoDagilim.gidis : Math.ceil(filo / 2);
    let tKalan = filo - gKalan;
    return Array.from({ length: filo }, (_, k) => {
      const parkPos = origins.length > 0 ? origins[k % origins.length] : 0;
      const wantG = k % 2 === 0;
      let gidis: boolean;
      if (wantG && gKalan > 0) { gKalan--; gidis = true; }
      else if (!wantG && tKalan > 0) { tKalan--; gidis = false; }
      else if (gKalan > 0) { gKalan--; gidis = true; }
      else { tKalan--; gidis = false; }
      const startS = gidis ? Math.min(loopY.L, parkPos) : Math.max(0, loopY.loopLen - parkPos);
      return { parkPos, gidis, dispatchT: k * ulasilanHeadwaySn, startPhase: sToT(startS) };
    });
  }, [gidisOrigins, tersRapor, filo, loopY, ulasilanHeadwaySn, depotPlan]);
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
  const p = useCanliAgProps();
  const [acikLegend, setAcikLegend] = useState(false);
  // Ters işletme bu sayfada DAİMA kapalı başlar (yerel kontrol); ziyaretçi mod butonlarıyla açar.
  const [tm, setTm] = useState<TersMod>("kapali");

  if (!p.simHazir) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="text-3xl">🚋</div>
        <h1 className="mt-3 text-lg font-semibold" style={{ color: brand.ink }}>Canlı Ağ Simülasyonu hazırlanıyor…</h1>
        <p className="mt-2 text-sm" style={{ color: brand.muted }}>
          Bu hat için filo/parklanma verisi bulunamadı. Bağlantı bir hattın canlı simülasyonuna gitmelidir
          (rapor QR&apos;ı). Sorun sürerse hattı uygulamada açıp filoyu onaylayın.
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
          <div className="truncate text-sm font-semibold" style={{ color: brand.ink }}>{p.hatAdi || p.projeAdi || "Canlı Ağ Simülasyonu"}</div>
          <div className="text-[11px]" style={{ color: brand.muted }}>Canlı Ağ Simülasyonu · {p.filo} tramvay</div>
        </div>
        <button type="button" onClick={() => setAcikLegend((v) => !v)}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>
          {acikLegend ? "İşaretleri gizle" : "İşaretler ℹ️"}
        </button>
      </header>

      {/* Rozet açıklaması — tren üstündeki işaretler ne demek (mobilde katlanır) */}
      {acikLegend && (
        <div className="border-b px-3 py-2 text-xs" style={{ borderColor: brand.border, background: "#F7F9FA", color: brand.inkSoft }}>
          <div className="mb-1 font-semibold" style={{ color: brand.ink }}>Trenin üstündeki işaretler</div>
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
            Bir trene <b>dokun</b> → bir tam turda hangi nedene kaç saniye harcadığının dökümü açılır.
            Alttaki <b>▶ Oynat</b>, <b>hız</b> ve <b>zaman çubuğu</b> ile oynat/durdur; <b>Ters işletme</b>
            {" "}kapalı gelir, istersen üstteki butonlarla açabilirsin.
          </div>
        </div>
      )}

      {/* Tam genişlik canlı sim — ters işletme KAPALI gelir; mod/hız/oynat LiveNetwork içinde */}
      <div className="px-2 py-3 sm:px-4">
        {/* Vitrinde blok tıklaması KAPALI (onBlockClick verilmez): blok "arıza"sı döngü
            modunu kapatıp tek-tren sinyal simine düşürüyordu. Ziyaretçi trenlere tıklar. */}
        <LiveNetwork
          autoOynat network={p.network} route={p.route} line={p.line} blocks={p.canliGidis.blocks}
          up={p.canliGidis.trains} down={p.donusSim.trains} tMax={Math.max(p.canliGidis.tMax, p.donusSim.tMax)}
          trainLen={p.trainLen} faultBlocks={[]} depots={p.depotPlan.depots}
          features={p.hatOzellik} loop={p.loopVeri} terminalBas={p.terminalBas} terminalSon={p.terminalSon}
          tersMod={tm} onTersMod={setTm} />
      </div>
    </div>
  );
}
