"use client";

// raysim — SİSTEM MERKEZİ.
// (1) Paylaşılan simülasyon parametreleri — buradan değiştir, tüm modüllere canlı
//     yansır (localStorage'da kalıcı). (2) Canlı sistem durumu — mevcut config +
//     örnek seed'le ring loop + anklaşman bölgeleri anlık çözülür. (3) Bilgi /
//     challenge referansı — sistemin karşıladığı gerçek-hayat durumları.

import { useMemo } from "react";
import { brand } from "@/lib/anaray/brand";
import { sure, kmh } from "@/lib/anaray/format";
import { useSimConfig, useProje } from "@/components/SimConfigProvider";
import { PARAM_META, paramGoster, paramSI, birim, type ParamMeta, type ParamModul } from "@/lib/anaray/config";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { loopDenge, olceklenme, ringSenaryo } from "@/lib/anaray/ring";
import { bolgeSeed, simuleEtAnklasman } from "@/lib/anaray/interlocking";
import { blockingTimeRing } from "@/lib/anaray/blockingtime";
import { BlockingStairChart } from "@/components/BlockingStairChart";
import { CK, RAMP_BLUE, SERI } from "@/lib/anaray/chartkit";

const OK = CK.good;
// Modül etiketleri = 3 kategorik seri (valide: mavi · turkuaz · turuncu).
const MODUL_RENK: Record<ParamModul, string> = { sefer: CK.blue, ringler: CK.aqua, anklasman: CK.orange };
// Blocking-time 6 bileşeni ZAMAN SIRALI → kategorik değil ordinal rampa (raporla aynı).
const BT_PARCA: [string, string][] = [
  ["Setup", RAMP_BLUE[0]], ["Görme", RAMP_BLUE[1]], ["Yaklaşma", RAMP_BLUE[2]],
  ["Seyir", RAMP_BLUE[3]], ["Temizleme", RAMP_BLUE[4]], ["Release", RAMP_BLUE[5]],
];

