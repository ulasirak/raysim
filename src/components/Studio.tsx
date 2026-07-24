"use client";

// raysim — interaktif çalışma alanı (Faz 1 editörü + Firebase senaryolar).
// Ağ + araç düzenlenir; her değişiklikte flattenRoute→simulate→paneller anında güncellenir.
// Senaryolar Firestore'a kaydedilir/yüklenir. İstasyon ekle/sil grafı düzenler.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RailNetwork, RollingStock, RailEdge, Route } from "@/lib/anaray/types";
import { flattenRoute, ringlerdenSebeke } from "@/lib/anaray/network";
import { addStationOnEdge, removeStation } from "@/lib/anaray/edit";
import { simulate } from "@/lib/anaray/sim";
import { simulateSignalled, reverseRoute, fleetSize, monteCarlo, type MonteCarloResult } from "@/lib/anaray/signalling";
import { simulateSingleTrack } from "@/lib/anaray/singletrack";
import { computeEnergy } from "@/lib/anaray/energy";
import { araclar, varsayilanArac } from "@/lib/anaray/vehicles";
import { kmh, km, sure, saat } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { isFirebaseConfigured, getAuthInstance } from "@/lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { saveScenario, listScenarios, loadScenario, deleteScenario, type ScenarioMeta } from "@/lib/scenarios";
import { useSimConfig, useProje } from "@/components/SimConfigProvider";
import { LiveNetwork } from "@/components/LiveNetwork";
import { NetworkDiagram } from "@/components/NetworkDiagram";
import { TimeDistanceChart } from "@/components/TimeDistanceChart";
import { SpeedProfileChart } from "@/components/SpeedProfileChart";
import { TrainAnimation } from "@/components/TrainAnimation";
import { TrainGraphChart } from "@/components/TrainGraphChart";

const KMH = 1 / 3.6;

// Proje hattı boşsa (kullanıcı Ringler'de tüm hücreleri sildiyse) motorlar çökmesin
// diye geçerli ama boş bir iskelet; ekranda uyarı gösterilir.
const BOS_SEBEKE: RailNetwork = {
  id: "sebeke_bos",
  name: "Hat tanımlı değil",
  nodes: [
    { id: "bos_a", name: "—", type: "istasyon", x: 60, y: 70, dwell: 0 },
    { id: "bos_b", name: "—", type: "istasyon", x: 760, y: 70, dwell: 0 },
  ],
  edges: [{ id: "bos_e", from: "bos_a", to: "bos_b", length: 1000, segments: [{ start: 0, end: 1000, vmax: 40 * KMH, gradient: 0 }] }],
};
const BOS_ROTA: Route = { id: "rota_bos", name: "—", edgeIds: ["bos_e"], startNodeId: "bos_a" };

