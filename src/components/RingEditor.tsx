"use client";

// raysim — DURAK ARASI RİNG editörü.
// Her durak-arası hücrenin ZORUNLU şartları girilir/düzenlenir (mesafe, makas
// bölgeleri, hemzemin, tehlike noktaları). Her değişiklikte worst/best köşeleri,
// headway (240 s) uygunluğu, durak-çiftleri arası denge ve tren-sayısı
// darboğazı anında yeniden hesaplanır. Hücreler bir loop (kapalı hat) oluşturur.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RollingStock } from "@/lib/anaray/types";
import { makasBolgeId } from "@/lib/anaray/interlocking";
import { useSimConfig, useProje } from "@/components/SimConfigProvider";
import type { SimConfig } from "@/lib/anaray/config";
import { araclar, varsayilanArac } from "@/lib/anaray/vehicles";
import { brand } from "@/lib/anaray/brand";
import { CK, SERI } from "@/lib/anaray/chartkit";
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
const OK = CK.good;

export function RingEditor() {
  const { cfg } = useSimConfig();
  const { rings, setRings, sifirlaRings, meta, yonetici, yukleniyor } = useProje();
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

  // Ekleme fonksiyonları opsiyonel KONUM + EKSTRA parametre alır. Şeritten tıkla-
  // ekle akışı önce el kitabı varsayılanlı bir form açar, kullanıcı süre-etkileyen
  // alanları (motor süresi, route release, hız…) ayarlayınca bu ekstra ile ekler.
  const makasEkle = (rid: string, tip: MakasTip, konum?: number, ekstra?: Partial<DurakArasiRing["makaslar"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: [...r.makaslar, { ...yeniMakas(tip, konum ?? Math.round(r.uzunluk * 0.85)), ...ekstra }] } : r)));
  const makasSil = (rid: string, mid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: r.makaslar.filter((m) => m.id !== mid) } : r)));
  const hzEkle = (rid: string, tip: HemzeminTip, konum?: number, ekstra?: Partial<DurakArasiRing["hemzeminler"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: [...r.hemzeminler, { ...yeniHemzemin(tip, konum ?? Math.round(r.uzunluk * 0.5)), ...ekstra }] } : r)));
  const hzSil = (rid: string, hid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: r.hemzeminler.filter((h) => h.id !== hid) } : r)));
  const tnEkle = (rid: string, konum?: number, ekstra?: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: [...r.tehlikeNoktalari, { ...yeniTehlike(konum ?? Math.round(r.uzunluk * 0.7)), ...ekstra }] } : r)));
  const tnSil = (rid: string, tid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: r.tehlikeNoktalari.filter((t) => t.id !== tid) } : r)));

  const maxWorst = Math.max(1, ...denge.perRing.map((p) => p.worstToplam));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Başlık */}
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Durak Arası Ring Editörü — Gerçek-Hayat İşletim Hücreleri</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{meta.hatAdi || "Adsız Hat"} · Loop Şartları</h1>
        </div>
        <button
          onClick={() => {
            if (!yonetici && rings.length > 0 && !confirm("Bu hattın tüm ringleri silinsin mi? (geri alınamaz)")) return;
            sifirla();
          }}
          className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
          {yonetici ? "↺ Vitrin hattına dön" : "🗑 Hattı temizle"}
        </button>
      </div>

      {/* Loop özeti + ölçeklenme — hat boşken gösterilecek bir ölçek yok */}
      {rings.length > 0 && (
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
      )}

      {/* Eşit şartlar — durak-çiftleri dengeleme önerisi */}
      {oneriler.length > 0 && (
        <Panel baslik="Eşit Şartlar — Dengeleme Önerileri" aciklama="Best-case yakın-mesafe hedefi: durak-çiftleri arası worst-case süreler eşitlendikçe headway kararlı olur. Ortalamadan sapan ringler ve öneriler:">
          <div className="flex flex-col gap-1.5">
            {oneriler.map((o) => (
              <div key={o.ringId} className="flex items-start gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: o.fark > 0 ? brand.red + "55" : OK + "55", background: o.fark > 0 ? CK.badBgSoft : CK.goodBgSoft }}>
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
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: brand.red, background: CK.badBgSoft }}>
          <div className="mb-1 text-sm font-semibold" style={{ color: brand.red }}>⚠ Zorunlu şartlar eksik — loop kurulamaz ({tumEksik.length})</div>
          <ul className="ml-4 list-disc text-xs" style={{ color: brand.inkSoft }}>
            {tumEksik.slice(0, 8).map((e, i) => (<li key={i}>{e.mesaj}</li>))}
            {tumEksik.length > 8 && <li>… ve {tumEksik.length - 8} tane daha</li>}
          </ul>
        </div>
      )}

      {/* Hat verisi yükleniyorken (girişli hesapta sayfa yenileme) rings henüz []'dir.
          "Hattınız boş / ring ekle" davetini burada göstermek, veri gelince kaybolan
          bir "aç-kapa" titremesine yol açıyordu; yükleme bitene kadar nötr bir yer
          tutucu gösterip gerçek boşluk kararını veriye bırakıyoruz. */}
      {yukleniyor && rings.length === 0 && (
        <div className="mt-6 rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm" style={{ borderColor: brand.border, color: brand.muted }}>
          ⟳ Hat yükleniyor…
        </div>
      )}

      {/* Hat boşsa: ilk adım burasıdır — kullanıcı hattını buradan kurmaya başlar.
          Yalnız yükleme bittikten sonra ("gerçekten boş" olduğu kesinken) gösterilir. */}
      {!yukleniyor && rings.length === 0 && (
        <div className="mt-6 rounded-lg border-2 border-dashed px-6 py-8 text-center" style={{ borderColor: brand.border }}>
          <div className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>Hattınız boş</div>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-relaxed" style={{ color: brand.muted }}>
            Her <b>ring</b>, iki durak arasındaki işletim hücresidir: mesafe, duruş süresi, üzerindeki
            makaslar, hemzemin geçitler ve tehlike noktaları. Ringleri sırayla ekleyerek hattı kurun —
            diğer altı modül aynı anda bu hatta göre hesaplamaya başlar.
          </p>
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
            onMakasEkle={(tip, konum, ekstra) => makasEkle(r.id, tip, konum, ekstra)}
            onMakasSil={(mid) => makasSil(r.id, mid)}
            onMakasPatch={(mid, p) => patchMakas(r.id, mid, p)}
            onHzEkle={(tip, konum, ekstra) => hzEkle(r.id, tip, konum, ekstra)}
            onHzSil={(hid) => hzSil(r.id, hid)}
            onHzPatch={(hid, p) => patchHz(r.id, hid, p)}
            onTnEkle={(konum, ekstra) => tnEkle(r.id, konum, ekstra)}
            onTnSil={(tid) => tnSil(r.id, tid)}
            onTnPatch={(tid, p) => patchTn(r.id, tid, p)}
          />
        ))}
      </div>

      <button onClick={ringEkle} className="mt-4 w-full rounded-lg border-2 border-dashed py-3 text-sm font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
        ＋ Durak arası ring (hücre) ekle
      </button>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Ring editörü — canlı parametreler (Sistem Merkezi&apos;nden): sahasal {kmh(cfg.vSahasal).toFixed(0)} · makas {kmh(cfg.vMakas).toFixed(0)} · hemzemin {kmh(cfg.vHemzemin).toFixed(0)} km/h · a={cfg.ivme} b={cfg.yavaslama} m/s² · headway {cfg.headway} s
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
  onMakasEkle: (tip: MakasTip, konum?: number, ekstra?: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onMakasSil: (mid: string) => void;
  onMakasPatch: (mid: string, p: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onHzEkle: (tip: HemzeminTip, konum?: number, ekstra?: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onHzSil: (hid: string) => void;
  onHzPatch: (hid: string, p: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onTnEkle: (konum?: number, ekstra?: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) => void;
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

  // Konum ↔ SÜRE dönüşümü (yaklaşık): trenin durak başından o noktaya varış
  // süresi. worst seyir süresini konuma orantılar (hızlanma/yavaşlama ihmalli,
  // "sürelendirme" göstergesi için yeterli). Çift yönlü: kullanıcı süre girince
  // konuma çevrilir, konum değişince süre türetilir.
  const konumSuresi = (konum: number) => (ring.uzunluk > 0 ? (konum / ring.uzunluk) * sen.worstSeyir : 0);
  const sureKonumu = (saniye: number) => (sen.worstSeyir > 0 ? Math.max(0, Math.min(ring.uzunluk, (saniye / sen.worstSeyir) * ring.uzunluk)) : 0);

  // Görsel şerit: ekleme modu + sürükle-taşı/tıkla-ekle köprüsü.
  const [ekleTuru, setEkleTuru] = useState<EkleTur | null>(null);
  // Şeride tıklanınca hemen eklemek yerine, süre-etkileyen parametreleri el kitabı
  // varsayılanıyla soran bir form açılır (bkz. EkleFormu).
  const [bekleyen, setBekleyen] = useState<{ tur: EkleTur; konum: number } | null>(null);
  const seritTasi = (tur: KisitTur, id: string, konum: number) => {
    if (tur === "makas") p.onMakasPatch(id, { konum });
    else if (tur === "hemzemin") p.onHzPatch(id, { konum });
    else p.onTnPatch(id, { konum });
  };
  const seritEkle = (konum: number) => {
    if (!ekleTuru) return;
    setBekleyen({ tur: ekleTuru, konum }); // form aç
    setEkleTuru(null);
  };
  const ekleOnayla = (konum: number, ekstra: Record<string, unknown>) => {
    if (!bekleyen) return;
    const t = bekleyen.tur;
    if (t.kind === "makas") p.onMakasEkle((ekstra.tip as MakasTip) ?? t.tip, konum, ekstra);
    else if (t.kind === "hemzemin") p.onHzEkle(t.tip, konum, ekstra);
    else p.onTnEkle(konum, ekstra);
    setBekleyen(null);
  };

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
                <Num label="Varış durak bekleme" suffix="s" step={5} value={ring.dwell} onChange={(v) => p.onPatch({ dwell: v })} />
              </div>
              {/* Eğim ikincil: tramvay hatları genelde düz (varsayılan 0). Gerekirse
                  burada girilir ya da Coğrafi modülünde GTFS yüksekliğinden otomatik gelir. */}
              <details className="mt-2">
                <summary className="field-label cursor-pointer select-none" style={{ color: brand.faint }}>
                  Gelişmiş · eğim {ring.egim ? `(${ring.egim}‰)` : "(düz)"}
                </summary>
                <div className="mt-1 w-40">
                  <Num label="Eğim" suffix="‰" step={1} value={ring.egim} onChange={(v) => p.onPatch({ egim: v })} allowNeg />
                  <p className="mt-1 text-[0.62rem]" style={{ color: brand.faint }}>Tramvayda çoğunlukla 0. Coğrafi modülünde GTFS yüksekliği varsa otomatik hesaplanır.</p>
                </div>
              </details>
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
              <div className="mt-2 rounded border p-2.5 text-xs" style={{ borderColor: sen.headwayUygun ? OK : brand.red, background: sen.headwayUygun ? CK.goodBgSoft : CK.badBgSoft }}>
                {sen.headwayUygun ? (
                  <span style={{ color: OK }}>✓ {cfg.headway} s headway&apos;e sığıyor — <b>{Math.round(sen.headwayPayi)} s</b> marj.</span>
                ) : (
                  <span style={{ color: brand.red }}>⚠ {cfg.headway} s headway ihlali — <b>{Math.round(-sen.headwayPayi)} s</b> aşım. Mesafeyi kısalt veya kısıtları azalt.</span>
                )}
              </div>
            </div>
          </div>

          {/* Kısıtlar arası mesafe + GÖRSEL ZAMAN/MESAFE ŞERİDİ */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SubBaslik>Kısıtlar & Zaman/Mesafe Şeridi</SubBaslik>
              {/* Şeride ekleme modu — bir tür seç, sonra şeride tıkla */}
              <div className="flex flex-wrap gap-1 text-[0.7rem]">
                <SeritEkleBtn aktif={ekleTuru?.kind === "makas"} renk={SERI.makasBlok}
                  onClick={() => setEkleTuru((e) => (e?.kind === "makas" ? null : { kind: "makas", tip: "headway" }))}>＋ makas</SeritEkleBtn>
                <SeritEkleBtn aktif={ekleTuru?.kind === "hemzemin" && ekleTuru.tip === "yaya"} renk={SERI.duzBlok}
                  onClick={() => setEkleTuru((e) => (e?.kind === "hemzemin" && e.tip === "yaya" ? null : { kind: "hemzemin", tip: "yaya" }))}>＋ yaya</SeritEkleBtn>
                <SeritEkleBtn aktif={ekleTuru?.kind === "hemzemin" && ekleTuru.tip === "karayolu"} renk={SERI.duzBlok}
                  onClick={() => setEkleTuru((e) => (e?.kind === "hemzemin" && e.tip === "karayolu" ? null : { kind: "hemzemin", tip: "karayolu" }))}>＋ karayolu</SeritEkleBtn>
                <SeritEkleBtn aktif={ekleTuru?.kind === "tehlike"} renk={brand.red}
                  onClick={() => setEkleTuru((e) => (e?.kind === "tehlike" ? null : { kind: "tehlike" }))}>＋ acil fren</SeritEkleBtn>
              </div>
            </div>

            <KisitSeridi ring={ring} kisitlar={kisitlar} konumSuresi={konumSuresi}
              onTasi={seritTasi} ekleTuru={ekleTuru} onSeritEkle={seritEkle} />

            {/* Ekleme parametre formu — süre-etkileyen alanlar el kitabı değeriyle ön-dolu */}
            {bekleyen && (
              <EkleFormu
                tur={bekleyen.tur}
                konum={bekleyen.konum}
                uzunluk={ring.uzunluk}
                konumSuresi={konumSuresi}
                sureKonumu={sureKonumu}
                onIptal={() => setBekleyen(null)}
                onEkle={ekleOnayla}
              />
            )}

            {kisitlar.length === 0 ? (
              <p className="mt-6 text-xs" style={{ color: brand.faint }}>Ringde makas/hemzemin/tehlike kısıtı yok — kesintisiz seyir. Yukarıdan bir tür seçip şeride tıklayarak ekleyin.</p>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-1 text-[0.7rem]">
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
                  const renk = c.seviye === "kritik" ? brand.red : c.seviye === "uyari" ? CK.amber : brand.muted;
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
                        <Link href={`/anklasman?bolge=${makasBolgeId(m)}`} title="Bu makasın anklaşman modelini aç"
                          className="rounded px-2 py-1 text-[0.65rem] font-medium transition hover:opacity-80" style={{ background: CK.track, color: brand.ink }}>
                          anklaşman →
                        </Link>
                        <button onClick={() => p.onMakasSil(m.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                        <Num label="Konum" suffix="m" step={10} value={m.konum} onChange={(v) => p.onMakasPatch(m.id, { konum: v })} hata={konumHatali} />
                        <Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(m.konum))} onChange={(v) => p.onMakasPatch(m.id, { konum: Math.round(sureKonumu(v)) })} />
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
                <button onClick={() => p.onHzEkle("yaya")} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ yaya</button>
                <button onClick={() => p.onHzEkle("karayolu")} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ karayolu</button>
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
                    <div className="w-20"><Num label="Konum" suffix="m" step={10} value={h.konum} onChange={(v) => p.onHzPatch(h.id, { konum: v })} hata={h.konum < 0 || h.konum > ring.uzunluk} /></div>
                    <div className="w-20"><Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(h.konum))} onChange={(v) => p.onHzPatch(h.id, { konum: Math.round(sureKonumu(v)) })} /></div>
                    <div className="w-20"><Num label="Hız" suffix="km/h" step={1} value={Math.round(kmh(h.hiz))} onChange={(v) => p.onHzPatch(h.id, { hiz: v * KMH })} /></div>
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
              <button onClick={() => p.onTnEkle()} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ ekle</button>
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
                    <div className="w-20"><Num label="Konum" suffix="m" step={10} value={t.konum} onChange={(v) => p.onTnPatch(t.id, { konum: v })} hata={t.konum < 0 || t.konum > ring.uzunluk} /></div>
                    <div className="w-20"><Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(t.konum))} onChange={(v) => p.onTnPatch(t.id, { konum: Math.round(sureKonumu(v)) })} /></div>
                    <div className="w-20"><Num label="Acil hız" suffix="km/h" step={1} value={Math.round(kmh(t.hiz))} onChange={(v) => p.onTnPatch(t.id, { hiz: v * KMH })} /></div>
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

/** Şeritten ekleme modu: hangi tür kısıt bir sonraki tıklamada eklenecek. */
type EkleTur =
  | { kind: "makas"; tip: MakasTip }
  | { kind: "hemzemin"; tip: HemzeminTip }
  | { kind: "tehlike" };

const KISIT_RENK: Record<KisitTur | "durak", string> = {
  durak: brand.ink,
  makas: SERI.makasBlok,
  hemzemin: SERI.duzBlok,
  tehlike: brand.red,
};
const KISIT_IKON: Record<KisitTur | "durak", string> = { durak: "◉", makas: "⑂", hemzemin: "⊞", tehlike: "▲" };

/**
 * Görsel zaman/mesafe şeridi: ring boyunca kısıtları (makas/hemzemin/tehlike)
 * nokta olarak gösterir; her nokta SÜRÜKLENEREK taşınır (konum canlı güncellenir).
 * Uçlarda duraklar sabit. Üstte mesafe, altta yaklaşık süre ekseni. Boş yere
 * tıklama, seçili "ekleme türü" varsa o konuma yeni kısıt ekler.
 */
function KisitSeridi({ ring, kisitlar, konumSuresi, onTasi, ekleTuru, onSeritEkle }: {
  ring: DurakArasiRing;
  kisitlar: ReturnType<typeof ringKisitDizisi>;
  konumSuresi: (konum: number) => number;
  onTasi: (tur: KisitTur, id: string, konum: number) => void;
  ekleTuru: EkleTur | null;
  onSeritEkle: (konum: number) => void;
}) {
  const refBar = useRef<HTMLDivElement>(null);
  const [surukle, setSurukle] = useState<{ tur: KisitTur; id: string } | null>(null);

  const konumdan = (clientX: number): number => {
    const el = refBar.current;
    if (!el || ring.uzunluk <= 0) return 0;
    const r = el.getBoundingClientRect();
    const oran = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(oran * ring.uzunluk);
  };

  useEffect(() => {
    if (!surukle) return;
    const move = (e: PointerEvent) => onTasi(surukle.tur, surukle.id, konumdan(e.clientX));
    const up = () => setSurukle(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surukle]);

  return (
    <div className="mt-3 select-none">
      <div className="mb-1 flex justify-between text-[0.62rem]" style={{ color: brand.faint }}>
        <span>0 m · 0 s</span>
        <span>{ekleTuru ? "şeride tıkla → buraya ekle" : "noktayı sürükle → taşı"}</span>
        <span>{Math.round(ring.uzunluk)} m · ≈{Math.round(konumSuresi(ring.uzunluk))} s</span>
      </div>
      <div
        ref={refBar}
        onPointerDown={(e) => { if (ekleTuru) onSeritEkle(konumdan(e.clientX)); }}
        className="relative h-11 rounded"
        style={{ background: CK.track, cursor: ekleTuru ? "copy" : "default" }}
      >
        {/* Uç duraklar */}
        <SeritDurak sol={0} ad={ring.fromAd} />
        <SeritDurak sol={100} ad={ring.toAd} sag />
        {/* Kısıtlar */}
        {kisitlar.map((k) => {
          const sol = ring.uzunluk > 0 ? (k.konum / ring.uzunluk) * 100 : 0;
          const renk = KISIT_RENK[k.tur];
          return (
            <button
              key={k.id}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setSurukle({ tur: k.tur, id: k.id }); }}
              title={`${k.ad} · ${Math.round(k.konum)} m · ≈${Math.round(konumSuresi(k.konum))} s — sürükleyip taşıyın`}
              className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${sol}%`, cursor: "grab" }}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem] text-white shadow" style={{ background: renk }}>
                {KISIT_IKON[k.tur]}
              </span>
              <span className="mt-0.5 whitespace-nowrap font-mono text-[0.55rem]" style={{ color: renk }}>
                ≈{Math.round(konumSuresi(k.konum))}s
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Ekleme parametre formu: şeride tıklanınca açılır. Kısıtın SÜRE-ETKİLEYEN
 * alanları (makas motoru/adım süresi, route release, geçiş hızı; geçit/fren hızı)
 * el kitabı (MAZ-VA-AKS-001) varsayılanıyla ÖN-DOLU gelir; kullanıcı ayarlayıp
 * onaylayınca eklenir. Konum metre↔saniye çift yönlü.
 */
function EkleFormu({ tur, konum: konum0, uzunluk, konumSuresi, sureKonumu, onIptal, onEkle }: {
  tur: EkleTur;
  konum: number;
  uzunluk: number;
  konumSuresi: (k: number) => number;
  sureKonumu: (s: number) => number;
  onIptal: () => void;
  onEkle: (konum: number, ekstra: Record<string, unknown>) => void;
}) {
  const [konum, setKonum] = useState(Math.round(konum0));
  // Makas varsayılanları el kitabından (yeniMakas → BELGE değerleri)
  const mBasla = tur.kind === "makas" ? tur.tip : "headway";
  const [mtip, setMtip] = useState<MakasTip>(mBasla);
  const mv0 = yeniMakas(mBasla, konum0);
  const [gecisHizi, setGecisHizi] = useState(Math.round(kmh(mv0.gecisHizi)));
  const [makasSayisi, setMakasSayisi] = useState(mv0.makasSayisi);
  const [adim, setAdim] = useState(mv0.makasAdimSuresi);
  const [release, setRelease] = useState(mv0.routeRelease);
  // Geçit / fren hızı varsayılanı
  const hizVars = tur.kind === "hemzemin"
    ? Math.round(kmh(yeniHemzemin(tur.tip, konum0).hiz))
    : Math.round(kmh(yeniTehlike(konum0).hiz));
  const [hiz, setHiz] = useState(hizVars);

  const baslik = tur.kind === "makas" ? "Makas bölgesi ekle"
    : tur.kind === "hemzemin" ? `${tur.tip === "yaya" ? "Yaya" : "Karayolu"} geçidi ekle`
    : "Acil frenleme noktası ekle";

  const kaydet = () => {
    if (tur.kind === "makas") {
      onEkle(konum, { tip: mtip, gecisHizi: gecisHizi * KMH, makasSayisi, makasAdimSuresi: adim, routeRelease: release, tccZorunlu: tccGerekli(mtip) });
    } else {
      onEkle(konum, { hiz: hiz * KMH });
    }
  };

  return (
    <div className="mt-3 rounded-lg border-2 p-3" style={{ borderColor: brand.red, background: "#FDF6F7" }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <span className="font-brand text-sm font-semibold" style={{ color: brand.ink }}>{baslik}</span>
        <span className="text-[0.65rem]" style={{ color: brand.muted }}>süreler el kitabından (MAZ-VA-AKS-001) ön-dolu · ayarlayıp ekleyin</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Num label="Konum" suffix="m" step={10} value={konum} onChange={(v) => setKonum(Math.max(0, Math.min(uzunluk, v)))} hata={konum < 0 || konum > uzunluk} />
        <Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(konum))} onChange={(v) => setKonum(Math.round(sureKonumu(v)))} />
        {tur.kind === "makas" ? (
          <>
            <label className="flex flex-col">
              <span className="field-label">Makas tipi</span>
              <select value={mtip}
                onChange={(e) => { const t = e.target.value as MakasTip; setMtip(t); const nv = yeniMakas(t, konum); setGecisHizi(Math.round(kmh(nv.gecisHizi))); setMakasSayisi(nv.makasSayisi); setAdim(nv.makasAdimSuresi); setRelease(nv.routeRelease); }}
                className="mt-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }}>
                {(Object.keys(MAKAS_TIP_AD) as MakasTip[]).map((t) => (<option key={t} value={t}>{MAKAS_TIP_AD[t]}</option>))}
              </select>
            </label>
            <Num label="Geçiş hızı" suffix="km/h" step={1} value={gecisHizi} onChange={setGecisHizi} />
            <Num label="Makas sayısı" suffix="ad" step={1} value={makasSayisi} onChange={(v) => setMakasSayisi(Math.max(1, Math.round(v)))} />
            <Num label="Motor/adım süresi" suffix="s" step={1} value={adim} onChange={setAdim} />
            <Num label="Route release" suffix="s" step={1} value={release} onChange={setRelease} />
          </>
        ) : (
          <Num label={tur.kind === "hemzemin" ? "Yavaşlama hızı" : "Acil hız"} suffix="km/h" step={1} value={hiz} onChange={setHiz} />
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2 text-xs">
        <button onClick={onIptal} className="rounded px-3 py-1 font-medium" style={{ color: brand.muted }}>İptal</button>
        <button onClick={kaydet} className="rounded px-3 py-1 font-medium text-white" style={{ background: brand.red }}>Ekle</button>
      </div>
    </div>
  );
}

function SeritEkleBtn({ aktif, renk, onClick, children }: { aktif: boolean; renk: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      title={aktif ? "Seçili — şeride tıklayın (iptal için tekrar basın)" : "Seç, sonra şeride tıklayarak ekleyin"}
      className="rounded border px-2 py-1 font-medium transition"
      style={{ borderColor: aktif ? renk : brand.border, background: aktif ? renk + "1A" : "transparent", color: aktif ? renk : brand.inkSoft }}>
      {children}
    </button>
  );
}

function SeritDurak({ sol, ad, sag = false }: { sol: number; ad: string; sag?: boolean }) {
  return (
    <div className="absolute top-0 flex h-full flex-col items-center justify-center" style={{ left: `${sol}%`, transform: `translateX(${sag ? "-100%" : "0"})` }}>
      <span className="h-full w-0.5" style={{ background: brand.ink }} />
      <span className="absolute -bottom-4 whitespace-nowrap text-[0.55rem] font-medium" style={{ color: brand.ink }}>◉ {ad}</span>
    </div>
  );
}

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
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium" style={ok ? { background: CK.goodBg, color: OK } : { background: CK.badBg, color: CK.red }}>
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
