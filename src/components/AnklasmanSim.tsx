"use client";

// raysim — MAKAS BÖLGESİ ANKLAŞMAN görselleştiricisi.
// Belgedeki bölge senaryolarını canlı çalıştırır: rota talepleri gönderilir,
// motor çakışma matriksi + kilit + zamanlayıcılarla işletir; sinyal aspektleri
// (Yeşil/Sarı/Kırmızı/Sönük), makas durumları ve blok doluluğu zaman içinde
// oynatılır. Fail-safe arıza enjekte edilebilir.

import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { sure } from "@/lib/anaray/format";
import Link from "next/link";
import { useSimConfig, useProje, useIsletme, useBolgeler } from "@/components/SimConfigProvider";
import {
  bolgeSablonlari, bosBolge, yeniRota, bolgeNormalize, makasBolgeId, simuleEtAnklasman,
  type RotaTalebi, type SinyalAspekt, type MakasBolgeTopolojisi, type AnklasmanRota, type BolgeTip,
} from "@/lib/anaray/interlocking";

const BOLGE_TIP_AD: Record<BolgeTip, string> = {
  karsilasmali: "Karşılaşmalı (yüz yüze)",
  headway: "Headway makası",
  barinma: "Barınma (3. yön)",
  depo: "Depo giriş/çıkış",
  udonus: "U-dönüş (S-makas)",
};
import { CK, ASPEKT } from "@/lib/anaray/chartkit";

// Aspekt renkleri chartkit'in ALAN semantiği katmanından (gerçek fener renkleri).
const ASPEKT_RENK: Record<SinyalAspekt, string> = ASPEKT;
const ASPEKT_AD: Record<SinyalAspekt, string> = { yesil: "YEŞİL", sari: "SARI", kirmizi: "KIRMIZI", sonuk: "SÖNÜK" };

