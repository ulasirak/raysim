// raysim — TEKNİK BELGE ÜRETİCİ (Word .docx + Excel .xlsx).
//
// Amaç: herhangi bir karşı taraf hattını (ring dizisi + parametre + künye)
// girer; bu modül mevcut motor çıktılarından PROFESYONEL, teknik olarak tutarlı
// Sinyalizasyon Tasarım El Kitabı (.docx) ve çalışma kitabı (.xlsx) üretir.
// Konya'ya bağlı değildir — tüm içerik girilen projeden türer.
//
// Tarayıcıda çalışır (Blob döndürür → indirilir). SSR'de çağrılmaz.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from "docx";
import ExcelJS from "exceljs";
import type { SimConfig, ProjeMeta } from "./config";
import { PARAM_META, paramGoster, birim } from "./config";
import type { RollingStock } from "./types";
import {
  ringSenaryo, ringChallenge, ringKisitDizisi, loopDenge, olceklenme,
  type DurakArasiRing,
} from "./ring";
import { bolgeSeed, cakismaMatriksi } from "./interlocking";
import { blockingTimeRing } from "./blockingtime";

const INK = "0C2233";
const RED = "C8102E";
const s0 = (v: number) => `${Math.round(v)} s`;

// ————————————————————————————————————————————————
// Ortak içerik (her iki belge de bunu kullanır)
// ————————————————————————————————————————————————

function ringSatirlari(rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig) {
  return rings.map((r, i) => {
    const sen = ringSenaryo(r, stock, cfg);
    return {
      no: i + 1,
      ad: `${r.fromAd} → ${r.toAd}`,
      mesafe: Math.round(r.uzunluk),
      worst: Math.round(r.worstUzunluk),
      best: Math.round(r.bestUzunluk),
      makas: r.makaslar.length,
      hemzemin: r.hemzeminler.length,
      tehlike: r.tehlikeNoktalari.length,
      worstSeyir: Math.round(sen.worstSeyir),
      timingEk: Math.round(sen.timingEk),
      worstToplam: Math.round(sen.worstToplam),
      headway: sen.headwayUygun ? "UYGUN" : "İHLAL",
      pay: Math.round(sen.headwayPayi),
    };
  });
}

// ————————————————————————————————————————————————
// WORD (.docx)
// ————————————————————————————————————————————————

function p(text: string, opts: { bold?: boolean; size?: number; color?: string; spacing?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.spacing ?? 120 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, color: opts.color })],
  });
}
function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 160 }, children: [new TextRun({ text, color: INK, bold: true })] });
}
function h2(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 120 }, children: [new TextRun({ text, color: INK, bold: true })] });
}

function hucre(text: string, opts: { bold?: boolean; fill?: string; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    shading: opts.fill ? { fill: opts.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.align, children: [new TextRun({ text, bold: opts.bold, size: 18, color: opts.color ?? (opts.fill ? "FFFFFF" : "222222") })] })],
  });
}

function wordTablo(basliklar: string[], satirlar: string[][]): Table {
  const head = new TableRow({ tableHeader: true, children: basliklar.map((b) => hucre(b, { bold: true, fill: INK, align: AlignmentType.CENTER })) });
  const rows = satirlar.map((s, ri) => new TableRow({ children: s.map((c) => hucre(c, { fill: ri % 2 ? "F2F4F6" : undefined })) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "C3CBD4" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "C3CBD4" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "C3CBD4" }, right: { style: BorderStyle.SINGLE, size: 2, color: "C3CBD4" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DCE1E7" }, insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DCE1E7" },
    },
    rows: [head, ...rows],
  });
}

