"use client";

// raysim — AĞ & KAVŞAK paneli (dallanma sonraki seviye, Sefer ⑤ sekmesi).
// Dallı ağda ortak kesimi (hat başı → kavşak) ANA HAT + ŞUBE servisleri BİRLİKTE taşır.
// Bu panel iki şeyi tek yerde, kendi sekmesinde, en anlaşılır biçimde toplar:
//   1) Ortak Kesim Yükü — ORTALAMA birleşik frekans kesimin fiziksel sınırına sığıyor mu
//      (ortakKesim.ts, steady-state).
//   2) Kavşak Zaman-Çakışması — periyotlar vurunca belirli ana-hat/şube trenlerinin
//      kavşakta min headway'den yakın geçmesi (kavsakCakisma.ts, zaman-domeni) + çözüm
//      ötelemesi + "kavşak zaman şeridi" (occupation) görseli.
// Yalnız bir şubeye servisTren>0 girilince anlamlıdır (opt-in; tahmin yok).

import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { Panel } from "@/components/RingUI";
import { useDil } from "@/components/DilProvider";
import { type KavsakCakismaSonuc, type KavsakAnaliz } from "@/lib/anaray/kavsakCakisma";
import type { OrtakKesimSonuc } from "@/lib/anaray/ortakKesim";
import type { Sube } from "@/lib/anaray/ring";

const sn = (s: number) => `${Math.round(s)} s`;