export function AnklasmanSim({ initialBolgeId }: { initialBolgeId?: string } = {}) {
  // Bölgeler artık KİRACININ kalıcı verisi (Firestore) — sabit seed değil.
  const { bolgeler, setBolgeler, yazilabilir } = useBolgeler();
  const [bolgeId, setBolgeId] = useState(initialBolgeId ?? "");
  // Seçili bölge geçersizse (silme / ilk yükleme) ilk bölgeye düş.
  useEffect(() => {
    if (bolgeler.length && !bolgeler.some((b) => b.id === bolgeId)) setBolgeId(bolgeler[0].id);
  }, [bolgeler, bolgeId]);
  const topo = bolgeler.find((b) => b.id === bolgeId) ?? bolgeler[0];

  // Bu bölge hattın HANGİ fiziksel makas bölgelerine bağlı? (ters bağ: Ringler → Anklaşman)
  const { rings } = useProje();
  const kullananlar = useMemo(
    () => (topo ? rings.flatMap((r) => r.makaslar.filter((m) => makasBolgeId(m) === topo.id).map((m) => ({ ad: m.ad || r.ad, ringAd: r.ad }))) : []),
    [rings, topo]
  );

  // — bölge / rota düzenleme (kalıcı: setBolgeler → Firestore otomatik kayıt) —
  // Her mutasyonda bolgeNormalize: blok/makas/sinyal listelerini rotalardan türetir,
  // esZamanli'yi siler → çakışma matriksi girilen rotalarla daima tutarlı.
  const bolgeGuncelle = (id: string, mut: (z: MakasBolgeTopolojisi) => MakasBolgeTopolojisi) =>
    setBolgeler((list) => list.map((z) => (z.id === id ? bolgeNormalize(mut(z)) : z)));
  const yeniBolgeId = () => {
    const mevcut = new Set(bolgeler.map((b) => b.id));
    let n = bolgeler.length + 1;
    while (mevcut.has(String(n))) n++;
    return String(n);
  };
  const bolgeEkle = () => {
    const id = yeniBolgeId();
    setBolgeler((list) => [...list, bosBolge(id, `${id}. Makas Bölgesi`, "karsilasmali")]);
    setBolgeId(id);
  };
  const bolgeSilHandler = (id: string) => setBolgeler((list) => list.filter((z) => z.id !== id));
  const sablonYukle = () => setBolgeler(bolgeSablonlari());

  const rotaId = (z: MakasBolgeTopolojisi) => {
    const mevcut = new Set(z.rotalar.map((r) => r.id));
    let n = z.rotalar.length + 1;
    while (mevcut.has(`${z.id}_R${n}`)) n++;
    return `${z.id}_R${n}`;
  };
  const rotaEkle = () => topo && bolgeGuncelle(topo.id, (z) => ({ ...z, rotalar: [...z.rotalar, yeniRota(rotaId(z))] }));
  const rotaGuncelle = (rid: string, patch: Partial<AnklasmanRota>) =>
    topo && bolgeGuncelle(topo.id, (z) => ({ ...z, rotalar: z.rotalar.map((r) => (r.id === rid ? { ...r, ...patch } : r)) }));
  const rotaSil = (rid: string) => topo && bolgeGuncelle(topo.id, (z) => ({ ...z, rotalar: z.rotalar.filter((r) => r.id !== rid) }));

  // blok/makas listelerini serbest metin ↔ dizi çevir (editör alanları).
  const bloklarStr = (bs: string[]) => bs.join(", ");
  const bloklarParse = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const makaslarStr = (ms: { id: string; konum: string }[]) => ms.map((m) => `${m.id}:${m.konum}`).join(", ");
  const makaslarParse = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean).map((tok) => {
      const [id, konum] = tok.split(":").map((y) => y.trim());
      return { id: id || "PM1", konum: konum || "" };
    });

  // Kalıcı talep parametreleri (projeye kayıtlı).
  const { isletme, patchIsletme } = useIsletme();
  const trenSayisi = isletme.anklasmanTren;
  const setTrenSayisi = (v: number) => patchIsletme({ anklasmanTren: v });
  const headwaySn = isletme.anklasmanHeadwaySn;
  const setHeadwaySn = (v: number) => patchIsletme({ anklasmanHeadwaySn: v });
  const [faultOn, setFaultOn] = useState(false);
  const [faultAt, setFaultAt] = useState(30);

  // Talepler: trenler headway aralığıyla rotalar arasında round-robin gezer.
  // Bölge yoksa ya da rotası yoksa boş → sim boş, güvenli.
  const istekler = useMemo<RotaTalebi[]>(() => {
    const rl = topo?.rotalar ?? [];
    if (rl.length === 0) return [];
    return Array.from({ length: trenSayisi }, (_, i) => ({
      t: i * headwaySn,
      rotaId: rl[i % rl.length].id,
      trenId: `T${i + 1}`,
    }));
  }, [topo, trenSayisi, headwaySn]);

  const { cfg } = useSimConfig();
  const sonuc = useMemo(
    () => simuleEtAnklasman(topo ?? bosBolge("_", "—"), istekler, { cfg, ...(faultOn ? { fault: { t: faultAt, sure: 15 } } : {}) }),
    [topo, istekler, faultOn, faultAt, cfg]
  );

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

  // Hiç bölge yoksa (paylaşım/eski kayıt) — boş durum + şablon tohumu.
  if (!topo) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <div className="field-label">Makas Bölgesi Anklaşman Simülatörü</div>
        <h1 className="font-brand mt-2 text-2xl font-semibold" style={{ color: brand.ink }}>Henüz makas bölgesi yok</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm" style={{ color: brand.inkSoft }}>
          Anklaşman senaryolarını çalıştırmak için en az bir makas bölgesi (rotalar + bloklar) tanımlanmalı.
          Hazır şablonlardan başlayıp kendi hattına göre düzenleyebilirsin.
        </p>
        {yazilabilir ? (
          <button onClick={sablonYukle} className="mt-6 rounded-md px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.red }}>
            + Şablon bölgeleri yükle
          </button>
        ) : (
          <p className="mt-6 text-xs" style={{ color: brand.muted }}>Bu görünüm salt-okunur — bölge eklenemez.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Makas Bölgesi Anklaşman Simülatörü — Dağıtık SIL4 Interlocking (anklaşman)</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{topo.ad}</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={bolgeId} onChange={(e) => setBolgeId(e.target.value)} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: brand.borderStrong, color: brand.ink }}>
            {bolgeler.map((b) => (<option key={b.id} value={b.id}>{b.ad}</option>))}
          </select>
          {yazilabilir && (
            <button onClick={bolgeEkle} title="Yeni makas bölgesi ekle" className="rounded-md border px-2.5 py-1.5 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.ink }}>+ Bölge</button>
          )}
        </div>
      </div>

      {/* Model ↔ hat bağı */}
      <div className="mb-4 rounded-md border-l-4 px-4 py-2 text-xs" style={{ background: brand.surface, borderColor: kullananlar.length ? CK.good : CK.amber, color: brand.inkSoft }}>
        {kullananlar.length > 0 ? (
          <>Bu bölge, proje hattındaki <b>{kullananlar.length} makas bölgesine</b> bağlı:{" "}
            {kullananlar.map((k) => k.ad).join(" · ")}. Rotaları aşağıdan düzenle — çakışma matriksi girilen rotalardan otomatik türetilir; makas yerleşimini{" "}
            <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link> modülünden yönet.</>
        ) : (
          <>▲ Bu bölge şu an hattaki hiçbir ring makasına bağlı değil (yalnız bilgi amaçlı çalışır). Ring makaslarını{" "}
            <Link href="/ringler" className="underline" style={{ color: brand.red }}>Ringler</Link> modülünden bu bölgeye bağlayabilirsin.</>
        )}
      </div>

      {/* Bölge editörü — kiracı kendi enterlok topolojisini kurar */}
      <div className="mb-6">
        <Panel baslik="Bölge Düzenle" aciklama="Bu bölgenin adını, tipini ve ROTALARINI tanımla. Blok/makas/sinyal listeleri ve çakışma matriksi rotalardan otomatik türetilir. Makas doğrultusu biçimi: PM1:AD, PM2:BE. Değişiklikler projeye otomatik kaydedilir.">
          <fieldset disabled={!yazilabilir} className="contents">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <label className="block sm:col-span-2">
                <span className="field-label">Bölge adı</span>
                <input value={topo.ad} onChange={(e) => bolgeGuncelle(topo.id, (z) => ({ ...z, ad: e.target.value }))}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-60" style={{ borderColor: brand.border, color: brand.ink }} />
              </label>
              <label className="block">
                <span className="field-label">Tip</span>
                <select value={topo.tip} onChange={(e) => bolgeGuncelle(topo.id, (z) => ({ ...z, tip: e.target.value as BolgeTip }))}
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:opacity-60" style={{ borderColor: brand.border, color: brand.ink }}>
                  {(Object.keys(BOLGE_TIP_AD) as BolgeTip[]).map((t) => (<option key={t} value={t}>{BOLGE_TIP_AD[t]}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Bölge uzunluğu</span>
                <div className="mt-1 flex items-center gap-1">
                  <input type="number" value={topo.uzunluk} step={10} min={0} onChange={(e) => bolgeGuncelle(topo.id, (z) => ({ ...z, uzunluk: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    className="w-full rounded border px-2 py-1 text-sm disabled:opacity-60" style={{ borderColor: brand.border, color: brand.ink }} />
                  <span className="text-xs" style={{ color: brand.muted }}>m</span>
                </div>
              </label>
            </div>

            {/* Rota tablosu */}
            <SubBaslik>Rotalar (NEREDEN → NEREYE)</SubBaslik>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-left" style={{ color: brand.muted }}>
                    <th className="px-1 py-1 font-medium">Rota</th>
                    <th className="px-1 py-1 font-medium">Nrdn</th>
                    <th className="px-1 py-1 font-medium">Nrye</th>
                    <th className="px-1 py-1 font-medium">Sinyal</th>
                    <th className="px-1 py-1 font-medium">Bloklar</th>
                    <th className="px-1 py-1 font-medium">Makaslar (id:konum)</th>
                    <th className="px-1 py-1 font-medium" title="Headway timeout gerekli">HW</th>
                    <th className="px-1 py-1 font-medium" title="Her geçişte TCC onayı">TCC</th>
                    <th className="px-1 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {topo.rotalar.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: brand.border }}>
                      <td className="px-1 py-1 font-mono" style={{ color: brand.faint }}>{r.id}</td>
                      <td className="px-1 py-1"><input value={r.nereden} onChange={(e) => rotaGuncelle(r.id, { nereden: e.target.value })} className="w-12 rounded border px-1 py-1 disabled:opacity-60" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-1"><input value={r.nereye} onChange={(e) => rotaGuncelle(r.id, { nereye: e.target.value })} className="w-12 rounded border px-1 py-1 disabled:opacity-60" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-1"><input value={r.sinyal} onChange={(e) => rotaGuncelle(r.id, { sinyal: e.target.value })} className="w-20 rounded border px-1 py-1 disabled:opacity-60" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-1"><input value={bloklarStr(r.bloklar)} onChange={(e) => rotaGuncelle(r.id, { bloklar: bloklarParse(e.target.value) })} placeholder="BS1, BS2" className="w-28 rounded border px-1 py-1 disabled:opacity-60" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-1"><input value={makaslarStr(r.makaslar)} onChange={(e) => rotaGuncelle(r.id, { makaslar: makaslarParse(e.target.value) })} placeholder="PM1:AD" className="w-36 rounded border px-1 py-1 disabled:opacity-60" style={{ borderColor: brand.border }} /></td>
                      <td className="px-1 py-1 text-center"><input type="checkbox" checked={r.headwayGerekli} onChange={(e) => rotaGuncelle(r.id, { headwayGerekli: e.target.checked })} /></td>
                      <td className="px-1 py-1 text-center"><input type="checkbox" checked={r.tccGerekli} onChange={(e) => rotaGuncelle(r.id, { tccGerekli: e.target.checked })} /></td>
                      <td className="px-1 py-1 text-center"><button onClick={() => rotaSil(r.id)} title="Rotayı sil" className="rounded px-1.5 py-0.5 text-sm disabled:opacity-40" style={{ color: brand.red }}>✕</button></td>
                    </tr>
                  ))}
                  {topo.rotalar.length === 0 && (
                    <tr><td colSpan={9} className="px-1 py-3 text-center" style={{ color: brand.muted }}>Henüz rota yok — “+ Rota ekle” ile başla.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={rotaEkle} className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: brand.ink }}>+ Rota ekle</button>
              <button onClick={() => bolgeSilHandler(topo.id)} className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 disabled:opacity-50" style={{ borderColor: brand.borderStrong, color: brand.red }}>🗑 Bu bölgeyi sil</button>
              <span className="text-xs" style={{ color: brand.muted }}>Türetilen: {topo.bloklar.length} blok · {topo.makaslar.length} makas · {topo.sinyaller.length} sinyal</span>
            </div>
          </fieldset>
        </Panel>
      </div>

      {/* Kontrol */}
      <Panel baslik="Talep Senaryosu" aciklama="Trenler headway aralığıyla rotalar arasında dönerek talep oluşturur. Çakışan rotalar emniyet gereği kuyrukta bekler; çakışmayanlar (matrikste X) paralel kurulur.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Num label="Tren sayısı" suffix="tren" step={1} value={trenSayisi} onChange={(v) => setTrenSayisi(Math.max(1, Math.round(v)))} />
          <Num label="Talep aralığı" suffix="s" step={5} value={headwaySn} onChange={(v) => setHeadwaySn(Math.max(1, v))} />
          <label className="block">
            <span className="field-label">Fail-safe (arıza-emniyetli) arıza</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={faultOn} onChange={(e) => setFaultOn(e.target.checked)} />
              <span className="text-xs" style={{ color: brand.inkSoft }}>{faultOn ? "aktif" : "kapalı"}</span>
            </div>
          </label>
          {faultOn && <Num label="Arıza anı" suffix="s" step={5} value={faultAt} onChange={(v) => setFaultAt(Math.max(0, v))} />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat etiket="Kabul / talep" deger={`${kabuller} / ${istekler.length}`} />
          <MiniStat etiket="Maks. eşzamanlı rota" deger={`${sonuc.maxEszamanli}`} alt={sonuc.maxEszamanli > 1 ? "paralel kurulum" : "tek tren"} vurgu={sonuc.maxEszamanli > 1 ? CK.good : brand.ink} />
          <MiniStat etiket="Ort. bekleme" deger={sure(sonuc.ortBekleme)} alt="çakışma kuyruğu" />
          <MiniStat etiket="Throughput (geçiş debisi)" deger={`${sonuc.throughput.toFixed(0)}/sa`} alt="kabul edilen" />
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
                {kare?.failSafe && <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: ASPEKT.sonuk, color: "#fff" }}>⚠ FAIL-SAFE — bölge sönük</span>}
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
                          {r.tccGerekli && <span className="rounded px-1.5 py-0.5 text-[0.6rem]" style={{ background: CK.track, color: brand.muted }}>TCC</span>}
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
                      const renk = d === "kilitli" ? ASPEKT.yesil : d === "hareket" ? ASPEKT.sari : brand.muted;
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
                          <span key={bs} className="rounded px-2 py-1 text-xs font-medium" style={{ background: dolu ? CK.red : CK.track, color: dolu ? "#fff" : brand.muted }}>
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
                  <td className="py-2" style={{ color: ASPEKT.yesil }}>{s.yesilT < 0 ? "—" : sure(s.yesilT)}</td>
                  <td className="py-2" style={{ color: brand.inkSoft }}>{s.cikisT < 0 ? "—" : sure(s.cikisT)}</td>
                  <td className="py-2">
                    {s.bekleme > 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: CK.badBg, color: CK.red }}>⏱ {sure(s.bekleme)}</span>
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
        RaySim · Dağıtık anklaşman — TCC (Tren Kontrol Merkezi) yalnız istek gönderir, son söz saha SIL4 PLC&apos;sindedir · makas adımı {cfg.makasAdimMax} s · route release {topo.tip === "depo" ? cfg.routeReleaseDepo : cfg.routeReleaseAnahat} s · fail-safe = yalnız bu bölge söner (canlı parametreler: Sistem Merkezi)
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
