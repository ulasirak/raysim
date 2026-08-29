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
import type { SimConfig, ProjeMeta } from "./config";
import { PARAM_META, paramGoster, birim } from "./config";
import type { RollingStock } from "./types";
import {
  ringSenaryo, ringChallenge, ringKisitDizisi, loopDenge, olceklenme,
  type DurakArasiRing,
} from "./ring";
import { blockingTimeRing } from "./blockingtime";
import { loopToHat } from "./hatsim";
import { simulate } from "./sim";
import { computeEnergy } from "./energy";
import { simulateSignalled } from "./signalling";
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
  const W = 760, pad = 56, y = 74;
  const step = (W - 2 * pad) / Math.max(1, n);
  const px = (i: number) => pad + i * step;
  const adlar = [rings[0].fromAd, ...rings.map((r) => r.toAd)];
  const line = `<line x1="${px(0).toFixed(1)}" y1="${y}" x2="${px(n).toFixed(1)}" y2="${y}" stroke="${CK.ink}" stroke-width="3.5" stroke-linecap="round"/>`;
  const dots = adlar.map((_, i) => `<circle cx="${px(i).toFixed(1)}" cy="${y}" r="5.5" fill="${CK.surface}" stroke="${CK.ink}" stroke-width="2.2"/>`).join("");
  const labels = adlar.map((ad, i) => lab(px(i), i % 2 === 0 ? y - 16 : y - 30, esc(ad), { anchor: "middle", size: 8.5, color: CK.ink2, weight: 600 })).join("");
  const marks = rings.map((r, i) => {
    const xm = (px(i) + px(i + 1)) / 2; let s = "";
    if (r.makaslar.length) s += lab(xm, y + 21, `⑂ ${r.makaslar.length}`, { anchor: "middle", size: 11, color: CK.red, weight: 700 });
    if (r.hemzeminler.length) s += lab(xm, y + 35, `⊟ ${r.hemzeminler.length}`, { anchor: "middle", size: 9, color: CK.gold });
    return s;
  }).join("");
  return `<svg viewBox="0 0 ${W} 116" width="100%" style="max-width:${W}px">${line}${marks}${dots}${labels}</svg>`;
}