export function AgKavsakPanel({ subeler, ortak, kavsak }: {
  subeler: Sube[];
  ortak: OrtakKesimSonuc;           // Studio'da zaten hesaplı (tek kaynak)
  kavsak: KavsakCakismaSonuc;       // Studio'da zaten hesaplı (sekme noktası için de)
}) {
  const { t } = useDil();
  const servisTrenVar = subeler.some((s) => (s.servisTren ?? 0) > 0);

  return (
    <div>
      <p className="mb-4 max-w-2xl text-xs" style={{ color: brand.muted }}>
        {t({
          tr: "Dallı ağda hat başı ile bir kavşak arasındaki ORTAK ana hat kesimi, ana hat ve o koldan ayrılan şube servislerini BİRLİKTE taşır. Burada iki soruyu yanıtlarız: (1) ortalama birleşik yük kesime sığıyor mu, (2) belirli trenler kavşakta zaman-domeninde çakışıyor mu — ve çakışmayı gideren kalkış ötelemesi.",
          en: "In a branched network the SHARED main-line section between the line start and a junction carries the main line and the branch service together. We answer two questions: (1) does the average combined load fit the section, (2) do specific trains conflict at the junction in the time domain — and the departure offset that resolves it.",
          de: "In einem verzweigten Netz trägt der GEMEINSAME Hauptgleisabschnitt zwischen Linienanfang und einer Verzweigung die Hauptlinie und den Zweigverkehr zusammen. Zwei Fragen: (1) passt die mittlere kombinierte Last in den Abschnitt, (2) kollidieren bestimmte Züge an der Verzweigung im Zeitbereich — und der Abfahrtsversatz, der dies löst.",
        })}
      </p>

      {!servisTrenVar && (
        <div className="mb-5 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: brand.border, background: CK.goodBgSoft, color: brand.inkSoft }}>
          {t({
            tr: "Bu analiz opt-in'dir (tahmin yok): bir şubeye «servis treni» (o kola kaç tren gider) girince hesaplanır. Şube düzenleyicisinde (Ringler → Şube) servis treni gir.",
            en: "This analysis is opt-in (no estimation): it computes once you enter a branch's «service trains» (how many trains run to that spur). Enter it in the branch editor (Rings → Branch).",
            de: "Diese Analyse ist opt-in (keine Schätzung): Sie wird berechnet, sobald Sie die «Betriebszüge» eines Zweigs eingeben. Geben Sie dies im Zweig-Editor ein (Ringe → Zweig).",
          })}
        </div>
      )}

      {/* ① ORTAK KESİM YÜKÜ (ortalama kapasite) */}
      <Panel katlanir acik
        ozet={ortak.aktif ? (ortak.uygun
          ? t({ tr: "✓ ortalama yük uygun", en: "✓ average load OK", de: "✓ mittlere Last OK" })
          : t({ tr: "⚠ ortak kesim aşırı yüklü", en: "⚠ shared section overloaded", de: "⚠ Abschnitt überlastet" })) : t({ tr: "servis treni gerekli", en: "service trains needed", de: "Betriebszüge nötig" })}
        baslik={t({ tr: "Ortak Kesim Yükü (ortalama)", en: "Shared-Section Load (average)", de: "Last des gemeinsamen Abschnitts (Mittel)" })}
        aciklama={t({
          tr: "Her servis N tren / T çevrim → frekans 3600·N/T. Ortak kesimin birleşik frekansı (ana + o kesimi kullanan şubeler) → birleşik headway. Bu, kesimin fiziksel min headway'ine (blocking-time) sığmalı. Ortalama/kararlı-durum kontrolü.",
          en: "Each service N trains / T cycle → frequency 3600·N/T. The shared section's combined frequency (main + branches using it) → combined headway. This must fit the section's physical min headway (blocking-time). Average/steady-state check.",
          de: "Jeder Verkehr N Züge / T Umlauf → Frequenz 3600·N/T. Die kombinierte Frequenz des gemeinsamen Abschnitts (Haupt + nutzende Zweige) → kombinierte Zugfolgezeit. Muss in die physikalische Mindest-Zugfolgezeit (Blockzeit) passen. Mittel-/Beharrungsprüfung.",
        })}>
        {!ortak.aktif ? (
          <div className="text-sm" style={{ color: brand.muted }}>{ortak.ozet}</div>
        ) : ortak.kesimler.length === 0 ? (
          <div className="text-sm" style={{ color: brand.muted }}>{ortak.ozet}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left" style={{ color: brand.muted, borderBottom: `1px solid ${brand.border}` }}>
                  <th className="px-3 py-2 font-medium">{t({ tr: "Kavşak", en: "Junction", de: "Verzweigung" })}</th>
                  <th className="px-3 py-2 font-medium">{t({ tr: "Ortak kesim", en: "Shared section", de: "Gem. Abschnitt" })}</th>
                  <th className="px-3 py-2 text-right font-medium">{t({ tr: "Ana", en: "Main", de: "Haupt" })}</th>
                  <th className="px-3 py-2 text-right font-medium">{t({ tr: "Şube", en: "Branch", de: "Zweig" })}</th>
                  <th className="px-3 py-2 text-right font-medium">{t({ tr: "Birleşik", en: "Combined", de: "Kombiniert" })}</th>
                  <th className="px-3 py-2 text-right font-medium">{t({ tr: "Birleşik HW", en: "Combined HW", de: "Komb. ZF" })}</th>
                  <th className="px-3 py-2 text-right font-medium">{t({ tr: "Min HW", en: "Min HW", de: "Min-ZF" })}</th>
                  <th className="px-3 py-2 text-center font-medium">{t({ tr: "Durum", en: "Status", de: "Status" })}</th>
                </tr>
              </thead>
              <tbody>
                {ortak.kesimler.map((k, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: brand.border }}>
                    <td className="px-3 py-2 font-medium" style={{ color: brand.ink }}>{k.junctionAd}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: brand.inkSoft }}>{k.paylasilanKm.toFixed(1)} km · {k.subeAdlari.join(", ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: brand.inkSoft }}>{k.anaFreq}/s</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: brand.inkSoft }}>{k.subeFreq}/s</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: brand.ink }}>{k.birlesikFreq}/s</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: brand.inkSoft }}>{sn(k.birlesikHeadway)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: brand.inkSoft }}>{sn(k.minHeadway)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase"
                        style={k.uygun ? { background: CK.goodBgSoft, color: "#0E7C57" } : { background: "rgba(199,16,46,0.12)", color: CK.red }}>
                        {k.uygun ? t({ tr: "Uygun", en: "OK", de: "OK" }) : t({ tr: "Aşırı", en: "Over", de: "Über" })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-xs" style={{ color: brand.muted }}>{ortak.ozet}</div>
          </div>
        )}
      </Panel>

      {/* ② KAVŞAK ZAMAN-ÇAKIŞMASI (zaman-domeni + çözüm ötelemesi) */}
      <Panel katlanir acik
        ozet={kavsak.aktif ? (kavsak.cakismaVar
          ? t({ tr: "⚠ kavşak çakışması", en: "⚠ junction conflict", de: "⚠ Verzweigungskonflikt" })
          : t({ tr: "✓ ötelemeyle çakışmasız", en: "✓ conflict-free with offset", de: "✓ konfliktfrei mit Versatz" })) : t({ tr: "servis treni gerekli", en: "service trains needed", de: "Betriebszüge nötig" })}
        baslik={t({ tr: "Kavşak Zaman-Çakışması (merge/diverge)", en: "Junction Time-Conflict (merge/diverge)", de: "Verzweigungs-Zeitkonflikt (merge/diverge)" })}
        aciklama={t({
          tr: "Ana hat ve şube trenleri aynı başlangıçtan kalkıp ortak kesimi paylaşır → kavşaktaki geçiş aralığı = kalkış aralığı. Periyotlar birbirine vurduğunda belirli trenler min headway'den yakın geçer (ortalama sığsa bile). Sistem, bir servisi diğerine göre öteleyerek en sıkı geçişi genişletir ve çözüm ötelemesini önerir (OpenTrack usulü).",
          en: "Main and branch trains depart from the same start and share the section → the junction passing interval = the departure interval. When the periods beat, specific trains pass within the min headway (even if the average fits). The system widens the tightest passing by offsetting one service and recommends the resolving offset (OpenTrack-style).",
          de: "Haupt- und Zweigzüge starten am selben Anfang und teilen den Abschnitt → das Durchfahrtsintervall an der Verzweigung = das Abfahrtsintervall. Wenn die Perioden schwingen, passieren bestimmte Züge innerhalb der Mindest-Zugfolgezeit (auch wenn das Mittel passt). Das System verbreitert die engste Durchfahrt durch Versatz eines Verkehrs und empfiehlt den lösenden Versatz (OpenTrack-Stil).",
        })}>
        {!kavsak.aktif ? (
          <div className="text-sm" style={{ color: brand.muted }}>{kavsak.ozet}</div>
        ) : kavsak.kavsaklar.length === 0 ? (
          <div className="text-sm" style={{ color: brand.muted }}>{kavsak.ozet}</div>
        ) : (
          <div className="flex flex-col gap-5">
            {kavsak.kavsaklar.map((k) => <KavsakKart key={k.junctionDurak} k={k} t={t} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Tek kavşak kartı: durum + servis çiftleri + zaman şeridi (occupation). */
function KavsakKart({ k, t }: { k: KavsakAnaliz; t: ReturnType<typeof useDil>["t"] }) {
  const durumRenk = k.cakismaVar ? CK.red : "#0E7C57";
  const durumMetin = k.cakismaVar
    ? (k.kapasiteAsimi ? t({ tr: "Aşırı yüklü", en: "Overloaded", de: "Überlastet" }) : t({ tr: "Vuru çakışması", en: "Beat conflict", de: "Schwebungskonflikt" }))
    : t({ tr: "Ötelemeyle çözülür", en: "Resolved by offset", de: "Durch Versatz gelöst" });

  return (
    <div className="rounded-lg border" style={{ borderColor: brand.border }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5" style={{ borderColor: brand.border, background: CK.track }}>
        <div>
          <span className="font-semibold" style={{ color: brand.ink }}>{k.junctionAd}</span>
          <span className="ml-2 text-xs tabular-nums" style={{ color: brand.muted }}>{t({ tr: "ortak kesim", en: "shared section", de: "gem. Abschnitt" })} {k.paylasilanKm.toFixed(1)} km · {t({ tr: "kavşak min", en: "junction min", de: "Verzw.-Min" })} {sn(k.minHeadway)}</span>
        </div>
        <span className="rounded px-2 py-0.5 text-[0.65rem] font-semibold uppercase" style={{ background: `${durumRenk}22`, color: durumRenk }}>{durumMetin}</span>
      </div>

      <div className="px-4 py-3">
        {/* Servis akışları */}
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: brand.inkSoft }}>
          {k.servisler.map((s, i) => (
            <span key={i}>
              <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.tur === "ana" ? CK.blue : CK.gold }} />
              {" "}<b style={{ color: brand.ink }}>{s.ad}</b>: {s.trenSayisi} {t({ tr: "tren", en: "trains", de: "Züge" })} · {t({ tr: "aralık", en: "headway", de: "Zugfolge" })} {sn(s.headway)}
            </span>
          ))}
        </div>

        {/* En sıkı çift + sayılar */}
        {k.baglayan && (
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini etiket={t({ tr: "En sıkı çift", en: "Tightest pair", de: "Engstes Paar" })} deger={`${k.baglayan.aAd} ↔ ${k.baglayan.bAd}`} />
            <Mini etiket={t({ tr: "Erişilebilir en iyi ayrım", en: "Best reachable gap", de: "Bester erreichb. Abstand" })} deger={sn(k.baglayan.enIyiAralik)} vurgu={k.cakismaVar ? CK.red : "#0E7C57"} />
            <Mini etiket={t({ tr: "Kavşak min headway", en: "Junction min headway", de: "Verzw. Min-ZF" })} deger={sn(k.minHeadway)} />
            <Mini etiket={t({ tr: "Önerilen öteleme", en: "Recommended offset", de: "Empf. Versatz" })} deger={k.cakismaVar ? "—" : sn(k.enIyiOfsetSn)} />
          </div>
        )}

        {/* Zaman şeridi (occupation) */}
        {k.baglayan && <ZamanSeridi k={k} t={t} />}

        {/* Öneri */}
        <div className="mt-3 rounded border-l-2 px-3 py-2 text-xs leading-relaxed" style={{ borderColor: durumRenk, background: `${durumRenk}0D`, color: brand.inkSoft }}>
          {k.oneri}
        </div>
      </div>
    </div>
  );
}

function Mini({ etiket, deger, vurgu }: { etiket: string; deger: string; vurgu?: string }) {
  return (
    <div>
      <div className="text-[0.62rem] uppercase tracking-wide" style={{ color: brand.muted }}>{etiket}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: vurgu ?? brand.ink }}>{deger}</div>
    </div>
  );
}

/**
 * Kavşak zaman şeridi (occupation Marey): yatay = zaman penceresi; her servisin kavşaktan
 * GEÇİŞ anları önerilen ötelemeyle çizilir, her geçiş min-headway genişliğinde bant tutar.
 * İki servisin bantları örtüşürse kırmızı → kavşak çakışması. Motorun hesabını birebir
 * görselleştirir (uydurma trajectory yok — gerçek geçiş zamanları + min headway).
 */
function ZamanSeridi({ k, t }: { k: KavsakAnaliz; t: ReturnType<typeof useDil>["t"] }) {
  const b = k.baglayan!;
  const ana = k.servisler.find((s) => s.ad === b.aAd)!;
  const sube = k.servisler.find((s) => s.ad === b.bAd)!;
  const hA = Math.max(1, ana.headway), hB = Math.max(1, sube.headway);
  const ofset = k.cakismaVar ? 0 : k.enIyiOfsetSn; // çözülebilirse önerilen öteleme ile göster
  const hJ = k.minHeadway;

  // Pencere: iki-üç şube periyodu görünecek kadar, okunur sınırlar içinde.
  const W = Math.min(Math.max(2 * Math.max(hA, hB), 600), 1800);
  const H = 66, padL = 8, padR = 8, padT = 16, padB = 18;
  const innerW = 760 - padL - padR;
  const x = (tt: number) => padL + (innerW * tt) / W;
  const yAna = padT + 8, ySube = padT + 30;

  type Gecis = { t: number };
  const anaGecis: Gecis[] = [];
  for (let tt = 0; tt < W; tt += hA) anaGecis.push({ t: tt });
  const subeGecis: Gecis[] = [];
  for (let tt = ofset % hB; tt < W; tt += hB) subeGecis.push({ t: tt });

  // Çakışma: bir ana geçiş ile bir şube geçişi |Δt| < hJ ise örtüşür.
  const cakismalar: { t: number }[] = [];
  for (const a of anaGecis) for (const s of subeGecis) {
    if (Math.abs(a.t - s.t) < hJ) cakismalar.push({ t: (a.t + s.t) / 2 });
  }

  const bant = (cx: number, cy: number, renk: string, key: string) => {
    const w = (innerW * hJ) / W; // min-headway genişliği
    return <rect key={key} x={cx - w / 2} y={cy - 6} width={w} height={12} rx={2} fill={renk} fillOpacity={0.22} stroke={renk} strokeOpacity={0.5} strokeWidth={0.6} />;
  };

  return (
    <div>
      <svg viewBox={`0 0 760 ${H}`} width="100%" style={{ display: "block" }} role="img"
        aria-label={t({ tr: "Kavşak zaman şeridi", en: "Junction time strip", de: "Verzweigungs-Zeitstreifen" })}>
        {/* ızgara: her hA ve hB'de ince çizgi */}
        <line x1={padL} y1={padT} x2={760 - padR} y2={padT} stroke={brand.border} strokeWidth={0.6} />
        <line x1={padL} y1={H - padB} x2={760 - padR} y2={H - padB} stroke={brand.border} strokeWidth={0.6} />
        {/* ana geçişler + bantlar */}
        {anaGecis.map((g, i) => (
          <g key={`a${i}`}>
            {bant(x(g.t), yAna, CK.blue, `ab${i}`)}
            <line x1={x(g.t)} y1={yAna - 7} x2={x(g.t)} y2={yAna + 7} stroke={CK.blue} strokeWidth={1.4} />
          </g>
        ))}
        {/* şube geçişler + bantlar */}
        {subeGecis.map((g, i) => (
          <g key={`s${i}`}>
            {bant(x(g.t), ySube, CK.gold, `sb${i}`)}
            <line x1={x(g.t)} y1={ySube - 7} x2={x(g.t)} y2={ySube + 7} stroke={CK.gold} strokeWidth={1.4} />
          </g>
        ))}
        {/* çakışma işaretleri */}
        {cakismalar.map((c, i) => (
          <line key={`c${i}`} x1={x(c.t)} y1={padT + 2} x2={x(c.t)} y2={H - padB - 2} stroke={CK.red} strokeWidth={1} strokeDasharray="2 2" />
        ))}
        {/* satır etiketleri */}
        <text x={padL} y={yAna - 9} fontSize={8} fill={CK.blue} fontWeight={600}>{b.aAd}</text>
        <text x={padL} y={ySube + 15} fontSize={8} fill={CK.gold} fontWeight={600}>{b.bAd}</text>
        <text x={760 - padR} y={H - 6} fontSize={8} fill={brand.muted} textAnchor="end">{t({ tr: "zaman", en: "time", de: "Zeit" })} → {Math.round(W)} s</text>
      </svg>
      <div className="mt-1 text-[0.68rem]" style={{ color: brand.muted }}>
        {cakismalar.length === 0
          ? t({ tr: `Önerilen ${sn(ofset)} öteleme ile pencere boyunca örtüşme yok — bantlar (min headway ${sn(hJ)}) ayrık.`, en: `With the recommended ${sn(ofset)} offset no overlap across the window — bands (min headway ${sn(hJ)}) are separated.`, de: `Mit dem empfohlenen Versatz ${sn(ofset)} keine Überlappung — Bänder (Min-ZF ${sn(hJ)}) getrennt.` })
          : t({ tr: `Kırmızı çizgiler: iki servisin kavşak bantları (min headway ${sn(hJ)}) örtüşüyor — çakışma. En iyi ötelemeyle bile kapanmıyor.`, en: `Red lines: the two services' junction bands (min headway ${sn(hJ)}) overlap — conflict. Not closed even at the best offset.`, de: `Rote Linien: die Verzweigungsbänder beider Verkehre (Min-ZF ${sn(hJ)}) überlappen — Konflikt. Auch beim besten Versatz nicht geschlossen.` })}
      </div>
    </div>
  );
}
