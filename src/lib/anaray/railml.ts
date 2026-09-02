// raysim — railML İÇE AKTARMA çekirdeği (saf TS; bağımlılıksız, node-test edilebilir).
// railML endüstri-standart demiryolu XML'idir (OpenTrack/RailSys köprüsü). V1 hedefi:
// altyapıdaki KONUMLU işletim noktalarından (ocp — operation control point) sıralı bir
// hat çıkarmak. İki yaygın konumlama desteklenir:
//   (a) crossSection/element ile: `<... ocpRef="ocp1" pos="1234"/>`  (kilometraj, m)
//   (b) ocp'nin kendi pos/absPos'u: `<ocp id="ocp1" name="A" pos="0"/>`
// Konumlar (pos, m) sıralanıp durak-arası mesafeler (pos farkı) ile ring zinciri kurulur.
// Makas/sinyal detayı V1'de aktarılmaz (Ringler'de eklenir).

import { yeniRing, ringDuraklari, type DurakArasiRing } from "./ring";

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
// railML DIŞA AKTARMA (export). RaySim ring zinciri → railML 2.x altyapı XML'i.
// V1 kapsam: operationControlPoint (istasyon) + track + crossSection (kilometrajlı
// konumlar). Kendi içe-aktarıcımızla ROUND-TRIP uyumlu (crossSection pos/ocpRef).
// Makas/sinyal/eğim, içe aktarmada olduğu gibi V1'de aktarılmaz (bilgi notu eklenir).
// ————————————————————————————————————————————————————————————————

function xmlKac(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Ring zincirini railML 2.x altyapı XML string'ine çevirir (dışa aktarma). */
export function railmlIhrac(rings: DurakArasiRing[], hatAdi = "RaySim hattı"): string {
  const duraklar = ringDuraklari(rings); // {ad, konum}[] — kümülatif kilometraj (m)
  const toplam = duraklar.length ? Math.round(duraklar[duraklar.length - 1].konum) : 0;
  const id = (i: number) => `ocp_${i}`;
  const ocpXml = duraklar
    .map((d, i) => `      <ocp id="${id(i)}" name="${xmlKac(d.ad)}" code="${id(i)}"/>`)
    .join("\n");
  const csXml = duraklar
    .map((d, i) => `          <crossSection id="cs_${i}" pos="${Math.round(d.konum)}" ocpRef="${id(i)}"/>`)
    .join("\n");
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
          <crossSections>
${csXml}
          </crossSections>
        </trackElements>
      </track>
    </tracks>
  </infrastructure>
</railml>
`;
}