// Blocking-time bileşen barları (gömülü SVG): her blok için yığılı süre (ordinal mavi rampa).
function blockingBarSvg(bloklar: { i: number; makasBlok?: boolean; tSetup: number; tSighting: number; tApproach: number; tRunning: number; tClearing: number; tRelease: number; toplam: number }[], kritik: number, kritikRenk: string = CK.red): string {
  if (!bloklar.length) return "";
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
function bildfahrplanSvg(line: Line, stock: RollingStock, cfg: SimConfig, count: number): string {
  if (line.length <= 0) return "";
  const rev = reverseLineOf(line);
  const up = simulateSignalled(line, stock, { headway: cfg.headway, count, maxBlockLen: cfg.blokMaxUzunluk });
  const dn = simulateSignalled(rev, stock, { headway: cfg.headway, count, maxBlockLen: cfg.blokMaxUzunluk });
  const L = line.length, tMax = Math.max(1, up.tMax, dn.tMax);
  const W = 760, H = 250, padL = 78, padR = 12, padT = 12, padB = 26;
  const pw = W - padL - padR, ph = H - padT - padB;
  const xOf = (t: number) => padL + (t / tMax) * pw;
  const yOf = (s: number) => padT + (s / L) * ph; // s=0 üstte, s=L altta
  const st = line.stations.map((s) =>
    `<line x1="${padL}" y1="${yOf(s.position).toFixed(1)}" x2="${W - padR}" y2="${yOf(s.position).toFixed(1)}" stroke="${CK.grid}"/>${lab(padL - 7, yOf(s.position) + 3, esc(s.name), { anchor: "end", size: 8 })}`).join("");
  const tg = Array.from({ length: 7 }).map((_, i) => {
    const t = (tMax * i) / 6, x = xOf(t);
    return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="${CK.grid}" opacity="0.6"/>${num(x, H - 8, `${Math.round(t / 60)}′`, { anchor: "middle", size: 8 })}`;
  }).join("");
  const trainLine = (pts: string, col: string, delayed: boolean) =>
    `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.92"${delayed ? ' stroke-dasharray="4 3"' : ""}/>`;
  const upLines = up.trains.map((tr) => trainLine(tr.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.s).toFixed(1)}`).join(" "), CK.blue, tr.delay > 2)).join("");
  const dnLines = dn.trains.map((tr) => trainLine(tr.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(L - p.s).toFixed(1)}`).join(" "), CK.orange, tr.delay > 2)).join("");
  const leg = `<text x="${W - padR}" y="${padT + 9}" text-anchor="end" font-family="${CK.sans}" font-size="8.5"><tspan fill="${CK.blue}">▬ gidiş</tspan>  <tspan fill="${CK.orange}">▬ dönüş</tspan>  <tspan fill="${CK.muted}">╌ gecikmeli</tspan></text>`;
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
    foot: "RaySim Sinyalizasyon Tasarım & Dokümantasyon Sistemi tarafından üretilmiştir.",
    qrCap: "Canlı simülasyon",
    kunye: { proje: "Proje", hat: "Hat", dok: "Doküman No", rev: "Revizyon", tarih: "Tarih", idare: "İdare", yuk: "Yüklenici", mus: "Müşavir", firma: "Sinyalizasyon Firması" },
    kpi: { hucre: "Durak arası hücre", hedef: "Hedef headway", sigan: "Headway'de sığan tren", kapasite: "Teorik kapasite", pratik: "İşletme kapasitesi", uic: "UIC 406 doluluk", ch: "Challenge / kritik" },
    altMakas: (n: number) => `${n} makas`, altTumu: "tümü uygun", altIhlal: "ihlal var", altTur: (s: string) => `tur ${s}`, altTph: "tren/saat", altUygun: "uygun", altIhlalK: "ihlal", altRisk: "risk kaydı",
    s1: "Tasarım Kriterleri", s1i: "Sistem, sabit blok mimarisi üzerine kurulmuştur. Aşağıdaki göstergeler ve parametreler tüm işletim senaryolarının temelini oluşturur.",
    thParam: ["Parametre", "Değer", "Etkisi"],
    s2: "Durak Arası İşletim Hücreleri", s2i: (n: number, h: number) => `Hat, ${n} durak-arası hücreye (ring) bölünmüştür. Her hücre kendi mesafe, makas, hemzemin ve tehlike (acil frenleme) şartlarını taşır; worst-case senaryo en uzun mesafe + tüm kısıtlarla, hedef headway ${h} s ile değerlendirilir.`,
    fig1: "Şekil 1 — Hat şeması: istasyon zinciri, makas (⑂) ve hemzemin geçit dağılımı.",
    figEnergy: (net: number, perKm: number) => `Şekil 2 — Enerji-mesafe: kümülatif çekiş enerjisi (mürekkep alan). Net ${net.toFixed(1)} kWh · ${perKm.toFixed(2)} kWh/km.`,
    gClimb: "tırmanış", gDescent: "iniş", gGrade: "eğim", gNoElev: "Yükseklik verisi girilmedi — düz profil varsayıldı", mUnit: "m",
    fig3: (c: number, h: number) => `Şekil 3 — Zaman-mesafe diyagramı (Bildfahrplan), ÇİFT YÖN: gidiş (mürekkep) + dönüş (mavi), ${c}+${c} tren, ${h}s aralık. Ters eğimli çizgilerin kesişimi = kruvasman/karşılaşma; kesikli çizgi = gecikmeli sefer.`,
    thRing: ["No", "Durak Arası", "Mesafe (m)", "Worst (m)", "Makas", "Hemzemin", "Tehlike", "Worst Toplam", "Headway"],
    s21: "2.1 Ring Bazında Kısıt ve Risk (Challenge) Analizi",
    thKisit: ["Kısıt", "Kilometraj", "Detay"], noKisit: "Kısıt yok — kesintisiz seyir.",
    pillOk: "UYGUN", pillBad: "İHLAL",
    s4: "Kapasite ve Blocking-Time Analizi", s4i: "En yüksek blocking-time'lı blok minimum tren aralığını (headway) belirler; UIC 406 doluluk oranı bu değerin hedef headway'e bölümüdür. Her bloğun rezerve süresi altı bileşenden oluşur.",
    thGost: ["Gösterge", "Değer"],
    kapTur: "Tur süresi (worst-case seyir)", kapDonus: "Dönüş bekleme (tur başına)", kapCevrim: "Çevrim süresi (dönüş bekleme dâhil)", kapHedef: "Hedef headway", kapSigan: "Headway'de gereken tren", kapDarbogaz: "Darboğaz hücre", kapDenge: "Denge (eşit şartlar)", kapDengeli: "Dengeli", kapSapma: (p: string) => `%${p} sapma`, kapMin: "Minimum headway (kritik blok)", kapTeorik: "Teorik kapasite (tamponsuz üst sınır)", kapPratik: "İşletme kapasitesi (UIC 406 doluluk tavanı)", kapUIC: "UIC 406 doluluk (hedef headway'de)", tphSuffix: "tren/saat",
    kapNot: "Teorik kapasite, tamponsuz bir ÜST SINIRDIR (ideal, gecikmesiz işletme varsayımı). İşletme kapasitesi ise UIC 406 önerilen doluluk tavanı uygulanarak — gecikme toparlama için tampon bırakılarak — sürdürülebilir değeri verir. Gerçek hat performansı normal koşullarda bu iki değer arasındadır.",
    s41: "3.1 Blocking-Time (Sperrzeitentreppe)",
    fig4: (h: number) => `Şekil 4 — Sperrzeitentreppe: iki ardışık trenin blok işgal (blocking-time) pencereleri; kritik blokta ikinci trenin başlangıcı birincinin bitişine değer = min headway ${h}s.`,
    fig5: "Şekil 5 — Blok başına blocking-time bileşen dağılımı (kritik blok kırmızı etiketli).",
    thBt: ["Blok", "Setup", "Görme", "Yaklaşma", "Seyir", "Temizleme", "Release", "Toplam (s)"],
    s5: "Onay", thImza: ["Hazırlayan", "Onaylayan"], imzaTarih: "İmza / Tarih",
  };
  const en: typeof tr = {
    htmlLang: "en", barTitle: "Report",
    barHint: 'In the print dialog, choose "Destination: Save as PDF".',
    barBtn: "⭳ Save as PDF / Print",
    sys: "SIGNALLING SYSTEM", kit: "DESIGN HANDBOOK",
    foot: "Produced by the RaySim Signalling Design & Documentation System.",
    qrCap: "Live simulation",
    kunye: { proje: "Project", hat: "Line", dok: "Document No", rev: "Revision", tarih: "Date", idare: "Authority", yuk: "Contractor", mus: "Consultant", firma: "Signalling Firm" },
    kpi: { hucre: "Inter-station cells", hedef: "Target headway", sigan: "Trains within headway", kapasite: "Theoretical capacity", pratik: "Operating capacity", uic: "UIC 406 occupancy", ch: "Challenges / critical" },
    altMakas: (n) => `${n} switches`, altTumu: "all compliant", altIhlal: "violations", altTur: (s) => `cycle ${s}`, altTph: "trains/hour", altUygun: "compliant", altIhlalK: "violation", altRisk: "risk records",
    s1: "Design Criteria", s1i: "The system is built on a fixed-block architecture. The indicators and parameters below form the basis of all operating scenarios.",
    thParam: ["Parameter", "Value", "Effect"],
    s2: "Inter-station Operating Cells", s2i: (n, h) => `The line is divided into ${n} inter-station cells (rings). Each cell carries its own distance, switch, level-crossing and hazard (emergency braking) conditions; the worst case is evaluated at the longest distance with all constraints against the ${h}s target headway.`,
    fig1: "Figure 1 — Line schematic: station chain, switch (⑂) and level-crossing distribution.",
    figEnergy: (net, perKm) => `Figure 2 — Energy-distance: cumulative traction energy (ink area). Net ${net.toFixed(1)} kWh · ${perKm.toFixed(2)} kWh/km.`,
    gClimb: "climb", gDescent: "descent", gGrade: "grade", gNoElev: "No elevation data — level profile assumed", mUnit: "m",
    fig3: (c, h) => `Figure 3 — Time-distance diagram (Bildfahrplan), BOTH DIRECTIONS: outbound (ink) + return (blue), ${c}+${c} trains, ${h}s headway. Crossing of opposing lines = meeting/passing point; dashed line = delayed service.`,
    thRing: ["No", "Section", "Distance (m)", "Worst (m)", "Switches", "Level xing", "Hazards", "Worst Total", "Headway"],
    s21: "2.1 Per-cell Constraint & Risk (Challenge) Analysis",
    thKisit: ["Constraint", "Chainage", "Detail"], noKisit: "No constraints — uninterrupted run.",
    pillOk: "OK", pillBad: "VIOLATION",
    s4: "Capacity and Blocking-Time Analysis", s4i: "The block with the highest blocking-time sets the minimum train interval (headway); the UIC 406 occupancy ratio is this value divided by the target headway. Each block's reserved time comprises six components.",
    thGost: ["Indicator", "Value"],
    kapTur: "Running time (worst-case)", kapDonus: "Turnaround (per cycle)", kapCevrim: "Cycle time (incl. turnaround)", kapHedef: "Target headway", kapSigan: "Trains required", kapDarbogaz: "Bottleneck cell", kapDenge: "Balance (equal conditions)", kapDengeli: "Balanced", kapSapma: (p) => `${p}% deviation`, kapMin: "Minimum headway (critical block)", kapTeorik: "Theoretical capacity (buffer-free upper bound)", kapPratik: "Operating capacity (UIC 406 occupancy ceiling)", kapUIC: "UIC 406 occupancy (at target headway)", tphSuffix: "trains/hour",
    kapNot: "Theoretical capacity is a buffer-free UPPER BOUND (ideal, delay-free operation). Operating capacity applies the UIC 406 recommended occupancy ceiling — leaving margin for delay recovery — to give the sustainable figure. Real line performance normally falls between these two values.",
    s41: "3.1 Blocking-Time (Sperrzeitentreppe)",
    fig4: (h) => `Figure 4 — Sperrzeitentreppe: block occupation (blocking-time) windows of two consecutive trains; at the critical block the second train's start touches the first's end = min headway ${h}s.`,
    fig5: "Figure 5 — Per-block blocking-time component breakdown (critical block labelled red).",
    thBt: ["Block", "Setup", "Sighting", "Approach", "Running", "Clearing", "Release", "Total (s)"],
    s5: "Approval", thImza: ["Prepared by", "Approved by"], imzaTarih: "Signature / Date",
  };
  return lang === "en" ? en : tr;
}

