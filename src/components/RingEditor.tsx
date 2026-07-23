"use client";

// türkray — DURAK ARASI RİNG editörü.
// Her durak-arası hücrenin ZORUNLU şartları girilir/düzenlenir (mesafe, makas
// bölgeleri, hemzemin, tehlike noktaları). Her değişiklikte worst/best köşeleri,
// headway (240 s) uygunluğu, durak-çiftleri arası denge ve tren-sayısı
// darboğazı anında yeniden hesaplanır. Hücreler bir loop (kapalı hat) oluşturur.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RollingStock } from "@/lib/anaray/types";
import { bolgeIdIcin } from "@/lib/anaray/interlocking";
import { useSimConfig, useProje } from "@/components/SimConfigProvider";
import type { SimConfig } from "@/lib/anaray/config";
import { araclar, varsayilanArac } from "@/lib/anaray/vehicles";
import { brand } from "@/lib/anaray/brand";
import { kmh, sure } from "@/lib/anaray/format";
import {
  MAKAS_TIP_AD,
  loopDenge,
  olceklenme,
  ringChallenge,
  ringDogrula,
  ringKisitDizisi,
  ringSenaryo,
  dengeOnerisi,
  tccGerekli,
  yeniHemzemin,
  yeniMakas,
  yeniRing,
  yeniTehlike,
  type DurakArasiRing,
  type HemzeminTip,
  type KisitTur,
  type MakasTip,
} from "@/lib/anaray/ring";

const KMH = 1 / 3.6;
const OK = "#0E7C57";

