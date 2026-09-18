// raysim — railML İÇE AKTARMA çekirdeği (saf TS; bağımlılıksız, node-test edilebilir).
// railML endüstri-standart demiryolu XML'idir (OpenTrack/RailSys köprüsü). V1 hedefi:
// altyapıdaki KONUMLU işletim noktalarından (ocp — operation control point) sıralı bir
// hat çıkarmak. İki yaygın konumlama desteklenir:
//   (a) crossSection/element ile: `<... ocpRef="ocp1" pos="1234"/>`  (kilometraj, m)
//   (b) ocp'nin kendi pos/absPos'u: `<ocp id="ocp1" name="A" pos="0"/>`
// Konumlar (pos, m) sıralanıp durak-arası mesafeler (pos farkı) ile ring zinciri kurulur.
// Makas/sinyal detayı V1'de aktarılmaz (Ringler'de eklenir).

import { yeniRing, ringDuraklari, ringSenaryo, MAKAS_TIP_AD, BELGE, type DurakArasiRing } from "./ring";
import type { RollingStock } from "./types";
import type { SimConfig } from "./config";
import { etkinArac } from "./config";

/** Saniye → "HH:MM:SS" (railML/GTFS uyumlu; 24h aşımını korur, ör. 25:10:00). */
function sn2hms(sn: number): string {
  const s = Math.max(0, Math.round(sn));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

// —— Minimal XML: başlangıç etiketlerini + niteliklerini tarar (yapı ağacı gerekmez;
// yalnız nitelik çıkarımı yapılır → railML 2.x sürüm farklarına dayanıklı). ——
function nitelikler(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = m[2];
  return out;
}
function* etiketler(xml: string): Generator<{ ad: string; nit: Record<string, string> }> {
  const re = /<([a-zA-Z_][\w.:-]*)\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] === "?xml" || m[1].startsWith("!")) continue;
    yield { ad: m[1].includes(":") ? m[1].split(":").pop()! : m[1], nit: nitelikler(m[2]) };
  }
}

const sayi = (v: string | undefined): number => { const x = parseFloat(v ?? ""); return Number.isFinite(x) ? x : NaN; };

export interface RailmlHatSonuc { rings: DurakArasiRing[]; ad: string; durakSayisi: number; toplamKm: number; uyarilar: string[]; }

/** railML metnini RaySim ring zincirine çevirir (konumlu ocp'lerden). */
export function railmlHatKur(xml: string): RailmlHatSonuc {
  if (!/railml/i.test(xml.slice(0, 2000)) && !/<ocp\b/i.test(xml)) {
    throw new Error("Bu dosya railML görünmüyor (railml/ocp bulunamadı).");
  }
  const ocpAd = new Map<string, string>();
  const konum = new Map<string, number>(); // ocpId → pos (m); ilk görülen kazanır

  for (const t of etiketler(xml)) {
    if (t.ad === "ocp" && t.nit.id) {
      if (!ocpAd.has(t.nit.id)) ocpAd.set(t.nit.id, t.nit.name || t.nit.code || t.nit.id);
      const p = sayi(t.nit.pos ?? t.nit.absPos);
      if (Number.isFinite(p) && !konum.has(t.nit.id)) konum.set(t.nit.id, p);
    }
    // crossSection / herhangi bir eleman: ocpRef + pos → konum
    const ref = t.nit.ocpRef || t.nit.ocpTrackRef;
    if (ref) {
      const p = sayi(t.nit.pos ?? t.nit.absPos);
      if (Number.isFinite(p) && !konum.has(ref)) konum.set(ref, p);
    }
  }

  const sirali = [...konum.entries()]
    .map(([id, pos]) => ({ id, pos, ad: ocpAd.get(id) || id }))
    .sort((a, b) => a.pos - b.pos);

  if (sirali.length < 2) {
    throw new Error("railML'de konumlu istasyon (ocp) bulunamadı — desteklenen: ocp veya crossSection üzerinde pos/absPos (railML 2.x altyapı).");
  }

  const uyarilar: string[] = [];
  const rings: DurakArasiRing[] = [];
  let toplam = 0, varsayilanKullanildi = 0;
  for (let i = 0; i < sirali.length - 1; i++) {
    let mesafe = Math.abs(sirali[i + 1].pos - sirali[i].pos);
    if (!Number.isFinite(mesafe) || mesafe < 20) { mesafe = 600; varsayilanKullanildi++; }
    const uz = Math.round(mesafe);
    toplam += uz;
    const r = yeniRing(sirali[i].ad, sirali[i + 1].ad);
    r.uzunluk = uz;
    r.worstUzunluk = Math.max(uz, Math.round(uz * 1.15));
    r.bestUzunluk = Math.max(50, Math.round(uz * 0.7));
    rings.push(r);
  }
  const ad = /<line\b[^>]*\bname="([^"]+)"/i.exec(xml)?.[1] || "railML hattı";
  uyarilar.push("Mesafeler railML kilometrajından (pos) hesaplandı.");
  if (varsayilanKullanildi > 0) uyarilar.push(`${varsayilanKullanildi} durak arası konum farkı çıkarılamadı → varsayılan 600 m kullanıldı.`);
  uyarilar.push("Makas, sinyal ve duruş süresi V1'de aktarılmaz; Ringler'de ekleyin.");
  return { rings, ad, durakSayisi: sirali.length, toplamKm: toplam / 1000, uyarilar };
}

