// raysim — ŞIK PDF RAPORU (baskıya hazır HTML → tarayıcı "PDF olarak kaydet").
//
// Amaç: doküman üreticinin (dokuman.ts) düz Word/Excel çıktısının yanında,
// görsel olarak yüksek kaliteli, kurumsal, baskıya hazır bir Tasarım El Kitabı
// raporu üretmek. Amblemli kapak + renk kodlu bölüm banzları + gömülü şema/grafik
// + renkli çakışma matriksleri. İçerik tamamen girilen projeden türer.
//
// Tarayıcıda çalışır: yeni pencerede açar, yazdırma diyalogunu tetikler
// (kullanıcı "Hedef: PDF olarak kaydet" ile indirir). SSR'de çağrılmaz.

import { emblemSvg } from "@/lib/emblem";
import type { SimConfig, ProjeMeta } from "./config";
import { PARAM_META, paramGoster, birim } from "./config";
import type { RollingStock } from "./types";
import {
  ringSenaryo, ringChallenge, ringKisitDizisi, loopDenge, olceklenme,
  type DurakArasiRing,
} from "./ring";
import { bolgeSeed, cakismaMatriksi } from "./interlocking";
import { blockingTimeRing } from "./blockingtime";
import { loopToHat } from "./hatsim";
import { simulate } from "./sim";
import { simulateSignalled } from "./signalling";
import type { Line } from "./types";

