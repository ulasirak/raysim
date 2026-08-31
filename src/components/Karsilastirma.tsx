"use client";

// raysim — SENARYO KARŞILAŞTIRMA (karar destek).
// İki mod:
//   • Projeler: kendi kayıtlı projelerinden 2-4'ünü yan yana kıyasla (Etap1/Etap2/…).
//   • What-if : aktif hattın bir parametresini (headway/blok/doluluk) değiştirip
//               varyasyonları kıyasla (aynı hat, farklı ayar).
// Tüm metrikler simülasyonun kullandığı AYNI çekirdek (maksimumTren / tersIsletmeAnaliz)
// ile hesaplanır → rapor/canlı sim ile birebir tutarlı. Çıktı: karar tablosu + çubuklar
// + nesnel öneri özeti (ekran önizleme; PDF karşılaştırma raporu ayrı adımda).

import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme, useHesap } from "@/components/SimConfigProvider";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { dwellUygulanmisRings } from "@/lib/anaray/yolcu";
import { hatOzellikleri } from "@/lib/anaray/network";
import { loopToHat } from "@/lib/anaray/hatsim";
import { projeGetir, type ProjeVerisi } from "@/lib/projeler";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { varsayilanConfig, varsayilanIsletme, type SimConfig, type Isletme } from "@/lib/anaray/config";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { RollingStock } from "@/lib/anaray/types";

// —— Bir senaryonun motor metrikleri (hepsi tek çekirdekten) ——
interface Metrik {
  ad: string;
  gecerli: boolean;
  uzunlukKm: number; durak: number; makas: number; sinyal: number;
  nTeorik: number; nSurdurulebilir: number; hMin: number; cevrimDk: number;
  isletmeKap: number; teorikKap: number; uic: number; siganTren: number;
  gerekenFilo: number; tepeYuk: number; baglayan: string;
}

function metrikHesapla(ad: string, ringsHam: DurakArasiRing[], stock: RollingStock, cfg: SimConfig, isletme: Isletme): Metrik {
  const rings = dwellUygulanmisRings(ringsHam ?? [], stock, isletme);
  const m = maksimumTren(rings, stock, cfg, isletme);
  const oz = hatOzellikleri(rings, cfg);
  const line = rings.length ? loopToHat(rings, false, cfg).line : null;
  const teorikKap = m.hMin > 0 ? 3600 / m.hMin : 0;
  const isletmeKap = teorikKap * (m.dolulukTavani || 1);
  const uic = (m.hMin > 0 && cfg.headway > 0) ? (m.hMin / cfg.headway) * 100 : 0;
  const siganTren = m.gecerli ? Math.ceil(m.cevrimSuresi / Math.max(1, cfg.headway)) : 0;
  const tia = rings.length >= 2 ? tersIsletmeAnaliz(rings, stock, isletme, cfg, "toplam") : null;
  return {
    ad, gecerli: m.gecerli,
    uzunlukKm: line ? line.length / 1000 : 0,
    durak: line ? line.stations.filter((s) => s.tip !== "gecit").length : 0,
    makas: rings.reduce((n, r) => n + r.makaslar.length, 0),
    sinyal: oz.filter((f) => f.kind === "sinyal").length,
    nTeorik: m.nTeorik, nSurdurulebilir: m.nSurdurulebilir, hMin: Math.round(m.hMin),
    cevrimDk: Math.round(m.cevrimSuresi / 60), isletmeKap: Math.round(isletmeKap),
    teorikKap: Math.round(teorikKap), uic: Math.round(uic), siganTren,
    gerekenFilo: tia ? tia.filo.gerekenArac : 0, tepeYuk: tia ? tia.tepeYuk : 0,
    baglayan: m.baglayanAd,
  };
}

