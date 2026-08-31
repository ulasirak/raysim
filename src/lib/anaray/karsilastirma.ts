// raysim — SENARYO KARŞILAŞTIRMA çekirdeği (ekran + PDF ORTAK).
// metrikHesapla: bir senaryonun motor metrikleri (maksimumTren/tersIsletmeAnaliz/…
// yani canlı sim ile BİREBİR aynı çekirdek). karsilastirmaHTML: bu metriklerden
// baskıya hazır kurumsal karar raporu (rapor.ts diliyle uyumlu).

import { emblemSvg } from "@/lib/emblem";
import { aslsLogoSvg, firmaAslsMi } from "./aslsLogo";
import { maksimumTren } from "./kapasite";
import { tersIsletmeAnaliz } from "./tersisletme";
import { dwellUygulanmisRings } from "./yolcu";
import { hatOzellikleri } from "./network";
import { loopToHat } from "./hatsim";
import type { DurakArasiRing } from "./ring";
import type { RollingStock } from "./types";
import type { SimConfig, Isletme, ProjeMeta } from "./config";

export interface Metrik {
  ad: string;
  gecerli: boolean;
  uzunlukKm: number; durak: number; makas: number; sinyal: number;
  nTeorik: number; nSurdurulebilir: number; hMin: number; cevrimDk: number;
  isletmeKap: number; teorikKap: number; uic: number; siganTren: number;
  gerekenFilo: number; tepeYuk: number; baglayan: string;
}

export function metrikHesapla(ad: string, ringsHam: DurakArasiRing[], stock: RollingStock, cfg: SimConfig, isletme: Isletme): Metrik {
  const rings = dwellUygulanmisRings(ringsHam ?? [], stock, isletme);
  const m = maksimumTren(rings, stock, cfg, isletme);
  const oz = hatOzellikleri(rings, cfg);
  const line = rings.length ? loopToHat(rings, false, cfg).line : null;
  const teorikKap = m.hMin > 0 ? 3600 / m.hMin : 0;
  const isletmeKap = teorikKap * (m.dolulukTavani || 1);
  const uic = (m.hMin > 0 && cfg.headway > 0) ? (m.hMin / cfg.headway) * 100 : 0;
  const siganTren = m.gecerli ? Math.ceil(m.cevrimSuresi / Math.max(1, cfg.headway)) : 0;
  const tia = rings.length >= 2 ? tersIsletmeAnaliz(rings, stock, isletme, cfg, "toplam") : null;
  return {
    ad, gecerli: m.gecerli,
    uzunlukKm: line ? line.length / 1000 : 0,
    durak: line ? line.stations.filter((s) => s.tip !== "gecit").length : 0,
    makas: rings.reduce((n, r) => n + r.makaslar.length, 0),
    sinyal: oz.filter((f) => f.kind === "sinyal").length,
    nTeorik: m.nTeorik, nSurdurulebilir: m.nSurdurulebilir, hMin: Math.round(m.hMin),
    cevrimDk: Math.round(m.cevrimSuresi / 60), isletmeKap: Math.round(isletmeKap),
    teorikKap: Math.round(teorikKap), uic: Math.round(uic), siganTren,
    gerekenFilo: tia ? tia.filo.gerekenArac : 0, tepeYuk: tia ? tia.tepeYuk : 0,
    baglayan: m.baglayanAd,
  };
}

