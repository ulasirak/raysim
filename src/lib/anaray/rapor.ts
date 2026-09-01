// raysim — ŞIK PDF RAPORU (baskıya hazır HTML → tarayıcı "PDF olarak kaydet").
//
// Amaç: doküman üreticinin (dokuman.ts) düz Word/Excel çıktısının yanında,
// görsel olarak yüksek kaliteli, kurumsal, baskıya hazır bir Tasarım El Kitabı
// raporu üretmek. Amblemli kapak + renk kodlu bölüm banzları + gömülü şema/grafik
// İçerik tamamen girilen projeden türer.
//
// Tarayıcıda çalışır: yeni pencerede açar, yazdırma diyalogunu tetikler
// (kullanıcı "Hedef: PDF olarak kaydet" ile indirir). SSR'de çağrılmaz.

import qrcode from "qrcode-generator";
import { emblemSvg } from "@/lib/emblem";
import { aslsLogoSvg, firmaAslsMi } from "./aslsLogo";
import { CK, RAMP_BLUE, num, lab, areaGrad } from "./chartkit";
import type { SimConfig, ProjeMeta, Isletme } from "./config";
import { PARAM_META, paramGoster, birim, varsayilanIsletme } from "./config";
import { terminalMakasSayilari, etkinPeronSayisi, etkinBogazIsgali, terminalDonusParalel, terminalSeriDonus, type TerminalConfig } from "./config";
import { tersIsletmeAnaliz, type DurakTalep } from "./tersisletme";
import { seferTersEntegre, type SeferTersSonuc } from "./seferters";
import { hizDegisimNoktalari, bildIstasyonZamanlari, bildKesisimZamanlari, satirYerlesim } from "./grafikNoktalar";
import { maksimumTren, terminalHeadway } from "./kapasite";
import { tarifeUret } from "./tarife";
import { duyarlilikAnaliz } from "./duyarlilik";
import type { RollingStock } from "./types";
import {
  ringSenaryo, ringChallenge, ringKisitDizisi, loopDenge,
  type DurakArasiRing,
} from "./ring";
import { blockingTimeRing } from "./blockingtime";
import { loopToHat } from "./hatsim";
import { simulate } from "./sim";
import { computeEnergy } from "./energy";
import { simulateSignalled, loopYorunge, type LoopYorunge } from "./signalling";
import { sinyalKonumlari, hatOzellikleri } from "./network";
import type { Line } from "./types";

const INK = "#0C2233";
const RED = "#C8102E";
const GOLD = "#A8842C";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const s0 = (v: number) => `${Math.round(v)} s`;
// Mutlak hat kilometrajı — demiryolu standardı "k+mmm" gösterimi (ör. 1198 m → "1+198").
// Kısıt tablolarında ring-içi göreli metre YERİNE bu kullanılır: makas/geçit konumu
// hattın başından ölçülen mutlak kilometraj olarak okunur (CAD/şartname konvansiyonu).
const kmFmt = (m: number) => {
  const t = Math.max(0, Math.round(m));
  return `${Math.floor(t / 1000)}+${String(t % 1000).padStart(3, "0")}`;
};