export function SistemMerkezi() {
  const { cfg, patch, sifirla } = useSimConfig();
  const { rings } = useProje();
  const stock = varsayilanArac;

  // Canlı durum — mevcut cfg + paylaşılan hat (ringler) ile çözülür
  const denge = useMemo(() => loopDenge(rings, stock, cfg), [rings, stock, cfg]);
  const olcek = useMemo(() => olceklenme(rings, stock, true, cfg), [rings, stock, cfg]);
  const zoneler = useMemo(() => bolgeSeed(), []);
  const zoneDurum = useMemo(
    () =>
      zoneler.map((z) => {
        const istek = Array.from({ length: 4 }, (_, i) => ({ t: i * 20, rotaId: z.rotalar[i % z.rotalar.length].id, trenId: `T${i + 1}` }));
        const r = simuleEtAnklasman(z, istek, { cfg });
        return { z, maxEs: r.maxEszamanli, throughput: r.throughput, ortBekleme: r.ortBekleme };
      }),
    [zoneler, cfg]
  );
  const ihlaller = useMemo(() => rings.filter((r) => !ringSenaryo(r, stock, cfg).headwayUygun), [rings, stock, cfg]);
  const bt = useMemo(() => blockingTimeRing(rings, stock, cfg), [rings, stock, cfg]);

  const gruplar = useMemo(() => {
    const g = new Map<string, ParamMeta[]>();
    for (const m of PARAM_META) g.set(m.grup, [...(g.get(m.grup) ?? []), m]);
    return [...g.entries()];
  }, []);

  const uyarilar: { tip: "err" | "warn"; metin: string }[] = [];
  if (ihlaller.length) uyarilar.push({ tip: "err", metin: `${ihlaller.length} ring ${cfg.headway} s headway'i aşıyor: ${ihlaller.map((r) => r.ad).join(", ")}` });
  if (!denge.dengeli) uyarilar.push({ tip: "warn", metin: `Durak-çiftleri dengesiz (%${denge.sapmaYuzde.toFixed(0)} sapma) — darboğaz: ${denge.enYavas?.ad}` });
  const bekleyenZone = zoneDurum.filter((z) => z.ortBekleme > 5);
  if (bekleyenZone.length) uyarilar.push({ tip: "warn", metin: `${bekleyenZone.length} makas bölgesinde çakışma kuyruğu birikiyor` });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Sistem Merkezi — Canlı Simülasyon Parametreleri & Durum</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>RaySim Parametre & Bilgi Merkezi</h1>
        </div>
        <button onClick={sifirla} className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
          ↺ Belge varsayılanlarına dön
        </button>
      </div>

      {/* Canlı sistem durumu — hero */}
      <Panel baslik="Canlı Sistem Durumu" aciklama="Aşağıdaki parametrelerle örnek hat (ring loop + makas bölgeleri) anlık çözülür. Parametreyi değiştir → tüm sistem canlı güncellenir.">
        {uyarilar.length > 0 ? (
          <div className="mb-4 flex flex-col gap-1.5">
            {uyarilar.map((u, i) => (
              <div key={i} className="rounded border px-3 py-2 text-sm" style={{ borderColor: u.tip === "err" ? CK.red : CK.amber, background: u.tip === "err" ? CK.badBgSoft : CK.amberBg, color: u.tip === "err" ? CK.red : CK.amberInk }}>
                {u.tip === "err" ? "⚠ " : "▲ "}{u.metin}
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded border px-3 py-2 text-sm" style={{ borderColor: OK, background: CK.goodBgSoft, color: OK }}>✓ Tüm ringler headway&apos;e sığıyor, denge korunuyor, bölgelerde kuyruk yok.</div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat etiket="Loop tur süresi" deger={sure(olcek.turSuresi)} alt="worst-case, kapalı hat" />
          <MiniStat etiket="Darboğaz ring" deger={olcek.darbogazRing ? sure(olcek.darbogazRing.worstToplam) : "—"} alt={olcek.darbogazRing?.ad} vurgu={brand.red} />
          <MiniStat etiket={`${cfg.headway} s'de tren`} deger={`${olcek.maxTrenHedefHeadway}`} alt={olcek.headwayUygun ? "uygun ✓" : "ihlal ⚠"} vurgu={olcek.headwayUygun ? OK : brand.red} />
          <MiniStat etiket="Denge" deger={denge.dengeli ? "Dengeli" : `%${denge.sapmaYuzde.toFixed(0)} sapma`} vurgu={denge.dengeli ? OK : brand.red} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
                <th className="py-2 font-medium">Makas bölgesi</th>
                <th className="py-2 font-medium">Maks. eşzamanlı</th>
                <th className="py-2 font-medium">Throughput</th>
                <th className="py-2 font-medium">Ort. bekleme</th>
              </tr>
            </thead>
            <tbody>
              {zoneDurum.map(({ z, maxEs, throughput, ortBekleme }) => (
                <tr key={z.id} className="border-b" style={{ borderColor: brand.border }}>
                  <td className="py-2" style={{ color: brand.ink }}>{z.ad}</td>
                  <td className="py-2 font-mono" style={{ color: maxEs > 1 ? OK : brand.inkSoft }}>{maxEs} {maxEs > 1 ? "(paralel)" : "(tek tren)"}</td>
                  <td className="py-2 font-mono" style={{ color: brand.inkSoft }}>{throughput.toFixed(0)}/sa</td>
                  <td className="py-2 font-mono" style={{ color: ortBekleme > 5 ? brand.red : brand.inkSoft }}>{sure(ortBekleme)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Blocking-Time (Sperrzeitentreppe) + UIC 406 */}
      <Panel baslik="Blocking-Time (Sperrzeitentreppe) & UIC 406 Kapasite" aciklama="Her sinyal bloğunun rezerve süresi = 6 bileşen (rota kurma + görme + yaklaşma + seyir + temizleme + release). En yüksek blocking-time'lı blok min headway'i belirler; UIC 406 doluluk = min headway / hedef headway.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat etiket="Min headway (kritik blok)" deger={sure(bt.minHeadway)} alt={`blok #${bt.kritikBlok}${bt.bloklar[bt.kritikBlok]?.makasBlok ? " (makas)" : ""}`} vurgu={brand.red} />
          <MiniStat etiket="Teorik kapasite" deger={`${bt.teorikKapasite.toFixed(0)}/sa`} alt="tren/saat üst sınır" />
          <MiniStat etiket="UIC 406 doluluk" deger={`%${bt.dolulukHedef.toFixed(0)}`} alt={`hedef ${bt.hedefHeadway} s`} vurgu={bt.dolulukHedef > 80 ? CK.red : bt.dolulukHedef > 60 ? CK.amber : OK} />
          <MiniStat etiket="Hedef headway" deger={bt.hedefUygun ? "UYGUN" : "İHLAL"} vurgu={bt.hedefUygun ? OK : brand.red} />
        </div>

        {/* Sperrzeitentreppe — GERÇEK zaman-mesafe merdiveni (kanonik) */}
        <div className="mt-4">
          <div className="field-label mb-2">Sperrzeitentreppe — zaman-mesafe merdiveni (iki ardışık tren)</div>
          <div className="rounded border p-2" style={{ borderColor: brand.border }}>
            <BlockingStairChart bloklar={bt.bloklar} L={bt.toplamUzunluk} minHeadway={bt.minHeadway} kritikBlok={bt.kritikBlok} yorunge={bt.yorunge} />
          </div>
          <p className="mt-1.5 text-xs" style={{ color: brand.muted }}>
            Her dikdörtgen bir sinyal bloğunun rezerve süresi (blocking-time); dikey = blok uzunluğu, yatay = süre.
            İki merdiven <span style={{ color: brand.red }}>kritik blokta</span> tam değer → o an sürdürülebilir min headway.
            <span style={{ color: SERI.duzBlok }}> ■</span> düz blok · <span style={{ color: SERI.makasBlok }}>■</span> makas bloğu.
          </p>
        </div>

        {/* Blok başına bileşen dökümü (yardımcı görünüm) */}
        <div className="mt-4">
          <div className="field-label mb-2">Blok başına blocking-time bileşenleri (6 parça yığını)</div>
          {/* Yükseklik zinciri: h-40 (kesin) → sütun h-full → bar alanı flex-1 (kesin)
              → bar `%`. Ara sarmalayıcı olmadan yüzde yükseklik çözülmez (barlar
              minHeight'a düşer, grafik boş görünür). */}
          <div className="flex h-40 items-stretch gap-1">
            {bt.bloklar.map((b) => {
              const mx = Math.max(1, ...bt.bloklar.map((x) => x.toplam));
              const sureler = [b.tSetup, b.tSighting, b.tApproach, b.tRunning, b.tClearing, b.tRelease];
              const parcalar: [number, string][] = BT_PARCA.map(([, c], j) => [sureler[j], c]);
              const kritik = b.i === bt.kritikBlok;
              return (
                <div key={b.i} className="flex h-full flex-1 flex-col items-center gap-0.5" title={`Blok #${b.i}: ${b.toplam.toFixed(0)} s${b.makasBlok ? " (makas)" : ""}`}>
                  <div className="flex w-full min-h-0 flex-1 flex-col justify-end">
                    <div className="flex w-full flex-col justify-end overflow-hidden rounded-t" style={{ height: `${(b.toplam / mx) * 100}%`, minHeight: 3, outline: kritik ? `2px solid ${CK.red}` : "none" }}>
                      {parcalar.map(([v, c], j) => v > 0 && <div key={j} style={{ height: `${(v / b.toplam) * 100}%`, background: c }} />)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.55rem]" style={{ color: kritik ? CK.red : CK.faint }}>{b.i}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[0.6rem]" style={{ color: brand.muted }}>
            {BT_PARCA.map(([ad, c]) => (
              <span key={ad} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{ad}</span>
            ))}
            <span className="ml-1" style={{ color: CK.faint }}>(açıktan koyuya = zaman sırası)</span>
          </div>
        </div>
      </Panel>

      {/* Parametreler — editable, paylaşılan */}
      <Panel baslik="Simülasyon Parametreleri" aciklama="Tek kaynak. Değiştirdiğin an Sefer / Ringler / Anklaşman modüllerinin tümü bu değerlerle yeniden hesaplar. Tarayıcıda kalıcıdır.">
        <div className="flex flex-col gap-5">
          {gruplar.map(([grup, params]) => (
            <div key={grup}>
              <div className="field-label mb-2 border-b pb-1" style={{ borderColor: brand.border }}>{grup}</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {params.map((m) => (
                  <div key={m.key} className="flex items-center gap-3 rounded border p-2.5" style={{ borderColor: brand.border }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium" style={{ color: brand.ink }}>{m.ad}</div>
                      <div className="text-[0.7rem]" style={{ color: brand.muted }}>{m.etkiler}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.moduller.map((mm) => (<span key={mm} className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium" style={{ background: MODUL_RENK[mm] + "1A", color: MODUL_RENK[mm] }}>{mm}</span>))}
                        <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-mono" style={{ background: CK.track, color: brand.faint }}>{m.kaynak}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <input type="number" value={round(paramGoster(cfg, m), m.tur === "ivme" ? 1 : 0)} step={m.step} min={m.min} max={m.max}
                        onChange={(e) => { const g = parseFloat(e.target.value); if (!Number.isNaN(g)) patch({ [m.key]: paramSI(m, g) }); }}
                        className="w-20 rounded border px-2 py-1 text-right text-sm tabular-nums" style={{ borderColor: brand.border, color: brand.ink }} />
                      <span className="w-10 text-xs" style={{ color: brand.muted }}>{birim(m.tur)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Bilgi / challenge referansı */}
      <Panel baslik="Sistemin Karşıladığı Durumlar (Challenge Kataloğu)" aciklama="Belge kabullerinden türeyen gerçek-hayat arıza/istisna durumları ve sistemin tepkisi — parametreler değiştikçe bu davranışlar korunur.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: brand.borderStrong, color: brand.muted }}>
                <th className="py-2 pr-3 font-medium">Durum</th>
                <th className="py-2 pr-3 font-medium">Sistem tepkisi</th>
                <th className="py-2 font-medium">İlgili parametre</th>
              </tr>
            </thead>
            <tbody>
              {CHALLENGE.map((c, i) => (
                <tr key={i} className="border-b align-top" style={{ borderColor: brand.border }}>
                  <td className="py-2 pr-3 font-medium" style={{ color: brand.ink }}>{c[0]}</td>
                  <td className="py-2 pr-3" style={{ color: brand.inkSoft }}>{c[1]}</td>
                  <td className="py-2 font-mono text-xs" style={{ color: brand.muted }}>{c[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Sistem Merkezi — parametreler tek kaynaktır; Sefer / Ringler / Anklaşman modülleri buradan okur. Değerler tarayıcıda saklanır (localStorage). Referans hızlar: {kmh(cfg.vAnahat).toFixed(0)}/{kmh(cfg.vSahasal).toFixed(0)}/{kmh(cfg.vMakas).toFixed(0)}/{kmh(cfg.vHemzemin).toFixed(0)} km/h.
      </footer>
    </div>
  );
}

const CHALLENGE: string[][] = [
  ["Aks sayıcı arızası (sahte meşguliyet)", "Elektriksel makas komutu bloke → manuel makas + süpervizör blok sıfırlama", "route release"],
  ["TCC–saha haberleşme kaybı", "Makas bölgeleri kırmızı; duraklar arası headway sürer (tüm hat sönmez)", "headway"],
  ["Kırmızı ihlali / kurtarma treni", "Yalnız ilgili lokal bölge sinyalleri söner", "—"],
  ["Kritik donanım arızası", "Fail-safe SÖNÜK (blanking) — en katı dur", "—"],
  ["Çoklu (S-)makas eşzamanlı tanzim", "Sıralı tanzim, her adım ≤ makas adım süresi", "makasAdimMax"],
  ["Tren sayısı artışı", "En yavaş ring darboğaz; makas bölgesi çakışma kuyruğu", "headway · blok"],
  ["Yakın durak / kısa mesafe (best-case)", "Durak-çiftleri eşit şart → headway kararlı", "worst/best mesafe"],
  ["Tercihsiz (ters) yön", "Sınırlı nokta + tam blok; dinamik arka release, ön kilitli", "route release"],
];

// ————— yardımcılar —————
function round(n: number, d = 0) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
function MiniStat({ etiket, deger, alt, vurgu }: { etiket: string; deger: string; alt?: string; vurgu?: string }) {
  return (
    <div className="rounded border p-2.5" style={{ borderColor: brand.border }}>
      <div className="field-label" style={{ fontSize: "0.6rem" }}>{etiket}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: vurgu ?? brand.ink }}>{deger}</div>
      {alt && <div className="truncate text-xs" style={{ color: brand.faint }} title={alt}>{alt}</div>}
    </div>
  );
}
function Panel({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border bg-white p-5" style={{ borderColor: brand.border }}>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
        <h2 className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{baslik}</h2>
      </div>
      {aciklama && <p className="-mt-3 mb-4 pl-[11px] text-xs" style={{ color: brand.muted }}>{aciklama}</p>}
      {children}
    </div>
  );
}