// —— Karar tablosu satır tanımı ——
type Yon = "yuksek" | "dusuk" | "none";
interface Satir { etiket: string; al: (m: Metrik) => number; yaz: (m: Metrik) => string; yon: Yon; }
const SATIRLAR: Satir[] = [
  { etiket: "Hat uzunluğu (km)", al: (m) => m.uzunlukKm, yaz: (m) => m.uzunlukKm.toFixed(1), yon: "none" },
  { etiket: "Durak", al: (m) => m.durak, yaz: (m) => `${m.durak}`, yon: "none" },
  { etiket: "Makas", al: (m) => m.makas, yaz: (m) => `${m.makas}`, yon: "none" },
  { etiket: "Sinyal (SG)", al: (m) => m.sinyal, yaz: (m) => `${m.sinyal}`, yon: "none" },
  { etiket: "Teorik maks tramvay", al: (m) => m.nTeorik, yaz: (m) => `${m.nTeorik}`, yon: "yuksek" },
  { etiket: "Sürdürülebilir (UIC 406)", al: (m) => m.nSurdurulebilir, yaz: (m) => `${m.nSurdurulebilir}`, yon: "yuksek" },
  { etiket: "Min headway (s)", al: (m) => m.hMin, yaz: (m) => `${m.hMin}`, yon: "dusuk" },
  { etiket: "Çevrim (dk)", al: (m) => m.cevrimDk, yaz: (m) => `${m.cevrimDk}`, yon: "dusuk" },
  { etiket: "İşletme kapasitesi (tren/sa)", al: (m) => m.isletmeKap, yaz: (m) => `${m.isletmeKap}`, yon: "yuksek" },
  { etiket: "UIC doluluk (%)", al: (m) => m.uic, yaz: (m) => `%${m.uic}`, yon: "none" },
  { etiket: "Hedef sıklıkta gereken tren", al: (m) => m.siganTren, yaz: (m) => `${m.siganTren}`, yon: "dusuk" },
  { etiket: "Gereken filo (talep)", al: (m) => m.gerekenFilo, yaz: (m) => `${m.gerekenFilo}`, yon: "dusuk" },
  { etiket: "Tepe yük (yolcu/sa)", al: (m) => m.tepeYuk, yaz: (m) => `${m.tepeYuk}`, yon: "none" },
];

const enIyiIndeks = (ms: Metrik[], s: Satir): number => {
  if (s.yon === "none" || ms.length < 2) return -1;
  let bi = -1, bv = s.yon === "yuksek" ? -Infinity : Infinity;
  ms.forEach((m, i) => { if (!m.gecerli) return; const v = s.al(m); if (s.yon === "yuksek" ? v > bv : v < bv) { bv = v; bi = i; } });
  return bi;
};

// —— What-if parametreleri ——
const WHATIF = {
  headway: { ad: "Hedef headway", suffix: "s", varsayilan: [240, 180, 120], uygula: (c: SimConfig, v: number): SimConfig => ({ ...c, headway: Math.max(30, v) }) },
  blokMaxUzunluk: { ad: "Blok uzunluğu", suffix: "m", varsayilan: [500, 300, 150], uygula: (c: SimConfig, v: number): SimConfig => ({ ...c, blokMaxUzunluk: Math.max(100, v) }) },
  dolulukTavani: { ad: "Doluluk tavanı", suffix: "%", varsayilan: [70, 80, 90], uygula: (c: SimConfig, v: number): SimConfig => ({ ...c, dolulukTavani: Math.max(0.4, Math.min(0.95, v / 100)) }) },
} as const;
type WhatifKey = keyof typeof WHATIF;