export function RingEditor() {
  const { cfg } = useSimConfig();
  const { rings, setRings, sifirlaRings, meta } = useProje();
  const [kapali, setKapali] = useState(true);
  const [stock, setStock] = useState<RollingStock>(varsayilanArac);
  const [acik, setAcik] = useState<Record<string, boolean>>(() => (rings[0] ? { [rings[0].id]: true } : {}));

  const denge = useMemo(() => loopDenge(rings, stock, cfg), [rings, stock, cfg]);
  const olcek = useMemo(() => olceklenme(rings, stock, kapali, cfg), [rings, stock, kapali, cfg]);
  const oneriler = useMemo(() => dengeOnerisi(rings, stock, cfg), [rings, stock, cfg]);
  const tumEksik = useMemo(() => rings.flatMap((r) => ringDogrula(r, cfg)), [rings, cfg]);
  const loopTam = tumEksik.length === 0 && rings.length > 0;

  // — güncelleyiciler —
  const patch = (id: string, p: Partial<DurakArasiRing>) =>
    setRings((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const patchMakas = (rid: string, mid: string, p: Partial<DurakArasiRing["makaslar"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: r.makaslar.map((m) => (m.id === mid ? { ...m, ...p } : m)) } : r)));
  const patchHz = (rid: string, hid: string, p: Partial<DurakArasiRing["hemzeminler"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: r.hemzeminler.map((h) => (h.id === hid ? { ...h, ...p } : h)) } : r)));
  const patchTn = (rid: string, tid: string, p: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: r.tehlikeNoktalari.map((t) => (t.id === tid ? { ...t, ...p } : t)) } : r)));

  const ringEkle = () => {
    const son = rings[rings.length - 1];
    const r = yeniRing(son ? son.toAd : "Durak A", "Yeni Durak");
    setRings((rs) => [...rs, r]);
    setAcik((a) => ({ ...a, [r.id]: true }));
  };
  const ringSil = (id: string) => setRings((rs) => rs.filter((r) => r.id !== id));
  const sifirla = () => {
    sifirlaRings();
    setKapali(true);
    setAcik({});
  };

  const makasEkle = (rid: string, tip: MakasTip) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: [...r.makaslar, yeniMakas(tip, Math.round(r.uzunluk * 0.85))] } : r)));
  const makasSil = (rid: string, mid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: r.makaslar.filter((m) => m.id !== mid) } : r)));
  const hzEkle = (rid: string, tip: HemzeminTip) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: [...r.hemzeminler, yeniHemzemin(tip, Math.round(r.uzunluk * 0.5))] } : r)));
  const hzSil = (rid: string, hid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: r.hemzeminler.filter((h) => h.id !== hid) } : r)));
  const tnEkle = (rid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: [...r.tehlikeNoktalari, yeniTehlike(Math.round(r.uzunluk * 0.7))] } : r)));
  const tnSil = (rid: string, tid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: r.tehlikeNoktalari.filter((t) => t.id !== tid) } : r)));

  const maxWorst = Math.max(1, ...denge.perRing.map((p) => p.worstToplam));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Başlık */}
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Durak Arası Ring Editörü — Gerçek-Hayat İşletim Hücreleri</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{meta.hatAdi} · Loop Şartları</h1>
        </div>
        <button onClick={sifirla} className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
          ↺ Örnek hatta dön
        </button>
      </div>

      {/* Loop özeti + ölçeklenme */}
      <Panel baslik="Loop Özeti & Ölçeklenme" aciklama="Ringler zincirlenerek loop oluşturur. Worst-case (belge: 1500 m + makas + hemzemin) her hücrenin 240 s headway'e sığması gerekir. Tren sayısı arttıkça darboğaz en yavaş ringdir.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={araclar.some((a) => a.id === stock.id) ? stock.id : ""}
            onChange={(e) => { const v = araclar.find((a) => a.id === e.target.value); if (v) setStock({ ...v }); }}
            className="rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
            {araclar.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <label className="flex items-center gap-2 text-sm" style={{ color: brand.inkSoft }}>
            <input type="checkbox" checked={kapali} onChange={(e) => setKapali(e.target.checked)} />
            Kapalı hat (ring / sürekli loop)
          </label>
          <span className="text-xs" style={{ color: brand.muted }}>{kapali ? "Tur = ringlerin tek geçişi" : "Açık hat — tur gidiş+dönüş"}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat etiket="Ring (hücre) sayısı" deger={`${rings.length}`} alt={loopTam ? "şartlar tam ✓" : `${tumEksik.length} eksik`} vurgu={loopTam ? OK : brand.red} />
          <MiniStat etiket="Tur süresi (worst)" deger={sure(olcek.turSuresi)} alt={kapali ? "kapalı loop" : "gidiş+dönüş"} />
          <MiniStat etiket="Darboğaz ring" deger={olcek.darbogazRing ? sure(olcek.darbogazRing.worstToplam) : "—"} alt={olcek.darbogazRing?.ad ?? ""} vurgu={brand.red} />
          <MiniStat etiket={`${cfg.headway} s headway'de tren`} deger={`${olcek.maxTrenHedefHeadway}`} alt={olcek.headwayUygun ? "tüm ringler uygun ✓" : "ihlal var ⚠"} vurgu={olcek.headwayUygun ? OK : brand.red} />
        </div>

        {/* Denge — durak-çiftleri arası eşit şartlar */}
        <div className="mt-4">
          <div className="field-label mb-2 flex items-center justify-between">
            <span>Durak-çiftleri dengesi (eşit şartlar)</span>
            {denge.perRing.length > 0 && (
              <span style={{ color: denge.dengeli ? OK : brand.red }}>
                {denge.dengeli ? "✓ Dengeli — headway kararlı" : `⚠ Dengesiz (%${denge.sapmaYuzde.toFixed(0)} sapma) — en yavaş ring darboğaz`}
              </span>
            )}
          </div>
          <div className="flex h-28 items-end gap-1.5">
            {denge.perRing.map((p) => {
              const ihlal = p.worstToplam > cfg.headway;
              const col = ihlal ? brand.red : p.id === denge.enYavas?.id ? brand.redSoft : brand.route;
              return (
                <div key={p.id} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[0.6rem] font-medium" style={{ color: brand.faint }}>{sure(p.worstToplam)}</span>
                  <div className="w-full rounded-t transition-all" style={{ height: `${(p.worstToplam / maxWorst) * 100}%`, minHeight: 3, background: col }} title={p.ad} />
                  <span className="max-w-full truncate text-[0.6rem]" style={{ color: brand.faint }} title={p.ad}>{p.ad.split("→").pop()?.trim()}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[0.65rem]" style={{ color: brand.muted }}>
            <span>Ortalama {sure(denge.ortalama)}</span>
            <span>·</span>
            <span style={{ color: brand.red }}>■ 240 s ihlali / darboğaz</span>
          </div>
        </div>
      </Panel>

      {/* Eşit şartlar — durak-çiftleri dengeleme önerisi */}
      {oneriler.length > 0 && (
        <Panel baslik="Eşit Şartlar — Dengeleme Önerileri" aciklama="Best-case yakın-mesafe hedefi: durak-çiftleri arası worst-case süreler eşitlendikçe headway kararlı olur. Ortalamadan sapan ringler ve öneriler:">
          <div className="flex flex-col gap-1.5">
            {oneriler.map((o) => (
              <div key={o.ringId} className="flex items-start gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: o.fark > 0 ? brand.red + "55" : OK + "55", background: o.fark > 0 ? "#FDF4F5" : "#F2F9F5" }}>
                <span className="shrink-0 font-mono text-xs" style={{ color: o.fark > 0 ? brand.red : OK }}>{o.fark > 0 ? "+" : ""}{Math.round(o.fark)} s</span>
                <span className="font-medium" style={{ color: brand.ink }}>{o.ad}:</span>
                <span style={{ color: brand.inkSoft }}>{o.oneri}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Eksik şart uyarısı */}
      {tumEksik.length > 0 && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: brand.red, background: "#FDF2F4" }}>
          <div className="mb-1 text-sm font-semibold" style={{ color: brand.red }}>⚠ Zorunlu şartlar eksik — loop kurulamaz ({tumEksik.length})</div>
          <ul className="ml-4 list-disc text-xs" style={{ color: brand.inkSoft }}>
            {tumEksik.slice(0, 8).map((e, i) => (<li key={i}>{e.mesaj}</li>))}
            {tumEksik.length > 8 && <li>… ve {tumEksik.length - 8} tane daha</li>}
          </ul>
        </div>
      )}

      {/* Ring kartları */}
      <div className="mt-6 flex flex-col gap-4">
        {rings.map((r, i) => (
          <RingKart
            key={r.id}
            ring={r}
            index={i}
            stock={stock}
            acik={!!acik[r.id]}
            cfg={cfg}
            onToggle={() => setAcik((a) => ({ ...a, [r.id]: !a[r.id] }))}
            onPatch={(p) => patch(r.id, p)}
            onSil={() => ringSil(r.id)}
            onMakasEkle={(tip) => makasEkle(r.id, tip)}
            onMakasSil={(mid) => makasSil(r.id, mid)}
            onMakasPatch={(mid, p) => patchMakas(r.id, mid, p)}
            onHzEkle={(tip) => hzEkle(r.id, tip)}
            onHzSil={(hid) => hzSil(r.id, hid)}
            onHzPatch={(hid, p) => patchHz(r.id, hid, p)}
            onTnEkle={() => tnEkle(r.id)}
            onTnSil={(tid) => tnSil(r.id, tid)}
            onTnPatch={(tid, p) => patchTn(r.id, tid, p)}
          />
        ))}
      </div>

      <button onClick={ringEkle} className="mt-4 w-full rounded-lg border-2 border-dashed py-3 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
        ＋ Durak arası ring (hücre) ekle
      </button>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        AslanRAY · Ring editörü — canlı parametreler (Sistem Merkezi&apos;nden): sahasal {kmh(cfg.vSahasal).toFixed(0)} · makas {kmh(cfg.vMakas).toFixed(0)} · hemzemin {kmh(cfg.vHemzemin).toFixed(0)} km/h · a={cfg.ivme} b={cfg.yavaslama} m/s² · headway {cfg.headway} s
      </footer>
    </div>
  );
}

// ————————————————————————————————————————————————
// Ring kartı
// ————————————————————————————————————————————————

interface KartProps {
  ring: DurakArasiRing;
  index: number;
  stock: RollingStock;
  acik: boolean;
  cfg: SimConfig;
  onToggle: () => void;
  onPatch: (p: Partial<DurakArasiRing>) => void;
  onSil: () => void;
  onMakasEkle: (tip: MakasTip) => void;
  onMakasSil: (mid: string) => void;
  onMakasPatch: (mid: string, p: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onHzEkle: (tip: HemzeminTip) => void;
  onHzSil: (hid: string) => void;
  onHzPatch: (hid: string, p: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onTnEkle: () => void;
  onTnSil: (tid: string) => void;
  onTnPatch: (tid: string, p: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) => void;
}

function RingKart(p: KartProps) {
  const { ring, index, stock, cfg } = p;
  const eksik = useMemo(() => ringDogrula(ring, cfg), [ring, cfg]);
  const sen = useMemo(() => ringSenaryo(ring, stock, cfg), [ring, stock, cfg]);
  const challenge = useMemo(() => ringChallenge(ring, stock, cfg), [ring, stock, cfg]);
  const kisitlar = useMemo(() => ringKisitDizisi(ring), [ring]);
  const tam = eksik.length === 0;

  return (
    <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: tam ? brand.border : brand.red }}>
      {/* Başlık satırı */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: tam ? "#FBFCFD" : "#FDF2F4" }}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: brand.ink }}>{index + 1}</span>
        <button onClick={p.onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate font-brand text-sm font-semibold" style={{ color: brand.ink }}>{ring.fromAd} → {ring.toAd}</div>
          <div className="text-xs" style={{ color: brand.muted }}>
            {Math.round(ring.uzunluk)} m · {ring.makaslar.length} makas · {ring.hemzeminler.length} hemzemin
          </div>
        </button>
        <Rozet ok={tam} okText="Şartlar tam" hataText={`${eksik.length} eksik`} />
        <span className="hidden shrink-0 text-xs sm:inline" style={{ color: sen.headwayUygun ? OK : brand.red }}>
          worst {sure(sen.worstToplam)} {sen.headwayUygun ? "≤" : ">"} {cfg.headway} s
        </span>
        <button onClick={p.onToggle} className="rounded px-1.5 text-sm" style={{ color: brand.muted }}>{p.acik ? "▾" : "▸"}</button>
        <button onClick={p.onSil} title="Ringi sil" className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
      </div>

      {p.acik && (
        <div className="border-t p-4" style={{ borderColor: brand.border }}>
          {/* Duraklar + mesafe köşeleri */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <SubBaslik>Duraklar & Mesafe (worst ↔ best köşesi)</SubBaslik>
              <div className="grid grid-cols-2 gap-2">
                <Text label="Başlangıç durağı" value={ring.fromAd} onChange={(v) => p.onPatch({ fromAd: v })} />
                <Text label="Bitiş durağı" value={ring.toAd} onChange={(v) => p.onPatch({ toAd: v })} />
              </div>
              <div className="mt-2">
                <label className="field-label flex items-center justify-between">
                  <span>Nominal mesafe</span>
                  <span className="font-mono" style={{ color: brand.ink }}>{Math.round(ring.uzunluk)} m</span>
                </label>
                <input type="range" min={100} max={2000} step={10} value={ring.uzunluk}
                  onChange={(e) => p.onPatch({ uzunluk: parseInt(e.target.value) })}
                  className="mt-1 w-full" style={{ accentColor: brand.red }} />
                <div className="mt-1 flex justify-between text-[0.65rem]" style={{ color: brand.faint }}>
                  <span>best {Math.round(ring.bestUzunluk)} m</span>
                  <span>worst {Math.round(ring.worstUzunluk)} m</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Num label="Best-case mesafe" suffix="m" step={50} value={ring.bestUzunluk} onChange={(v) => p.onPatch({ bestUzunluk: v })} />
                <Num label="Worst-case mesafe" suffix="m" step={50} value={ring.worstUzunluk} onChange={(v) => p.onPatch({ worstUzunluk: v })} />
                <Num label="Sahasal azami" suffix="km/h" step={5} value={Math.round(kmh(ring.vmax))} onChange={(v) => p.onPatch({ vmax: v * KMH })} />
                <Num label="Eğim" suffix="‰" step={1} value={ring.egim} onChange={(v) => p.onPatch({ egim: v })} allowNeg />
                <Num label="Varış durak bekleme" suffix="s" step={5} value={ring.dwell} onChange={(v) => p.onPatch({ dwell: v })} />
              </div>
            </div>

            {/* Senaryo çıktısı */}
            <div>
              <SubBaslik>Senaryo Çıktısı</SubBaslik>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat etiket="Worst seyir" deger={sure(sen.worstSeyir)} alt="1500 m + kısıtlar" />
                <MiniStat etiket="Best seyir" deger={sure(sen.bestSeyir)} alt="yakın mesafe" />
                <MiniStat etiket="Makas/route ek" deger={`${sen.timingEk.toFixed(0)} s`} alt="tanzim + release" />
                <MiniStat etiket="Worst toplam" deger={sure(sen.worstToplam)} alt="+ bekleme" vurgu={sen.headwayUygun ? OK : brand.red} />
              </div>
              <div className="mt-2 rounded border p-2.5 text-xs" style={{ borderColor: sen.headwayUygun ? OK : brand.red, background: sen.headwayUygun ? "#F0F9F4" : "#FDF2F4" }}>
                {sen.headwayUygun ? (
                  <span style={{ color: OK }}>✓ {cfg.headway} s headway&apos;e sığıyor — <b>{Math.round(sen.headwayPayi)} s</b> marj.</span>
                ) : (
                  <span style={{ color: brand.red }}>⚠ {cfg.headway} s headway ihlali — <b>{Math.round(-sen.headwayPayi)} s</b> aşım. Mesafeyi kısalt veya kısıtları azalt.</span>
                )}
              </div>
            </div>
          </div>

          {/* Kısıtlar arası mesafe ("şartları arası mesafeleri") */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <SubBaslik>Kısıtlar & Aralarındaki Mesafeler</SubBaslik>
            {kisitlar.length === 0 ? (
              <p className="mt-2 text-xs" style={{ color: brand.faint }}>Ringde makas/hemzemin/tehlike kısıtı yok — kesintisiz seyir.</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[0.7rem]">
                <KisitRozet tur="durak" ad={ring.fromAd} konum={0} />
                {kisitlar.map((k, i) => (
                  <span key={k.id} className="flex items-center gap-1">
                    <span className="font-mono" style={{ color: brand.faint }}>
                      —{Math.round(k.konum - (i === 0 ? 0 : kisitlar[i - 1].konum))}m→
                    </span>
                    <KisitRozet tur={k.tur} ad={k.ad} konum={k.konum} detay={k.detay} />
                  </span>
                ))}
                <span className="font-mono" style={{ color: brand.faint }}>—{Math.round(ring.uzunluk - kisitlar[kisitlar.length - 1].konum)}m→</span>
                <KisitRozet tur="durak" ad={ring.toAd} konum={ring.uzunluk} />
              </div>
            )}
          </div>

          {/* Challenge (karşılaşılabilecek zorluklar) */}
          {challenge.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
              <SubBaslik>Challenge — Karşılaşılabilecek Durumlar</SubBaslik>
              <div className="mt-2 flex flex-col gap-1.5">
                {challenge.map((c, i) => {
                  const renk = c.seviye === "kritik" ? brand.red : c.seviye === "uyari" ? "#A8842C" : brand.muted;
                  return (
                    <div key={i} className="flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs" style={{ borderColor: renk + "55", background: renk + "0F" }}>
                      <span className="shrink-0 font-medium" style={{ color: renk }}>{c.seviye === "kritik" ? "⚠" : c.seviye === "uyari" ? "▲" : "•"} {c.baslik}:</span>
                      <span style={{ color: brand.inkSoft }}>{c.mesaj}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Makas bölgeleri */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <SubBaslik>Makas Bölgeleri (zorunlu şart)</SubBaslik>
              <MakasEkleMenu onEkle={p.onMakasEkle} />
            </div>
            {ring.makaslar.length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Bu ringde makas bölgesi yok. Varsa yukarıdan ekleyin (konum + tip + 15 km/h geçiş zorunlu).</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ring.makaslar.map((m) => {
                  const konumHatali = m.konum < 0 || m.konum > ring.uzunluk;
                  const tccHatali = tccGerekli(m.tip) && !m.tccZorunlu;
                  return (
                    <div key={m.id} className="rounded border p-2" style={{ borderColor: konumHatali || tccHatali ? brand.red : brand.border }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={m.tip} onChange={(e) => { const tip = e.target.value as MakasTip; p.onMakasPatch(m.id, { tip, tccZorunlu: tccGerekli(tip), routeRelease: tip === "depo" ? cfg.routeReleaseDepo : cfg.routeReleaseAnahat }); }}
                          className="rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }}>
                          {(Object.keys(MAKAS_TIP_AD) as MakasTip[]).map((t) => (<option key={t} value={t}>{MAKAS_TIP_AD[t]}</option>))}
                        </select>
                        <input value={m.ad} placeholder="ad (ör. 1. Makas)" onChange={(e) => p.onMakasPatch(m.id, { ad: e.target.value })}
                          className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                        <Link href={`/anklasman?bolge=${bolgeIdIcin(m.tip)}`} title="Bu makasın anklaşman modelini aç"
                          className="rounded px-2 py-1 text-[0.65rem] font-medium transition hover:opacity-80" style={{ background: "#EDF0F3", color: brand.ink }}>
                          anklaşman →
                        </Link>
                        <button onClick={() => p.onMakasSil(m.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <Num label="Konum" suffix="m" step={10} value={m.konum} onChange={(v) => p.onMakasPatch(m.id, { konum: v })} hata={konumHatali} />
                        <Num label="Geçiş hızı" suffix="km/h" step={1} value={Math.round(kmh(m.gecisHizi))} onChange={(v) => p.onMakasPatch(m.id, { gecisHizi: v * KMH })} />
                        <Num label="Makas sayısı" suffix="ad" step={1} value={m.makasSayisi} onChange={(v) => p.onMakasPatch(m.id, { makasSayisi: Math.max(1, Math.round(v)) })} />
                        <Num label="Adım süresi" suffix="s" step={1} value={m.makasAdimSuresi} onChange={(v) => p.onMakasPatch(m.id, { makasAdimSuresi: v })} />
                        <Num label="Route release" suffix="s" step={1} value={m.routeRelease} onChange={(v) => p.onMakasPatch(m.id, { routeRelease: v })} />
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: tccHatali ? brand.red : brand.inkSoft }}>
                        <input type="checkbox" checked={m.tccZorunlu} onChange={(e) => p.onMakasPatch(m.id, { tccZorunlu: e.target.checked })} />
                        Her geçişte TCC onayı {tccGerekli(m.tip) && <span style={{ color: brand.red }}>(bu tip için zorunlu)</span>}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hemzemin / yaya geçitleri */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <SubBaslik>Hemzemin & Yaya Geçitleri</SubBaslik>
              <div className="flex gap-1">
                <button onClick={() => p.onHzEkle("yaya")} className="rounded px-2 py-1 text-xs font-medium" style={{ background: "#EDF0F3", color: brand.inkSoft }}>＋ yaya</button>
                <button onClick={() => p.onHzEkle("karayolu")} className="rounded px-2 py-1 text-xs font-medium" style={{ background: "#EDF0F3", color: brand.inkSoft }}>＋ karayolu</button>
              </div>
            </div>
            {ring.hemzeminler.length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Hemzemin/yaya geçidi yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ring.hemzeminler.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-2 rounded border p-2" style={{ borderColor: brand.border }}>
                    <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium" style={{ background: h.tip === "yaya" ? "#EAF2FB" : "#FBF0EA", color: brand.inkSoft }}>{h.tip}</span>
                    <input value={h.ad} placeholder="ad" onChange={(e) => p.onHzPatch(h.id, { ad: e.target.value })}
                      className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                    <div className="w-24"><Num label="Konum" suffix="m" step={10} value={h.konum} onChange={(v) => p.onHzPatch(h.id, { konum: v })} hata={h.konum < 0 || h.konum > ring.uzunluk} /></div>
                    <div className="w-24"><Num label="Hız" suffix="km/h" step={1} value={Math.round(kmh(h.hiz))} onChange={(v) => p.onHzPatch(h.id, { hiz: v * KMH })} /></div>
                    <button onClick={() => p.onHzSil(h.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tehlike / acil frenleme noktaları */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <SubBaslik>Tehlike / Acil Frenleme Noktaları</SubBaslik>
              <button onClick={p.onTnEkle} className="rounded px-2 py-1 text-xs font-medium" style={{ background: "#EDF0F3", color: brand.inkSoft }}>＋ ekle</button>
            </div>
            {ring.tehlikeNoktalari.length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Tehlike noktası yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ring.tehlikeNoktalari.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border p-2" style={{ borderColor: brand.border }}>
                    <input value={t.ad} placeholder="ad" onChange={(e) => p.onTnPatch(t.id, { ad: e.target.value })}
                      className="w-32 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                    <input value={t.aciklama} placeholder="açıklama" onChange={(e) => p.onTnPatch(t.id, { aciklama: e.target.value })}
                      className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                    <div className="w-24"><Num label="Konum" suffix="m" step={10} value={t.konum} onChange={(v) => p.onTnPatch(t.id, { konum: v })} hata={t.konum < 0 || t.konum > ring.uzunluk} /></div>
                    <div className="w-24"><Num label="Acil hız" suffix="km/h" step={1} value={Math.round(kmh(t.hiz))} onChange={(v) => p.onTnPatch(t.id, { hiz: v * KMH })} /></div>
                    <button onClick={() => p.onTnSil(t.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Eksik listesi */}
          {eksik.length > 0 && (
            <ul className="mt-3 ml-4 list-disc text-xs" style={{ color: brand.red }}>
              {eksik.map((e, i) => (<li key={i}>{e.mesaj}</li>))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————
// Küçük yardımcılar
// ————————————————————————————————————————————————

const KISIT_RENK: Record<KisitTur | "durak", string> = {
  durak: brand.ink,
  makas: "#A8842C",
  hemzemin: "#0C6DB8",
  tehlike: brand.red,
};
const KISIT_IKON: Record<KisitTur | "durak", string> = { durak: "◉", makas: "⑂", hemzemin: "⊞", tehlike: "▲" };

function KisitRozet({ tur, ad, konum, detay }: { tur: KisitTur | "durak"; ad: string; konum: number; detay?: string }) {
  const renk = KISIT_RENK[tur];
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: renk + "14", color: renk }}
      title={`${ad} · ${Math.round(konum)} m${detay ? " · " + detay : ""}`}>
      <span>{KISIT_IKON[tur]}</span>
      <span className="max-w-[9rem] truncate font-medium">{ad}</span>
    </span>
  );
}

function MakasEkleMenu({ onEkle }: { onEkle: (t: MakasTip) => void }) {
  const [ac, setAc] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setAc((v) => !v)} className="rounded px-2 py-1 text-xs font-medium text-white" style={{ background: brand.ink }}>＋ makas bölgesi</button>
      {ac && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded-md border bg-white py-1 shadow-lg" style={{ borderColor: brand.border }} onMouseLeave={() => setAc(false)}>
          {(Object.keys(MAKAS_TIP_AD) as MakasTip[]).map((t) => (
            <button key={t} onClick={() => { onEkle(t); setAc(false); }} className="block w-full px-3 py-1.5 text-left text-xs transition hover:bg-slate-50" style={{ color: brand.ink }}>{MAKAS_TIP_AD[t]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Rozet({ ok, okText, hataText }: { ok: boolean; okText: string; hataText: string }) {
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium" style={ok ? { background: "#E6F4EC", color: OK } : { background: "#FBE9EC", color: brand.red }}>
      {ok ? `✓ ${okText}` : `⚠ ${hataText}`}
    </span>
  );
}

function Num({ label, value, onChange, step, suffix, hata, allowNeg }: { label: string; value: number; onChange: (v: number) => void; step: number; suffix: string; hata?: boolean; allowNeg?: boolean }) {
  return (
    <label className="block">
      <span className="field-label" style={{ fontSize: "0.6rem" }}>{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <input type="number" value={value} step={step} onChange={(e) => { const v = parseFloat(e.target.value) || 0; onChange(allowNeg ? v : Math.max(0, v)); }}
          className="w-full rounded border px-1.5 py-1 text-right text-sm" style={{ borderColor: hata ? brand.red : brand.border, color: hata ? brand.red : brand.ink }} />
        <span className="text-[0.65rem]" style={{ color: brand.muted }}>{suffix}</span>
      </div>
    </label>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="field-label" style={{ fontSize: "0.6rem" }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
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
