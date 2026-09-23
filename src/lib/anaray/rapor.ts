// raysim — ŞIK PDF RAPORU (baskıya hazır HTML → tarayıcı "PDF olarak kaydet").
//
// Amaç: doküman üreticinin (dokuman.ts) düz Word/Excel çıktısının yanında,
// görsel olarak yüksek kaliteli, kurumsal, baskıya hazır bir Tasarım El Kitabı
// raporu üretmek. Amblemli kapak + renk kodlu bölüm banzları + gömülü şema/grafik
// İçerik tamamen girilen projeden türer.
//
// Tarayıcıda çalışır: yeni pencerede açar, yazdırma diyalogunu tetikler
// (kullanıcı "Hedef: PDF olarak kaydet" ile indirir). SSR'de çağrılmaz.

import { aslsLogoSvg, firmaAslsMi } from "./aslsLogo";
import { CK } from "./chartkit";
import { type SimConfig, type ProjeMeta, type Isletme, PARAM_META, paramGoster, birim, varsayilanIsletme, etkinArac } from "./config";
import { tersIsletmeAnaliz, tavsiyeTramvaySayisi } from "./tersisletme";
import { bolumDahil, type RaporSecim } from "@/lib/raporFiyat";
import { dogrulamaCalistir } from "./dogrulama";
import { MOTOR_SURUMU, MOTOR_ADI, YONTEM_STANDARTLARI } from "./surum";
import { kilitlemeTablosu, kilitlemeOzet } from "./kilitleme";
import { aspectDizilim } from "./aspectDizilim";
import { paretoAnaliz } from "./pareto";
import { seferTersEntegre } from "./seferters";
import { maksimumTren } from "./kapasite";
import { tarifeUret } from "./tarife";
import { duyarlilikAnaliz } from "./duyarlilik";
import type { RollingStock, Line } from "./types";
import { ringSenaryo, ringChallenge, ringKisitDizisi, loopDenge, kurpKonforAnaliz, type DurakArasiRing, type Sube } from "./ring";
import { blockingTimeRing } from "./blockingtime";
import { loopToHat } from "./hatsim";
import { loopYorunge, monteCarlo, type LoopYorunge, type MonteCarloResult } from "./signalling";
import { cakismaTespit } from "./cakisma";
import { gecikmeYayilim } from "./gecikmeYayilim";
import { ortakKesimAnaliz } from "./ortakKesim";
import { sure } from "./format";
import { hatOzellikleri, sinyalKonumlari, kavsakliRingler, subeEfektifRingler } from "./network";
import {
  INK, RED, GOLD, esc, s0, kmFmt, qrSvg, tbl, ringSemaSvg, blockingBarSvg, reverseLineOf, bildfahrplanSvg, kisitBarSvg, hizProfilSvg, yukDwellSvg, turnbackTbl, hemzeminSvg, seferTersSvg, sperrzeitSvg, mcHistSvg, mcYayilimSvg, raporStil,
} from "./raporCizim";



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
    s1: "Girdi Parametreleri ve İşletme Verileri", s1i: "Analizin dayandığı girdi parametreleri: sinyalizasyon, makas tip/sayıları, istasyon duruş süreleri, terminal dönüşü, hemzemin geçitler ve araç dinamiği. Tüm kapasite, işletme ve tarife sonuçları bu değerlerden türetilir; kapasite çıktıları Bölüm 4'te ayrıntılandırılır.",
    thParam: ["Parametre", "Değer", "Etkisi"],
    s2: "Durak Arası İşletim Hücreleri", s2i: (n: number, h: number) => `Hat, ${n} durak-arası hücreye (ring) ayrılmıştır; her hücre kendi mesafe, makas, hemzemin geçit ve tehlike noktası şartlarını taşır (hedef aralık ${h} s).`,
    fig1: "Şekil 1 — Hat şeması: istasyon zinciri, makas (⑂) ve hemzemin geçit dağılımı.",
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
    s1: "Input Parameters and Operating Data", s1i: "The input parameters the analysis rests on: signalling, switch types/counts, station dwell times, terminal turnback, level crossings and vehicle dynamics. All capacity, operating and timetable results are derived from these values; the capacity outputs are detailed in Section 4.",
    thParam: ["Parameter", "Value", "Effect"],
    s2: "Inter-station Operating Cells", s2i: (n, h) => `The line is divided into ${n} inter-station cells (rings); each carries its own distance, switch, level-crossing and hazard conditions (target headway ${h}s).`,
    fig1: "Figure 1 — Line schematic: station chain, switch (⑂) and level-crossing distribution.",
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

// ————————————————————————————————————————————————
// Monte-Carlo gecikme analizi — gömülü SVG (Studio ekranındaki iki grafiğin
// rapor karşılığı). Motor aynı (signalling.monteCarlo); yalnız çizim string SVG.
// ————————————————————————————————————————————————