const INK = "#0C2233";
const RED = "#C8102E";
const GOLD = "#A8842C";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
const s0 = (v: number) => `${Math.round(v)} s`;

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
  const W = 760, pad = 46, y = 78;
  const step = (W - 2 * pad) / Math.max(1, n);
  const dots: string[] = [];
  const labels: string[] = [];
  const marks: string[] = [];
  const px = (i: number) => pad + i * step;
  // istasyonlar: from(0) → her toAd
  const adlar = [rings[0].fromAd, ...rings.map((r) => r.toAd)];
  adlar.forEach((ad, i) => {
    const x = px(i);
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y}" r="5" fill="#fff" stroke="${INK}" stroke-width="2"/>`);
    labels.push(`<text x="${x.toFixed(1)}" y="${y - 14}" text-anchor="middle" font-size="10" fill="${INK}">${esc(ad)}</text>`);
  });
  // hat çizgisi
  const line = `<line x1="${px(0)}" y1="${y}" x2="${px(n)}" y2="${y}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  // makas + hemzemin işaretleri (segment altında)
  rings.forEach((r, i) => {
    const xm = (px(i) + px(i + 1)) / 2;
    if (r.makaslar.length) marks.push(`<text x="${xm.toFixed(1)}" y="${y + 22}" text-anchor="middle" font-size="12" fill="${RED}">⑂ ${r.makaslar.length}</text>`);
    if (r.hemzeminler.length) marks.push(`<text x="${xm.toFixed(1)}" y="${y + 38}" text-anchor="middle" font-size="10" fill="${GOLD}">⊟ ${r.hemzeminler.length} hemzemin</text>`);
  });
  return `<svg viewBox="0 0 ${W} 120" width="100%" style="max-width:${W}px">${line}${marks.join("")}${dots.join("")}${labels.join("")}</svg>`;
}

// Blocking-time bileşen barları (gömülü SVG): her blok için yığılı süre.
function blockingBarSvg(bloklar: { i: number; makasBlok?: boolean; tSetup: number; tSighting: number; tApproach: number; tRunning: number; tClearing: number; tRelease: number; toplam: number }[], kritik: number): string {
  if (!bloklar.length) return "";
  const parts = [
    { k: "tSetup", c: "#0C2233", ad: "Setup" }, { k: "tSighting", c: "#2E5A7A", ad: "Görme" },
    { k: "tApproach", c: "#0C6DB8", ad: "Yaklaşma" }, { k: "tRunning", c: "#0E7C57", ad: "Seyir" },
    { k: "tClearing", c: "#A8842C", ad: "Temizleme" }, { k: "tRelease", c: "#C8102E", ad: "Release" },
  ] as const;
  const max = Math.max(...bloklar.map((b) => b.toplam)) || 1;
  const rowH = 22, W = 760, labelW = 70, barW = W - labelW - 60;
  const rows = bloklar.map((b, idx) => {
    let x = labelW;
    const yy = idx * rowH + 6;
    const segs = parts.map((p) => {
      const v = b[p.k] as number;
      const w = (v / max) * barW;
      const rect = `<rect x="${x.toFixed(1)}" y="${yy}" width="${Math.max(0, w).toFixed(1)}" height="14" fill="${p.c}"/>`;
      x += w;
      return rect;
    }).join("");
    const kr = b.i === kritik;
    return `<text x="0" y="${yy + 11}" font-size="10" fill="${kr ? RED : INK}" font-weight="${kr ? 700 : 400}">#${b.i}${b.makasBlok ? " ⑂" : ""}</text>${segs}<text x="${(x + 5).toFixed(1)}" y="${yy + 11}" font-size="10" fill="${INK}">${b.toplam.toFixed(0)}s</text>`;
  }).join("");
  const legend = parts.map((p, i) => `<rect x="${labelW + i * 118}" y="${bloklar.length * rowH + 14}" width="10" height="10" fill="${p.c}"/><text x="${labelW + i * 118 + 14}" y="${bloklar.length * rowH + 23}" font-size="9" fill="${INK}">${p.ad}</text>`).join("");
  const H = bloklar.length * rowH + 40;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${rows}${legend}</svg>`;
}

// Hız-mesafe profili (gömülü SVG): worst-case tek tren, vmax zarfı + fiili hız.
function speedProfileSvg(line: Line, stock: RollingStock): string {
  if (line.length <= 0) return "";
  const res = simulate(line, stock, 0.5);
  if (!res.points.length) return "";
  const L = line.length;
  const W = 760, H = 210, padL = 44, padR = 12, padT = 14, padB = 30;
  const pw = W - padL - padR, ph = H - padT - padB;
  const vmax = Math.max(...line.segments.map((s) => s.vmax), ...res.points.map((p) => p.v * 3.6), 10);
  const vAxis = Math.ceil(vmax / 10) * 10;
  const xOf = (s: number) => padL + (s / L) * pw;
  const yOf = (vk: number) => padT + ph - (vk / vAxis) * ph;
  const yTicks = [0, vAxis / 2, vAxis].map((v) =>
    `<line x1="${padL}" y1="${yOf(v).toFixed(1)}" x2="${W - padR}" y2="${yOf(v).toFixed(1)}" stroke="#E6E9ED"/><text x="${padL - 6}" y="${(yOf(v) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#6B7A8A">${v.toFixed(0)}</text>`).join("");
  const st = line.stations.map((s) =>
    `<line x1="${xOf(s.position).toFixed(1)}" y1="${padT}" x2="${xOf(s.position).toFixed(1)}" y2="${padT + ph}" stroke="#DCE1E7" stroke-dasharray="2 3"/>`).join("");
  const env = line.segments.map((s) =>
    `<line x1="${xOf(s.start).toFixed(1)}" y1="${yOf(s.vmax).toFixed(1)}" x2="${xOf(s.end).toFixed(1)}" y2="${yOf(s.vmax).toFixed(1)}" stroke="${RED}" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.85"/>`).join("");
  const spd = res.points.map((p) => `${xOf(p.s).toFixed(1)},${yOf(p.v * 3.6).toFixed(1)}`).join(" ");
  const speed = `<polyline points="${spd}" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
  const axis = `<text x="${padL}" y="${H - 8}" font-size="9" fill="#6B7A8A">mesafe (m) →</text><text x="8" y="${padT + 8}" font-size="9" fill="#6B7A8A">km/h</text><text x="${W - padR}" y="${padT + 10}" text-anchor="end" font-size="8.5" fill="${RED}">– – hız limiti · — fiili hız</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${yTicks}${st}${env}${speed}${axis}</svg>`;
}

// Zaman-mesafe diyagramı / Bildfahrplan (gömülü SVG): çok tren, headway merdiveni.
function bildfahrplanSvg(line: Line, stock: RollingStock, cfg: SimConfig, count: number): string {
  if (line.length <= 0) return "";
  const sig = simulateSignalled(line, stock, { headway: cfg.headway, count, maxBlockLen: cfg.blokMaxUzunluk });
  const L = line.length, tMax = Math.max(1, sig.tMax);
  const W = 760, H = 240, padL = 78, padR = 12, padT = 12, padB = 26;
  const pw = W - padL - padR, ph = H - padT - padB;
  const xOf = (t: number) => padL + (t / tMax) * pw;
  const yOf = (s: number) => padT + (s / L) * ph; // s=0 üstte, s=L altta
  const st = line.stations.map((s) =>
    `<line x1="${padL}" y1="${yOf(s.position).toFixed(1)}" x2="${W - padR}" y2="${yOf(s.position).toFixed(1)}" stroke="#E6E9ED"/><text x="${padL - 6}" y="${(yOf(s.position) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#6B7A8A">${esc(s.name)}</text>`).join("");
  const tg = Array.from({ length: 7 }).map((_, i) => {
    const t = (tMax * i) / 6, x = xOf(t);
    return `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="#EEF1F4"/><text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="8" fill="#6B7A8A">${Math.round(t / 60)}′</text>`;
  }).join("");
  const trns = sig.trains.map((tr) => {
    const col = tr.delay > 2 ? RED : INK;
    const pts = tr.points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.s).toFixed(1)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4" opacity="0.9"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${st}${tg}${trns}</svg>`;
}

