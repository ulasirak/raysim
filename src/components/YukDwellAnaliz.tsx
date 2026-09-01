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
  const barW = Math.max(2, Math.min(16, (W - padL - padR) / Math.max(duraklar.length, dwell.length) * 0.6));

  // ——— 1) Yük profili ———
  const Hy = 190, padTy = 26, padBy = 22, phy = Hy - padTy - padBy;
  const Yy = (v: number) => padTy + (1 - v / yukTop) * phy;
  const yukBar = duraklar.map((d, i) => {
    const x = X(d.konum), y = Yy(d.tepeYuk);
    return `<rect x="${(x - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, padTy + phy - y).toFixed(1)}" rx="1" fill="${dolulukRenk(d.doluluk)}" fill-opacity="0.9"><title>${esc(d.ad)}: ${Math.round(d.tepeYuk)} yolcu/sa · %${Math.round(d.doluluk * 100)} doluluk</title></rect>`;
  }).join("");
  const yukTicks = [0, Math.round(yukTop / 2), Math.round(yukTop)].map((v) =>
    `<text x="${padL - 5}" y="${(Yy(v) + 2.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${brand.muted}">${v}</text>`).join("");

  // ——— 2) Dwell dökümü ———
  const Hd = 170, padTd = 16, padBd = 30, phd = Hd - padTd - padBd;
  const Yd = (v: number) => padTd + (1 - v / dwTop) * phd;
  const seg = (x: number, yTop: number, yBot: number, col: string, t: string) =>
    `<rect x="${(x - barW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, yBot - yTop).toFixed(1)}" fill="${col}"><title>${t}</title></rect>`;
  const dwBar = dwell.map((d) => {
    const x = X(d.konum);
    const y0 = padTd + phd;
    const yA = Yd(d.acma), yY = Yd(d.acma + d.yolcu), yK = Yd(d.acma + d.yolcu + d.kapama);
    return seg(x, Yd(d.acma), y0, "#9AA7B2", `${esc(d.ad)} · kapı açma ${d.acma} s`)
      + seg(x, yY, yA, CK.blue, `${esc(d.ad)} · yolcu değişimi ${Math.round(d.yolcu)} s`)
      + seg(x, yK, yY, "#C9D2DA", `${esc(d.ad)} · kapı kapama ${d.kapama} s`);
  }).join("");
  const dwTicks = [0, Math.round(dwTop / 2), Math.round(dwTop)].map((v) =>
    `<text x="${padL - 5}" y="${(Yd(v) + 2.5).toFixed(1)}" text-anchor="end" font-size="7.5" fill="${brand.muted}">${v}</text>`).join("");
  const kmSay = Math.max(2, Math.round(L / 1000));
  const xTicks = Array.from({ length: kmSay + 1 }, (_, i) => {
    const k = (L * i) / kmSay;
    return `<text x="${X(k).toFixed(1)}" y="${(padTd + phd + 12).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="${brand.muted}">${(k / 1000).toFixed(1)}</text>`;
  }).join("");

  return (
    <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="min-w-[680px] sm:min-w-0 space-y-2">
        {/* Yük profili */}
        <div>
          <div className="mb-0.5 px-1 text-xs font-semibold" style={{ color: brand.ink }}>Yük profili — durak başına tepe araç yükü (yolcu/saat), doluluğa göre renkli</div>
          <svg viewBox={`0 0 ${W} ${Hy}`} className="w-full h-auto" role="img" aria-label="Yük profili"
            dangerouslySetInnerHTML={{ __html: `${yukTicks}<line x1="${padL}" y1="${padTy + phy}" x2="${W - padR}" y2="${padTy + phy}" stroke="${brand.border}"/>${yukBar}<text x="${X(tepe.konum).toFixed(1)}" y="${(Yy(tepe.tepeYuk) - 4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="${CK.red}">↑ tepe: ${esc(tepe.ad)}</text><text x="10" y="${padTy + phy / 2}" text-anchor="middle" font-size="8" font-weight="600" fill="${brand.inkSoft}" transform="rotate(-90 10 ${padTy + phy / 2})">yolcu/sa ↑</text>` }} />
        </div>
        {/* Dwell dökümü */}
        <div>
          <div className="mb-0.5 px-1 text-xs font-semibold" style={{ color: brand.ink }}>Duruş (dwell) dökümü — kapı açma / yolcu değişimi / kapı kapama (saniye)</div>
          <svg viewBox={`0 0 ${W} ${Hd}`} className="w-full h-auto" role="img" aria-label="Dwell dökümü"
            dangerouslySetInnerHTML={{ __html: `${dwTicks}<line x1="${padL}" y1="${padTd + phd}" x2="${W - padR}" y2="${padTd + phd}" stroke="${brand.border}"/>${dwBar}${xTicks}<text x="10" y="${padTd + phd / 2}" text-anchor="middle" font-size="8" font-weight="600" fill="${brand.inkSoft}" transform="rotate(-90 10 ${padTd + phd / 2})">saniye ↑</text><text x="${((W) / 2).toFixed(1)}" y="${Hd - 2}" text-anchor="middle" font-size="8" font-weight="600" fill="${brand.inkSoft}">Mesafe (km) →</text>` }} />
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