export async function wordUret(meta: ProjeMeta, cfg: SimConfig, rings: DurakArasiRing[], stock: RollingStock): Promise<Blob> {
  const rs = ringSatirlari(rings, stock, cfg);
  const denge = loopDenge(rings, stock, cfg);
  const olcek = olceklenme(rings, stock, true, cfg);
  const zones = bolgeSeed();

  const kunye: string[][] = [
    ["Proje", meta.projeAdi], ["Hat", meta.hatAdi], ["Doküman No", meta.dokumanNo], ["Revizyon", meta.revizyon],
    ["Tarih", meta.tarih || "—"], ["İdare", meta.idare], ["Yüklenici", meta.yuklenici], ["Müşavir", meta.musavir],
    ["Sinyalizasyon Firması", meta.sinyalizasyonFirmasi],
  ];

  const kriterler: string[][] = PARAM_META.map((m) => [m.ad, `${paramGoster(cfg, m).toFixed(m.tur === "ivme" ? 1 : 0)} ${birim(m.tur)}`, m.etkiler]);

  const ringTablo: string[][] = rs.map((r) => [
    `${r.no}`, r.ad, `${r.mesafe}`, `${r.worst}`, `${r.makas}`, `${r.hemzemin}`, `${r.tehlike}`, s0(r.worstToplam), `${r.headway} (${r.pay >= 0 ? "+" : ""}${r.pay} s)`,
  ]);

  const cocuklar: (Paragraph | Table)[] = [
    // Kapak
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 120 }, children: [new TextRun({ text: "SİNYALİZASYON SİSTEMİ", bold: true, size: 40, color: INK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "TASARIM EL KİTABI", bold: true, size: 52, color: RED })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: meta.projeAdi, bold: true, size: 28, color: INK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: meta.hatAdi, size: 24, color: "6B7A8A" })] }),
    wordTablo(["", ""], kunye),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "RaySim Sinyalizasyon Tasarım & Dokümantasyon Sistemi tarafından üretilmiştir.", italics: true, size: 16, color: "9AA7B4" })] }),

    // 1. Tasarım kriterleri
    h1("1. Tasarım Kriterleri"),
    p("Sistem, sabit blok ve dağıtık SIL4 anklaşman mimarisi üzerine kurulmuştur. Aşağıdaki parametreler tüm işletim senaryolarının temelini oluşturur:"),
    wordTablo(["Parametre", "Değer", "Etkisi"], kriterler),

    // 2. Durak arası ring şartları
    h1("2. Durak Arası İşletim Hücreleri (Ring Şartları)"),
    p(`Hat, ${rings.length} durak-arası hücreye bölünmüştür. Her hücre kendi mesafe, makas, hemzemin ve tehlike (acil frenleme) şartlarını taşır. Worst-case senaryo en uzun mesafe + tüm kısıtlarla, headway hedefi ${cfg.headway} s ile değerlendirilir.`),
    wordTablo(["No", "Durak Arası", "Mesafe (m)", "Worst (m)", "Makas", "Hemzemin", "Tehlike", "Worst Toplam", "Headway"], ringTablo),
  ];

  // Ring detayları (challenge)
  cocuklar.push(h2("2.1 Ring Bazında Kısıt ve Risk (Challenge) Analizi"));
  for (const r of rings) {
    const kisit = ringKisitDizisi(r);
    const ch = ringChallenge(r, stock, cfg);
    cocuklar.push(p(`${r.fromAd} → ${r.toAd}`, { bold: true, size: 22 }));
    if (kisit.length) {
      cocuklar.push(wordTablo(["Kısıt", "Konum (m)", "Detay"], kisit.map((k) => [k.ad, `${Math.round(k.konum)}`, k.detay])));
    } else {
      cocuklar.push(p("Kısıt yok — kesintisiz seyir.", { color: "6B7A8A" }));
    }
    if (ch.length) {
      for (const c of ch) cocuklar.push(p(`• [${c.seviye.toUpperCase()}] ${c.baslik}: ${c.mesaj}`, { color: c.seviye === "kritik" ? RED : "3A4A5A", size: 18 }));
    }
  }

  // 3. Makas bölgesi senaryoları
  cocuklar.push(h1("3. Makas Bölgesi Operasyon Senaryoları ve Çakışma Matriksleri"));
  cocuklar.push(p("Her makas bölgesi bağımsız SIL4 anklaşman birimidir. Rotalar NEREDEN→NEREYE tanımlı; çakışma matriksi (X = birlikte kurulabilir, 0 = mümkün değil) hangi rotaların eşzamanlı işletilebileceğini belirler."));
  cocuklar.push(p("Not: aşağıdaki bölge topolojisi, rotalar ve çakışma matriksleri MAZ-VA-AKS-001 el kitabının referans standardından gelir; hattınızın makas geometrisinden otomatik türetilmez.", { size: 18 }));
  for (const z of zones) {
    cocuklar.push(h2(`Bölge ${z.id} — ${z.ad}`));
    cocuklar.push(wordTablo(["Rota", "Nereden", "Nereye", "Bloklar", "TCC"], z.rotalar.map((r) => [r.id, r.nereden, r.nereye, r.bloklar.join(", "), r.tccGerekli ? "Evet" : "Hayır"])));
    const m = cakismaMatriksi(z);
    const mHead = ["", ...z.rotalar.map((r) => `${r.nereden}${r.nereye}`)];
    const mRows = z.rotalar.map((r, i) => [`${r.nereden}${r.nereye}`, ...z.rotalar.map((_, j) => (i === j ? "·" : m[i][j] ? "X" : "0"))]);
    cocuklar.push(p("Çakışma Matriksi:", { bold: true, size: 18 }));
    cocuklar.push(wordTablo(mHead, mRows));
  }

  // 4. Kapasite
  const bt = blockingTimeRing(rings, stock, cfg);
  cocuklar.push(h1("4. Kapasite ve Darboğaz Analizi"));
  cocuklar.push(wordTablo(["Gösterge", "Değer"], [
    ["Tur süresi (worst-case)", s0(olcek.turSuresi)],
    ["Hedef headway", s0(cfg.headway)],
    ["Headway'de sığan tren", `${olcek.maxTrenHedefHeadway}`],
    ["Darboğaz hücre", olcek.darbogazRing ? `${olcek.darbogazRing.ad} (${s0(olcek.darbogazRing.worstToplam)})` : "—"],
    ["Denge (eşit şartlar)", denge.dengeli ? "Dengeli" : `%${denge.sapmaYuzde.toFixed(0)} sapma`],
    ["Tüm hücreler headway'e uygun mu", olcek.headwayUygun ? "Evet" : "Hayır — ihlal var"],
  ]));
  cocuklar.push(h2("4.1 Blocking-Time (Sperrzeitentreppe) ve UIC 406 Kapasite"));
  cocuklar.push(p("Her sinyal bloğunun rezerve (blocking-time) süresi altı bileşenden oluşur: rota kurma (setup), sürücü görme, yaklaşma, blok içi seyir, tren temizleme ve rota serbest bırakma. En yüksek blocking-time'lı blok minimum tren aralığını (headway) belirler; UIC 406 doluluk oranı bu değerin hedef headway'e bölümüdür."));
  cocuklar.push(wordTablo(["Gösterge", "Değer"], [
    ["Minimum headway (kritik blok)", `${s0(bt.minHeadway)} (blok #${bt.kritikBlok}${bt.bloklar[bt.kritikBlok]?.makasBlok ? ", makas" : ""})`],
    ["Teorik kapasite", `${bt.teorikKapasite.toFixed(0)} tren/saat`],
    ["UIC 406 doluluk (hedef headway'de)", `%${bt.dolulukHedef.toFixed(0)}`],
    ["Hedef headway uygunluğu", bt.hedefUygun ? "UYGUN" : "İHLAL"],
  ]));
  cocuklar.push(wordTablo(
    ["Blok", "Setup", "Görme", "Yaklaşma", "Seyir", "Temizleme", "Release", "Toplam (s)"],
    bt.bloklar.map((b) => [`#${b.i}${b.makasBlok ? " ⑂" : ""}`, `${b.tSetup}`, `${b.tSighting}`, b.tApproach.toFixed(0), b.tRunning.toFixed(0), b.tClearing.toFixed(0), `${b.tRelease}`, b.toplam.toFixed(0)])
  ));

  // 5. İmza
  cocuklar.push(h1("5. Onay"));
  cocuklar.push(wordTablo(["Hazırlayan", "Onaylayan"], [[meta.hazirlayan, meta.onaylayan], ["İmza / Tarih", "İmza / Tarih"]]));

  const doc = new Document({
    creator: "RaySim", title: `${meta.dokumanNo} — ${meta.projeAdi}`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: {}, children: cocuklar }],
  });
  return Packer.toBlob(doc);
}

