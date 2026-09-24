"use client";
// raysim — DURAK ARASI RİNG KARTI (RingEditor'dan ayrıldı; bakım borcu). Prop-güdümlü,
// kendi-kendine yeten alt-bileşen — makas/hemzemin/kurp/sinyal satır editörleri.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RollingStock } from "@/lib/anaray/types";

import { type SimConfig, type Isletme } from "@/lib/anaray/config";


import { yolcuAkisSuresi } from "@/lib/anaray/yolcu";
import { brand } from "@/lib/anaray/brand";
import { CK, SERI } from "@/lib/anaray/chartkit";
import { kmh, sure } from "@/lib/anaray/format";

import { MAKAS_TIP_AD, ringChallenge, ringDogrula, ringKisitDizisi, ringSenaryo, tccGerekli, kurpHizi, kurpKonforAnaliz, type KurpKonforSatir, type DurakArasiRing, type SinyalLambasi, type HemzeminTip, type KisitTur, type MakasTip, type Kurp } from "@/lib/anaray/ring";
import { Num, Rozet, SubBaslik } from "@/components/RingUI";
import { MiniStat } from "@/components/Kpi";
import { KisitSeridi, EkleFormu, SeritEkleBtn, KisitRozet, MakasEkleMenu, type EkleTur } from "@/components/RingSerit";
import { yaricapKirisVersine } from "@/lib/anaray/kurpBul";

import { KMH, OK, Kucuk } from "@/components/ringEditorOrtak";

