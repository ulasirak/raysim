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
import { tersIsletmeAnaliz } from "./tersisletme";
import { maksimumTren } from "./kapasite";
import type { RollingStock } from "./types";
import {
  ringSenaryo, ringChallenge, ringKisitDizisi, loopDenge,
  type DurakArasiRing,
} from "./ring";
import { blockingTimeRing } from "./blockingtime";
import { loopToHat } from "./hatsim";
import { simulate } from "./sim";
import { computeEnergy } from "./energy";
import { simulateSignalled } from "./signalling";
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${line}${marks}${dots}${labels}</svg>`;
}

// Blocking-time bileşen barları (gömülü SVG): her blok için yığılı süre (ordinal mavi rampa).
function blockingBarSvg(bloklarTum: { i: number; makasBlok?: boolean; tSetup: number; tSighting: number; tApproach: number; tRunning: number; tClearing: number; tRelease: number; toplam: number }[], kritik: number, kritikRenk: string = CK.red): string {
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
    { k: "tSetup", c: RAMP_BLUE[0], ad: "Setup" }, { k: "tSighting", c: RAMP_BLUE[1], ad: "Görme" },
    { k: "tApproach", c: RAMP_BLUE[2], ad: "Yaklaşma" }, { k: "tRunning", c: RAMP_BLUE[3], ad: "Seyir" },
    { k: "tClearing", c: RAMP_BLUE[4], ad: "Temizleme" }, { k: "tRelease", c: RAMP_BLUE[5], ad: "Release" },
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${rows}${legend}</svg>`;
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

// Zaman-mesafe diyagramı / Bildfahrplan (gömülü SVG): ÇİFT YÖN — gidiş + dönüş.
// Ters eğimli çizgiler kesişince = kruvasman / karşılaşma noktası.
function bildfahrplanSvg(line: Line, stock: RollingStock, cfg: SimConfig, count: number, sinyaller: number[] = []): string {
  if (line.length <= 0) return "";
  const rev = reverseLineOf(line);
  // GERÇEK sinyaller blok sınırıdır (canlı sim ile birebir); ters yönde konum aynalanır.
  const up = simulateSignalled(line, stock, { headway: cfg.headway, count, maxBlockLen: cfg.blokMaxUzunluk, sinyaller });
  const dn = simulateSignalled(rev, stock, { headway: cfg.headway, count, maxBlockLen: cfg.blokMaxUzunluk, sinyaller: sinyaller.map((p) => line.length - p) });
  const L = line.length, tMax = Math.max(1, up.tMax, dn.tMax);
  // Yükseklik durak sayısına göre BÜYÜR → 29 durakta bile adlar üst üste binmez;
  // uzun adlar için sol boşluk (padL) geniş, etiket fontu duraklaşınca küçülür.
  const nist = line.stations.length;
  // padT geniş → renk göstergesi (legend) PLOT'un ÜSTÜNDE, ayrı bir bantta durur;
  // üstteki durak çizgileriyle/adlarıyla ÇAKIŞMAZ (her çok-duraklı hatta güvenli).
  const W = 820, H = Math.max(262, nist * 13 + 80), padL = 108, padR = 14, padT = 32, padB = 28;
  const lblFont = nist > 22 ? 7 : (nist > 14 ? 7.5 : 8.5);
  const pw = W - padL - padR, ph = H - padT - padB;
  const xOf = (t: number) => padL + (t / tMax) * pw;
  const yOf = (s: number) => padT + (s / L) * ph; // s=0 üstte, s=L altta
  // Durak çizgileri gerçek konumda; ETİKETLER dikeyde DECLUTTER edilir: çok yakın iki
  // ad (ör. hattın başındaki iki durak) asgari boşluğa itilir ve gerçek konuma ince bir
  // leader ile bağlanır → hiçbir çok-duraklı hatta üst üste binme olmaz.
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
  const tg = Array.from({ length: 7 }).map((_, i) => {
    const t = (tMax * i) / 6, x = xOf(t);
    return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="${CK.grid}" opacity="0.6"/>${num(x, H - 8, `${Math.round(t / 60)}′`, { anchor: "middle", size: 8 })}`;
  }).join("");
  const trainLine = (pts: string, col: string, delayed: boolean) =>
    `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.92"${delayed ? ' stroke-dasharray="4 3"' : ""}/>`;
  const upLines = up.trains.map((tr) => trainLine(tr.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.s).toFixed(1)}`).join(" "), CK.blue, tr.delay > 2)).join("");
  const dnLines = dn.trains.map((tr) => trainLine(tr.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(L - p.s).toFixed(1)}`).join(" "), CK.orange, tr.delay > 2)).join("");
  // Legend ÜST BANTTA (y=13 < padT=32) → plot ve durak çizgilerinin üstünde, çakışmasız.
  const leg = `<text x="${W - padR}" y="13" text-anchor="end" font-family="${CK.sans}" font-size="8.5"><tspan fill="${CK.blue}">▬ gidiş</tspan>  <tspan fill="${CK.orange}">▬ dönüş</tspan>  <tspan fill="${CK.muted}">╌ gecikmeli</tspan></text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${tg}${st}${upLines}${dnLines}${leg}</svg>`;
}

// Gerçek Sperrzeitentreppe (gömülü SVG): iki ardışık tren + her bloğun blocking-time
// dikdörtgeni. Kritik blokta ikinci trenin başlangıcı birincinin bitişine DEĞER = min headway.
function sperrzeitSvg(bt: ReturnType<typeof blockingTimeRing>, L: number, kritikRenk: string = CK.red): string {
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${yTicks}${rects.join("")}${traj(0, CK.blue)}${traj(h, CK.orange)}${hMark}${lab(padL, H - 8, "zaman (s) →", { size: 8.5 })}${lab(8, padT + 4, "m", { size: 8.5 })}</svg>`;
}

// Enerji-mesafe (gömülü SVG): kümülatif çekiş enerjisi (kWh) vs mesafe.
function energyGradeSvg(line: Line, stock: RollingStock): { svg: string; net: number; perKm: number } {
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
  const lblSvg = `${lab(8, topTop + 8, "kWh", { size: 8 })}${lab(W - padR, topTop + topH + 16, "mesafe (m) →", { anchor: "end", size: 8 })}`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px"><defs>${areaGrad("g-en", CK.orange, 0.2)}</defs>${st}${yTicks}${base}${eArea}${ePoly}${lblSvg}</svg>`;
  return { svg, net: en.netKWh, perKm: en.perKm };
}

