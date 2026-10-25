// raysim — PDF RAPOR BÖLÜM ÜRETİCİLERİ (rapor.ts'ten ayrıldı; bakım borcu).
// Her fonksiyon kendi-kendine yeter: yardımcıları (tbl/esc/kmFmt/RED) raporCizim'den,
// motorları kendi lib'lerinden import eder, yalnız VERİ parametresi alır. rapor.ts
// bunları `dahil("x") ? bolumX(...) : ""` ile çağırır. İçerik BİREBİR taşındı (byte-diff).

import type { RollingStock, Line } from "./types";
import type { DurakArasiRing } from "./ring";
import type { SimConfig, Isletme, ProjeMeta } from "./config";
import { tbl, esc, kmFmt, RED } from "./raporCizim";
import { kilitlemeTablosu, kilitlemeOzet, kilitlemeMetin, type CeviriFn } from "./kilitleme";
import { dogrulamaCalistir } from "./dogrulama";
import type { maksimumTren } from "./kapasite";
import type { blockingTimeRing } from "./blockingtime";
import { MOTOR_ADI, MOTOR_SURUMU, YONTEM_STANDARTLARI } from "./surum";

type MaksTip = ReturnType<typeof maksimumTren>;
type BtTip = ReturnType<typeof blockingTimeRing>;

/** 3.2 Kilitleme (Interlocking) Kontrol Tablosu — makaslardan türetilir. */
export function bolumKilitleme(rings: DurakArasiRing[], en: boolean, cfg?: SimConfig): string {
  const kt = kilitlemeTablosu(rings, cfg);
  if (!kt.length) return "";
  const ko = kilitlemeOzet(kt);
  // Rapor TR/EN — yapısal satırdan seçili dilin metni (kilitlemeMetin) türetilir.
  const t: CeviriFn = (m) => (en ? m.en : m.tr);
  const rows = kt.map((r) => {
    const x = kilitlemeMetin(r, t);
    return [
      `<b>${esc(r.makasAd)}</b> <span style="font-size:8pt;color:#6B7480">k${kmFmt(r.km)} · ${esc(x.tipAd)}${r.tcc ? " · TCC" : ""}</span>`,
      esc(x.rota),
      esc(x.konum),
      esc(x.cakisan),
      esc(x.koruma),
      `${r.tanzimSn ? `${r.tanzimSn}` : "—"} / ${r.serbestSn} / <b>${r.kilitSn}</b>`,
    ];
  });
  const giris = en
    ? `Interlocking control table derived from the line's switch zones: for each route, the required switch position (Normal/Reverse), the conflicting movements it locks, flank/overlap protection and setting/release times. ${ko.makas} switch zones · ${ko.rota} routes · ${ko.manevra} reverse moves · ${ko.tccli} require TCC · max locking ${ko.maxKilit} s.`
    : `Hattın makas bölgelerinden türetilen güzergâh–kilit tablosu: her rota için gereken makas konumu (Normal/Ters), kilitlenen çakışan hareketler, yan koruma / emniyet payı ve tanzim/serbest süreleri. ${ko.makas} makas bölgesi · ${ko.rota} rota · ${ko.manevra} manevra · ${ko.tccli} TCC · azami kilit ${ko.maxKilit} s.`;
  const not = en
    ? "Normal = switch straight (main-line move); Reverse = switch thrown (crossover/manoeuvre). TCC = traffic-control approval required at every pass (facing/siding/depot). Overlap = the protective distance beyond the switch a train would need to stop under service braking if it overran the danger point (limited by the next block boundary). Locking = setting (switch throw × count) + route release; consistent with the blocking-time setup/release components."
    : "Normal = makas düz (ana hat geçişi); Ters = makas dönük (crossover/manevra). TCC = her geçişte trafik kontrol onayı zorunlu (karşılaşmalı/barınma/depo). Emniyet payı = tehlike noktasını aşan trenin servis freniyle duracağı koruma mesafesi (sonraki blok sınırıyla sınırlı). Kilit = tanzim (makas hareketi × adet) + rota serbest bırakma; blocking-time tanzim/serbest bileşenleriyle tutarlıdır.";
  return `<h3 class="sub">${en ? "3.2 Interlocking Control Table" : "3.2 Kilitleme Kontrol Tablosu"}</h3>
  <div class="gs" style="font-size:10pt">${giris}</div>
  ${tbl([en ? "Switch / location" : "Makas / konum", en ? "Route" : "Rota", en ? "Switch" : "Konum", en ? "Locked (conflicting)" : "Kilitlenen (çakışan)", en ? "Flank / Overlap" : "Yan koruma / Emniyet payı", en ? "Set/Rel/Lock (s)" : "Tanzim/Serbest/Kilit (s)"], rows, { first: true })}
  <div class="gs" style="font-size:9pt">${not}</div>`;
}

/** 08 Doğrulama & Geçerleme (V&V). */
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
  return `<div class="banner breakbefore"><span class="no">08</span>${en ? "VERIFICATION & VALIDATION" : "DOĞRULAMA & GEÇERLEME"}</div>
  <p>${giris}</p>
  <div class="gs" style="font-size:10pt"><b style="color:${vv.gecen === vv.toplam ? YESIL : RED}">${vv.gecen}/${vv.toplam}</b> ${en ? "checks passed" : "kontrol geçti"} · ${en ? "maximum deviation" : "azami sapma"} %${vv.maxSapma.toFixed(2)}.</div>
  ${tbl([en ? "Check" : "Kontrol", en ? "Reference" : "Referans", en ? "Computed" : "Hesaplanan", en ? "Deviation" : "Sapma", en ? "Result" : "Sonuç"], vvRows, { first: true })}`;
}

/** 09 İzlenebilirlik & Tekrar-Üretilebilirlik. */
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
    [en ? "Balancing speed" : "Denge hızı", "—", en ? "Davis A/B/C, power" : "Davis A/B/C, güç", "P/v = R(v)", "08"],
  ];

  return `<div class="banner breakbefore"><span class="no">09</span>${en ? "TRACEABILITY & REPRODUCIBILITY" : "İZLENEBİLİRLİK & TEKRAR-ÜRETİLEBİLİRLİK"}</div>
  <p>${giris}</p>
  ${kunyeStr}
  <h3 class="sub">${en ? "Input Digest (reproducing inputs)" : "Girdi Künyesi (yeniden üretim girdileri)"}</h3>
  ${tbl([en ? "Parameter" : "Parametre", en ? "Value" : "Değer"], girdiRows, { first: true })}
  <h3 class="sub">${en ? "Number → Input · Method · Section" : "Sayı → Girdi · Yöntem · Bölüm"}</h3>
  ${tbl([en ? "Quantity" : "Büyüklük", en ? "Value" : "Değer", en ? "Inputs" : "Girdiler", en ? "Method" : "Yöntem", en ? "Section" : "Bölüm"], izRows, { first: true })}`;
}

