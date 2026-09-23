// raysim — PDF RAPOR BÖLÜM ÜRETİCİLERİ (rapor.ts'ten ayrıldı; bakım borcu).
// Her fonksiyon kendi-kendine yeter: yardımcıları (tbl/esc/kmFmt/RED) raporCizim'den,
// motorları kendi lib'lerinden import eder, yalnız VERİ parametresi alır. rapor.ts
// bunları `dahil("x") ? bolumX(...) : ""` ile çağırır. İçerik BİREBİR taşındı (byte-diff).

import type { RollingStock, Line } from "./types";
import type { DurakArasiRing } from "./ring";
import type { SimConfig, Isletme, ProjeMeta } from "./config";
import { tbl, esc, kmFmt, RED } from "./raporCizim";
import { kilitlemeTablosu, kilitlemeOzet } from "./kilitleme";
import { aspectDizilim } from "./aspectDizilim";
import { dogrulamaCalistir } from "./dogrulama";
import { paretoAnaliz } from "./pareto";
import type { maksimumTren } from "./kapasite";
import type { blockingTimeRing } from "./blockingtime";
import { MOTOR_ADI, MOTOR_SURUMU, YONTEM_STANDARTLARI } from "./surum";

type MaksTip = ReturnType<typeof maksimumTren>;
type BtTip = ReturnType<typeof blockingTimeRing>;

/** 3.2 Kilitleme (Interlocking) Kontrol Tablosu — makaslardan türetilir. */
export function bolumKilitleme(rings: DurakArasiRing[], en: boolean): string {
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
}

/** 3.3 Aspect Dizilimi (Signal Aspect Sequence). */
export function bolumAspect(rings: DurakArasiRing[], cfg: SimConfig, en: boolean): string {
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
}

/** 09 Doğrulama & Geçerleme (V&V). */
export function bolumDogrulama(rings: DurakArasiRing[], stock: RollingStock, cfg: SimConfig, isletme: Isletme, en: boolean): string {
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
}

/** 10 İzlenebilirlik & Tekrar-Üretilebilirlik. */
export function bolumIzlenebilirlik(p: {
  en: boolean; meta: ProjeMeta; rings: DurakArasiRing[]; line: Line | null; stock: RollingStock;
  isletme: Isletme; cfg: SimConfig; filoGercek: number; maks: MaksTip; bfHeadway: number; bt: BtTip;
  uicDoluluk: number; siganTren: number;
}): string {
  const { en, meta, rings, line, stock, isletme, cfg, filoGercek, maks, bfHeadway, bt, uicDoluluk, siganTren } = p;
  const num = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const giris = en
    ? "The engine is deterministic: the same input set and the same engine version reproduce the same numbers. This section is the report's audit trail — for each principal figure it records the inputs it derives from, the method used and the section where it is developed — together with the input digest and engine version below. Any number can therefore be independently reproduced and checked."
    : "Motor deterministiktir: aynı girdi kümesi ve aynı motor sürümü aynı sayıları yeniden üretir. Bu bölüm raporun denetim izidir — her ana sayının hangi girdilerden türediğini, hangi yöntemle ve hangi bölümde geliştirildiğini kaydeder — aşağıdaki girdi künyesi ve motor sürümüyle birlikte. Böylece herhangi bir sayı bağımsızca yeniden üretilip denetlenebilir.";

  const kunyeStr = `<div class="gs" style="font-size:10pt"><b>${esc(en ? MOTOR_ADI.en : MOTOR_ADI.tr)}</b> · ${en ? "engine version" : "motor sürümü"} <b>v${MOTOR_SURUMU}</b> · ${en ? "report date" : "rapor tarihi"} ${esc(meta.tarih || "—")}. ${en ? "Method basis" : "Yöntem temeli"}: ${YONTEM_STANDARTLARI.map((y) => `${esc(y.ad)}`).join(" · ")}.</div>`;

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
}

/** 11 Çok-Amaçlı Optimizasyon (Pareto). */
export function bolumPareto(maks: MaksTip, isletme: Isletme, en: boolean): string {
  if (!maks.gecerli) return "";
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
}