export type RaporDil = "tr" | "en";

function rDil(lang: RaporDil) {
  const tr = {
    htmlLang: "tr", barTitle: "Rapor",
    barHint: 'Yazdır diyalogunda "Hedef: PDF olarak kaydet"i seçin.',
    barBtn: "⭳ PDF olarak kaydet / Yazdır",
    sys: "SİNYALİZASYON SİSTEMİ", kit: "TASARIM EL KİTABI",
    foot: "Kontrollü doküman", dockontrol: "Doküman Kontrol",
    qrCap: "Canlı simülasyon",
    kunye: { proje: "Proje", hat: "Hat", dok: "Doküman No", rev: "Revizyon", tarih: "Tarih", idare: "İdare", yuk: "Yüklenici", mus: "Müşavir", firma: "Sinyalizasyon Firması" },
    kpi: { hucre: "Durak arası hücre", hedef: "Hedef headway", sigan: "Headway'de sığan tren", kapasite: "Teorik kapasite", pratik: "İşletme kapasitesi", uic: "UIC 406 doluluk", ch: "Challenge / kritik" },
    altMakas: (n: number) => `${n} makas`, altTumu: "tümü uygun", altIhlal: "ihlal var", altTur: (s: string) => `tur ${s}`, altTph: "tren/saat", altUygun: "uygun", altIhlalK: "ihlal", altRisk: "risk kaydı",
    s1: "Kapasite Sonucu ve Parametreler", s1i: "Hattın azami tramvay kapasitesi ve belirleyici kısıtlar; sinyalizasyon, makas tip/sayıları, istasyon duruş süreleri, terminal dönüşü, hemzemin geçitler ve araç dinamiği parametrelerinden hesaplanmıştır.",
    thParam: ["Parametre", "Değer", "Etkisi"],
    s2: "Durak Arası İşletim Hücreleri", s2i: (n: number, h: number) => `Hat, ${n} durak-arası hücreye (ring) ayrılmıştır; her hücre kendi mesafe, makas, hemzemin geçit ve tehlike noktası şartlarını taşır (hedef aralık ${h} s).`,
    fig1: "Şekil 1 — Hat şeması: istasyon zinciri, makas (⑂) ve hemzemin geçit dağılımı.",
    figEnergy: (net: number, perKm: number) => `Şekil 2 — Enerji-mesafe: kümülatif çekiş enerjisi. Net ${net.toFixed(1)} kWh · ${perKm.toFixed(2)} kWh/km.`,
    gClimb: "tırmanış", gDescent: "iniş", gGrade: "eğim", gNoElev: "Yükseklik verisi girilmedi — düz profil varsayıldı", mUnit: "m",
    fig3: (c: number, h: number) => `Şekil 3 — Zaman-mesafe diyagramı (Bildfahrplan): gidiş (mavi) + dönüş (turuncu), ${c}+${c} tren, ${h} s aralık.`,
    thRing: ["No", "Durak Arası", "Mesafe (m)", "Worst (m)", "Makas", "Hemzemin", "Tehlike", "Worst Toplam", "Headway"],
    s21: "2.1 Ring Bazında Kısıt ve Risk (Challenge) Analizi",
    thKisit: ["Kısıt", "Kilometraj", "Detay"], noKisit: "Kısıt yok — kesintisiz seyir.",
    pillOk: "UYGUN", pillBad: "İHLAL",
    s4: "Kapasite ve Blocking-Time Analizi", s4i: "Minimum tren aralığını (headway), en yüksek blocking-time'lı blok belirler.",
    thGost: ["Gösterge", "Değer"],
    kapTur: "Tur süresi (worst-case seyir)", kapDonus: "Dönüş bekleme (tur başına)", kapCevrim: "Çevrim süresi (dönüş bekleme dâhil)", kapHedef: "Hedef headway", kapSigan: "Headway'de gereken tren", kapDarbogaz: "Darboğaz hücre", kapDenge: "Denge (eşit şartlar)", kapDengeli: "Dengeli", kapSapma: (p: string) => `%${p} sapma`, kapMin: "Minimum headway (kritik blok)", kapTeorik: "Teorik kapasite (tamponsuz üst sınır)", kapPratik: "İşletme kapasitesi (UIC 406 doluluk tavanı)", kapUIC: "UIC 406 doluluk (hedef headway'de)", tphSuffix: "tren/saat",
    kapNot: "Teorik kapasite tamponsuz üst sınırdır; işletme kapasitesi UIC 406 doluluk tavanıyla sürdürülebilir değeri verir.",
    s41: "3.1 Blocking-Time (Sperrzeitentreppe)",
    fig4: (h: number) => `Şekil 4 — Sperrzeitentreppe: blok işgal (blocking-time) pencereleri; min headway ${h} s.`,
    fig5: "Şekil 5 — Blok başına blocking-time bileşen dağılımı (kritik blok kırmızı etiketli).",
    thBt: ["Blok", "Setup", "Görme", "Yaklaşma", "Seyir", "Temizleme", "Release", "Toplam (s)"],
    s5: "Onay", thImza: ["Hazırlayan", "Onaylayan"], imzaTarih: "İmza / Tarih",
  };
  const en: typeof tr = {
    htmlLang: "en", barTitle: "Report",
    barHint: 'In the print dialog, choose "Destination: Save as PDF".',
    barBtn: "⭳ Save as PDF / Print",
    sys: "SIGNALLING SYSTEM", kit: "DESIGN HANDBOOK",
    foot: "Controlled document", dockontrol: "Document Control",
    qrCap: "Live simulation",
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
    thKisit: ["Constraint", "Chainage", "Detail"], noKisit: "No constraints — uninterrupted run.",
    pillOk: "OK", pillBad: "VIOLATION",
    s4: "Capacity and Blocking-Time Analysis", s4i: "The minimum train interval (headway) is set by the block with the highest blocking-time.",
    thGost: ["Indicator", "Value"],
    kapTur: "Running time (worst-case)", kapDonus: "Turnaround (per cycle)", kapCevrim: "Cycle time (incl. turnaround)", kapHedef: "Target headway", kapSigan: "Trains required", kapDarbogaz: "Bottleneck cell", kapDenge: "Balance (equal conditions)", kapDengeli: "Balanced", kapSapma: (p) => `${p}% deviation`, kapMin: "Minimum headway (critical block)", kapTeorik: "Theoretical capacity (buffer-free upper bound)", kapPratik: "Operating capacity (UIC 406 occupancy ceiling)", kapUIC: "UIC 406 occupancy (at target headway)", tphSuffix: "trains/hour",
    kapNot: "Theoretical capacity is the buffer-free upper bound; operating capacity applies the UIC 406 occupancy ceiling to give the sustainable figure.",
    s41: "3.1 Blocking-Time (Sperrzeitentreppe)",
    fig4: (h) => `Figure 4 — Sperrzeitentreppe: block occupation (blocking-time) windows; min headway ${h}s.`,
    fig5: "Figure 5 — Per-block blocking-time component breakdown (critical block labelled red).",
    thBt: ["Block", "Setup", "Sighting", "Approach", "Running", "Clearing", "Release", "Total (s)"],
    s5: "Approval", thImza: ["Prepared by", "Approved by"], imzaTarih: "Signature / Date",
  };
  return lang === "en" ? en : tr;
}

