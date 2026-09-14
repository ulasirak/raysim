// raysim — RAPOR ÇİZİM İLKELLERİ + GRAFİKLER (rapor.ts'ten ayrıldı).
// Tümü SAF/yan-etkisiz: veri → SVG/HTML string. rapor.ts (assembler) buradan okur.
// Bölme davranışı değiştirmez; fonksiyon gövdeleri birebir taşındı.

import { qrSvgString } from "./qr";
import { CK, RAMP_BLUE, num, lab } from "./chartkit";
import { type SimConfig, terminalMakasSayilari, etkinPeronSayisi, etkinBogazIsgali, terminalDonusParalel, terminalSeriDonus, type TerminalConfig } from "./config";
import type { DurakTalep } from "./tersisletme";
import type { SeferTersSonuc } from "./seferters";
import { hizDegisimNoktalari, bildIstasyonZamanlari, bildKesisimZamanlari, satirYerlesim } from "./grafikNoktalar";
import { terminalHeadway } from "./kapasite";
import type { DurakArasiRing, Sube } from "./ring";
import { blockingTimeRing } from "./blockingtime";
import type { LoopYorunge, MonteCarloResult } from "./signalling";
import { sure } from "./format";
import type { Line } from "./types";

export const INK = "#0C2233";
export const RED = "#C8102E";
export const GOLD = "#A8842C";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export const s0 = (v: number) => `${Math.round(v)} s`;
// Mutlak hat kilometrajı — demiryolu standardı "k+mmm" gösterimi (ör. 1198 m → "1+198").
// Kısıt tablolarında ring-içi göreli metre YERİNE bu kullanılır: makas/geçit konumu
// hattın başından ölçülen mutlak kilometraj olarak okunur (CAD/şartname konvansiyonu).
export const kmFmt = (m: number) => {
  const t = Math.max(0, Math.round(m));
  return `${Math.floor(t / 1000)}+${String(t % 1000).padStart(3, "0")}`;
};

// QR kodu (gömülü SVG) — canlı simülasyon linki için.
// QR SVG — paylaşılan üreticiden (qr.ts); rapor mürekkep renginde.
export function qrSvg(text: string, size = 96): string {
  return qrSvgString(text, size, INK);
}