export function raporHTML(meta: ProjeMeta, cfg: SimConfig, ringsGiris: DurakArasiRing[], stock: RollingStock, lang: RaporDil = "tr", filo = 0, isletme: Isletme = varsayilanIsletme, qrUrl = "", subeler: Sube[] = [], secim?: RaporSecim): string {
  stock = etkinArac(stock, cfg); // config dinamik tavanları (ivme/servis freni) araca bağlı — rapordaki tüm sim/kapasite tutarlı
  // Bölüm seçimi (kullanıcı hangi bölümleri istediğini seçer; yoksa hepsi). `dahil(b)` kısayolu.
  const dahil = (b: Parameters<typeof bolumDahil>[1]) => bolumDahil(secim, b);
  // GRAFİKLER (görsel analiz) 3 kredilik ayrı seçenek. Tüm şekiller AYRI bir "Grafikler"
  // bölümünde (08) toplanır — böylece kullanıcı YALNIZ grafikleri seçtiğinde de anlamlı,
  // dolu bir görsel bölüm alır (eskiden şekiller içerik bölümlerine gömülüydü → yalnız
  // grafik seçilince hiçbir şey çıkmıyordu). İçerik bölümleri metin + tablo olarak kalır.
  // `g` kapalıyken hiçbir SVG üretilmez (kaynağa yazılmaz → ücret dürüst gatelenir).
  const g = dahil("grafikler");
  // Closure-içi (ste/ko) figürleri, üretildikleri yerde yakalanıp Grafikler bölümünde
  // kullanılır (ağır hoisting yerine mutable yakalama).
  let seferTersFig = "", knockOnFig = "";
  // Dallanma (#1): şube varsa ana hat, geçtiği kavşak turnout'larını yansıtsın diye
  // kavşak makalarıyla zenginleştirilir (şubesizse AYNEN kalır → geriye uyumlu).
  const rings = subeler.length ? kavsakliRingler(ringsGiris, subeler) : ringsGiris;
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
  //   araç sayısı (verilmemişse öneriye düşer, sabit "4" DEĞİL). SÜRDÜRÜLEBİLİR FİLO TAVANDIR:
  //   rapordaki planlanan filo, sürdürülebilir maks'ı (UIC 406 tamponlu) aşamaz → daha çok
  //   tramvay istense bile sürdürülebilire kırpılır. Kullanıcı DAHA AZ filo isterse o değer
  //   aynen korunur (rapor daha az filoyla verilir).
  const ozellikler = hatOzellikleri(rings, cfg);
  const sinyalListe = ozellikler.filter((f) => f.kind === "sinyal");
  const sinyalSayisi = sinyalListe.length;
  const tersSinyalSayisi = sinyalListe.filter((f) => f.tersIsletme).length;
  const filoIstenen = filo > 0 ? Math.round(filo) : (siganTren || maks.nSurdurulebilir || 4);
  const filoGercek = (maks.gecerli && maks.nSurdurulebilir > 0)
    ? Math.min(filoIstenen, maks.nSurdurulebilir)
    : filoIstenen;

  // Birleşik hat (loop → tek Line) → hız profili + Bildfahrplan grafikleri
  const line: Line | null = rings.length ? loopToHat(rings, true, cfg).line : null;
  // Bildfahrplan GİT-GEL LOOP yörüngesinden (canlı sim ile birebir): tam filo çizilir.
  const peronBasBf = isletme.terminalBas.tip === "dongu" ? 0 : (isletme.terminalBas.peronIsgali || 0);
  const peronSonBf = isletme.terminalSon.tip === "dongu" ? 0 : (isletme.terminalSon.peronIsgali || 0);
  const loopYbf: LoopYorunge | null = line ? loopYorunge(line, reverseLineOf(line), stock, { peronIsgaliBas: peronBasBf, peronIsgaliSon: peronSonBf }) : null;
  const bfHeadway = loopYbf && filoGercek > 0 ? Math.round(loopYbf.periyot / filoGercek) : cfg.headway;
  const bfFig = (g && line && loopYbf) ? `<div class="fig">${bildfahrplanSvg(loopYbf, line, filoGercek, en)}<div class="cap">${en ? `Figure 3 — Time-distance diagram (Bildfahrplan): ${filoGercek} trams (round-trip loop), ${bfHeadway}s headway.` : `Şekil 3 — Zaman-mesafe diyagramı (Bildfahrplan): ${filoGercek} tramvay (git-gel döngü), ${bfHeadway} s aralık.`}</div></div>` : "";
  const turnbackTblStr = turnbackTbl(isletme.terminalBas, isletme.terminalSon, cfg, en);
  const hz = rings.length ? hemzeminSvg(rings, cfg) : { svg: "", adet: 0, karayolu: 0, toplamTur: 0 };
  const hemCevrim = maks.gecerli ? maks.cevrimSuresi : 0;
  const hemYuzde = hemCevrim > 0 ? (hz.toplamTur / hemCevrim) * 100 : 0;
  const hemzeminFig = (g && hz.svg) ? `<div class="fig">${hz.svg}<div class="cap">${en ? `Figure 2e — Level-crossing & TSP delay: per-crossing slowdown (grey) + road-crossing wait (priority). ${hz.adet} crossings (${hz.karayolu} road); ${Math.round(hz.toplamTur)} s/round-trip (${hemYuzde.toFixed(1)}% of cycle).` : `Şekil 2e — Hemzemin geçit & TSP gecikmesi: geçit başına yavaşlama (gri) + karayolu bekleme (öncelik). ${hz.adet} geçit (${hz.karayolu} karayolu); ${Math.round(hz.toplamTur)} s/tur (çevrimin %${hemYuzde.toFixed(1)}'i).`}</div></div>` : "";
  const kisitFig = (g && maks.gecerli && maks.kisitlar.length) ? `<div class="fig">${kisitBarSvg(maks.kisitlar, kritikRenk, en)}<div class="cap">${en ? "Figure 2c — Determining constraint: competing headway limits (block / terminal turnback / single track / junction / signal); the longest binds (hMin)." : "Şekil 2c — Belirleyici kısıt: rakip headway limitleri (blok / terminal turnback / tek hat / kavşak / sinyal); en uzunu bağlar (hMin)."}</div></div>` : "";
  const hizFig = (g && line && loopYbf) ? `<div class="fig">${hizProfilSvg(loopYbf, line, en)}<div class="cap">${en ? "Figure 3b — Speed profile v(x): actual speed (blue) vs. segment speed limit (dashed), outbound leg. Dips = station stops; below-limit = acceleration/braking." : "Şekil 3b — Hız profili v(x): gerçek hız (mavi) ile segment hız limiti (kesikli), gidiş legi. Dipler = istasyon duruşları; limit altı = hızlanma/frenleme."}</div></div>` : "";

  // Düz kavşak (flat junction) blocking-time DÖKÜMÜ — kritik kavşağın Sperrzeit bileşenleri.
  // Yalnız çakışmalı bir makas varsa üretilir; tren boyunun kavşak işgaline katkısını gösterir.
  const kavsakDetayBlok = maks.kavsakDetay ? (() => {
    const d = maks.kavsakDetay!;
    const bagliyor = maks.baglayanAnahtar === "kavsak";
    const rows: (string | number)[][] = [
      [en ? "Route setting (throw)" : "Makas tanzim", `${Math.round(d.tSetup)} s`],
      [en ? "Sighting / reaction" : "Görme / reaksiyon", `${d.tGorme} s`],
      [en ? `Traverse + ${Math.round(stock.length)} m train clearing @ ${Math.round(d.gecisHizi * 3.6)} km/h`
          : `Geçiş + ${Math.round(stock.length)} m tren temizleme @ ${Math.round(d.gecisHizi * 3.6)} km/h`, `${Math.round(d.tGecis)} s`],
      [en ? "Route release" : "Rota serbest bırakma", `${Math.round(d.tRelease)} s`],
      [en ? "Single pass (subtotal)" : "Tek geçiş (ara toplam)", `${Math.round(d.tekGecis)} s`],
      [en ? `Conflict headway (opposing ×${d.faktor})` : `Çakışma headway (karşı-yön ×${d.faktor})`, `${Math.round(d.isgal)} s`],
    ];
    const not = en
      ? `Flat junction <b>${esc(d.ad.replace(/^Junction — |^Kavşak — /, ""))}</b>: for the crossing to clear, the train's <b>rear</b> must also pass the fouling point, so the traverse path is the constraint zone <b>plus the ${Math.round(stock.length)} m train length</b> at ${Math.round(d.gecisHizi * 3.6)} km/h (a longer vehicle occupies the junction longer). Opposing arrival + departure use the crossover in turn, hence ×${d.faktor}.${bagliyor ? " <b>This junction is the binding constraint (hMin).</b>" : ""}`
      : `Düz kavşak <b>${esc(d.ad.replace(/^Kavşak — /, ""))}</b>: kavşağın serbest kalması için trenin <b>kuyruğu</b> da fouling noktasını geçmeli; bu yüzden geçiş yolu, kısıt bölgesi <b>artı ${Math.round(stock.length)} m tren boyu</b>, ${Math.round(d.gecisHizi * 3.6)} km/h geçiş hızında alınır (uzun araç kavşağı daha uzun işgal eder). Karşı-yön varış + kalkış crossover'ı sırayla kullandığından ×${d.faktor}.${bagliyor ? " <b>Bu kavşak belirleyici kısıttır (hMin).</b>" : ""}`;
    return `<h3 class="sub">${en ? "Critical Junction — Blocking-Time" : "Kritik Kavşak — Blocking-Time"}</h3>${tbl([en ? "Component" : "Bileşen", en ? "Time" : "Süre"], rows, { first: true })}<div class="gs" style="font-size:9.5pt">${not}</div>`;
  })() : "";

  // ---- Kapak künye ----
  const kunye = [
    [L.kunye.proje, meta.projeAdi], [L.kunye.hat, meta.hatAdi], [L.kunye.dok, meta.dokumanNo], [L.kunye.rev, meta.revizyon],
    [L.kunye.tarih, meta.tarih || "—"], [L.kunye.idare, meta.idare], [L.kunye.yuk, meta.yuklenici], [L.kunye.mus, meta.musavir],
    [L.kunye.firma, meta.sinyalizasyonFirmasi],
    // İzlenebilirlik (Büyük sıçrama B): motor sürümü DAİMA kapakta — her rapor deterministik
    // motorla üretilir ve künyesinden yeniden üretilebilir (ayrıntı: bölüm 10, seçiliyse).
    [en ? "Engine version" : "Motor sürümü", `v${MOTOR_SURUMU}`],
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

  // ---- Monte-Carlo gecikme / robustluk (kpi yardımcısı tanımlandıktan SONRA) ----
  // Studio ekranıyla BİREBİR motor (signalling.monteCarlo) + kalıcı girdiler (isletme.mcMean*),
  // eşik 120 s. Deneme sayısı rapora özel 40'a düşürülür: rapor SUNUCUDA senkron üretilir ve
  // her denemede tüm filo × tam hat simüle edilir (en uzun hatta 150 deneme ~8 s CPU → maliyet/
  // yavaşlık). 40 deneme rapordaki illüstratif figür için istatistiksel olarak yeterli
  // (aggregate ~40×filo örnek; per-tren P90 dengeli) ve worst-case ~2 s. Ekrandaki interaktif
  // keşif 150'de kalır. Altyazı fiili deneme sayısını yazar → tutarsızlık olmaz.
  const MC_TRIALS = 40, MC_ESIK = 120;
  const mc: MonteCarloResult | null = (line && filoGercek > 0 && bfHeadway > 0)
    ? monteCarlo(line, stock,
        { headway: bfHeadway, count: filoGercek, sinyaller: sinyalKonumlari(rings, cfg) },
        { trials: MC_TRIALS, meanEntry: isletme.mcMeanEntrySn, meanDwell: isletme.mcMeanDwellSn, threshold: MC_ESIK })
    : null;
  const mcBolum = mc ? (() => {
    const dakikRenk = mc.onTimePct >= 90 ? "#0E7C57" : mc.onTimePct >= 75 ? GOLD : RED;
    const mcKpi = `<div class="kpi-row">
      ${kpi(en ? "Punctuality (≤2 min)" : "Dakiklik (≤2 dk)", `%${mc.onTimePct.toFixed(0)}`, `${mc.trials} ${en ? "trials" : "deneme"}`, dakikRenk)}
      ${kpi(en ? "Mean delay" : "Ort. gecikme", sure(mc.meanDelay), en ? "across all trains" : "tüm trenler", INK)}
      ${kpi("P90", sure(mc.p90Delay), en ? "90% below this" : "%90 bunun altında", INK)}
      ${kpi(en ? "Worst case" : "En kötü", sure(mc.maxDelay), en ? "observed peak" : "gözlenen tepe", INK)}
    </div>`;
    const giris = Math.round(isletme.mcMeanEntrySn), durak = Math.round(isletme.mcMeanDwellSn);
    const acik = en
      ? `Over <b>${mc.trials}</b> simulated services, each train receives a random entry delay (mean ${giris} s) and per-stop dwell deviation (mean ${durak} s), drawn from an exponential distribution; the propagation of these primary delays to following trains is measured. <b>%${mc.onTimePct.toFixed(0)}</b> of arrivals stay within the ${Math.round(MC_ESIK / 60)}-minute threshold, with a mean delay of <b>${sure(mc.meanDelay)}</b> and a P90 of <b>${sure(mc.p90Delay)}</b>. The spread chart shows whether an early train's delay dampens or cascades down the service order — a rising median indicates a timetable with insufficient recovery margin.`
      : `<b>${mc.trials}</b> simüle edilen seferde her tren, üstel dağılımdan çekilen rastgele bir giriş gecikmesi (ort. ${giris} s) ve durak başına bekleme sapması (ort. ${durak} s) alır; bu birincil gecikmelerin sonraki trenlere yayılımı ölçülür. Varışların <b>%${mc.onTimePct.toFixed(0)}</b>'i ${Math.round(MC_ESIK / 60)} dakikalık eşiğin içinde kalır; ortalama gecikme <b>${sure(mc.meanDelay)}</b>, P90 ise <b>${sure(mc.p90Delay)}</b>'dir. Yayılım grafiği, öndeki bir trenin gecikmesinin sefer sırası boyunca sönümlenip sönümlenmediğini gösterir — medyanın yükselmesi, tarifenin toparlanma payının yetersiz olduğuna işaret eder.`;
    // Şekil 6/7 (MC dağılımı + yayılım) Grafikler bölümüne taşındı (mc üst kapsamda).
    return `<h3 class="sub" style="page-break-before:always">${en ? "4.1 Robustness — Monte-Carlo Delay Analysis" : "4.1 Robustluk — Monte-Carlo Gecikme Analizi"}</h3>
      <div class="gs" style="font-size:10pt">${acik}</div>
      ${mcKpi}`;
  })() : "";

  // ---- Çizelge çakışma analizi (#2) — tek-hat karşılaşmaları + sistemik headway<hMin ----
  // Bildfahrplan ile birebir loopY + filo; çift hatta çakışma yok, tek-hat kesimlerde
  // meet/pass çakışması ve ulaşılan aralık < min headway sistemik uyarısı raporlanır.
  const cakismaBolum = (line && loopYbf && filoGercek > 0) ? (() => {
    const ck = cakismaTespit(rings, stock, cfg, loopYbf, filoGercek, isletme);
    const yesil = "#0E7C57";
    const baslik = `<h3 class="sub" style="page-break-before:always">${en ? "4.2 Timetable Conflict Analysis" : "4.2 Çizelge Çakışma Analizi"}</h3>`;
    if (!ck.cakismaVar) {
      const metin = en
        ? `At the planned ${filoGercek}-tram fleet (${bfHeadway}s achieved interval), the timetable is <b style="color:${yesil}">conflict-free</b>: ${ck.spanlar.length > 0 ? `the ${ck.spanlar.length} single-track section(s) are never occupied by two trams at once, and ` : "the line is fully double-track, and "}the achieved interval stays at or above the minimum headway the determining constraint allows.`
        : `Planlanan <b>${filoGercek} tramvaylık</b> filoda (${bfHeadway} s ulaşılan aralık) çizelge <b style="color:${yesil}">çakışmasızdır</b>: ${ck.spanlar.length > 0 ? `${ck.spanlar.length} tek-hat kesimi aynı anda iki tramvayla asla işgal edilmez ve ` : "hat tümüyle çift hattır ve "}ulaşılan aralık, belirleyici kısıtın izin verdiği minimum headway'in altına düşmez.`;
      return `${baslik}<div class="gs" style="font-size:10pt">${metin}</div>`;
    }
    const blok: string[] = [baslik];
    const giris = en
      ? `Conflict detection walks one full cycle of the round-trip trajectory with all ${filoGercek} trams (offset by the ${bfHeadway}s interval) and flags where two trams would demand the same single track at once, or where the achieved interval falls below the physical minimum. Each finding lists a concrete resolution.`
      : `Çakışma tespiti, ${filoGercek} tramvayın (${bfHeadway} s aralıkla ötelenmiş) tam bir gidiş-dönüş çevrimini adım adım tarar; iki tramvayın aynı anda aynı tek hattı istediği ya da ulaşılan aralığın fiziksel minimumun altına düştüğü yerleri işaretler. Her bulguya somut bir çözüm eklenir.`;
    blok.push(`<div class="gs" style="font-size:10pt">${giris}</div>`);
    if (ck.sistemik) {
      blok.push(`<div class="gs" style="font-size:10pt;border-left:3px solid ${RED};padding-left:10px"><b style="color:${RED}">${en ? "Systemic (block/headway)" : "Sistemik (blok/headway)"}:</b> ${esc(ck.sistemik.oneri)}</div>`);
    }
    if (ck.spanOzet.length) {
      const head = en
        ? ["Single-track section", "Meets/cycle", "Max overlap", "Type", "Resolution"]
        : ["Tek-hat kesimi", "Karşılaşma/çevrim", "Maks örtüşme", "Tür", "Çözüm"];
      const rows = ck.spanOzet.map((o) => [
        esc(o.ad),
        `${o.cakismaSayisi}`,
        sure(o.maxOrtusme),
        o.karsiYon ? (en ? "opposing (meet)" : "karşı yön (karşılaşma)") : (en ? "same dir (queue)" : "aynı yön (kuyruk)"),
        esc(o.oneri),
      ]);
      blok.push(tbl(head, rows, { first: true }));
    }
    return blok.join("\n");
  })() : "";

  // ---- Gecikme yayılımı / knock-on (#3) — deterministik zincir ----
  // İlk trene temsilî bir birincil gecikme enjekte edilir; ardışık trenlere yansıyan
  // (ikincil) gecikme ve sönümleme (recovery) noktası ölçülür. Bildfahrplan headway'iyle
  // birebir. En az 2 tren gerekir (tek trende yayılım tanımsız).
  const knockOnBolum = (line && filoGercek >= 2 && bfHeadway > 0) ? (() => {
    const birincil = Math.max(120, Math.round(bfHeadway * 0.75)); // temsilî birincil gecikme
    const ko = gecikmeYayilim(line, stock, { headway: bfHeadway, count: filoGercek, sinyaller: sinyalKonumlari(rings, cfg) }, 0, birincil);
    const baslik = `<h3 class="sub" style="page-break-before:always">${en ? "4.3 Delay Propagation (Knock-on)" : "4.3 Gecikme Yayılımı (Knock-on)"}</h3>`;
    const giris = en
      ? `A deterministic cascade: the lead train is given a representative <b>${birincil} s</b> primary delay, and the signalling simulation measures how much of it propagates to each following train (secondary delay) and where the timetable absorbs it (recovery). This isolates the single-incident chain that the aggregate Monte-Carlo (4.1) averages out.`
      : `Deterministik zincir: baş trene temsilî <b>${birincil} s</b> birincil gecikme verilir; sinyalizasyon simülasyonu bu gecikmenin ardışık trenlere ne kadar yansıdığını (ikincil gecikme) ve tarifenin onu nerede yuttuğunu (sönümleme) ölçer. Bu, toplu Monte-Carlo'nun (4.1) ortalama içinde erittiği tek-olay zincirini yalıtır.`;
    // Kompakt bar SVG — tren başına ikincil gecikme (birincil hariç; hedef vurgulu).
    const bars = ko.zincir;
    const maxV = Math.max(1, ...bars.map((b) => (b.tren === ko.hedefTren ? b.birincil : b.ikincil)));
    const W = 720, H = 150, padL = 44, padB = 26, padT = 12, padR = 10;
    const cw = W - padL - padR, ch = H - padT - padB;
    const bw = cw / bars.length;
    const barsXml = bars.map((b, i) => {
      const v = b.tren === ko.hedefTren ? b.birincil : b.ikincil;
      const h = (v / maxV) * ch;
      const x = padL + i * bw + bw * 0.15, y = padT + ch - h, w = bw * 0.7;
      const renk = b.tren === ko.hedefTren ? INK : (b.ikincil > 3 ? RED : "#B9C2CC");
      const et = v > 0 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle" font-size="7" fill="${renk}">${Math.round(v)}</text>` : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${renk}"/>${et}<text x="${(x + w / 2).toFixed(1)}" y="${(padT + ch + 9).toFixed(1)}" text-anchor="middle" font-size="7" fill="#6B7480">${b.tren + 1}</text>`;
    }).join("");
    const recovX = ko.sonumleme !== null ? padL + (ko.sonumleme - 0) * bw + bw * 0.5 : -1;
    const recovLine = recovX > 0 ? `<line x1="${recovX.toFixed(1)}" y1="${padT}" x2="${recovX.toFixed(1)}" y2="${padT + ch}" stroke="#0E7C57" stroke-width="1" stroke-dasharray="3 2"/><text x="${recovX.toFixed(1)}" y="${(padT + 8).toFixed(1)}" text-anchor="middle" font-size="6.5" fill="#0E7C57">${en ? "recovery" : "sönümleme"}</text>` : "";
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img"><line x1="${padL}" y1="${padT + ch}" x2="${W - padR}" y2="${padT + ch}" stroke="#C7CDD4" stroke-width="1"/><text x="${padL - 6}" y="${padT + 6}" text-anchor="end" font-size="7" fill="#6B7480">s</text>${barsXml}${recovLine}</svg>`;
    const cap = en
      ? `Figure 8 — Knock-on cascade: primary delay on train 1 (dark) and the secondary delay it induces on each following train (red = affected, grey = negligible). The dashed line marks where the delay is absorbed.`
      : `Şekil 8 — Knock-on zinciri: 1. trendeki birincil gecikme (koyu) ve her ardışık trene yansıttığı ikincil gecikme (kırmızı = etkilenen, gri = ihmal edilebilir). Kesikli çizgi gecikmenin yutulduğu treni gösterir.`;
    const kpiRenk = ko.etkilenen === 0 ? "#0E7C57" : (ko.etkilenen >= 3 ? RED : GOLD);
    const kpis = `<div class="kpi-row">
      ${kpi(en ? "Affected trains" : "Etkilenen tren", `${ko.etkilenen}`, en ? "downstream" : "ardışık", kpiRenk)}
      ${kpi(en ? "Peak knock-on" : "En yüksek knock-on", sure(ko.maxIkincil), en ? "single train" : "tek tren", INK)}
      ${kpi(en ? "Total secondary" : "Toplam ikincil", sure(ko.toplamIkincil), en ? "sum over fleet" : "filo toplamı", INK)}
      ${kpi(en ? "Recovery" : "Sönümleme", ko.sonumleme !== null ? `${ko.sonumleme - ko.hedefTren} ${en ? "trains" : "tren"}` : (en ? "none" : "yok"), en ? "to absorb" : "sonra yutulur", ko.sonumleme !== null ? "#0E7C57" : RED)}
    </div>`;
    // Şekil 8 (knock-on zinciri) Grafikler bölümüne taşındı — burada yakalanır.
    knockOnFig = g ? `<div class="fig">${svg}<div class="cap">${cap}</div></div>` : "";
    return `${baslik}<div class="gs" style="font-size:10pt">${giris}</div>${kpis}<div class="gs" style="font-size:10pt"><b>${esc(ko.ozet)}</b></div>`;
  })() : "";

  // ---- Şubeler / Dallanma (#1) — her şube rotasının kapasitesi + kavşak kısıtı ----
  const subeBolum = subeler.length ? (() => {
    const baslik = `<h3 class="sub" style="page-break-before:always">${en ? "4.4 Branches (Junctions)" : "4.4 Şubeler (Dallanma)"}</h3>`;
    const giris = en
      ? `The line has <b>${subeler.length}</b> branch(es) diverging from the trunk through a physical turnout (facing-point junction). Each branch route (line start → junction → branch) is analysed with the same UIC 406 core; the diverging junction contributes its own blocking-time, so the branch capacity reflects the real switch.`
      : `Hat, ana hattan fiziksel bir makastan (yüz yüze kavşak turnout'u) ayrılan <b>${subeler.length}</b> şube taşır. Her şube rotası (hat başı → kavşak → şube) aynı UIC 406 çekirdeğiyle analiz edilir; ayrım makası kendi blocking-time'ını kattığından şube kapasitesi gerçek makası yansıtır.`;
    const head = en
      ? ["Branch", "Junction", "Branch length", "Route length", "Sustainable trams", "Min headway", "Determining constraint"]
      : ["Şube", "Kavşak", "Şube uzunluğu", "Rota uzunluğu", "Sürdürülebilir tramvay", "Min headway", "Belirleyici kısıt"];
    const rows = subeler.map((s) => {
      const at = Math.max(0, Math.min(ringsGiris.length, Math.round(s.atIndex)));
      const kavsakAd = at === 0 ? (ringsGiris[0]?.fromAd || "—") : (ringsGiris[at - 1]?.toAd || "—");
      const ef = subeEfektifRingler(ringsGiris, s);
      const m = maksimumTren(ef, stock, cfg, isletme);
      const subeKm = s.rings.reduce((a, r) => a + Math.max(0, r.uzunluk), 0) / 1000;
      const rotaKm = ef.reduce((a, r) => a + Math.max(0, r.uzunluk), 0) / 1000;
      return [
        esc(s.ad),
        esc(kavsakAd),
        `${subeKm.toFixed(1)} km`,
        `${rotaKm.toFixed(1)} km`,
        m.gecerli ? `${m.nSurdurulebilir}` : "—",
        m.gecerli ? `${Math.round(m.hMin)} s` : "—",
        m.gecerli ? esc(m.baglayanAd || "—") : "—",
      ];
    });
    const not = en
      ? `Note: the trunk section shared between the line start and each junction carries both trunk and branch trams; the combined load on that shared section is the governing operational limit (see the trunk capacity above).`
      : `Not: hat başı ile her kavşak arasındaki ortak ana hat kesimi hem ana hat hem şube tramvaylarını taşır; o ortak kesimdeki birleşik yük belirleyici işletme sınırıdır (yukarıdaki ana hat kapasitesine bakınız).`;
    return `${baslik}<div class="gs" style="font-size:10pt">${giris}</div>${tbl(head, rows, { first: true })}<div class="gs" style="font-size:9.5pt">${not}</div>`;
  })() : "";

  // ---- Ortak kesim yükü (#1-B/D) — şubeye servis treni girildiyse birleşik kapasite ----
  const ortakKesimBolum = (subeler.length && subeler.some((s) => (s.servisTren ?? 0) > 0)) ? (() => {
    const ok = ortakKesimAnaliz(ringsGiris, subeler, stock, cfg, isletme, filoGercek);
    if (!ok.aktif || !ok.kesimler.length) return "";
    const baslik = `<h3 class="sub" style="page-break-before:always">${en ? "4.5 Shared-Section Load (Branching)" : "4.5 Ortak Kesim Yükü (Dallanma)"}</h3>`;
    const giris = en
      ? `Where the trunk is shared between the line start and a junction, it carries BOTH the trunk service and every branch service diverging at or beyond that junction. The combined frequency there is the governing operational limit — higher than any single route's analysis. Each shared section's combined headway is checked against its physical minimum.`
      : `Hat başı ile bir kavşak arasındaki ortak kesim, hem ana hat servisini HEM DE o kavşaktan/sonrasından ayrılan tüm şube servislerini taşır. Oradaki birleşik frekans, tek tek rotaların analizinden yüksektir ve gerçek işletme sınırıdır. Her ortak kesimin birleşik headway'i fiziksel minimumla karşılaştırılır.`;
    const head = en
      ? ["Shared section (→ junction)", "Length", "Trunk", "Branches", "Combined", "Combined headway", "Min headway", "Verdict"]
      : ["Ortak kesim (→ kavşak)", "Uzunluk", "Ana hat", "Şube", "Birleşik", "Birleşik headway", "Min headway", "Sonuç"];
    const rows = ok.kesimler.map((k) => [
      esc(k.junctionAd),
      `${k.paylasilanKm.toFixed(1)} km`,
      `${k.anaFreq} ${en ? "tph" : "tr/sa"}`,
      `${k.subeFreq} ${en ? "tph" : "tr/sa"}`,
      `${k.birlesikFreq} ${en ? "tph" : "tr/sa"}`,
      `${k.birlesikHeadway} s`,
      `${k.minHeadway} s`,
      k.uygun ? (en ? "OK" : "UYGUN") : (en ? "OVER" : "AŞIRI"),
    ]);
    const renk = ok.uygun ? "#0E7C57" : RED;
    return `${baslik}<div class="gs" style="font-size:10pt">${giris}</div>${tbl(head, rows, { first: true })}<div class="gs" style="font-size:10pt;border-left:3px solid ${renk};padding-left:10px"><b style="color:${renk}">${ok.uygun ? (en ? "Shared sections OK" : "Ortak kesimler uygun") : (en ? "Shared section over capacity" : "Ortak kesim aşırı yüklü")}:</b> ${esc(ok.ozet)}</div>`;
  })() : "";

  // ---- YÖNETİCİ ÖZETİ (kapaktan sonra, 1. bölümden önce; 1 sayfa karar özeti) ----
  // Amaç: teknik detaya girmeden bir bakışta "hat ne taşır, neyle sınırlı, hedef uygun mu".
  const ozetSec = (() => {
    if (!maks.gecerli) return "";
    const kmUz = line ? (line.length / 1000).toFixed(1) : "—";
    const durakSayisi = rings.length + 1;
    const verdictRenk = headwayUygun || sunum ? "#0E7C57" : RED;
    const uygunMetni = headwayUygun
      ? (en ? "within the limit this point allows" : "bu noktanın izin verdiği sınırın içindedir")
      : (en ? "TIGHTER than this point allows — see the determining constraint" : "bu noktanın izin verdiğinden DAHA SIKIDIR — belirleyici kısıta bakınız");
    const strip = `<div class="kpi-row">
      ${kpi(en ? "Line length" : "Hat uzunluğu", `${kmUz} km`, en ? `${durakSayisi} stops` : `${durakSayisi} durak`, INK)}
      ${kpi(surdurEt, `${maks.nSurdurulebilir}`, en ? "UIC 406 sustainable" : "UIC 406 sürdürülebilir", INK)}
      ${kpi(minHwEt, `${s0(maks.hMin)}`, (maks.baglayanAd || "").slice(0, 22), verdictRenk)}
      ${kpi(en ? "Planned fleet" : "Planlanan filo", `${filoGercek}`, en ? "trams in service" : "serviste tramvay", INK)}
      ${kpi(L.kpi.pratik, `${pratikTph.toFixed(0)}`, L.altTph, INK)}
      ${kpi(L.kpi.uic, `%${uicDoluluk.toFixed(0)}`, (uicDoluluk <= 100 || sunum) ? L.altUygun : L.altIhlalK, (uicDoluluk <= 100 || sunum) ? "#0E7C57" : RED)}
    </div>`;
    const verdict = en
      ? `This <b>${kmUz} km</b> line (${durakSayisi} stops) carries a sustainable maximum of <b>${maks.nSurdurulebilir} trams</b> (theoretical ${maks.nTeorik}) under the UIC 406 blocking-time method. The determining constraint is <b>${esc(maks.baglayanAd || "—")}</b>, which sets the minimum interval between trams at <b>${Math.round(maks.hMin)} s</b>. The <b>${cfg.headway} s</b> design headway is <b style="color:${verdictRenk}">${uygunMetni}</b>. At the planned <b>${filoGercek}-tram</b> fleet the line runs at <b>%${uicDoluluk.toFixed(0)}</b> UIC 406 occupancy and passes about <b>${pratikTph.toFixed(0)} trams/hour</b> at a determining point.`
      : `Bu <b>${kmUz} km</b>'lik hat (${durakSayisi} durak), UIC 406 blocking-time yöntemiyle sürdürülebilir olarak en fazla <b>${maks.nSurdurulebilir} tramvay</b> (teorik ${maks.nTeorik}) taşır. Belirleyici kısıt <b>${esc(maks.baglayanAd || "—")}</b> olup tramvaylar arasındaki en küçük aralığı <b>${Math.round(maks.hMin)} s</b> olarak belirler. Tasarım hedefi olan <b>${cfg.headway} s</b> sefer aralığı, <b style="color:${verdictRenk}">${uygunMetni}</b>. Planlanan <b>${filoGercek} araçlık</b> filoyla hat <b>%${uicDoluluk.toFixed(0)}</b> UIC 406 doluluğunda çalışır ve belirleyici noktadan saatte yaklaşık <b>${pratikTph.toFixed(0)} tramvay</b> geçer.`;
    return `<section class="breakbefore">
      <div class="banner"><span class="no">00</span>${en ? "Executive Summary" : "Yönetici Özeti"}</div>
      ${strip}
      <div class="gs" style="font-size:10.5pt;margin-top:10px">${verdict}</div>
    </section>`;
  })();

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
  // 3.2 Kilitleme (Interlocking) Kontrol Tablosu — makaslardan türetilir; seçiliyse eklenir (G).
  const kilitlemeSub = dahil("kilitleme") ? (() => {
    const kt = kilitlemeTablosu(rings);
    if (!kt.length) return "";
    const ko = kilitlemeOzet(kt);
    const rows = kt.map((r) => [
      `<b>${esc(r.makasAd)}</b> <span style="font-size:8pt;color:#6B7480">k${kmFmt(r.km)} · ${esc(r.tipAd)}${r.tcc ? " · TCC" : ""}</span>`,
      esc(r.rota),
      r.makasKonum === "Ters" ? (en ? "Reverse" : "Ters") : (en ? "Normal" : "Normal"),
      esc(r.cakisan),
      esc(r.flankOverlap),
      `${r.tanzimSn ? `${r.tanzimSn}` : "—"} / ${r.serbestSn} / <b>${r.kilitSn}</b>`,
    ]);
    const giris = en
      ? `Interlocking control table derived from the line's switch zones: for each route, the required switch position (Normal/Reverse), the conflicting movements it locks, flank/overlap protection and setting/release times. ${ko.makas} switch zones · ${ko.rota} routes · ${ko.manevra} reverse moves · ${ko.tccli} require TCC · max locking ${ko.maxKilit} s.`
      : `Hattın makas bölgelerinden türetilen güzergâh–kilit tablosu: her rota için gereken makas konumu (Normal/Ters), kilitlenen çakışan hareketler, flank/overlap koruması ve tanzim/serbest süreleri. ${ko.makas} makas bölgesi · ${ko.rota} rota · ${ko.manevra} manevra · ${ko.tccli} TCC · azami kilit ${ko.maxKilit} s.`;
    const not = en
      ? "Normal = switch straight (main-line move); Reverse = switch thrown (crossover/manoeuvre). TCC = traffic-control approval required at every pass (facing/siding/depot). Locking = setting (switch throw × count) + route release; consistent with the blocking-time setup/release components."
      : "Normal = makas düz (ana hat geçişi); Ters = makas dönük (crossover/manevra). TCC = her geçişte trafik kontrol onayı zorunlu (karşılaşmalı/barınma/depo). Kilit = tanzim (makas hareketi × adet) + rota serbest bırakma; blocking-time tanzim/serbest bileşenleriyle tutarlıdır.";
    return `<h3 class="sub">${en ? "3.2 Interlocking Control Table" : "3.2 Kilitleme Kontrol Tablosu"}</h3>
  <div class="gs" style="font-size:10pt">${giris}</div>
  ${tbl([en ? "Switch / location" : "Makas / konum", en ? "Route" : "Rota", en ? "Switch" : "Konum", en ? "Locked (conflicting)" : "Kilitlenen (çakışan)", en ? "Flank / Overlap" : "Flank / Overlap", en ? "Set/Rel/Lock (s)" : "Tanzim/Serbest/Kilit (s)"], rows, { first: true })}
  <div class="gs" style="font-size:9pt">${not}</div>`;
  })() : "";

  // 3.3 Aspect Dizilimi (Signal Aspect Sequence) — sinyallerden 3-aspect blok dizilimi + görüş/fren denetimi (G).
  const aspectSub = dahil("aspect") ? (() => {
    const ad = aspectDizilim(rings, cfg);
    if (!ad.bloklar.length) return "";
    const yetersizler = ad.bloklar.filter((b) => !b.yeterli);
    const giris = en
      ? `Classic 3-aspect sequence derived from the outbound signals: a train approaching an occupied block sees Stop → Caution → Proceed. For adequate sighting/braking, every warning (caution) block must be at least the service braking distance at line design speed (v²/2b). Design speed <b>${Math.round(ad.tasarimHizKmh)} km/h</b> · braking distance <b>≈${Math.round(ad.frenMesafesi)} m</b> · <b>${ad.bloklar.length}</b> blocks · shortest block ${Math.round(ad.minBlok)} m · <b style="color:${ad.yetersizBlok ? RED : "#2E7D57"}">${ad.yetersizBlok}</b> block(s) shorter than the braking distance.`
      : `İleri-yön sinyallerinden türetilen klasik 3-aspect dizilim: işgal edilen bloğa yaklaşan tren Dur → Tedbir → Yol görür. Yeterli görüş/fren için her uyarı (Tedbir) bloğu, hattın tasarım hızındaki servis-fren mesafesinden (v²/2b) uzun olmalıdır. Tasarım hızı <b>${Math.round(ad.tasarimHizKmh)} km/h</b> · fren mesafesi <b>≈${Math.round(ad.frenMesafesi)} m</b> · <b>${ad.bloklar.length}</b> blok · en kısa blok ${Math.round(ad.minBlok)} m · <b style="color:${ad.yetersizBlok ? RED : "#2E7D57"}">${ad.yetersizBlok}</b> blok fren mesafesinden kısa.`;
    const tabloBlok = yetersizler.length
      ? tbl(
          [en ? "Block" : "Blok", en ? "Chainage (start–end)" : "Kilometraj (baş–son)", en ? "Length" : "Uzunluk", en ? "Braking dist." : "Fren mesafesi", en ? "Assessment" : "Değerlendirme"],
          yetersizler.map((b) => [
            `<b>B${b.no}</b>`, `k${kmFmt(b.basKm)} – k${kmFmt(b.sonKm)}`, `${b.uzunluk} m`, `≈${Math.round(ad.frenMesafesi)} m`,
            `<b style="color:${RED}">${en ? "Insufficient sighting/braking" : "Görüş/fren yetersiz"}</b>`,
          ]),
          { first: true },
        )
      : `<div class="gs ok" style="font-size:10pt">${en ? "All warning blocks are longer than the braking distance — the aspect spacing provides sufficient sighting/braking at design speed." : "Tüm uyarı blokları fren mesafesinden uzun — aspect aralığı tasarım hızında yeterli görüş/fren sağlar."}</div>`;
    const not = en
      ? "Blocks are bounded by stations and outbound signals; design speed = main-line maximum. A caution block shorter than the braking distance means a driver seeing Caution cannot stop before the Stop signal at the block end — the block length / sighting must be increased."
      : "Bloklar istasyon sınırları ve ileri-yön sinyallerle sınırlanır; tasarım hızı = ana hat azami. Fren mesafesinden kısa bir uyarı bloğu, Tedbir gören sürücünün blok sonundaki Dur'a yetişemeden duramayacağı anlamına gelir — blok uzunluğu / görüş artırılmalıdır.";
    return `<h3 class="sub">${en ? "3.3 Signal Aspect Sequence" : "3.3 Aspect Dizilimi (Signal Aspect Sequence)"}</h3>
  <div class="gs" style="font-size:10pt">${giris}</div>
  ${tabloBlok}
  <div class="gs" style="font-size:9pt">${not}</div>`;
  })() : "";

  const sinyalBolum = `
  <div class="banner"><span class="no">03</span>${lang === "en" ? "SIGNALLING — SIGNAL LAMPS (SG)" : "SİNYALİZASYON — SİNYAL LAMBALARI (SG)"}</div>
  <p>${lang === "en"
    ? `The line is protected by <b>${sinyalSayisi} signal lamps</b>; each outbound signal is a <b>block boundary</b>. The design layout is summarised below; the full signal schedule (per-lamp chainages) is held in the design model.`
    : `Hat, <b>${sinyalSayisi} adet sinyal lambası</b> ile korunur; her giden yön sinyali bir <b>blok sınırıdır</b>. Aşağıda sinyal düzeninin özeti verilmiştir; tam metraj listesi (sinyal-başı kilometraj) tasarım modelinde tutulur.`}</p>
  ${sinyalListe.length ? tbl(lang === "en" ? ["Indicator", "Value"] : ["Gösterge", "Değer"], sinyalOzetRows, { first: true }) : `<p class="muted">${lang === "en" ? "No signal lamps defined on this line yet (positions are entered in the Ringler module)." : "Bu hatta henüz sinyal lambası tanımlı değil (konumlar Ringler modülünde girilir)."}</p>`}
  ${kilitlemeSub}
  ${aspectSub}
`;


  // ---- İŞLETME & TALEP ANALİZİ (ters işletme) — GİRDİ→SONUÇ çerçevesi ----
  // "Siz şu girdiyi verdiniz → bu sonuç çıktı" biçiminde; iç formül/algoritma (sır) açığa çıkmaz.
  // MOD = "toplam" — Ters İşletme sayfasının VARSAYILAN modu (birebir aynı çıktı için).
  // Böylece rapordaki filo/öneri/tepe yük değerleri canlı Ters İşletme ekranıyla eşleşir.
  const tia = rings.length >= 2 ? tersIsletmeAnaliz(rings, stock, isletme, cfg) : null;

  // ---- 2.2 Kurp geometrisi & yanal konfor (doluluğa duyarlı öneriler) ----
  const dolulukByRing: Record<string, number> = {};
  if (tia) rings.forEach((r, i) => { const d = tia.duraklar[i]; if (d) dolulukByRing[r.id] = d.doluluk; });
  const kurpSatir = kurpKonforAnaliz(rings, cfg, tia ? dolulukByRing : undefined);
  const kurpKonforBol = kurpSatir.length ? (() => {
    const th = en
      ? ["Section", "Chainage", "R (m)", "Cant (mm)", "Speed (km/h)", "Lateral (m/s²)", "Assessment"]
      : ["Durak Arası", "Kilometraj", "R (m)", "Dever (mm)", "Hız (km/h)", "Yanal (m/s²)", "Değerlendirme"];
    const rows = kurpSatir.map((k) => [
      esc(k.ringAd), kmFmt(k.kmMutlak), `${Math.round(k.yaricap)}`, `${Math.round(k.dever * 1000)}`,
      `${k.vKmh}`, k.aYanal.toFixed(2),
      sunum ? (en ? "Compliant" : "Uygun")
        : k.seviye === "asim" ? `<b style="color:${RED}">${en ? "Exceeds" : "Aşıyor"}</b> — ${esc(k.mesaj)}`
          : k.seviye === "kalabalik" ? `<b style="color:${GOLD}">${en ? "Tight" : "Sınırda"}</b> — ${esc(k.mesaj)}`
            : (en ? "Compliant" : "Uygun"),
    ]);
    const oneriler = kurpSatir.filter((k) => k.seviye !== "ok");
    const not = sunum
      ? (en ? `Curve speeds are derived from the radius (v = √(R·(a + g·cant/gauge))), lateral acceleration held at the comfort ceiling ${cfg.aYanalKonfor.toFixed(2)} m/s².` : `Kurp hızları yarıçaptan türetilir (v = √(R·(a + g·dever/ekartman))); yanal ivme konfor tavanı ${cfg.aYanalKonfor.toFixed(2)} m/s²'de tutulur.`)
      : oneriler.length
        ? (en ? `${oneriler.length} curve(s) flagged — over-speed (lateral acceleration above the ${cfg.aYanalKonfor.toFixed(2)} m/s² comfort ceiling) or, at high occupancy, tight for standing passengers; recommended speeds are given. Lateral acceleration is independent of passenger count — occupancy only tightens the standing-passenger comfort threshold (${(0.65).toFixed(2)} m/s²).` : `${oneriler.length} kurp işaretlendi — hız fazlası (yanal ivme ${cfg.aYanalKonfor.toFixed(2)} m/s² konfor tavanı üstü) ya da yüksek dolulukta ayakta yolcu için sıkı; önerilen hızlar verildi. Yanal ivme yolcu sayısından bağımsızdır — doluluk yalnız ayakta-yolcu konfor eşiğini (${(0.65).toFixed(2)} m/s²) devreye alır.`)
        : (en ? `All ${kurpSatir.length} curve(s) are within the comfort ceiling (${cfg.aYanalKonfor.toFixed(2)} m/s²).` : `${kurpSatir.length} kurpun tamamı konfor tavanı (${cfg.aYanalKonfor.toFixed(2)} m/s²) içinde.`);
    const baslik = en ? "2.2 Curve Geometry & Lateral Comfort" : "2.2 Kurp Geometrisi ve Yanal Konfor";
    return `<h3 class="sub">${baslik}</h3>${tbl(th, rows, { first: true })}<div class="gs" style="font-size:9.5pt">${not}</div>`;
  })() : "";
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
        return `<h3 class="sub">${en ? "Demand, Required Fleet and Occupancy" : "Talep, Gereken Filo ve Doluluk"}</h3>${tbl(zt, zr, { first: true })}<div class="gs" style="font-size:9.5pt">${zn}</div>`;
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
      <p class="muted" style="font-size:9.5pt;margin-top:4px">${ozetSatir}</p>
      ${(() => {
        const tv = tavsiyeTramvaySayisi(rings, stock, isletme, cfg);
        if (!tv) return "";
        const drv = tv.surucu === "talep" ? (en ? "passenger demand" : "yolcu talebi") : tv.surucu === "frekans" ? (en ? "target headway" : "hedef sefer aralığı") : (en ? "capacity ceiling" : "kapasite tavanı");
        const kurpSat = tv.kurpAdet > 0
          ? (en ? ` Of ${tv.kurpAdet} curves, ${tv.kurpUyariMevcut} flagged standee-comfort at the current fleet, dropping to ${tv.kurpUyariTavsiye} at the recommended count.` : ` ${tv.kurpAdet} kurptan ${tv.kurpUyariMevcut}'inde mevcut filoda ayakta-yolcu konfor uyarısı vardı; tavsiye edilen sayıda ${tv.kurpUyariTavsiye}'e iniyor.`)
          : "";
        return `<div class="gs" style="border-left:3px solid ${INK};padding-left:10px;margin-top:6px"><b>${en ? "Recommended tram count" : "Tavsiye Edilen Tramvay Sayısı"}: ${tv.tavsiye}</b> — ${en ? `determined by ${drv}; at this fleet the interval is ~${Math.round(tv.ulasilanHeadwaySn)} s and peak occupancy ${Math.round(tv.ulasilanDoluluk * 100)}%. Demand driver ${tv.talepArac}, frequency floor ${tv.frekansArac}, sustainable ceiling ${tv.maksTavan}.${kurpSat}` : `belirleyen ${drv}; bu filoda sefer aralığı ~${Math.round(tv.ulasilanHeadwaySn)} s, tepe doluluk %${Math.round(tv.ulasilanDoluluk * 100)}. Talep sürücüsü ${tv.talepArac}, sefer-sıklığı tabanı ${tv.frekansArac}, sürdürülebilir tavan ${tv.maksTavan}.${kurpSat}`}</div>`;
      })()}`;

    // 5.6 Sefer ↔ Ters İşletme (entegre): temsili sefer aralığında araç konumları +
    // makasa yaklaşan araca bağlanan kısa dönüş önerileri (canlı sim ile aynı yörünge).
    // Kullanıcının girdiği sefer sıklığı (seferHeadwayDk) esas alınır — panel/Tarife ile paralel.
    const stHeadway = isletme.seferHeadwayDk && isletme.seferHeadwayDk > 0
      ? Math.round(isletme.seferHeadwayDk * 60)
      : (maks.cevrimSuresi > 0 && filoGercek > 0 ? Math.round(maks.cevrimSuresi / filoGercek) : cfg.headway);
    const ste = seferTersEntegre(rings, stock, cfg, isletme, stHeadway, 0);
    // Şekil 5c (sefer↔ters entegre konum diyagramı) Grafikler bölümüne taşındı — yakala.
    seferTersFig = (g && ste.gecerli) ? `<div class="fig">${seferTersSvg(ste)}<div class="cap">${en ? `Figure 5c — Vehicle positions at the representative interval: outbound and inbound trams, all reverse-running switches (km-labelled), with short-turn candidates highlighted in red and the tram-to-switch binding for each recommendation.` : `Şekil 5c — Temsili aralıkta araç konumları: gidiş ve dönüş tramvayları, ters işletme yapılabilen tüm makaslar (km etiketli), kırmızıyla vurgulanan kısa dönüş adayları ve her öneri için araç-makas bağlantısı.`}</div></div>` : "";
    let b56 = "";
    if (ste.gecerli) {
      const stHw = (s: number) => { const x = Math.max(0, Math.round(s)); const d = Math.floor(x / 60), k = x % 60; return d > 0 ? `${d}:${String(k).padStart(2, "0")}` : `${k} s`; };
      const oThead = en ? ["Tram", "Position", "Switch", "km", "Time to switch", "Busy/Quiet"] : ["Araç", "Konum", "Makas", "km", "Makasa ulaşım", "Yoğun/Sessiz"];
      const oRows = ste.oneriler.map((o) => [`${o.aracNo}`, `${o.aracKm.toFixed(2)} km`, `${esc(o.makasAd)} (${o.crossover === "x" ? "X" : "S"})`, `${o.makasKm.toFixed(2)}`, stHw(o.ulasimSn), `${o.oran.toFixed(1)}×`]);
      const oneriBlok = ste.oneriler.length
        ? `${tbl(oThead, oRows, { first: true })}
           <ul style="margin:6px 0 0 16px;padding:0;font-size:9pt;color:#334">${ste.oneriler.map((o) => `<li style="margin-bottom:2px">${esc(o.gerekce)}</li>`).join("")}</ul>`
        : `<p class="muted" style="font-size:9.5pt">${en ? "At this representative snapshot no tram is approaching a load-imbalanced switch in the outbound direction; the binding shifts as trams advance through the cycle." : "Bu temsili anlık-görüntüde yük dengesizliği olan bir makasa gidiş yönünde yaklaşan araç yok; araçlar çevrimde ilerledikçe bağlanan araç değişir."}</p>`;
      b56 = `<h3 class="sub">5.6 ${en ? "Service and Reverse-Running" : "Sefer ve Ters İşletme"}</h3>
      ${gsNot(en
        ? `At a ${stHw(stHeadway)} service interval the line is operated with <b>${ste.filo} trams</b>${ste.aracKirpildi ? ` (only <b>${ste.cizilenArac}</b> fit physically; the figure is capped accordingly)` : ""}. Vehicle positions along the ${(ste.L / 1000).toFixed(1)} km line are taken from the live-simulation trajectory, accounting for signal lamps, switch-transit speeds, road and pedestrian crossings, gradient and station dwells. Where demand leaves a switch zone with a busy inner leg and a quiet outer end, the short-turn is assigned to the outbound tram approaching that switch, with its time-to-switch read from the trajectory.`
        : `${stHw(stHeadway)} sefer aralığında hat <b>${ste.filo} tramvayla</b> ${ste.aracKirpildi ? `işletilir (yalnız <b>${ste.cizilenArac}</b> tanesi hatta sığar; şekil buna göre sınırlandırılmıştır)` : "işletilir"}. Araç konumları ${(ste.L / 1000).toFixed(1)} km hat boyunca canlı simülasyon yörüngesinden alınır; sinyal lambaları, makas geçiş hızları, karayolu ve yaya geçitleri, eğim ve istasyon duruşları hesaba katılır. Talep bir makas bölgesinin iç kolunu yoğun, dış ucunu sessiz bıraktığında kısa dönüş, o makasa yaklaşan gidiş aracına atanır; makasa ulaşım süresi yörüngeden okunur.`)}
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
            <div style="font-weight:800;color:#8E1224;font-size:10pt;letter-spacing:.02em">${baslik}</div>
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
      const ok = r.yon === 1 ? (en ? "rises" : "artar") : r.yon === -1 ? (en ? "falls" : "azalır") : "—";
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
    ? `The strongest lever is <b>${esc(okKok.ad)}</b> (swing ${okKok.salinim.toFixed(0)} tph) — the parameter to secure first in design and operation. The direction column states whether capacity rises or falls as the parameter increases.`
    : `En güçlü kaldıraç <b>${esc(okKok.ad)}</b> (salınım ${okKok.salinim.toFixed(0)} tramvay/sa) — tasarımda ve işletmede önce güvenceye alınması gereken parametredir. Yön sütunu, parametre artınca kapasitenin arttığını mı yoksa azaldığını mı gösterir.`}</div>`;
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

  // ——— DOĞRULAMA & GEÇERLEME (V&V) — bölüm 09 ———
  // Motorun çıktısı BAĞIMSIZ kapalı-form analitik referanslara karşı sertifikalanır.
  // Dürüst çerçeve: [analitik] = bağımsız referans (gerçek doğrulama), [tutarlılık] =
  // motorun kendi tanımı/tasarım değişmezleriyle uyum. Resmi teslimatta güven katmanı.
  const dogrulamaBolum = dahil("dogrulama") ? (() => {
    const vv = dogrulamaCalistir(rings, stock, cfg, isletme);
    const YESIL = "#2E7D57";
    const vvSay = (v: number, birim: string) => { const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2; return `${v.toFixed(d)}${birim ? " " + birim : ""}`; };
    const etiket = (b: boolean) => b ? (en ? "analytical" : "analitik") : (en ? "consistency" : "tutarlılık");
    const vvRows = vv.sonuclar.map((s) => [
      `<b>${esc(s.ad)}</b> <span style="font-size:8pt;color:#6B7480">[${etiket(s.bagimsiz)}] · ${esc(s.kategori)}</span><br><span style="font-size:8.5pt;color:#6B7480">${esc(s.yontem)}</span>`,
      vvSay(s.referans, s.birim), vvSay(s.hesaplanan, s.birim), `%${s.sapmaYuzde.toFixed(2)}`,
      `<b style="color:${s.gecti ? YESIL : RED}">${s.gecti ? (en ? "Pass" : "Geçti") : (en ? "Fail" : "Kaldı")}</b> <span style="font-size:8pt;color:#6B7480">(≤%${s.tolerans})</span>`,
    ]);
    const giris = en
      ? "Engine outputs are checked against independent closed-form (analytical) references — the standard verification method for engineering software. No external tool or dataset is required: because the physics is known in closed form, the numerical integration is validated directly. Checks tagged [analytical] are independent references (true validation); [consistency] checks confirm agreement with the engine's own definitions and design invariants."
      : "Motor çıktıları bağımsız kapalı-form (analitik) referanslara karşı sınanır — mühendislik yazılımı doğrulamasının standart yöntemi. Dış araç ya da veriye gerek yoktur: fizik kapalı-formda bilindiği için sayısal entegrasyon doğrudan doğrulanır. [analitik] etiketli kontroller bağımsız referanstır (gerçek doğrulama); [tutarlılık] kontrolleri motorun kendi tanımı ve tasarım değişmezleriyle uyumu gösterir.";
    return `<div class="banner breakbefore"><span class="no">09</span>${en ? "VERIFICATION & VALIDATION" : "DOĞRULAMA & GEÇERLEME"}</div>
  <p>${giris}</p>
  <div class="gs" style="font-size:10pt"><b style="color:${vv.gecen === vv.toplam ? YESIL : RED}">${vv.gecen}/${vv.toplam}</b> ${en ? "checks passed" : "kontrol geçti"} · ${en ? "maximum deviation" : "azami sapma"} %${vv.maxSapma.toFixed(2)}.</div>
  ${tbl([en ? "Check" : "Kontrol", en ? "Reference" : "Referans", en ? "Computed" : "Hesaplanan", en ? "Deviation" : "Sapma", en ? "Result" : "Sonuç"], vvRows, { first: true })}`;
  })() : "";

  // ——— İZLENEBİLİRLİK & TEKRAR-ÜRETİLEBİLİRLİK — bölüm 10 (Büyük sıçrama B) ———
  // Motor DETERMİNİSTİK: aynı girdi + aynı motor sürümü → AYNI sayı. Bu bölüm raporun
  // her ana sayısını künyeler — hangi girdilerden, hangi yöntemle, hangi bölümde üretildi —
  // ve girdi digest'i + motor sürümünü verir, böylece herhangi bir sayı tam olarak yeniden
  // üretilebilir/denetlenebilir. (Uydurma referans YOK — yalnız gerçek girdi + kanonik yöntem.)
  const izlenebilirlikBolum = dahil("izlenebilirlik") ? (() => {
    const num = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
    const giris = en
      ? "The engine is deterministic: the same input set and the same engine version reproduce the same numbers. This section is the report's audit trail — for each principal figure it records the inputs it derives from, the method used and the section where it is developed — together with the input digest and engine version below. Any number can therefore be independently reproduced and checked."
      : "Motor deterministiktir: aynı girdi kümesi ve aynı motor sürümü aynı sayıları yeniden üretir. Bu bölüm raporun denetim izidir — her ana sayının hangi girdilerden türediğini, hangi yöntemle ve hangi bölümde geliştirildiğini kaydeder — aşağıdaki girdi künyesi ve motor sürümüyle birlikte. Böylece herhangi bir sayı bağımsızca yeniden üretilip denetlenebilir.";

    // Motor künyesi (deterministik üretim beyanı).
    const kunyeStr = `<div class="gs" style="font-size:10pt"><b>${esc(en ? MOTOR_ADI.en : MOTOR_ADI.tr)}</b> · ${en ? "engine version" : "motor sürümü"} <b>v${MOTOR_SURUMU}</b> · ${en ? "report date" : "rapor tarihi"} ${esc(meta.tarih || "—")}. ${en ? "Method basis" : "Yöntem temeli"}: ${YONTEM_STANDARTLARI.map((y) => `${esc(y.ad)}`).join(" · ")}.</div>`;

    // Girdi künyesi — raporu belirleyen çekirdek parametreler (yeniden üretim için yeterli).
    const girdiRows: (string | number)[][] = [
      [en ? "Line — cells / total length" : "Hat — hücre / toplam uzunluk", `${rings.length} · ${line ? kmFmt(line.length) : "—"}`],
      [en ? "Vehicle" : "Araç", `${esc(stock.name || "—")} · ${Math.round(stock.length)} m · ${en ? "cap." : "kap."} ${isletme.aracYolcuKapasite} ${en ? "pax" : "yolcu"}`],
      [en ? "Acceleration / braking" : "Hızlanma / frenleme", `${num(cfg.ivme, 2)} / ${num(cfg.yavaslama, 2)} m/s²`],
      [en ? "Main-line / turnout speed" : "Ana hat / makas hızı", `${Math.round(cfg.vAnahat * 3.6)} / ${Math.round(cfg.vMakas * 3.6)} km/h`],
      [en ? "Target headway" : "Hedef headway", `${cfg.headway} s`],
      [en ? "Lateral comfort / gauge" : "Yanal konfor / ekartman", `${num(cfg.aYanalKonfor, 2)} m/s² · ${num(cfg.ekartman, 3)} m`],
      [en ? "UIC 406 occupancy cap" : "UIC 406 doluluk tavanı", `%${Math.round((cfg.dolulukTavani ?? 0.7) * 100)}`],
      [en ? "Peak demand / occupancy target" : "Pik talep / doluluk hedefi", `${isletme.pikYolcuSaat} ${en ? "pax/h" : "yolcu/sa"} · %${Math.round((isletme.dolulukHedefi || 0.85) * 100)}`],
      [en ? "Planned fleet" : "Planlanan filo", `${filoGercek}`],
    ];

    // İzlenebilirlik tablosu — her ana sayı → değer · kullanılan girdiler · yöntem · bölüm.
    const izRows: (string | number)[][] = [
      [en ? "Cycle time (RTT)" : "Çevrim süresi (RTT)", maks.gecerli ? `${num(maks.cevrimSuresi, 0)} s` : "—", en ? "line geometry, speeds, a/b, dwell" : "hat geometrisi, hızlar, a/b, duruş", en ? "Trapezoidal kinematics (microscopic)" : "Trapez kinematik (mikroskobik)", "04·06"],
      [en ? "Achieved headway" : "Ulaşılan headway", maks.gecerli ? `${num(bfHeadway, 0)} s` : "—", en ? "cycle time, planned fleet" : "çevrim, planlanan filo", en ? "cycle ÷ fleet" : "çevrim ÷ filo", "05·06"],
      [en ? "Determining min headway (hMin)" : "Belirleyici min headway (hMin)", maks.gecerli ? `${num(maks.hMin, 0)} s` : "—", en ? "block / terminal / single-track / junction limits" : "blok / terminal / tek-hat / kavşak kısıtları", en ? "longest binds (determining constraint)" : "en uzunu bağlar (belirleyici kısıt)", "04"],
      [en ? "Line capacity (sustainable fleet)" : "Hat kapasitesi (sürdürülebilir filo)", maks.gecerli ? `${maks.nSurdurulebilir}` : "—", en ? "cycle time, hMin, UIC 406 cap" : "çevrim, hMin, UIC 406 tavanı", en ? "⌊cycle ÷ hMin⌋ × cap" : "⌊çevrim ÷ hMin⌋ × tavan", "04"],
      [en ? "Blocking-time (min)" : "Blocking-time (min)", `${num(bt.minHeadway, 0)} s`, en ? "block lengths, speed, signal aspects" : "blok uzunlukları, hız, sinyal aspektleri", en ? "UIC 406 Sperrzeitentreppe" : "UIC 406 Sperrzeitentreppe", "04"],
      [en ? "UIC 406 occupancy" : "UIC 406 doluluk", `%${num(uicDoluluk, 0)}`, en ? "hMin, target headway" : "hMin, hedef headway", en ? "hMin ÷ headway" : "hMin ÷ headway", "04"],
      [en ? "Curve speed limit" : "Kurp hız limiti", "—", en ? "radius, cant, gauge, lateral comfort" : "yarıçap, dever, ekartman, yanal konfor", "v=√(R(a+g·d/e))", "02.2"],
      [en ? "Required fleet (demand)" : "Gereken filo (talep)", maks.gecerli ? `${siganTren}` : "—", en ? "peak demand, occupancy target, vehicle cap." : "pik talep, doluluk hedefi, araç kap.", en ? "demand ÷ capacity ÷ occupancy" : "talep ÷ kapasite ÷ doluluk", "05"],
      [en ? "Balancing speed" : "Denge hızı", "—", en ? "Davis A/B/C, power" : "Davis A/B/C, güç", "P/v = R(v)", "09"],
    ];

    return `<div class="banner breakbefore"><span class="no">10</span>${en ? "TRACEABILITY & REPRODUCIBILITY" : "İZLENEBİLİRLİK & TEKRAR-ÜRETİLEBİLİRLİK"}</div>
  <p>${giris}</p>
  ${kunyeStr}
  <h3 class="sub">${en ? "Input Digest (reproducing inputs)" : "Girdi Künyesi (yeniden üretim girdileri)"}</h3>
  ${tbl([en ? "Parameter" : "Parametre", en ? "Value" : "Değer"], girdiRows, { first: true })}
  <h3 class="sub">${en ? "Number → Input · Method · Section" : "Sayı → Girdi · Yöntem · Bölüm"}</h3>
  ${tbl([en ? "Quantity" : "Büyüklük", en ? "Value" : "Değer", en ? "Inputs" : "Girdiler", en ? "Method" : "Yöntem", en ? "Section" : "Bölüm"], izRows, { first: true })}`;
  })() : "";

  // ——— ÇOK-AMAÇLI OPTİMİZASYON (PARETO) — bölüm 11 (Büyük sıçrama F) ———
  // Filo kararının çakışan amaçlarını (maliyet ↔ yolcu bekleme ↔ doluluk) birlikte
  // değerlendirir: Pareto-etkin cephe + diz (matematiksel dirsek) + ağırlıklı optimum
  // (dengeli %50 maliyet/servis) + KONFOR KISITI (optimum, doluluk ≤ tavan kümesinde).
  // Motordan (maksimumTren: çevrim, hMin, nMax) türer — uydurma yok.
  const paretoBolum = dahil("pareto") && maks.gecerli ? (() => {
    const pr = paretoAnaliz({
      cevrimSn: maks.cevrimSuresi, hMinSn: maks.hMin, nMax: maks.nTeorik,
      pikYolcuSaat: isletme.pikYolcuSaat, aracKapasite: isletme.aracYolcuKapasite,
      konforTavani: isletme.dolulukHedefi, agirlik: 0.5,
    });
    if (!pr.noktalar.length) return "";
    const YESIL = "#2E7D57";
    const hw = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    const nk = (f: number) => pr.noktalar.find((n) => n.filo === f);
    const dol = (n?: { doluluk: number | null }) => (n && n.doluluk != null ? `%${Math.round(n.doluluk * 100)}` : "—");
    const satir = (rol: string, f: number, vurgu?: string) => {
      const n = nk(f);
      if (!n) return null;
      return [
        vurgu ? `<b style="color:${vurgu}">${rol}</b>` : `<b>${rol}</b>`,
        `${f}`, hw(n.headwaySn), `${n.beklemeDk.toFixed(1)} dk`, dol(n),
      ];
    };
    const rows = [
      satir(en ? "Knee (best balance)" : "Diz (en iyi denge)", pr.dizFilo),
      ...(pr.demandVar && pr.konforFilo ? [satir(en ? "Comfort limit" : "Konfor sınırı", pr.konforFilo)] : []),
      satir(en ? "Weighted optimum" : "Ağırlıklı optimum", pr.optimumFilo, YESIL),
      satir(en ? "Capacity wall" : "Kapasite duvarı", pr.duvarFilo, RED),
    ].filter((r): r is string[] => !!r);
    const giris = en
      ? `Fleet sizing has conflicting objectives: more vehicles raise cost but cut passenger waiting${pr.demandVar ? " and crowding" : ""}. Beyond the capacity wall (${pr.duvarFilo} vehicles) extra fleet no longer cuts waiting (headway floors at the minimum) — those points are dominated (over-fleeting). The weighted optimum below balances cost and service equally (½ / ½)${pr.demandVar ? "; a comfort constraint keeps the optimum within the fleets whose occupancy stays under the target, so it never recommends an over-crowded service" : ""}.`
      : `Filo boyutlandırması çakışan amaçlar taşır: daha çok araç maliyeti artırır ama yolcu beklemesini${pr.demandVar ? " ve doluluğu" : ""} düşürür. Kapasite duvarını (${pr.duvarFilo} araç) aşan filo beklemeyi artık düşürmez (headway fiziksel minimuma dayanır) — o noktalar baskındır (aşırı filo). Aşağıdaki ağırlıklı optimum maliyet ile servisi eşit (½ / ½) dengeler${pr.demandVar ? "; konfor kısıtı optimumu, doluluğu hedefin altında tutan filolarla sınırlar → aşırı-kalabalık servis önerilmez" : ""}.`;
    const konforNot = pr.demandVar
      ? (pr.konforSaglanabilir
          ? (en
              ? `Comfort (occupancy ≤ %${Math.round(pr.konforTavani * 100)}) requires at least ${pr.konforFilo} vehicles; the optimum (${pr.optimumFilo}) satisfies it at ${dol(nk(pr.optimumFilo))} occupancy.`
              : `Konfor (doluluk ≤ %${Math.round(pr.konforTavani * 100)}) için en az ${pr.konforFilo} araç gerekir; optimum (${pr.optimumFilo}) bunu ${dol(nk(pr.optimumFilo))} dolulukla sağlar.`)
          : (en
              ? `Even at the capacity wall (${pr.duvarFilo} vehicles) occupancy exceeds the comfort target (%${Math.round(pr.konforTavani * 100)}) — larger vehicles or higher line capacity are required.`
              : `Kapasite duvarında (${pr.duvarFilo} araç) bile doluluk konfor tavanını (%${Math.round(pr.konforTavani * 100)}) aşıyor — daha büyük araç veya daha yüksek hat kapasitesi gerekir.`))
      : (en
          ? "Knee = the most balanced point (nearest the utopia). Optimum = best under the equal cost/service weight."
          : "Diz = en dengeli nokta (ütopyaya en yakın). Optimum = eşit maliyet/servis ağırlığında en iyi.");
    return `<div class="banner breakbefore"><span class="no">11</span>${en ? "MULTI-OBJECTIVE OPTIMIZATION (PARETO)" : "ÇOK-AMAÇLI OPTİMİZASYON (PARETO)"}</div>
  <p>${giris}</p>
  ${tbl([en ? "Role" : "Rol", en ? "Fleet" : "Filo", en ? "Interval" : "Aralık", en ? "Wait" : "Bekleme", en ? "Occupancy" : "Doluluk"], rows, { first: true })}
  <div class="gs${pr.demandVar && !pr.konforSaglanabilir ? "" : " ok"}" style="font-size:10pt">${konforNot}</div>`;
  })() : "";

  // ——— GRAFİKLER (Görsel Analiz) — bölüm 08 ———
  // TÜM şekiller burada toplanır; yalnız "grafikler" seçiliyken (g) üretilir. Böylece
  // kullanıcı sadece grafikleri seçtiğinde dahi dolu, tek başına anlamlı bir görsel bölüm
  // alır (şekiller artık içerik bölümlerine gömülü değil). Her altyazı kendi başına açıklar.
  const grafik08: string[] = [];
  if (g) {
    if (line) grafik08.push(`<div class="fig">${ringSemaSvg(rings, subeler)}<div class="cap">${L.fig1}${subeler.length ? (en ? ` — with ${subeler.length} branch(es) diverging at junctions (red)` : ` — kavşaklardan ayrılan ${subeler.length} şube (kırmızı) dâhil`) : ""}</div></div>`);
    if (kisitFig) grafik08.push(kisitFig);
    if (hemzeminFig) grafik08.push(hemzeminFig);
    if (bfFig) grafik08.push(bfFig);
    if (hizFig) grafik08.push(hizFig);
    if (line) grafik08.push(`<div class="fig">${sperrzeitSvg(bt, line.length, kritikRenk, en)}<div class="cap">${sunum ? (lang === "en" ? `Figure 4 — Sperrzeitentreppe: block occupation (blocking-time) windows; min headway ${Math.round(bt.minHeadway)}s.` : `Şekil 4 — Sperrzeitentreppe: blok işgal (blocking-time) pencereleri; min headway ${Math.round(bt.minHeadway)} s.`) : L.fig4(Math.round(bt.minHeadway))}</div></div>`);
    grafik08.push(`<div class="fig">${blockingBarSvg(bt.bloklar, bt.kritikBlok, kritikRenk, en)}<div class="cap">${sunum ? (lang === "en" ? "Figure 5 — Per-block blocking-time component distribution (determining block highlighted)." : "Şekil 5 — Blok başına blocking-time bileşen dağılımı (belirleyici blok vurgulu).") : L.fig5}${bt.bloklar.length > 16 ? (lang === "en" ? ` (highest 16 of ${bt.bloklar.length} blocks; full list in the table below)` : ` (${bt.bloklar.length} bloktan en yüksek 16'sı; tümü aşağıdaki tabloda)`) : ""}</div></div>`);
    if (tia) grafik08.push(`<div class="fig">${yukDwellSvg(tia.duraklar, rings, en)}<div class="cap">${en ? "Figure 5b — Load profile (per-stop peak load, coloured by occupancy; peak marked) and dwell breakdown (door-open / passenger exchange / door-close), along the line." : "Şekil 5b — Yük profili (durak başına tepe yük, doluluğa göre renkli; tepe işaretli) ve duruş dökümü (kapı açma / yolcu değişimi / kapı kapama), hat boyunca."}</div></div>`);
    if (seferTersFig) grafik08.push(seferTersFig);
    if (mc) grafik08.push(
      `<div class="fig">${mcHistSvg(mc, en)}<div class="cap">${en ? `Figure 6 — Delay distribution: ${mc.trials} services × ${mc.perTren.length} trains; blue = on-time (below threshold), red = late. Vertical marks: mean · threshold · P90.` : `Şekil 6 — Gecikme dağılımı: ${mc.trials} sefer × ${mc.perTren.length} tren; mavi = dakik (eşik altı), kırmızı = geç. Dikey işaretler: ortalama · eşik · P90.`}</div></div>`,
      `<div class="fig">${mcYayilimSvg(mc, en)}<div class="cap">${en ? "Figure 7 — Propagation by service order: median (dot + line) with P90 whisker per train. A rising trend = delay cascading to later trains." : "Şekil 7 — Sefer sırasına göre yayılım: tren başına medyan (nokta + çizgi) ve P90 bıyığı. Yükselen eğilim = gecikmenin sonraki trenlere kademelenmesi."}</div></div>`,
    );
    if (knockOnFig) grafik08.push(knockOnFig);
  }
  const grafikBaslik = en ? "VISUAL ANALYSIS (CHARTS)" : "GÖRSEL ANALİZ (GRAFİKLER)";
  const grafikGiris = en
    ? "This section consolidates all analytical charts derived from your line — line schematic, determining constraint, level-crossing delay, time-distance diagram (Bildfahrplan), speed profile, blocking-time (Sperrzeitentreppe), load/dwell profile, integrated reverse-running snapshot and delay-robustness charts. Each figure caption is self-contained; the corresponding numeric analysis is in its own section."
    : "Bu bölüm hattınızdan türetilen tüm analitik grafikleri tek yerde toplar — hat şeması, belirleyici kısıt, hemzemin geçit gecikmesi, zaman-mesafe diyagramı (Bildfahrplan), hız profili, blocking-time (Sperrzeitentreppe), yük/duruş profili, entegre ters işletme anlık görüntüsü ve gecikme-robustluk grafikleri. Her şeklin altyazısı kendi başına açıklayıcıdır; sayısal analizler ilgili bölümlerdedir.";
  const grafiklerBolum = (g && grafik08.length) ? `<div class="banner breakbefore"><span class="no">08</span>${grafikBaslik}</div><p>${grafikGiris}</p>${grafik08.join("\n")}` : "";

  return `<!doctype html><html lang="${L.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.dokumanNo)} — ${esc(meta.projeAdi)}</title>
${raporStil(INK, RED, GOLD)}</head>
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

  <!-- KAPAK — tek marka: sinyalizasyon/müşavir firması. Üretici (RaySim) ibaresi
       KULLANILMAZ; teslimat tümüyle firmanın kurumsal kimliğiyle sunulur. -->
  <section class="cover">
    <div class="cover-brand">${meta.logo ? `<img class="cover-logo" src="${meta.logo}" alt="${esc(meta.sinyalizasyonFirmasi || "logo")}"/>` : firmaAsls ? aslsLogoSvg : `<span class="cover-brand-name">${esc(meta.sinyalizasyonFirmasi || "")}</span>`}</div>
    <div class="rule"></div>
    <div class="sys">${L.sys}</div>
    <div class="kit">${L.kit}</div>
    <div class="proje">${esc(meta.projeAdi)}</div>
    <div class="hat">${esc(meta.hatAdi)}</div>
    <table class="kunye"><tbody>${kunye.map(([a, b]) => `<tr><td class="l k">${esc(a)}</td><td class="l">${esc(b)}</td></tr>`).join("")}</tbody></table>
    <div class="qr">${qrSvg(qrHedef, 92)}<div class="qr-cap"><b>${derinLink ? L.qrCap : L.qrCapGenel}</b><br><span class="qr-hint">${L.qrHint}</span> · ${esc(qrHost)}</div></div>
    <div class="foot">${esc(L.foot)}${bugun ? " · " + esc(bugun) : ""}</div>
  </section>

  <!-- İÇİNDEKİLER -->
  <section class="toc breakbefore">
    <div class="toc-h">${L.toc}</div>
    <ol class="toc-list">
      ${dahil("ozet") ? `<li><b>00</b>${en ? "Executive Summary" : "Yönetici Özeti"}</li>` : ""}
      <li><b>01</b>${L.s1}</li>
      ${(dahil("hat") || dahil("kurpKonfor")) ? `<li><b>02</b>${L.s2}<ul>${dahil("hat") ? `<li>2.1 ${en ? "Per-cell Constraint Analysis" : "Ring Bazında Kısıt Analizi"}</li>` : ""}${dahil("kurpKonfor") ? `<li>2.2 ${en ? "Curve & Lateral Comfort" : "Kurp & Yanal Konfor"}</li>` : ""}</ul></li>` : ""}
      <li><b>03</b>${en ? "Signalling — Signal Lamps (SG)" : "Sinyalizasyon — Sinyal Lambaları (SG)"}${(dahil("kilitleme") || dahil("aspect")) ? `<ul>${dahil("kilitleme") ? `<li>3.2 ${en ? "Interlocking Control Table" : "Kilitleme Kontrol Tablosu"}</li>` : ""}${dahil("aspect") ? `<li>3.3 ${en ? "Signal Aspect Sequence" : "Aspect Dizilimi"}</li>` : ""}</ul>` : ""}</li>
      ${dahil("kapasite") ? `<li><b>04</b>${L.s4}<ul><li>4.1 Blocking-Time (Sperrzeitentreppe)</li></ul></li>` : ""}
      ${dahil("isletme") ? `<li><b>05</b>${en ? "Operations & Demand Analysis" : "İşletme & Talep Analizi"}<ul>
        <li>5.1 ${en ? "Passenger Load Profiles" : "Yolcu Yük Profilleri"}</li>
        <li>5.2 ${en ? "Depot Dispatch" : "Depo Çıkışı"}</li>
        <li>5.3 ${en ? "Stops Needing Turnback" : "Dönüşe İhtiyaç Duyan Duraklar"}</li>
        <li>5.4 ${en ? "Reverse-Running Variations" : "Ters İşletme Varyasyonları"}</li>
        <li>5.5 ${en ? "Fleet & Recommendation" : "Filo & Öneri"}</li></ul></li>` : ""}
      ${dahil("tarife") ? `<li><b>06</b>${en ? "Timetable (Service Schedule)" : "Tarife (Zaman Çizelgesi)"}<ul><li>6.1 ${en ? "First Departures" : "İlk Kalkışlar"}</li></ul></li>` : ""}
      ${dahil("duyarlilik") ? `<li><b>07</b>${en ? "Sensitivity (Tornado)" : "Duyarlılık (Tornado)"}</li>` : ""}
      ${g ? `<li><b>08</b>${en ? "Visual Analysis (Charts)" : "Görsel Analiz (Grafikler)"}</li>` : ""}
      ${dahil("dogrulama") ? `<li><b>09</b>${en ? "Verification & Validation" : "Doğrulama & Geçerleme"}</li>` : ""}
      ${dahil("izlenebilirlik") ? `<li><b>10</b>${en ? "Traceability & Reproducibility" : "İzlenebilirlik & Tekrar-Üretilebilirlik"}</li>` : ""}
      ${dahil("pareto") ? `<li><b>11</b>${en ? "Multi-Objective Optimization (Pareto)" : "Çok-Amaçlı Optimizasyon (Pareto)"}</li>` : ""}
    </ol>
    ${g ? `<div class="toc-fig">${en ? "Figures" : "Şekiller"}<ul>
      <li>${en ? "Fig. 1 — Line schematic" : "Şekil 1 — Hat şeması"}</li>
      <li>${en ? "Fig. 3 — Time-distance (Bildfahrplan)" : "Şekil 3 — Zaman-mesafe (Bildfahrplan)"}</li>
      <li>${en ? "Fig. 4 — Sperrzeitentreppe" : "Şekil 4 — Sperrzeitentreppe"}</li>
      <li>${en ? "Fig. 5 — Blocking-time components" : "Şekil 5 — Blocking-time bileşenleri"}</li>
      ${mc ? `<li>${en ? "Fig. 6 — Monte-Carlo delay distribution" : "Şekil 6 — Monte-Carlo gecikme dağılımı"}</li>
      <li>${en ? "Fig. 7 — Delay propagation" : "Şekil 7 — Gecikme yayılımı"}</li>` : ""}</ul></div>` : ""}
  </section>

  <!-- 0: Yönetici Özeti -->
  ${dahil("ozet") ? ozetSec : ""}

  <!-- 1: Girdi Parametreleri — DAİMA dâhil (taban) -->
  <div class="banner breakbefore"><span class="no">01</span>${L.s1}</div>
  <p>${L.s1i}</p>
  ${tbl(L.thParam, paramRows, { first: true })}

  <!-- 2 -->
  ${dahil("hat") ? `<div class="banner"><span class="no">02</span>${L.s2}</div>
  <p>${L.s2i(rings.length, cfg.headway)}</p>
  ${tbl(L.thRing, ringRows, { first: true })}
  <h3 class="sub" style="page-break-before:always">${sunum ? (lang === "en" ? "2.1 Per-cell Constraint Analysis" : "2.1 Ring Bazında Kısıt Analizi") : L.s21}</h3>
  ${ringDetay}` : ""}
  ${dahil("kurpKonfor") ? kurpKonforBol : ""}

  <!-- 3: Sinyalizasyon — DAİMA dâhil (taban) -->
  ${sinyalBolum}

  <!-- 4 -->
  ${dahil("kapasite") ? `<div class="banner"><span class="no">04</span>${L.s4}</div>
  <p>${L.s4i}</p>
  ${kpiRow}
  ${kapasiteTbl}
  ${kapGirdiNot}
  ${sunum ? `<div class="gs ok">${lang === "en" ? `Capacity analysis confirms that all blocks remain within the target headway (${cfg.headway} s); no limit is exceeded. The design is compliant in terms of capacity.` : `Kapasite analizi, tüm blokların hedef headway (${cfg.headway} s) sınırı içinde kaldığını göstermektedir; sınır aşımı bulunmamaktadır. Tasarım, kapasite açısından uygundur.`}</div>` : ""}
  <p class="muted" style="font-size:11px;margin-top:6px">${L.kapNot}</p>
  <div class="gs" style="font-size:10pt">${kapYorum}</div>
  ${kavsakDetayBlok}
  <h3 class="sub">${lang === "en" ? "Terminal Turnback Capacity" : "Terminal Turnback Kapasitesi"}</h3>
  ${turnbackTblStr}
  <h3 class="sub">${L.s41}</h3>
  <div class="gs" style="font-size:9pt">${L.btTanim}</div>
  ${btTbl}
  ${mcBolum}
  ${cakismaBolum}
  ${knockOnBolum}
  ${subeBolum}
  ${ortakKesimBolum}` : ""}

  <!-- 5: İşletme & Talep Analizi (ters işletme) -->
  ${dahil("isletme") ? isletmeBolum : ""}

  ${dahil("tarife") ? tarifeBolum : ""}

  ${dahil("duyarlilik") ? duyarlilikBolum : ""}

  <!-- 8: Grafikler (Görsel Analiz) — tüm şekiller; yalnız "grafikler" seçilince -->
  ${grafiklerBolum}

  <!-- 9: Doğrulama & Geçerleme (V&V) — motor sertifikasyonu -->
  ${dogrulamaBolum}

  <!-- 10: İzlenebilirlik & Tekrar-Üretilebilirlik — motor sürümü + girdi künyesi + sayı→yöntem izi -->
  ${izlenebilirlikBolum}

  <!-- 11: Çok-Amaçlı Optimizasyon (Pareto) — maliyet↔bekleme↔doluluk cephe + diz + optimum + konfor kısıtı -->
  ${paretoBolum}

  ${cekirdekNot}

</td></tr></tbody></table>
</div>
</body></html>`;
}