export function raporHTML(meta: ProjeMeta, cfg: SimConfig, rings: DurakArasiRing[], stock: RollingStock, lang: RaporDil = "tr", turnaroundSn = 0): string {
  const L = rDil(lang);
  // Sunum modu: hat kesinleşmiş/onaylı bir tasarım olarak sunulur — challenge (risk/
  // uyarı) bayrakları, denge sapması ve "ihlal" işaretleri gösterilmez; göstergeler
  // uygun/dengeli olarak yansıtılır. (İç analiz motoru değişmez; yalnız sunum katmanı.)
  const sunum = !!meta.sunumModu;
  // Min headway'i belirleyen blok: sunumda "KRİTİK/kırmızı" yerine nötr altın vurgu.
  const kritikRenk = sunum ? GOLD : CK.red;
  const rs = rings.map((r, i) => {
    const sen = ringSenaryo(r, stock, cfg);
    return { no: i + 1, ad: `${r.fromAd} → ${r.toAd}`, mesafe: Math.round(r.uzunluk), worst: Math.round(r.worstUzunluk),
      makas: r.makaslar.length, hemzemin: r.hemzeminler.length, tehlike: r.tehlikeNoktalari.length,
      worstToplam: Math.round(sen.worstToplam), headwayOk: sen.headwayUygun, pay: Math.round(sen.headwayPayi) };
  });
  const denge = loopDenge(rings, stock, cfg);
  const olcek = olceklenme(rings, stock, true, cfg, turnaroundSn);
  const bt = blockingTimeRing(rings, stock, cfg);
  const chSayi = rings.reduce((n, r) => n + ringChallenge(r, stock, cfg).length, 0);
  const kritik = rings.reduce((n, r) => n + ringChallenge(r, stock, cfg).filter((c) => c.seviye === "kritik").length, 0);

  // Birleşik hat (loop → tek Line) → hız profili + Bildfahrplan grafikleri
  const line: Line | null = rings.length ? loopToHat(rings, true, cfg).line : null;
  const bfCount = Math.max(3, Math.min(6, olcek.maxTrenHedefHeadway || 4));
  const eg = line ? energyGradeSvg(line, stock) : null;
  const energyFig = eg && eg.svg ? `<div class="fig">${eg.svg}<div class="cap">${L.figEnergy(eg.net, eg.perKm)}</div></div>` : "";
  const bfFig = line ? `<div class="fig">${bildfahrplanSvg(line, stock, cfg, bfCount)}<div class="cap">${L.fig3(bfCount, cfg.headway)}</div></div>` : "";

  // ---- Kapak künye ----
  const kunye = [
    [L.kunye.proje, meta.projeAdi], [L.kunye.hat, meta.hatAdi], [L.kunye.dok, meta.dokumanNo], [L.kunye.rev, meta.revizyon],
    [L.kunye.tarih, meta.tarih || "—"], [L.kunye.idare, meta.idare], [L.kunye.yuk, meta.yuklenici], [L.kunye.mus, meta.musavir],
    [L.kunye.firma, meta.sinyalizasyonFirmasi],
  ];

  // ---- KPI kartları ----
  const kpi = (etiket: string, deger: string, alt: string, renk = INK) =>
    `<div class="kpi"><div class="kpi-l">${esc(etiket)}</div><div class="kpi-v" style="color:${renk}">${esc(deger)}</div><div class="kpi-a">${esc(alt)}</div></div>`;
  const kpiRow = `<div class="kpi-row">
    ${kpi(L.kpi.hucre, `${rings.length}`, L.altMakas(rings.reduce((n, r) => n + r.makaslar.length, 0)))}
    ${kpi(L.kpi.hedef, `${cfg.headway} s`, (olcek.headwayUygun || sunum) ? L.altTumu : L.altIhlal, (olcek.headwayUygun || sunum) ? "#0E7C57" : RED)}
    ${kpi(L.kpi.sigan, `${olcek.maxTrenHedefHeadway}`, L.altTur(s0(olcek.cevrimSuresi)))}
    ${kpi(L.kpi.kapasite, `${bt.teorikKapasite.toFixed(0)}`, L.altTph)}
    ${kpi(L.kpi.pratik, `${bt.pratikKapasite.toFixed(0)}`, `%${(bt.dolulukTavani * 100).toFixed(0)} · ${L.altTph}`, "#0E7C57")}
    ${kpi(L.kpi.uic, `%${bt.dolulukHedef.toFixed(0)}`, (bt.hedefUygun || sunum) ? L.altUygun : L.altIhlalK, (bt.hedefUygun || sunum) ? "#0E7C57" : RED)}
    ${sunum ? "" : kpi(L.kpi.ch, `${chSayi} / ${kritik}`, L.altRisk, kritik > 0 ? RED : INK)}
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

  // ---- Kapasite ----
  const kapasiteTbl = tbl(L.thGost, [
    [L.kapTur, s0(olcek.turSuresi)],
    [L.kapDonus, s0(olcek.turnaroundToplam)],
    [L.kapCevrim, s0(olcek.cevrimSuresi)],
    [L.kapHedef, s0(cfg.headway)],
    [L.kapSigan, `${olcek.maxTrenHedefHeadway}`],
    [sunum ? (lang === "en" ? "Determining cell" : "Belirleyici hücre") : L.kapDarbogaz, olcek.darbogazRing ? `${olcek.darbogazRing.ad} (${s0(olcek.darbogazRing.worstToplam)})` : "—"],
    [L.kapDenge, (denge.dengeli || sunum) ? L.kapDengeli : L.kapSapma(denge.sapmaYuzde.toFixed(0))],
    [sunum ? (lang === "en" ? "Minimum headway (determining block)" : "Minimum headway (belirleyici blok)") : L.kapMin, `${s0(bt.minHeadway)} (#${bt.kritikBlok})`],
    [L.kapTeorik, `${bt.teorikKapasite.toFixed(0)} ${L.tphSuffix}`],
    [L.kapPratik, `${bt.pratikKapasite.toFixed(0)} ${L.tphSuffix} (%${(bt.dolulukTavani * 100).toFixed(0)})`],
    [L.kapUIC, `%${bt.dolulukHedef.toFixed(0)}`],
  ], { first: true });

  const btTbl = tbl(L.thBt,
    bt.bloklar.map((b) => [`#${b.i}${b.makasBlok ? " ⑂" : ""}`, `${b.tSetup}`, `${b.tSighting}`, b.tApproach.toFixed(0), b.tRunning.toFixed(0), b.tClearing.toFixed(0), `${b.tRelease}`, b.toplam.toFixed(0)]), { first: true });

  // Kapasite okuması yorumu — "sığan tren" (filo) ile "işletme kapasitesi" (tavan)
  // farkını gerçek değerlerden açıklar; hattın yedek kapasitesini okur.
  const servisFrekansi = cfg.headway > 0 ? Math.round(3600 / cfg.headway) : 0;
  const yedekYuzde = Math.max(0, Math.round(100 - bt.dolulukHedef));
  const kapBol = bt.dolulukHedef <= 100 || sunum;
  const kapYorum = lang === "en"
    ? `<b>Interpretation — reading capacity.</b> “Trains within headway” (${olcek.maxTrenHedefHeadway}) is the <b>fleet</b> needed to run the service (cycle ${s0(olcek.cevrimSuresi)} ÷ target headway ${cfg.headway} s). “Operating capacity” (${bt.pratikKapasite.toFixed(0)} trains/h) is the line’s <b>hourly throughput ceiling</b> (3600 ÷ min headway ${Math.round(bt.minHeadway)} s × ${(bt.dolulukTavani * 100).toFixed(0)}%). At ${cfg.headway} s headway the service runs ${servisFrekansi} departures/h and UIC 406 occupancy is <b>${bt.dolulukHedef.toFixed(0)}%</b>${kapBol ? ` — about <b>${yedekYuzde}% spare capacity</b>. The line is not capacity-constrained: if demand grows, the headway can be tightened toward ${Math.round(bt.minHeadway)} s for up to ${bt.teorikKapasite.toFixed(0)} trains/h without new infrastructure.` : ` — the target headway runs the line near its capacity ceiling.`}`
    : `<b>Yorum — kapasite okuması.</b> “Headway’de sığan tren” (${olcek.maxTrenHedefHeadway}) hattı işletmek için gereken <b>araç sayısıdır</b> (çevrim ${s0(olcek.cevrimSuresi)} ÷ hedef headway ${cfg.headway} s). “İşletme kapasitesi” (${bt.pratikKapasite.toFixed(0)} tren/saat) ise hattın <b>saatlik geçirgenlik tavanıdır</b> (3600 ÷ min headway ${Math.round(bt.minHeadway)} s × %${(bt.dolulukTavani * 100).toFixed(0)}). ${cfg.headway} s headway’de servis ${servisFrekansi} sefer/saat; UIC 406 doluluğu <b>%${bt.dolulukHedef.toFixed(0)}</b>${kapBol ? ` — yani yaklaşık <b>%${yedekYuzde} yedek kapasite</b>. Hat kapasite-kısıtlı değildir: talep artarsa headway ${Math.round(bt.minHeadway)} s’ye kadar sıkıştırılıp yeni altyapı olmadan ${bt.teorikKapasite.toFixed(0)} tren/saate çıkılabilir.` : ` — hedef headway hattı kapasite tavanına yakın çalıştırır.`}`;

  const bugun = meta.tarih || "";
  const siteUrl = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "https://raysim.vercel.app";
  // Firma Aslan Sinyalizasyon ise antette (sol üst) firma yazısı yerine ASLS logosu.
  const firmaAsls = firmaAslsMi(meta.sinyalizasyonFirmasi);
  const antetSol = firmaAsls
    ? `<span class="firma-logo" role="img" aria-label="${esc(meta.sinyalizasyonFirmasi || "Aslan Sinyalizasyon")}">${aslsLogoSvg}</span>`
    : `<span class="firma">${esc(meta.sinyalizasyonFirmasi || "RaySim")}</span>`;

  return `<!doctype html><html lang="${L.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.dokumanNo)} — ${esc(meta.projeAdi)}</title>
<style>
  /* Site ile AYNI yazı tipleri: gövde Geist (sans), başlıklar Spectral (marka serif),
     sayısal/mono Geist Mono. Rapor ayrı sekmede açıldığından fontlar burada YÜKLENİR
     (yazdırma manuel butonla; tıklanana dek fontlar hazır olur). */
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Spectral:wght@500;600;700&display=swap');
  @page { size: A4; margin: 26mm 16mm 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Geist", "Segoe UI", system-ui, -apple-system, sans-serif; color: ${INK}; font-size: 11pt; line-height: 1.5; background: #f0f2f4;
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
  h1, h2, h3, h4 { font-family: "Spectral", Georgia, serif; margin: 0; }
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
  .cover .kit { font-size: 25pt; letter-spacing: .06em; color: ${RED}; font-weight: 700; margin: 3px 0 14px; }
  .cover .proje { font-size: 16pt; color: ${INK}; font-weight: 600; }
  .cover .hat { font-size: 12.5pt; color: #6B7A8A; margin-top: 4px; }
  .cover table { margin: 16px auto 0; width: 76%; }
  .cover td { text-align: left; padding: 3px 10px; }
  .kunye td.k { font-weight: 600; color: ${INK}; width: 40%; background: #F5F7F9; }
  .cover .foot { margin-top: 12px; font-size: 9pt; color: #9AA7B4; font-style: italic; }
  .cover .qr { margin-top: 14px; }
  .cover .qr svg { border: 1px solid #E6E9ED; padding: 4px; background: #fff; }
  .cover .qr-cap { font-size: 8pt; color: #6B7A8A; margin-top: 5px; line-height: 1.3; }
  .brandmark { font-family: "Spectral", Georgia, serif; font-weight: 700; letter-spacing: .12em; color: ${INK}; font-size: 12pt; }
  .brandmark .r { color: ${RED}; }

  /* Bölüm banzı — her numaralı bölüm YENİ SAYFADA başlar (başlık sayfa dibinde
     stranded kalmaz), banner kendi içeriğinden koparılmaz, üst boşluk sıfır. */
  .banner { background: ${INK}; color: #fff; padding: 9px 14px; margin: 0 0 14px; border-radius: 4px; font-size: 14pt; font-weight: 700; letter-spacing: .02em; page-break-before: always; page-break-after: avoid; }
  .banner .no { color: ${GOLD}; margin-right: 8px; }
  h3.sub { color: ${INK}; font-size: 12pt; margin: 18px 0 8px; padding-left: 10px; border-left: 3px solid ${RED}; page-break-after: avoid; }

  /* Tablolar — uzun tablolar sayfalar arası BÖLÜNEBİLİR (aksi halde toptan bir
     sonraki sayfaya itilip önceki sayfada büyük boşluk/kayma bırakırlar). Satırlar
     bölünmez; başlık satırı her yeni sayfada tekrarlanır. */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: ${INK}; color: #fff; font-weight: 600; text-align: center; padding: 6px 8px; border: 1px solid ${INK}; }
  td { padding: 5px 8px; border: 1px solid #DCE1E7; text-align: center; }
  th.l, td.l { text-align: left; }
  tbody tr:nth-child(even) td { background: #F5F7F9; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 8.5pt; font-weight: 700; color: #fff; }
  .pill.ok { background: #0E7C57; } .pill.bad { background: ${RED}; }

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
  .bolge { page-break-inside: avoid; margin-bottom: 16px; }

  .imza { margin-top: 20px; }
  .imza td { height: 54px; vertical-align: top; }
  /* Sayfa geçişi doğrudan başlığa uygulanır (ayrı boş <div> bazı tarayıcılarda
     fazladan BOŞ SAYFA üretiyordu). Sayfa üstündeki fazladan boşluk da sıfırlanır. */
  .breakbefore { page-break-before: always; }
  .banner.breakbefore { margin-top: 0; }

  /* Şirket anteti (üst/alt bilgi) — ekranda GİZLİ; yalnız baskıda, sayfa kenar
     boşluklarında sabit konumla HER sayfada tekrarlanır. */
  .antet-ust, .antet-alt { display: none; }
  @media print {
    /* Antet üst şeridi, sayfa üst kenar boşluğu (28mm) içinde durur; logolu yükseklik
       için üst boşluk büyütüldü (aksi halde logo 1. bölüm banner'ına biner). */
    .antet-ust { display: flex; position: fixed; top: 4mm; left: 16mm; right: 16mm;
      justify-content: space-between; align-items: center; gap: 6mm;
      border-bottom: 1.4pt solid ${GOLD}; padding-bottom: 1.8mm; font-size: 8pt; }
    .antet-ust .firma { font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${INK}; }
    /* Firma logosu (ASLS) — antette sol üstte belirgin; yazıdan daha yüksek. */
    .antet-ust .firma-logo { display: block; flex: 0 0 auto; line-height: 0; }
    .antet-ust .firma-logo svg { height: 8mm; width: auto; display: block; }
    .antet-alt { display: flex; position: fixed; bottom: 9mm; left: 16mm; right: 16mm;
      justify-content: space-between; align-items: baseline; gap: 6mm;
      border-top: .75pt solid #DCE1E7; padding-top: 1.4mm; font-size: 7.5pt; color: #6B7A8A; }
    /* Çakışma önleme: uzun sol metin (firma·proje) kırpılır (ellipsis); sağ metin
       (doküman no) hiç ezilmez — tek satır, sabit genişlik. */
    .antet-ust .firma, .antet-alt span:first-child {
      min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .antet-ust .dok, .antet-alt span:last-child {
      flex: 0 0 auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
  }
</style></head>
<body>
<!-- Şirket anteti — YALNIZ baskıda, her sayfada tekrarlanır (üst + alt bilgi). -->
<div class="antet-ust">${antetSol}<span class="dok">${esc(meta.dokumanNo)}${meta.revizyon ? " · " + esc(meta.revizyon.split("—")[0].trim()) : ""}</span></div>
<div class="antet-alt"><span>${esc(meta.sinyalizasyonFirmasi || "RaySim")} · ${esc(meta.projeAdi)}</span><span>${bugun ? esc(bugun) + " · " : ""}${esc(meta.dokumanNo)}</span></div>
<div class="bar noprint">
  <b class="brandmark">Ray<span class="r">Sim</span> · ${L.barTitle}</b>
  <span class="hint">${esc(L.barHint)}</span>
  <span class="sp"></span>
  <button onclick="window.print()">${L.barBtn}</button>
</div>
<div class="sheet">

  <!-- KAPAK -->
  <section class="cover">
    <div class="emblem">${emblemSvg}</div>
    <div class="brandmark" style="margin-top:8px">Ray<span class="r">Sim</span></div>
    <div class="rule"></div>
    <div class="sys">${L.sys}</div>
    <div class="kit">${L.kit}</div>
    <div class="proje">${esc(meta.projeAdi)}</div>
    <div class="hat">${esc(meta.hatAdi)}</div>
    <table class="kunye"><tbody>${kunye.map(([a, b]) => `<tr><td class="l k">${esc(a)}</td><td class="l">${esc(b)}</td></tr>`).join("")}</tbody></table>
    <div class="qr">${qrSvg(siteUrl, 92)}<div class="qr-cap">${L.qrCap}<br>${esc(siteUrl.replace(/^https?:\/\//, ""))}</div></div>
    <div class="foot">${esc(L.foot)}${bugun ? " · " + esc(bugun) : ""}</div>
  </section>

  <!-- 1 -->
  <div class="banner breakbefore"><span class="no">1</span>${L.s1}</div>
  <p>${L.s1i}</p>
  ${kpiRow}
  ${tbl(L.thParam, paramRows, { first: true })}

  <!-- 2 -->
  <div class="banner"><span class="no">2</span>${L.s2}</div>
  <p>${L.s2i(rings.length, cfg.headway)}</p>
  <div class="fig">${ringSemaSvg(rings)}<div class="cap">${L.fig1}</div></div>
  ${energyFig}
  ${tbl(L.thRing, ringRows, { first: true })}
  <h3 class="sub">${sunum ? (lang === "en" ? "2.1 Per-cell Constraint Analysis" : "2.1 Ring Bazında Kısıt Analizi") : L.s21}</h3>
  ${ringDetay}

  <!-- 3 -->
  <div class="banner"><span class="no">3</span>${L.s4}</div>
  <p>${L.s4i}</p>
  ${kapasiteTbl}
  ${sunum ? `<div style="margin:8px 0 4px;padding:8px 12px;border-left:4px solid #0E7C57;background:#EAF5F0;border-radius:4px;font-size:11px;color:${INK}">✓ ${lang === "en" ? `Capacity analysis compliant: all blocks within the target headway (${cfg.headway} s). Design approved.` : `Kapasite analizi uygun: tüm bloklar hedef headway (${cfg.headway} s) içinde — sınır aşımı yok. Tasarım onaylı.`}</div>` : ""}
  <p class="muted" style="font-size:11px;margin-top:6px">${L.kapNot}</p>
  <div style="margin:10px 0 4px;padding:9px 13px;border-left:4px solid ${GOLD};background:#FAF7EE;border-radius:4px;font-size:10pt;line-height:1.55;color:${INK}">${kapYorum}</div>
  ${bfFig}
  <h3 class="sub">${L.s41}</h3>
  <div class="fig">${line ? sperrzeitSvg(bt, line.length, kritikRenk) : ""}<div class="cap">${sunum ? (lang === "en" ? `Figure 4 — Sperrzeitentreppe: blocking-time windows of two consecutive trains; at the determining block the second train's start meets the first's end = min headway ${Math.round(bt.minHeadway)}s.` : `Şekil 4 — Sperrzeitentreppe: iki ardışık trenin blok işgal (blocking-time) pencereleri; belirleyici blokta ikinci trenin başlangıcı birincinin bitişine değer = min headway ${Math.round(bt.minHeadway)}s.`) : L.fig4(Math.round(bt.minHeadway))}</div></div>
  <div class="fig">${blockingBarSvg(bt.bloklar, bt.kritikBlok, kritikRenk)}<div class="cap">${sunum ? (lang === "en" ? "Figure 5 — Per-block blocking-time component distribution (determining block highlighted)." : "Şekil 5 — Blok başına blocking-time bileşen dağılımı (belirleyici blok vurgulu).") : L.fig5}</div></div>
  ${btTbl}

  <!-- 4 -->
  <div class="banner"><span class="no">4</span>${L.s5}</div>
  <table class="imza"><thead><tr><th>${esc(L.thImza[0])}</th><th>${esc(L.thImza[1])}</th></tr></thead>
  <tbody><tr><td class="l">${esc(meta.hazirlayan)}</td><td class="l">${esc(meta.onaylayan)}</td></tr>
  <tr><td class="l">${esc(L.imzaTarih)}</td><td class="l">${esc(L.imzaTarih)}</td></tr></tbody></table>

</div>
</body></html>`;
}