// ————————————————————————————————————————————————————————————————
// railML DIŞA AKTARMA (export) — V2. RaySim ring zinciri → railML 2.x altyapı XML'i.
// Kapsam: operationControlPoint (istasyon) + track + crossSection (kilometraj) +
// gradientChange (eğim ‰) + switch (makas: tip/geçiş hızı) + signal (sinyal: yön).
// crossSection'lar kendi içe-aktarıcımızla ROUND-TRIP uyumludur (pos/ocpRef).
// (İçe aktarma V1 hâlâ yalnız istasyon konumlarını okur; makas/sinyal/eğim export'a özgü.)
// ————————————————————————————————————————————————————————————————

function xmlKac(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Ring zincirini railML 2.2 XML string'ine çevirir (dışa aktarma).
 * V2: altyapı (ocp · track · switch · signal · gradient).
 * V3 (opts.stock verilirse): ek olarak <rollingstock> (araç + formation) ve
 *     <timetable> (çift yön, hesaplanan çizelge; opts.headwaySn > 0 ise servis
 *     penceresi boyunca headway aralığıyla çoğaltılır) → OpenTrack/RailSys tam köprü.
 */
export function railmlIhrac(
  rings: DurakArasiRing[],
  hatAdi = "RaySim hattı",
  opts?: {
    stock?: RollingStock;
    cfg?: SimConfig;
    headwaySn?: number;
    servisBasSn?: number;
    servisBitSn?: number;
  },
): string {
  const duraklar = ringDuraklari(rings); // {ad, konum}[] — kümülatif kilometraj (m)
  const toplam = duraklar.length ? Math.round(duraklar[duraklar.length - 1].konum) : 0;
  const id = (i: number) => `ocp_${i}`;
  const ocpXml = duraklar
    .map((d, i) => `      <ocp id="${id(i)}" name="${xmlKac(d.ad)}" code="${id(i)}"/>`)
    .join("\n");
  const csXml = duraklar
    .map((d, i) => `          <crossSection id="cs_${i}" pos="${Math.round(d.konum)}" ocpRef="${id(i)}"/>`)
    .join("\n");

  // Kümülatif geçişte makas / sinyal / eğim topla (ring başı offset + eleman konumu).
  const gradlar: string[] = [];
  const makaslar: string[] = [];
  const sinyaller: string[] = [];
  let off = 0;
  let oncekiEgim: number | null = null;
  rings.forEach((r) => {
    if (oncekiEgim === null || Math.abs(r.egim - oncekiEgim) > 1e-9) {
      gradlar.push(`          <gradientChange id="g_${gradlar.length}" pos="${Math.round(off)}" slope="${r.egim.toFixed(1)}"/>`);
      oncekiEgim = r.egim;
    }
    for (const m of r.makaslar) {
      const pos = Math.round(off + Math.max(0, Math.min(r.uzunluk, m.konum)));
      makaslar.push(`          <switch id="sw_${makaslar.length}" name="${xmlKac(m.ad || MAKAS_TIP_AD[m.tip])}" pos="${pos}" description="${xmlKac(MAKAS_TIP_AD[m.tip])}; ${Math.round(m.gecisHizi * 3.6)} km/h"/>`);
    }
    for (const s of r.sinyaller ?? []) {
      const pos = Math.round(off + Math.max(0, Math.min(r.uzunluk, s.konum)));
      sinyaller.push(`          <signal id="sig_${sinyaller.length}" name="${xmlKac(s.ad || (s.yon === "giden" ? "Giden sinyal" : "Gelen sinyal"))}" pos="${pos}" dir="${s.yon === "giden" ? "up" : "down"}"${s.tersIsletme ? ` description="ters işletme"` : ""}/>`);
    }
    off += r.uzunluk;
  });
  const gradXml = gradlar.length ? `          <gradientChanges>\n${gradlar.join("\n")}\n          </gradientChanges>\n` : "";
  const ocsXml = (makaslar.length || sinyaller.length)
    ? `        <ocsElements>\n${makaslar.length ? `          <switches>\n${makaslar.join("\n")}\n          </switches>\n` : ""}${sinyaller.length ? `          <signals>\n${sinyaller.join("\n")}\n          </signals>\n` : ""}        </ocsElements>\n`
    : "";

  // ——— ROLLINGSTOCK + TIMETABLE (opts.stock verilirse) ———
  const stock = opts?.stock;
  const cfg = opts?.cfg ?? BELGE;
  let rollingXml = "";
  let ttXml = "";
  if (stock && duraklar.length >= 2) {
    // Araç: standart nitelikler (id/name/length/speed); tam fizik kayıpsız yorum bloğunda.
    // Çizelge EFEKTİF dinamikle (config ivme/servis freni tavanları) hesaplandığından,
    // araç açıklamasında da efektif değerler yazılır → export kendi içinde tutarlı.
    const arac = etkinArac(stock, cfg);
    const ivmeTavanNot = arac.aCap != null && arac.aCap > 0 ? ` · kalkış ivme tavanı=${arac.aCap} m/s²` : "";
    const hizKmh = Math.round(stock.maxSpeed * 3.6);
    const boy = stock.length.toFixed(2);
    rollingXml = `  <rollingstock>
    <!-- RaySim araç fiziği (kayıpsız): kütle=${Math.round(stock.mass)} kg · dönen kütle ρ=${stock.rotatingMassFactor} · güç=${Math.round(stock.power)} W · kalkış çeki=${Math.round(stock.startingTractiveEffort)} N · servis freni=${arac.maxBraking} m/s²${ivmeTavanNot} · Davis A=${stock.davisA} B=${stock.davisB} C=${stock.davisC} -->
    <vehicles>
      <vehicle id="veh_1" name="${xmlKac(stock.name)}" length="${boy}" speed="${hizKmh}" code="${xmlKac(stock.id)}"/>
    </vehicles>
    <formations>
      <formation id="fo_1" name="${xmlKac(stock.name)}">
        <trainOrder>
          <vehicleRef vehicleRef="veh_1" orderNumber="1"/>
        </trainOrder>
      </formation>
    </formations>
  </rollingstock>
`;

    // İleri yön çizelgesi (trip başına göreli s): durak varış/kalkış.
    // Seyir = ringSenaryo(...).nominalSeyir; dwell = varış durağının (to) ring.dwell'i.
    const ileriZaman: { arr: number; dep: number }[] = [];
    {
      let t = 0;
      for (let i = 0; i < duraklar.length; i++) {
        const dwell = i === 0 ? 0 : Math.max(0, rings[i - 1]?.dwell ?? 0);
        const arr = t;
        const dep = arr + dwell;
        ileriZaman.push({ arr, dep });
        if (i < rings.length) t = dep + ringSenaryo(rings[i], stock, cfg).nominalSeyir;
      }
    }
    const cevrim = ileriZaman[ileriZaman.length - 1]?.arr ?? 0; // tek yön süre (s)
    // Dönüş yönü = ileri seyir deltalarının aynası; dwell'ler eşlenir, uçlar 0.
    const donusZaman: { arr: number; dep: number }[] = [];
    {
      const n = duraklar.length;
      let t = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          const j = n - 1 - i; // ileri segment j (durak j→j+1) = dönüş (j+1)→j seyir
          t += (ileriZaman[j + 1].arr - ileriZaman[j].dep);
        }
        const src = n - 1 - i;
        const dwell = (i === 0 || i === n - 1) ? 0 : Math.max(0, ileriZaman[src].dep - ileriZaman[src].arr);
        donusZaman.push({ arr: t, dep: t + dwell });
        t += dwell;
      }
    }

    const bas = opts?.servisBasSn ?? 6 * 3600;
    const bit = Math.max(bas + 60, opts?.servisBitSn ?? 24 * 3600);
    const hw = Math.max(0, Math.round(opts?.headwaySn ?? 0));
    // Sefer başlangıç zamanları: headway varsa pencere boyunca; yoksa tek temsil sefer.
    const kalkislar: number[] = [];
    if (hw > 0) { for (let d = bas; d <= bit; d += hw) kalkislar.push(d); }
    else kalkislar.push(bas);
    const MAKS = 400; // dosya şişmesin: yön başına üst sınır
    const kalk = kalkislar.slice(0, MAKS);

    const ocpTT = (dizi: { arr: number; dep: number }[], t0: number, ters: boolean) =>
      dizi.map((z, i) => {
        const ocpIdx = ters ? (duraklar.length - 1 - i) : i;
        return `        <ocpTT ocpRef="${id(ocpIdx)}" ocpType="stop" sequence="${i + 1}"><times scope="scheduled" arrival="${sn2hms(t0 + z.arr)}" departure="${sn2hms(t0 + z.dep)}"/></ocpTT>`;
      }).join("\n");

    const parts: string[] = [];
    const trains: string[] = [];
    let tno = 1000;
    kalk.forEach((t0, k) => {
      // Gidiş (up)
      parts.push(`      <trainPart id="tp_up_${k}" line="${xmlKac(hatAdi)}">
        <formationTT formationRef="fo_1"/>
        <ocpsTT>
${ocpTT(ileriZaman, t0, false)}
        </ocpsTT>
      </trainPart>`);
      trains.push(`      <train id="tr_up_${k}" type="operational" trainNumber="${++tno}"><trainPartSequence sequence="1"><trainPartRef ref="tp_up_${k}" position="1"/></trainPartSequence></train>`);
      // Dönüş (down) — çevrim + dönüş bekleme kadar sonra kalkar (turnaround ihmal: çevrim)
      const t0d = t0 + cevrim;
      parts.push(`      <trainPart id="tp_dn_${k}" line="${xmlKac(hatAdi)}">
        <formationTT formationRef="fo_1"/>
        <ocpsTT>
${ocpTT(donusZaman, t0d, true)}
        </ocpsTT>
      </trainPart>`);
      trains.push(`      <train id="tr_dn_${k}" type="operational" trainNumber="${++tno}"><trainPartSequence sequence="1"><trainPartRef ref="tp_dn_${k}" position="1"/></trainPartSequence></train>`);
    });

    ttXml = `  <timetable id="tt_raysim">
    <trainParts>
${parts.join("\n")}
    </trainParts>
    <trains>
${trains.join("\n")}
    </trains>
  </timetable>
`;
  }

  const tarih = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<railml xmlns="https://www.railml.org/schemas/2013" version="2.2">
  <metadata>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${xmlKac(hatAdi)}</dc:title>
    <dc:source xmlns:dc="http://purl.org/dc/elements/1.1/">RaySim</dc:source>
    <dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">${tarih}</dc:date>
  </metadata>
  <infrastructure id="is_raysim" name="${xmlKac(hatAdi)}">
    <operationControlPoints>
${ocpXml}
    </operationControlPoints>
    <tracks>
      <track id="trk_1" name="${xmlKac(hatAdi)}">
        <trackTopology>
          <trackBegin id="tb_1" pos="0"><openEnd id="oe_1"/></trackBegin>
          <trackEnd id="te_1" pos="${toplam}"><openEnd id="oe_2"/></trackEnd>
        </trackTopology>
        <trackElements>
${gradXml}          <crossSections>
${csXml}
          </crossSections>
        </trackElements>
${ocsXml}      </track>
    </tracks>
  </infrastructure>
${rollingXml}${ttXml}</railml>
`;
}