export type Yon = "yuksek" | "dusuk" | "none";
export interface Satir { etiket: string; al: (m: Metrik) => number; yaz: (m: Metrik) => string; yon: Yon; }
export const SATIRLAR: Satir[] = [
  { etiket: "Hat uzunluğu (km)", al: (m) => m.uzunlukKm, yaz: (m) => m.uzunlukKm.toFixed(1), yon: "none" },
  { etiket: "Durak", al: (m) => m.durak, yaz: (m) => `${m.durak}`, yon: "none" },
  { etiket: "Makas", al: (m) => m.makas, yaz: (m) => `${m.makas}`, yon: "none" },
  { etiket: "Sinyal (SG)", al: (m) => m.sinyal, yaz: (m) => `${m.sinyal}`, yon: "none" },
  { etiket: "Teorik maks tramvay", al: (m) => m.nTeorik, yaz: (m) => `${m.nTeorik}`, yon: "yuksek" },
  { etiket: "Sürdürülebilir (UIC 406)", al: (m) => m.nSurdurulebilir, yaz: (m) => `${m.nSurdurulebilir}`, yon: "yuksek" },
  { etiket: "Min headway (s)", al: (m) => m.hMin, yaz: (m) => `${m.hMin}`, yon: "dusuk" },
  { etiket: "Çevrim (dk)", al: (m) => m.cevrimDk, yaz: (m) => `${m.cevrimDk}`, yon: "dusuk" },
  { etiket: "İşletme kapasitesi (tren/sa)", al: (m) => m.isletmeKap, yaz: (m) => `${m.isletmeKap}`, yon: "yuksek" },
  { etiket: "UIC doluluk (%)", al: (m) => m.uic, yaz: (m) => `%${m.uic}`, yon: "none" },
  { etiket: "Hedef sıklıkta gereken tren", al: (m) => m.siganTren, yaz: (m) => `${m.siganTren}`, yon: "dusuk" },
  { etiket: "Gereken filo (talep)", al: (m) => m.gerekenFilo, yaz: (m) => `${m.gerekenFilo}`, yon: "dusuk" },
  { etiket: "Tepe yük (yolcu/sa)", al: (m) => m.tepeYuk, yaz: (m) => `${m.tepeYuk}`, yon: "none" },
];

/** O satırda üstün senaryonun indeksi (yön'e göre); beraberlik/none → -1 (vurgu yok). */
export function enIyiIndeks(ms: Metrik[], s: Satir): number {
  if (s.yon === "none" || ms.length < 2) return -1;
  const gecerli = ms.map((m, i) => ({ m, i })).filter((x) => x.m.gecerli);
  if (gecerli.length < 2) return -1;
  const degerler = gecerli.map((x) => s.al(x.m));
  if (degerler.every((v) => v === degerler[0])) return -1;
  let bi = -1, bv = s.yon === "yuksek" ? -Infinity : Infinity;
  gecerli.forEach(({ m, i }) => { const v = s.al(m); if (s.yon === "yuksek" ? v > bv : v < bv) { bv = v; bi = i; } });
  return bi;
}

// —————————————————— PDF (baskıya hazır HTML) ——————————————————

const INK = "#0C2233", GOLD = "#A8842C", RED = "#C8102E";
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export interface KarsSenaryo { ad: string; rings: DurakArasiRing[]; stock: RollingStock; cfg: SimConfig; isletme: Isletme; }