export function tbl(headers: string[], rows: (string | number)[][], opts: { first?: boolean } = {}): string {
  const head = `<tr>${headers.map((h, i) => `<th class="${opts.first && i === 0 ? "l" : ""}">${esc(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${opts.first && i === 0 ? "l" : ""}">${typeof c === "string" && c.startsWith("<") ? c : esc(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// Durak-arası ring şeması (gömülü SVG): istasyon zinciri + makas/hemzemin işaretleri.
export function ringSemaSvg(rings: DurakArasiRing[], subeler: Sube[] = []): string {
  const n = rings.length;
  if (n === 0) return "";
  const adlar = [rings[0].fromAd, ...rings.map((r) => r.toAd)];
  // Çok duraklı hatta (>12) yatay adlar üst üste biner → adları DİKEY döndür ve
  // yüksekliği en uzun ada göre büyüt. Az durakta klasik yatay 2-kademe düzen.
  const cok = adlar.length > 12;
  const W = 760, pad = cok ? 40 : 56;
  const step = (W - 2 * pad) / Math.max(1, n);
  const px = (i: number) => pad + i * step;
  const font = cok ? 7 : 8.5;
  const maxLen = Math.max(1, ...adlar.map((a) => (a || "").length));
  const labH = cok ? Math.min(120, Math.round(maxLen * font * 0.56 + 6)) : 34;
  const y = cok ? labH + 12 : 74;
  // ŞUBE (dallanma, #1) — ana hattın ALTINA kırmızı çatal olarak çizilir. Her şube
  // kavşak düğümünden diagonal + yatay kol; kolun ucundaki duraklar kırmızı düğüm.
  const dallar = subeler.filter((s) => s.rings.length > 0);
  const brGap = 56;
  const brBaseY = y + (cok ? 30 : 42);
  const branchesH = dallar.length ? dallar.length * brGap + 20 : 0;
  const H = (cok ? y + 42 : 116) + branchesH;
  const line = `<line x1="${px(0).toFixed(1)}" y1="${y}" x2="${px(n).toFixed(1)}" y2="${y}" stroke="${CK.ink}" stroke-width="${cok ? 2.5 : 3.5}" stroke-linecap="round"/>`;
  const dots = adlar.map((_, i) => `<circle cx="${px(i).toFixed(1)}" cy="${y}" r="${cok ? 4 : 5.5}" fill="${CK.surface}" stroke="${CK.ink}" stroke-width="${cok ? 1.8 : 2.2}"/>`).join("");
  const labels = adlar.map((ad, i) => {
    if (cok) {
      const x = px(i).toFixed(1), yt = (y - 9).toFixed(1);
      return `<text transform="rotate(-90 ${x} ${yt})" x="${x}" y="${yt}" text-anchor="start" font-family="${CK.sans}" font-size="${font}" font-weight="600" fill="${CK.ink2}">${esc(ad)}</text>`;
    }
    return lab(px(i), i % 2 === 0 ? y - 16 : y - 30, esc(ad), { anchor: "middle", size: font, color: CK.ink2, weight: 600 });
  }).join("");
  const marks = rings.map((r, i) => {
    const xm = (px(i) + px(i + 1)) / 2; let s = "";
    if (r.makaslar.length) s += lab(xm, y + (cok ? 16 : 21), `⑂ ${r.makaslar.length}`, { anchor: "middle", size: cok ? 8.5 : 11, color: CK.red, weight: 700 });
    if (r.hemzeminler.length) s += lab(xm, y + (cok ? 28 : 35), `⊟ ${r.hemzeminler.length}`, { anchor: "middle", size: cok ? 7 : 9, color: CK.gold });
    return s;
  }).join("");
  // Şube çatalları
  const branchSvg = dallar.map((s, bi) => {
    const at = Math.max(0, Math.min(n, Math.round(s.atIndex)));
    const jx = px(at), jy = y;
    const yBr = brBaseY + bi * brGap;
    const m = s.rings.length;
    const brAd = s.rings.map((r) => r.toAd);
    const bx0 = jx + step * 0.5;
    const avail = Math.max(60, (W - pad) - bx0);
    const brStep = Math.min(step, Math.max(34, avail / Math.max(1, m)));
    const bpx = (k: number) => bx0 + (k - 1) * brStep; // k=1..m şube durakları
    let out = "";
    // Kavşak → ilk şube durağı: diagonal (ayrım makası burada)
    out += `<line x1="${jx.toFixed(1)}" y1="${jy}" x2="${bpx(1).toFixed(1)}" y2="${yBr}" stroke="${CK.red}" stroke-width="2.4" stroke-linecap="round"/>`;
    if (m > 1) out += `<line x1="${bpx(1).toFixed(1)}" y1="${yBr}" x2="${bpx(m).toFixed(1)}" y2="${yBr}" stroke="${CK.red}" stroke-width="2.4" stroke-linecap="round"/>`;
    // Kavşak makası vurgusu (ana hat düğümünde)
    out += `<circle cx="${jx.toFixed(1)}" cy="${jy}" r="${cok ? 4.5 : 6}" fill="${CK.red}" stroke="#fff" stroke-width="1.4"/>`;
    // Şube adı — kolun ORTASINDA, çizginin üstünde (kavşak makası ⑂ işaretiyle çakışmaz)
    const adX = (bpx(1) + bpx(m)) / 2;
    out += `<text x="${adX.toFixed(1)}" y="${(yBr - 7).toFixed(1)}" text-anchor="middle" font-family="${CK.sans}" font-size="8" font-weight="700" fill="${CK.red}">${esc(s.ad)}</text>`;
    for (let k = 1; k <= m; k++) {
      out += `<circle cx="${bpx(k).toFixed(1)}" cy="${yBr}" r="4.5" fill="${CK.surface}" stroke="${CK.red}" stroke-width="2"/>`;
      out += `<text x="${bpx(k).toFixed(1)}" y="${(yBr + 14).toFixed(1)}" text-anchor="middle" font-family="${CK.sans}" font-size="${cok ? 6.5 : 7.5}" font-weight="600" fill="${CK.ink2}">${esc(brAd[k - 1])}</text>`;
    }
    return out;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${line}${marks}${dots}${labels}${branchSvg}</svg>`;
}

// Blocking-time bileşen barları (gömülü SVG): her blok için yığılı süre (ordinal mavi rampa).
export function blockingBarSvg(bloklarTum: { i: number; makasBlok?: boolean; tSetup: number; tSighting: number; tApproach: number; tRunning: number; tClearing: number; tRelease: number; toplam: number }[], kritik: number, kritikRenk: string = CK.red, en = false): string {
  if (!bloklarTum.length) return "";
  // Çok blokta (uzun hat) TÜMÜNÜ çizmek SVG'yi sayfa boyunu aşacak kadar uzatır → taşma.
  // En yüksek blocking-time'lı N bloğu seç (kritik blok DAİMA dahil), blok no'ya göre sırala.
  const LIM = 16;
  let bloklar = bloklarTum;
  if (bloklarTum.length > LIM) {
    const secili = [...bloklarTum].sort((a, b) => b.toplam - a.toplam).slice(0, LIM);
    if (!secili.some((b) => b.i === kritik)) {
      const kb = bloklarTum.find((b) => b.i === kritik);
      if (kb) { secili.pop(); secili.push(kb); }
    }
    bloklar = secili.sort((a, b) => a.i - b.i);
  }
  const parts = [
    { k: "tSetup", c: RAMP_BLUE[0], ad: en ? "Setup" : "Tanzim" }, { k: "tSighting", c: RAMP_BLUE[1], ad: en ? "Sighting" : "Görme" },
    { k: "tApproach", c: RAMP_BLUE[2], ad: en ? "Approach" : "Yaklaşma" }, { k: "tRunning", c: RAMP_BLUE[3], ad: en ? "Running" : "Seyir" },
    { k: "tClearing", c: RAMP_BLUE[4], ad: en ? "Clearing" : "Temizleme" }, { k: "tRelease", c: RAMP_BLUE[5], ad: en ? "Release" : "Serbest" },
  ] as const;
  const max = Math.max(...bloklar.map((b) => b.toplam)) || 1;
  const rowH = 20, W = 760, labelW = 64, barW = W - labelW - 64, barH = 12;
  const rows = bloklar.map((b, idx) => {
    let x = labelW;
    const yy = idx * rowH + 6;
    const segs = parts.map((p) => {
      const w = (b[p.k] / max) * barW;
      const rect = `<rect x="${x.toFixed(1)}" y="${yy}" width="${Math.max(0, w - 1.5).toFixed(1)}" height="${barH}" rx="1" fill="${p.c}"/>`;
      x += w;
      return rect;
    }).join("");
    const kr = b.i === kritik;
    return `${lab(0, yy + barH - 2.5, `#${b.i}${b.makasBlok ? " ⑂" : ""}`, { size: 9, weight: kr ? 700 : 400, color: kr ? kritikRenk : CK.ink })}${segs}${num(x + 6, yy + barH - 2.5, `${b.toplam.toFixed(0)}s`, { size: 9, color: CK.ink })}`;
  }).join("");
  const legend = parts.map((p, i) => `<rect x="${labelW + i * 118}" y="${bloklar.length * rowH + 12}" width="10" height="10" rx="1.5" fill="${p.c}"/>${lab(labelW + i * 118 + 14, bloklar.length * rowH + 21, p.ad, { size: 8.5, color: CK.ink2 })}`).join("");
  const H = bloklar.length * rowH + 38;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${rows}${legend}</svg>`;
}

// Bir Line'ı ters çevir (dönüş yönü): konum aynala + eğim işaretini çevir.
export function reverseLineOf(line: Line): Line {
  const L = line.length;
  return {
    ...line, id: line.id + "-rev", name: line.name + " (dönüş)",
    stations: line.stations.map((s) => ({ ...s, position: L - s.position })).reverse(),
    segments: line.segments.map((s) => ({ start: L - s.end, end: L - s.start, vmax: s.vmax, gradient: -s.gradient })).reverse(),
  };
}

// ornekler (t artan, 0..periyot) → faz anındaki kümülatif s (doğrusal ara değer).
export function bfSampleS(orn: LoopYorunge["ornekler"], faz: number): number {
  const n = orn.length; if (n === 0) return 0;
  if (faz <= orn[0].t) return orn[0].s;
  if (faz >= orn[n - 1].t) return orn[n - 1].s;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (orn[m].t <= faz) lo = m; else hi = m; }
  const a = orn[lo], b = orn[hi], dt = b.t - a.t || 1;
  return a.s + (b.s - a.s) * ((faz - a.t) / dt);
}

// Zaman-mesafe diyagramı / Bildfahrplan (gömülü SVG) — GİT-GEL LOOP (canlı sim ile birebir):
// her tramvay gidiş şeridinde 0→L tırmanır, terminalde döner, dönüş şeridinde L→0 iner
// (üçgen dalga); filo headway aralığıyla ötelenir → paralel zigzaglar. Gidiş (mavi) ile
// dönüş (turuncu) çizgilerinin kesişimi = karşılaşma; çizgi aralığı = headway.
export function bildfahrplanSvg(loopY: LoopYorunge, line: Line, filo: number, en = false): string {
  const { periyot, L, loopLen, ornekler } = loopY;
  if (L <= 0 || periyot <= 0 || filo < 1) return "";
  const offset = periyot / filo;
  const nist = line.stations.length;
  const W = 820, H = Math.max(280, nist * 13 + 100), padL = 108, padR = 14, padT = 32, padB = 46;
  const lblFont = nist > 22 ? 7 : (nist > 14 ? 7.5 : 8.5);
  const pw = W - padL - padR, ph = H - padT - padB;
  const xOf = (t: number) => padL + (t / periyot) * pw;
  const yOf = (fp: number) => padT + (fp / L) * ph; // fp=0 üstte (başlangıç), fp=L altta (bitiş)
  const eksenY = padT + ph;
  const mss = (t: number) => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  // Durak çizgileri + DECLUTTER'lı etiketler (çok yakın adlar asgari boşluğa itilir + leader).
  const gridLines = line.stations.map((s) =>
    `<line x1="${padL}" y1="${yOf(s.position).toFixed(1)}" x2="${W - padR}" y2="${yOf(s.position).toFixed(1)}" stroke="${CK.grid}"/>`).join("");
  const minGap = lblFont + 2.5;
  let sonEtiketY = -Infinity;
  const etiketler = line.stations.map((s) => {
    const gercekY = yOf(s.position);
    const ey = Math.max(gercekY, sonEtiketY + minGap);
    sonEtiketY = ey;
    const leader = Math.abs(ey - gercekY) > 0.8
      ? `<path d="M ${(padL - 5).toFixed(1)} ${gercekY.toFixed(1)} H ${(padL - 2).toFixed(1)} V ${ey.toFixed(1)} H ${padL}" fill="none" stroke="${CK.grid}" stroke-width="0.6"/>`
      : "";
    return leader + lab(padL - 6, ey + 2.5, esc(s.name), { anchor: "end", size: lblFont, color: CK.ink2 });
  }).join("");
  const st = gridLines + etiketler;
  // Arka plan: seyrek soluk dikey ızgara (etiketsiz — okunabilirlik için).
  const tg = Array.from({ length: 13 }).map((_, i) => {
    const x = xOf((periyot * i) / 12);
    return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${eksenY}" stroke="${CK.grid}" opacity="0.5"/>`;
  }).join("") + `<line x1="${padL}" y1="${eksenY.toFixed(1)}" x2="${W - padR}" y2="${eksenY.toFixed(1)}" stroke="${CK.ink2}" stroke-width="0.8"/>`;
  // Her tramvay: fp(t)'yi örnekle, yön değişiminde böl → gidiş (mavi) / dönüş (turuncu).
  // Referans tren (k=0) kalın çizilir — zaman etiketleri bu trenindir.
  const adim = periyot / 260;
  const poly = (pts: string[], col: string, ref: boolean) => pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${col}" stroke-width="${ref ? 1.8 : 0.9}" stroke-linejoin="round" opacity="${ref ? 1 : 0.72}"/>` : "";
  let gLines = "", dLines = "";
  for (let k = 0; k < filo; k++) {
    const ref = k === 0;
    let gseg: string[] = [], dseg: string[] = [], prev: boolean | null = null;
    for (let t = 0; t <= periyot + 1e-6; t += adim) {
      const faz = (((t + k * offset) % periyot) + periyot) % periyot;
      const s = bfSampleS(ornekler, faz);
      const g = s <= L + 1e-6;
      const fp = g ? Math.min(L, s) : Math.max(0, loopLen - s);
      if (prev !== null && g !== prev) { gLines += poly(gseg, CK.blue, ref); dLines += poly(dseg, CK.orange, ref); gseg = []; dseg = []; }
      (g ? gseg : dseg).push(`${xOf(t).toFixed(1)},${yOf(fp).toFixed(1)}`);
      prev = g;
    }
    gLines += poly(gseg, CK.blue, ref); dLines += poly(dseg, CK.orange, ref);
  }
  // Gerekli zaman noktaları: referans trenin istasyon geçişleri (iniş/çıkış) + kesişimler.
  const istOlay = bildIstasyonZamanlari(loopY, line);
  const kesisim = bildKesisimZamanlari(loopY, filo, offset);
  const olaylar = [...istOlay.map((o) => ({ t: o.t, fp: o.fp, tip: "durak" as const, yon: o.yon })), ...kesisim.map((c) => ({ t: c.t, fp: c.fp, tip: "kesisim" as const, yon: undefined }))].sort((a, b) => a.t - b.t);
  const eksenOlay: typeof olaylar = [];
  const zEsik = periyot / 120;
  for (const o of olaylar) { const s = eksenOlay[eksenOlay.length - 1]; if (s && o.t - s.t < zEsik) { if (o.tip === "durak" && s.tip === "kesisim") eksenOlay[eksenOlay.length - 1] = o; continue; } eksenOlay.push(o); }
  const satir = satirYerlesim(eksenOlay.map((o) => xOf(o.t)), 26, 3);
  const olayRenk = (tip: string) => (tip === "durak" ? CK.ink2 : CK.amber);
  const guides = eksenOlay.map((o) => `<line x1="${xOf(o.t).toFixed(1)}" y1="${padT}" x2="${xOf(o.t).toFixed(1)}" y2="${eksenY.toFixed(1)}" stroke="${olayRenk(o.tip)}" stroke-width="0.5" opacity="${o.tip === "durak" ? 0.28 : 0.5}"${o.tip === "kesisim" ? ' stroke-dasharray="2 2"' : ""}/>`).join("");
  const kesDots = kesisim.map((c) => `<rect x="${(xOf(c.t) - 2.2).toFixed(1)}" y="${(yOf(c.fp) - 2.2).toFixed(1)}" width="4.4" height="4.4" transform="rotate(45 ${xOf(c.t).toFixed(1)} ${yOf(c.fp).toFixed(1)})" fill="${CK.amber}" stroke="#fff" stroke-width="0.5"/>`).join("");
  const istDots = istOlay.map((o) => `<circle cx="${xOf(o.t).toFixed(1)}" cy="${yOf(o.fp).toFixed(1)}" r="1.7" fill="${o.yon === "g" ? CK.blue : CK.orange}"/>`).join("");
  const zEtiket = eksenOlay.map((o, i) => num(xOf(o.t), eksenY + 11 + satir[i] * 9, mss(o.t), { anchor: "middle", size: 6.8, weight: o.tip === "durak" ? 600 : 400, color: olayRenk(o.tip) })).join("");
  const leg = `<text x="${W - padR}" y="13" text-anchor="end" font-family="${CK.sans}" font-size="8.5"><tspan fill="${CK.blue}">▬ ${en ? "outbound" : "gidiş"}</tspan>  <tspan fill="${CK.orange}">▬ ${en ? "return" : "dönüş"}</tspan>  <tspan fill="${CK.amber}">◆ ${en ? "meeting" : "karşılaşma"}</tspan></text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${tg}${guides}${st}${gLines}${dLines}${kesDots}${istDots}${zEtiket}${leg}</svg>`;
}

// Belirleyici kısıt karşılaştırması (gömülü SVG): hMin'i oluşturan rakip headway kısıtları
// yatay çubukla; en yüksek (bağlayan) vurgulu. Hangi kısıtın kapasiteyi sınırladığını gösterir.
export function kisitBarSvg(kisitlar: { anahtar: string; ad: string; headway: number; aktif: boolean }[], kritikRenk: string, en = false): string {
  const v = kisitlar.filter((k) => k.headway > 0).sort((a, b) => b.headway - a.headway);
  if (!v.length) return "";
  const kisaAd: Record<string, string> = en
    ? { blok: "Block (Sperrzeit)", terminal: "Terminal (turnback)", tekhat: "Single track", kavsak: "Junction", sinyal: "Signal" }
    : { blok: "Blok (Sperrzeit)", terminal: "Terminal (turnback)", tekhat: "Tek hat", kavsak: "Kavşak", sinyal: "Sinyal" };
  const maxH = v[0].headway;
  const W = 620, padL = 118, padR = 40, rowH = 20, gap = 6, padT = 8;
  const H = padT + v.length * (rowH + gap);
  const bw = W - padL - padR;
  const rows = v.map((k, i) => {
    const y = padT + i * (rowH + gap);
    const w = Math.max(1, (k.headway / maxH) * bw);
    const col = k.aktif ? kritikRenk : CK.blue;
    return `<text x="${padL - 6}" y="${(y + rowH / 2 + 3).toFixed(1)}" text-anchor="end" font-family="${CK.sans}" font-size="9" font-weight="${k.aktif ? 700 : 400}" fill="${k.aktif ? kritikRenk : CK.ink2}">${esc(kisaAd[k.anahtar] || k.ad)}</text>`
      + `<rect x="${padL}" y="${y}" width="${bw}" height="${rowH}" rx="2" fill="${CK.track}"/>`
      + `<rect x="${padL}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" rx="2" fill="${col}" fill-opacity="${k.aktif ? 1 : 0.55}"/>`
      + `<text x="${(padL + w + 4).toFixed(1)}" y="${(y + rowH / 2 + 3).toFixed(1)}" font-family="${CK.sans}" font-size="9" font-weight="${k.aktif ? 700 : 500}" fill="${CK.ink2}">${Math.round(k.headway)} s</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${rows}</svg>`;
}

// Hız profili v(x) (gömülü SVG): gidiş legi gerçek hız (loop yörüngesi ds/dt) + hız-limiti
// zarfı (segment vmax). Dip = istasyon duruşu; limitin altı = hızlanma/frenleme. (Eğim/enerji YOK.)
export function hizProfilSvg(loopY: LoopYorunge, line: Line, en = false): string {
  const L = loopY.L, orn = loopY.ornekler;
  if (L <= 0 || orn.length < 2) return "";
  const hiz: { s: number; v: number }[] = [];
  for (let i = 1; i < orn.length; i++) {
    if (orn[i].s > L + 1e-6) break;
    const dt = orn[i].t - orn[i - 1].t;
    hiz.push({ s: orn[i].s, v: dt > 1e-6 ? Math.max(0, (orn[i].s - orn[i - 1].s) / dt) : 0 });
  }
  if (hiz.length < 2) return "";
  const vTopRaw = Math.max(...line.segments.map((sg) => sg.vmax), ...hiz.map((p) => p.v), 1) * 3.6;
  const vTop = Math.ceil((vTopRaw + 3) / 10) * 10;
  const W = 820, H = 256, padL = 40, padR = 14, padT = 18, padB = 50;
  const pw = W - padL - padR, ph = H - padT - padB;
  const X = (s: number) => padL + (s / L) * pw;
  const Y = (vkmh: number) => padT + (1 - vkmh / vTop) * ph;
  const eksenY = padT + ph;
  const yIsaret = Array.from({ length: Math.floor(vTop / 5) + 1 }, (_, i) => i * 5).map((v) =>
    `<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${padL + pw}" y2="${Y(v).toFixed(1)}" stroke="${CK.grid}"/>${num(padL - 5, Y(v) + 2.5, `${v}`, { anchor: "end", size: 9 })}`).join("");
  const istIsaret = line.stations.filter((s) => s.tip !== "gecit").map((s) =>
    `<line x1="${X(s.position).toFixed(1)}" y1="${padT}" x2="${X(s.position).toFixed(1)}" y2="${eksenY.toFixed(1)}" stroke="${CK.grid}" opacity="0.7"/>`).join("");
  const limitYol = line.segments.map((sg, i) => `${i === 0 ? "M" : "L"}${X(sg.start).toFixed(1)},${Y(sg.vmax * 3.6).toFixed(1)} L${X(sg.end).toFixed(1)},${Y(sg.vmax * 3.6).toFixed(1)}`).join(" ");
  const hizYol = hiz.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.s).toFixed(1)},${Y(p.v * 3.6).toFixed(1)}`).join(" ");
  const eksen = `<line x1="${padL}" y1="${eksenY.toFixed(1)}" x2="${padL + pw}" y2="${eksenY.toFixed(1)}" stroke="${CK.ink2}" stroke-width="0.8"/>`;
  // Değişim noktaları: km etiketi tam o noktada (durak/limit değişimi/uçlar), çakışmasız satırlarda.
  const nok = hizDegisimNoktalari(loopY, line);
  const nokRenk = (tip: string) => (tip === "durak" ? CK.red : tip === "limit" ? CK.amber : CK.muted);
  const satir = satirYerlesim(nok.map((n) => X(n.s)), 28, 3);
  const nokIsaret = nok.map((n, i) => {
    const x = X(n.s), y = Y(n.v * 3.6), ly = eksenY + 11 + satir[i] * 9, renk = nokRenk(n.tip);
    return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${eksenY.toFixed(1)}" stroke="${renk}" stroke-width="0.5" opacity="0.5"/>`
      + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${renk}"/>`
      + num(x, ly, `${(n.s / 1000).toFixed(2)}`, { anchor: "middle", size: 6.8, weight: n.tip === "durak" ? 600 : 400, color: renk });
  }).join("");
  const leg = `<text x="${W - padR}" y="12" text-anchor="end" font-family="${CK.sans}" font-size="8.5"><tspan fill="${CK.blue}">▬ ${en ? "actual speed" : "gerçek hız"}</tspan>  <tspan fill="${CK.muted}">╌ ${en ? "speed limit" : "hız limiti"}</tspan></text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${yIsaret}${istIsaret}${eksen}<path d="${limitYol}" fill="none" stroke="${CK.muted}" stroke-width="1" stroke-dasharray="4 3" opacity="0.85"/><path d="${hizYol}" fill="none" stroke="${CK.blue}" stroke-width="1.4" stroke-linejoin="round"/>${nokIsaret}${leg}${lab(padL + pw / 2, H - 4, en ? "distance (km) →" : "mesafe (km) →", { anchor: "middle", size: 8 })}${lab(8, padT + 4, "km/h", { size: 8 })}</svg>`;
}

// Yük profili + dwell dökümü (gömülü SVG, ortak x=mesafe): üstte durak başına tepe araç
// yükü (doluluğa göre renkli), altta duruş süresinin kapı-açma/yolcu/kapı-kapama kırılımı.
export function yukDwellSvg(duraklar: DurakTalep[], rings: DurakArasiRing[], en = false): string {
  if (duraklar.length < 2 || rings.length < 1) return "";
  const YESIL = "#2E7D57";
  const dRenk = (d: number) => (d > 0.85 ? CK.red : d > 0.5 ? CK.amber : YESIL);
  const L = Math.max(...duraklar.map((d) => d.konum), 1);
  let acc = 0;
  const dw = rings.map((r) => { acc += r.uzunluk; const a = r.kapiAcma ?? 2, k = r.kapiKapama ?? 2; return { konum: acc, a, y: Math.max(0, r.dwell - a - k), k, t: r.dwell, ad: r.toAd }; });
  const yukTop = Math.max(...duraklar.map((d) => d.tepeYuk), 1), dwTop = Math.max(...dw.map((d) => d.t), 1);
  const tepe = duraklar.reduce((p, c) => (c.tepeYuk > p.tepeYuk ? c : p), duraklar[0]);
  const W = 760, padL = 40, padR = 12;
  const X = (kk: number) => padL + (kk / L) * (W - padL - padR);
  // DEĞİŞKEN çubuk genişliği: komşu boşluğa göre → yakın duraklarda incelir, üst üste binmez.
  const barGen = (kk: number[]) => { const xs = kk.map(X); return xs.map((x, i) => { const sol = i > 0 ? x - xs[i - 1] : Infinity, sag = i < xs.length - 1 ? xs[i + 1] - x : Infinity; const g = Math.min(sol, sag); return Math.max(1.2, Math.min(14, (Number.isFinite(g) ? g : 14) * 0.85)); }); };
  const bwY = barGen(duraklar.map((d) => d.konum)), bwD = barGen(dw.map((d) => d.konum));
  // Bar üstü değer etiketi (döndürülmüş, dik) — her barın tam sayı değeri, çakışmasız.
  const dikNum = (x: number, topY: number, val: number, col: string, kalin = false): string =>
    `<text x="${x.toFixed(1)}" y="${(topY - 2).toFixed(1)}" transform="rotate(-90 ${x.toFixed(1)} ${(topY - 2).toFixed(1)})" text-anchor="start" font-family="${CK.sans}" font-size="6" font-weight="${kalin ? 700 : 500}" fill="${col}">${val}</text>`;
  // Üst: yük
  const H1 = 162, pt1 = 34, pb1 = 8, ph1 = H1 - pt1 - pb1;
  const Y1 = (v: number) => pt1 + (1 - v / yukTop) * ph1;
  const yukBar = duraklar.map((d, i) => `<rect x="${(X(d.konum) - bwY[i] / 2).toFixed(1)}" y="${Y1(d.tepeYuk).toFixed(1)}" width="${bwY[i].toFixed(1)}" height="${Math.max(0, pt1 + ph1 - Y1(d.tepeYuk)).toFixed(1)}" rx="1" fill="${dRenk(d.doluluk)}" fill-opacity="0.9"/>`).join("");
  const yukDeger = duraklar.map((d) => dikNum(X(d.konum), Y1(d.tepeYuk), Math.round(d.tepeYuk), dRenk(d.doluluk), d.ad === tepe.ad)).join("");
  const y1t = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yukTop * f)).map((v) => num(padL - 5, Y1(v) + 2.5, `${v}`, { anchor: "end", size: 8 })).join("");
  // Alt: dwell (üstün altına kaydır) — bar üstü değer + eksiksiz km ekseni
  const gap = 30, H2 = 132, pt2 = H1 + gap, pb2 = 42, ph2 = H2 - 4 - pb2;
  const base2 = pt2 + ph2;
  const Y2 = (v: number) => pt2 + (1 - v / dwTop) * ph2;
  const s2 = (x: number, w: number, yT: number, yB: number, c: string) => `<rect x="${(x - w / 2).toFixed(1)}" y="${yT.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, yB - yT).toFixed(1)}" fill="${c}"/>`;
  const dwBar = dw.map((d, i) => s2(X(d.konum), bwD[i], Y2(d.a), base2, "#9AA7B2") + s2(X(d.konum), bwD[i], Y2(d.a + d.y), Y2(d.a), CK.blue) + s2(X(d.konum), bwD[i], Y2(d.a + d.y + d.k), Y2(d.a + d.y), "#C9D2DA")).join("");
  const dwDeger = dw.map((d) => dikNum(X(d.konum), Y2(d.t), Math.round(d.t), CK.ink)).join("");
  const y2t = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(dwTop * f)).map((v) => num(padL - 5, Y2(v) + 2.5, `${v}`, { anchor: "end", size: 8 })).join("");
  // X ekseni EKSİKSİZ: her durağın km'si (çakışmasız satırlara dağıtılmış).
  const kmSatir = satirYerlesim(dw.map((d) => X(d.konum)), 22, 3);
  const xt = dw.map((d, i) => num(X(d.konum), base2 + 11 + kmSatir[i] * 9, `${(d.konum / 1000).toFixed(2)}`, { anchor: "middle", size: 6.6 })).join("");
  const H = pt2 + H2 - 4;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">`
    + `${y1t}<line x1="${padL}" y1="${pt1 + ph1}" x2="${W - padR}" y2="${pt1 + ph1}" stroke="${CK.ink2}" stroke-width="0.7"/>${yukBar}${yukDeger}`
    + lab(padL, pt1 - 22, `${en ? "load (pax/h)" : "yük (yolcu/sa)"} — ${en ? "peak" : "tepe"}: ${esc(tepe.ad)} · ${Math.round(tepe.tepeYuk)} ${en ? "pax/h" : "yolcu/sa"} @ ${(tepe.konum / 1000).toFixed(2)} km`, { size: 8, weight: 600, color: CK.ink2 })
    + `${y2t}<line x1="${padL}" y1="${base2}" x2="${W - padR}" y2="${base2}" stroke="${CK.ink2}" stroke-width="0.7"/>${dwBar}${dwDeger}${xt}`
    + lab(padL, pt2 - 6, en ? "dwell (s): open / passenger / close" : "duruş (s): açma / yolcu / kapama", { size: 8, weight: 600, color: CK.ink2 })
    + lab(padL + (W - padL - padR) / 2, H - 3, en ? "distance (km) →" : "mesafe (km) →", { anchor: "middle", size: 8, color: CK.ink2 })
    + `</svg>`;
}