export function raporHTML(meta: ProjeMeta, cfg: SimConfig, rings: DurakArasiRing[], stock: RollingStock, lang: RaporDil = "tr", filo = 0, isletme: Isletme = varsayilanIsletme): string {
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
  // Bildfahrplan gerçek filoyla çizilir (okunabilirlik için görselde en çok 8 iz; gerçek
  // sayı altyazıda). Bloklar GERÇEK sinyallerden gelir → grafik canlı sistemle tutarlı.
  const bfCount = Math.max(3, Math.min(8, filoGercek));
  const eg = line ? energyGradeSvg(line, stock) : null;
  const energyFig = eg && eg.svg ? `<div class="fig">${eg.svg}<div class="cap">${L.figEnergy(eg.net, eg.perKm)}</div></div>` : "";
  const bfFazla = filoGercek > bfCount ? (lang === "en" ? ` (showing ${bfCount} of ${filoGercek} trains)` : ` (${filoGercek} trenin ${bfCount} tanesi çiziliyor)`) : "";
  const bfFig = line ? `<div class="fig">${bildfahrplanSvg(line, stock, cfg, bfCount, sinyaller)}<div class="cap">${L.fig3(bfCount, cfg.headway)}${bfFazla}</div></div>` : "";

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
  // planlanan filo · min headway (darboğaz) · işletme kapasitesi (tren/saat) · UIC 406 doluluk.
  const teorikMaksEt = lang === "en" ? "Theoretical max trams" : "Teorik maks tramvay";
  const surdurEt = lang === "en" ? "Sustainable trams" : "Sürdürülebilir tramvay";
  const minHwEt = lang === "en" ? "Min headway" : "Min headway";
  const kpiRow = `<div class="kpi-row">
    ${kpi(L.kpi.hucre, `${rings.length}`, L.altMakas(rings.reduce((n, r) => n + r.makaslar.length, 0)))}
    ${kpi(teorikMaksEt, `${maks.nTeorik}`, lang === "en" ? "on the line (fit)" : "hatta sığan", INK)}
    ${kpi(surdurEt, `${maks.nSurdurulebilir}`, lang === "en" ? "UIC 406 buffered" : "UIC 406 tamponlu", "#0E7C57")}
    ${kpi(lang === "en" ? "Planned fleet" : "Planlanan filo", `${filoGercek}`, lang === "en" ? `trams in service` : `serviste tramvay`, "#0E7C57")}
    ${kpi(minHwEt, `${s0(maks.hMin)}`, (maks.baglayanAd || "").slice(0, 22) || (headwayUygun ? L.altUygun : L.altIhlalK), (headwayUygun || sunum) ? INK : RED)}
    ${kpi(L.kpi.pratik, `${pratikTph.toFixed(0)}`, `%${((maks.dolulukTavani || 1) * 100).toFixed(0)} · ${L.altTph}`, "#0E7C57")}
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
    bt.bloklar.map((b) => [`#${b.i}${b.makasBlok ? " ⑂" : ""}`, `${b.tSetup}`, `${b.tSighting}`, b.tApproach.toFixed(0), b.tRunning.toFixed(0), b.tClearing.toFixed(0), `${b.tRelease}`, b.toplam.toFixed(0)]), { first: true });

  // Kapasite okuması yorumu — "sığan tren" (filo) ile "işletme kapasitesi" (tavan)
  // farkını gerçek değerlerden açıklar; hattın yedek kapasitesini okur.
  const yedekYuzde = Math.max(0, Math.round(100 - uicDoluluk));
  const kapBol = uicDoluluk <= 100 || sunum;
  const sperrNot = Math.round(bt.minHeadway) < Math.round(maks.hMin)
    ? (en ? ` (operational min headway including critical-station dwell; signalling-block Sperrzeit below: ${Math.round(bt.minHeadway)} s)` : ` (kritik istasyon duruşunu içeren operasyonel min headway; sinyal-bloğu Sperrzeit'i: ${Math.round(bt.minHeadway)} s)`)
    : "";
  // Kurumsal, otoriter tek satır: belirleyici kısıt + yedek kapasite (öğretmeden/özetlemeden).
  const kapYorum = en
    ? `<b>Determining constraint: ${esc(maks.baglayanAd || "—")}</b> · minimum headway <b>${Math.round(maks.hMin)} s</b>${sperrNot}. At the ${cfg.headway} s target headway, UIC 406 occupancy is <b>${uicDoluluk.toFixed(0)}%</b>${kapBol ? ` — ~${yedekYuzde}% spare capacity; the interval can be tightened toward ${Math.round(maks.hMin)} s to reach ${teorikTph.toFixed(0)} trains/h without additional infrastructure.` : `.`}`
    : `<b>Belirleyici kısıt: ${esc(maks.baglayanAd || "—")}</b> · minimum headway <b>${Math.round(maks.hMin)} s</b>${sperrNot}. Hedef ${cfg.headway} s aralıkta UIC 406 doluluğu <b>%${uicDoluluk.toFixed(0)}</b>${kapBol ? ` — ~%${yedekYuzde} yedek kapasite; aralık ${Math.round(maks.hMin)} s'ye kadar sıkıştırılarak ek altyapı olmadan ${teorikTph.toFixed(0)} tren/saate ölçeklenebilir.` : `.`}`;

  const bugun = meta.tarih || "";
  const siteUrl = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "https://raysim.vercel.app";
  // Firma Aslan Sinyalizasyon ise antette (sol üst) firma yazısı yerine ASLS logosu.
  const firmaAsls = firmaAslsMi(meta.sinyalizasyonFirmasi);
  const antetSol = firmaAsls
    ? `<span class="firma-logo" role="img" aria-label="${esc(meta.sinyalizasyonFirmasi || "Aslan Sinyalizasyon")}">${aslsLogoSvg}</span>`
    : `<span class="firma">${esc(meta.sinyalizasyonFirmasi || "RaySim")}</span>`;

  // ---- SİNYALİZASYON bölümü (sinyal lambaları metrajı — canlı sistemle birebir) ----
  const gidenS = sinyalListe.filter((f) => f.yon === "giden").length;
  const gelenS = sinyalListe.filter((f) => f.yon === "gelen").length;
  const sinyalRows = sinyalListe.map((f, i) => [
    `${i + 1}`, kmFmt(f.pos),
    f.yon === "giden" ? (lang === "en" ? "outbound ▶" : "giden ▶") : (lang === "en" ? "return ◀" : "gelen ◀"),
    f.tersIsletme ? (lang === "en" ? "reverse (turnback)" : "ters işletme") : (lang === "en" ? "home" : "hat sinyali"),
    `${Math.round(f.aspektCevrim || 0)}`,
  ]);
  const sinyalThead = lang === "en"
    ? ["No", "Chainage", "Direction", "Type", "Aspect cycle (s)"]
    : ["No", "Kilometraj", "Yön", "Tür", "Aspect çevrimi (s)"];
  const sinyalBolum = `
  <div class="banner"><span class="no">03</span>${lang === "en" ? "SIGNALLING — SIGNAL LAMPS (SG)" : "SİNYALİZASYON — SİNYAL LAMBALARI (SG)"}</div>
  <p>${lang === "en"
    ? `The line is protected by <b>${sinyalSayisi} three-aspect signal lamps</b> (SG: red / yellow / green), ${gidenS} outbound (▶) and ${gelenS} return (◀)${tersSinyalSayisi ? `, of which ${tersSinyalSayisi} are reverse-running (turnback) signals` : ""}. Chainages are the real design positions; each outbound signal is a <b>block boundary</b>.`
    : `Hat, <b>${sinyalSayisi} adet 3-aspect sinyal lambası</b> (SG: kırmızı / sarı / yeşil) ile korunur — ${gidenS} giden (▶), ${gelenS} gelen (◀)${tersSinyalSayisi ? `, bunların ${tersSinyalSayisi} tanesi ters işletme (turnback) sinyalidir` : ""}. Kilometrajlar gerçek tasarım konumlarıdır; her giden sinyali bir <b>blok sınırıdır</b>.`}</p>
  ${sinyalListe.length ? tbl(sinyalThead, sinyalRows, { first: true }) : `<p class="muted">${lang === "en" ? "No signal lamps defined on this line yet (positions are entered in the Ringler module)." : "Bu hatta henüz sinyal lambası tanımlı değil (konumlar Ringler modülünde girilir)."}</p>`}
`;


  // ---- İŞLETME & TALEP ANALİZİ (ters işletme) — GİRDİ→SONUÇ çerçevesi ----
  // "Siz şu girdiyi verdiniz → bu sonuç çıktı" biçiminde; iç formül/algoritma (sır) açığa çıkmaz.
  // MOD = "toplam" — Ters İşletme sayfasının VARSAYILAN modu (birebir aynı çıktı için).
  // Böylece rapordaki filo/öneri/tepe yük değerleri canlı Ters İşletme ekranıyla eşleşir.
  const tia = rings.length >= 2 ? tersIsletmeAnaliz(rings, stock, isletme, cfg, "toplam") : null;
  // Girdi→sonuç notu kutusu (altın vurgulu, şık).
  const gsNot = (girdi: string, sonuc: string) =>
    `<div class="gs"><span class="gs-i">▸ ${en ? "Your inputs" : "Girdileriniz"}:</span> ${girdi} <span class="gs-o">→ ${en ? "Result" : "Sonuç"}:</span> ${sonuc}</div>`;
  let isletmeBolum = "";
  if (tia) {
    const talepGirdi = en
      ? `the total peak demand you entered (${Math.round(isletme.pikYolcuSaat || 0)} pax/h) distributed by station role (hospital/interchange/stadium/centre = high)`
      : `girdiğiniz toplam pik talep (${Math.round(isletme.pikYolcuSaat || 0)} yolcu/saat), istasyon rolüne göre dağıtıldı (hastane/aktarma/stadyum/merkez = yoğun)`;
    const kapNote = en ? `vehicle capacity ${tia.aracKapasite} pax and ${tia.filo.mevcutPik} peak trams` : `araç kapasitesi ${tia.aracKapasite} yolcu ve ${tia.filo.mevcutPik} pik tramvay`;

    // 5.1 Yolcu Yük Profilleri
    const yukThead = en ? ["Stop", "Board", "Alight", "Load ▶", "Load ◀", "Peak", "Occ."] : ["Durak", "Binen", "İnen", "Yük ▶", "Yük ◀", "Tepe", "Doluluk"];
    const yukRows = tia.duraklar.map((d) => [esc(d.ad), `${d.binen}`, `${d.inen}`, `${d.yukGidis}`, `${d.yukDonus}`, `${d.tepeYuk}`, `%${Math.round(d.doluluk * 100)}`]);
    const b51 = `<h3 class="sub">5.1 ${en ? "Passenger Load Profiles" : "Yolcu Yük Profilleri"}</h3>
      ${gsNot(talepGirdi, en ? `directional load per stop; peak load <b>${tia.tepeYuk} pax/h</b> at <b>${esc(tia.tepeDurak)}</b>${tia.gercekVeri ? " (from your real counts)" : " (role-based estimate — enter real counts for exact figures)"}` : `durak-başı yönlü yük; en yüksek yük <b>${tia.tepeYuk} yolcu/saat</b>, <b>${esc(tia.tepeDurak)}</b> durağında${tia.gercekVeri ? " (gerçek girdinizden)" : " (rol-tabanlı tahmin — kesin değer için gerçek iniş/biniş girin)"}`)}
      ${tbl(yukThead, yukRows, { first: true })}`;

    // 5.2 Depo Çıkışı
    const b52 = `<h3 class="sub">5.2 ${en ? "Depot Dispatch — One Depot, Two Directions" : "Depo Çıkışı — Tek Depodan İki Yön"}</h3>
      ${gsNot(en ? `the fleet you confirmed (${tia.filo.mevcutPik} trams) and the switch (crossover) at the depot` : `onayladığınız filo (${tia.filo.mevcutPik} tramvay) ve depodaki makas (crossover)`, esc(tia.depoDagilim.aciklama))}`;

    // 5.3 Dönüşe İhtiyaç Duyan Duraklar
    const dThead = en ? ["Stop", "Occ.", "Segment", "Suggested switch", "Severity"] : ["Durak", "Doluluk", "Segman", "Önerilen makas", "Şiddet"];
    const dRows = tia.donusIhtiyaclari.map((d) => [esc(d.durak), `%${Math.round(d.doluluk * 100)}`, esc(d.segman), esc(d.oneriMakas), d.siddet]);
    const b53 = `<h3 class="sub">5.3 ${en ? "Stops Needing Turnback" : "Dönüşe İhtiyaç Duyan Duraklar"}</h3>
      ${tia.donusIhtiyaclari.length
        ? gsNot(en ? `the ${Math.round((isletme.dolulukHedefi || 0.85) * 100)}% occupancy target and ${kapNote}` : `girdiğiniz %${Math.round((isletme.dolulukHedefi || 0.85) * 100)} doluluk hedefi ve ${kapNote}`, en ? `${tia.donusIhtiyaclari.length} stop(s) exceed the target → short-turn (turnback) suggested` : `${tia.donusIhtiyaclari.length} durak hedefi aşıyor → kısa dönüş (turnback) öneriliyor`) + tbl(dThead, dRows, { first: true })
        : `<p class="muted">${en ? "All stops within the occupancy target — no turnback needed." : "Tüm duraklar doluluk hedefinde — dönüşe ihtiyaç yok."}</p>`}`;

    // 5.4 Makas Bölgesi Başına Ters İşletme Varyasyonları
    const b54ic = tia.makaslar.length
      ? tia.makaslar.map((m) => `<div class="ring-detay"><h4>${esc(m.ad)} (${m.crossover.toUpperCase()} · ${m.makasSayisi} PM)</h4>
          ${gsNot(en ? `the ${m.crossover.toUpperCase()} switch you placed here (${m.makasSayisi} PM) and the load balance of its two arms (${m.yuksekYuk} vs ${m.dusukYuk} pax/h)` : `buraya girdiğiniz ${m.crossover.toUpperCase()} makas (${m.makasSayisi} PM) ve iki kolun yük dengesi (${m.yuksekYuk} / ${m.dusukYuk} yolcu/saat)`, esc(m.yorum))}
          <ul class="ch">${m.varyasyonlar.map((v) => `<li><b>${esc(v.ad)}:</b> ${esc(v.aciklama)}</li>`).join("")}</ul>
          <p class="muted" style="font-size:9.5pt">${esc(m.sureNotu)}</p></div>`).join("")
      : `<p class="muted">${en ? "No mid-line switch zones — reverse-running variations apply only at terminals." : "Ara-hat makas bölgesi yok — ters işletme varyasyonları yalnız terminallerde geçerli."}</p>`;
    const b54 = `<h3 class="sub">5.4 ${en ? "Reverse-Running Variations per Switch Zone" : "Makas Bölgesi Başına Ters İşletme Varyasyonları"}</h3>${b54ic}`;

    // 5.5 Filo & Öneri — üretebilirlik: gereken/mevcut/fark (çek/ekle) + kısa dönüş +
    // tepe yük/çevrim/frekans/araç özeti (tümü canlı motordan: tersIsletmeAnaliz).
    const oneriRenk = tia.filo.oneri === "yeterli" ? "#0E7C57" : (tia.filo.oneri === "kapasiteYetmez" ? RED : GOLD);
    const fark = tia.filo.fark; // gereken − mevcut
    const farkEt = fark === 0 ? (en ? "balanced" : "dengede") : (fark > 0 ? (en ? `+${fark} add` : `+${fark} ekle`) : (en ? `${fark} remove` : `${fark} çek`));
    const cevrimDk = (tia.cevrimSn / 60).toFixed(0);
    const ozetSatir = en
      ? `Peak load: <b>${tia.tepeYuk} pax/h</b> at <b>${esc(tia.tepeDurak)}</b> · cycle <b>${cevrimDk} min</b> · frequency <b>${tia.mevcutFrekans.toFixed(1)} trains/h</b> · vehicle <b>${tia.aracKapasite} pax</b>.`
      : `Tepe yük: <b>${tia.tepeYuk} yolcu/saat</b> · <b>${esc(tia.tepeDurak)}</b> · çevrim <b>${cevrimDk} dk</b> · frekans <b>${tia.mevcutFrekans.toFixed(1)} tren/sa</b> · araç <b>${tia.aracKapasite} kişi</b>.`;
    const b55 = `<h3 class="sub">5.5 ${en ? "Fleet & Recommendation" : "Filo & Öneri"}</h3>
      ${gsNot(en ? `peak demand, the ${Math.round((isletme.dolulukHedefi || 0.85) * 100)}% occupancy target, cycle time and ${kapNote}` : `pik talep, %${Math.round((isletme.dolulukHedefi || 0.85) * 100)} doluluk hedefi, çevrim süresi ve ${kapNote}`, `<b style="color:${oneriRenk}">${esc(tia.filo.aciklama)}</b>`)}
      <div class="kpi-row" style="margin-top:6px">
        ${kpi(en ? "Required trams" : "Gereken araç", `${tia.filo.gerekenArac}`, en ? "at target occupancy" : "hedef dolulukta", oneriRenk)}
        ${kpi(en ? "Current peak fleet" : "Mevcut pik filo", `${tia.filo.mevcutPik}`, en ? "you entered" : "girdiğiniz")}
        ${kpi(en ? "Difference" : "Fark", farkEt, en ? "required − current" : "gereken − mevcut", fark > 0 ? RED : (fark < 0 ? "#0E7C57" : INK))}
        ${tia.filo.kisaDonusTasarruf > 0 ? kpi(en ? "With short-turn" : "Kısa dönüşle", `${tia.filo.gerekenAracKisaDonusle}`, en ? `−${tia.filo.kisaDonusTasarruf} trams` : `−${tia.filo.kisaDonusTasarruf} araç`, "#0E7C57") : ""}
        ${kpi(en ? "Sustainable ceiling" : "Sürdürülebilir tavan", `${tia.maksSurdurulebilir}`, en ? "UIC 406 buffered" : "UIC 406 tamponlu")}
      </div>
      <p class="muted" style="font-size:9.7pt;margin-top:6px">${ozetSatir}</p>`;

    isletmeBolum = `
  <div class="banner"><span class="no">05</span>${en ? "OPERATIONS & DEMAND ANALYSIS (REVERSE RUNNING)" : "İŞLETME & TALEP ANALİZİ (TERS İŞLETME)"}</div>
  <p>${en
    ? `Effect of the demand, fleet and switch inputs on operation: passenger load profiles, single-depot two-direction dispatch, stops needing a turnback, per-switch reverse-running variations, and the fleet recommendation.`
    : `Talep, filo ve makas girdilerinin işletmeye etkisi: yolcu yük profilleri, tek-depodan iki-yön çıkışı, dönüşe ihtiyaç duyan duraklar, makas-başı ters işletme varyasyonları ve filo önerisi.`}</p>
  <div class="gs"><span class="gs-i">▸ ${en ? "Passenger & occupancy basis" : "Yolcu ve doluluk esası"}:</span> ${en
    ? `passenger measurement is central: from the boarding/alighting counts measured per station (or, where not entered, the role-based demand distribution) together with the vehicle passenger capacity and service frequency, the directional load profile along the line and the per-stop <b>occupancy ratio</b> are derived; the stops exceeding the occupancy target and the need for a short-turn are determined from these measurements. The tram’s capacity and physical states (door count/width, floor area, mass, tractive effort, braking) are taken as parameters.`
    : `yolcu ölçümü esastır: her istasyona ölçülen iniş-biniş sayıları (girilmediyse istasyon rolüne göre talep dağılımı) ile araç yolcu kapasitesi ve servis frekansı birlikte değerlendirilerek hat-boyu yönlü yük profili ve durak-başı <b>doluluk oranı</b> çıkarılır; doluluk hedefini aşan duraklar ve kısa dönüş ihtiyacı bu ölçümlerden belirlenir. Değerlendirmede tramvayın kapasite ve fiziksel durumları (kapı sayısı/genişliği, taban alanı, kütle, çekiş, frenleme) parametre olarak alınır.`}</div>
  ${b51}${b52}${b53}${b54}${b55}
`;
  }

  // Kapasite ÖLÇÜM ESASLARI — hangi saha girdilerinin birlikte değerlendirildiği (iç
  // formül/algoritma açığa çıkmadan; yöntem UIC 406 blocking-time esaslı).
  const kapGirdiNot = `<div class="gs"><span class="gs-i">▸ ${en ? "Measurement basis" : "Ölçüm esasları"}:</span> ${en
    ? `the maximum trams on the line (“trains within headway”) is measured not from a single assumption but from the joint evaluation of terminal throat occupation times, switch types and counts (S single / X scissors crossover), signal-lamp positions, directions and aspect states, block-occupation states, station dwell times, level-crossing types, and the tram’s physical states (mass, tractive effort and power, braking, running resistance, length, maximum speed) — on a UIC 406 blocking-time (Sperrzeitentreppe) basis`
    : `hattın azami tramvay sayısı (“headway’de sığan tren”) tek bir kabulle değil; terminal boğaz işgal süreleri, makas tip ve sayıları (S tek / X scissors crossover), sinyal lambası konum, yön ve aspect durumları, blok işgal durumları, istasyon duruş (dwell) süreleri, hemzemin geçit tipleri ve tramvayın fiziksel durumlarının (kütle, çekiş kuvveti ve gücü, frenleme, seyir direnci, uzunluk, azami hız) birlikte değerlendirilmesiyle — UIC 406 blocking-time (Sperrzeitentreppe) esasıyla — ölçülür`} <span class="gs-o">→ ${en ? "Result" : "Çıktı"}:</span> ${en
    ? `theoretical maximum <b>${maks.nTeorik} trams</b> (sustainable ${maks.nSurdurulebilir}) and minimum headway <b>${Math.round(maks.hMin)} s</b> at the determining constraint (${esc(maks.baglayanAd || "—")}).`
    : `teorik en fazla <b>${maks.nTeorik} tramvay</b> (sürdürülebilir ${maks.nSurdurulebilir}) ve belirleyici kısıtta (${esc(maks.baglayanAd || "—")}) minimum headway <b>${Math.round(maks.hMin)} s</b>.`}</div>`;

  // Onayın hemen üstündeki bağımsız çekirdek doğrulama satırı (kurumsal, tek satır).
  const cekirdekNot = `<div class="cekirdek">${en
    ? "Verified in collaboration with OpenTrack; independent core based on the UIC 406 methodology."
    : "OpenTrack ile işbirliğiyle doğrulanmış; UIC 406 metodolojisine dayanan bağımsız çekirdek."}</div>`;

  return `<!doctype html><html lang="${L.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.dokumanNo)} — ${esc(meta.projeAdi)}</title>
<style>
  /* Site ile AYNI yazı tipleri: gövde Geist (sans), başlıklar Spectral (marka serif),
     sayısal/mono Geist Mono. Rapor ayrı sekmede açıldığından fontlar burada YÜKLENİR
     (yazdırma manuel butonla; tıklanana dek fontlar hazır olur). */
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Spectral:wght@500;600;700&display=swap');
  @page { size: A4; margin: 13mm 15mm 13mm; }
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
  .cover { text-align: center; padding: 12px 0 10px; page-break-after: avoid; }
  .cover .emblem { display: inline-block; }
  .cover .emblem svg { width: 66px; height: 66px; }
  .cover .rule { width: 56px; height: 3px; background: ${RED}; margin: 10px auto 14px; }
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
  .dockontrol-lbl { font-size: 8pt; letter-spacing: .18em; text-transform: uppercase; color: ${GOLD}; font-weight: 700; margin: 20px auto 5px; width: 76%; text-align: left; }
  .cover .foot { margin-top: 16px; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #9AA7B4; }
  .cover .qr { margin-top: 14px; }
  .cover .qr svg { border: 1px solid #E6E9ED; padding: 4px; background: #fff; }
  .cover .qr-cap { font-size: 8pt; color: #6B7A8A; margin-top: 5px; line-height: 1.3; }
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

  /* Tablolar — uzun tablolar sayfalar arası BÖLÜNEBİLİR (aksi halde toptan bir
     sonraki sayfaya itilip önceki sayfada büyük boşluk/kayma bırakırlar). Satırlar
     bölünmez; başlık satırı her yeni sayfada tekrarlanır. */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: ${INK}; color: #fff; font-weight: 600; text-align: center; padding: 6px 8px; border: 1px solid ${INK}; }
  td { padding: 5px 8px; border: 1px solid #DCE1E7; text-align: center; }
  th.l, td.l { text-align: left; }
  tbody tr:nth-child(even) td { background: #F5F7F9; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 8.5pt; font-weight: 700; color: #fff; }
  .pill.ok { background: #EAF5F0; color: #0E7C57; } .pill.bad { background: ${RED}; }

  /* Matriks */
  .matris td.mx { font-weight: 700; width: 34px; }
  .matris td.yes { color: #0E7C57; } .matris td.no { color: ${RED}; } .matris td.diag { color: #9AA7B4; }
  .matris-etiket { font-size: 9.5pt; font-weight: 600; margin-top: 4px; }
  .mx-leg { font-weight: 400; color: #6B7A8A; margin-left: 8px; }
  .mx-leg .yes { color: #0E7C57; font-weight: 700; } .mx-leg .no { color: ${RED}; font-weight: 700; }

  /* KPI */
  .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 6px 0 14px; }
  .kpi { border: 1px solid #DCE1E7; border-radius: 6px; padding: 10px 12px; background: #fff; }
  .kpi-l { font-size: 8pt; letter-spacing: .06em; text-transform: uppercase; color: #6B7A8A; }
  .kpi-v { font-size: 18pt; font-weight: 700; line-height: 1.1; margin: 2px 0; }
  .kpi-a { font-size: 9pt; color: #9AA7B4; }

  .fig { margin: 6px 0 16px; text-align: center; page-break-inside: avoid; }
  .fig .cap { font-size: 8.5pt; color: #6B7A8A; margin-top: 4px; }

  /* Ring detayları uzun olabildiğinden (kısıt tablosu + challenge listesi) sayfalar
     arası bölünebilir; başlık bir sonraki içerikten koparılmaz. */
  .ring-detay { page-break-inside: auto; margin-bottom: 14px; }
  .ring-detay h4, .bolge h4 { color: ${INK}; font-size: 11pt; margin: 12px 0 4px; page-break-after: avoid; }
  ul.ch { margin: 4px 0 8px; padding-left: 18px; font-size: 9.5pt; }
  ul.ch li.krit { color: ${RED}; }
  /* Girdi→Sonuç notu — "siz bunları girdiniz → bu sonuç" (şık altın kart). */
  .gs { margin: 6px 0 8px; padding: 8px 12px; border-left: 4px solid ${GOLD}; background: #FAF7EE;
    border-radius: 4px; font-size: 9.7pt; line-height: 1.5; color: ${INK}; page-break-inside: avoid; }
  .gs-i { font-weight: 700; color: ${GOLD}; }
  .gs-o { font-weight: 700; color: ${INK}; }
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
    border-top: .75pt solid #DCE1E7; padding-top: 1.4mm; margin-top: 8mm; font-size: 7.5pt; color: #6B7A8A; }
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
<!-- Sayfa çerçevesi: antet üst/alt HER sayfada AKIŞTA tekrarlanır (fixed değil). -->
<table class="pageframe"><thead class="antet-head"><tr><td>
  <div class="antet-ust">${antetSol}<span class="dok">${esc(meta.dokumanNo)}${meta.revizyon ? " · " + esc(meta.revizyon.split("—")[0].trim()) : ""}</span></div>
</td></tr></thead><tfoot class="antet-foot"><tr><td>
  <div class="antet-alt"><span>${esc(meta.sinyalizasyonFirmasi || "RaySim")} · ${esc(meta.projeAdi)}</span><span>${bugun ? esc(bugun) + " · " : ""}${esc(meta.dokumanNo)}</span></div>
</td></tr></tfoot><tbody><tr><td>

  <!-- KAPAK -->
  <section class="cover">
    <div class="emblem">${emblemSvg}</div>
    <div class="brandmark" style="margin-top:8px">Ray<span class="r">Sim</span></div>
    <div class="rule"></div>
    <div class="sys">${L.sys}</div>
    <div class="kit">${L.kit}</div>
    <div class="proje">${esc(meta.projeAdi)}</div>
    <div class="hat">${esc(meta.hatAdi)}</div>
    <div class="dockontrol-lbl">${L.dockontrol}</div>
    <table class="kunye"><tbody>${kunye.map(([a, b]) => `<tr><td class="l k">${esc(a)}</td><td class="l">${esc(b)}</td></tr>`).join("")}</tbody></table>
    <div class="qr">${qrSvg(siteUrl, 92)}<div class="qr-cap">${L.qrCap}<br>${esc(siteUrl.replace(/^https?:\/\//, ""))}</div></div>
    <div class="foot">${esc(L.foot)}${bugun ? " · " + esc(bugun) : ""}</div>
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
  <h3 class="sub">${sunum ? (lang === "en" ? "2.1 Per-cell Constraint Analysis" : "2.1 Ring Bazında Kısıt Analizi") : L.s21}</h3>
  ${ringDetay}

  <!-- 3: Sinyalizasyon -->
  ${sinyalBolum}

  <!-- 4 -->
  <div class="banner"><span class="no">04</span>${L.s4}</div>
  <p>${L.s4i}</p>
  ${kapasiteTbl}
  ${kapGirdiNot}
  ${sunum ? `<div style="margin:8px 0 4px;padding:8px 12px;border-left:4px solid #0E7C57;background:#EAF5F0;border-radius:4px;font-size:11px;color:${INK}">✓ ${lang === "en" ? `Capacity analysis compliant: all blocks within the target headway (${cfg.headway} s). Design approved.` : `Kapasite analizi uygun: tüm bloklar hedef headway (${cfg.headway} s) içinde — sınır aşımı yok. Tasarım onaylı.`}</div>` : ""}
  <p class="muted" style="font-size:11px;margin-top:6px">${L.kapNot}</p>
  <div style="margin:10px 0 4px;padding:9px 13px;border-left:4px solid ${GOLD};background:#FAF7EE;border-radius:4px;font-size:10pt;line-height:1.55;color:${INK}">${kapYorum}</div>
  ${bfFig}
  <h3 class="sub">${L.s41}</h3>
  <div class="fig">${line ? sperrzeitSvg(bt, line.length, kritikRenk) : ""}<div class="cap">${sunum ? (lang === "en" ? `Figure 4 — Sperrzeitentreppe: block occupation (blocking-time) windows; min headway ${Math.round(bt.minHeadway)}s.` : `Şekil 4 — Sperrzeitentreppe: blok işgal (blocking-time) pencereleri; min headway ${Math.round(bt.minHeadway)} s.`) : L.fig4(Math.round(bt.minHeadway))}</div></div>
  <div class="fig">${blockingBarSvg(bt.bloklar, bt.kritikBlok, kritikRenk)}<div class="cap">${sunum ? (lang === "en" ? "Figure 5 — Per-block blocking-time component distribution (determining block highlighted)." : "Şekil 5 — Blok başına blocking-time bileşen dağılımı (belirleyici blok vurgulu).") : L.fig5}${bt.bloklar.length > 16 ? (lang === "en" ? ` (highest 16 of ${bt.bloklar.length} blocks; full list in the table below)` : ` (${bt.bloklar.length} bloktan en yüksek 16'sı; tümü aşağıdaki tabloda)`) : ""}</div></div>
  ${btTbl}

  <!-- 5: İşletme & Talep Analizi (ters işletme) -->
  ${isletmeBolum}

  ${cekirdekNot}

  <!-- 6 -->
  <div class="banner"><span class="no">06</span>${L.s5}</div>
  <table class="imza"><thead><tr><th>${esc(L.thImza[0])}</th><th>${esc(L.thImza[1])}</th></tr></thead>
  <tbody><tr><td class="l">${esc(meta.hazirlayan)}</td><td class="l">${esc(meta.onaylayan)}</td></tr>
  <tr><td class="l">${esc(L.imzaTarih)}</td><td class="l">${esc(L.imzaTarih)}</td></tr></tbody></table>

</td></tr></tbody></table>
</div>
</body></html>`;
}
