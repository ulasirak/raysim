"use client";

// raysim — HAT BOYU YÜK & DURUŞ ANALİZİ (ortak x = mesafe):
//  1) YÜK PROFİLİ: her durakta tepe araç yükü (yolcu/saat), DOLULUĞA göre renkli
//     (yeşil<%50 · sarı %50–85 · kırmızı>%85) → hattın en kalabalık kesimi bir bakışta.
//  2) DWELL DÖKÜMÜ: her durakta duruş süresinin kapı-açma / yolcu-değişimi / kapı-kapama
//     kırılımı (yığılı) → tramvayın dwell-baskın doğasında zamanın nereye gittiği.
// Veri: tersIsletmeAnaliz (yük) + ringler (dwell bileşenleri) — motorlarla birebir.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { satirYerlesim } from "@/lib/anaray/grafikNoktalar";
import type { DurakArasiRing } from "@/lib/anaray/ring";

interface DurakYuk { ad: string; konum: number; tepeYuk: number; doluluk: number; terminal: boolean }

const YESIL = "#2E7D57";
const dolulukRenk = (d: number) => (d > 0.85 ? CK.red : d > 0.5 ? CK.amber : YESIL);

export function YukDwellAnaliz({ duraklar, rings }: { duraklar: DurakYuk[]; rings: DurakArasiRing[] }) {
  const veri = useMemo(() => {
    if (duraklar.length < 2 || rings.length < 1) return null;
    const L = Math.max(...duraklar.map((d) => d.konum), 1);
    // Dwell: her ringin VARIŞ durağı (kümülatif konum) + bileşenler.
    let acc = 0;
    const dwell = rings.map((r) => {
      acc += r.uzunluk;
      const acma = r.kapiAcma ?? 2, kapama = r.kapiKapama ?? 2;
      const yolcu = Math.max(0, r.dwell - acma - kapama);
      return { ad: r.toAd, konum: acc, acma, yolcu, kapama, toplam: r.dwell };
    });
    const yukTop = Math.max(...duraklar.map((d) => d.tepeYuk), 1);
    const dwTop = Math.max(...dwell.map((d) => d.toplam), 1);
    const tepe = duraklar.reduce((a, b) => (b.tepeYuk > a.tepeYuk ? b : a), duraklar[0]);
    return { L, dwell, yukTop, dwTop, tepe };
  }, [duraklar, rings]);

  if (!veri) return null;
  const { L, dwell, yukTop, dwTop, tepe } = veri;
  const W = 860, padL = 46, padR = 14;
  const X = (k: number) => padL + (k / L) * (W - padL - padR);
  // DEĞİŞKEN çubuk genişliği: her çubuk komşularına olan en küçük boşluğun payı kadar →
  // yakın duraklarda incelir, üst üste binmez; boşta geniş kalır. (16 üst sınır.)
  const barGenislikleri = (konumlar: number[]): number[] => {
    const xs = konumlar.map(X);
    return xs.map((x, i) => {
      const sol = i > 0 ? x - xs[i - 1] : Infinity;
      const sag = i < xs.length - 1 ? xs[i + 1] - x : Infinity;
      const g = Math.min(sol, sag);
      return Math.max(1.5, Math.min(16, (Number.isFinite(g) ? g : 16) * 0.85));
    });
  };
  const bwY = barGenislikleri(duraklar.map((d) => d.konum));
  const bwD = barGenislikleri(dwell.map((d) => d.konum));

  // Bar üstü değer etiketi (döndürülmüş, dik) — her barın tam sayı değeri, çakışmasız.
  const dikDeger = (x: number, topY: number, val: number, col: string, kalin = false): string =>
    `<text x="${x.toFixed(1)}" y="${(topY - 2).toFixed(1)}" transform="rotate(-90 ${x.toFixed(1)} ${(topY - 2).toFixed(1)})" text-anchor="start" font-family="${CK.sans}" font-size="6.3" font-weight="${kalin ? 700 : 500}" fill="${col}">${val}</text>`;

  // ——— 1) Yük profili ———
  const Hy = 202, padTy = 38, padBy = 22, phy = Hy - padTy - padBy;
  const Yy = (v: number) => padTy + (1 - v / yukTop) * phy;
  const yukBar = duraklar.map((d, i) => {
    const x = X(d.konum), y = Yy(d.tepeYuk), w = bwY[i];
    return `<rect x="${(x - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, padTy + phy - y).toFixed(1)}" rx="1" fill="${dolulukRenk(d.doluluk)}" fill-opacity="0.9"><title>${esc(d.ad)} (${(d.konum / 1000).toFixed(2)} km): ${Math.round(d.tepeYuk)} yolcu/sa · %${Math.round(d.doluluk * 100)} doluluk</title></rect>`;
  }).join("");
  // Her barın tepe yükü (tam sayı) bar üstünde.
  const yukDeger = duraklar.map((d) => dikDeger(X(d.konum), Yy(d.tepeYuk), Math.round(d.tepeYuk), dolulukRenk(d.doluluk), d.ad === tepe.ad)).join("");
  const yukTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yukTop * f)).map((v) =>
    `<text x="${padL - 5}" y="${(Yy(v) + 2.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${brand.muted}">${v}</text>`).join("");

  // ——— 2) Dwell dökümü ———
  const Hd = 188, padTd = 24, padBd = 48, phd = Hd - padTd - padBd;
  const Yd = (v: number) => padTd + (1 - v / dwTop) * phd;
  const seg = (x: number, w: number, yTop: number, yBot: number, col: string, t: string) =>
    `<rect x="${(x - w / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, yBot - yTop).toFixed(1)}" fill="${col}"><title>${t}</title></rect>`;
  const dwBar = dwell.map((d, i) => {
    const x = X(d.konum), w = bwD[i];
    const y0 = padTd + phd;
    const yA = Yd(d.acma), yY = Yd(d.acma + d.yolcu), yK = Yd(d.acma + d.yolcu + d.kapama);
    return seg(x, w, Yd(d.acma), y0, "#9AA7B2", `${esc(d.ad)} (${(d.konum / 1000).toFixed(2)} km) · kapı açma ${d.acma} s`)
      + seg(x, w, yY, yA, CK.blue, `${esc(d.ad)} · yolcu değişimi ${Math.round(d.yolcu)} s · toplam ${Math.round(d.toplam)} s`)
      + seg(x, w, yK, yY, "#C9D2DA", `${esc(d.ad)} · kapı kapama ${d.kapama} s`);
  }).join("");
  // Her barın toplam duruşu (tam sayı, s) bar üstünde.
  const dwDeger = dwell.map((d) => dikDeger(X(d.konum), Yd(d.toplam), Math.round(d.toplam), brand.ink)).join("");
  const dwTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(dwTop * f)).map((v) =>
    `<text x="${padL - 5}" y="${(Yd(v) + 2.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${brand.muted}">${v}</text>`).join("");
  // X ekseni EKSİKSİZ: her durağın km'si (çakışmasız satırlara dağıtılmış).
  const dwKmSatir = satirYerlesim(dwell.map((d) => X(d.konum)), 24, 3);
  const xTicks = dwell.map((d, i) =>
    `<text x="${X(d.konum).toFixed(1)}" y="${(padTd + phd + 11 + dwKmSatir[i] * 9).toFixed(1)}" text-anchor="middle" font-size="6.8" fill="${brand.muted}">${(d.konum / 1000).toFixed(2)}</text>`).join("");

  return (
    <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="min-w-[680px] sm:min-w-0 space-y-2">
        {/* Yük profili */}
        <div>
          <div className="mb-0.5 px-1 text-xs font-semibold" style={{ color: brand.ink }}>Yük profili — durak başına tepe araç yükü (yolcu/saat), doluluğa göre renkli · <span style={{ color: CK.red }}>tepe: {tepe.ad} · {Math.round(tepe.tepeYuk)} yolcu/sa @ {(tepe.konum / 1000).toFixed(2)} km</span></div>
          <svg viewBox={`0 0 ${W} ${Hy}`} className="w-full h-auto" role="img" aria-label="Yük profili"
            dangerouslySetInnerHTML={{ __html: `${yukTicks}<line x1="${padL}" y1="${padTy + phy}" x2="${W - padR}" y2="${padTy + phy}" stroke="${brand.border}"/>${yukBar}${yukDeger}<text x="10" y="${padTy + phy / 2}" text-anchor="middle" font-size="8" font-weight="600" fill="${brand.inkSoft}" transform="rotate(-90 10 ${padTy + phy / 2})">yolcu/sa ↑</text>` }} />
        </div>
        {/* Dwell dökümü */}
        <div>
          <div className="mb-0.5 px-1 text-xs font-semibold" style={{ color: brand.ink }}>Duruş (dwell) dökümü — kapı açma / yolcu değişimi / kapı kapama (saniye)</div>
          <svg viewBox={`0 0 ${W} ${Hd}`} className="w-full h-auto" role="img" aria-label="Dwell dökümü"
            dangerouslySetInnerHTML={{ __html: `${dwTicks}<line x1="${padL}" y1="${padTd + phd}" x2="${W - padR}" y2="${padTd + phd}" stroke="${brand.border}"/>${dwBar}${dwDeger}${xTicks}<text x="10" y="${padTd + phd / 2}" text-anchor="middle" font-size="8" font-weight="600" fill="${brand.inkSoft}" transform="rotate(-90 10 ${padTd + phd / 2})">saniye ↑</text><text x="${((W) / 2).toFixed(1)}" y="${Hd - 2}" text-anchor="middle" font-size="8" font-weight="600" fill="${brand.inkSoft}">Mesafe (km) →</text>` }} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
          <span><span style={{ color: YESIL }}>■</span> &lt;%50 · <span style={{ color: CK.amber }}>■</span> %50–85 · <span style={{ color: CK.red }}>■</span> &gt;%85 doluluk</span>
          <span><span style={{ color: "#9AA7B2" }}>■</span> kapı açma · <span style={{ color: CK.blue }}>■</span> yolcu değişimi · <span style={{ color: "#C9D2DA" }}>■</span> kapı kapama</span>
        </div>
      </div>
    </div>
  );
}

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)); }
