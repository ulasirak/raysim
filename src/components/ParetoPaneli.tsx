"use client";

// raysim — EKONOMİK OPTİMİZASYON paneli (Sistem Merkezi). Büyük sıçrama F.
// Filo kararının GERÇEK ekonomik optimumunu türetir: jenerik (toplam) maliyet =
// işletmeci maliyeti (filo × araç-saat ₺, filo ile ARTAR) + yolcu bekleme maliyeti
// (talep × bekleme × zaman-değeri ₺, filo ile AZALIR). Toplam U biçimlidir; alt
// noktası ekonomik optimumdur (klasik sefer sıklığı optimizasyonu — Newell/Vuchic).
// İki ₺ girdi DÜZENLENEBİLİR VARSAYIM (isletme'de kalıcı) — uydurma yok, projenin
// kendi rakamı girilir. Değerler motordan (maksimumTren) + istenen ₺'den gelir.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { paretoAnaliz } from "@/lib/anaray/pareto";
import { sure } from "@/lib/anaray/format";
import { BosDurum } from "@/components/BosDurum";
import { Kpi } from "@/components/Kpi";

const tl = (v: number) => `₺${Math.round(v).toLocaleString("tr-TR")}`;

export function ParetoPaneli() {
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const { arac: stock } = useArac();
  const { isletme, patchIsletme, yazilabilir } = useIsletme();

  const VoT = isletme.zamanDegeriYolcuSaat ?? 50;
  const Cveh = isletme.aracSaatMaliyet ?? 800;

  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const r = useMemo(() => paretoAnaliz({
    cevrimSn: maks.cevrimSuresi,
    hMinSn: maks.hMin,
    nMax: maks.nTeorik,
    pikYolcuSaat: isletme.pikYolcuSaat,
    aracKapasite: isletme.aracYolcuKapasite,
    konforTavani: isletme.dolulukHedefi,
    zamanDegeriYolcuSaat: VoT,
    aracSaatMaliyet: Cveh,
  }), [maks, isletme, VoT, Cveh]);

  if (!maks.gecerli || r.noktalar.length === 0) {
    return (
      <div className="ds-card p-5">
        <div className="field-label">Ekonomik Optimizasyon (jenerik maliyet)</div>
        <div className="mt-3"><BosDurum sik baslik="Kapasite hesaplanamıyor" ipucu="Ringler’de bir hat kurulunca filo↔maliyet ekonomik optimumu burada türetilir." /></div>
      </div>
    );
  }

  const diz = r.noktalar.find((n) => n.diz)!;
  const konforFilo = r.konforFilo;
  const duvar = r.duvarFilo;

  // — Servis bandı: absürd sol kuyruğu (filo 1–5 → 100+ dk aralık) kırp; tüm ilginç
  //   işaretleri (konfor sınırı, diz, ekonomik optimum, duvar) İÇERECEK şekilde daralt.
  const hwCapFilo = Math.max(1, Math.ceil(maks.cevrimSuresi / (18 * 60))); // aralık ≤ ~18 dk
  const isaretler = [konforFilo, diz.filo, r.ekoOptimumFilo, r.ekoSerbestFilo, duvar].filter((v): v is number => v != null && v > 0);
  const bandAlt = Math.max(1, Math.min(Math.min(...isaretler) - 3, hwCapFilo));
  const bandUst = Math.min(r.noktalar.length, duvar + Math.max(2, Math.round(duvar * 0.12)));
  const bant = r.noktalar.filter((n) => n.filo >= bandAlt && n.filo <= bandUst);

  // — Ekonomik değilse (talep yok): kısa bir yönlendirme + diz noktası —
  if (!r.ekoVar) {
    return (
      <div className="ds-card">
        <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
          <div className="flex items-center gap-2">
            <span className="ds-chip" style={{ background: "#EEF2F6", color: brand.muted, border: `1px solid ${brand.border}` }}>Ekonomik</span>
            <div className="field-label">Ekonomik Optimizasyon (jenerik maliyet)</div>
          </div>
          <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Toplam maliyet optimumu — talep gerekli</h3>
        </div>
        <div className="p-5">
          <BosDurum sik baslik="Pik talep girilmemiş"
            ipucu="Ters İşletme’de pik yolcu/saat + araç kapasitesi girilince toplam (işletmeci + yolcu zamanı) maliyet çanağı ve ekonomik optimum burada türetilir." />
          <p className="mt-3 text-[0.72rem]" style={{ color: brand.muted }}>
            Talep olmadan yalnız dengeli (diz) filo hesaplanabilir: <b>{r.dizFilo}</b> araç · aralık {sure(diz.headwaySn)}.
          </p>
        </div>
      </div>
    );
  }

  const opt = r.noktalar.find((n) => n.ekoOptimum)!;
  const serbest = r.ekoSerbestFilo != null ? r.noktalar.find((n) => n.filo === r.ekoSerbestFilo) : null;

  // — Toplam-maliyet çanağı (X = filo servis bandı, Y = ₺/saat) —
  const W = 660, H = 288, padL = 62, padR = 16, padT = 18, padB = 44;
  const cw = W - padL - padR, ch = H - padT - padB;
  const maxCost = Math.max(...bant.map((n) => n.jenerikMaliyet ?? 0)) * 1.04;
  const X = (f: number) => padL + ((f - bandAlt) / Math.max(1, bandUst - bandAlt)) * cw;
  const Y = (c: number) => padT + (1 - Math.min(1, c / maxCost)) * ch;
  const cizgi = (sel: (n: typeof bant[number]) => number | null) =>
    bant.map((n, i) => { const v = sel(n); return v == null ? "" : `${i === 0 ? "M" : "L"}${X(n.filo).toFixed(1)},${Y(v).toFixed(1)}`; }).join(" ");
  const yToplam = cizgi((n) => n.jenerikMaliyet);
  const yIsl = cizgi((n) => n.isletmeciMaliyet);
  const yYol = cizgi((n) => n.yolcuMaliyet);
  // Y ekseni ₺ işaretleri (0, orta, üst)
  const yTicks = [0, maxCost / 2, maxCost];

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div className="flex items-center gap-2">
          <span className="ds-chip" style={{ background: CK.goodBgSoft, color: CK.good, border: `1px solid ${CK.good}` }}>Ekonomik</span>
          <div className="field-label">Ekonomik Optimizasyon (jenerik maliyet)</div>
        </div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Toplam maliyet çanağı → ekonomik optimum</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          Toplam maliyet = <b style={{ color: CK.gold }}>işletmeci</b> (filo × araç-saat ₺, filo ile <b>artar</b>) + <b style={{ color: CK.good }}>yolcu bekleme</b> (talep × bekleme × zaman-değeri ₺, filo ile <b>azalır</b>).
          Toplamın <b>alt noktası</b> gerçek ekonomik optimumdur — daha az filo yolcuyu, daha çok filo işletmeciyi pahalıya getirir.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_260px]">
        {/* Maliyet çanağı */}
        <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${brand.border}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Toplam maliyet çanağı (ekonomik optimum)">
            {/* eksenler */}
            <line x1={padL} y1={padT + ch} x2={padL + cw} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
            <line x1={padL} y1={padT} x2={padL} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
            {/* Y ızgara + ₺ etiketleri */}
            {yTicks.map((c, i) => (
              <g key={i}>
                <line x1={padL} y1={Y(c)} x2={padL + cw} y2={Y(c)} stroke={brand.border} strokeWidth={0.6} strokeOpacity={0.5} strokeDasharray="2 3" />
                <text x={padL - 5} y={Y(c) + 3} textAnchor="end" fontSize={7.5} fill={brand.muted}>{tl(c)}</text>
              </g>
            ))}
            {/* konfor-dışı (tıkanma) bölgesi: konfor sınırının solu */}
            {konforFilo && konforFilo > bandAlt && (
              <g>
                <rect x={padL} y={padT} width={Math.max(0, X(konforFilo) - padL)} height={ch} fill={CK.amber} opacity={0.07} />
                <line x1={X(konforFilo)} y1={padT} x2={X(konforFilo)} y2={padT + ch} stroke={CK.amber} strokeWidth={1} strokeDasharray="3 3" />
                <text x={X(konforFilo) + 3} y={padT + 11} fontSize={7.5} fill={CK.amberInk}>konfor sınırı ({konforFilo})</text>
              </g>
            )}
            {/* kapasite duvarı */}
            {duvar <= bandUst && (
              <>
                <line x1={X(duvar)} y1={padT} x2={X(duvar)} y2={padT + ch} stroke={CK.red} strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.55} />
                <text x={X(duvar) - 3} y={padT + ch - 4} textAnchor="end" fontSize={7.5} fill={CK.red}>kapasite duvarı ({duvar})</text>
              </>
            )}
            {/* bileşen eğrileri (soluk): işletmeci ↑ + yolcu ↓ */}
            <path d={yIsl} fill="none" stroke={CK.gold} strokeWidth={1.3} strokeOpacity={0.7} strokeDasharray="4 3" />
            <path d={yYol} fill="none" stroke={CK.good} strokeWidth={1.3} strokeOpacity={0.7} strokeDasharray="4 3" />
            {/* toplam (jenerik) maliyet — U eğrisi (kalın) */}
            <path d={yToplam} fill="none" stroke={brand.ink} strokeWidth={2.3} />
            {/* kısıtsız maliyet minimumu — konfor tavanını aşıyorsa (aşırı kalabalık) soluk işaret */}
            {r.ekoKonforBagli && serbest && serbest.filo >= bandAlt && serbest.filo <= bandUst && serbest.jenerikMaliyet != null && (
              <g>
                <circle cx={X(serbest.filo)} cy={Y(serbest.jenerikMaliyet)} r={3.5} fill="none" stroke={CK.amberInk} strokeWidth={1.3} strokeDasharray="2 1.5" />
                <text x={X(serbest.filo)} y={Y(serbest.jenerikMaliyet) + 12} textAnchor="middle" fontSize={7} fill={CK.amberInk}>kısıtsız min ({serbest.filo}) — aşırı kalabalık</text>
              </g>
            )}
            {/* ekonomik optimum (konfor-uygun) — önerilen filo */}
            <line x1={X(opt.filo)} y1={Y(opt.jenerikMaliyet!)} x2={X(opt.filo)} y2={padT + ch} stroke={CK.good} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.7} />
            <circle cx={X(opt.filo)} cy={Y(opt.jenerikMaliyet!)} r={5.5} fill={CK.good} stroke="#fff" strokeWidth={1.5} />
            <text x={X(opt.filo)} y={Y(opt.jenerikMaliyet!) - 9} textAnchor="middle" fontSize={8.5} fontWeight={800} fill={CK.good}>optimum {opt.filo}</text>
            {/* diz (denge) — ikincil işaret */}
            {diz.filo >= bandAlt && diz.filo <= bandUst && diz.jenerikMaliyet != null && (
              <circle cx={X(diz.filo)} cy={Y(diz.jenerikMaliyet)} r={3} fill="none" stroke={CK.gold} strokeWidth={1.4} />
            )}
            {/* eksen başlıkları */}
            <text x={padL + cw / 2} y={H - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft}>Filo (araç) — servis bandı →</text>
            <text x={13} y={padT + ch / 2} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 13 ${padT + ch / 2})`}>Maliyet (₺/saat) ↑</text>
            {[bandAlt, opt.filo, duvar, bandUst].filter((v, i, a) => a.indexOf(v) === i && v >= bandAlt && v <= bandUst).map((f) => (
              <text key={f} x={X(f)} y={padT + ch + 13} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{f}</text>
            ))}
          </svg>
        </div>

        {/* Ekonomik girdiler + optimum sonucu */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="block">
              <span className="field-label block">Zaman değeri (₺/yolcu-saat)</span>
              <input type="number" min={0} step={5} value={VoT} disabled={!yazilabilir}
                onChange={(e) => patchIsletme({ zamanDegeriYolcuSaat: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm tabular-nums disabled:opacity-60" style={{ borderColor: CK.good, color: brand.ink }} />
            </label>
            <label className="block">
              <span className="field-label block">İşletme maliyeti (₺/araç-saat)</span>
              <input type="number" min={0} step={50} value={Cveh} disabled={!yazilabilir}
                onChange={(e) => patchIsletme({ aracSaatMaliyet: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="mt-1 w-full rounded border px-2 py-1 text-sm tabular-nums disabled:opacity-60" style={{ borderColor: CK.gold, color: brand.ink }} />
            </label>
            <p className="text-[0.62rem] leading-snug" style={{ color: brand.faint }}>Düzenlenebilir varsayım — projenin kendi rakamını girin; kalıcı kaydolur.</p>
          </div>
          <div className="rounded-md p-3" style={{ background: CK.goodBgSoft, border: `1px solid ${CK.good}` }}>
            <Kpi etiket="Ekonomik optimum filo" deger={`${opt.filo}`} ton="success" boyut="lg"
              alt={`aralık ${sure(opt.headwaySn)} · bekleme ${opt.beklemeDk.toFixed(1)} dk${opt.doluluk != null ? ` · doluluk %${Math.round(opt.doluluk * 100)}` : ""}`} />
            <div className="mt-2 grid grid-cols-1 gap-1 border-t pt-2 text-[0.68rem]" style={{ borderColor: `${CK.good}44`, color: brand.inkSoft }}>
              <div className="flex justify-between"><span style={{ color: CK.gold }}>İşletmeci maliyeti</span><b className="tabular-nums">{tl(r.ekoMaliyet!.isletmeci)}/sa</b></div>
              <div className="flex justify-between"><span style={{ color: CK.good }}>Yolcu zaman maliyeti</span><b className="tabular-nums">{tl(r.ekoMaliyet!.yolcu)}/sa</b></div>
              <div className="flex justify-between border-t pt-1" style={{ borderColor: `${CK.good}44` }}><span style={{ color: brand.ink }}>Toplam (en düşük)</span><b className="tabular-nums" style={{ color: brand.ink }}>{tl(r.ekoMaliyet!.toplam)}/sa</b></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi etiket="Diz (denge)" deger={`${r.dizFilo}`} boyut="sm" renk={CK.gold} alt={`aralık ${sure(diz.headwaySn)}`} />
            <Kpi etiket="Kapasite duvarı" deger={`${duvar}`} boyut="sm" alt={`min aralık ${sure(r.hMinSn)}`} />
          </div>
          {r.ekoKonforBagli && r.konforSaglanabilir && (
            <div className="rounded-md p-2.5 text-[0.7rem]" style={{ background: CK.amberBg, border: `1px solid ${CK.amber}` }}>
              <span style={{ color: CK.amberInk }}>Kısıtsız maliyet minimumu (<b>{r.ekoSerbestFilo}</b> araç) doluluğu konfor tavanının (%{Math.round(r.konforTavani * 100)}) üstüne çıkarır (araç binilemez) → optimum <b>konfor sınırına ({konforFilo})</b> çekildi. Konfor kısıtı bağlıyor.</span>
            </div>
          )}
          {!r.konforSaglanabilir && (
            <div className="rounded-md p-2.5 text-[0.7rem]" style={{ background: CK.amberBg, border: `1px solid ${CK.amber}` }}>
              <span style={{ color: CK.amberInk }}>⚠ Kapasite duvarında ({duvar} araç) bile doluluk konfor tavanını (%{Math.round(r.konforTavani * 100)}) aşıyor — araç kapasitesini büyüt veya hat kapasitesini artır.</span>
            </div>
          )}
          <p className="text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
            <b style={{ color: CK.good }}>Optimum</b> = toplam maliyeti en düşük filo (₺ girdilerine bağlı). <b style={{ color: CK.gold }}>Diz</b> = ₺’den bağımsız matematiksel denge. Filo ↔ sefer aralığı operasyonel görünümü yukarıdaki <b>Karar Destek</b> panelinde.
          </p>
        </div>
      </div>
    </div>
  );
}