// Terminal turnback kapasitesi (tablo + not): her ucun makas/peron/boğaz → dönüş kapasitesi.
export function turnbackTbl(bas: TerminalConfig, son: TerminalConfig, cfg: SimConfig, en = false): string {
  const olc = (t: TerminalConfig) => {
    const mk = terminalMakasSayilari(t), peron = etkinPeronSayisi(t), hw = terminalHeadway(t, cfg);
    const bogaz = t.tip === "dongu" ? 0 : (terminalSeriDonus(t) ? 2 : 1) * etkinBogazIsgali(t, cfg);
    const peronBasi = t.tip === "dongu" ? 0 : (t.peronIsgali || 0) / Math.max(1, terminalDonusParalel(t));
    const kap = hw > 0 ? Math.round(3600 / hw) : Infinity;
    const makasMetin = [mk.s > 0 ? `${mk.s} S` : "", mk.x > 0 ? `${mk.x} X` : ""].filter(Boolean).join("+") || "—";
    return { mk, peron, hw, bogaz, peronBasi, kap, makasMetin, bagAlt: peronBasi >= bogaz };
  };
  const b = olc(bas), s = olc(son);
  const bagBas = b.hw >= s.hw && b.hw > 0;
  const kapStr = (k: number) => (k === Infinity ? "∞" : `${k}`);
  const head = en ? ["Terminal", "Switches", "Platforms", "Turnback headway", "Capacity (trams/h)", "Binding sub-factor"]
    : ["Terminal", "Makas", "Peron", "Dönüş headway", "Kapasite (tramvay/sa)", "Baskın alt-etken"];
  const alt = (o: typeof b) => (o.hw <= 0 ? "—" : o.bagAlt ? (en ? "platform" : "peron") : (en ? "throat (switch)" : "boğaz (makas)"));
  const rows = [
    [en ? "Start" : "Başlangıç", `${b.makasMetin}-makas`, `${b.peron}`, b.hw > 0 ? `${Math.round(b.hw)} s${bagBas ? " ◀" : ""}` : "—", kapStr(b.kap), alt(b)],
    [en ? "End" : "Bitiş", `${s.makasMetin}-makas`, `${s.peron}`, s.hw > 0 ? `${Math.round(s.hw)} s${!bagBas && s.hw > 0 ? " ◀" : ""}` : "—", kapStr(s.kap), alt(s)],
  ];
  const bagAd = bagBas ? (en ? "start terminal" : "başlangıç terminali") : (en ? "end terminal" : "bitiş terminali");
  const not = en
    ? `Turnback capacity = 3600 ÷ turnback headway; the headway is the greater of platform occupation and throat (switch) traversal. In an S-switch the arrival and departure movements use a single throat in series (2×), whereas an X-switch or twin-platform layout provides separate legs (1×), yielding a higher capacity. The binding end (◀, ${bagAd}) governs the line's terminal capacity; where the throat is dominant an additional X-switch, and where platform occupation is dominant an additional (twin) platform, raises the terminal capacity.`
    : `Turnback kapasitesi = 3600 ÷ dönüş headway; headway, peron işgali ile boğaz (makas) geçişinin büyüğüdür. S-makasta varış ve kalkış hareketleri tek boğazı seri kullanır (2×); X-makas ya da çift peron düzeninde ayrı bacaklar bulunur (1×) ve daha yüksek kapasite verir. Bağlayan uç (◀, ${bagAd}) hattın terminal kapasitesini belirler; boğazın baskın olduğu durumda ilave bir X-makas, peron işgalinin baskın olduğu durumda ilave (çift) peron, terminal kapasitesini artırır.`;
  return tbl(head, rows, { first: true }) + `<div class="gs" style="font-size:9.5pt">${not}</div>`;
}