// QR kodu (gömülü SVG) — canlı simülasyon linki için.
function qrSvg(text: string, size = 96): string {
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const cell = size / n;
    let rects = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/><g fill="${INK}">${rects}</g></svg>`;
  } catch { return ""; }
}

function tbl(headers: string[], rows: (string | number)[][], opts: { first?: boolean } = {}): string {
  const head = `<tr>${headers.map((h, i) => `<th class="${opts.first && i === 0 ? "l" : ""}">${esc(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${opts.first && i === 0 ? "l" : ""}">${typeof c === "string" && c.startsWith("<") ? c : esc(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// Durak-arası ring şeması (gömülü SVG): istasyon zinciri + makas/hemzemin işaretleri.
function ringSemaSvg(rings: DurakArasiRing[]): string {
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
  const H = cok ? y + 42 : 116;
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%">${line}${marks}${dots}${labels}</svg>`;
}

// Blocking-time bileşen barları (gömülü SVG): her blok için yığılı süre (ordinal mavi rampa).
function blockingBarSvg(bloklarTum: { i: number; makasBlok?: boolean; tSetup: number; tSighting: number; tApproach: number; tRunning: number; tClearing: number; tRelease: number; toplam: number }[], kritik: number, kritikRenk: string = CK.red, en = false): string {
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
function reverseLineOf(line: Line): Line {
  const L = line.length;
  return {
    ...line, id: line.id + "-rev", name: line.name + " (dönüş)",
    stations: line.stations.map((s) => ({ ...s, position: L - s.position })).reverse(),
    segments: line.segments.map((s) => ({ start: L - s.end, end: L - s.start, vmax: s.vmax, gradient: -s.gradient })).reverse(),
  };
}

// ornekler (t artan, 0..periyot) → faz anındaki kümülatif s (doğrusal ara değer).
function bfSampleS(orn: LoopYorunge["ornekler"], faz: number): number {
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
function bildfahrplanSvg(loopY: LoopYorunge, line: Line, filo: number, en = false): string {
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
function kisitBarSvg(kisitlar: { anahtar: string; ad: string; headway: number; aktif: boolean }[], kritikRenk: string, en = false): string {
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
function hizProfilSvg(loopY: LoopYorunge, line: Line, en = false): string {
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
function yukDwellSvg(duraklar: DurakTalep[], rings: DurakArasiRing[], en = false): string {
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
function turnbackTbl(bas: TerminalConfig, son: TerminalConfig, cfg: SimConfig, en = false): string {
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
function hemzeminSvg(rings: DurakArasiRing[], cfg: SimConfig): { svg: string; adet: number; karayolu: number; toplamTur: number } {
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
function seferTersSvg(ste: SeferTersSonuc): string {
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
function sperrzeitSvg(bt: ReturnType<typeof blockingTimeRing>, L: number, kritikRenk: string = CK.red, en = false): string {
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

// Enerji-mesafe (gömülü SVG): kümülatif çekiş enerjisi (kWh) vs mesafe.
function energyGradeSvg(line: Line, stock: RollingStock, ing = false): { svg: string; net: number; perKm: number } {
  if (line.length <= 0) return { svg: "", net: 0, perKm: 0 };
  const res = simulate(line, stock, 0.5);
  if (!res.points.length) return { svg: "", net: 0, perKm: 0 };
  const en = computeEnergy(line, stock, res);
  const L = line.length;
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  const Gg = 9.81, EFF = 0.85, J = 3.6e6;
  const segAtL = (s: number) => { for (const sg of line.segments) if (s >= sg.start && s < sg.end) return sg; return line.segments[line.segments.length - 1]; };
  const pts = res.points; let Wtr = 0; const cp = [{ s: 0, E: 0 }];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], ds = p1.s - p0.s;
    if (ds <= 1e-6) continue;
    const vmid = (p0.v + p1.v) / 2, seg = segAtL(p0.s);
    const dKE = 0.5 * meff * (p1.v * p1.v - p0.v * p0.v);
    const Wres = (stock.davisA + stock.davisB * vmid + stock.davisC * vmid * vmid) * ds;
    const Wg = stock.mass * Gg * (seg.gradient / 1000) * ds;
    const rhs = dKE + Wres + Wg;
    if (rhs > 0) Wtr += rhs;
    cp.push({ s: p1.s, E: Wtr / EFF / J });
  }
  const W = 760, padL = 46, padR = 12, padT = 14, pw = 760 - 46 - 12;
  const topH = 108;
  const topTop = padT, H = topTop + topH + 28;
  const xOf = (s: number) => padL + (s / L) * pw;
  const Emax = Math.max(0.1, ...cp.map((p) => p.E));
  const yE = (E: number) => topTop + topH - (E / Emax) * topH;
  const st = line.stations.map((s) => `<line x1="${xOf(s.position).toFixed(1)}" y1="${topTop}" x2="${xOf(s.position).toFixed(1)}" y2="${topTop + topH}" stroke="${CK.grid}"/>`).join("");
  const ePts = cp.map((p) => `${xOf(p.s).toFixed(1)},${yE(p.E).toFixed(1)}`).join(" ");
  const eArea = `<polygon points="${xOf(0).toFixed(1)},${(topTop + topH).toFixed(1)} ${ePts} ${xOf(L).toFixed(1)},${(topTop + topH).toFixed(1)}" fill="url(#g-en)"/>`;
  const ePoly = `<polyline points="${ePts}" fill="none" stroke="${CK.orange}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const yTicks = [0, Emax / 2, Emax].map((v) => `<line x1="${padL}" y1="${yE(v).toFixed(1)}" x2="${W - padR}" y2="${yE(v).toFixed(1)}" stroke="${CK.grid}"/>${num(padL - 7, yE(v) + 3, v.toFixed(1), { anchor: "end", size: 8 })}`).join("");
  const base = `<line x1="${padL}" y1="${(topTop + topH).toFixed(1)}" x2="${W - padR}" y2="${(topTop + topH).toFixed(1)}" stroke="${CK.baseline}"/>`;
  const lblSvg = `${lab(8, topTop + 8, "kWh", { size: 8 })}${lab(W - padR, topTop + topH + 16, ing ? "distance (m) →" : "mesafe (m) →", { anchor: "end", size: 8 })}`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%"><defs>${areaGrad("g-en", CK.orange, 0.2)}</defs>${st}${yTicks}${base}${eArea}${ePoly}${lblSvg}</svg>`;
  return { svg, net: en.netKWh, perKm: en.perKm };
}

export type RaporDil = "tr" | "en";

function rDil(lang: RaporDil) {
  const tr = {
    htmlLang: "tr", barTitle: "Rapor",
    barHint: 'Yazdır diyalogunda "Hedef: PDF olarak kaydet"i seçin.',
    barBtn: "⭳ PDF olarak kaydet / Yazdır",
    sys: "SİNYALİZASYON SİSTEMİ", kit: "TASARIM EL KİTABI",
    foot: "Kontrollü doküman", dockontrol: "Doküman Kontrol", toc: "İçindekiler",
    qrCap: "Bu hattın canlı simülasyonu", qrCapGenel: "RaySim — canlı simülasyon", qrHint: "kamerayla tarayın",
    kunye: { proje: "Proje", hat: "Hat", dok: "Doküman No", rev: "Revizyon", tarih: "Tarih", idare: "İdare", yuk: "Yüklenici", mus: "Müşavir", firma: "Sinyalizasyon Firması" },
    kpi: { hucre: "Durak arası hücre", hedef: "Hedef headway", sigan: "Headway'de sığan tramvay", kapasite: "Teorik kapasite", pratik: "İşletme kapasitesi", uic: "UIC 406 doluluk", ch: "Challenge / kritik" },
    altMakas: (n: number) => `${n} makas`, altTumu: "tümü uygun", altIhlal: "ihlal var", altTur: (s: string) => `tur ${s}`, altTph: "tramvay/saat", altUygun: "uygun", altIhlalK: "ihlal", altRisk: "risk kaydı",
    s1: "Kapasite Sonucu ve Parametreler", s1i: "Hattın azami tramvay kapasitesi ve belirleyici kısıtlar; sinyalizasyon, makas tip/sayıları, istasyon duruş süreleri, terminal dönüşü, hemzemin geçitler ve araç dinamiği parametrelerinden hesaplanmıştır.",
    thParam: ["Parametre", "Değer", "Etkisi"],
    s2: "Durak Arası İşletim Hücreleri", s2i: (n: number, h: number) => `Hat, ${n} durak-arası hücreye (ring) ayrılmıştır; her hücre kendi mesafe, makas, hemzemin geçit ve tehlike noktası şartlarını taşır (hedef aralık ${h} s).`,
    fig1: "Şekil 1 — Hat şeması: istasyon zinciri, makas (⑂) ve hemzemin geçit dağılımı.",
    figEnergy: (net: number, perKm: number) => `Şekil 2 — Enerji-mesafe: kümülatif çekiş enerjisi. Net ${net.toFixed(1)} kWh · ${perKm.toFixed(2)} kWh/km.`,
    gClimb: "tırmanış", gDescent: "iniş", gGrade: "eğim", gNoElev: "Yükseklik verisi girilmedi — düz profil varsayıldı", mUnit: "m",
    fig3: (c: number, h: number) => `Şekil 3 — Zaman-mesafe diyagramı (Bildfahrplan): gidiş (mavi) + dönüş (turuncu), ${c}+${c} tramvay, ${h} s aralık.`,
    thRing: ["No", "Durak Arası", "Mesafe (m)", "Worst (m)", "Makas", "Hemzemin", "Tehlike", "Worst Toplam", "Headway"],
    s21: "2.1 Ring Bazında Kısıt ve Risk (Challenge) Analizi",
    thKisit: ["Kısıt", "Kilometraj", "Detay"], noKisit: "Kısıt yok; kesintisiz seyir.",
    pillOk: "UYGUN", pillBad: "İHLAL",
    s4: "Kapasite ve Blocking-Time Analizi", s4i: "Minimum tramvay aralığını (headway), en yüksek blocking-time'lı blok belirler.",
    thGost: ["Gösterge", "Değer"],
    kapTur: "Tur süresi (worst-case seyir)", kapDonus: "Dönüş bekleme (tur başına)", kapCevrim: "Çevrim süresi (dönüş bekleme dâhil)", kapHedef: "Hedef headway", kapSigan: "Headway'de gereken tramvay", kapDarbogaz: "Darboğaz hücre", kapDenge: "Denge (eşit şartlar)", kapDengeli: "Dengeli", kapSapma: (p: string) => `%${p} sapma`, kapMin: "Minimum headway (kritik blok)", kapTeorik: "Teorik kapasite (tamponsuz üst sınır)", kapPratik: "İşletme kapasitesi (UIC 406 doluluk tavanı)", kapUIC: "UIC 406 doluluk (hedef headway'de)", tphSuffix: "tramvay/saat",
    kapNot: "Teorik kapasite tamponsuz üst sınırdır; işletme kapasitesi UIC 406 doluluk tavanıyla sürdürülebilir değeri verir.",
    s41: "4.1 Blocking-Time (Sperrzeitentreppe)",
    fig4: (h: number) => `Şekil 4 — Sperrzeitentreppe: blok işgal (blocking-time) pencereleri; min headway ${h} s.`,
    fig5: "Şekil 5 — Blok başına blocking-time bileşen dağılımı (kritik blok kırmızı etiketli).",
    thBt: ["Blok", "Tanzim", "Görme", "Yaklaşma", "Seyir", "Temizleme", "Serbest", "Toplam"],
    btTanim: "<b>Tanzim</b> = rota tanzimi ve kilitleme süresi (makas–sinyal hazırlığı) · <b>Görme</b> = vatmanın sinyali algılaması için tanınan süre · <b>Yaklaşma</b> = önceki sinyalden blok girişine kadar seyir · <b>Seyir</b> = bloğun kat edilme süresi · <b>Temizleme</b> = tramvay boyunun bloğu tümüyle terk etme süresi · <b>Serbest</b> = rotanın serbest bırakılması (kilit açılışı) · <b>Toplam</b> = bloğun tek bir tramvay tarafından toplam işgali (Sperrzeit).",
    s5: "Onay", thImza: ["Hazırlayan", "Onaylayan"], imzaTarih: "İmza / Tarih",
  };
  const en: typeof tr = {
    htmlLang: "en", barTitle: "Report",
    barHint: 'In the print dialog, choose "Destination: Save as PDF".',
    barBtn: "⭳ Save as PDF / Print",
    sys: "SIGNALLING SYSTEM", kit: "DESIGN HANDBOOK",
    foot: "Controlled document", dockontrol: "Document Control", toc: "Contents",
    qrCap: "This line, simulated live", qrCapGenel: "RaySim — live simulation", qrHint: "scan with your camera",
    kunye: { proje: "Project", hat: "Line", dok: "Document No", rev: "Revision", tarih: "Date", idare: "Authority", yuk: "Contractor", mus: "Consultant", firma: "Signalling Firm" },
    kpi: { hucre: "Inter-station cells", hedef: "Target headway", sigan: "Trains within headway", kapasite: "Theoretical capacity", pratik: "Operating capacity", uic: "UIC 406 occupancy", ch: "Challenges / critical" },
    altMakas: (n) => `${n} switches`, altTumu: "all compliant", altIhlal: "violations", altTur: (s) => `cycle ${s}`, altTph: "trains/hour", altUygun: "compliant", altIhlalK: "violation", altRisk: "risk records",
    s1: "Capacity Result and Parameters", s1i: "The line's maximum tram capacity and determining constraints are computed from the signalling, switch types/counts, station dwell times, terminal turnback, level crossings and vehicle dynamics parameters.",
    thParam: ["Parameter", "Value", "Effect"],
    s2: "Inter-station Operating Cells", s2i: (n, h) => `The line is divided into ${n} inter-station cells (rings); each carries its own distance, switch, level-crossing and hazard conditions (target headway ${h}s).`,
    fig1: "Figure 1 — Line schematic: station chain, switch (⑂) and level-crossing distribution.",
    figEnergy: (net, perKm) => `Figure 2 — Energy-distance: cumulative traction energy. Net ${net.toFixed(1)} kWh · ${perKm.toFixed(2)} kWh/km.`,
    gClimb: "climb", gDescent: "descent", gGrade: "grade", gNoElev: "No elevation data — level profile assumed", mUnit: "m",
    fig3: (c, h) => `Figure 3 — Time-distance diagram (Bildfahrplan): outbound (blue) + return (orange), ${c}+${c} trains, ${h}s headway.`,
    thRing: ["No", "Section", "Distance (m)", "Worst (m)", "Switches", "Level xing", "Hazards", "Worst Total", "Headway"],
    s21: "2.1 Per-cell Constraint & Risk (Challenge) Analysis",
    thKisit: ["Constraint", "Chainage", "Detail"], noKisit: "No constraints; uninterrupted run.",
    pillOk: "OK", pillBad: "VIOLATION",
    s4: "Capacity and Blocking-Time Analysis", s4i: "The minimum train interval (headway) is set by the block with the highest blocking-time.",
    thGost: ["Indicator", "Value"],
    kapTur: "Running time (worst-case)", kapDonus: "Turnaround (per cycle)", kapCevrim: "Cycle time (incl. turnaround)", kapHedef: "Target headway", kapSigan: "Trains required", kapDarbogaz: "Bottleneck cell", kapDenge: "Balance (equal conditions)", kapDengeli: "Balanced", kapSapma: (p) => `${p}% deviation`, kapMin: "Minimum headway (critical block)", kapTeorik: "Theoretical capacity (buffer-free upper bound)", kapPratik: "Operating capacity (UIC 406 occupancy ceiling)", kapUIC: "UIC 406 occupancy (at target headway)", tphSuffix: "trains/hour",
    kapNot: "Theoretical capacity is the buffer-free upper bound; operating capacity applies the UIC 406 occupancy ceiling to give the sustainable figure.",
    s41: "4.1 Blocking-Time (Sperrzeitentreppe)",
    fig4: (h) => `Figure 4 — Sperrzeitentreppe: block occupation (blocking-time) windows; min headway ${h}s.`,
    fig5: "Figure 5 — Per-block blocking-time component breakdown (critical block labelled red).",
    thBt: ["Block", "Setup", "Sighting", "Approach", "Running", "Clearing", "Release", "Total"],
    btTanim: "<b>Setup</b> = route setting and locking time (switch–signal preparation) · <b>Sighting</b> = allowance for the driver to recognise the signal · <b>Approach</b> = run from the previous signal to the block entry · <b>Running</b> = traversal of the block · <b>Clearing</b> = time for the full train length to clear the block · <b>Release</b> = route release (unlocking) · <b>Total</b> = the block's total occupation by a single train (Sperrzeit).",
    s5: "Approval", thImza: ["Prepared by", "Approved by"], imzaTarih: "Signature / Date",
  };
  return lang === "en" ? en : tr;
}

export function raporHTML(meta: ProjeMeta, cfg: SimConfig, rings: DurakArasiRing[], stock: RollingStock, lang: RaporDil = "tr", filo = 0, isletme: Isletme = varsayilanIsletme, qrUrl = ""): string {
  const L = rDil(lang);
  // Sunum modu: hat kesinleşmiş/onaylı bir tasarım olarak sunulur — challenge (risk/
  // uyarı) bayrakları, denge sapması ve "ihlal" işaretleri gösterilmez; göstergeler
  // uygun/dengeli olarak yansıtılır. (İç analiz motoru değişmez; yalnız sunum katmanı.)
  const sunum = !!meta.sunumModu;
  const en = lang === "en";
  // Min headway'i belirleyen blok: sunumda "KRİTİK/kırmızı" yerine nötr altın vurgu.
  const kritikRenk = sunum ? GOLD : CK.red;
  const rs = rings.map((r, i) => {
    const sen = ringSenaryo(r, stock, cfg);
    return { no: i + 1, ad: `${r.fromAd} → ${r.toAd}`, mesafe: Math.round(r.uzunluk), worst: Math.round(r.worstUzunluk),
      makas: r.makaslar.length, hemzemin: r.hemzeminler.length, tehlike: r.tehlikeNoktalari.length,
      worstToplam: Math.round(sen.worstToplam), headwayOk: sen.headwayUygun, pay: Math.round(sen.headwayPayi) };
  });
  const denge = loopDenge(rings, stock, cfg);
  const bt = blockingTimeRing(rings, stock, cfg, isletme.kalkisOluZamaniSn);
  // KAPASİTE OTORİTESİ — sim/Ringler ile BİREBİR aynı fonksiyon (maksimumTren): terminal
  // dönüş, sinyaller, blok/tek-hat/kavşak kısıtlarını birlikte değerlendirir. Rapordaki
  // kapasite değerleri (teorik maks · sürdürülebilir · min headway · darboğaz) bundan gelir
  // → simülasyonla farklı yazma sorunu giderilir. (bt yalnız blok-başı Sperrzeit detayı için.)
  const maks = maksimumTren(rings, stock, cfg, isletme);
  const siganTren = maks.gecerli ? Math.ceil(maks.cevrimSuresi / Math.max(1, cfg.headway)) : 0; // hedef headway'de gereken filo
  const teorikTph = maks.hMin > 0 ? 3600 / maks.hMin : 0;              // saatlik geçirgenlik (tavan)
  const pratikTph = teorikTph * (maks.dolulukTavani || 1);            // UIC 406 tamponlu işletme kapasitesi
  const uicDoluluk = (maks.hMin > 0 && cfg.headway > 0) ? (maks.hMin / cfg.headway) * 100 : 0; // UIC 406 doluluk %
  const headwayUygun = maks.hMin <= cfg.headway + 1e-6;               // hedef headway fiziksel min'in üstünde mi

  // GERÇEK sinyalizasyon + filo — rapor simülasyonu canlı sistemle birebir olsun diye:
  //   sinyaller (giden, ters-değil) blok sınırıdır; filo = kullanıcının onayladığı gerçek
  //   araç sayısı (verilmemişse öneriye düşer, sabit "4" DEĞİL).
  const ozellikler = hatOzellikleri(rings, cfg);
  const sinyalListe = ozellikler.filter((f) => f.kind === "sinyal");
  const sinyalSayisi = sinyalListe.length;
  const tersSinyalSayisi = sinyalListe.filter((f) => f.tersIsletme).length;
  const sinyaller = sinyalKonumlari(rings, cfg); // giden non-ters = blok sınırları (canlı sim ile aynı)
  const filoGercek = filo > 0 ? Math.round(filo) : (siganTren || maks.nSurdurulebilir || 4);

  // Birleşik hat (loop → tek Line) → hız profili + Bildfahrplan grafikleri
  const line: Line | null = rings.length ? loopToHat(rings, true, cfg).line : null;
  // Bildfahrplan GİT-GEL LOOP yörüngesinden (canlı sim ile birebir): tam filo çizilir.
  const peronBasBf = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSonBf = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopYbf: LoopYorunge | null = line ? loopYorunge(line, reverseLineOf(line), stock, { peronIsgaliBas: peronBasBf, peronIsgaliSon: peronSonBf }) : null;
  const bfHeadway = loopYbf && filoGercek > 0 ? Math.round(loopYbf.periyot / filoGercek) : cfg.headway;
  const eg = line ? energyGradeSvg(line, stock, en) : null;
  const energyFig = eg && eg.svg ? `<div class="fig">${eg.svg}<div class="cap">${L.figEnergy(eg.net, eg.perKm)}</div></div>` : "";
  const bfFig = (line && loopYbf) ? `<div class="fig">${bildfahrplanSvg(loopYbf, line, filoGercek, en)}<div class="cap">${en ? `Figure 3 — Time-distance diagram (Bildfahrplan): ${filoGercek} trams (round-trip loop), ${bfHeadway}s headway.` : `Şekil 3 — Zaman-mesafe diyagramı (Bildfahrplan): ${filoGercek} tramvay (git-gel döngü), ${bfHeadway} s aralık.`}</div></div>` : "";
  const turnbackTblStr = turnbackTbl(isletme.terminalBas, isletme.terminalSon, cfg, en);
  const hz = rings.length ? hemzeminSvg(rings, cfg) : { svg: "", adet: 0, karayolu: 0, toplamTur: 0 };
  const hemCevrim = maks.gecerli ? maks.cevrimSuresi : 0;
  const hemYuzde = hemCevrim > 0 ? (hz.toplamTur / hemCevrim) * 100 : 0;
  const hemzeminFig = hz.svg ? `<div class="fig">${hz.svg}<div class="cap">${en ? `Figure 2e — Level-crossing & TSP delay: per-crossing slowdown (grey) + road-crossing wait (priority). ${hz.adet} crossings (${hz.karayolu} road); ${Math.round(hz.toplamTur)} s/round-trip (${hemYuzde.toFixed(1)}% of cycle).` : `Şekil 2e — Hemzemin geçit & TSP gecikmesi: geçit başına yavaşlama (gri) + karayolu bekleme (öncelik). ${hz.adet} geçit (${hz.karayolu} karayolu); ${Math.round(hz.toplamTur)} s/tur (çevrimin %${hemYuzde.toFixed(1)}'i).`}</div></div>` : "";
  const kisitFig = (maks.gecerli && maks.kisitlar.length) ? `<div class="fig">${kisitBarSvg(maks.kisitlar, kritikRenk, en)}<div class="cap">${en ? "Figure 2c — Determining constraint: competing headway limits (block / terminal turnback / single track / junction / signal); the longest binds (hMin)." : "Şekil 2c — Belirleyici kısıt: rakip headway limitleri (blok / terminal turnback / tek hat / kavşak / sinyal); en uzunu bağlar (hMin)."}</div></div>` : "";
  const hizFig = (line && loopYbf) ? `<div class="fig">${hizProfilSvg(loopYbf, line, en)}<div class="cap">${en ? "Figure 3b — Speed profile v(x): actual speed (blue) vs. segment speed limit (dashed), outbound leg. Dips = station stops; below-limit = acceleration/braking." : "Şekil 3b — Hız profili v(x): gerçek hız (mavi) ile segment hız limiti (kesikli), gidiş legi. Dipler = istasyon duruşları; limit altı = hızlanma/frenleme."}</div></div>` : "";

  // ---- Kapak künye ----
  const kunye = [
    [L.kunye.proje, meta.projeAdi], [L.kunye.hat, meta.hatAdi], [L.kunye.dok, meta.dokumanNo], [L.kunye.rev, meta.revizyon],
    [L.kunye.tarih, meta.tarih || "—"], [L.kunye.idare, meta.idare], [L.kunye.yuk, meta.yuklenici], [L.kunye.mus, meta.musavir],
    [L.kunye.firma, meta.sinyalizasyonFirmasi],
  ];

  // ---- KPI kartları ----
  const kpi = (etiket: string, deger: string, alt: string, renk = INK) =>
    `<div class="kpi"><div class="kpi-l">${esc(etiket)}</div><div class="kpi-v" style="color:${renk}">${esc(deger)}</div><div class="kpi-a">${esc(alt)}</div></div>`;
  // Kapasite KPI'ları sim/Ringler ile BİREBİR (maksimumTren): teorik maks · sürdürülebilir ·
  // planlanan filo · min headway (darboğaz) · işletme kapasitesi (tramvay/saat) · UIC 406 doluluk.
  const teorikMaksEt = lang === "en" ? "Theoretical max trams" : "Teorik maks tramvay";
  const surdurEt = lang === "en" ? "Sustainable trams" : "Sürdürülebilir tramvay";
  const minHwEt = lang === "en" ? "Min headway" : "Min headway";
  const kpiRow = `<div class="kpi-row">
    ${kpi(L.kpi.hucre, `${rings.length}`, L.altMakas(rings.reduce((n, r) => n + r.makaslar.length, 0)))}
    ${kpi(teorikMaksEt, `${maks.nTeorik}`, lang === "en" ? "on the line (fit)" : "hatta sığan", INK)}
    ${kpi(surdurEt, `${maks.nSurdurulebilir}`, lang === "en" ? "UIC 406 buffered" : "UIC 406 tamponlu", INK)}
    ${kpi(lang === "en" ? "Planned fleet" : "Planlanan filo", `${filoGercek}`, lang === "en" ? `trams in service` : `serviste tramvay`, INK)}
    ${kpi(minHwEt, `${s0(maks.hMin)}`, (maks.baglayanAd || "").slice(0, 22) || (headwayUygun ? L.altUygun : L.altIhlalK), (headwayUygun || sunum) ? INK : RED)}
    ${kpi(L.kpi.pratik, `${pratikTph.toFixed(0)}`, `%${((maks.dolulukTavani || 1) * 100).toFixed(0)} · ${L.altTph}`, INK)}
    ${kpi(L.kpi.uic, `%${uicDoluluk.toFixed(0)}`, (uicDoluluk <= 100 || sunum) ? L.altUygun : L.altIhlalK, (uicDoluluk <= 100 || sunum) ? "#0E7C57" : RED)}
  </div>`;

  // ---- Parametre tablosu ----
  const paramRows = PARAM_META.map((m) => [m.ad, `${paramGoster(cfg, m).toFixed(m.tur === "ivme" ? 1 : 0)} ${birim(m.tur)}`, m.etkiler]);

  // ---- Ring tablosu ----
  const ringRows = rs.map((r) => [
    `${r.no}`, r.ad, `${r.mesafe}`, `${r.worst}`, `${r.makas}`, `${r.hemzemin}`, `${r.tehlike}`, s0(r.worstToplam),
    sunum
      ? `<span class="pill ok">${L.pillOk}</span>`
      : `<span class="pill ${r.headwayOk ? "ok" : "bad"}">${r.headwayOk ? L.pillOk : L.pillBad} (${r.pay >= 0 ? "+" : ""}${r.pay}s)</span>`,
  ]);

  // ---- Ring challenge detayları ----
  // Kısıt konumları MUTLAK hat kilometrajı (k+mmm) olarak yazılır: ring başına kadarki
  // kümülatif mesafe + ring-içi göreli konum. (Ring-içi göreli metre — ör. "56 m" —
  // hattın başından ölçülüyormuş gibi okunup yanıltıyordu; mutlak kilometraj CAD ile birebir.)
  let ringBasiKm = 0;
  const ringDetay = rings.map((r) => {
    const off = ringBasiKm;
    ringBasiKm += r.uzunluk;
    const kisit = ringKisitDizisi(r);
    const ch = ringChallenge(r, stock, cfg);
    const kisitTbl = kisit.length
      ? tbl(L.thKisit, kisit.map((k) => [k.ad, kmFmt(off + k.konum), k.detay]))
      : `<p class="muted">${L.noKisit}</p>`;
    const chList = (ch.length && !sunum)
      ? `<ul class="ch">${ch.map((c) => `<li class="${c.seviye === "kritik" ? "krit" : ""}"><b>[${esc(c.seviye.toUpperCase())}]</b> ${esc(c.baslik)}: ${esc(c.mesaj)}</li>`).join("")}</ul>`
      : "";
    return `<div class="ring-detay"><h4>${esc(r.fromAd)} → ${esc(r.toAd)}</h4>${kisitTbl}${chList}</div>`;
  }).join("");

  // ---- Kapasite (maksimumTren — sim/Ringler ile birebir) ----
  const minHwLbl = lang === "en" ? "Minimum headway (determining constraint)" : "Minimum headway (belirleyici kısıt)";
  const kapasiteTbl = tbl(L.thGost, [
    [L.kapCevrim, s0(maks.cevrimSuresi)],
    [L.kapHedef, s0(cfg.headway)],
    [lang === "en" ? "Theoretical max trams (fit)" : "Teorik maks tramvay (sığan)", `${maks.nTeorik}`],
    [lang === "en" ? "Sustainable trams (UIC 406)" : "Sürdürülebilir tramvay (UIC 406)", `${maks.nSurdurulebilir}`],
    [L.kapSigan, `${siganTren}`],
    [sunum ? (lang === "en" ? "Determining constraint" : "Belirleyici kısıt") : L.kapDarbogaz, maks.baglayanAd || "—"],
    [L.kapDenge, (denge.dengeli || sunum) ? L.kapDengeli : L.kapSapma(denge.sapmaYuzde.toFixed(0))],
    [minHwLbl, `${s0(maks.hMin)}`],
    [L.kapTeorik, `${teorikTph.toFixed(0)} ${L.tphSuffix}`],
    [L.kapPratik, `${pratikTph.toFixed(0)} ${L.tphSuffix} (%${((maks.dolulukTavani || 1) * 100).toFixed(0)})`],
    [L.kapUIC, `%${uicDoluluk.toFixed(0)}`],
  ], { first: true });

  const btTbl = tbl(L.thBt,
    bt.bloklar.map((b) => [`#${b.i}${b.makasBlok ? " ⑂" : ""}`, `${b.tSetup} s`, `${b.tSighting} s`, `${b.tApproach.toFixed(0)} s`, `${b.tRunning.toFixed(0)} s`, `${b.tClearing.toFixed(0)} s`, `${b.tRelease} s`, `${b.toplam.toFixed(0)} s`]), { first: true });

  // Kapasite okuması yorumu — "sığan tramvay" (filo) ile "işletme kapasitesi" (tavan)
  // farkını gerçek değerlerden açıklar; hattın yedek kapasitesini okur.
  const yedekYuzde = Math.max(0, Math.round(100 - uicDoluluk));
  const kapBol = uicDoluluk <= 100 || sunum;
  const sperrNot = Math.round(bt.minHeadway) < Math.round(maks.hMin)
    ? (en ? ` (operational min headway including critical-station dwell; signalling-block Sperrzeit below: ${Math.round(bt.minHeadway)} s)` : ` (kritik istasyon duruşunu içeren operasyonel min headway; sinyal-bloğu Sperrzeit'i: ${Math.round(bt.minHeadway)} s)`)
    : "";
  // Kurumsal ama sade anlatım: belirleyici kısıt nedir → yedek kapasite → azami tramvay
  // senaryosunda headway'in düşmesi → belirleyici noktadan saatlik tramvay sayısı. Adım adım.
  const kapYorum = en
    ? `<b>Determining constraint: ${esc(maks.baglayanAd || "—")}</b> — this is the tightest point on the line, and it is what sets how many trams can pass a given point each hour. When the line is operated at its ${cfg.headway} s design headway, this point still has about <b>${yedekYuzde}% spare capacity</b>${kapBol ? `. In the scenario where the aim is to run the maximum number of trams, this spare is also drawn on: the headway can be tightened from <b>${cfg.headway} s down to ${Math.round(maks.hMin)} s</b>, and at that point <b>${teorikTph.toFixed(0)} trains pass per hour</b>.${sperrNot}` : `, so the ${cfg.headway} s target is within the limit this point allows.${sperrNot}`}`
    : `<b>Belirleyici kısıt: ${esc(maks.baglayanAd || "—")}</b> — hattın en dar noktası burasıdır ve bir noktadan saatte kaç tramvayın geçebileceğini bu nokta belirler. Hat, tasarım hedefi olan ${cfg.headway} saniyelik sefer aralığıyla işletildiğinde bu noktada hâlâ yaklaşık <b>%${yedekYuzde} yedek kapasite</b> bulunur${kapBol ? `. Hattan azami sayıda tramvay geçirilmek istenen senaryoda bu yedek de devreye alınır: sefer aralığı <b>${cfg.headway} saniyeden ${Math.round(maks.hMin)} saniyeye</b> kadar sıkılaştırılabilir ve bu durumda belirleyici noktadan <b>saatte ${teorikTph.toFixed(0)} tramvay</b> geçer.${sperrNot}` : `; bu nedenle ${cfg.headway} saniyelik hedef, bu noktanın izin verdiği sınırın içindedir.${sperrNot}`}`;

  const bugun = meta.tarih || "";
  const siteUrl = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "https://raysim.vercel.app";
  // QR DEEP-LINK: qrUrl verilmişse (bu projenin salt-okunur paylaşım linki) QR o hattın
  // CANLI simülasyonuna gider; yoksa ana sayfaya düşer (genel). Yalnız güvenli https kabul.
  const qrHedef = /^https:\/\/[^\s]{1,512}$/.test(qrUrl) ? qrUrl : siteUrl;
  const derinLink = qrHedef !== siteUrl;
  const qrHost = (() => { try { return new URL(qrHedef).host; } catch { return siteUrl.replace(/^https?:\/\//, ""); } })();
  // Firma Aslan Sinyalizasyon ise antette (sol üst) firma yazısı yerine ASLS logosu.
  const firmaAsls = firmaAslsMi(meta.sinyalizasyonFirmasi);
  const antetSol = firmaAsls
    ? `<span class="firma-logo" role="img" aria-label="${esc(meta.sinyalizasyonFirmasi || "Aslan Sinyalizasyon")}">${aslsLogoSvg}</span>`
    : `<span class="firma">${esc(meta.sinyalizasyonFirmasi || "RaySim")}</span>`;

  // ---- SİNYALİZASYON bölümü (sinyal lambaları metrajı — canlı sistemle birebir) ----
  const gidenS = sinyalListe.filter((f) => f.yon === "giden").length;
  const gelenS = sinyalListe.filter((f) => f.yon === "gelen").length;
  // SİNYAL DÜZENİ ÖZETİ — kullanıcının girdiği her sinyali TEK TEK dökmek yerine (o veri
  // zaten Ringler'de) tasarımın ÖZET metrikleri: sayılar, aspect aralığı, metraj aralığı,
  // ortalama sinyal aralığı. Rapor girdiyi geri kusmaz; düzeni değerlendirir.
  const aspektler = sinyalListe.map((f) => Math.round(f.aspektCevrim || 0)).filter((a) => a > 0);
  const aMin = aspektler.length ? Math.min(...aspektler) : 0;
  const aMax = aspektler.length ? Math.max(...aspektler) : 0;
  const aspStr = aspektler.length ? (aMin === aMax ? `${aMin} s` : `${aMin}–${aMax} s`) : "—";
  const sPozlar = sinyalListe.map((f) => f.pos);
  const metrajAralik = sPozlar.length ? `${kmFmt(Math.min(...sPozlar))} – ${kmFmt(Math.max(...sPozlar))}` : "—";
  const hatKm = line ? line.length : 0;
  const ortAralik = gidenS > 0 && hatKm > 0 ? Math.round(hatKm / gidenS) : 0;
  const sinyalOzetRows: (string | number)[][] = [
    [lang === "en" ? "Total signal lamps (SG)" : "Toplam sinyal lambası (SG)", `${sinyalSayisi}`],
    [lang === "en" ? "Outbound (▶) / Return (◀)" : "Giden (▶) / Gelen (◀)", `${gidenS} / ${gelenS}`],
    ...(tersSinyalSayisi ? [[lang === "en" ? "Reverse-running (turnback)" : "Ters işletme (turnback)", `${tersSinyalSayisi}`]] : []),
    [lang === "en" ? "Aspect cycle" : "Aspect çevrimi", aspStr],
    [lang === "en" ? "Chainage span (first – last SG)" : "Metraj aralığı (ilk – son SG)", metrajAralik],
    ...(ortAralik ? [[lang === "en" ? "Mean signal spacing (outbound)" : "Ortalama sinyal aralığı (giden)", `~${ortAralik} m`]] : []),
  ];
  const sinyalBolum = `
  <div class="banner"><span class="no">03</span>${lang === "en" ? "SIGNALLING — SIGNAL LAMPS (SG)" : "SİNYALİZASYON — SİNYAL LAMBALARI (SG)"}</div>
  <p>${lang === "en"
    ? `The line is protected by <b>${sinyalSayisi} signal lamps</b>; each outbound signal is a <b>block boundary</b>. The design layout is summarised below; the full signal schedule (per-lamp chainages) is held in the design model.`
    : `Hat, <b>${sinyalSayisi} adet sinyal lambası</b> ile korunur; her giden yön sinyali bir <b>blok sınırıdır</b>. Aşağıda sinyal düzeninin özeti verilmiştir; tam metraj listesi (sinyal-başı kilometraj) tasarım modelinde tutulur.`}</p>
  ${sinyalListe.length ? tbl(lang === "en" ? ["Indicator", "Value"] : ["Gösterge", "Değer"], sinyalOzetRows, { first: true }) : `<p class="muted">${lang === "en" ? "No signal lamps defined on this line yet (positions are entered in the Ringler module)." : "Bu hatta henüz sinyal lambası tanımlı değil (konumlar Ringler modülünde girilir)."}</p>`}
`;


  // ---- İŞLETME & TALEP ANALİZİ (ters işletme) — GİRDİ→SONUÇ çerçevesi ----
  // "Siz şu girdiyi verdiniz → bu sonuç çıktı" biçiminde; iç formül/algoritma (sır) açığa çıkmaz.
  // MOD = "toplam" — Ters İşletme sayfasının VARSAYILAN modu (birebir aynı çıktı için).
  // Böylece rapordaki filo/öneri/tepe yük değerleri canlı Ters İşletme ekranıyla eşleşir.
  const tia = rings.length >= 2 ? tersIsletmeAnaliz(rings, stock, isletme, cfg, "toplam") : null;
  // Gerekçe kutusu — insan dilinde: önce sonuç, sonra "bu böyle çıktı çünkü şu girdiyi
  // verdin / şu değerler harmanlandı". Esas/Sonuç etiketi ve çıplak formül YOK; akıcı paragraf.
  const gsNot = (metin: string) => `<div class="gs">${metin}</div>`;
  let isletmeBolum = "";
  if (tia) {
    const P = Math.round(isletme.pikYolcuSaat || 0);   // girilen toplam pik talep (yolcu/saat)
    const C = tia.aracKapasite;                        // araç yolcu kapasitesi
    const pikFiloN = tia.filo.mevcutPik;               // mevcut pik tramvay sayısı

    // 5.1 Yolcu Yük Profilleri
    const yukThead = en ? ["Stop", "Board", "Alight", "Load ▶", "Load ◀", "Peak", "Occ."] : ["Durak", "Binen", "İnen", "Yük ▶", "Yük ◀", "Tepe", "Doluluk"];
    const yukRows = tia.duraklar.map((d) => [esc(d.ad), `${d.binen}`, `${d.inen}`, `${d.yukGidis}`, `${d.yukDonus}`, `${d.tepeYuk}`, `%${Math.round(d.doluluk * 100)}`]);
    const b51 = `<h3 class="sub">5.1 ${en ? "Passenger Load Profiles" : "Yolcu Yük Profilleri"}</h3>
      ${gsNot(en
        ? `The table presents each stop's directional load together with the busiest point on the line; the peak load is <b>${tia.tepeYuk} pax/h</b> at <b>${esc(tia.tepeDurak)}</b>. ${tia.gercekVeri ? `The profile is derived directly from the boarding/alighting counts entered for each stop.` : `It arises from distributing the defined total demand of ${P} pax/h across the stops according to their role — hospital, interchange, stadium and centre carrying more — so that the load accumulates along the line in this manner.`}`
        : `Tabloda her durağın yönlü yükü ve hattın en yoğun noktası yer almaktadır; en yüksek yük <b>${tia.tepeYuk} yolcu/saat</b> ile <b>${esc(tia.tepeDurak)}</b> durağındadır. ${tia.gercekVeri ? `Profil, her durak için ayrı girilen iniş-biniş sayımlarından doğrudan elde edilmiştir.` : `Bu profil, tanımlanan ${P} yolcu/saatlik toplam talebin durakların rolüne göre (hastane, aktarma, stadyum ve merkez daha yoğun) hat boyunca dağıtılmasıyla oluşmaktadır.`}`)}
      ${tbl(yukThead, yukRows, { first: true })}
      <div class="fig">${yukDwellSvg(tia.duraklar, rings, en)}<div class="cap">${en ? "Figure 5b — Load profile (per-stop peak load, coloured by occupancy; peak marked) and dwell breakdown (door-open / passenger exchange / door-close), along the line." : "Şekil 5b — Yük profili (durak başına tepe yük, doluluğa göre renkli; tepe işaretli) ve duruş dökümü (kapı açma / yolcu değişimi / kapı kapama), hat boyunca."}</div></div>
      ${(() => {
        const pikDol = Math.round(Math.max(...tia.duraklar.map((d) => d.doluluk), 0) * 100);
        const gA = tia.filo.gerekenArac, mP = tia.filo.mevcutPik, fk = gA - mP;
        const zt = en ? ["Stage", "Value", "Basis"] : ["Aşama", "Değer", "Dayanak"];
        const zr = [
          [en ? "Peak demand" : "Tepe talep", `${tia.tepeYuk} ${en ? "pax/h" : "yolcu/sa"}`, esc(tia.tepeDurak)],
          [en ? "Required fleet" : "Gereken filo", `${gA} ${en ? "trams" : "tramvay"}`, `${en ? "at" : ""} %${Math.round((isletme.dolulukHedefi || 0.85) * 100)} ${en ? "occ. target" : "doluluk hedefi"}`],
          [en ? "Achieved occupancy" : "Ulaşılan doluluk", `%${pikDol}`, `${en ? "current fleet" : "mevcut filo"} ${mP}`],
        ];
        const zn = en
          ? `Peak demand requires <b>${gA} trams</b> at the target occupancy${fk > 0 ? ` (${fk} more than current)` : fk < 0 ? ` (${-fk} fewer suffice)` : " (current suffices)"}; with the current fleet the busiest section reaches <b>%${pikDol}</b> occupancy.`
          : `Tepe talep, hedef dolulukta <b>${gA} tramvay</b> gerektirir${fk > 0 ? ` (mevcuttan ${fk} fazla)` : fk < 0 ? ` (mevcuttan ${-fk} az yeterli)` : " (mevcut yeterli)"}; mevcut filoda en yoğun kesim <b>%${pikDol}</b> doluluğa ulaşır.`;
        return `<h3 class="sub">${en ? "Demand → Required Fleet → Occupancy" : "Talep → Gereken Filo → Doluluk"}</h3>${tbl(zt, zr, { first: true })}<div class="gs" style="font-size:9.5pt">${zn}</div>`;
      })()}`;

    // 5.2 Depo Çıkışı
    const b52 = `<h3 class="sub">5.2 ${en ? "Depot Dispatch — One Depot, Two Directions" : "Depo Çıkışı — Tek Depodan İki Yön"}</h3>
      ${gsNot(en
        ? `${esc(tia.depoDagilim.aciklama)} This split results from the ${pikFiloN}-tram peak fleet leaving a single depot and being directed to both directions over the depot crossover.`
        : `${esc(tia.depoDagilim.aciklama)} Bu paylaşım, ${pikFiloN} araçlık pik filonun tek depodan çıkarak depo makası (crossover) üzerinden iki yöne yönlendirilmesinden kaynaklanmaktadır.`)}`;

    // 5.3 Dönüşe İhtiyaç Duyan Duraklar
    const dThead = en ? ["Stop", "Occ.", "Segment", "Suggested switch", "Severity"] : ["Durak", "Doluluk", "Segman", "Önerilen makas", "Şiddet"];
    const dRows = tia.donusIhtiyaclari.map((d) => [esc(d.durak), `%${Math.round(d.doluluk * 100)}`, esc(d.segman), esc(d.oneriMakas), d.siddet]);
    const b53 = `<h3 class="sub">5.3 ${en ? "Stops Needing Turnback" : "Dönüşe İhtiyaç Duyan Duraklar"}</h3>
      ${tia.donusIhtiyaclari.length
        ? gsNot(en
            ? `${tia.donusIhtiyaclari.length} stop(s) exceed the defined ${Math.round((isletme.dolulukHedefi || 0.85) * 100)}% occupancy target, and a short-turn (turnback) is required at these stops. This result is obtained by comparing the load carried by ${pikFiloN} trams of ${C} passengers each against the ${Math.round((isletme.dolulukHedefi || 0.85) * 100)}% target; the stops where demand exceeds this limit are listed in the table.`
            : `${tia.donusIhtiyaclari.length} durak, tanımlanan %${Math.round((isletme.dolulukHedefi || 0.85) * 100)} doluluk hedefini aşmakta olup bu duraklarda kısa dönüş (turnback) gerekmektedir. Bu sonuç, ${C} kişilik araçlarla çalışan ${pikFiloN} tramvayın taşıdığı yükün %${Math.round((isletme.dolulukHedefi || 0.85) * 100)} doluluk hedefine oranlanmasından elde edilmiştir; talebin bu sınırı aştığı duraklar tabloda listelenmiştir.`) + tbl(dThead, dRows, { first: true })
        : `<p class="muted">${en ? "All stops within the occupancy target — no turnback needed." : "Tüm duraklar doluluk hedefinde — dönüşe ihtiyaç yok."}</p>`}`;

    // 5.4 Makas Bölgesi Başına Ters İşletme Varyasyonları
    // Makas gösterimi: S ve X ayrı sayılır → karışık istasyon "2 S-makas + 1 X-makas"
    // olarak yazılır (tek tipse yalnız o). Makas motoru adedi içseldir, gösterilmez.
    const makasEt = (m: { sSayi: number; xSayi: number; crossover: "s" | "x"; makasSayisi: number }) => {
      const p: string[] = [];
      if (m.sSayi > 0) p.push(en ? `${m.sSayi} S-type switch` : `${m.sSayi} S-makas`);
      if (m.xSayi > 0) p.push(en ? `${m.xSayi} X-type switch` : `${m.xSayi} X-makas`);
      return p.length ? p.join(" + ") : (en ? `${m.makasSayisi} ${m.crossover === "x" ? "X" : "S"}-type switch` : `${m.makasSayisi} ${m.crossover === "x" ? "X" : "S"}-makas`);
    };
    const b54ic = tia.makaslar.length
      ? tia.makaslar.map((m) => `<div class="ring-detay"><h4>${esc(m.ad)} (${makasEt(m)})</h4>
          ${gsNot(en
            ? `${esc(m.yorum)} The reason is the load imbalance between the two arms of this ${makasEt(m)}: one arm carries ${m.yuksekYuk} pax/h while the other carries ${m.dusukYuk}, and as this gap widens the benefit of reverse running at this location increases.`
            : `${esc(m.yorum)} Bunun nedeni, bu bölgedeki ${makasEt(m)}ın iki kolu arasındaki yük farkıdır; bir kol ${m.yuksekYuk} yolcu/saat taşırken diğeri ${m.dusukYuk} taşımakta, fark büyüdükçe buradaki ters işletmenin sağladığı kazanç artmaktadır.`)}
          <ul class="ch">${m.varyasyonlar.map((v) => `<li><b>${esc(v.ad)}:</b> ${esc(v.aciklama)}</li>`).join("")}</ul>
          <p class="muted" style="font-size:9.5pt">${esc(m.sureNotu)}</p></div>`).join("")
      : `<p class="muted">${en ? "No mid-line switch zones — reverse-running variations apply only at terminals." : "Ara-hat makas bölgesi yok — ters işletme varyasyonları yalnız terminallerde geçerli."}</p>`;
    const b54 = `<h3 class="sub">5.4 ${en ? "Reverse-Running Variations per Switch Zone" : "Makas Bölgesi Başına Ters İşletme Varyasyonları"}</h3>${b54ic}`;

    // 5.5 Filo & Öneri — üretebilirlik: gereken/mevcut/fark (çek/ekle) + kısa dönüş +
    // tepe yük/çevrim/frekans/araç özeti (tümü canlı motordan: tersIsletmeAnaliz).
    const fark = tia.filo.fark; // gereken − mevcut
    const hedefY = Math.round((isletme.dolulukHedefi || 0.85) * 100);
    const cevrimDk = (tia.cevrimSn / 60).toFixed(0);
    const farkStr = `${fark > 0 ? "+" : ""}${fark}${fark === 0 ? (en ? " (balanced)" : " (dengede)") : (fark > 0 ? (en ? " (add)" : " (ilave)") : (en ? " (surplus)" : " (fazla)"))}`;
    const ozetSatir = en
      ? `Peak load <b>${tia.tepeYuk} pax/h</b> at <b>${esc(tia.tepeDurak)}</b> · cycle <b>${cevrimDk} min</b> · frequency <b>${tia.mevcutFrekans.toFixed(1)} trains/h</b> · vehicle <b>${tia.aracKapasite} pax</b>.`
      : `Tepe yük <b>${tia.tepeYuk} yolcu/saat</b> · <b>${esc(tia.tepeDurak)}</b> · çevrim <b>${cevrimDk} dk</b> · frekans <b>${tia.mevcutFrekans.toFixed(1)} tramvay/sa</b> · araç <b>${tia.aracKapasite} kişi</b>.`;
    // 5.5 SADE TASARIM: renkli kart panosu yerine kurumsal metrik tablo (navy değerler) +
    // öneri notu (navy, renksiz vurgu). Belirleyici sayı Fark satırında.
    const b55 = `<h3 class="sub">5.5 ${en ? "Fleet & Recommendation" : "Filo & Öneri"}</h3>
      ${gsNot(en
        ? `<b>${esc(tia.filo.aciklama)}</b> This figure is obtained by determining the number of trams required to serve the peak demand at the ${hedefY}% occupancy target, evaluated together with the ${cevrimDk}-min round-trip time and the ${C}-passenger vehicle capacity.`
        : `<b>${esc(tia.filo.aciklama)}</b> Bu değer, pik talebin %${hedefY} doluluk hedefine göre karşılanması için gereken araç sayısının; ${cevrimDk} dakikalık tam tur süresi ve ${C} kişilik araç kapasitesiyle birlikte değerlendirilmesinden elde edilmiştir.`)}
      ${tbl(en ? ["Metric", "Value"] : ["Gösterge", "Değer"], [
        [en ? `Required fleet (${hedefY}% occupancy)` : `Gereken filo (%${hedefY} doluluk)`, `${tia.filo.gerekenArac}`],
        [en ? "Current peak fleet" : "Mevcut pik filo", `${tia.filo.mevcutPik}`],
        [en ? "Difference (required − current)" : "Fark (gereken − mevcut)", farkStr],
        ...(tia.filo.kisaDonusTasarruf > 0 ? [[en ? "Required with short-turn" : "Kısa dönüşle gereken", `${tia.filo.gerekenAracKisaDonusle} (−${tia.filo.kisaDonusTasarruf})`]] : []),
        [en ? "Sustainable ceiling (UIC 406)" : "Sürdürülebilir tavan (UIC 406)", `${tia.maksSurdurulebilir}`],
      ], { first: true })}
      <p class="muted" style="font-size:9.5pt;margin-top:4px">${ozetSatir}</p>`;

    // 5.6 Sefer ↔ Ters İşletme (entegre): temsili sefer aralığında araç konumları +
    // makasa yaklaşan araca bağlanan kısa dönüş önerileri (canlı sim ile aynı yörünge).
    // Kullanıcının girdiği sefer sıklığı (seferHeadwayDk) esas alınır — panel/Tarife ile paralel.
    const stHeadway = isletme.seferHeadwayDk && isletme.seferHeadwayDk > 0
      ? Math.round(isletme.seferHeadwayDk * 60)
      : (maks.cevrimSuresi > 0 && filoGercek > 0 ? Math.round(maks.cevrimSuresi / filoGercek) : cfg.headway);
    const ste = seferTersEntegre(rings, stock, cfg, isletme, stHeadway, 0);
    let b56 = "";
    if (ste.gecerli) {
      const stHw = (s: number) => { const x = Math.max(0, Math.round(s)); const d = Math.floor(x / 60), k = x % 60; return d > 0 ? `${d}:${String(k).padStart(2, "0")}` : `${k} s`; };
      const oThead = en ? ["Tram", "Position", "Switch", "km", "Time to switch", "Busy/Quiet"] : ["Araç", "Konum", "Makas", "km", "Makasa ulaşım", "Yoğun/Sessiz"];
      const oRows = ste.oneriler.map((o) => [`${o.aracNo}`, `${o.aracKm.toFixed(2)} km`, `${esc(o.makasAd)} (${o.crossover === "x" ? "X" : "S"})`, `${o.makasKm.toFixed(2)}`, stHw(o.ulasimSn), `${o.oran.toFixed(1)}×`]);
      const oneriBlok = ste.oneriler.length
        ? `${tbl(oThead, oRows, { first: true })}
           <ul style="margin:6px 0 0 16px;padding:0;font-size:9pt;color:#334">${ste.oneriler.map((o) => `<li style="margin-bottom:2px">${esc(o.gerekce)}</li>`).join("")}</ul>`
        : `<p class="muted" style="font-size:9.5pt">${en ? "At this representative snapshot no tram is approaching a load-imbalanced switch in the outbound direction; the binding shifts as trams advance through the cycle." : "Bu temsili anlık-görüntüde yük dengesizliği olan bir makasa gidiş yönünde yaklaşan araç yok; araçlar çevrimde ilerledikçe bağlanan araç değişir."}</p>`;
      b56 = `<h3 class="sub">5.6 ${en ? "Service ↔ Reverse-Running (Integrated)" : "Sefer ↔ Ters İşletme (Entegre)"}</h3>
      ${gsNot(en
        ? `At a representative service interval of <b>${stHw(stHeadway)}</b> the line runs <b>${ste.filo} trams</b>; the diagram below places each tram at its real position along the line (${(ste.L / 1000).toFixed(1)} km) — obtained from the same trajectory the live simulation uses, so signal lamps, switch-transit speeds, road/pedestrian crossings, gradient and station dwells are all accounted for. Where the entered demand leaves a switch zone with a busy inner leg and a quiet outer end, the short-turn decision is bound to the outbound tram approaching that switch, and its real time-to-switch is read off the trajectory.`
        : `Temsili <b>${stHw(stHeadway)}</b> sefer aralığında hat <b>${ste.filo} tramvay</b> ile işlemekte; aşağıdaki diyagram her aracı hat boyunca (${(ste.L / 1000).toFixed(1)} km) gerçek konumuna yerleştirir — bu konumlar canlı simülasyonun kullandığı yörüngeden gelir, dolayısıyla sinyal lambaları, makas geçiş hızları, karayolu/yaya geçitleri, eğim ve istasyon duruşları hesaba katılıdır. Girilen talep, bir makas bölgesinin iç kolunu yoğun, dış ucunu sessiz bıraktığında kısa dönüş kararı o makasa yaklaşan gidiş aracına bağlanır ve makasa gerçek ulaşım süresi yörüngeden okunur.`)}
      <div class="fig">${seferTersSvg(ste)}<div class="cap">${en ? `Figure 5c — Vehicle positions at the representative interval: outbound (▲) / inbound (▼) trams, all reverse-running switches (◆, km-labelled) with short-turn candidates (🔄, red) and the tram→switch binding for each recommendation.` : `Şekil 5c — Temsili aralıkta araç konumları: gidiş (▲) / dönüş (▼) tramvaylar, ters işletme yapılabilen tüm makaslar (◆, km etiketli), kısa dönüş adayları (🔄, kırmızı) ve her öneri için araç→makas bağlantısı.`}</div></div>
      ${oneriBlok}
      ${(() => {
        const f = ste.filoIhtiyac; if (!f) return "";
        const py = (r: number) => `%${Math.round(r * 100)}`;
        const yetersiz = f.durum === "aracYetersiz";
        const rows = yetersiz ? [
          [en ? "Requested in service" : "İstenen serviste", `${f.serviste}`],
          [en ? "Physical ceiling" : "Fiziksel tavan", `${f.teorikTavan} ${en ? "trams" : "tramvay"}`],
          [en ? "Excess" : "Fazla", `${f.acikAdet} ${en ? "trams" : "araç"}`],
          [en ? "Smallest feasible interval" : "En küçük uygulanabilir aralık", stHw(f.minAralikSn)],
        ] : f.eklenecek > 0 ? [
          [en ? "In service" : "Serviste", `${f.serviste}`],
          [en ? "Recommended addition" : "Önerilen ekleme", `+${f.eklenecek} → ${f.yeniServiste}`],
          [en ? "New interval" : "Yeni aralık", stHw(f.yeniHeadwaySn)],
          [en ? "Peak occupancy" : "En yoğun kesim doluluğu", `${py(f.tepeDoluluk)} → ${py(f.yeniDoluluk)}`],
          ...(f.durum === "altyapi" ? [[en ? "Unmet (beyond ceiling)" : "Karşılanamayan (tavan üstü)", `${f.acikAdet} ${en ? "trams" : "araç"}`]] : []),
        ] : [];
        if (f.problem) {
          // PROBLEM VAR → rapora belirgin uyarı düşür (ekleme İSTEĞİ ya da sıklık SAĞLANAMAZ).
          const baslik = yetersiz ? (en ? "SERVICE FREQUENCY NOT FEASIBLE" : "SEFER SIKLIĞI SAĞLANAMAZ") : (en ? "TRAM ADDITION REQUIRED" : "TRAMVAY EKLEME İHTİYACI");
          return `<div style="margin-top:8px;border:1px solid ${CK.red};border-left:4px solid ${CK.red};background:${CK.badBgSoft};border-radius:6px;padding:9px 11px">
            <div style="font-weight:800;color:#8E1224;font-size:10pt;letter-spacing:.02em">⚠ ${baslik}</div>
            <p style="margin:4px 0 0;font-size:9.5pt;color:#3a2226">${esc(f.mesaj)}</p>
            ${rows.length ? tbl(en ? ["Metric", "Value"] : ["Gösterge", "Değer"], rows, { first: true }) : ""}
          </div>`;
        }
        // Sorun yok → tek satır durum notu.
        return gsNot(en
          ? `Fleet adequacy: in service ${f.serviste} trams; ${f.durum === "tersYeter" ? `the busiest section reaches ${py(f.tepeDoluluk)} but a short-turn at the ${esc(f.tepeDurak)} core brings it within the ${py(f.hedefDoluluk)} target with the current fleet — no tram addition needed.` : `the busiest section stays at ${py(f.tepeDoluluk)}, within the ${py(f.hedefDoluluk)} target — no tram addition needed.`}`
          : `Filo yeterliliği: serviste ${f.serviste} tramvay; ${f.durum === "tersYeter" ? `en yoğun kesim ${py(f.tepeDoluluk)} doluluğa çıksa da ${esc(f.tepeDurak)} çekirdeğinde kısa dönüş uygulanınca mevcut filoyla ${py(f.hedefDoluluk)} hedefine iner — tramvay eklemeye gerek yok.` : `en yoğun kesim ${py(f.tepeDoluluk)} doluluktadır, ${py(f.hedefDoluluk)} hedefinin içinde — tramvay eklemeye gerek yok.`}`);
      })()}
      <ul class="muted" style="margin:6px 0 0 16px;padding:0;font-size:9pt">${ste.bilgi.map((b) => `<li style="margin-bottom:2px">${esc(b)}</li>`).join("")}</ul>`;
    }

    isletmeBolum = `
  <div class="banner"><span class="no">05</span>${en ? "OPERATIONS & DEMAND ANALYSIS (REVERSE RUNNING)" : "İŞLETME & TALEP ANALİZİ (TERS İŞLETME)"}</div>
  <p>${en
    ? `This section addresses, as a whole, how the defined demand, fleet and switch inputs are reflected in operation. It first examines the load that passengers generate along the line, then evaluates in turn the single-depot two-direction dispatch, the stops that fill up enough to require a short-turn, the benefit of reverse running at the switch zones, and finally the fleet size the line calls for.`
    : `Bu bölüm, tanımlanan talep, filo ve makas girdilerinin işletmeye yansımasını bir bütün olarak ele alır. Önce yolcunun hat boyunca oluşturduğu yük incelenmekte; ardından tek depodan iki yöne çıkış, dolup kısa dönüş gerektiren duraklar, makas bölgelerinde ters işletmenin sağladığı kazanç ve son olarak hattın gerektirdiği filo büyüklüğü sırasıyla değerlendirilmektedir.`}</p>
  <div class="gs">${en
    ? `All values in this section are derived from the operating inputs. The starting point is either the boarding/alighting counts entered stop by stop, or — where a single total is provided — the distribution of that demand across the stops by their role; combined with the vehicle's passenger capacity and the service frequency, this yields the directional load profile along the line and each stop's <b>occupancy ratio</b>. The stops exceeding the occupancy target, and those requiring a short-turn, follow from the same analysis. The tram's capacity and physical characteristics (door count and width, floor area, mass, tractive effort, braking) are included in the assessment.`
    : `Bu bölümdeki değerlerin tamamı işletme girdilerinden türetilmektedir. Başlangıç noktası, durak durak girilen iniş-biniş sayımları ya da tek bir toplam verildiğinde bu talebin durakların rolüne göre hatta dağıtılmasıdır; bu veri, aracın yolcu kapasitesi ve sefer sıklığıyla birleştirildiğinde hat boyunca yönlü yük profili ve her durağın <b>doluluk oranı</b> elde edilir. Doluluk hedefini aşan duraklar ve kısa dönüş gerektiren duraklar da aynı çözümden çıkmaktadır. Değerlendirmeye tramvayın kapasitesi ve fiziksel özellikleri (kapı sayısı ve genişliği, taban alanı, kütle, çekiş, frenleme) dahil edilmektedir.`}</div>
  ${b51}${b52}${b53}${b54}${b55}${b56}
`;
  }

  // Kapasite ÖLÇÜM ESASLARI — hangi saha girdilerinin birlikte değerlendirildiği (iç
  // formül/algoritma açığa çıkmadan; yöntem UIC 406 blocking-time esaslı).
  const kapGirdiNot = `<div class="gs">${en
    ? `This figure does not rest on a single measurement; it results from evaluating all field constraints together: the terminal throat occupation times, the switch types and counts (S-makas / X-makas), the signal lamps' positions, directions and aspect states, the block occupations, the station dwell times, the level crossings, and the tram's physical characteristics (mass, tractive effort and power, braking, running resistance, length, top speed) — all assessed jointly under the UIC 406 blocking-time (Sperrzeitentreppe) method. As a result of this assessment, the line carries a theoretical maximum of <b>${maks.nTeorik} trams</b> (sustainable ${maks.nSurdurulebilir}), and at the tightest constraint (${esc(maks.baglayanAd || "—")}) the minimum interval between trams is determined as <b>${Math.round(maks.hMin)} s</b>.`
    : `Bu değer tek bir ölçüme dayanmaz; sahadaki bütün kısıtların birlikte değerlendirilmesinden elde edilir: terminal boğazının işgal süreleri, makasların tip ve sayısı (S-makas / X-makas), sinyal lambalarının konumu, yönü ve aspect durumları, blok işgalleri, istasyon duruş (dwell) süreleri, hemzemin geçitler ve tramvayın fiziksel özellikleri (kütle, çekiş kuvveti ve gücü, frenleme, seyir direnci, uzunluk, azami hız) — tümü UIC 406 blocking-time (Sperrzeitentreppe) yöntemiyle birlikte ele alınır. Bu değerlendirme sonucunda hat teorik olarak en fazla <b>${maks.nTeorik} tramvay</b> (sürdürülebilir ${maks.nSurdurulebilir}) taşımakta; en dar kısıtta (${esc(maks.baglayanAd || "—")}) tramvaylar arasındaki en küçük aralık <b>${Math.round(maks.hMin)} s</b> olarak belirlenmektedir.`}</div>`;

  // Onayın hemen üstündeki bağımsız çekirdek doğrulama satırı (kurumsal, tek satır).
  const cekirdekNot = `<div class="cekirdek">${en
    ? "Verified in collaboration with OpenTrack; independent core based on the UIC 406 methodology. Every figure in this report is reproducible in the live simulation."
    : "OpenTrack ile işbirliğiyle doğrulanmış; UIC 406 metodolojisine dayanan bağımsız çekirdek. Rapordaki her değer canlı simülasyonda birebir yeniden üretilebilir."}</div>`;

  // ---- 06 TARİFE (zaman çizelgesi) ----
  // Hedef sefer aralığında (cfg.headway) servis penceresi (06:00–24:00) boyunca kalkışlar
  // + araç ataması. Filo = ⌈çevrim ÷ headway⌉ = siganTren → rapor başlığındaki "gereken
  // filo" ile birebir. Çevrim maks.cevrimSuresi'nden (kapasite otoritesi) gelir.
  const hhmm = (sn: number) => `${String(Math.floor(sn / 3600)).padStart(2, "0")}:${String(Math.floor((sn % 3600) / 60)).padStart(2, "0")}`;
  // Servis penceresi işletme girdisinden ("SS:DD", kalıcı); ayrıştırılamazsa 06:00–24:00.
  const snAyir = (s?: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim()); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : null; };
  const winBas = snAyir(isletme.servisBas) ?? 21600;
  const winBitHam = snAyir(isletme.servisBit) ?? 86400;
  const winBit = winBitHam > winBas ? winBitHam : 86400;
  const pencereEt = `${hhmm(winBas)}–${hhmm(winBit)}`;
  // Tur başı zorunlu terminal molası (kalıcı, 0–5 dk → s). Tam tur süresine EKLENİR.
  const molaSn = Math.max(0, Math.min(300, Math.round((isletme.molaDk || 0) * 60)));
  // Çizelge PLANLANAN FİLO (filoGercek) ile ULAŞILAN sefer aralığından üretilir → rapordaki
  // "Planlanan filo" KPI'ı ve İşletme bölümüyle birebir tutarlı. Mola tam tura eklendiğinden
  // ulaşılan aralık = (çevrim + mola) ÷ filo; sabit filoda mola sıklığı düşürür.
  const tarifeHeadway = maks.gecerli && filoGercek > 0 ? (maks.cevrimSuresi + molaSn) / filoGercek : cfg.headway;
  const tarife = maks.gecerli ? tarifeUret(maks.cevrimSuresi, tarifeHeadway, winBas, winBit, molaSn) : null;
  const tarifeBolum = tarife && tarife.gecerli ? `
  <div class="banner"><span class="no">06</span>${en ? "TIMETABLE (SERVICE SCHEDULE)" : "TARİFE (ZAMAN ÇİZELGESİ)"}</div>
  <p>${en
    ? `Departures across the service window (${pencereEt}) for the planned fleet of ${filoGercek} trains; each vehicle completes one full round trip (cycle)${molaSn > 0 ? ` plus a ${(molaSn / 60).toFixed(molaSn % 60 ? 1 : 0)}-min terminal break` : ""} and returns to the queue. The interval below is the headway this fleet actually achieves.`
    : `Servis penceresi (${pencereEt}) boyunca planlanan ${filoGercek} araçlık filoyla üretilen kalkışlar; her araç bir tam turu (çevrim)${molaSn > 0 ? ` ve ${(molaSn / 60).toFixed(molaSn % 60 ? 1 : 0)} dk terminal molasını` : ""} tamamlayıp sıraya döner. Aşağıdaki sefer aralığı, bu filonun fiilen sağladığı sıklıktır.`}</p>
  ${tbl(
    [en ? "Metric" : "Gösterge", en ? "Value" : "Değer"],
    [
      [en ? "Fleet in service" : "Serviste filo", `${tarife.filo}`],
      [en ? `Daily trips (${pencereEt})` : `Günlük sefer (${pencereEt})`, `${tarife.seferSayisi}`],
      [en ? "Service span" : "Servis penceresi", `${hhmm(tarife.ilkKalkis)} – ${hhmm(tarife.sonKalkis)}`],
      [en ? "Achieved headway (interval)" : "Ulaşılan sefer aralığı", `${Math.round(tarifeHeadway)} s · ${(tarifeHeadway / 60).toFixed(1)} ${en ? "min" : "dk"}`],
      [en ? "Round-trip time (cycle)" : "Çevrim (tam tur)", `${s0(maks.cevrimSuresi)} · ${(maks.cevrimSuresi / 60).toFixed(1)} ${en ? "min" : "dk"}`],
      ...(molaSn > 0 ? [[en ? "Terminal break per turn" : "Tur başı terminal molası", `${(molaSn / 60).toFixed(molaSn % 60 ? 1 : 0)} ${en ? "min" : "dk"}`]] : []),
      [en ? "Idle beyond break (layover)" : "Boşta bekleme (layover)", `${Math.round(tarife.layoverSn)} s`],
    ],
    { first: true },
  )}
  <h3 class="sub">6.1 ${en ? "First Departures (sample)" : "İlk Kalkışlar (örnek)"}</h3>
  ${tbl(
    [en ? "Trip" : "Sefer", en ? "Departure" : "Kalkış", en ? "Return arrival" : "Dönüş varış", en ? "Vehicle" : "Araç"],
    tarife.seferler.slice(0, 12).map((s) => [`${s.no}`, hhmm(s.kalkisSn), hhmm(s.varisSn), `${s.aracNo}`]),
  )}
  <div class="gs">${en
    ? `Departures 1–12 shown as a sample; the full schedule (${tarife.seferSayisi} trips) and per-vehicle diagram are generated in the live simulation.`
    : `Örnek olarak 1–12. seferler gösterilmiştir; tam çizelge (${tarife.seferSayisi} sefer) ve araç bazlı diyagram canlı simülasyonda üretilir.`}</div>` : "";

  // ---- 07 DUYARLILIK (tornado) — hangi parametre işletme kapasitesini en çok oynatıyor ----
  // Her parametre ±%20 oynatılıp diğerleri sabit tutulur; işletme kapasitesinin (tramvay/saat)
  // aldığı aralık ölçülür. Salınıma göre sıralı → en güçlü kaldıraç tepede. Motorla hesaplanır.
  const duy = maks.gecerli && rings.length ? duyarlilikAnaliz(rings, stock, cfg, isletme, "isletmeKap", 20) : null;
  let duyarlilikBolum = "";
  if (duy && duy.satirlar.length) {
    const tumDeger = duy.satirlar.flatMap((r) => [r.eksi, r.arti]).concat(duy.taban);
    const axMin = Math.min(...tumDeger), axMax = Math.max(...tumDeger);
    const pos = (v: number) => (axMax > axMin ? ((v - axMin) / (axMax - axMin)) * 100 : 50);
    const bPos = pos(duy.taban);
    const okKok = duy.satirlar[0];
    const satirHtml = duy.satirlar.map((r) => {
      const low = Math.min(r.eksi, r.arti), high = Math.max(r.eksi, r.arti);
      const l = pos(low), w = Math.max(1.5, pos(high) - l);
      const ok = r.yon === 1 ? "▲" : r.yon === -1 ? "▼" : "–";
      return `<tr><td class="l">${esc(r.ad)}</td>`
        + `<td class="trk-td"><div class="trk"><div class="barr" style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></div><div class="base" style="left:${bPos.toFixed(1)}%"></div></div></td>`
        + `<td>${low.toFixed(0)}–${high.toFixed(0)}</td><td><b>${r.salinim.toFixed(0)}</b> ${ok}</td></tr>`;
    }).join("");
    duyarlilikBolum = `
  <div class="banner"><span class="no">07</span>${en ? "SENSITIVITY (TORNADO)" : "DUYARLILIK (TORNADO)"}</div>
  <p>${en
    ? `Each parameter is perturbed ±${duy.deltaYuzde}% while the rest are held fixed, and the resulting range of the operating capacity (trains/hour) is measured. Parameters are ranked by swing — the longest bar is the strongest lever. The vertical line marks the current design value (${duy.taban.toFixed(0)} ${en ? "tph" : "tramvay/sa"}).`
    : `Her parametre ±%${duy.deltaYuzde} oynatılıp diğerleri sabit tutulur ve işletme kapasitesinin (tramvay/saat) aldığı aralık ölçülür. Salınıma göre sıralanır — en uzun çubuk en güçlü kaldıraçtır. Dikey çizgi mevcut tasarım değerini gösterir (${duy.taban.toFixed(0)} tramvay/sa).`}</p>
  <div class="tor"><table class="tor-tbl"><colgroup><col style="width:26%"><col style="width:44%"><col style="width:15%"><col style="width:15%"></colgroup>
  <thead><tr><th class="l">${en ? "Parameter" : "Parametre"}</th><th>${en ? "Effect on operating capacity" : "İşletme kapasitesine etki"}</th><th>${en ? "Range" : "Aralık"}</th><th>${en ? "Swing" : "Salınım"}</th></tr></thead>
  <tbody>${satirHtml}</tbody></table></div>
  <div class="gs">${en
    ? `The strongest lever here is <b>${esc(okKok.ad)}</b> (swing ${okKok.salinim.toFixed(0)} tph) — the parameter to secure first in design and operation. ▲ = capacity rises as the parameter rises; ▼ = it falls.`
    : `Bu hatta en güçlü kaldıraç <b>${esc(okKok.ad)}</b> (salınım ${okKok.salinim.toFixed(0)} tramvay/sa) — tasarımda ve işletmede önce güvenceye alınması gereken parametre. ▲ = parametre artınca kapasite artar; ▼ = azalır.`}</div>`;
  }

  // Altbilgi (onay şeridi) içeriği — İKİ yerde kullanılır: (1) tfoot içinde GÖRÜNMEZ kopya
  // → her sayfada gerçek yükseklikte alan REZERVE eder (içerik binmez, iç-içe tablolarda da);
  // (2) position:fixed görünür kopya → her sayfanın FİZİKSEL altına oturur (son sayfada ortada
  // kalmaz). @page margin bu render hattında güvenilmez olduğundan rezervasyon tfoot'la yapılır.
  const altbilgiIc = `<div class="onay-serit">
    <div class="onay-kutu"><div><span class="ok-et">${esc(L.thImza[0])}</span><div class="ok-ad">${esc(meta.hazirlayan) || "&nbsp;"}</div></div><div class="ok-imza">${esc(L.imzaTarih)}</div></div>
    <div class="onay-kutu"><div><span class="ok-et">${esc(L.thImza[1])}</span><div class="ok-ad">${esc(meta.onaylayan) || "&nbsp;"}</div></div><div class="ok-imza">${esc(L.imzaTarih)}</div></div>
  </div>
  <div class="antet-alt"><span>${esc(meta.sinyalizasyonFirmasi || "RaySim")} · ${esc(meta.projeAdi)}</span><span>${bugun ? esc(bugun) + " · " : ""}${esc(meta.dokumanNo)}</span></div>`;

  return `<!doctype html><html lang="${L.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.dokumanNo)} — ${esc(meta.projeAdi)}</title>
<style>
  /* Site ile AYNI yazı tipleri: gövde Geist (sans), başlıklar Spectral (marka serif),
     sayısal/mono Geist Mono. Rapor ayrı sekmede açıldığından fontlar burada YÜKLENİR
     (yazdırma manuel butonla; tıklanana dek fontlar hazır olur). */
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Spectral:wght@500;600;700&display=swap');
  @page { size: A4; margin: 14mm 15mm 15mm; }
  /* Sayfa numarası — teknik doküman standardı; kapakta gizli (@page:first). */
  @page { @bottom-right { content: counter(page); font-family: "Geist", "Segoe UI", sans-serif; font-size: 8pt; color: #9AA7B4; } }
  @page:first { @bottom-right { content: ""; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Geist", "Segoe UI", system-ui, -apple-system, sans-serif; color: ${INK}; font-size: 10pt; line-height: 1.42; background: #f0f2f4;
    /* Geist yüklenmezse system-ui'ye düşer. Tüm belgede hizalı (lining) rakam zorla. */
    font-variant-numeric: lining-nums; font-feature-settings: "lnum" 1; }
  /* Sayısal yüzeyler: hizalı + tabular (sütunlar dikey hizalanır, rakamlar eşit genişlikte). */
  table, .kpi-v, .kpi-a, .pill, .cover .kunye td, .fig .cap {
    font-variant-numeric: lining-nums tabular-nums; font-feature-settings: "lnum" 1, "tnum" 1; }
  .page { background: #fff; }
  /* Rapor kağıdı DAİMA beyaz. Aksi halde gri gövde (body) arkadan görünür; sayfalama
     boşlukları gri açığa çıkar ("altı gri / 2. sayfa eksik" görüntüsü). */
  .sheet { background: #fff; }
  @media screen { .sheet { max-width: 800px; margin: 24px auto; box-shadow: 0 4px 24px rgba(12,34,51,.14); padding: 40px 46px; } }
  @media print {
    /* Yazdırmada gövde de beyaz olmalı: print-color-adjust:exact gri gövdeyi
       boşluklarda BASAR. Sayfa daima beyaz zeminde. */
    html, body { background: #fff !important; }
    .sheet { padding: 0; background: #fff; } .noprint { display: none !important; }
    /* Tarayıcılar yazdırmada arka plan renklerini varsayılan olarak atar; koyu başlık
       şeritleri, KPI kutuları, tablo başlıkları ve renkli grafik dolguları basılsın diye zorla. */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2, h3, h4 { font-family: "Geist", "Segoe UI", system-ui, sans-serif; margin: 0; }
  p { margin: 0 0 8px; }
  .muted { color: #6B7A8A; }

  /* Araç çubuğu (ekranda) */
  .bar { position: sticky; top: 0; z-index: 10; background: ${INK}; color: #fff; display: flex; gap: 12px; align-items: center; padding: 10px 18px; font-family: system-ui, sans-serif; }
  .bar b { font-size: 13px; letter-spacing: .04em; }
  .bar .sp { flex: 1; }
  .bar button { background: ${RED}; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: system-ui, sans-serif; }
  .bar .hint { font-size: 11px; opacity: .8; font-family: system-ui, sans-serif; }

  /* Kapak — TEK SAYFAYA sığacak şekilde sıkıştırıldı (aksi halde son satır taşıp
     2. sayfaya düşüyor = boş 2. sayfa). Kapak kendi başına bir sayfadır. */
  .cover { text-align: center; padding: 6px 0 2px; page-break-after: avoid; }
  .cover .emblem { display: inline-block; }
  .cover .emblem svg { width: 66px; height: 66px; }
  /* Kapak marka hiyerarşisi (opt.3): ANA MARKA = firma (büyük); RaySim = küçük alt rozet. */
  .cover-brand { margin: 6px 0 2px; line-height: 0; }
  .cover-brand svg { height: 17mm; width: auto; display: inline-block; }
  .cover-brand-name { font-size: 20pt; font-weight: 700; letter-spacing: .04em; color: ${INK}; }
  .poweredby { margin-top: 9px; display: flex; align-items: center; justify-content: center; gap: 7px; }
  .poweredby .pb-emblem { line-height: 0; }
  .poweredby .pb-emblem svg { height: 7mm; width: auto; }
  .poweredby .pb-txt { font-size: 8.5pt; color: #8A97A4; letter-spacing: .02em; }
  .poweredby .pb-txt b { font-family: "Spectral", Georgia, serif; font-weight: 700; letter-spacing: .06em; color: #6B7A8A; }
  .poweredby .pb-txt .r { color: ${RED}; }
  .cover .rule { width: 56px; height: 3px; background: ${RED}; margin: 12px auto 14px; }
  .cover .sys { font-size: 14pt; letter-spacing: .28em; color: ${INK}; font-weight: 600; }
  .cover .kit { font-size: 22pt; letter-spacing: .05em; color: ${INK}; font-weight: 700; margin: 3px 0 14px; }
  .cover .proje { font-size: 16pt; color: ${INK}; font-weight: 600; }
  .cover .hat { font-size: 12.5pt; color: #6B7A8A; margin-top: 4px; }
  .cover table { margin: 16px auto 0; width: 76%; }
  .cover td { text-align: left; padding: 3px 10px; }
  .kunye td.k { font-weight: 600; color: ${INK}; width: 40%; background: #F5F7F9; }
  /* Doküman kontrol bloğu — künye çerçeveli kutu + üstünde etiket (mühendislik standardı). */
  .cover .kunye { border: 1pt solid #D3DAE1; }
  .cover .kunye td { border-bottom: 1px solid #EDF0F3; }
  .cover table.kunye { margin-top: 12px; }
  .cover .foot { margin-top: 9px; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #9AA7B4; }
  .cover .qr { margin-top: 9px; }
  .cover .qr svg { border: 1px solid #E6E9ED; padding: 4px; background: #fff; }
  .cover .qr-cap { font-size: 8pt; color: #6B7A8A; margin-top: 5px; line-height: 1.35; }
  .cover .qr-cap b { color: ${INK}; font-weight: 600; }
  .cover .qr-hint { color: ${GOLD}; font-weight: 600; }
  .brandmark { font-family: "Spectral", Georgia, serif; font-weight: 700; letter-spacing: .12em; color: ${INK}; font-size: 12pt; }
  .brandmark .r { color: ${RED}; }

  /* Bölüm banzı — her numaralı bölüm YENİ SAYFADA başlar (başlık sayfa dibinde
     stranded kalmaz), banner kendi içeriğinden koparılmaz, üst boşluk sıfır. */
  /* Bölüm başlığı — dolgusuz "spec header": ince altın kural + numara + tracked büyük
     harf. Kurumsal mühendislik/şartname hissi (dolu koyu şerit "AI slaytı" görünümü kaldırıldı). */
  .banner { color: ${INK}; padding: 0 0 5px; margin: 2px 0 15px; border-bottom: 1.5pt solid ${GOLD};
    font-size: 11.5pt; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
    page-break-before: always; page-break-after: avoid; }
  .banner .no { color: ${GOLD}; font-weight: 700; margin-right: 3px; font-variant-numeric: tabular-nums; }
  .banner .no::after { content: " ·"; color: ${INK}; opacity: .35; }
  h3.sub { color: ${INK}; font-size: 10.5pt; font-weight: 600; letter-spacing: .03em; margin: 16px 0 7px; padding-left: 9px; border-left: 2.5pt solid ${GOLD}; page-break-after: avoid; }
  /* İçindekiler (teknik doküman standardı) — spec-header'la aynı dil. */
  .toc-h { color: ${INK}; padding: 0 0 5px; margin: 2px 0 16px; border-bottom: 1.5pt solid ${GOLD}; font-size: 11.5pt; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; }
  .toc-list { list-style: none; margin: 0; padding: 0; font-size: 10.5pt; }
  .toc-list > li { padding: 7px 0; border-bottom: 1px solid #EDF0F3; }
  .toc-list > li > b { color: ${GOLD}; margin-right: 12px; font-variant-numeric: tabular-nums; }
  .toc-list ul { list-style: none; margin: 4px 0 0 40px; padding: 0; font-size: 9.5pt; color: #55636F; }
  .toc-list ul li { padding: 2px 0; }
  .toc-fig { margin: 22px 0 0; font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color: ${GOLD}; font-weight: 700; }
  .toc-fig ul { list-style: none; margin: 8px 0 0; padding: 0; font-size: 9.5pt; letter-spacing: 0; text-transform: none; color: #55636F; font-weight: 400; }
  .toc-fig ul li { padding: 2px 0; }

  /* Tablolar — uzun tablolar sayfalar arası BÖLÜNEBİLİR (aksi halde toptan bir
     sonraki sayfaya itilip önceki sayfada büyük boşluk/kayma bırakırlar). Satırlar
     bölünmez; başlık satırı her yeni sayfada tekrarlanır. */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: ${INK}; color: #fff; font-weight: 600; text-align: center; padding: 5px 8px; border: 1px solid ${INK}; }
  td { padding: 3.5px 8px; border: 1px solid #DCE1E7; text-align: center; }
  th.l, td.l { text-align: left; }
  tbody tr:nth-child(even) td { background: #F5F7F9; }
  /* Durum etiketi — köşeli (2px) teknik rozet; nötr zemin, dolu renk yalnız ihlalde. */
  .pill { display: inline-block; padding: 1px 7px; border-radius: 2px; font-size: 8pt; font-weight: 700; letter-spacing: .03em; color: #fff; }
  .pill.ok { background: #EEF2F5; color: #3B6B54; } .pill.bad { background: ${RED}; }

  /* Matriks */
  .matris td.mx { font-weight: 700; width: 34px; }
  .matris td.yes { color: #0E7C57; } .matris td.no { color: ${RED}; } .matris td.diag { color: #9AA7B4; }
  .matris-etiket { font-size: 9.5pt; font-weight: 600; margin-top: 4px; }
  .mx-leg { font-weight: 400; color: #6B7A8A; margin-left: 8px; }
  .mx-leg .yes { color: #0E7C57; font-weight: 700; } .mx-leg .no { color: ${RED}; font-weight: 700; }

  /* KPI */
  .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 6px 0 14px; }
  .kpi { border: 1px solid #E4E8EC; border-radius: 2px; padding: 10px 12px; background: #fff; }
  .kpi-l { font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; color: #6B7A8A; }
  .kpi-v { font-size: 18pt; font-weight: 700; line-height: 1.1; margin: 2px 0; }
  .kpi-a { font-size: 9pt; color: #9AA7B4; }

  .fig { margin: 6px 0 16px; text-align: center; page-break-inside: avoid; }
  .fig .cap { font-size: 8.5pt; color: #6B7A8A; margin-top: 4px; }

  /* Tornado (duyarlılık) — satır içi yatay çubuk: parametre ±%20 oynayınca metriğin
     aldığı aralık; dikey çizgi = mevcut tasarım değeri. Çubuk hücreye gömülü konumlanır. */
  .tor-tbl { table-layout: fixed; }
  .tor-tbl td { vertical-align: middle; }
  .tor-tbl td.trk-td { padding: 4px 8px; }
  .tor .trk { position: relative; height: 13px; background: #EEF2F5; border-radius: 2px; }
  .tor .barr { position: absolute; top: 2px; height: 9px; background: ${GOLD}; border-radius: 1px; }
  .tor .base { position: absolute; top: -2px; height: 17px; width: 1.5px; background: ${INK}; }

  /* Ring detayları uzun olabildiğinden (kısıt tablosu + challenge listesi) sayfalar
     arası bölünebilir; başlık bir sonraki içerikten koparılmaz. */
  .ring-detay { page-break-inside: auto; margin-bottom: 14px; }
  .ring-detay h4, .bolge h4 { color: ${INK}; font-size: 11pt; margin: 12px 0 4px; page-break-after: avoid; }
  ul.ch { margin: 4px 0 8px; padding-left: 18px; font-size: 9.5pt; }
  ul.ch li.krit { color: ${RED}; }
  /* Girdi→Sonuç notu — "siz bunları girdiniz → bu sonuç" (şık altın kart). */
  /* TEK sade not (callout) sistemi — nötr açık zemin + ince altın sol kural, keskin köşe.
     Krem/yeşil dolu kutular kaldırıldı (renklilik azaltıldı, kurumsal). */
  .gs { margin: 7px 0 9px; padding: 7px 11px; border: 1px solid #E4E8EC; border-left: 3px solid ${GOLD};
    border-radius: 2px; background: #F7F9FA; font-size: 9.5pt; line-height: 1.5; color: ${INK}; page-break-inside: avoid; }
  .gs.ok { border-left-color: #2E7D57; }
  /* Bağımsız çekirdek doğrulama satırı (onayın hemen üstünde, kurumsal). */
  .cekirdek { margin: 16px 0 4px; padding-top: 8px; border-top: 1px solid #D8DEE5; text-align: center;
    font-size: 9.5pt; letter-spacing: .01em; color: #55636F; page-break-inside: avoid; }
  .bolge { page-break-inside: avoid; margin-bottom: 16px; }

  .imza { margin-top: 20px; }
  .imza td { height: 54px; vertical-align: top; }
  /* Sayfa geçişi doğrudan başlığa uygulanır (ayrı boş <div> bazı tarayıcılarda
     fazladan BOŞ SAYFA üretiyordu). Sayfa üstündeki fazladan boşluk da sıfırlanır. */
  .breakbefore { page-break-before: always; }
  .banner.breakbefore { margin-top: 0; }

  /* Şirket anteti — SAYFA AKIŞINDA tekrarlanan başlık/altbilgi (table-header-group /
     table-footer-group). position:fixed KULLANILMAZ: fixed, baskıda içerik kutusuna
     göre konumlanıp 1. bölüm banner'ına biniyordu. Bu yapı tüm tarayıcıların
     "PDF olarak kaydet"inde çakışmasız, her sayfada tekrarlanır. */
  .pageframe { width: 100%; border-collapse: collapse; }
  /* Çerçeve tablosunun kendi hücreleri GENEL td/th stillerinden (padding/kenar/zebra)
     muaf — yalnız düzen taşıyıcısı. İçteki gerçek tablolar normal stillenir. */
  .pageframe > thead > tr > td, .pageframe > tfoot > tr > td, .pageframe > tbody > tr > td {
    padding: 0 !important; border: 0 !important; background: transparent !important; text-align: left; }
  thead.antet-head { display: table-header-group; }
  tfoot.antet-foot { display: table-footer-group; }
  .antet-ust { display: flex; justify-content: space-between; align-items: center; gap: 6mm;
    border-bottom: 1.4pt solid ${GOLD}; padding-bottom: 1.8mm; margin-bottom: 7mm; font-size: 8pt; }
  .antet-ust .firma { font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${INK};
    min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .antet-ust .firma-logo { display: block; flex: 0 0 auto; line-height: 0; }
  .antet-ust .firma-logo svg { height: 8mm; width: auto; display: block; }
  .antet-ust .dok { flex: 0 0 auto; white-space: nowrap; font-variant-numeric: tabular-nums; color: #6B7A8A; }
  .antet-alt { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm;
    border-top: .75pt solid #DCE1E7; padding-top: 1.4mm; margin-top: 2.5mm; font-size: 7.5pt; color: #6B7A8A; }
  /* Onay şeridi — HER sayfa altbilgisinde (title-block): imza kutuları. Ayrı "Onay" bölümü
     yerine geçer; kompakt tutulur ki içerik alanını daraltıp taşma/sıkışma yapmasın. */
  /* Altbilgi (onay şeridi) HER sayfanın FİZİKSEL altına sabit: son sayfada da ortada
     kalmaz. @page bottom margin (26mm) ayrılan bölgeye oturur; içerik binmez. Ekranda
     gizli (önizleme yalnız içeriktir; şerit PDF'te görünür). */
  /* Boş tfoot HER sayfada alt boşluğu REZERVE eder (içerik footer'a binmez); görünen
     onay şeridi ise .sayfa-alt olarak position:fixle her sayfanın altına sabitlenir. */
  .onay-serit { display: flex; gap: 5mm; margin-top: 3.5mm; }
  .onay-kutu { flex: 1; border: .75pt solid #C9D2DA; border-radius: 2px; padding: 1.2mm 2.4mm; min-height: 8mm;
    display: flex; flex-direction: column; justify-content: space-between; }
  .onay-kutu .ok-et { font-size: 6.5pt; letter-spacing: .12em; text-transform: uppercase; color: ${GOLD}; font-weight: 700; }
  .onay-kutu .ok-ad { font-size: 8pt; color: ${INK}; font-weight: 600; margin-top: .4mm; }
  .onay-kutu .ok-imza { font-size: 6.5pt; color: #9AA7B4; border-top: .5pt dotted #C9D2DA; padding-top: .8mm; margin-top: 1.4mm; }
  /* tfoot içindeki kopya GÖRÜNMEZ ama yükseklik verir (alan rezervi); görünür kopya (.sayfa-alt)
     ekranda gizli, baskıda her sayfanın fiziksel altına sabit. */
  /* padding-top: görünür footer (bottom:8mm) rezerve alanın biraz üstüne taştığından, spacer'a
     ek pay verilir → son satır footer'a değmez. */
  .alt-spacer { visibility: hidden; padding-top: 9mm; }
  @media screen { .sayfa-alt { display: none; } }
  @media print { .sayfa-alt { position: fixed; left: 15mm; right: 15mm; bottom: 8mm; background: #fff; } }
  .antet-alt span:first-child { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .antet-alt span:last-child { flex: 0 0 auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
  /* Ekranda antet üst/alt görünür (önizleme). Araç çubuğu zaten .bar. */
</style></head>
<body>
<div class="bar noprint">
  <b class="brandmark">Ray<span class="r">Sim</span> · ${L.barTitle}</b>
  <span class="hint">${esc(L.barHint)}</span>
  <span class="sp"></span>
  <button onclick="window.print()">${L.barBtn}</button>
</div>
<div class="sheet">
<!-- Görünür onay şeridi: her sayfanın FİZİKSEL altına sabit. -->
<div class="sayfa-alt">${altbilgiIc}</div>
<!-- Sayfa çerçevesi: antet üst (thead) her sayfada tekrarlanır; tfoot içindeki GÖRÜNMEZ
     onay kopyası her sayfada altbilgi kadar alan REZERVE eder → içerik (uzun/iç-içe tablolar
     dâhil) footer'a binmez. Görünür kopya yukarıda position:fixle basılır. -->
<table class="pageframe"><thead class="antet-head"><tr><td>
  <div class="antet-ust">${antetSol}<span class="dok">${esc(meta.dokumanNo)}${meta.revizyon ? " · " + esc(meta.revizyon.split("—")[0].trim()) : ""}</span></div>
</td></tr></thead><tfoot class="antet-foot"><tr><td>
  <div class="alt-spacer" aria-hidden="true">${altbilgiIc}</div>
</td></tr></tfoot><tbody><tr><td>

  <!-- KAPAK — ANA MARKA = sinyalizasyon firması (büyük). RaySim, altta küçük
       "Powered by" rozetine indirgenir (araç/motor kimliği). -->
  <section class="cover">
    <div class="cover-brand">${firmaAsls ? aslsLogoSvg : `<span class="cover-brand-name">${esc(meta.sinyalizasyonFirmasi || "")}</span>`}</div>
    <div class="rule"></div>
    <div class="sys">${L.sys}</div>
    <div class="kit">${L.kit}</div>
    <div class="proje">${esc(meta.projeAdi)}</div>
    <div class="hat">${esc(meta.hatAdi)}</div>
    <table class="kunye"><tbody>${kunye.map(([a, b]) => `<tr><td class="l k">${esc(a)}</td><td class="l">${esc(b)}</td></tr>`).join("")}</tbody></table>
    <div class="qr">${qrSvg(qrHedef, 92)}<div class="qr-cap"><b>${derinLink ? L.qrCap : L.qrCapGenel}</b><br><span class="qr-hint">${L.qrHint}</span> · ${esc(qrHost)}</div></div>
    <div class="poweredby"><span class="pb-emblem">${emblemSvg}</span><span class="pb-txt">Powered by <b>Ray<span class="r">Sim</span></b></span></div>
    <div class="foot">${esc(L.foot)}${bugun ? " · " + esc(bugun) : ""}</div>
  </section>

  <!-- İÇİNDEKİLER -->
  <section class="toc breakbefore">
    <div class="toc-h">${L.toc}</div>
    <ol class="toc-list">
      <li><b>01</b>${L.s1}</li>
      <li><b>02</b>${L.s2}<ul><li>2.1 ${en ? "Per-cell Constraint Analysis" : "Ring Bazında Kısıt Analizi"}</li></ul></li>
      <li><b>03</b>${en ? "Signalling — Signal Lamps (SG)" : "Sinyalizasyon — Sinyal Lambaları (SG)"}</li>
      <li><b>04</b>${L.s4}<ul><li>4.1 Blocking-Time (Sperrzeitentreppe)</li></ul></li>
      <li><b>05</b>${en ? "Operations & Demand Analysis" : "İşletme & Talep Analizi"}<ul>
        <li>5.1 ${en ? "Passenger Load Profiles" : "Yolcu Yük Profilleri"}</li>
        <li>5.2 ${en ? "Depot Dispatch" : "Depo Çıkışı"}</li>
        <li>5.3 ${en ? "Stops Needing Turnback" : "Dönüşe İhtiyaç Duyan Duraklar"}</li>
        <li>5.4 ${en ? "Reverse-Running Variations" : "Ters İşletme Varyasyonları"}</li>
        <li>5.5 ${en ? "Fleet & Recommendation" : "Filo & Öneri"}</li></ul></li>
      <li><b>06</b>${en ? "Timetable (Service Schedule)" : "Tarife (Zaman Çizelgesi)"}<ul><li>6.1 ${en ? "First Departures" : "İlk Kalkışlar"}</li></ul></li>
      <li><b>07</b>${en ? "Sensitivity (Tornado)" : "Duyarlılık (Tornado)"}</li>
    </ol>
    <div class="toc-fig">${en ? "Figures" : "Şekiller"}<ul>
      <li>${en ? "Fig. 1 — Line schematic" : "Şekil 1 — Hat şeması"}</li>
      <li>${en ? "Fig. 2 — Energy-distance" : "Şekil 2 — Enerji-mesafe"}</li>
      <li>${en ? "Fig. 3 — Time-distance (Bildfahrplan)" : "Şekil 3 — Zaman-mesafe (Bildfahrplan)"}</li>
      <li>${en ? "Fig. 4 — Sperrzeitentreppe" : "Şekil 4 — Sperrzeitentreppe"}</li>
      <li>${en ? "Fig. 5 — Blocking-time components" : "Şekil 5 — Blocking-time bileşenleri"}</li></ul></div>
  </section>

  <!-- 1 -->
  <div class="banner breakbefore"><span class="no">01</span>${L.s1}</div>
  <p>${L.s1i}</p>
  ${kpiRow}
  ${tbl(L.thParam, paramRows, { first: true })}

  <!-- 2 -->
  <div class="banner"><span class="no">02</span>${L.s2}</div>
  <p>${L.s2i(rings.length, cfg.headway)}</p>
  <div class="fig">${ringSemaSvg(rings)}<div class="cap">${L.fig1}</div></div>
  ${energyFig}
  ${tbl(L.thRing, ringRows, { first: true })}
  <h3 class="sub" style="page-break-before:always">${sunum ? (lang === "en" ? "2.1 Per-cell Constraint Analysis" : "2.1 Ring Bazında Kısıt Analizi") : L.s21}</h3>
  ${ringDetay}

  <!-- 3: Sinyalizasyon -->
  ${sinyalBolum}

  <!-- 4 -->
  <div class="banner"><span class="no">04</span>${L.s4}</div>
  <p>${L.s4i}</p>
  ${kapasiteTbl}
  ${kapGirdiNot}
  ${sunum ? `<div class="gs ok"><b style="color:#2E7D57">✓</b> ${lang === "en" ? `Capacity analysis confirms that all blocks remain within the target headway (${cfg.headway} s); no limit is exceeded. The design is compliant in terms of capacity.` : `Kapasite analizi, tüm blokların hedef headway (${cfg.headway} s) sınırı içinde kaldığını göstermektedir; sınır aşımı bulunmamaktadır. Tasarım, kapasite açısından uygundur.`}</div>` : ""}
  <p class="muted" style="font-size:11px;margin-top:6px">${L.kapNot}</p>
  <div class="gs" style="font-size:10pt">${kapYorum}</div>
  ${kisitFig}
  <h3 class="sub">${lang === "en" ? "Terminal Turnback Capacity" : "Terminal Turnback Kapasitesi"}</h3>
  ${turnbackTblStr}
  ${hemzeminFig}
  ${bfFig}
  ${hizFig}
  <h3 class="sub">${L.s41}</h3>
  <div class="fig">${line ? sperrzeitSvg(bt, line.length, kritikRenk, en) : ""}<div class="cap">${sunum ? (lang === "en" ? `Figure 4 — Sperrzeitentreppe: block occupation (blocking-time) windows; min headway ${Math.round(bt.minHeadway)}s.` : `Şekil 4 — Sperrzeitentreppe: blok işgal (blocking-time) pencereleri; min headway ${Math.round(bt.minHeadway)} s.`) : L.fig4(Math.round(bt.minHeadway))}</div></div>
  <div class="fig">${blockingBarSvg(bt.bloklar, bt.kritikBlok, kritikRenk, en)}<div class="cap">${sunum ? (lang === "en" ? "Figure 5 — Per-block blocking-time component distribution (determining block highlighted)." : "Şekil 5 — Blok başına blocking-time bileşen dağılımı (belirleyici blok vurgulu).") : L.fig5}${bt.bloklar.length > 16 ? (lang === "en" ? ` (highest 16 of ${bt.bloklar.length} blocks; full list in the table below)` : ` (${bt.bloklar.length} bloktan en yüksek 16'sı; tümü aşağıdaki tabloda)`) : ""}</div></div>
  <div class="gs" style="font-size:9pt">${L.btTanim}</div>
  ${btTbl}

  <!-- 5: İşletme & Talep Analizi (ters işletme) -->
  ${isletmeBolum}

  ${tarifeBolum}

  ${duyarlilikBolum}

  ${cekirdekNot}

</td></tr></tbody></table>
</div>
</body></html>`;
}