export function Karsilastirma() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam, meta } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();
  const { projeler } = useHesap();

  const [mod, setMod] = useState<"projeler" | "whatif">("projeler");

  // — Projeler modu —
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [cache, setCache] = useState<Record<string, ProjeVerisi>>({});
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const eksik = [...secili].filter((id) => !cache[id]);
    if (eksik.length === 0) return;
    let iptal = false;
    setYukleniyor(true); setHata(null);
    Promise.all(eksik.map(async (id) => [id, (await projeGetir(id)).veri] as const))
      .then((ciftler) => { if (!iptal) setCache((c) => ({ ...c, ...Object.fromEntries(ciftler) })); })
      .catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : "Proje yüklenemedi."); })
      .finally(() => { if (!iptal) setYukleniyor(false); });
    return () => { iptal = true; };
  }, [secili, cache]);

  const projeMetrikler = useMemo<Metrik[]>(() => {
    return [...secili]
      .map((id) => ({ id, oz: projeler.find((p) => p.id === id), veri: cache[id] }))
      .filter((x) => x.veri)
      .map(({ oz, veri }) => {
        const c: SimConfig = { ...varsayilanConfig, ...(veri!.cfg ?? {}) };
        const s: RollingStock = veri!.arac ?? varsayilanArac;
        const isl: Isletme = { ...varsayilanIsletme, ...(veri!.isletme ?? {}) };
        return metrikHesapla(oz?.ad ?? "Proje", veri!.rings ?? [], s, c, isl);
      });
  }, [secili, cache, projeler]);

  // — What-if modu —
  const [wparam, setWparam] = useState<WhatifKey>("headway");
  const [wdegerler, setWdegerler] = useState<number[]>([...WHATIF.headway.varsayilan]);
  const paramDegis = (k: WhatifKey) => { setWparam(k); setWdegerler([...WHATIF[k].varsayilan]); };

  const whatifMetrikler = useMemo<Metrik[]>(() => {
    const w = WHATIF[wparam];
    return wdegerler.filter((v) => Number.isFinite(v) && v > 0).map((v) => {
      const c = w.uygula(cfg, v);
      return metrikHesapla(`${v} ${w.suffix}`, ringsHam, stock, c, isletme);
    });
  }, [wparam, wdegerler, cfg, ringsHam, stock, isletme]);

  const metrikler = mod === "projeler" ? projeMetrikler : whatifMetrikler;
  const yeterli = metrikler.filter((m) => m.gecerli).length >= 2;

  // — Nesnel öneri özeti —
  const oneri = useMemo(() => {
    const g = metrikler.filter((m) => m.gecerli);
    if (g.length < 2) return null;
    const enYuksek = (al: (m: Metrik) => number) => g.reduce((a, b) => (al(b) > al(a) ? b : a));
    const enDusuk = (al: (m: Metrik) => number) => g.reduce((a, b) => (al(b) < al(a) ? b : a));
    return {
      kapasite: enYuksek((m) => m.nSurdurulebilir),
      filo: enDusuk((m) => m.gerekenFilo),
      cevrim: enDusuk((m) => m.cevrimDk),
      isletme: enYuksek((m) => m.isletmeKap),
    };
  }, [metrikler]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Senaryo Karşılaştırma — Karar Desteği</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>Karşılaştırma</h1>
        <p className="mt-2 max-w-3xl text-sm" style={{ color: brand.inkSoft }}>
          Senaryoları yan yana koyar; tüm değerler simülasyonun kullandığı <b>aynı çekirdekten</b> hesaplanır (rapor/canlı sim ile birebir). Kararı objektif ver: hangi seçenek hangi ölçütte üstün?
        </p>
      </div>

      {/* Mod seçici */}
      <div className="mb-5 inline-flex overflow-hidden rounded-md border" style={{ borderColor: brand.borderStrong }}>
        {([["projeler", "Projeler"], ["whatif", "What-if (tek hat)"]] as const).map(([k, ad]) => (
          <button key={k} onClick={() => setMod(k)} className="px-4 py-1.5 text-sm font-semibold transition"
            style={mod === k ? { background: brand.ink, color: "#fff" } : { background: "#fff", color: brand.inkSoft }}>{ad}</button>
        ))}
      </div>

      {/* — PROJELER modu seçim — */}
      {mod === "projeler" && (
        <Panel baslik="Projeleri Seç" aciklama="Kıyaslamak istediğin 2-4 projeyi işaretle (kendi kayıtlı hatların). Her biri bir sütun olur.">
          {projeler.length === 0 ? (
            <p className="text-sm" style={{ color: brand.muted }}>Kayıtlı proje yok. Ringler’de bir hat kurup kaydettiğinde burada görünür.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {projeler.map((p) => {
                const isaretli = secili.has(p.id);
                const dolu = secili.size >= 4 && !isaretli;
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm"
                    style={{ borderColor: isaretli ? brand.ink : brand.border, background: isaretli ? "#F5F7F9" : "#fff", opacity: dolu ? 0.5 : 1 }}>
                    <input type="checkbox" checked={isaretli} disabled={dolu}
                      onChange={(e) => setSecili((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                    <span className="truncate" style={{ color: brand.ink }} title={p.ad}>{p.ad}</span>
                  </label>
                );
              })}
            </div>
          )}
          {secili.size >= 4 && <p className="mt-2 text-xs" style={{ color: brand.muted }}>En çok 4 senaryo karşılaştırılır (okunabilirlik).</p>}
          {yukleniyor && <p className="mt-2 text-xs" style={{ color: brand.muted }}>⟳ Projeler yükleniyor…</p>}
          {hata && <p className="mt-2 text-xs" style={{ color: brand.red }}>⚠ {hata}</p>}
        </Panel>
      )}

      {/* — WHAT-IF modu ayar — */}
      {mod === "whatif" && (
        <Panel baslik="What-if — Aktif Hat" aciklama={`Bu bölüm “${meta.hatAdi || "aktif hat"}” üzerinde çalışır: bir parametreyi değiştir, sonuçları kıyasla.`}>
          <div className="flex flex-wrap items-end gap-4">
            <label>
              <span className="field-label">Parametre</span>
              <select value={wparam} onChange={(e) => paramDegis(e.target.value as WhatifKey)}
                className="mt-1 block rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                {(Object.keys(WHATIF) as WhatifKey[]).map((k) => <option key={k} value={k}>{WHATIF[k].ad} ({WHATIF[k].suffix})</option>)}
              </select>
            </label>
            <div>
              <span className="field-label">Değerler (2-4)</span>
              <div className="mt-1 flex items-center gap-1.5">
                {wdegerler.map((v, i) => (
                  <input key={i} type="number" value={v}
                    onChange={(e) => setWdegerler((d) => d.map((x, j) => (j === i ? (parseFloat(e.target.value) || 0) : x)))}
                    className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                ))}
                {wdegerler.length < 4 && (
                  <button type="button" onClick={() => setWdegerler((d) => [...d, d[d.length - 1] || 100])}
                    className="h-7 w-7 rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }}>+</button>
                )}
                {wdegerler.length > 2 && (
                  <button type="button" onClick={() => setWdegerler((d) => d.slice(0, -1))}
                    className="h-7 w-7 rounded border font-semibold" style={{ borderColor: brand.border, color: brand.inkSoft }}>−</button>
                )}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* — SONUÇ — */}
      {!yeterli ? (
        <div className="mt-6 rounded-lg border-l-4 px-4 py-3 text-sm" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
          Karşılaştırma için en az <b>2 geçerli senaryo</b> gerekir. {mod === "projeler" ? "Yukarıdan proje seç (hattı kurulu/kaydedilmiş olmalı)." : "Değer kutularını doldur."}
        </div>
      ) : (
        <>
          {/* Öneri özeti */}
          {oneri && (
            <div className="mt-6 rounded-lg border p-4" style={{ borderColor: brand.ink, background: "#F7F9FA" }}>
              <div className="field-label mb-2">Objektif Öneri Özeti</div>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <OneriSatir etiket="En yüksek sürdürülebilir kapasite" ad={oneri.kapasite.ad} deger={`${oneri.kapasite.nSurdurulebilir} tramvay`} />
                <OneriSatir etiket="En düşük filo ihtiyacı" ad={oneri.filo.ad} deger={`${oneri.filo.gerekenFilo} araç`} />
                <OneriSatir etiket="En kısa çevrim (tur)" ad={oneri.cevrim.ad} deger={`${oneri.cevrim.cevrimDk} dk`} />
                <OneriSatir etiket="En yüksek işletme kapasitesi" ad={oneri.isletme.ad} deger={`${oneri.isletme.isletmeKap} tren/sa`} />
              </div>
              <p className="mt-2 text-xs" style={{ color: brand.muted }}>Ölçütler nesneldir; nihai karar talep, bütçe ve etaplama stratejisine göre verilir.</p>
            </div>
          )}

          {/* Karar tablosu */}
          <div className="mt-6 overflow-x-auto rounded-lg border" style={{ borderColor: brand.border }}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="p-2.5 text-left" style={{ background: brand.ink, color: "#fff" }}>Gösterge</th>
                  {metrikler.map((m, i) => (
                    <th key={i} className="p-2.5 text-center" style={{ background: brand.ink, color: "#fff" }}>{m.ad}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SATIRLAR.map((s, ri) => {
                  const best = enIyiIndeks(metrikler, s);
                  return (
                    <tr key={ri} style={{ background: ri % 2 ? "#F5F7F9" : "#fff" }}>
                      <td className="p-2.5 text-left" style={{ color: brand.inkSoft, borderTop: `1px solid ${brand.border}` }}>{s.etiket}</td>
                      {metrikler.map((m, ci) => (
                        <td key={ci} className="p-2.5 text-center tabular-nums" style={{
                          borderTop: `1px solid ${brand.border}`,
                          color: !m.gecerli ? brand.faint : ci === best ? "#7A6320" : brand.ink,
                          fontWeight: ci === best ? 700 : 400,
                          background: ci === best ? "#FBF7EC" : undefined,
                        }}>{m.gecerli ? s.yaz(m) : "—"}</td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <td className="p-2.5 text-left" style={{ color: brand.inkSoft, borderTop: `1px solid ${brand.border}` }}>Belirleyici kısıt</td>
                  {metrikler.map((m, ci) => (
                    <td key={ci} className="p-2.5 text-center text-xs" style={{ borderTop: `1px solid ${brand.border}`, color: m.gecerli ? brand.muted : brand.faint }}>{m.gecerli ? m.baglayan : "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs" style={{ color: brand.muted }}>
            <span style={{ color: "#7A6320", fontWeight: 700 }}>Altın</span> hücre o satırda üstün senaryodur (kapasite yüksek / min-headway·çevrim·filo düşük daha iyi). UIC doluluk ve durak/makas gibi tanımlayıcılar tarafsızdır.
          </p>

          {/* Çubuk kıyaslar */}
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <CubukKart baslik="Teorik maks tramvay" ms={metrikler} al={(m) => m.nTeorik} renk={CK.blue} />
            <CubukKart baslik="İşletme kapasitesi (tren/sa)" ms={metrikler} al={(m) => m.isletmeKap} renk={CK.good} />
            <CubukKart baslik="Gereken filo (talep)" ms={metrikler} al={(m) => m.gerekenFilo} renk={CK.orange} />
          </div>

          <div className="mt-6 rounded-md border-l-4 px-3 py-2 text-xs" style={{ borderColor: brand.ink, background: "#F7F9FA", color: brand.inkSoft }}>
            📄 <b>PDF Karşılaştırma Raporu</b> bir sonraki adımda eklenecek — bu tabloyu, çubukları ve öneri özetini baskıya hazır kurumsal bir belgeye dökecek.
          </div>
        </>
      )}
    </div>
  );
}

function OneriSatir({ etiket, ad, deger }: { etiket: string; ad: string; deger: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded border px-3 py-1.5" style={{ borderColor: brand.border, background: "#fff" }}>
      <span className="text-xs" style={{ color: brand.muted }}>{etiket}</span>
      <span className="text-right"><b style={{ color: brand.ink }}>{ad}</b> <span className="text-xs" style={{ color: brand.inkSoft }}>· {deger}</span></span>
    </div>
  );
}

function CubukKart({ baslik, ms, al, renk }: { baslik: string; ms: Metrik[]; al: (m: Metrik) => number; renk: string }) {
  const maks = Math.max(1, ...ms.filter((m) => m.gecerli).map(al));
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: brand.border }}>
      <div className="field-label mb-2" style={{ fontSize: "0.62rem" }}>{baslik}</div>
      <div className="space-y-1.5">
        {ms.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-xs" style={{ color: brand.inkSoft }} title={m.ad}>{m.ad}</span>
            <div className="h-3 flex-1 overflow-hidden rounded" style={{ background: CK.track }}>
              <div style={{ width: `${m.gecerli ? (al(m) / maks) * 100 : 0}%`, height: "100%", background: renk }} />
            </div>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums" style={{ color: brand.ink }}>{m.gecerli ? al(m) : "—"}</span>
          </div>
        ))}
      </div>
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
