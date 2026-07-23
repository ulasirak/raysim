"use client";

// türkray — MAKAS BÖLGESİ ANKLAŞMAN görselleştiricisi.
// Belgedeki bölge senaryolarını canlı çalıştırır: rota talepleri gönderilir,
// motor çakışma matriksi + kilit + zamanlayıcılarla işletir; sinyal aspektleri
// (Yeşil/Sarı/Kırmızı/Sönük), makas durumları ve blok doluluğu zaman içinde
// oynatılır. Fail-safe arıza enjekte edilebilir.

import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { sure } from "@/lib/anaray/format";
import { useSimConfig } from "@/components/SimConfigProvider";
import {
  bolgeSeed,
  cakismaMatriksi,
  simuleEtAnklasman,
  type RotaTalebi,
  type SinyalAspekt,
} from "@/lib/anaray/interlocking";

const ASPEKT_RENK: Record<SinyalAspekt, string> = {
  yesil: "#0E7C57",
  sari: "#C79A2E",
  kirmizi: "#C8102E",
  sonuk: "#4A5A6A",
};
const ASPEKT_AD: Record<SinyalAspekt, string> = { yesil: "YEŞİL", sari: "SARI", kirmizi: "KIRMIZI", sonuk: "SÖNÜK" };

export function AnklasmanSim({ initialBolgeId }: { initialBolgeId?: string } = {}) {
  const bolgeler = useMemo(() => bolgeSeed(), []);
  const [bolgeId, setBolgeId] = useState(
    initialBolgeId && bolgeler.some((b) => b.id === initialBolgeId) ? initialBolgeId : bolgeler[0].id
  );
  const topo = useMemo(() => bolgeler.find((b) => b.id === bolgeId)!, [bolgeler, bolgeId]);

  const [trenSayisi, setTrenSayisi] = useState(4);
  const [headwaySn, setHeadwaySn] = useState(20);
  const [faultOn, setFaultOn] = useState(false);
  const [faultAt, setFaultAt] = useState(30);

  // Talepler: trenler headway aralığıyla rotalar arasında round-robin gezer.
  const istekler = useMemo<RotaTalebi[]>(() => {
    const rl = topo.rotalar;
    return Array.from({ length: trenSayisi }, (_, i) => ({
      t: i * headwaySn,
      rotaId: rl[i % rl.length].id,
      trenId: `T${i + 1}`,
    }));
  }, [topo, trenSayisi, headwaySn]);

  const { cfg } = useSimConfig();
  const sonuc = useMemo(
    () => simuleEtAnklasman(topo, istekler, { cfg, ...(faultOn ? { fault: { t: faultAt, sure: 15 } } : {}) }),
    [topo, istekler, faultOn, faultAt, cfg]
  );
  const matriks = useMemo(() => cakismaMatriksi(topo), [topo]);

  // Oynatma
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hiz, setHiz] = useState(8);
  // Senaryo değişince frame'i sıfırla — React'in "render sırasında ayarlama" deseni
  // (parametre değişimine tepki; effect + cascading render tuzağından kaçınır).
  const [prevSonuc, setPrevSonuc] = useState(sonuc);
  if (prevSonuc !== sonuc) {
    setPrevSonuc(sonuc);
    setFrame(0);
    setPlaying(false);
  }
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1 >= sonuc.kareler.length ? (setPlaying(false), f) : f + 1)), 1000 / (hiz * 2));
    return () => clearInterval(id);
  }, [playing, hiz, sonuc.kareler.length]);

  const kare = sonuc.kareler[Math.min(frame, sonuc.kareler.length - 1)];
  const kabuller = sonuc.sonuclar.filter((s) => s.redSebep === "").length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Makas Bölgesi Anklaşman Simülatörü — Dağıtık SIL4 Interlocking</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{topo.ad}</h1>
        </div>
        <select value={bolgeId} onChange={(e) => setBolgeId(e.target.value)} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
          {bolgeler.map((b) => (<option key={b.id} value={b.id}>{b.ad}</option>))}
        </select>
      </div>

      {/* Kontrol */}
      <Panel baslik="Talep Senaryosu" aciklama="Trenler headway aralığıyla rotalar arasında dönerek talep oluşturur. Çakışan rotalar emniyet gereği kuyrukta bekler; çakışmayanlar (matrikste X) paralel kurulur.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Num label="Tren sayısı" suffix="tren" step={1} value={trenSayisi} onChange={(v) => setTrenSayisi(Math.max(1, Math.round(v)))} />
          <Num label="Talep aralığı" suffix="s" step={5} value={headwaySn} onChange={(v) => setHeadwaySn(Math.max(1, v))} />
          <label className="block">
            <span className="field-label">Fail-safe arıza</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={faultOn} onChange={(e) => setFaultOn(e.target.checked)} />
              <span className="text-xs" style={{ color: brand.inkSoft }}>{faultOn ? "aktif" : "kapalı"}</span>
            </div>
          </label>
          {faultOn && <Num label="Arıza anı" suffix="s" step={5} value={faultAt} onChange={(v) => setFaultAt(Math.max(0, v))} />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat etiket="Kabul / talep" deger={`${kabuller} / ${istekler.length}`} />
          <MiniStat etiket="Maks. eşzamanlı rota" deger={`${sonuc.maxEszamanli}`} alt={sonuc.maxEszamanli > 1 ? "paralel kurulum" : "tek tren"} vurgu={sonuc.maxEszamanli > 1 ? "#0E7C57" : brand.ink} />
          <MiniStat etiket="Ort. bekleme" deger={sure(sonuc.ortBekleme)} alt="çakışma kuyruğu" />
          <MiniStat etiket="Throughput" deger={`${sonuc.throughput.toFixed(0)}/sa`} alt="kabul edilen" />
        </div>
      </Panel>

      {/* Canlı durum */}
      <div className="mt-6">
        <Panel baslik="Canlı Bölge Durumu" aciklama="Sinyal aspektleri, makas kilitleri ve blok doluluğu. Oynat ▶">
          <>
              {/* Oynatma çubuğu */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button onClick={() => { if (frame >= sonuc.kareler.length - 1) setFrame(0); setPlaying((p) => !p); }}
                  className="rounded-md px-4 py-1.5 text-sm font-medium text-white" style={{ background: brand.ink }}>
                  {playing ? "⏸ Duraklat" : "▶ Oynat"}
                </button>
                <input type="range" min={0} max={Math.max(0, sonuc.kareler.length - 1)} value={frame} onChange={(e) => setFrame(parseInt(e.target.value))} className="min-w-40 flex-1" style={{ accentColor: brand.red }} />
                <span className="font-mono text-sm tabular-nums" style={{ color: brand.ink }}>{sure(kare?.t ?? 0)}</span>
                <label className="flex items-center gap-1 text-xs" style={{ color: brand.muted }}>
                  hız
                  <select value={hiz} onChange={(e) => setHiz(parseInt(e.target.value))} className="rounded border px-1 py-0.5" style={{ borderColor: brand.border }}>
                    {[2, 4, 8, 16].map((h) => (<option key={h} value={h}>{h}×</option>))}
                  </select>
                </label>
                {kare?.failSafe && <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#3A4A5A", color: "#fff" }}>⚠ FAIL-SAFE — bölge sönük</span>}
              </div>

              {/* Rotalar + sinyaller */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <SubBaslik>Rotalar & Giriş Sinyalleri</SubBaslik>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {topo.rotalar.map((r) => {
                      const asp = kare?.sinyaller[r.sinyal] ?? "kirmizi";
                      const aktif = kare?.aktifRotalar.includes(r.id);
                      return (
                        <div key={r.id} className="flex items-center gap-3 rounded border px-3 py-2" style={{ borderColor: aktif ? ASPEKT_RENK[asp] : brand.border, background: aktif ? ASPEKT_RENK[asp] + "12" : "#fff" }}>
                          <SinyalNokta aspekt={asp} />
                          <span className="font-mono text-sm font-semibold" style={{ color: brand.ink }}>{r.nereden} → {r.nereye}</span>
                          <span className="text-xs" style={{ color: brand.faint }}>{r.id}</span>
                          <span className="ml-auto text-xs font-medium" style={{ color: ASPEKT_RENK[asp] }}>{ASPEKT_AD[asp]}</span>
                          {r.tccGerekli && <span className="rounded px-1.5 py-0.5 text-[0.6rem]" style={{ background: "#EDF0F3", color: brand.muted }}>TCC</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  {/* Makaslar */}
                  <SubBaslik>Makaslar</SubBaslik>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topo.makaslar.map((pm) => {
                      const d = kare?.makaslar[pm] ?? "serbest";
                      const renk = d === "kilitli" ? "#0E7C57" : d === "hareket" ? "#C79A2E" : brand.muted;
                      return (
                        <span key={pm} className="rounded px-2 py-1 text-xs font-medium" style={{ background: renk + "1A", color: renk }} title={d}>
                          {pm} · {d === "kilitli" ? "🔒" : d === "hareket" ? "↻" : "○"}
                        </span>
                      );
                    })}
                  </div>
                  {/* Bloklar */}
                  <div className="mt-3">
                    <SubBaslik>Bloklar (aks sayıcı)</SubBaslik>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {topo.bloklar.map((bs) => {
                        const dolu = kare?.bloklar[bs];
                        return (
                          <span key={bs} className="rounded px-2 py-1 text-xs font-medium" style={{ background: dolu ? brand.red : "#EDF0F3", color: dolu ? "#fff" : brand.muted }}>
                            {bs} {dolu ? "●" : "○"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
          </>
        </Panel>
      </div>

      {/* Çakışma matriksi */}
      <div className="mt-6">
        <Panel baslik="Çakışma Matriksi" aciklama="X = iki rota aynı anda kurulabilir (kesişmiyor) · 0 = mümkün değil (ortak blok/makas ya da emniyet kısıtı). Belgedeki bölge tablolarıyla uyumlu.">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="p-2"></th>
                  {topo.rotalar.map((r) => (<th key={r.id} className="p-2 font-mono font-medium" style={{ color: brand.muted }}>{r.nereden}{r.nereye}</th>))}
                </tr>
              </thead>
              <tbody>
                {topo.rotalar.map((r, i) => (
                  <tr key={r.id}>
                    <td className="p-2 font-mono font-medium" style={{ color: brand.muted }}>{r.nereden}{r.nereye}</td>
                    {topo.rotalar.map((c, j) => (
                      <td key={c.id} className="p-2 text-center font-mono font-semibold"
                        style={{ color: i === j ? brand.faint : matriks[i][j] ? "#0E7C57" : brand.red, background: i === j ? "#F5F6F8" : matriks[i][j] ? "#EAF6EF" : "#FBE9EC" }}>
                        {i === j ? "·" : matriks[i][j] ? "X" : "0"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Sonuç tablosu */}
      <div className="mt-6">
        <Panel baslik="Tren Geçiş Sonuçları" aciklama="Her talebin kabul/bekleme/yeşil/çıkış zamanları. Bekleme = çakışma emniyet kuyruğu.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
                <th className="py-2 font-medium">Tren</th>
                <th className="py-2 font-medium">Rota</th>
                <th className="py-2 font-medium">Talep</th>
                <th className="py-2 font-medium">Kabul</th>
                <th className="py-2 font-medium">Yeşil</th>
                <th className="py-2 font-medium">Çıkış</th>
                <th className="py-2 font-medium">Bekleme</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {sonuc.sonuclar.slice().sort((a, b) => a.talepT - b.talepT).map((s) => (
                <tr key={s.trenId + s.rotaId} className="border-b" style={{ borderColor: brand.border }}>
                  <td className="py-2 font-sans" style={{ color: brand.ink }}>{s.trenId}</td>
                  <td className="py-2" style={{ color: brand.inkSoft }}>{s.rotaId}</td>
                  <td className="py-2" style={{ color: brand.muted }}>{sure(s.talepT)}</td>
                  <td className="py-2" style={{ color: brand.inkSoft }}>{s.kabulT < 0 ? "—" : sure(s.kabulT)}</td>
                  <td className="py-2" style={{ color: "#0E7C57" }}>{s.yesilT < 0 ? "—" : sure(s.yesilT)}</td>
                  <td className="py-2" style={{ color: brand.inkSoft }}>{s.cikisT < 0 ? "—" : sure(s.cikisT)}</td>
                  <td className="py-2">
                    {s.bekleme > 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#FBE9EC", color: brand.red }}>⏱ {sure(s.bekleme)}</span>
                    ) : (
                      <span style={{ color: brand.faint }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        AslanRAY · Dağıtık anklaşman — TCC yalnız istek gönderir, son söz saha SIL4 PLC&apos;sindedir · makas adımı {cfg.makasAdimMax} s · route release {topo.tip === "depo" ? cfg.routeReleaseDepo : cfg.routeReleaseAnahat} s · fail-safe = yalnız bu bölge söner (canlı parametreler: Sistem Merkezi)
      </footer>
    </div>
  );
}

function SinyalNokta({ aspekt }: { aspekt: SinyalAspekt }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: ASPEKT_RENK[aspekt], boxShadow: aspekt === "sonuk" ? "none" : `0 0 8px ${ASPEKT_RENK[aspekt]}88` }}>
      <span className="h-2 w-2 rounded-full" style={{ background: aspekt === "sonuk" ? "#2A3A48" : "#ffffffcc" }} />
    </span>
  );
}

// ————— yardımcılar —————
function Num({ label, value, onChange, step, suffix }: { label: string; value: number; onChange: (v: number) => void; step: number; suffix: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input type="number" value={value} step={step} min={0} onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))} className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
        <span className="text-xs" style={{ color: brand.muted }}>{suffix}</span>
      </div>
    </label>
  );
}
function SubBaslik({ children }: { children: React.ReactNode }) {
  return <div className="field-label border-b pb-1" style={{ borderColor: brand.border }}>{children}</div>;
}
function MiniStat({ etiket, deger, alt, vurgu }: { etiket: string; deger: string; alt?: string; vurgu?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: vurgu ?? brand.ink }}>{deger}</div>
      {alt && <div className="text-xs" style={{ color: brand.faint }}>{alt}</div>}
    </div>
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