export function Studio() {
  const { cfg } = useSimConfig();
  const { rings, meta } = useProje();

  // Sefer modülünün hattı = PAYLAŞILAN proje hattı (Ringler/Tam Hat/Belgeler ile
  // aynı kaynak). Ring zinciri graf şebekesine çevrilir; ayrı örnek şebeke yok.
  const proje = useMemo(
    () => ringlerdenSebeke(rings, cfg, meta.hatAdi || "Proje Hattı"),
    [rings, cfg, meta.hatAdi]
  );

  const [network, setNetwork] = useState<RailNetwork>(() => proje?.network ?? BOS_SEBEKE);
  const [stock, setStock] = useState<RollingStock>(varsayilanArac);
  const [route, setRoute] = useState<Route>(() => proje?.route ?? BOS_ROTA);
  // Yerel düzenleme yapıldıysa proje hattı değişince üzerine yazma (senaryo denemesi
  // korunur); yapılmadıysa yeni hat otomatik yansısın.
  const [duzenlendi, setDuzenlendi] = useState(false);
  const [sonProje, setSonProje] = useState(proje);
  if (proje !== sonProje) {
    // React'in "render sırasında durum ayarla" deseni (effect'te set-state yerine).
    setSonProje(proje);
    if (!duzenlendi && proje) {
      setNetwork(proje.network);
      setRoute(proje.route);
    }
  }
  const [selEdge, setSelEdge] = useState<string>("");
  const [headwayDk, setHeadwayDk] = useState(() => Math.round((cfg.headway / 60) * 2) / 2);
  const [seferSayisi, setSeferSayisi] = useState(6);
  const [blockLen, setBlockLen] = useState(() => cfg.blokMaxUzunluk);
  const [turnaroundDk, setTurnaroundDk] = useState(3);
  const [ariza, setAriza] = useState<number[]>([]); // dispatcher: arızalı bloklar (gidiş hattı)
  const [yon, setYon] = useState<"gidis" | "donus" | "ikisi">("gidis");
  const [meanEntry, setMeanEntry] = useState(30);
  const [meanDwell, setMeanDwell] = useState(5);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);
  // null = varsayılan (tüm ara istasyonlar kruvasman); hat değişince kendini uyarlar.
  const [passingIds, setPassingIds] = useState<string[] | null>(null);

  const { line, result } = useMemo(() => {
    const l = flattenRoute(network, route);
    return { line: l, result: simulate(l, stock, 0.5) };
  }, [network, stock, route]);

  const enerji = useMemo(() => computeEnergy(line, stock, result), [line, stock, result]);

  const reverseLine = useMemo(() => flattenRoute(network, reverseRoute(route)), [network, route]);

  const gidisSim = useMemo(
    () => simulateSignalled(line, stock, { headway: headwayDk * 60, count: seferSayisi, maxBlockLen: blockLen, blocked: ariza }),
    [line, stock, headwayDk, seferSayisi, blockLen, ariza]
  );
  const arizaToggle = (i: number) => setAriza((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]));
  const donusSim = useMemo(
    () => simulateSignalled(reverseLine, stock, { headway: headwayDk * 60, count: seferSayisi, maxBlockLen: blockLen }),
    [reverseLine, stock, headwayDk, seferSayisi, blockLen]
  );
  const filo = useMemo(
    () => fleetSize(gidisSim.baseTime, donusSim.baseTime, turnaroundDk * 60, headwayDk * 60),
    [gidisSim.baseTime, donusSim.baseTime, turnaroundDk, headwayDk]
  );

  const passingEff = useMemo(
    () => passingIds ?? line.stations.slice(1, -1).map((s) => s.id),
    [passingIds, line]
  );

  const stSim = useMemo(() => {
    const passing = line.stations.filter((s) => passingEff.includes(s.id)).map((s) => s.position);
    return simulateSingleTrack(line, reverseLine, stock, {
      headway: headwayDk * 60, upCount: seferSayisi, downCount: seferSayisi, passing,
    });
  }, [line, reverseLine, stock, headwayDk, seferSayisi, passingEff]);

  const monteCarloCalistir = () => {
    setMcRunning(true);
    // Ağır hesap; "hesaplanıyor" görünsün diye bir sonraki tik'e ertele.
    setTimeout(() => {
      const r = monteCarlo(
        line, stock,
        { headway: headwayDk * 60, count: seferSayisi, maxBlockLen: blockLen },
        { trials: 150, meanEntry, meanDwell, threshold: 120 }
      );
      setMc(r);
      setMcRunning(false);
    }, 20);
  };

  // — güncelleyiciler —
  // Hattı yerel olarak değiştiren her işlem "senaryo denemesi" sayılır: proje hattı
  // sonradan değişse bile üzerine yazılmaz (kullanıcı ↺ ile geri döner).
  const patchStock = (p: Partial<RollingStock>) => { setDuzenlendi(true); setStock((s) => ({ ...s, ...p })); };
  const patchNode = (id: string, p: Partial<{ name: string; dwell: number }>) => {
    setDuzenlendi(true);
    setNetwork((n) => ({ ...n, nodes: n.nodes.map((nd) => (nd.id === id ? { ...nd, ...p } : nd)) }));
  };
  const patchSegment = (edgeId: string, i: number, p: Partial<{ vmax: number; gradient: number }>) => {
    setDuzenlendi(true);
    setNetwork((n) => ({
      ...n,
      edges: n.edges.map((e) =>
        e.id === edgeId ? { ...e, segments: e.segments.map((s, j) => (j === i ? { ...s, ...p } : s)) } : e
      ),
    }));
  };
  const istasyonEkle = (edgeId: string) => {
    const r = addStationOnEdge(network, route, edgeId, "Yeni İstasyon");
    setDuzenlendi(true);
    setNetwork(r.network);
    setRoute(r.route);
  };
  const istasyonSil = (nodeId: string) => {
    const r = removeStation(network, route, nodeId);
    setDuzenlendi(true);
    setNetwork(r.network);
    setRoute(r.route);
  };
  /** Yerel denemeyi bırak, paylaşılan proje hattına dön. */
  const sifirla = () => {
    setDuzenlendi(false);
    setStock(varsayilanArac);
    setPassingIds(null);
    if (proje) {
      setNetwork(proje.network);
      setRoute(proje.route);
    }
  };

  const nodeById = Object.fromEntries(network.nodes.map((n) => [n.id, n]));
  const routeEdges = route.edgeIds
    .map((id) => network.edges.find((e) => e.id === id))
    .filter(Boolean) as RailEdge[];
  const secili = routeEdges.some((e) => e.id === selEdge) ? selEdge : routeEdges[0]?.id ?? "";

  const vmax = Math.max(...result.points.map((p) => p.v));
  const ortHiz = line.length / result.totalTime;
  const durusSuresi = line.stations.reduce((a, s) => a + s.dwell, 0);
  const teknikHiz = line.length / (result.totalTime - durusSuresi || 1);
  const stationById = Object.fromEntries(line.stations.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Rapor başlığı */}
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Sefer Simülasyon Raporu</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{network.name}</h1>
          <div className="mt-1 text-xs" style={{ color: brand.muted }}>
            {duzenlendi
              ? <span style={{ color: CK.amber }}>▲ Yerel senaryo denemesi — proje hattından ayrıldı.</span>
              : <>Kaynak: <b>paylaşılan proje hattı</b> ({line.stations.length} durak · {km(line.length)} km) — <Link href="/ringler" className="underline">Ringler</Link> modülünden düzenlenir.</>}
          </div>
        </div>
        {duzenlendi && (
          <button onClick={sifirla} className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
            ↺ Proje hattına dön
          </button>
        )}
      </div>

      {!proje && (
        <div className="mb-6 rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.badBgSoft, borderColor: brand.red, color: brand.ink }}>
          ⚠ Proje hattı boş — <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link> modülünden durak-arası hücre ekleyin.
          Aşağıdaki değerler yer tutucudur.
        </div>
      )}

      {/* Canlı ağ simülasyonu (kahraman) */}
      <Panel baslik="Canlı Ağ Simülasyonu" aciklama="Tüm trenler (gidiş + dönüş) aynı anda hat üzerinde hareket eder; işgal edilen bloklar canlı kırmızıya döner. Dispatcher: gidiş şeridindeki bir sinyale tıkla → o blok arızalanır, trenler arkasında kuyruklanır. Oynat ▶">
        <LiveNetwork network={network} route={route} line={line} blocks={gidisSim.blocks}
          up={gidisSim.trains} down={donusSim.trains} tMax={Math.max(gidisSim.tMax, donusSim.tMax)} trainLen={stock.length}
          faultBlocks={ariza} onBlockClick={arizaToggle} />
        {ariza.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span style={{ color: brand.red }}>⚠ {ariza.length} blok arızalı (gidiş) — trenler kuyruklanıyor.</span>
            <button onClick={() => setAriza([])} className="rounded border px-2 py-1 font-medium" style={{ borderColor: brand.border, color: brand.ink }}>Arızayı temizle</button>
          </div>
        )}
      </Panel>

      {/* Senaryolar (Firebase) */}
      <div className="mt-6" />
      <SenaryoPaneli network={network} stock={stock} route={route}
        onLoad={(d) => { setDuzenlendi(true); setNetwork(d.network); setStock(d.stock); setRoute(d.route); }} />

      {/* EDİTÖR */}
      <div className="mt-6">
        <Panel baslik="Düzenle" aciklama="Değişiklikler anında simülasyona yansır.">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Araç */}
            <div>
              <SubBaslik>Çeken Araç</SubBaslik>
              <select
                value={araclar.some((a) => a.id === stock.id) ? stock.id : ""}
                onChange={(e) => {
                  const v = araclar.find((a) => a.id === e.target.value);
                  if (v) setStock({ ...v });
                }}
                className="mb-3 w-full rounded border px-2 py-1 text-sm"
                style={{ borderColor: brand.border, color: brand.ink }}
              >
                {!araclar.some((a) => a.id === stock.id) && <option value="">Özel araç</option>}
                {araclar.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Num label="Azami Hız" suffix="km/h" step={5} value={round(kmh(stock.maxSpeed))} onChange={(v) => patchStock({ maxSpeed: v * KMH })} />
                <Num label="Güç" suffix="kW" step={25} value={round(stock.power / 1000)} onChange={(v) => patchStock({ power: v * 1000 })} />
                <Num label="Kütle" suffix="t" step={1} value={round(stock.mass / 1000)} onChange={(v) => patchStock({ mass: v * 1000 })} />
                <Num label="Çekiş" suffix="kN" step={2} value={round(stock.startingTractiveEffort / 1000)} onChange={(v) => patchStock({ startingTractiveEffort: v * 1000 })} />
                <Num label="Fren" suffix="m/s²" step={0.1} value={round(stock.maxBraking, 1)} onChange={(v) => patchStock({ maxBraking: v })} />
              </div>
            </div>

            {/* İstasyonlar */}
            <div>
              <SubBaslik>İstasyonlar</SubBaslik>
              <div className="flex flex-col gap-2">
                {line.stations.map((st, i) => {
                  const node = nodeById[st.id];
                  const istasyon = node?.type === "istasyon";
                  const silinebilir = i > 0 && i < line.stations.length - 1;
                  return (
                    <div key={st.id} className="flex items-center gap-2">
                      <input value={st.name} onChange={(e) => patchNode(st.id, { name: e.target.value })}
                        className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                      <span className="font-mono text-xs" style={{ color: brand.faint }}>{km(st.position)}</span>
                      {istasyon ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={st.dwell} min={0} step={5}
                            onChange={(e) => patchNode(st.id, { dwell: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-14 rounded border px-1 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                          <span className="text-xs" style={{ color: brand.muted }}>sn</span>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: brand.faint }}>hat başı</span>
                      )}
                      {silinebilir ? (
                        <button onClick={() => istasyonSil(st.id)} title="İstasyonu sil"
                          className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                      ) : (
                        <span className="w-6" />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* İstasyon ekle */}
              <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: brand.border }}>
                <select value={secili} onChange={(e) => setSelEdge(e.target.value)}
                  className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                  {routeEdges.map((e) => (
                    <option key={e.id} value={e.id}>
                      {nodeById[e.from]?.name} → {nodeById[e.to]?.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => secili && istasyonEkle(secili)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90" style={{ background: brand.ink }}>
                  ＋ Ortasına istasyon ekle
                </button>
              </div>
            </div>

            {/* Segmentler */}
            <div>
              <SubBaslik>Hız Limiti & Eğim</SubBaslik>
              <div className="flex flex-col gap-2">
                {routeEdges.map((e) => (
                  <div key={e.id} className="rounded border p-2" style={{ borderColor: brand.border }}>
                    <div className="mb-1 text-xs font-medium" style={{ color: brand.inkSoft }}>
                      {nodeById[e.from]?.name} → {nodeById[e.to]?.name}
                    </div>
                    {e.segments.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 text-xs" style={{ color: brand.faint }}>{e.segments.length > 1 ? `#${i + 1}` : ""}</span>
                        <input type="number" step={5} value={round(kmh(s.vmax))} onChange={(ev) => patchSegment(e.id, i, { vmax: (parseFloat(ev.target.value) || 0) * KMH })}
                          className="w-16 rounded border px-1 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                        <span className="text-xs" style={{ color: brand.muted }}>km/h</span>
                        <input type="number" step={1} value={round(s.gradient)} onChange={(ev) => patchSegment(e.id, i, { gradient: parseFloat(ev.target.value) || 0 })}
                          className="ml-auto w-16 rounded border px-1 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                        <span className="text-xs" style={{ color: brand.muted }}>‰</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Hat şeması */}
      <div className="mt-6">
        <Panel baslik="Hat Şeması" aciklama="Seçili rota (kalın); istasyon adları üstte, kilometre altta. Rota dışı kollar (varsa) soluk çizilir.">
          <NetworkDiagram network={network} route={route} line={line} />
        </Panel>
      </div>

      {/* Özet künye */}
      <section className="mt-6 overflow-hidden rounded-lg border bg-white" style={{ borderColor: brand.border }}>
        <div className="grid grid-cols-2 divide-x divide-y divide-[#DCE1E7] sm:grid-cols-3 lg:grid-cols-6">
          <Field etiket="Hat Uzunluğu" deger={`${km(line.length)} km`} />
          <Field etiket="Toplam Süre" deger={sure(result.totalTime)} alt="duruşlar dahil" />
          <Field etiket="Seyahat Hızı" deger={`${kmh(ortHiz).toFixed(1)}`} birim="km/h" alt="bekleme dahil" />
          <Field etiket="Teknik Hız" deger={`${kmh(teknikHiz).toFixed(1)}`} birim="km/h" alt="bekleme hariç" />
          <Field etiket="Azami Hız" deger={`${kmh(vmax).toFixed(0)}`} birim="km/h" />
          <Field etiket="Durak" deger={`${result.stationEvents.length}`} alt={`${sure(durusSuresi)} bekleme`} />
        </div>
      </section>

      {/* Enerji & güç */}
      <section className="mt-6">
        <Panel baslik="Enerji & Güç" aciklama="Tek sefer enerji dengesi — çekiş verimi %85, rejeneratif geri kazanım %30, yardımcı yük 15 kW.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat etiket="Net Enerji" deger={enerji.netKWh.toFixed(1)} alt="kWh / sefer" />
            <MiniStat etiket="Özgül Tüketim" deger={enerji.perKm.toFixed(2)} alt="kWh / km" />
            <MiniStat etiket="Çekiş" deger={enerji.tractionKWh.toFixed(1)} alt="kWh (şebekeden)" />
            <MiniStat etiket="Rejeneratif" deger={`−${enerji.regenKWh.toFixed(1)}`} alt="kWh geri kazanım" />
          </div>
        </Panel>
      </section>

      {/* Grafikler + animasyon */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel baslik="Mesafe–Zaman Diyagramı" aciklama="Çizginin eğimi hızı, düz kısımlar durakta beklemeyi gösterir.">
            <TimeDistanceChart line={line} result={result} />
          </Panel>
          <Panel baslik="Hız Profili" aciklama="Hat boyunca fiili hız (mürekkep) ve hız limiti (kırmızı kesikli).">
            <SpeedProfileChart line={line} result={result} />
          </Panel>
        </div>
        <div className="lg:col-span-1">
          <Panel baslik="Canlı Animasyon" aciklama="Treni hat üzerinde oynatın.">
            <TrainAnimation line={line} result={result} stock={stock} />
          </Panel>
        </div>
      </div>

      {/* Sefer sıklığı, sinyalizasyon & kapasite */}
      <section className="mt-6">
        <Panel baslik="Sefer Sıklığı, Sinyalizasyon & Kapasite" aciklama="Sabit blok sinyal sistemi + çift yön. Tren dolu bloğa giremez (kırmızı sinyalde durur); ince yatay çizgiler sinyal bloklarıdır.">
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Num label="Sefer Aralığı" suffix="dk" step={0.5} value={headwayDk} onChange={(v) => setHeadwayDk(Math.max(0.5, v))} />
            <Num label="Sefer Sayısı" suffix="tren" step={1} value={seferSayisi} onChange={(v) => setSeferSayisi(Math.max(1, Math.round(v)))} />
            <Num label="Blok Uzunluğu" suffix="m" step={100} value={blockLen} onChange={(v) => setBlockLen(Math.max(100, Math.round(v)))} />
            <Num label="Dönüş Bekleme" suffix="dk" step={0.5} value={turnaroundDk} onChange={(v) => setTurnaroundDk(Math.max(0, v))} />
          </div>

          {/* Yön seçimi + durum */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              {(["gidis", "donus", "ikisi"] as const).map((y) => (
                <button key={y} onClick={() => setYon(y)} className="rounded px-2.5 py-1 text-xs font-medium transition"
                  style={yon === y ? { background: brand.ink, color: "#fff" } : { background: CK.track, color: brand.inkSoft }}>
                  {y === "gidis" ? "Gidiş" : y === "donus" ? "Dönüş" : "İkisi"}
                </button>
              ))}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              {gidisSim.anyDelay ? (
                <span style={{ color: brand.red }}>⚠ Bu aralıkta trenler birbirini bekliyor — en fazla {sure(gidisSim.maxDelay)} gecikme.</span>
              ) : (
                <span style={{ color: CK.good }}>✓ Bu aralıkta bekleme yok — trenler serbest akıyor.</span>
              )}
            </div>
          </div>

          {/* Kapasite / filo çıktıları */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat etiket="Gecikmesiz en sık aralık" deger={sure(gidisSim.minHeadway)} />
            <MiniStat etiket="Sinyal bloğu" deger={`${gidisSim.blocks.length - 1}`} alt={`${blockLen} m/blok`} />
            <MiniStat etiket="Tur süresi" deger={sure(filo.roundTrip)} alt="gidiş-dönüş + bekleme" />
            <MiniStat etiket="Araç ihtiyacı" deger={`${filo.trains} tren`} alt={`${headwayDk} dk arayla`} />
          </div>

          <TrainGraphChart
            line={line}
            blocks={gidisSim.blocks}
            gidis={yon === "donus" ? [] : gidisSim.trains}
            donus={yon === "gidis" ? undefined : donusSim.trains}
            tMax={Math.max(yon === "donus" ? 0 : gidisSim.tMax, yon === "gidis" ? 0 : donusSim.tMax)}
          />
          {yon !== "gidis" && (
            <p className="mt-2 text-xs" style={{ color: brand.muted }}>
              <span style={{ color: CK.orange }}>■</span> Dönüş yönü (Terminal → Merkez). Çift hat varsayımı: yönler bağımsız.
            </p>
          )}
        </Panel>
      </section>

      {/* Tek hat işletmesi (kruvasman) */}
      <section className="mt-6">
        <Panel baslik="Tek Hat İşletmesi (Kruvasman)" aciklama="Tek ray iki yönde paylaşılır; karşı yönler yalnızca kruvasman (geçiş) istasyonlarında karşılaşır. Geçiş istasyonları arası kesimde aynı anda tek tren bulunur.">
          <div className="mb-3">
            <div className="field-label mb-2">Kruvasman (geçiş) istasyonları — uçlar daima geçiş</div>
            <div className="flex flex-wrap gap-2">
              {line.stations.slice(1, -1).map((st) => {
                const on = passingEff.includes(st.id);
                return (
                  <button key={st.id}
                    onClick={() => setPassingIds(on ? passingEff.filter((x) => x !== st.id) : [...passingEff, st.id])}
                    className="rounded-full px-3 py-1 text-xs font-medium transition"
                    style={on ? { background: brand.ink, color: "#fff" } : { background: CK.track, color: brand.inkSoft }}>
                    {on ? "⊕ " : ""}{st.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat etiket="Kesim Sayısı" deger={`${stSim.sections.length - 1}`} alt="geçişler arası" />
            <MiniStat etiket="Karşılaşan Tren" deger={`${stSim.waited}`} alt="bekleyerek geçen" />
            <MiniStat etiket="İşletme Süresi" deger={sure(stSim.tMax)} alt={`${seferSayisi}↑ ${seferSayisi}↓`} />
            <MiniStat etiket="Durum" deger={stSim.deadlock ? "KİLİTLENME" : "Sorunsuz"} />
          </div>
          {stSim.deadlock && (
            <p className="mb-3 text-xs" style={{ color: brand.red }}>
              ⚠ Bu kruvasman düzeni ve tren sayısıyla trafik kilitlendi — daha fazla geçiş istasyonu ekleyin veya sefer sayısını azaltın.
            </p>
          )}

          <TrainGraphChart line={line} blocks={stSim.sections} gidis={stSim.up} donus={stSim.down} tMax={stSim.tMax} />
          <p className="mt-2 text-xs" style={{ color: brand.muted }}>
            <span style={{ color: CK.blue }}>■</span> Gidiş (Merkez → Terminal) · <span style={{ color: CK.orange }}>■</span> Dönüş — çizgilerin kesiştiği nokta = kruvasman (karşılaşma). Kalın yatay çizgiler geçiş istasyonlarıdır.
          </p>
        </Panel>
      </section>

      {/* Monte-Carlo gecikme analizi */}
      <section className="mt-6">
        <Panel baslik="Monte-Carlo Gecikme Analizi (Robustluk)" aciklama="Rastgele giriş gecikmesi + durak sapmalarıyla çok sayıda sefer simüle edilir; birincil gecikmelerin sonraki trenlere yayılımı ölçülür.">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="w-36"><Num label="Ort. Giriş Gecikmesi" suffix="sn" step={5} value={meanEntry} onChange={(v) => setMeanEntry(Math.max(0, v))} /></div>
            <div className="w-36"><Num label="Ort. Durak Sapması" suffix="sn" step={1} value={meanDwell} onChange={(v) => setMeanDwell(Math.max(0, v))} /></div>
            <button onClick={monteCarloCalistir} disabled={mcRunning}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60" style={{ background: brand.ink }}>
              {mcRunning ? "Hesaplanıyor…" : "150 sefer simüle et"}
            </button>
          </div>
          {mc ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat etiket="Dakiklik (≤2 dk)" deger={`%${mc.onTimePct.toFixed(0)}`} alt={`${mc.trials} deneme`} />
                <MiniStat etiket="Ort. Gecikme" deger={sure(mc.meanDelay)} />
                <MiniStat etiket="P90 Gecikme" deger={sure(mc.p90Delay)} alt="%90 bunun altında" />
                <MiniStat etiket="En Kötü" deger={sure(mc.maxDelay)} />
              </div>
              <div className="mt-4">
                <div className="field-label mb-2">Tren sırasına göre ortalama gecikme — yayılım</div>
                <div className="flex h-24 items-end gap-1">
                  {mc.avgByTrain.map((d, i) => {
                    const mx = Math.max(1, ...mc.avgByTrain);
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div className="w-full rounded-t" style={{ height: `${(d / mx) * 100}%`, minHeight: 2, background: brand.red }} title={sure(d)} />
                        <span className="text-[0.6rem]" style={{ color: brand.faint }}>{i + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: brand.muted }}>Analizi başlatmak için butona basın.</p>
          )}
        </Panel>
      </section>

      {/* Sefer tarifesi */}
      <section className="mt-6">
        <Panel baslik="Sefer Tarifesi" aciklama="Simülasyondan hesaplanan varış / kalkış saatleri (00:00 = hareket).">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
                <th className="py-2 font-medium">İstasyon</th>
                <th className="py-2 font-medium">Kilometre</th>
                <th className="py-2 font-medium">Varış</th>
                <th className="py-2 font-medium">Kalkış</th>
                <th className="py-2 font-medium">Bekleme</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <Satir ad={line.stations[0].name} konum={km(0)} varis="—" kalkis={saat(0)} dwell={0} />
              {result.stationEvents.map((ev) => {
                const st = stationById[ev.stationId];
                return (
                  <Satir key={ev.stationId} ad={st.name} konum={km(st.position)} varis={saat(ev.arrival)} kalkis={ev.departure > ev.arrival ? saat(ev.departure) : "—"} dwell={st.dwell} />
                );
              })}
            </tbody>
          </table>
        </Panel>
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        <span className="flex items-center gap-3">
          <span>RaySim · Demiryolu Ağı Simülasyon Sistemi</span>
          <VeritabaniDurumu />
        </span>
        <span className="font-mono">Sürüm 0.2 · tam simülatör</span>
      </footer>
    </div>
  );
}

// ————— Firebase senaryo paneli —————
function SenaryoPaneli({
  network, stock, route, onLoad,
}: {
  network: RailNetwork; stock: RollingStock; route: Route;
  onLoad: (d: { network: RailNetwork; stock: RollingStock; route: Route }) => void;
}) {
  const configured = isFirebaseConfigured();
  // Vitrin (salt-okunur) modu: canlıda kural yazmayı engellediği için Kaydet/Sil
  // gizlenir → ziyaretçi "izin yok" hatası görmez, sadece kayıtlı senaryoları yükler.
  const vitrin = process.env.NEXT_PUBLIC_VITRIN === "1";
  const [ad, setAd] = useState("");
  const [liste, setListe] = useState<ScenarioMeta[]>([]);
  const [mesaj, setMesaj] = useState<{ tip: "ok" | "err" | "info"; metin: string } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  // Yönetici girişi: vitrin modunda yalnız giriş yapan yönetici yazabilir/silebilir.
  const [user, setUser] = useState<User | null>(null);
  const [girisAcik, setGirisAcik] = useState(false);
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const yazabilir = !vitrin || !!user; // yerelde (vitrin kapalı) hep; canlıda yalnız giriş yapınca

  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const girisYap = async () => {
    const auth = getAuthInstance();
    if (!auth) return;
    setMesgul(true); setMesaj(null);
    try {
      await signInWithEmailAndPassword(auth, eposta.trim(), sifre);
      setGirisAcik(false); setSifre("");
      setMesaj({ tip: "ok", metin: "Yönetici girişi yapıldı — kaydet/sil açık." });
    } catch (e) {
      setMesaj({ tip: "err", metin: hataMetni(e) });
    } finally { setMesgul(false); }
  };
  const cikisYap = async () => {
    const auth = getAuthInstance();
    if (auth) await signOut(auth);
  };

  const yenile = async () => {
    try {
      setListe(await listScenarios());
    } catch (e) {
      setMesaj({ tip: "err", metin: hataMetni(e) });
    }
  };

  useEffect(() => {
    // Bağlıysa kayıtlı senaryoları mount'ta bir kez getir. Harici sistemden
    // (Firebase) okuma; setState await sonrası olur, kademeli render tetiklemez.
    if (!configured) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    yenile();
  }, [configured]);

  const kaydet = async () => {
    if (!ad.trim()) { setMesaj({ tip: "info", metin: "Önce bir senaryo adı girin." }); return; }
    setMesgul(true); setMesaj(null);
    try {
      await saveScenario(ad.trim(), { network, stock, route });
      setMesaj({ tip: "ok", metin: `"${ad.trim()}" kaydedildi.` });
      setAd("");
      await yenile();
    } catch (e) {
      setMesaj({ tip: "err", metin: hataMetni(e) });
    } finally { setMesgul(false); }
  };

  const yukle = async (id: string, nm: string) => {
    setMesgul(true); setMesaj(null);
    try {
      const d = await loadScenario(id);
      onLoad(d);
      setMesaj({ tip: "ok", metin: `"${nm}" yüklendi.` });
    } catch (e) {
      setMesaj({ tip: "err", metin: hataMetni(e) });
    } finally { setMesgul(false); }
  };

  const sil = async (id: string) => {
    setMesgul(true); setMesaj(null);
    try {
      await deleteScenario(id);
      await yenile();
    } catch (e) {
      setMesaj({ tip: "err", metin: hataMetni(e) });
    } finally { setMesgul(false); }
  };

  // Vitrinde yayınlanmış senaryo yoksa ve yönetici oturumu da yoksa panelin ziyaretçi
  // için hiçbir anlamı kalmaz ("boş liste + giriş kutusu") → yalnız iğneucu bir
  // yönetici girişi bırakılır, tıklanınca tam panel açılır.
  const bosVitrin = configured && vitrin && liste.length === 0 && !user;
  if (bosVitrin && !girisAcik) {
    return (
      <div className="mt-6 flex justify-end">
        <button onClick={() => setGirisAcik(true)} className="text-xs transition hover:opacity-70" style={{ color: brand.faint }}>
          🔑 Yönetici girişi
        </button>
      </div>
    );
  }

  return (
    <Panel baslik="Senaryolar" aciklama={vitrin ? "Kayıtlı senaryoları yükle (vitrin — salt okunur)." : "Mevcut hattı Firebase'e kaydet, kayıtlıları yükle."}>
      {!configured ? (
        <p className="text-sm" style={{ color: brand.muted }}>
          Firebase yapılandırılmadı — <span className="font-mono">.env.local</span> değerlerini girince kaydet/yükle açılır.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {yazabilir && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Senaryo adı (ör. 3 dk arayla)"
                className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <button onClick={kaydet} disabled={mesgul}
                className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.ink }}>
                {mesgul ? "…" : "Kaydet"}
              </button>
            </div>
          )}

          {liste.length > 0 && (
            <ul className="divide-y rounded border" style={{ borderColor: brand.border }}>
              {liste.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderColor: brand.border }}>
                  <span className="min-w-0 flex-1 truncate" style={{ color: brand.ink }}>{s.name}</span>
                  <button onClick={() => yukle(s.id, s.name)} disabled={mesgul} className="rounded px-2 py-1 text-xs font-medium transition hover:opacity-90 disabled:opacity-50" style={{ background: CK.track, color: brand.inkSoft }}>Yükle</button>
                  {yazabilir && (
                    <button onClick={() => sil(s.id)} disabled={mesgul} title="Sil" className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {vitrin && liste.length === 0 && (
            <p className="text-sm" style={{ color: brand.muted }}>Henüz yayınlanmış senaryo yok.</p>
          )}

          {mesaj && (
            <p className="text-xs" style={{ color: mesaj.tip === "err" ? brand.red : mesaj.tip === "ok" ? CK.good : brand.muted }}>
              {mesaj.metin}
              {mesaj.tip === "err" && (
                <span style={{ color: brand.muted }}> — Firestore Database etkin mi ve kurallar okuma/yazmaya izin veriyor mu?</span>
              )}
            </p>
          )}

          {/* Yönetici girişi — yalnız vitrin modunda anlamlı (yerelde zaten tam yetki) */}
          {vitrin && (
            <div className="mt-1 border-t pt-2" style={{ borderColor: brand.border }}>
              {user ? (
                <div className="flex items-center justify-between text-xs" style={{ color: brand.muted }}>
                  <span>Yönetici: <span className="font-medium" style={{ color: brand.ink }}>{user.email}</span> — kaydet/sil açık</span>
                  <button onClick={cikisYap} className="rounded px-2 py-1 font-medium transition hover:bg-slate-50" style={{ color: brand.inkSoft }}>Çıkış</button>
                </div>
              ) : girisAcik ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} placeholder="E-posta"
                    className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                  <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} placeholder="Şifre"
                    onKeyDown={(e) => { if (e.key === "Enter") girisYap(); }}
                    className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                  <button onClick={girisYap} disabled={mesgul}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.ink }}>
                    {mesgul ? "…" : "Giriş"}
                  </button>
                  <button onClick={() => setGirisAcik(false)} className="rounded px-2 py-1.5 text-xs transition hover:bg-slate-50" style={{ color: brand.muted }}>Vazgeç</button>
                </div>
              ) : (
                <button onClick={() => setGirisAcik(true)} className="text-xs font-medium transition hover:underline" style={{ color: brand.muted }}>
                  🔑 Yönetici girişi (senaryo yayınlamak için)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function hataMetni(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return `Hata: ${m}`;
}

// ————— ortak yardımcılar —————
function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function Num({ label, value, onChange, step, suffix }: { label: string; value: number; onChange: (v: number) => void; step: number; suffix: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input type="number" value={value} step={step} min={0} onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
        <span className="text-xs" style={{ color: brand.muted }}>{suffix}</span>
      </div>
    </label>
  );
}

function SubBaslik({ children }: { children: React.ReactNode }) {
  return <div className="field-label mb-2 border-b pb-1" style={{ borderColor: brand.border }}>{children}</div>;
}

function VeritabaniDurumu() {
  const ok = isFirebaseConfigured();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={ok ? { background: CK.goodBg, color: CK.good } : { background: CK.badBg, color: CK.red }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      Veritabanı: {ok ? "yapılandırıldı" : "yapılandırma bekleniyor"}
    </span>
  );
}

function MiniStat({ etiket, deger, alt }: { etiket: string; deger: string; alt?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>{deger}</div>
      {alt && <div className="text-xs" style={{ color: brand.faint }}>{alt}</div>}
    </div>
  );
}

function Field({ etiket, deger, birim, alt }: { etiket: string; deger: string; birim?: string; alt?: string }) {
  return (
    <div className="bg-white p-4">
      <div className="field-label">{etiket}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold" style={{ color: brand.ink }}>{deger}</span>
        {birim && <span className="text-xs" style={{ color: brand.muted }}>{birim}</span>}
      </div>
      {alt && <div className="mt-0.5 text-xs" style={{ color: brand.faint }}>{alt}</div>}
    </div>
  );
}

function Satir({ ad, konum, varis, kalkis, dwell }: { ad: string; konum: string; varis: string; kalkis: string; dwell: number }) {
  return (
    <tr className="border-b" style={{ borderColor: brand.border }}>
      <td className="py-2 font-sans" style={{ color: brand.ink }}>{ad}</td>
      <td className="py-2" style={{ color: brand.muted }}>{konum}</td>
      <td className="py-2" style={{ color: brand.inkSoft }}>{varis}</td>
      <td className="py-2" style={{ color: brand.red }}>{kalkis}</td>
      <td className="py-2">
        {dwell > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: CK.badBg, color: CK.red }}>⏱ {dwell} sn</span>
        ) : (
          <span style={{ color: brand.faint }}>—</span>
        )}
      </td>
    </tr>
  );
}

function Panel({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
