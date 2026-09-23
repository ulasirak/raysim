"use client";

// raysim — PARETO ÇOK-AMAÇLI OPTİMİZASYON paneli (Sistem Merkezi). Büyük sıçrama F.
// Filo kararına karşı çakışan amaçları (maliyet ↔ yolcu bekleme ↔ doluluk) birlikte
// gösterir: Pareto-etkin cephe, baskın (aşırı filo) kuyruk, DİZ noktası (en iyi denge)
// ve ağırlıklı optimum. Ağırlık kaydırıcısı maliyet↔servis önceliğini gezdirir.
// Değerler motordan (maksimumTren) gelir — uydurma yok.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { paretoAnaliz } from "@/lib/anaray/pareto";
import { sure } from "@/lib/anaray/format";
import { BosDurum } from "@/components/BosDurum";
import { Kpi } from "@/components/Kpi";

export function ParetoPaneli() {
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  const [agirlik, setAgirlik] = useState(0.5); // 0 = maliyet önceliği .. 1 = servis önceliği

  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const r = useMemo(() => paretoAnaliz({
    cevrimSn: maks.cevrimSuresi,
    hMinSn: maks.hMin,
    nMax: maks.nTeorik,
    pikYolcuSaat: isletme.pikYolcuSaat,
    aracKapasite: isletme.aracYolcuKapasite,
    konforTavani: isletme.dolulukHedefi,
    agirlik,
  }), [maks, isletme, agirlik]);

  if (!maks.gecerli || r.noktalar.length === 0) {
    return (
      <div className="ds-card p-5">
        <div className="field-label">Çok-Amaçlı Optimizasyon (Pareto)</div>
        <div className="mt-3"><BosDurum sik baslik="Kapasite hesaplanamıyor" ipucu="Ringler’de bir hat kurulunca çok-amaçlı ödünleşim (maliyet↔bekleme↔doluluk) burada türetilir." /></div>
      </div>
    );
  }

  const diz = r.noktalar.find((n) => n.diz)!;
  const opt = r.noktalar.find((n) => n.optimum)!;

  // — Pareto düzlemi (x = maliyet/filo, y = yolcu bekleme dk) —
  const W = 660, H = 280, padL = 48, padR = 16, padT = 16, padB = 42;
  const cw = W - padL - padR, ch = H - padT - padB;
  const ust = r.noktalar.length;
  const bekMax = r.noktalar[0].beklemeDk; // filo 1 → en büyük bekleme
  const X = (f: number) => padL + ((f - 1) / Math.max(1, ust - 1)) * cw;
  const Y = (bek: number) => padT + (1 - Math.min(1, bek / bekMax)) * ch;

  const etkinler = r.noktalar.filter((n) => n.etkin);
  const cephe = etkinler.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.filo).toFixed(1)},${Y(p.beklemeDk).toFixed(1)}`).join(" ");

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Çok-Amaçlı Optimizasyon (Pareto)</div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Maliyet ↔ Bekleme{r.demandVar ? " ↔ Doluluk" : ""} ödünleşimi</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          Filo kararının çakışan amaçları: daha çok araç maliyeti artırır ama beklemeyi{r.demandVar ? " ve doluluğu" : ""} düşürür.
          <b> Kapasite duvarını</b> ({r.duvarFilo} araç) aşan filo beklemeyi düşürmez → <b>baskın</b> (aşırı filo). Aşağıdaki ağırlıkla maliyet↔servis önceliğini gezdirin.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_260px]">
        {/* Pareto düzlemi */}
        <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${brand.border}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Pareto ödünleşim düzlemi">
            {/* eksenler */}
            <line x1={padL} y1={padT + ch} x2={padL + cw} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
            <line x1={padL} y1={padT} x2={padL} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
            {/* konfor-dışı (tıkanma) bölgesi: konfor sınırının solu — doluluk tavanı aşan filolar */}
            {r.demandVar && r.konforFilo && r.konforFilo > 1 && (
              <g>
                <rect x={padL} y={padT} width={Math.max(0, X(r.konforFilo) - padL)} height={ch} fill={CK.amber} opacity={0.07} />
                <line x1={X(r.konforFilo)} y1={padT} x2={X(r.konforFilo)} y2={padT + ch} stroke={CK.amber} strokeWidth={1} strokeDasharray="3 3" />
                <text x={X(r.konforFilo) + 3} y={padT + 20} fontSize={8} fill={CK.amberInk}>konfor sınırı ({r.konforFilo})</text>
                <text x={padL + 3} y={padT + ch - 5} fontSize={7.5} fill={CK.amberInk}>← tıkanma (doluluk &gt; %{Math.round(r.konforTavani * 100)})</text>
              </g>
            )}
            {/* kapasite duvarı */}
            <line x1={X(r.duvarFilo)} y1={padT} x2={X(r.duvarFilo)} y2={padT + ch} stroke={CK.red} strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.6} />
            <text x={X(r.duvarFilo) - 3} y={padT + 10} textAnchor="end" fontSize={8} fill={CK.red}>kapasite duvarı ({r.duvarFilo})</text>
            {/* Pareto cephesi (etkin) */}
            <path d={cephe} fill="none" stroke={brand.ink} strokeWidth={2} />
            {/* noktalar */}
            {r.noktalar.map((n) => {
              const cx = X(n.filo), cy = Y(n.beklemeDk);
              if (!n.etkin) return <circle key={n.filo} cx={cx} cy={cy} r={2.4} fill="none" stroke={brand.faint} strokeWidth={1} />;
              return <circle key={n.filo} cx={cx} cy={cy} r={2.8} fill={brand.ink} />;
            })}
            {/* diz noktası */}
            <circle cx={X(diz.filo)} cy={Y(diz.beklemeDk)} r={6} fill="none" stroke={CK.gold} strokeWidth={2} />
            <text x={X(diz.filo)} y={Y(diz.beklemeDk) - 9} textAnchor="middle" fontSize={8} fontWeight={700} fill={CK.gold}>diz</text>
            {/* ağırlıklı optimum */}
            <circle cx={X(opt.filo)} cy={Y(opt.beklemeDk)} r={4.5} fill={CK.good} stroke="#fff" strokeWidth={1.3} />
            {/* eksen başlıkları */}
            <text x={padL + cw / 2} y={H - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft}>Maliyet — filo (araç) →</text>
            <text x={13} y={padT + ch / 2} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 13 ${padT + ch / 2})`}>Yolcu bekleme (dk) ↑</text>
            {[1, Math.ceil(r.duvarFilo / 2), r.duvarFilo, ust].filter((v, i, a) => a.indexOf(v) === i && v <= ust).map((f) => (
              <text key={f} x={X(f)} y={padT + ch + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{f}</text>
            ))}
          </svg>
        </div>

        {/* Ağırlık + optimum sonucu */}
        <div className="flex flex-col gap-3">
          <div>
            <span className="field-label block">Öncelik ağırlığı</span>
            <input type="range" min={0} max={1} step={0.05} value={agirlik}
              onChange={(e) => setAgirlik(Number(e.target.value))}
              className="mt-2 w-full" style={{ accentColor: CK.good }} aria-label="Maliyet-servis öncelik ağırlığı" />
            <div className="mt-0.5 flex justify-between text-[0.66rem]" style={{ color: brand.muted }}>
              <span>← maliyet</span><span className="tabular-nums">%{Math.round(agirlik * 100)} servis</span><span>servis →</span>
            </div>
          </div>
          <div className="rounded-md p-3" style={{ background: CK.goodBgSoft, border: `1px solid ${CK.good}` }}>
            <Kpi etiket="Ağırlıklı optimum filo" deger={`${opt.filo}`} ton="success" boyut="lg"
              alt={`aralık ${sure(opt.headwaySn)} · bekleme ${opt.beklemeDk.toFixed(1)} dk${opt.doluluk != null ? ` · doluluk %${Math.round(opt.doluluk * 100)}` : ""}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi etiket="Diz (en iyi denge)" deger={`${r.dizFilo}`} boyut="sm" renk={CK.gold} alt={`aralık ${sure(diz.headwaySn)} · ${diz.beklemeDk.toFixed(1)} dk`} />
            <Kpi etiket="Kapasite duvarı" deger={`${r.duvarFilo}`} boyut="sm" alt={`min aralık ${sure(r.hMinSn)}`} />
          </div>
          {r.demandVar && (
            <div className="rounded-md p-2.5 text-[0.7rem]" style={{ background: r.konforSaglanabilir ? CK.track : CK.amberBg, border: `1px solid ${r.konforSaglanabilir ? brand.border : CK.amber}` }}>
              <span style={{ color: r.konforSaglanabilir ? brand.muted : CK.amberInk }}>
                {!r.konforSaglanabilir
                  ? `⚠ Kapasite duvarında (${r.duvarFilo} araç) bile araç doluluğu konfor tavanını (%${Math.round(r.konforTavani * 100)}) aşıyor — araç kapasitesini büyüt veya hat kapasitesini artır.`
                  : `Konfor tavanı (%${Math.round(r.konforTavani * 100)}) için en az ${r.konforFilo} araç gerekir; optimum (${opt.filo}) bunu sağlar (doluluk %${Math.round(opt.doluluk! * 100)}). Konfor kısıtı optimuma uygulanır — aşırı-kalabalık filo önerilmez.`}
              </span>
            </div>
          )}
          <p className="text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
            <b style={{ color: CK.gold }}>Diz</b> = amaçların en dengeli (matematiksel dirsek) noktası. <b style={{ color: CK.good }}>Optimum</b> = ağırlığa göre en iyi{r.demandVar ? " (konfor-uygun kümede)" : ""}.
            İçi boş noktalar <b>baskın</b> (aşırı filo): maliyet artar, servis kazancı yok.
          </p>
        </div>
      </div>
    </div>
  );
}