/** Senaryolardan baskıya hazır kurumsal KARAR raporu (tek dil: tr — yapısal metinler). */
export function karsilastirmaHTML(senaryolar: KarsSenaryo[], meta: ProjeMeta, altBaslik: string): string {
  const ms = senaryolar.map((s) => metrikHesapla(s.ad, s.rings, s.stock, s.cfg, s.isletme));
  const gecerli = ms.filter((m) => m.gecerli);
  const bugun = meta.tarih || "";
  const firmaAsls = firmaAslsMi(meta.sinyalizasyonFirmasi);
  const antetSol = firmaAsls
    ? `<span class="firma-logo">${aslsLogoSvg}</span>`
    : `<span class="firma">${esc(meta.sinyalizasyonFirmasi || "RaySim")}</span>`;

  // Karar tablosu
  const kolBas = ms.map((m) => `<th>${esc(m.ad)}</th>`).join("");
  const satirlar = SATIRLAR.map((s) => {
    const best = enIyiIndeks(ms, s);
    const huc = ms.map((m, ci) => {
      const kazanan = ci === best;
      const st = `${!m.gecerli ? "color:#9AA7B4" : kazanan ? "color:#7A6320;font-weight:700;background:#FBF7EC" : ""}`;
      return `<td style="${st}">${m.gecerli ? esc(s.yaz(m)) : "—"}</td>`;
    }).join("");
    return `<tr><td class="l">${esc(s.etiket)}</td>${huc}</tr>`;
  }).join("");
  const bogazSatir = `<tr><td class="l">Belirleyici kısıt</td>${ms.map((m) => `<td class="kucuk">${m.gecerli ? esc(m.baglayan) : "—"}</td>`).join("")}</tr>`;
  const tablo = `<table class="kars"><thead><tr><th class="l">Gösterge</th>${kolBas}</tr></thead><tbody>${satirlar}${bogazSatir}</tbody></table>`;

  // Mini çubuk kıyas
  const cubuk = (baslik: string, al: (m: Metrik) => number, renk: string) => {
    const vals = gecerli.map(al);
    const mx = Math.max(1, ...vals), mn = vals.length ? Math.min(...vals) : 0, span = mx - mn;
    const w = (v: number) => (span <= 0 ? 100 : 30 + ((v - mn) / span) * 70);
    const baz = vals.length ? vals[0] : 0;
    const rows = ms.map((m, i) => {
      const v = al(m), d = m.gecerli && i > 0 ? v - baz : 0;
      return `<div class="cb-row"><span class="cb-ad">${esc(m.ad)}</span><span class="cb-bar"><span style="width:${m.gecerli ? w(v).toFixed(0) : 0}%;background:${renk}"></span></span><span class="cb-val"><b>${m.gecerli ? v : "—"}</b>${d !== 0 ? ` <span class="cb-d">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>` : ""}</span></div>`;
    }).join("");
    return `<div class="cb-kart"><div class="cb-baslik">${esc(baslik)}</div>${rows}</div>`;
  };
  const cubuklar = `<div class="cb-grid">${cubuk("Teorik maks tramvay", (m) => m.nTeorik, "#2F6DB3")}${cubuk("İşletme kapasitesi (tren/sa)", (m) => m.isletmeKap, "#2E7D57")}${cubuk("Gereken filo (talep)", (m) => m.gerekenFilo, "#C8702A")}</div>`;

  // Objektif öneri
  let oneri = "";
  if (gecerli.length >= 2) {
    const enY = (al: (m: Metrik) => number) => gecerli.reduce((a, b) => (al(b) > al(a) ? b : a));
    const enD = (al: (m: Metrik) => number) => gecerli.reduce((a, b) => (al(b) < al(a) ? b : a));
    const k = enY((m) => m.nSurdurulebilir), f = enD((m) => m.gerekenFilo), c = enD((m) => m.cevrimDk), i = enY((m) => m.isletmeKap);
    oneri = `<table class="oneri"><tbody>
      <tr><td class="l">En yüksek sürdürülebilir kapasite</td><td><b>${esc(k.ad)}</b> · ${k.nSurdurulebilir} tramvay</td></tr>
      <tr><td class="l">En düşük filo ihtiyacı</td><td><b>${esc(f.ad)}</b> · ${f.gerekenFilo} araç</td></tr>
      <tr><td class="l">En kısa çevrim (tur)</td><td><b>${esc(c.ad)}</b> · ${c.cevrimDk} dk</td></tr>
      <tr><td class="l">En yüksek işletme kapasitesi</td><td><b>${esc(i.ad)}</b> · ${i.isletmeKap} tren/sa</td></tr>
    </tbody></table>
    <p class="not">Ölçütler nesneldir; nihai karar talep, bütçe ve etaplama stratejisine göre verilir.</p>`;
  }

  const siteUrl = "https://raysim.vercel.app";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Senaryo Karşılaştırma — ${esc(meta.dokumanNo || "Karar Raporu")}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Spectral:wght@600;700&display=swap');
  @page { size: A4; margin: 14mm 15mm 15mm; }
  @page { @bottom-right { content: counter(page); font-family:"Geist",sans-serif; font-size:8pt; color:#9AA7B4; } }
  @page:first { @bottom-right { content: ""; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family:"Geist","Segoe UI",system-ui,sans-serif; color:${INK}; font-size:10pt; line-height:1.42; background:#f0f2f4;
    font-variant-numeric: lining-nums tabular-nums; }
  .sheet { background:#fff; }
  @media screen { .sheet { max-width:820px; margin:24px auto; box-shadow:0 4px 24px rgba(12,34,51,.14); padding:40px 46px; } }
  @media print { html,body{ background:#fff !important; } .sheet{ padding:0; } .noprint{ display:none !important; }
    *{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
  .bar { position:sticky; top:0; z-index:10; background:${INK}; color:#fff; display:flex; gap:12px; align-items:center; padding:10px 18px; }
  .bar button { background:${RED}; color:#fff; border:0; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; }
  .bar .sp { flex:1; }
  .pageframe { width:100%; border-collapse:collapse; }
  .antet-head { display:table-header-group; } .antet-foot { display:table-footer-group; }
  .antet-ust { display:flex; justify-content:space-between; align-items:center; border-bottom:1.4pt solid ${GOLD}; padding-bottom:1.8mm; margin-bottom:7mm; font-size:8pt; }
  .antet-ust .firma { font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:${INK}; }
  .antet-ust .firma-logo svg { height:8mm; width:auto; display:block; }
  .antet-ust .dok { color:#6B7A8A; }
  .antet-alt { display:flex; justify-content:space-between; border-top:.75pt solid #DCE1E7; padding-top:1.4mm; margin-top:8mm; font-size:7.5pt; color:#6B7A8A; }
  .cover { text-align:center; padding:14px 0 8px; page-break-after:always; }
  .cover-brand svg { height:17mm; width:auto; } .cover-brand-name { font-size:20pt; font-weight:700; color:${INK}; }
  .cover .rule { width:56px; height:3px; background:${RED}; margin:12px auto 14px; }
  .cover .sys { font-size:14pt; letter-spacing:.28em; color:${INK}; font-weight:600; }
  .cover .kit { font-size:22pt; letter-spacing:.05em; color:${INK}; font-weight:700; margin:3px 0 12px; }
  .cover .proje { font-size:14pt; color:${INK}; font-weight:600; }
  .cover .hat { font-size:11pt; color:#6B7A8A; margin-top:4px; }
  .cover .kunye { border:1pt solid #D3DAE1; margin:20px auto 0; width:78%; border-collapse:collapse; }
  .cover .kunye td { text-align:left; padding:4px 10px; border-bottom:1px solid #EDF0F3; }
  .cover .kunye td.k { font-weight:600; width:38%; background:#F5F7F9; }
  .poweredby { margin-top:16px; display:flex; align-items:center; justify-content:center; gap:7px; }
  .poweredby svg { height:7mm; width:auto; } .poweredby .t { font-size:8.5pt; color:#8A97A4; }
  .poweredby .t b { font-family:"Spectral",Georgia,serif; letter-spacing:.06em; color:#6B7A8A; } .poweredby .t .r { color:${RED}; }
  .cover .foot { margin-top:14px; font-size:8pt; letter-spacing:.14em; text-transform:uppercase; color:#9AA7B4; }
  /* Karşılaştırma raporu kısadır: bölümler ayrı sayfaya ZORLANMAZ (aksi halde tablo/öneri/
     onay tek tük satırla ayrı sayfalara düşüp büyük boşluk bırakıyordu). Bölümler akar; başlık
     içeriğinden koparılmaz (after:avoid) ve üst boşlukla ayrılır. */
  .banner { color:${INK}; padding:0 0 5px; margin:20px 0 14px; border-bottom:1.5pt solid ${GOLD}; font-size:11.5pt; font-weight:600; letter-spacing:.14em; text-transform:uppercase; page-break-after:avoid; }
  .banner:first-of-type { margin-top:0; }
  .banner .no { color:${GOLD}; font-weight:700; margin-right:3px; } .banner .no::after { content:" ·"; color:${INK}; opacity:.35; }
  p { margin:0 0 8px; } .muted { color:#6B7A8A; }
  table.kars, table.oneri { width:100%; border-collapse:collapse; margin:8px 0 6px; font-size:9pt; }
  table.kars th, table.oneri th { background:${INK}; color:#fff; font-weight:600; padding:6px 8px; border:1px solid ${INK}; text-align:center; }
  table.kars td, table.oneri td { padding:5px 8px; border:1px solid #DCE1E7; text-align:center; }
  table.kars td.l, table.oneri td.l, .kars th.l { text-align:left; color:#42525f; }
  table.kars td.kucuk { font-size:7.5pt; color:#6B7A8A; }
  table.kars tbody tr:nth-child(even) td { background:#F7F9FA; }
  .oneri td { text-align:left; } .oneri td.l { color:#6B7A8A; width:52%; }
  .not { font-size:8.5pt; color:#6B7A8A; margin-top:4px; }
  .cb-grid { display:flex; gap:10px; margin:8px 0; page-break-inside:avoid; }
  table.oneri, .imza { page-break-inside:avoid; }
  .cb-kart { flex:1; border:1px solid #E4E8EC; border-radius:2px; padding:8px 10px; page-break-inside:avoid; }
  .cb-baslik { font-size:7.5pt; letter-spacing:.08em; text-transform:uppercase; color:#6B7A8A; margin-bottom:6px; }
  .cb-row { display:flex; align-items:center; gap:6px; margin:3px 0; font-size:8pt; }
  .cb-ad { width:52px; flex:0 0 auto; color:#42525f; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cb-bar { flex:1; height:8px; background:#EDF0F3; border-radius:2px; overflow:hidden; }
  .cb-bar span { display:block; height:100%; }
  .cb-val { width:46px; flex:0 0 auto; text-align:right; } .cb-d { color:#8A97A4; }
  .cekirdek { margin:16px 0 4px; padding-top:8px; border-top:1px solid #D8DEE5; text-align:center; font-size:9.5pt; color:#55636F; }
  .imza { margin-top:14px; } .imza th { background:${INK}; color:#fff; padding:6px 8px; } .imza td { height:48px; vertical-align:top; padding:6px 8px; border:1px solid #DCE1E7; text-align:left; }
</style></head>
<body>
<div class="bar noprint"><b>RaySim · Karşılaştırma</b><span class="hint" style="font-size:11px;opacity:.8">Yazdır → “PDF olarak kaydet”.</span><span class="sp"></span><button onclick="window.print()">⭳ PDF olarak kaydet / Yazdır</button></div>
<div class="sheet">
<table class="pageframe"><thead class="antet-head"><tr><td style="padding:0;border:0">
  <div class="antet-ust">${antetSol}<span class="dok">${esc(meta.dokumanNo || "")}${meta.revizyon ? " · " + esc(meta.revizyon.split("—")[0].trim()) : ""}</span></div>
</td></tr></thead><tfoot class="antet-foot"><tr><td style="padding:0;border:0">
  <div class="antet-alt"><span>${esc(meta.sinyalizasyonFirmasi || "RaySim")} · Senaryo Karşılaştırma</span><span>${bugun ? esc(bugun) + " · " : ""}${esc(meta.dokumanNo || "")}</span></div>
</td></tr></tfoot><tbody><tr><td style="padding:0;border:0">

  <section class="cover">
    <div class="cover-brand">${firmaAsls ? aslsLogoSvg : `<span class="cover-brand-name">${esc(meta.sinyalizasyonFirmasi || "")}</span>`}</div>
    <div class="rule"></div>
    <div class="sys">KARAR DESTEK</div>
    <div class="kit">SENARYO KARŞILAŞTIRMA</div>
    <div class="proje">${esc(meta.projeAdi || "Karşılaştırma Raporu")}</div>
    <div class="hat">${esc(altBaslik)}</div>
    <table class="kunye"><tbody>
      <tr><td class="k">İdare</td><td>${esc(meta.idare || "—")}</td></tr>
      <tr><td class="k">Müşavir</td><td>${esc(meta.musavir || "—")}</td></tr>
      <tr><td class="k">Sinyalizasyon Firması</td><td>${esc(meta.sinyalizasyonFirmasi || "—")}</td></tr>
      <tr><td class="k">Doküman No</td><td>${esc(meta.dokumanNo || "—")}</td></tr>
      <tr><td class="k">Senaryo sayısı</td><td>${ms.length}</td></tr>
    </tbody></table>
    <div class="poweredby"><span>${emblemSvg}</span><span class="t">Powered by <b>Ray<span class="r">Sim</span></b></span></div>
    <div class="foot">Kontrollü doküman${bugun ? " · " + esc(bugun) : ""}</div>
  </section>

  <div class="banner"><span class="no">01</span>Karşılaştırma Tablosu</div>
  <p>Senaryolar aynı çekirdekle (kapasite motoru) hesaplandı; her satırda üstün senaryo <b style="color:#7A6320">altın</b> ile işaretlidir (kapasite yüksek / min-headway·çevrim·filo düşük daha iyi). UIC doluluk ve durak/makas tanımlayıcıdır, tarafsızdır.</p>
  ${tablo}
  ${cubuklar}

  <div class="banner"><span class="no">02</span>Objektif Öneri Özeti</div>
  ${oneri || `<p class="muted">Karşılaştırma için en az 2 geçerli senaryo gerekir.</p>`}
  <div class="cekirdek">OpenTrack ile işbirliğiyle doğrulanmış; UIC 406 metodolojisine dayanan bağımsız çekirdek. Rapordaki her değer canlı simülasyonda birebir yeniden üretilebilir.</div>

  <div class="banner"><span class="no">03</span>Onay</div>
  <table class="imza"><thead><tr><th>Hazırlayan</th><th>Onaylayan</th></tr></thead>
  <tbody><tr><td>${esc(meta.hazirlayan || "")}</td><td>${esc(meta.onaylayan || "")}</td></tr>
  <tr><td>İmza / Tarih</td><td>İmza / Tarih</td></tr></tbody></table>

</td></tr></tbody></table>
</div>
<div style="display:none">${esc(siteUrl)}</div>
</body></html>`;
}