// ————————————————————————————————————————————————
// EXCEL (.xlsx)
// ————————————————————————————————————————————————

function baslikSatiri(ws: ExcelJS.Worksheet, r: number) {
  const row = ws.getRow(r);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2233" } };
  row.alignment = { vertical: "middle" };
}

export async function excelUret(meta: ProjeMeta, cfg: SimConfig, rings: DurakArasiRing[], stock: RollingStock): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RaySim";
  const rs = ringSatirlari(rings, stock, cfg);
  const zones = bolgeSeed();
  const olcek = olceklenme(rings, stock, true, cfg);
  const denge = loopDenge(rings, stock, cfg);

  // 1) Künye
  const wK = wb.addWorksheet("Künye");
  wK.columns = [{ header: "Alan", key: "a", width: 26 }, { header: "Değer", key: "b", width: 55 }];
  baslikSatiri(wK, 1);
  ([["Proje", meta.projeAdi], ["Hat", meta.hatAdi], ["Doküman No", meta.dokumanNo], ["Revizyon", meta.revizyon], ["Tarih", meta.tarih || "—"], ["İdare", meta.idare], ["Yüklenici", meta.yuklenici], ["Müşavir", meta.musavir], ["Sinyalizasyon Firması", meta.sinyalizasyonFirmasi], ["Hazırlayan", meta.hazirlayan], ["Onaylayan", meta.onaylayan]] as [string, string][]).forEach(([a, b]) => wK.addRow({ a, b }));
  wK.getColumn("a").font = { bold: true };

  // 2) Tasarım kriterleri
  const wC = wb.addWorksheet("Tasarım Kriterleri");
  wC.columns = [{ header: "Parametre", key: "ad", width: 28 }, { header: "Değer", key: "d", width: 12 }, { header: "Birim", key: "b", width: 8 }, { header: "Kaynak", key: "k", width: 12 }, { header: "Etkisi", key: "e", width: 45 }];
  baslikSatiri(wC, 1);
  PARAM_META.forEach((m) => wC.addRow({ ad: m.ad, d: Number(paramGoster(cfg, m).toFixed(m.tur === "ivme" ? 1 : 0)), b: birim(m.tur), k: m.kaynak, e: m.etkiler }));

  // 3) Ringler
  const wR = wb.addWorksheet("Durak Arası Ringler");
  wR.columns = [
    { header: "No", key: "no", width: 5 }, { header: "Durak Arası", key: "ad", width: 34 },
    { header: "Mesafe (m)", key: "mesafe", width: 11 }, { header: "Worst (m)", key: "worst", width: 10 }, { header: "Best (m)", key: "best", width: 9 },
    { header: "Makas", key: "makas", width: 7 }, { header: "Hemzemin", key: "hemzemin", width: 10 }, { header: "Tehlike", key: "tehlike", width: 8 },
    { header: "Worst Seyir (s)", key: "worstSeyir", width: 13 }, { header: "Makas/Route Ek (s)", key: "timingEk", width: 16 }, { header: "Worst Toplam (s)", key: "worstToplam", width: 14 },
    { header: "Headway", key: "headway", width: 9 }, { header: "Marj (s)", key: "pay", width: 8 },
  ];
  baslikSatiri(wR, 1);
  rs.forEach((r) => {
    const row = wR.addRow(r);
    if (r.headway === "İHLAL") row.getCell("headway").font = { color: { argb: "FFC8102E" }, bold: true };
  });

  // 4) Makas rotaları (tüm bölgeler)
  const wM = wb.addWorksheet("Makas Rotaları");
  wM.columns = [{ header: "Bölge", key: "b", width: 8 }, { header: "Bölge Adı", key: "ba", width: 40 }, { header: "Rota", key: "r", width: 14 }, { header: "Nereden", key: "n1", width: 9 }, { header: "Nereye", key: "n2", width: 9 }, { header: "Bloklar", key: "bl", width: 22 }, { header: "TCC", key: "t", width: 6 }];
  baslikSatiri(wM, 1);
  zones.forEach((z) => z.rotalar.forEach((r) => wM.addRow({ b: z.id, ba: z.ad, r: r.id, n1: r.nereden, n2: r.nereye, bl: r.bloklar.join(", "), t: r.tccGerekli ? "Evet" : "Hayır" })));

  // 5) Çakışma matriksleri (her bölge blok halinde)
  const wX = wb.addWorksheet("Çakışma Matriksi");
  let satir = 1;
  zones.forEach((z) => {
    wX.getCell(satir, 1).value = `Bölge ${z.id} — ${z.ad}`;
    wX.getCell(satir, 1).font = { bold: true, color: { argb: "FF0C2233" } };
    satir++;
    const m = cakismaMatriksi(z);
    wX.getCell(satir, 1).value = "";
    z.rotalar.forEach((r, j) => { const c = wX.getCell(satir, j + 2); c.value = `${r.nereden}${r.nereye}`; c.font = { bold: true }; });
    satir++;
    z.rotalar.forEach((r, i) => {
      const rc = wX.getCell(satir, 1); rc.value = `${r.nereden}${r.nereye}`; rc.font = { bold: true };
      z.rotalar.forEach((_, j) => {
        const c = wX.getCell(satir, j + 2);
        c.value = i === j ? "·" : m[i][j] ? "X" : "0";
        c.alignment = { horizontal: "center" };
        if (i !== j) c.font = { color: { argb: m[i][j] ? "FF0E7C57" : "FFC8102E" }, bold: true };
      });
      satir++;
    });
    satir += 1;
  });
  wX.getColumn(1).width = 10;

  // 6) Kapasite
  const wP = wb.addWorksheet("Kapasite & Darboğaz");
  wP.columns = [{ header: "Gösterge", key: "g", width: 34 }, { header: "Değer", key: "d", width: 30 }];
  baslikSatiri(wP, 1);
  ([["Tur süresi (worst-case, s)", `${Math.round(olcek.turSuresi)}`], ["Hedef headway (s)", `${cfg.headway}`], ["Headway'de sığan tren", `${olcek.maxTrenHedefHeadway}`], ["Darboğaz hücre", olcek.darbogazRing ? `${olcek.darbogazRing.ad} (${Math.round(olcek.darbogazRing.worstToplam)} s)` : "—"], ["Denge (eşit şartlar)", denge.dengeli ? "Dengeli" : `%${denge.sapmaYuzde.toFixed(0)} sapma`], ["Tüm hücreler headway'e uygun", olcek.headwayUygun ? "Evet" : "Hayır — ihlal var"]] as [string, string][]).forEach(([g, d]) => wP.addRow({ g, d }));

  // 6b) Blocking-Time (Sperrzeitentreppe)
  const bt = blockingTimeRing(rings, stock, cfg);
  const wB = wb.addWorksheet("Blocking-Time");
  wB.getCell(1, 1).value = `Min headway ${Math.round(bt.minHeadway)} s · Teorik kapasite ${bt.teorikKapasite.toFixed(0)} tren/sa · UIC 406 doluluk %${bt.dolulukHedef.toFixed(0)} (hedef ${bt.hedefHeadway} s) · ${bt.hedefUygun ? "UYGUN" : "İHLAL"}`;
  wB.getCell(1, 1).font = { bold: true, color: { argb: "FF0C2233" } };
  wB.getRow(2).values = ["Blok", "Makas", "Setup (s)", "Görme (s)", "Yaklaşma (s)", "Seyir (s)", "Temizleme (s)", "Release (s)", "Toplam (s)"];
  baslikSatiri(wB, 2);
  bt.bloklar.forEach((b) => {
    const row = wB.addRow([b.i, b.makasBlok ? "Evet" : "—", b.tSetup, b.tSighting, Number(b.tApproach.toFixed(1)), Number(b.tRunning.toFixed(1)), Number(b.tClearing.toFixed(1)), b.tRelease, Number(b.toplam.toFixed(1))]);
    if (b.i === bt.kritikBlok) row.font = { bold: true, color: { argb: "FFC8102E" } };
  });
  wB.columns.forEach((c) => { c.width = 12; });

  // 7) Challenge / risk
  const wCh = wb.addWorksheet("Challenge - Risk");
  wCh.columns = [{ header: "Durak Arası", key: "ad", width: 34 }, { header: "Seviye", key: "s", width: 10 }, { header: "Başlık", key: "b", width: 24 }, { header: "Açıklama", key: "m", width: 70 }];
  baslikSatiri(wCh, 1);
  rings.forEach((r) => ringChallenge(r, stock, cfg).forEach((c) => {
    const row = wCh.addRow({ ad: `${r.fromAd} → ${r.toAd}`, s: c.seviye, b: c.baslik, m: c.mesaj });
    if (c.seviye === "kritik") row.getCell("s").font = { color: { argb: "FFC8102E" }, bold: true };
  }));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ————————————————————————————————————————————————
// İndirme yardımcısı
// ————————————————————————————————————————————————

// `indir` artık format.ts'te (hafif) — Belgeler HTML akışı docx/exceljs çekmeden
// indirebilsin ve Word/Excel üreticileri yalnız tıklamada tembel yüklensin.