interface KartProps {
  ring: DurakArasiRing;
  index: number;
  stock: RollingStock;
  acik: boolean;
  cfg: SimConfig;
  isletme: Isletme;
  /** Bu ringin gerçek doluluğu (0..1) — kurp konfor uyarısını doluluğa bağlar. */
  doluluk?: number;
  /** Bu ringin hat başından kümülatif başlangıç kilometrajı (m) — kurp mutlak km gösterimi. */
  ringBasiKm?: number;
  onToggle: () => void;
  onPatch: (p: Partial<DurakArasiRing>) => void;
  onSil: () => void;
  /** Salt-okunur (demo/paylaşım) modda false → şerit tıkla-ekle/sürükle kapalı. */
  duzenlenebilir: boolean;
  onMakasEkle: (tip: MakasTip, konum?: number, ekstra?: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onMakasSil: (mid: string) => void;
  onMakasPatch: (mid: string, p: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onHzEkle: (tip: HemzeminTip, konum?: number, ekstra?: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onHzSil: (hid: string) => void;
  onHzPatch: (hid: string, p: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onTnEkle: (konum?: number, ekstra?: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) => void;
  onTnSil: (tid: string) => void;
  onTnPatch: (tid: string, p: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) => void;
  onKurpEkle: (konum?: number, ekstra?: Partial<Kurp>) => void;
  onKurpSil: (kid: string) => void;
  onKurpPatch: (kid: string, p: Partial<Kurp>) => void;
  onSinyalEkle: (yon: "giden" | "gelen", konum: number, ters: boolean) => void;
  onSinyalSil: (sid: string) => void;
  onSinyalPatch: (sid: string, p: Partial<SinyalLambasi>) => void;
}

export function RingKart(p: KartProps) {
  const { ring, index, stock, cfg, isletme } = p;
  // Kurp konfor değerlendirmesi — GERÇEK doluluğa bağlı (PDF 2.2 ile aynı fonksiyon).
  const konforByKurp = useMemo(() => {
    const map: Record<string, KurpKonforSatir> = {};
    for (const s of kurpKonforAnaliz([ring], cfg, p.doluluk != null ? { [ring.id]: p.doluluk } : undefined)) map[s.kurpId] = s;
    return map;
  }, [ring, cfg, p.doluluk]);
  const [sigYon, setSigYon] = useState<"giden" | "gelen">("giden");
  // Kurp: "ölçüden yarıçap" (kiriş + orta dikme) paneli — kurp id → {C, M} ölçüleri.
  const [kurpOlcu, setKurpOlcu] = useState<Record<string, { C: number; M: number }>>({});
  // Kurp: "nasıl çalışır?" bilgi pop-up'ı (hız ↔ fren/ivme bağı) açık mı?
  const [kurpBilgi, setKurpBilgi] = useState(false);
  const [sigKonum, setSigKonum] = useState(() => Math.round(ring.uzunluk * 0.9));
  const eksik = useMemo(() => ringDogrula(ring, cfg), [ring, cfg]);
  // Senaryo (worst/headway) HESAPLI dwell'le: dwellOto ringde dwell yolcu akışından.
  const sen = useMemo(() => {
    const eff = ring.dwellOto
      ? Math.max(isletme.minDurusSuresi, yolcuAkisSuresi(ring.inenYolcu ?? 0, ring.binenYolcu ?? 0, stock, isletme.yolcuAkisHizi)) + (ring.kapiAcma ?? 2) + (ring.kapiKapama ?? 2)
      : ring.dwell;
    return ringSenaryo({ ...ring, dwell: eff }, stock, cfg);
  }, [ring, stock, cfg, isletme]);
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
    if (!p.duzenlenebilir) return; // salt-okunur: sürükle-taşı kapalı
    if (tur === "makas") p.onMakasPatch(id, { konum });
    else if (tur === "hemzemin") p.onHzPatch(id, { konum });
    else if (tur === "kurp") p.onKurpPatch(id, { konum });
    else p.onTnPatch(id, { konum });
  };
  const seritEkle = (konum: number) => {
    if (!p.duzenlenebilir || !ekleTuru) return; // salt-okunur: tıkla-ekle kapalı
    setBekleyen({ tur: ekleTuru, konum }); // form aç
    setEkleTuru(null);
  };
  const ekleOnayla = (konum: number, ekstra: Record<string, unknown>) => {
    if (!p.duzenlenebilir || !bekleyen) return;
    const t = bekleyen.tur;
    if (t.kind === "makas") p.onMakasEkle((ekstra.tip as MakasTip) ?? t.tip, konum, ekstra);
    else if (t.kind === "hemzemin") p.onHzEkle(t.tip, konum, ekstra);
    else p.onTnEkle(konum, ekstra);
    setBekleyen(null);
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: tam ? brand.border : brand.red, borderLeftWidth: 4, borderLeftColor: tam ? brand.gold : brand.red }}>
      {/* Başlık satırı — üstteki durak satırlarından AYRIK: kare "R#" rozet + altın kenar. */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: tam ? "#FBFCFD" : "#FDF2F4" }}>
        <span className="flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-bold" style={{ background: CK.badBgSoft, color: brand.red }}>R{index + 1}</span>
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
        <button onClick={p.onSil} title="Ringi sil" aria-label="Ringi sil" className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
      </div>

      {p.acik && (
        <div className="border-t p-4" style={{ borderColor: brand.border }}>
          {/* Duraklar + mesafe köşeleri */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <SubBaslik>Mesafe Köşeleri (worst/best = en kötü/en iyi)</SubBaslik>
              <div className="mb-2 text-xs" style={{ color: brand.muted }}>
                <b style={{ color: brand.ink }}>{ring.fromAd} → {ring.toAd}</b> · nominal <b style={{ color: brand.ink }}>{Math.round(ring.uzunluk)} m</b>
                <div className="mt-0.5 text-[0.65rem]" style={{ color: brand.faint }}>Ad · mesafe · hız · bekleme · parklanma → üstteki <b>“Duraklar &amp; Mesafeler”</b> panelinde. Burada yalnız worst/best köşeleri + kısıtlar.</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Best-case (en iyi) mesafe" suffix="m" step={50} value={ring.bestUzunluk} onChange={(v) => p.onPatch({ bestUzunluk: v })} />
                <Num label="Worst-case (en kötü) mesafe" suffix="m" step={50} value={ring.worstUzunluk} onChange={(v) => p.onPatch({ worstUzunluk: v })} />
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

          {/* Challenge (karşılaşılabilecek zorluklar) — ekranda her zaman gösterilir */}
          {challenge.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
              <SubBaslik>Challenge (zorluk senaryosu) — Karşılaşılabilecek Durumlar</SubBaslik>
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
                    {h.tip === "karayolu" && (
                      <div className="w-24"><Num label="Bekleme (durma)" suffix="s" step={1} value={Math.round(h.bekleme ?? 0)} onChange={(v) => p.onHzPatch(h.id, { bekleme: Math.max(0, Math.round(v)) })} /></div>
                    )}
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

          {/* Kurplar (kavisler) — yatay yarıçaptan türeyen hız kısıtı */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SubBaslik>Kurplar (Kavisler)</SubBaslik>
                <button type="button" onClick={() => setKurpBilgi((v) => !v)}
                  className="rounded-full border px-1.5 text-[0.7rem] font-bold leading-5"
                  style={kurpBilgi ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}
                  title="Kurp hızı ile fren/ivme nasıl bağlanır?">ⓘ nasıl çalışır?</button>
              </div>
              <button onClick={() => p.onKurpEkle()} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ ekle</button>
            </div>
            {kurpBilgi && (
              <div className="mb-2 rounded-md border p-3 text-xs leading-relaxed" style={{ borderColor: brand.ink, background: "#F7F9FB", color: brand.ink }}>
                <b>Kurp hızı ↔ fren (b) ↔ ivme (a) birbirine bağlıdır:</b>
                <ol className="mt-1 list-decimal pl-4">
                  <li><b>Kurp hızı</b> = trenin bu kavisten geçebileceği <b>azami hız</b> (yarıçaptan: v=√(R·(a<sub>yanal</sub>+g·dever/ekartman))). Bu, bölgenin hız limiti olur — <b>per-kurp</b>.</li>
                  <li><b>Bu hıza inme (yavaşlama)</b> = <b>Servis freni (b)</b> ile — tren kurptan önce bu fren oranıyla yavaşlar. <b>Global/araç</b> ayarı, kurpa özel değil.</li>
                  <li><b>Kurptan çıkışta hızlanma</b> = <b>Kalkış ivme tavanı (a)</b> + aracın çekiş/güç/kütlesi. Daha hızlı kalkış için aracın çekişini artır.</li>
                </ol>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Link href="/sistem" className="rounded px-2 py-1 font-semibold text-white" style={{ background: brand.ink }}>→ Sistem Merkezi (a / b ayarı)</Link>
                  <span style={{ color: brand.muted }}>Araç çekişi/gücü: Studio → <b>Çeken Araç</b>.</span>
                </div>
              </div>
            )}
            <p className="mb-2 text-xs" style={{ color: brand.muted }}>
              Yatay kavis. <b>Yarıçap (R)</b> girince hız otomatik: <b>v = √(R·(a<sub>yanal</sub> + g·dever/ekartman))</b> — a<sub>yanal</sub>={cfg.aYanalKonfor} m/s², ekartman={Math.round(cfg.ekartman * 1000)} mm (Sistem Merkezi). Dilersen <b>hızı elle</b> gir. Düşey eğimden (ring eğimi) bağımsızdır.
            </p>
            {(ring.kurplar ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Kurp yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(ring.kurplar ?? []).map((k) => {
                  const manuel = k.hizManuel != null;
                  const vHesap = kurpHizi(k, cfg);
                  const kk = konforByKurp[k.id];
                  const aYanal = kk?.aYanal ?? 0;
                  const asim = kk?.seviye === "asim";
                  const kalabalik = kk?.seviye === "kalabalik";
                  const vKalabalik = kk?.oneriVKmh ?? 0;
                  const dolText = kk?.doluluk != null ? ` (doluluk %${Math.round(kk.doluluk * 100)})` : "";
                  const olcu = kurpOlcu[k.id];
                  return (
                    <div key={k.id} className="rounded border p-2" style={{ borderColor: brand.border }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium" style={{ background: "#F0EBF7", color: "#5B4184" }}>kurp</span>
                        <input value={k.ad} placeholder="ad" onChange={(e) => p.onKurpPatch(k.id, { ad: e.target.value })}
                          className="w-24 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                        <div className="w-20"><Num label="Konum" suffix="m" step={10} value={k.konum} onChange={(v) => p.onKurpPatch(k.id, { konum: v })} hata={k.konum < 0 || k.konum > ring.uzunluk} /></div>
                        {(() => {
                          const mutlak = (p.ringBasiKm ?? 0) + Math.max(0, Math.min(ring.uzunluk, k.konum));
                          const kmStr = `${Math.floor(mutlak / 1000)}+${String(Math.round(mutlak % 1000)).padStart(3, "0")}`;
                          return (
                            <span className="rounded px-2 py-1 text-[0.7rem] leading-tight" style={{ background: "#EEF1F6", color: brand.inkSoft }}
                              title="Kurbun hat başından mutlak kilometrajı ve üst duraktan mesafesi — iki istasyon ARASINDAKİ konum">
                              📍 km {kmStr} · <b>{ring.fromAd}</b>+{Math.round(k.konum)}m
                            </span>
                          );
                        })()}
                        <div className="w-20"><Num label="Uzunluk" suffix="m" step={5} value={k.uzunluk} onChange={(v) => p.onKurpPatch(k.id, { uzunluk: Math.max(1, v) })} hata={!(k.uzunluk > 0)} /></div>
                        <div className="w-20"><Num label="Yarıçap R" suffix="m" step={10} value={k.yaricap} onChange={(v) => p.onKurpPatch(k.id, { yaricap: Math.max(1, v) })} hata={!(k.yaricap > 0)} /></div>
                        <div className="w-20"><Num label="Dever" suffix="mm" step={5} value={Math.round((k.dever ?? 0) * 1000)} onChange={(v) => p.onKurpPatch(k.id, { dever: Math.max(0, v) / 1000 })} /></div>
                        {manuel && (
                          <div className="w-20"><Num label="Hız (elle)" suffix="km/h" step={1} value={Math.round(kmh(k.hizManuel ?? 0))} onChange={(v) => p.onKurpPatch(k.id, { hizManuel: Math.max(0, v) * KMH })} hata={!(k.hizManuel! > 0)} /></div>
                        )}
                        <span className="rounded px-2 py-1 text-xs font-semibold" style={{ background: "#EEF6EE", color: "#2E7D32" }}>≈ {Math.round(kmh(vHesap))} km/h</span>
                        <span title="dengelenmemiş yanal ivme = v²/R − g·dever/ekartman" className="rounded px-2 py-1 text-xs font-semibold"
                          style={asim ? { background: "#FBEAEA", color: brand.red } : { background: "#EEF1F6", color: brand.inkSoft }}>
                          yanal {aYanal.toFixed(2)} m/s²{asim ? " ⚠" : kalabalik ? ` · kalabalıkta ≤ ${vKalabalik} km/h${dolText}` : ""}
                        </span>
                        <button type="button" onClick={() => setKurpOlcu((s) => (s[k.id] ? (() => { const n = { ...s }; delete n[k.id]; return n; })() : { ...s, [k.id]: { C: 0, M: 0 } }))}
                          className="rounded border px-2 py-1 text-[0.7rem] font-medium" style={{ borderColor: brand.border, color: brand.inkSoft }} title="Pafta/haritadan ölçüyle yarıçap hesapla">◠ ölçüden R</button>
                        <button onClick={() => p.onKurpPatch(k.id, manuel ? { hizManuel: undefined } : { hizManuel: vHesap })}
                          className="rounded border px-2 py-1 text-[0.7rem] font-medium" style={{ borderColor: brand.border, color: brand.inkSoft }}>
                          {manuel ? "↺ yarıçaptan" : "✎ hızı elle gir"}
                        </button>
                        <button onClick={() => p.onKurpSil(k.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                      </div>
                      {olcu && (
                        <div className="mt-2 flex flex-wrap items-end gap-2 rounded p-2" style={{ background: "#F7F9FA" }}>
                          <span className="text-[0.7rem]" style={{ color: brand.muted }}>Pafta/harita ölçüsü → R = C²/(8·M):</span>
                          <div className="w-24"><Num label="Kiriş C" suffix="m" step={1} value={olcu.C} onChange={(v) => setKurpOlcu((s) => ({ ...s, [k.id]: { ...s[k.id], C: Math.max(0, v) } }))} /></div>
                          <div className="w-24"><Num label="Orta dikme M" suffix="m" step={0.1} value={olcu.M} onChange={(v) => setKurpOlcu((s) => ({ ...s, [k.id]: { ...s[k.id], M: Math.max(0, v) } }))} /></div>
                          <span className="rounded px-2 py-1 text-xs font-semibold" style={{ background: "#EEF1F6", color: brand.ink }}>R ≈ {olcu.C > 0 && olcu.M > 0 ? Math.round(yaricapKirisVersine(olcu.C, olcu.M)) : "—"} m</span>
                          <button type="button" disabled={!(olcu.C > 0 && olcu.M > 0)}
                            onClick={() => { p.onKurpPatch(k.id, { yaricap: Math.round(yaricapKirisVersine(olcu.C, olcu.M)) }); setKurpOlcu((s) => { const n = { ...s }; delete n[k.id]; return n; }); }}
                            className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-40" style={{ background: brand.ink }}>uygula</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sinyal Lambaları — istasyon başına yönlü sinyal (manuel blok aralığı yerine) */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <SubBaslik>Sinyal Lambaları</SubBaslik>
            <p className="mb-2 text-xs" style={{ color: brand.muted }}>
              Manuel blok aralığı yerine gerçek sinyalleri buraya koy. Her sinyal bir <b>yön</b> (giden/gelen) trafiğini görür, <b>kilometraj</b>ında durur ve <b>aspect süreleri</b> (yeşil→sarı→kırmızı→yeşil) taşır — bu süreler canlı simde lambayı animasyonlar HEM blocking-time/headway tabanına girer. İstasyon başına birden fazla eklenebilir.
            </p>
            {p.duzenlenebilir && (
              <div className="rounded border p-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="field-label">Yön (kimin göreceği)</span>
                    <div className="mt-1 flex gap-1">
                      {([["giden", "▶ Giden (ileri)"], ["gelen", "◀ Gelen (ters)"]] as const).map(([y, ad]) => (
                        <button key={y} type="button" onClick={() => setSigYon(y)}
                          className="rounded border px-2 py-1 text-xs font-medium"
                          style={sigYon === y ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}>{ad}</button>
                      ))}
                    </div>
                  </label>
                  <div className="w-24"><Num label="Kilometraj" suffix="m" step={10} value={sigKonum} onChange={(v) => setSigKonum(Math.max(0, Math.min(ring.uzunluk, Math.round(v))))} /></div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <button type="button" onClick={() => p.onSinyalEkle(sigYon, sigKonum, false)}
                      className="w-full rounded px-2 py-1.5 text-xs font-semibold text-white" style={{ background: brand.ink }}>＋ Düz sinyal lambası</button>
                    <Kucuk>Normal blok koruyucu sinyal. <b>{sigYon === "giden" ? "Giden" : "Gelen"}</b> tramvayın <b>daima görebileceği</b> şekilde konur. Aspect süreleri hem canlı simde lambayı animasyonlar HEM blocking-time/headway tabanını besler: <b>kırmızı→yeşil</b> = temizleme + rota serbest bırakma, <b>sarı</b> = yaklaşma/görme uyarısı. Aynı sinyalden ardışık iki tren bu çevrimden sık geçemez.</Kucuk>
                  </div>
                  <div>
                    <button type="button" onClick={() => p.onSinyalEkle(sigYon, sigKonum, true)}
                      className="w-full rounded border px-2 py-1.5 text-xs font-semibold" style={{ borderColor: brand.ink, color: brand.ink }}>＋ Ters işletme sinyali</button>
                    <Kucuk>Ters işletme (kısa dönüş) için. Tramvay <b>S makasa</b> girip karşı şeride geçerken <b>karşı yönden gelenle çakışmamak</b> için gitme yönünün <b>tersine</b> konur → güvenli <b>dönüşü (turnback)</b> sağlar. Süresi ters işletme dönüş süresine girer (Ters İşletme analizini besler).</Kucuk>
                  </div>
                </div>
              </div>
            )}
            {(ring.sinyaller ?? []).length === 0 ? (
              <p className="mt-2 text-xs" style={{ color: brand.faint }}>Bu ringde sinyal lambası yok.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {(ring.sinyaller ?? []).map((s) => {
                  const konumHatali = s.konum < 0 || s.konum > ring.uzunluk;
                  const cev = s.yesilSari + s.sariKirmizi + s.kirmiziYesil;
                  return (
                    <div key={s.id} className="rounded border p-2" style={{ borderColor: konumHatali ? brand.red : s.tersIsletme ? brand.ink : brand.border }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold" style={{ background: s.tersIsletme ? CK.goodBgSoft : "#F1F5F9", color: brand.inkSoft }}>
                          {s.yon === "giden" ? "▶ Giden" : "◀ Gelen"} · {s.tersIsletme ? "TERS İŞLETME" : "düz"}
                        </span>
                        <input value={s.ad} placeholder="ad (ör. S1)" onChange={(e) => p.onSinyalPatch(s.id, { ad: e.target.value })}
                          className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                        <button type="button" onClick={() => p.onSinyalPatch(s.id, { yon: s.yon === "giden" ? "gelen" : "giden" })} className="rounded border px-1.5 py-1 text-[0.65rem]" style={{ borderColor: brand.border, color: brand.inkSoft }}>yön çevir</button>
                        <button type="button" onClick={() => p.onSinyalPatch(s.id, { tersIsletme: !s.tersIsletme })} className="rounded border px-1.5 py-1 text-[0.65rem]" style={{ borderColor: s.tersIsletme ? brand.ink : brand.border, color: brand.inkSoft }}>ters işletme amaçlı mı</button>
                        <button type="button" onClick={() => p.onSinyalSil(s.id)} className="rounded px-1.5 py-1 text-xs" style={{ color: brand.red }}>🗑</button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Num label="Kilometraj" suffix="m" step={10} value={s.konum} onChange={(v) => p.onSinyalPatch(s.id, { konum: v })} hata={konumHatali} />
                        <Num label="Yeşil→Sarı" suffix="s" step={1} value={s.yesilSari} onChange={(v) => p.onSinyalPatch(s.id, { yesilSari: Math.max(0, Math.round(v)) })} />
                        <Num label="Sarı→Kırmızı" suffix="s" step={1} value={s.sariKirmizi} onChange={(v) => p.onSinyalPatch(s.id, { sariKirmizi: Math.max(0, Math.round(v)) })} />
                        <Num label="Kırmızı→Yeşil" suffix="s" step={1} value={s.kirmiziYesil} onChange={(v) => p.onSinyalPatch(s.id, { kirmiziYesil: Math.max(0, Math.round(v)) })} />
                      </div>
                      <Kucuk>Aspect çevrimi {cev} s → {s.yon === "giden" && !s.tersIsletme ? "ileri yön headway tabanına girer" : s.tersIsletme ? "ters işletme dönüş süresine girer" : "gelen yön / yerel + görsel"}.</Kucuk>
                    </div>
                  );
                })}
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