// Hemzemin geçit & TSP gecikme (gömülü SVG): geçit başına yavaşlama + karayolu bekleme.
export function hemzeminSvg(rings: DurakArasiRing[], cfg: SimConfig): { svg: string; adet: number; karayolu: number; toplamTur: number } {
  const W = cfg.kisitGenisligi || 40;
  let acc = 0; const g: { konum: number; tip: string; yavas: number; bekle: number }[] = [];
  for (const r of rings) {
    const vmax = Math.max(0.1, r.vmax);
    for (const h of r.hemzeminler) {
      const hiz = Math.max(0.1, h.hiz);
      const yavas = hiz < vmax ? W * (1 / hiz - 1 / vmax) : 0;
      g.push({ konum: acc + Math.max(0, Math.min(r.uzunluk, h.konum)), tip: h.tip, yavas, bekle: h.tip === "karayolu" ? (h.bekleme ?? 0) : 0 });
    }
    acc += r.uzunluk;
  }
  if (!g.length) return { svg: "", adet: 0, karayolu: 0, toplamTur: 0 };
  g.sort((a, b) => a.konum - b.konum);
  const L = Math.max(acc, 1), top = Math.max(...g.map((x) => x.yavas + x.bekle), 1);
  const karayolu = g.filter((x) => x.tip === "karayolu").length;
  const toplamTur = g.reduce((s, x) => s + x.yavas + x.bekle, 0) * 2;
  const Wd = 720, padL = 36, padR = 12, padT = 14, padB = 38, pw = Wd - padL - padR, ph = 164 - padT - padB, H = 164;
  const X = (k: number) => padL + (k / L) * pw, Y = (v: number) => padT + (1 - v / top) * ph;
  const bw = Math.max(3, Math.min(16, pw / g.length * 0.6));
  const base = padT + ph;
  const bars = g.map((x) => {
    const cx = X(x.konum), yBek = Y(x.bekle), yTop = Y(x.bekle + x.yavas), toplam = x.yavas + x.bekle;
    const bekRenk = x.bekle > 20 ? CK.red : x.bekle > 8 ? CK.amber : CK.blue;
    return `<line x1="${cx.toFixed(1)}" y1="${(toplam > 0 ? yTop : base - 2).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${base.toFixed(1)}" stroke="${CK.grid}" stroke-width="0.6"/>`
      + (x.yavas > 0 ? `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, yBek - yTop).toFixed(1)}" fill="#9AA7B2"/>` : "")
      + (x.bekle > 0 ? `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yBek.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, base - yBek).toFixed(1)}" fill="${bekRenk}"/>` : "")
      + (toplam === 0 ? `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(base - 2).toFixed(1)}" width="${bw.toFixed(1)}" height="2" fill="#9AA7B2"/>` : "")
      + (toplam > 0 ? num(cx, yTop - 2, `${Math.round(toplam)}s`, { anchor: "middle", size: 6.5, color: CK.ink2 }) : "")
      + num(cx, base + 20, `${(x.konum / 1000).toFixed(2)}`, { anchor: "middle", size: 7, color: CK.ink });
  }).join("");
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f)).map((v) => `<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${padL + pw}" y2="${Y(v).toFixed(1)}" stroke="${CK.grid}" opacity="0.6"/>${num(padL - 4, Y(v) + 2.5, `${v}`, { anchor: "end", size: 7.5 })}`).join("");
  // Eksen uçları (geçit km'leri barlarda etiketli olduğundan yalnız 0 ve son)
  const xt = num(X(0), base + 10, "0", { anchor: "middle", size: 7.5 }) + num(X(L), base + 10, `${(L / 1000).toFixed(1)}`, { anchor: "middle", size: 7.5 });
  const svg = `<svg viewBox="0 0 ${Wd} ${H}" width="100%" style="max-width:100%">${yt}<line x1="${padL}" y1="${padT + ph}" x2="${padL + pw}" y2="${padT + ph}" stroke="${CK.ink2}" stroke-width="0.7"/>${bars}${xt}${lab(padL, padT - 3, "s", { size: 8 })}${lab(padL + pw / 2, H - 2, "km →", { anchor: "middle", size: 8 })}</svg>`;
  return { svg, adet: g.length, karayolu, toplamTur };
}

