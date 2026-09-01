"use client";

// raysim — Ring "KISIT ŞERİDİ" ve tıkla-ekle formu.
// Bir durak-arası hücrenin makas/hemzemin/tehlike kısıtlarını görsel şerit üstünde
// nokta olarak gösterir, sürükleyerek konumlandırır ve şeride tıklayınca el kitabı
// (MAZ-VA-AKS-001) varsayılanlı ekleme formunu açar. SAF/LEAF sunum — kalıcı durum
// RingEditor'da tutulur; buradan sadece geri-çağrılar tetiklenir.

import { useEffect, useRef, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK, SERI } from "@/lib/anaray/chartkit";
import { kmh } from "@/lib/anaray/format";
import {
  MAKAS_TIP_AD,
  ringKisitDizisi,
  tccGerekli,
  yeniHemzemin,
  yeniMakas,
  yeniTehlike,
  type DurakArasiRing,
  type HemzeminTip,
  type KisitTur,
  type MakasTip,
} from "@/lib/anaray/ring";
import { Num } from "@/components/RingUI";

const KMH = 1 / 3.6;

/** Şeritten ekleme modu: hangi tür kısıt bir sonraki tıklamada eklenecek. */
export type EkleTur =
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
export function KisitSeridi({ ring, kisitlar, konumSuresi, onTasi, ekleTuru, onSeritEkle }: {
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
        {/* Boş şerit ipucu: sürüklenecek "nokta" = makas/geçit/tehlike; önce ＋ ile eklenir. */}
        {kisitlar.length === 0 && !ekleTuru && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[0.62rem]" style={{ color: brand.faint }}>
            ＋ makas / geçit / tehlike ekleyin, sonra sürükleyerek konumlandırın
          </span>
        )}
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
export function EkleFormu({ tur, konum: konum0, uzunluk, konumSuresi, sureKonumu, onIptal, onEkle }: {
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
  const [crossover, setCrossover] = useState<"s" | "x">("s");
  const [adim, setAdim] = useState(mv0.makasAdimSuresi);
  const [release, setRelease] = useState(mv0.routeRelease);
  // Geçit / fren hızı varsayılanı
  const hizVars = tur.kind === "hemzemin"
    ? Math.round(kmh(yeniHemzemin(tur.tip, konum0).hiz))
    : Math.round(kmh(yeniTehlike(konum0).hiz));
  const [hiz, setHiz] = useState(hizVars);
  const [bekleme, setBekleme] = useState(0); // karayolu geçidinde beklenen bekleme (s)

  const baslik = tur.kind === "makas" ? "Makas bölgesi ekle"
    : tur.kind === "hemzemin" ? `${tur.tip === "yaya" ? "Yaya" : "Karayolu"} geçidi ekle`
    : "Acil frenleme noktası ekle";

  const kaydet = () => {
    if (tur.kind === "makas") {
      onEkle(konum, { tip: mtip, gecisHizi: gecisHizi * KMH, makasSayisi, makasAdimSuresi: adim, routeRelease: release, tccZorunlu: tccGerekli(mtip), crossover });
    } else if (tur.kind === "hemzemin") {
      onEkle(konum, { hiz: hiz * KMH, ...(tur.tip === "karayolu" ? { bekleme } : {}) });
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
            <label className="block">
              <span className="field-label">Makas tipi</span>
              <div className="mt-1 flex gap-1">
                {([["s", "S-makas"], ["x", "X-makas"]] as const).map(([cv, ad]) => (
                  <button key={cv} type="button" onClick={() => setCrossover(cv)}
                    className="flex-1 rounded border px-1.5 py-1 text-xs font-medium"
                    style={crossover === cv ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}>
                    {ad}
                  </button>
                ))}
              </div>
              <span className="mt-0.5 block text-[0.6rem]" style={{ color: brand.muted }}>uç (dönüş) makasında turnback yolu belirler: S=1, X=2</span>
            </label>
            <Num label="Motor/adım süresi" suffix="s" step={1} value={adim} onChange={setAdim} />
            <Num label="Route release" suffix="s" step={1} value={release} onChange={setRelease} />
          </>
        ) : (
          <>
            <Num label={tur.kind === "hemzemin" ? "Yavaşlama hızı" : "Acil hız"} suffix="km/h" step={1} value={hiz} onChange={setHiz} />
            {tur.kind === "hemzemin" && tur.tip === "karayolu" && (
              <Num label="Geçit beklemesi" suffix="s" step={1} value={bekleme} onChange={(v) => setBekleme(Math.max(0, Math.round(v)))} />
            )}
          </>
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2 text-xs">
        <button onClick={onIptal} className="rounded px-3 py-1 font-medium" style={{ color: brand.muted }}>İptal</button>
        <button onClick={kaydet} className="rounded px-3 py-1 font-medium text-white" style={{ background: brand.red }}>Ekle</button>
      </div>
    </div>
  );
}

export function SeritEkleBtn({ aktif, renk, onClick, children }: { aktif: boolean; renk: string; onClick: () => void; children: React.ReactNode }) {
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
  // Uç çizgi sol/sağ kenarda; ad etiketi kenardan İÇERİ doğru hizalanır (sol durak → sola,
  // sağ durak → sağa) → şerit kenarında kırpılmaz.
  return (
    <div className="absolute top-0 h-full w-0.5" style={{ left: `${sol}%`, transform: `translateX(${sag ? "-100%" : "0"})` }}>
      <span className="block h-full w-0.5" style={{ background: brand.ink }} />
      <span className="absolute -bottom-4 whitespace-nowrap text-[0.55rem] font-medium"
        style={{ color: brand.ink, ...(sag ? { right: 0 } : { left: 0 }) }}>◉ {ad}</span>
    </div>
  );
}

export function KisitRozet({ tur, ad, konum, detay }: { tur: KisitTur | "durak"; ad: string; konum: number; detay?: string }) {
  const renk = KISIT_RENK[tur];
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: renk + "14", color: renk }}
      title={`${ad} · ${Math.round(konum)} m${detay ? " · " + detay : ""}`}>
      <span>{KISIT_IKON[tur]}</span>
      <span className="max-w-[9rem] truncate font-medium">{ad}</span>
    </span>
  );
}

export function MakasEkleMenu({ onEkle }: { onEkle: (t: MakasTip) => void }) {
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
