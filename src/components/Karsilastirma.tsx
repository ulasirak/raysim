"use client";

// raysim — SENARYO KARŞILAŞTIRMA (karar destek).
// İki mod:
//   • Projeler: kendi kayıtlı projelerinden 2-4'ünü yan yana kıyasla (Etap1/Etap2/…).
//   • What-if : aktif hattın bir parametresini (headway/blok/doluluk) değiştirip
//               varyasyonları kıyasla (aynı hat, farklı ayar).
// Metrikler simülasyonun AYNI çekirdeğinden (lib/karsilastirma → maksimumTren/…) gelir;
// ekran önizleme + baskıya hazır PDF karar raporu (aynı çekirdek → birebir tutarlı).

import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme, useHesap } from "@/components/SimConfigProvider";
import { type Metrik, metrikHesapla, SATIRLAR, enIyiIndeks } from "@/lib/anaray/karsilastirma";
import { projeGetir, type ProjeVerisi } from "@/lib/projeler";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { varsayilanConfig, varsayilanIsletme, type SimConfig, type Isletme } from "@/lib/anaray/config";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { RollingStock } from "@/lib/anaray/types";
import { getAuthInstance } from "@/lib/firebase";
import { useCuzdan } from "@/components/CuzdanProvider";

// —— What-if parametreleri (doluluk İLK: HER hatta sürdürülebilir/işletme kapasitesini
// KESİN değiştirir → dinamikliği garanti eder; blok yalnız blok-bağlı hatlarda oynatır) ——
// etkin(v): motorun GERÇEKTEN kullandığı (kıskaçlanmış) değer — etiket bununla yazılır,
// böylece alt/üst sınır dışı bir değer girilse de etiket ile hesap ASLA çelişmez.
const WHATIF = {
  dolulukTavani: { ad: "Doluluk tavanı", suffix: "%", varsayilan: [70, 80, 90], min: 40, max: 95, not: "UIC 406 doluluk tavanı — her hatta sürdürülebilir ve işletme kapasitesini doğrudan belirler (teorik tavan sabit). Geçerli 40–95%.", etkin: (v: number) => Math.round(Math.max(40, Math.min(95, v))), uygula: (c: SimConfig, v: number): SimConfig => ({ ...c, dolulukTavani: Math.max(0.4, Math.min(0.95, v / 100)) }) },
  blokMaxUzunluk: { ad: "Blok uzunluğu", suffix: "m", varsayilan: [500, 300, 150], min: 100, max: 1500, not: "Sinyal blok sıklığı — YALNIZ belirleyici kısıt blok ise kapasiteyi/min headway'i değiştirir. Geçerli 100–1500 m.", etkin: (v: number) => Math.max(100, Math.min(1500, Math.round(v))), uygula: (c: SimConfig, v: number): SimConfig => ({ ...c, blokMaxUzunluk: Math.max(100, Math.min(1500, v)) }) },
  headway: { ad: "Hedef headway", suffix: "s", varsayilan: [240, 180, 120], min: 30, max: 600, not: "Sefer sıklığı hedefi — fiziksel kapasiteyi DEĞİL, yalnız UIC doluluk ve gereken tren sayısını etkiler. Geçerli 30–600 s.", etkin: (v: number) => Math.max(30, Math.min(600, Math.round(v))), uygula: (c: SimConfig, v: number): SimConfig => ({ ...c, headway: Math.max(30, Math.min(600, v)) }) },
} as const;
type WhatifKey = keyof typeof WHATIF;

// PDF için bir senaryonun ham verisi (sunucu aynı çekirdekle yeniden hesaplar).
interface SenaryoPayload { ad: string; rings: DurakArasiRing[]; cfg: SimConfig; arac: RollingStock; isletme: Isletme; }