// Sefer↔Ters entegre KONUM DİYAGRAMI (gömülü SVG): hat boyunca araçlar (gidiş/dönüş),
// kısa dönüş makasları (🔄, kırmızı) ve bağlanan araç→makas öneri okları.
export function seferTersSvg(ste: SeferTersSonuc): string {
  if (!ste.gecerli) return "";
  const Lkm = ste.L / 1000; if (Lkm <= 0) return "";
  const W = 720, padL = 12, padR = 14, midY = 50, H = 132, axisY = H - 24;
  const X = (km: number) => padL + (km / Math.max(0.001, Lkm)) * (W - padL - padR);
  const oneriAracSet = new Set(ste.oneriler.map((o) => o.aracNo));
  // x-ekseni km ızgarası — HER ZAMAN girili: ~8 bölmeye yakın "güzel" adım + uçlar.
  const hedef = Lkm / 8, p10 = Math.pow(10, Math.floor(Math.log10(hedef || 1)));
  const kmStep = [1, 2, 2.5, 5, 10].map((c) => c * p10).find((c) => c >= hedef) ?? 10 * p10;
  const kmTicks: number[] = [];
  for (let k = 0; k <= Lkm + 1e-6; k += kmStep) kmTicks.push(Math.round(k * 100) / 100);
  if (kmTicks[kmTicks.length - 1] < Lkm - 1e-6) kmTicks.push(Math.round(Lkm * 100) / 100);
  const izgara = kmTicks.map((k) => `<line x1="${X(k).toFixed(1)}" y1="${midY - 20}" x2="${X(k).toFixed(1)}" y2="${axisY}" stroke="${CK.grid}" stroke-width="0.6" stroke-dasharray="2 3"/>`
    + num(X(k), axisY + 11, k.toFixed(k % 1 === 0 ? 0 : 1), { anchor: "middle", size: 7.5 })).join("")
    + num(W - padR, axisY + 11, "km →", { anchor: "end", size: 7.5, weight: 600, color: CK.ink2 });
  const hat = `<line x1="${padL}" y1="${midY}" x2="${W - padR}" y2="${midY}" stroke="${CK.track}" stroke-width="4" stroke-linecap="round"/>`;
  // TERS İŞLETME YAPILABİLEN TÜM MAKASLAR: işaret (◆) + km etiketi (iki satıra dağıtılmış).
  const makas = ste.makaslar.map((m, i) => {
    const x = X(m.km), renk = m.onerilir ? CK.red : CK.ink2, ly = i % 2 === 1 ? midY + 33 : midY + 22;
    return `<line x1="${x.toFixed(1)}" y1="${midY - 8}" x2="${x.toFixed(1)}" y2="${midY + 8}" stroke="${renk}" stroke-width="${m.onerilir ? 2 : 1.2}"/>`
      + `<rect x="${(x - 3).toFixed(1)}" y="${(midY - 3).toFixed(1)}" width="6" height="6" transform="rotate(45 ${x.toFixed(1)} ${midY})" fill="${renk}"/>`
      + num(x, ly, `${m.onerilir ? "🔄 " : ""}${m.km.toFixed(2)}`, { anchor: "middle", size: 7, weight: m.onerilir ? 700 : 500, color: renk });
  }).join("");
  const oklar = ste.oneriler.map((o) => `<line x1="${X(o.aracKm).toFixed(1)}" y1="${midY - 15}" x2="${X(o.makasKm).toFixed(1)}" y2="${midY - 15}" stroke="${CK.red}" stroke-width="0.8" stroke-dasharray="3 2"/>`).join("");
  const arac = ste.araclar.map((a) => {
    const x = X(a.km), oner = oneriAracSet.has(a.no), y = a.gidis ? midY - 6 : midY + 6;
    const renk = oner ? CK.red : a.gidis ? CK.blue : CK.orange;
    const p = a.gidis ? `${(x - 4).toFixed(1)},${y - 4} ${(x + 4).toFixed(1)},${y} ${(x - 4).toFixed(1)},${y + 4}` : `${(x + 4).toFixed(1)},${y - 4} ${(x - 4).toFixed(1)},${y} ${(x + 4).toFixed(1)},${y + 4}`;
    return `<polygon points="${p}" fill="${renk}"/>` + num(x, a.gidis ? y - 6 : y + 12, `${a.no}`, { anchor: "middle", size: 6.5, weight: oner ? 700 : 500, color: renk });
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${izgara}${hat}${makas}${oklar}${arac}</svg>`;
}

// Gerçek Sperrzeitentreppe (gömülü SVG): iki ardışık tramvay + her bloğun blocking-time
// dikdörtgeni. Kritik blokta ikinci tramvayın başlangıcı birincinin bitişine DEĞER = min headway.
export function sperrzeitSvg(bt: ReturnType<typeof blockingTimeRing>, L: number, kritikRenk: string = CK.red, en = false): string {
  if (!bt.bloklar.length || L <= 0) return "";
  const h = bt.minHeadway;
  const pencere = (b: (typeof bt.bloklar)[number]) => ({
    t0: Math.max(0, b.girisT - b.tApproach - b.tSighting - b.tSetup),
    t1: b.cikisT + b.tClearing + b.tRelease,
  });
  const tMax = Math.max(...bt.bloklar.map((b) => pencere(b).t1)) + h;
  const W = 760, H = 250, padL = 44, padR = 12, padT = 16, padB = 26;
  const pw = W - padL - padR, ph = H - padT - padB;
  const xOf = (t: number) => padL + (t / (tMax || 1)) * pw;
  const yOf = (s: number) => padT + (s / L) * ph;
  const rects: string[] = [];
  [0, h].forEach((off, k) => {
    const col = k === 0 ? CK.blue : CK.orange;
    bt.bloklar.forEach((b) => {
      const w = pencere(b);
      const x = xOf(w.t0 + off), y = yOf(b.start);
      const ww = Math.max(0.6, xOf(w.t1 + off) - x), hh = Math.max(0.6, yOf(b.end) - y);
      const kritik = b.i === bt.kritikBlok;
      rects.push(`<rect x="${(x + 0.4).toFixed(1)}" y="${(y + 0.4).toFixed(1)}" width="${Math.max(0.6, ww - 0.8).toFixed(1)}" height="${Math.max(0.6, hh - 0.8).toFixed(1)}" rx="1" fill="${col}" fill-opacity="0.14" stroke="${kritik ? kritikRenk : col}" stroke-width="${kritik ? 1.5 : 0.7}" stroke-opacity="${kritik ? 1 : 0.5}"/>`);
    });
  });
  const traj = (off: number, col: string) =>
    `<polyline points="${bt.yorunge.map((p) => `${xOf(p.t + off).toFixed(1)},${yOf(p.s).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const yTicks = [0, L / 2, L].map((s) => num(padL - 7, yOf(s) + 3, `${Math.round(s)}`, { anchor: "end", size: 8 })).join("");
  const hMark = `<line x1="${xOf(0).toFixed(1)}" y1="${padT - 6}" x2="${xOf(h).toFixed(1)}" y2="${padT - 6}" stroke="${kritikRenk}" stroke-width="1.4"/>${lab(xOf(h) + 6, padT - 3, `min headway ${Math.round(h)} s`, { size: 8.5, color: kritikRenk, weight: 600 })}`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${yTicks}${rects.join("")}${traj(0, CK.blue)}${traj(h, CK.orange)}${hMark}${lab(padL, H - 8, en ? "time (s) →" : "zaman (s) →", { size: 8.5 })}${lab(8, padT + 4, "m", { size: 8.5 })}</svg>`;
}

// 1) Gecikme DAĞILIMI histogramı — eşik altı (dakik, mavi) / üstü (geç, kırmızı);
//    ortalama · P90 · eşik dikey işaretleri. Kuyruk riskini tek bakışta gösterir.
export function mcHistSvg(mc: MonteCarloResult, en = false): string {
  const W = 820, H = 232, padL = 44, padR = 16, padT = 16, padB = 34;
  const pw = W - padL - padR, ph = H - padT - padB;
  const maxD = Math.max(1, mc.maxDelay);
  const maxOran = Math.max(1, ...mc.histogram.map((h) => h.oran));
  const px = (d: number) => padL + (Math.min(Math.max(d, 0), maxD) / maxD) * pw;
  const py = (o: number) => padT + ph - (o / maxOran) * ph;
  const eksenY = padT + ph;
  const bw = pw / Math.max(1, mc.histogram.length);
  const yIsaret = [0, 0.5, 1].map((f) => {
    const o = f * maxOran, y = py(o);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="${CK.grid}"/>${num(padL - 5, y + 2.5, `%${o.toFixed(0)}`, { anchor: "end", size: 9 })}`;
  }).join("");
  const cubuklar = mc.histogram.map((h, i) => {
    const x = padL + i * bw + 1, y = py(h.oran), hgt = Math.max(0, eksenY - y), gec = h.alt >= mc.threshold;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.5, bw - 2).toFixed(1)}" height="${hgt.toFixed(1)}" rx="3" fill="${gec ? CK.red : CK.blue}" fill-opacity="0.88"/>`;
  }).join("");
  const isaret = (d: number, ad: string, renk: string, yLabel: number) =>
    `<line x1="${px(d).toFixed(1)}" y1="${padT}" x2="${px(d).toFixed(1)}" y2="${eksenY.toFixed(1)}" stroke="${renk}" stroke-width="1.4" stroke-dasharray="4 3"/>${num(px(d) + 3, yLabel, ad, { anchor: "start", size: 9, weight: 600, color: renk })}`;
  const isaretler = isaret(mc.meanDelay, en ? "mean" : "ort", CK.ink2, padT + 10)
    + isaret(mc.threshold, en ? "threshold" : "eşik", CK.amber, padT + 22)
    + isaret(mc.p90Delay, "P90", CK.red, padT + 34);
  const eksen = `<line x1="${padL}" y1="${eksenY.toFixed(1)}" x2="${padL + pw}" y2="${eksenY.toFixed(1)}" stroke="${CK.ink2}" stroke-width="0.8"/>`;
  const altEksen = num(padL, H - 5, "0", { anchor: "start", size: 9, color: CK.muted })
    + lab(padL + pw / 2, H - 5, en ? "arrival delay →" : "varış gecikmesi →", { anchor: "middle", size: 8.5, color: CK.muted })
    + num(padL + pw, H - 5, sure(maxD), { anchor: "end", size: 9, color: CK.muted });
  const leg = `<text x="${W - padR}" y="12" text-anchor="end" font-family="${CK.sans}" font-size="8.5"><tspan fill="${CK.blue}">▬ ${en ? "on-time (below threshold)" : "dakik (eşik altı)"}</tspan>  <tspan fill="${CK.red}">▬ ${en ? "late" : "geç"}</tspan></text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${yIsaret}${cubuklar}${isaretler}${eksen}${altEksen}${leg}</svg>`;
}