export function raporHTML(meta: ProjeMeta, cfg: SimConfig, rings: DurakArasiRing[], stock: RollingStock): string {
  const rs = rings.map((r, i) => {
    const sen = ringSenaryo(r, stock, cfg);
    return { no: i + 1, ad: `${r.fromAd} → ${r.toAd}`, mesafe: Math.round(r.uzunluk), worst: Math.round(r.worstUzunluk),
      makas: r.makaslar.length, hemzemin: r.hemzeminler.length, tehlike: r.tehlikeNoktalari.length,
      worstToplam: Math.round(sen.worstToplam), headway: sen.headwayUygun ? "UYGUN" : "İHLAL", pay: Math.round(sen.headwayPayi) };
  });
  const denge = loopDenge(rings, stock, cfg);
  const olcek = olceklenme(rings, stock, true, cfg);
  const zones = bolgeSeed();
  const bt = blockingTimeRing(rings, stock, cfg);
  const chSayi = rings.reduce((n, r) => n + ringChallenge(r, stock, cfg).length, 0);
  const kritik = rings.reduce((n, r) => n + ringChallenge(r, stock, cfg).filter((c) => c.seviye === "kritik").length, 0);

  // Birleşik hat (loop → tek Line) → hız profili + Bildfahrplan grafikleri
  const line: Line | null = rings.length ? loopToHat(rings, true, cfg).line : null;
  const bfCount = Math.max(3, Math.min(6, olcek.maxTrenHedefHeadway || 4));
  const hizFig = line ? `<div class="fig">${speedProfileSvg(line, stock)}<div class="cap">Şekil 2 — Hız-mesafe profili (worst-case tek tren): kırmızı kesikli = hız limiti zarfı, mürekkep = fiili hız.</div></div>` : "";
  const bfFig = line ? `<div class="fig">${bildfahrplanSvg(line, stock, cfg, bfCount)}<div class="cap">Şekil 3 — Zaman-mesafe diyagramı (Bildfahrplan): ${bfCount} tren, ${cfg.headway}s aralık; kırmızı = gecikmeli sefer.</div></div>` : "";

  // ---- Kapak künye ----
  const kunye = [
    ["Proje", meta.projeAdi], ["Hat", meta.hatAdi], ["Doküman No", meta.dokumanNo], ["Revizyon", meta.revizyon],
    ["Tarih", meta.tarih || "—"], ["İdare", meta.idare], ["Yüklenici", meta.yuklenici], ["Müşavir", meta.musavir],
    ["Sinyalizasyon Firması", meta.sinyalizasyonFirmasi],
  ];

  // ---- KPI kartları ----
  const kpi = (etiket: string, deger: string, alt: string, renk = INK) =>
    `<div class="kpi"><div class="kpi-l">${esc(etiket)}</div><div class="kpi-v" style="color:${renk}">${esc(deger)}</div><div class="kpi-a">${esc(alt)}</div></div>`;
  const kpiRow = `<div class="kpi-row">
    ${kpi("Durak arası hücre", `${rings.length}`, `${rings.reduce((n, r) => n + r.makaslar.length, 0)} makas`)}
    ${kpi("Hedef headway", `${cfg.headway} s`, olcek.headwayUygun ? "tümü uygun" : "ihlal var", olcek.headwayUygun ? "#0E7C57" : RED)}
    ${kpi("Headway'de sığan tren", `${olcek.maxTrenHedefHeadway}`, `tur ${s0(olcek.turSuresi)}`)}
    ${kpi("Teorik kapasite", `${bt.teorikKapasite.toFixed(0)}`, "tren/saat")}
    ${kpi("UIC 406 doluluk", `%${bt.dolulukHedef.toFixed(0)}`, bt.hedefUygun ? "uygun" : "ihlal", bt.hedefUygun ? "#0E7C57" : RED)}
    ${kpi("Challenge / kritik", `${chSayi} / ${kritik}`, "risk kaydı", kritik > 0 ? RED : INK)}
  </div>`;

  // ---- Parametre tablosu ----
  const paramRows = PARAM_META.map((m) => [m.ad, `${paramGoster(cfg, m).toFixed(m.tur === "ivme" ? 1 : 0)} ${birim(m.tur)}`, m.etkiler]);

  // ---- Ring tablosu ----
  const ringRows = rs.map((r) => [
    `${r.no}`, r.ad, `${r.mesafe}`, `${r.worst}`, `${r.makas}`, `${r.hemzemin}`, `${r.tehlike}`, s0(r.worstToplam),
    `<span class="pill ${r.headway === "UYGUN" ? "ok" : "bad"}">${r.headway} (${r.pay >= 0 ? "+" : ""}${r.pay}s)</span>`,
  ]);

  // ---- Ring challenge detayları ----
  const ringDetay = rings.map((r) => {
    const kisit = ringKisitDizisi(r);
    const ch = ringChallenge(r, stock, cfg);
    const kisitTbl = kisit.length
      ? tbl(["Kısıt", "Konum (m)", "Detay"], kisit.map((k) => [k.ad, `${Math.round(k.konum)}`, k.detay]))
      : `<p class="muted">Kısıt yok — kesintisiz seyir.</p>`;
    const chList = ch.length
      ? `<ul class="ch">${ch.map((c) => `<li class="${c.seviye === "kritik" ? "krit" : ""}"><b>[${esc(c.seviye.toUpperCase())}]</b> ${esc(c.baslik)}: ${esc(c.mesaj)}</li>`).join("")}</ul>`
      : "";
    return `<div class="ring-detay"><h4>${esc(r.fromAd)} → ${esc(r.toAd)}</h4>${kisitTbl}${chList}</div>`;
  }).join("");

  // ---- Makas bölgeleri + çakışma matriksleri ----
  const bolgeBlok = zones.map((z) => {
    const rotaTbl = tbl(["Rota", "Nereden", "Nereye", "Bloklar", "TCC"],
      z.rotalar.map((r) => [r.id, r.nereden, r.nereye, r.bloklar.join(", "), r.tccGerekli ? "Evet" : "Hayır"]), { first: true });
    const m = cakismaMatriksi(z);
    const mHead = `<tr><th></th>${z.rotalar.map((r) => `<th>${esc(r.nereden)}${esc(r.nereye)}</th>`).join("")}</tr>`;
    const mBody = z.rotalar.map((r, i) =>
      `<tr><th class="l">${esc(r.nereden)}${esc(r.nereye)}</th>${z.rotalar.map((_, j) =>
        i === j ? `<td class="mx diag">·</td>` : `<td class="mx ${m[i][j] ? "yes" : "no"}">${m[i][j] ? "X" : "0"}</td>`).join("")}</tr>`).join("");
    return `<div class="bolge"><h4>Bölge ${esc(z.id)} — ${esc(z.ad)}</h4>${rotaTbl}
      <div class="matris-etiket">Çakışma Matriksi <span class="mx-leg"><span class="yes">X</span> birlikte kurulabilir · <span class="no">0</span> mümkün değil</span></div>
      <table class="matris"><thead>${mHead}</thead><tbody>${mBody}</tbody></table></div>`;
  }).join("");

  // ---- Kapasite ----
  const kapasiteTbl = tbl(["Gösterge", "Değer"], [
    ["Tur süresi (worst-case)", s0(olcek.turSuresi)],
    ["Hedef headway", s0(cfg.headway)],
    ["Headway'de sığan tren", `${olcek.maxTrenHedefHeadway}`],
    ["Darboğaz hücre", olcek.darbogazRing ? `${olcek.darbogazRing.ad} (${s0(olcek.darbogazRing.worstToplam)})` : "—"],
    ["Denge (eşit şartlar)", denge.dengeli ? "Dengeli" : `%${denge.sapmaYuzde.toFixed(0)} sapma`],
    ["Minimum headway (kritik blok)", `${s0(bt.minHeadway)} (blok #${bt.kritikBlok})`],
    ["Teorik kapasite", `${bt.teorikKapasite.toFixed(0)} tren/saat`],
    ["UIC 406 doluluk (hedef headway'de)", `%${bt.dolulukHedef.toFixed(0)}`],
  ], { first: true });

  const btTbl = tbl(["Blok", "Setup", "Görme", "Yaklaşma", "Seyir", "Temizleme", "Release", "Toplam (s)"],
    bt.bloklar.map((b) => [`#${b.i}${b.makasBlok ? " ⑂" : ""}`, `${b.tSetup}`, `${b.tSighting}`, b.tApproach.toFixed(0), b.tRunning.toFixed(0), b.tClearing.toFixed(0), `${b.tRelease}`, b.toplam.toFixed(0)]), { first: true });

  const bugun = meta.tarih || "";

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.dokumanNo)} — ${esc(meta.projeAdi)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Spectral", Georgia, "Times New Roman", serif; color: ${INK}; font-size: 11pt; line-height: 1.5; background: #f0f2f4; }
  .page { background: #fff; }
  @media screen { .sheet { max-width: 800px; margin: 24px auto; box-shadow: 0 4px 24px rgba(12,34,51,.14); padding: 40px 46px; } }
  @media print { .sheet { padding: 0; } .noprint { display: none !important; } }
  h1, h2, h3, h4 { font-family: "Spectral", Georgia, serif; margin: 0; }
  p { margin: 0 0 8px; }
  .muted { color: #6B7A8A; }

  /* Araç çubuğu (ekranda) */
  .bar { position: sticky; top: 0; z-index: 10; background: ${INK}; color: #fff; display: flex; gap: 12px; align-items: center; padding: 10px 18px; font-family: system-ui, sans-serif; }
  .bar b { font-size: 13px; letter-spacing: .04em; }
  .bar .sp { flex: 1; }
  .bar button { background: ${RED}; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: system-ui, sans-serif; }
  .bar .hint { font-size: 11px; opacity: .8; font-family: system-ui, sans-serif; }

  /* Kapak */
  .cover { text-align: center; padding: 40px 0 24px; }
  .cover .emblem { display: inline-block; }
  .cover .emblem svg { width: 84px; height: 84px; }
  .cover .rule { width: 60px; height: 3px; background: ${RED}; margin: 14px auto 22px; }
  .cover .sys { font-size: 15pt; letter-spacing: .28em; color: ${INK}; font-weight: 600; }
  .cover .kit { font-size: 30pt; letter-spacing: .06em; color: ${RED}; font-weight: 700; margin: 4px 0 22px; }
  .cover .proje { font-size: 17pt; color: ${INK}; font-weight: 600; }
  .cover .hat { font-size: 13pt; color: #6B7A8A; margin-top: 4px; }
  .cover table { margin: 26px auto 0; width: 76%; }
  .cover td { text-align: left; }
  .kunye td.k { font-weight: 600; color: ${INK}; width: 40%; background: #F5F7F9; }
  .cover .foot { margin-top: 30px; font-size: 9pt; color: #9AA7B4; font-style: italic; }
  .brandmark { font-family: "Spectral", Georgia, serif; font-weight: 700; letter-spacing: .12em; color: ${INK}; font-size: 12pt; }
  .brandmark .r { color: ${RED}; }

  /* Bölüm banzı */
  .banner { background: ${INK}; color: #fff; padding: 9px 14px; margin: 26px 0 14px; border-radius: 4px; font-size: 14pt; font-weight: 700; letter-spacing: .02em; page-break-after: avoid; }
  .banner .no { color: ${GOLD}; margin-right: 8px; }
  h3.sub { color: ${INK}; font-size: 12pt; margin: 18px 0 8px; padding-left: 10px; border-left: 3px solid ${RED}; }

  /* Tablolar */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; page-break-inside: avoid; }
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

  .ring-detay { page-break-inside: avoid; margin-bottom: 14px; }
  .ring-detay h4, .bolge h4 { color: ${INK}; font-size: 11pt; margin: 12px 0 4px; }
  ul.ch { margin: 4px 0 8px; padding-left: 18px; font-size: 9.5pt; }
  ul.ch li.krit { color: ${RED}; }
  .bolge { page-break-inside: avoid; margin-bottom: 16px; }

  .imza { margin-top: 20px; }
  .imza td { height: 54px; vertical-align: top; }
  .breakbefore { page-break-before: always; }
</style></head>
<body>
<div class="bar noprint">
  <b class="brandmark">Ray<span class="r">Sim</span> · Rapor</b>
  <span class="hint">Yazdır diyalogunda “Hedef: PDF olarak kaydet”i seçin.</span>
  <span class="sp"></span>
  <button onclick="window.print()">⭳ PDF olarak kaydet / Yazdır</button>
</div>
<div class="sheet">

  <!-- KAPAK -->
  <section class="cover">
    <div class="emblem">${emblemSvg}</div>
    <div class="brandmark" style="margin-top:8px">Ray<span class="r">Sim</span></div>
    <div class="rule"></div>
    <div class="sys">SİNYALİZASYON SİSTEMİ</div>
    <div class="kit">TASARIM EL KİTABI</div>
    <div class="proje">${esc(meta.projeAdi)}</div>
    <div class="hat">${esc(meta.hatAdi)}</div>
    <table class="kunye"><tbody>${kunye.map(([a, b]) => `<tr><td class="l k">${esc(a)}</td><td class="l">${esc(b)}</td></tr>`).join("")}</tbody></table>
    <div class="foot">RaySim Sinyalizasyon Tasarım &amp; Dokümantasyon Sistemi tarafından üretilmiştir.${bugun ? " · " + esc(bugun) : ""}</div>
  </section>

  <!-- 1. TASARIM KRİTERLERİ -->
  <div class="breakbefore"></div>
  <div class="banner"><span class="no">1</span>Tasarım Kriterleri</div>
  <p>Sistem, sabit blok ve dağıtık SIL4 anklaşman mimarisi üzerine kurulmuştur. Aşağıdaki göstergeler ve parametreler tüm işletim senaryolarının temelini oluşturur.</p>
  ${kpiRow}
  ${tbl(["Parametre", "Değer", "Etkisi"], paramRows, { first: true })}

  <!-- 2. RING ŞARTLARI -->
  <div class="banner"><span class="no">2</span>Durak Arası İşletim Hücreleri</div>
  <p>Hat, ${rings.length} durak-arası hücreye (ring) bölünmüştür. Her hücre kendi mesafe, makas, hemzemin ve tehlike (acil frenleme) şartlarını taşır; worst-case senaryo en uzun mesafe + tüm kısıtlarla, hedef headway ${cfg.headway} s ile değerlendirilir.</p>
  <div class="fig">${ringSemaSvg(rings)}<div class="cap">Şekil 1 — Hat şeması: istasyon zinciri, makas (⑂) ve hemzemin geçit dağılımı.</div></div>
  ${hizFig}
  ${tbl(["No", "Durak Arası", "Mesafe (m)", "Worst (m)", "Makas", "Hemzemin", "Tehlike", "Worst Toplam", "Headway"], ringRows, { first: true })}
  <h3 class="sub">2.1 Ring Bazında Kısıt ve Risk (Challenge) Analizi</h3>
  ${ringDetay}

  <!-- 3. MAKAS BÖLGELERİ -->
  <div class="banner"><span class="no">3</span>Makas Bölgesi Operasyon Senaryoları ve Çakışma Matriksleri</div>
  <p>Her makas bölgesi bağımsız SIL4 anklaşman birimidir. Rotalar NEREDEN→NEREYE tanımlıdır; çakışma matriksi hangi rotaların eşzamanlı kurulabileceğini belirler.</p>
  ${bolgeBlok}

  <!-- 4. KAPASİTE -->
  <div class="banner"><span class="no">4</span>Kapasite ve Blocking-Time Analizi</div>
  <p>En yüksek blocking-time'lı blok minimum tren aralığını (headway) belirler; UIC 406 doluluk oranı bu değerin hedef headway'e bölümüdür. Her bloğun rezerve süresi altı bileşenden oluşur.</p>
  ${kapasiteTbl}
  ${bfFig}
  <h3 class="sub">4.1 Blocking-Time (Sperrzeitentreppe) Bileşen Dağılımı</h3>
  <div class="fig">${blockingBarSvg(bt.bloklar, bt.kritikBlok)}<div class="cap">Şekil 4 — Blok başına blocking-time bileşenleri (kritik blok kırmızı etiketli).</div></div>
  ${btTbl}

  <!-- 5. ONAY -->
  <div class="banner"><span class="no">5</span>Onay</div>
  <table class="imza"><thead><tr><th>Hazırlayan</th><th>Onaylayan</th></tr></thead>
  <tbody><tr><td class="l">${esc(meta.hazirlayan)}</td><td class="l">${esc(meta.onaylayan)}</td></tr>
  <tr><td class="l">İmza / Tarih</td><td class="l">İmza / Tarih</td></tr></tbody></table>

</div>
</body></html>`;
}

// Yeni pencerede aç + yazdırma diyalogunu tetikle (kullanıcı "PDF olarak kaydet" seçer).
export function yazdirRapor(html: string) {
  const w = window.open("", "_blank", "width=920,height=1000");
  if (!w) throw new Error("Açılır pencere engellendi — tarayıcıda bu site için pop-up iznini verin.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // İçerik (font/SVG) yerleşsin diye kısa gecikmeyle yazdır.
  setTimeout(() => { try { w.print(); } catch { /* kullanıcı butondan da yazdırabilir */ } }, 700);
}