export function Karsilastirma() {
  const { cfg } = useSimConfig();
  const { rings: ringsHam, meta } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();
  const { projeler } = useHesap();
  const { yenile } = useCuzdan();

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
    // Veri-çekme effect'i: eksik projeler yüklenirken "yükleniyor" durumu — meşru.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYukleniyor(true); setHata(null);
    Promise.all(eksik.map(async (id) => [id, (await projeGetir(id)).veri] as const))
      .then((ciftler) => { if (!iptal) setCache((c) => ({ ...c, ...Object.fromEntries(ciftler) })); })
      .catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : "Proje yüklenemedi."); })
      .finally(() => { if (!iptal) setYukleniyor(false); });
    return () => { iptal = true; };
  }, [secili, cache]);

  // Projeler modu — hem metrik hem PDF payload'ı tek kaynaktan (sıra korunur).
  const projeSenaryolar = useMemo<SenaryoPayload[]>(() => {
    return [...secili]
      .map((id) => ({ oz: projeler.find((p) => p.id === id), veri: cache[id] }))
      .filter((x) => x.veri)
      .map(({ oz, veri }) => ({
        ad: oz?.ad ?? "Proje",
        rings: veri!.rings ?? [],
        cfg: { ...varsayilanConfig, ...(veri!.cfg ?? {}) },
        arac: veri!.arac ?? varsayilanArac,
        isletme: { ...varsayilanIsletme, ...(veri!.isletme ?? {}) },
      }));
  }, [secili, cache, projeler]);

  // — What-if modu —
  const [wparam, setWparam] = useState<WhatifKey>("dolulukTavani");
  const [wdegerler, setWdegerler] = useState<number[]>([...WHATIF.dolulukTavani.varsayilan]);
  const paramDegis = (k: WhatifKey) => { setWparam(k); setWdegerler([...WHATIF[k].varsayilan]); };

  const whatifSenaryolar = useMemo<SenaryoPayload[]>(() => {
    const w = WHATIF[wparam];
    return wdegerler.filter((v) => Number.isFinite(v) && v > 0).map((v) => {
      const ev = w.etkin(v); // etiket VE hesap aynı etkin değerle → çelişki yok
      return { ad: `${ev} ${w.suffix}`, rings: ringsHam, cfg: w.uygula(cfg, ev), arac: stock, isletme };
    });
  }, [wparam, wdegerler, cfg, ringsHam, stock, isletme]);

  const senaryolar = mod === "projeler" ? projeSenaryolar : whatifSenaryolar;
  const metrikler = useMemo<Metrik[]>(
    () => senaryolar.map((s) => metrikHesapla(s.ad, s.rings, s.arac, s.cfg, s.isletme)),
    [senaryolar]
  );
  const yeterli = metrikler.filter((m) => m.gecerli).length >= 2;

  // What-if'te seçilen parametre metrikleri HİÇ oynatmadıysa (tüm sütunlar birebir aynı)
  // bunu kullanıcıya açıkça söyle — "dinamik değil" sanılmasın; nedeni belirleyici kısıt.
  const degismedi = useMemo(() => {
    if (mod !== "whatif") return false;
    const g = metrikler.filter((m) => m.gecerli);
    if (g.length < 2) return false;
    const imza = (m: Metrik) => `${m.nTeorik}|${m.nSurdurulebilir}|${m.hMin}|${m.isletmeKap}|${m.uic}|${m.siganTren}|${m.gerekenFilo}`;
    return g.every((m) => imza(m) === imza(g[0]));
  }, [mod, metrikler]);

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

  // — PDF karar raporu (sunucuda üret + kredi, /api/rapor ile aynı güvenlik) —
  const [pdfMesgul, setPdfMesgul] = useState(false);
  const [pdfDurum, setPdfDurum] = useState<{ tip: "ok" | "err"; metin: string } | null>(null);
  const pdfUret = async () => {
    setPdfMesgul(true); setPdfDurum(null);
    const w = window.open("", "_blank", "width=920,height=1000");
    try {
      const a = getAuthInstance();
      const token = await a?.currentUser?.getIdToken();
      if (!token) { w?.close(); setPdfDurum({ tip: "err", metin: "Oturum bulunamadı — yeniden giriş yapın." }); return; }
      const altBaslik = mod === "projeler"
        ? `${senaryolar.length} proje karşılaştırması`
        : `${meta.hatAdi || "Aktif hat"} · ${WHATIF[wparam].ad} varyasyonu`;
      const yanit = await fetch("/api/karsilastirma", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ senaryolar, meta, altBaslik }),
      });
      if (!yanit.ok) {
        w?.close();
        const v = await yanit.json().catch(() => ({}));
        setPdfDurum({ tip: "err", metin: v.hata === "yetersiz_kredi" ? `Rapor ${v.gereken} kredi ister; ${v.mevcut} krediniz var.` : (v.hata ?? "Rapor üretilemedi.") });
        return;
      }
      const html = await yanit.text();
      if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      await yenile();
      setPdfDurum({ tip: "ok", metin: "Rapor yeni sekmede açıldı — yazdırma diyalogunda “PDF olarak kaydet”i seçin." });
    } catch (e) {
      w?.close();
      setPdfDurum({ tip: "err", metin: `Rapor açılamadı: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setPdfMesgul(false); }
  };

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
                  <input key={i} type="number" value={v} min={WHATIF[wparam].min} max={WHATIF[wparam].max}
                    onChange={(e) => setWdegerler((d) => d.map((x, j) => (j === i ? (parseFloat(e.target.value) || 0) : x)))}
                    className="w-16 rounded border px-2 py-1 text-center text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                ))}
                {wdegerler.length < 4 && (
                  <button type="button" onClick={() => setWdegerler((d) => { const son = d[d.length - 1] || WHATIF[wparam].varsayilan[0]; return [...d, WHATIF[wparam].etkin(Math.round(son * 0.75))]; })}
                    className="h-7 w-7 rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }} title="Farklı bir değer ekle">+</button>
                )}
                {wdegerler.length > 2 && (
                  <button type="button" onClick={() => setWdegerler((d) => d.slice(0, -1))}
                    className="h-7 w-7 rounded border font-semibold" style={{ borderColor: brand.border, color: brand.inkSoft }}>−</button>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 rounded border-l-2 pl-2 text-xs" style={{ borderColor: CK.gold, color: brand.inkSoft }}>
            ℹ️ {WHATIF[wparam].not}
          </p>
        </Panel>
      )}

      {/* — SONUÇ — */}
      {!yeterli ? (
        <div className="mt-6 rounded-lg border-l-4 px-4 py-3 text-sm" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
          Karşılaştırma için en az <b>2 geçerli senaryo</b> gerekir. {mod === "projeler" ? "Yukarıdan proje seç (hattı kurulu/kaydedilmiş olmalı)." : "Değer kutularını doldur."}
        </div>
      ) : (
        <>
          {degismedi && (
            <div className="mt-6 rounded-md border-l-4 px-4 py-3 text-sm" style={{ borderColor: CK.amber, background: CK.amberBg, color: CK.amberInk }}>
              ⚠ “{WHATIF[wparam].ad}” değişimi bu hatta metrikleri <b>oynatmadı</b> — bu hattın belirleyici kısıtı bu parametre değil (tablodaki <b>Belirleyici kısıt</b> satırına bak). <b>Doluluk tavanı</b> her hatta kapasiteyi değiştirir; <b>Blok</b> yalnız blok-bağlı hatta, <b>Headway</b> ise UIC doluluk / gereken tren'i.
            </div>
          )}

          {/* PDF butonu */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={pdfUret} disabled={pdfMesgul}
              className="rounded-md px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.red }}>
              {pdfMesgul ? "Açılıyor…" : "🖨 PDF Karşılaştırma Raporu"}
            </button>
            {pdfDurum && <span className="text-sm" style={{ color: pdfDurum.tip === "err" ? brand.red : CK.good }}>{pdfDurum.tip === "ok" ? "✓ " : "⚠ "}{pdfDurum.metin}</span>}
          </div>

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
  const gecerli = ms.filter((m) => m.gecerli);
  const maks = Math.max(1, ...gecerli.map(al));
  const min = gecerli.length ? Math.min(...gecerli.map(al)) : 0;
  const baz = gecerli.length ? al(gecerli[0]) : 0; // ilk senaryo = referans
  const span = maks - min;
  const w = (v: number) => (span <= 0 ? 100 : 30 + ((v - min) / span) * 70);
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: brand.border }}>
      <div className="field-label mb-2" style={{ fontSize: "0.62rem" }}>{baslik}</div>
      <div className="space-y-1.5">
        {ms.map((m, i) => {
          const v = al(m);
          const d = m.gecerli && i > 0 ? v - baz : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-xs" style={{ color: brand.inkSoft }} title={m.ad}>{m.ad}</span>
              <div className="h-3 flex-1 overflow-hidden rounded" style={{ background: CK.track }}>
                <div style={{ width: `${m.gecerli ? w(v) : 0}%`, height: "100%", background: renk, transition: "width .25s ease" }} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums" style={{ color: brand.ink }}>
                <b>{m.gecerli ? v : "—"}</b>
                {d !== 0 && <span style={{ color: brand.muted, marginLeft: 3 }}>{d > 0 ? "▲" : "▼"}{Math.abs(d)}</span>}
              </span>
            </div>
          );
        })}
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