// 2) Tren SIRASINA göre yayılım — medyan (● + çizgi) + P90 bıyığı; birincil gecikmenin
//    sonraki trenlere kademelenmesini gösterir.
export function mcYayilimSvg(mc: MonteCarloResult, en = false): string {
  const n = mc.perTren.length;
  if (n === 0) return "";
  const W = 820, H = 168, padL = 44, padR = 16, padT = 14, padB = 26;
  const pw = W - padL - padR, ph = H - padT - padB;
  const maxY = Math.max(1, mc.threshold, ...mc.perTren.map((p) => p.p90));
  const sx = (i: number) => padL + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const sy = (v: number) => padT + ph - (Math.min(Math.max(v, 0), maxY) / maxY) * ph;
  const eksenY = padT + ph;
  const yIsaret = [0, 0.5, 1].map((f) => {
    const v = f * maxY, y = sy(v);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="${CK.grid}"/>${num(padL - 5, y + 2.5, sure(v), { anchor: "end", size: 9 })}`;
  }).join("");
  const esik = `<line x1="${padL}" y1="${sy(mc.threshold).toFixed(1)}" x2="${padL + pw}" y2="${sy(mc.threshold).toFixed(1)}" stroke="${CK.amber}" stroke-width="1.4" stroke-dasharray="4 3"/>${num(padL + pw, sy(mc.threshold) - 3, en ? "threshold" : "eşik", { anchor: "end", size: 9, weight: 600, color: CK.amber })}`;
  const trend = n > 1 ? `<polyline points="${mc.perTren.map((p, i) => `${sx(i).toFixed(1)},${sy(p.p50).toFixed(1)}`).join(" ")}" fill="none" stroke="${CK.blue}" stroke-width="2"/>` : "";
  const noktalar = mc.perTren.map((p, i) => {
    const x = sx(i);
    return `<line x1="${x.toFixed(1)}" y1="${sy(p.p50).toFixed(1)}" x2="${x.toFixed(1)}" y2="${sy(p.p90).toFixed(1)}" stroke="${CK.blue}" stroke-width="2" opacity="0.3"/>`
      + `<circle cx="${x.toFixed(1)}" cy="${sy(p.p90).toFixed(1)}" r="2.5" fill="${CK.blue}" opacity="0.5"/>`
      + `<circle cx="${x.toFixed(1)}" cy="${sy(p.p50).toFixed(1)}" r="3.5" fill="${CK.blue}"/>`;
  }).join("");
  const eksen = `<line x1="${padL}" y1="${eksenY.toFixed(1)}" x2="${padL + pw}" y2="${eksenY.toFixed(1)}" stroke="${CK.ink2}" stroke-width="0.8"/>`;
  const altEksen = num(padL, H - 4, en ? "train 1" : "tren 1", { anchor: "start", size: 9, color: CK.muted })
    + lab(padL + pw / 2, H - 4, en ? "service order →" : "sefer sırası →", { anchor: "middle", size: 8.5, color: CK.muted })
    + num(padL + pw, H - 4, `${en ? "train" : "tren"} ${n}`, { anchor: "end", size: 9, color: CK.muted });
  const leg = `<text x="${W - padR}" y="11" text-anchor="end" font-family="${CK.sans}" font-size="8.5"><tspan fill="${CK.blue}">● ${en ? "median" : "medyan"}</tspan>  <tspan fill="${CK.blue}" opacity="0.5">| P90</tspan></text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${yIsaret}${esik}${trend}${noktalar}${eksen}${altEksen}${leg}</svg>`;
}
