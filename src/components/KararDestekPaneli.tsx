"use client";

// raysim — KARAR DESTEK / OPTİMİZASYON paneli (Sistem Merkezi). Büyük sıçrama F.
// "Çizen değil karar verdiren" araç: filo ile ulaşılan sefer aralığı (headway)
// arasındaki ödünleşimi bir eğri olarak gösterir + hedef-arama (istenen headway →
// gereken en az filo, kapasite duvarıyla). Değerler motordan (maksimumTren) gelir.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { filoHeadwayEgrisi, hedefFilo, enIyiHeadwaySn } from "@/lib/anaray/kararDestek";
import { sure } from "@/lib/anaray/format";
import { BosDurum } from "@/components/BosDurum";
import { Kpi } from "@/components/Kpi";

export function KararDestekPaneli() {
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const { arac: stock } = useArac();
  const { isletme } = useIsletme();

  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const cevrim = maks.cevrimSuresi;
  const nMax = Math.max(1, maks.nTeorik);
  const hMin = maks.hMin;
  const egri = useMemo(() => filoHeadwayEgrisi(cevrim, hMin, nMax), [cevrim, hMin, nMax]);

  const [hedefDk, setHedefDk] = useState(() => Math.max(0.5, Math.round((cfg.headway / 60) * 2) / 2) || 4);
  const hedef = useMemo(() => hedefFilo(cevrim, hedefDk * 60, nMax), [cevrim, hedefDk, nMax]);
  const enIyi = enIyiHeadwaySn(cevrim, nMax);

  if (!maks.gecerli || egri.length === 0) {
    return (
      <div className="ds-card p-5">
        <div className="field-label">Karar Destek & Optimizasyon</div>
        <div className="mt-3"><BosDurum sik baslik="Kapasite hesaplanamıyor" ipucu="Ringler’de bir hat kurulunca filo↔headway ödünleşimi ve hedef-arama burada türetilir." /></div>
      </div>
    );
  }

  // — Eğri çizimi —
  const W = 660, H = 260, padL = 52, padR = 16, padT = 16, padB = 40;
  const cw = W - padL - padR, ch = H - padT - padB;
  const maxHw = egri[0].headwaySn; // filo 1 → en büyük headway
  const X = (f: number) => padL + ((f - 1) / Math.max(1, nMax - 1)) * cw;
  const Y = (hw: number) => padT + (1 - Math.min(1, hw / maxHw)) * ch;
  const yol = egri.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.filo).toFixed(1)},${Y(p.headwaySn).toFixed(1)}`).join(" ");
  const oneri = Math.max(1, Math.min(nMax, maks.nSurdurulebilir || 0));
  const hedefY = Y(hedefDk * 60);
  // UIC 406 kapasite kullanımı: seçilen filonun ulaşılan headway'i, fiziksel min'e
  // (hMin) ne kadar yakın — %100 = kapasite duvarı. Motorla (blocking-time) tutarlı.
  const uicDol = Math.round(Math.min(100, (hMin / Math.max(1, hedef.ulasilanHeadwaySn)) * 100));

  return (
    <div className="ds-card">
      <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Karar Destek & Optimizasyon</div>
        <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>Filo ↔ Sefer aralığı ödünleşimi + hedef-arama</h3>
        <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
          Ulaşılan sefer aralığı = çevrim ÷ filo. Filo arttıkça aralık düşer ama <b>kapasite duvarına</b> (fiziksel min headway {sure(hMin)}) dayanır.
          Aşağıdan bir hedef aralık girin — gereken en az filo ve uygunluğu anında hesaplanır.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_260px]">
        {/* Eğri */}
        <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${brand.border}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Filo–headway ödünleşim eğrisi">
            {/* Izgara + eksenler */}
            <line x1={padL} y1={padT + ch} x2={padL + cw} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
            <line x1={padL} y1={padT} x2={padL} y2={padT + ch} stroke={brand.border} strokeWidth={1} />
            {/* Kapasite duvarı (nMax) */}
            <line x1={X(nMax)} y1={padT} x2={X(nMax)} y2={padT + ch} stroke={CK.red} strokeWidth={1.2} strokeDasharray="4 3" strokeOpacity={0.7} />
            <text x={X(nMax) - 3} y={padT + 10} textAnchor="end" fontSize={8} fill={CK.red}>kapasite duvarı ({nMax})</text>
            {/* Hedef headway yatay çizgi */}
            <line x1={padL} y1={hedefY} x2={padL + cw} y2={hedefY} stroke={CK.amber} strokeWidth={1} strokeDasharray="3 3" />
            <text x={padL + cw} y={hedefY - 3} textAnchor="end" fontSize={8} fill={CK.amberInk}>hedef {sure(hedefDk * 60)}</text>
            {/* Ödünleşim eğrisi */}
            <path d={yol} fill="none" stroke={brand.ink} strokeWidth={2} />
            {/* Noktalar */}
            {egri.map((p) => (
              <circle key={p.filo} cx={X(p.filo)} cy={Y(p.headwaySn)} r={2} fill={p.filo === oneri ? CK.good : p.filo === hedef.filo ? CK.amber : brand.faint} />
            ))}
            {/* Öneri (sürdürülebilir) işareti */}
            <circle cx={X(oneri)} cy={Y(cevrim / oneri)} r={4.5} fill="none" stroke={CK.good} strokeWidth={1.6} />
            {/* Hedef filo işareti (uygunsa eğri üstünde) */}
            {hedef.uygun && <circle cx={X(hedef.filo)} cy={Y(hedef.ulasilanHeadwaySn)} r={4.5} fill={CK.amber} stroke="#fff" strokeWidth={1.2} />}
            {/* Eksen başlıkları */}
            <text x={padL + cw / 2} y={H - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft}>Filo (araç) →</text>
            <text x={14} y={padT + ch / 2} textAnchor="middle" fontSize={9} fontWeight={600} fill={brand.inkSoft} transform={`rotate(-90 14 ${padT + ch / 2})`}>Sefer aralığı ↑</text>
            {/* X ekseni etiketleri (birkaç) */}
            {[1, Math.ceil(nMax / 2), nMax].filter((v, i, a) => a.indexOf(v) === i).map((f) => (
              <text key={f} x={X(f)} y={padT + ch + 12} textAnchor="middle" fontSize={7.5} fill={brand.muted}>{f}</text>
            ))}
          </svg>
        </div>

        {/* Hedef-arama + sonuç */}
        <div className="flex flex-col gap-3">
          <div>
            <span className="field-label block">Hedef sefer aralığı</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="number" min={0.5} step={0.5} value={hedefDk}
                onChange={(e) => setHedefDk(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
                className="w-20 rounded border px-2 py-1 text-sm tabular-nums" style={{ borderColor: CK.amber, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>dakika</span>
            </div>
          </div>
          <div className="rounded-md p-3" style={{ background: hedef.uygun ? CK.goodBgSoft : "#FBE4E7", border: `1px solid ${hedef.uygun ? CK.good : CK.red}` }}>
            <Kpi etiket="Gereken en az filo" deger={`${hedef.filo}`} ton={hedef.uygun ? "success" : "danger"} boyut="lg"
              alt={hedef.uygun
                ? `ulaşılan aralık ${sure(hedef.ulasilanHeadwaySn)} (≤ hedef) · kapasite ${hedef.kapasiteFilo}`
                : `KAPASİTE AŞILDI: ${hedef.filo} > duvar ${hedef.kapasiteFilo}. Bu aralık fiziksel olarak sağlanamaz.`} />
            {hedef.uygun && (
              <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[0.7rem]" style={{ borderColor: `${CK.good}44` }}>
                <span style={{ color: brand.muted }}>UIC 406 kapasite kullanımı</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: CK.track }}>
                  <div style={{ width: `${uicDol}%`, height: "100%", background: uicDol > 85 ? CK.amber : CK.good }} />
                </div>
                <b className="tabular-nums" style={{ color: uicDol > 85 ? CK.amberInk : brand.inkSoft }}>%{uicDol}</b>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi etiket="Önerilen (sürd.)" deger={`${oneri}`} ton="success" boyut="sm" alt={`aralık ${sure(cevrim / oneri)}`} />
            <Kpi etiket="En iyi (duvar)" deger={sure(enIyi)} boyut="sm" alt={`${nMax} araç`} />
          </div>
          <p className="text-[0.68rem] leading-snug" style={{ color: brand.muted }}>
            Çevrim {sure(cevrim)} · fiziksel min aralık {sure(hMin)}. Hedef aralık ne kadar küçükse gereken filo o kadar artar; kapasite duvarını aşan hedef sağlanamaz.
          </p>
        </div>
      </div>
    </div>
  );
}
