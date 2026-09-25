"use client";

// raysim — SEFER (TARİFE) ↔ TERS İŞLETME ENTEGRE PANELİ.
// Manuel SEFER ARALIĞI (headway) + ZAMAN çubuğu → o an seferdeki araçların GERÇEK konumları
// (yörüngeden; sinyal/geçit/makas/dwell yavaşlamaları dâhil) diyagramda; talep dengesizliği
// olan makaslara yaklaşan araca KISA DÖNÜŞ kararı bağlanır; kazanç + gerekçe önerilir.

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { sure } from "@/lib/anaray/format";
import { panelAcVeGit } from "@/lib/anaray/panelGezinme";
import { useDil } from "@/components/DilProvider";
import { seferTersEntegre } from "@/lib/anaray/seferters";
import type { DurakArasiRing } from "@/lib/anaray/ring";
import type { SimConfig, Isletme } from "@/lib/anaray/config";
import type { RollingStock } from "@/lib/anaray/types";

export function SeferTersEntegre({ rings, stock, cfg, isletme, headwayDk, onHeadwayChange }: { rings: DurakArasiRing[]; stock: RollingStock; cfg: SimConfig; isletme: Isletme; headwayDk: number; onHeadwayChange: (v: number) => void }) {
  const { t } = useDil();
  const [anSn, setAnSn] = useState(0);
  const s = useMemo(() => seferTersEntegre(rings, stock, cfg, isletme, headwayDk * 60, anSn), [rings, stock, cfg, isletme, headwayDk, anSn]);

  if (!s.gecerli) return <div className="text-sm" style={{ color: brand.muted }}>{t({ tr: "Hat yeterli değil (en az 2 durak gerekli).", en: "Line is not sufficient (at least 2 stations required).", de: "Linie nicht ausreichend (mindestens 2 Haltestellen erforderlich)." })}</div>;

  const Lkm = s.L / 1000;
  const W = 900, padL = 12, padR = 14, midY = 54, H = 132;
  const axisY = H - 26;
  const X = (km: number) => padL + (km / Math.max(0.001, Lkm)) * (W - padL - padR);
  const oneriAracSet = new Set(s.oneriler.map((o) => o.aracNo));
  // x-ekseni km ızgarası — HER ZAMAN girili: ~8 bölmeye yakın "güzel" adım + uçlar.
  const kmStep = (() => {
    const hedef = Lkm / 8, p = Math.pow(10, Math.floor(Math.log10(hedef || 1)));
    return [1, 2, 2.5, 5, 10].map((c) => c * p).find((c) => c >= hedef) ?? 10 * p;
  })();
  const kmTicks: number[] = [];
  for (let k = 0; k <= Lkm + 1e-6; k += kmStep) kmTicks.push(Math.round(k * 100) / 100);
  if (kmTicks[kmTicks.length - 1] < Lkm - 1e-6) kmTicks.push(Math.round(Lkm * 100) / 100);

  return (
    <div>
      {/* Kontroller */}
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: brand.ink }}>{t({ tr: "Sefer aralığı", en: "Headway", de: "Zugfolgezeit" })}</span>
          <input type="range" min={0.5} max={20} step={0.5} value={headwayDk} onChange={(e) => onHeadwayChange(parseFloat(e.target.value))} className="w-40" />
          <input type="number" min={0.5} step={0.5} value={headwayDk} onChange={(e) => onHeadwayChange(Math.max(0.5, parseFloat(e.target.value) || headwayDk))} className="w-16 rounded border px-1.5 py-0.5 text-sm tabular-nums" style={{ borderColor: brand.border }} />
          <span className="tabular-nums font-bold" style={{ color: brand.red }}>dk</span>
          <span className="text-xs" style={{ color: s.aracKirpildi ? brand.red : brand.muted }}>{s.aracKirpildi ? `→ ${t({ tr: "istenen", en: "requested", de: "angefordert" })} ${s.filo} · ${t({ tr: "sığan", en: "fits", de: "passt" })} ${s.cizilenArac} ${t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })}` : `→ ${s.filo} ${t({ tr: "araç serviste", en: "vehicles in service", de: "Fahrzeuge im Betrieb" })}`}</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: brand.ink }}>{t({ tr: "Zaman", en: "Time", de: "Zeit" })}</span>
          <input type="range" min={0} max={Math.max(1, Math.round(s.cevrimSn))} step={15} value={anSn} onChange={(e) => setAnSn(parseFloat(e.target.value))} className="w-40" />
          <span className="tabular-nums" style={{ color: brand.inkSoft }}>{sure(s.anSn)} / {sure(s.cevrimSn)}</span>
        </label>
      </div>
      <div className="mb-2 px-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "Sefer aralığı", en: "The headway", de: "Die Zugfolgezeit" })} <b>{t({ tr: "Filo Paneli", en: "Fleet Panel", de: "Flottenpanel" })}</b> {t({ tr: "ve", en: "and", de: "und" })} <b>{t({ tr: "Tarife", en: "Timetable", de: "Fahrplan" })}</b> {t({ tr: "ile ortaktır — burada değiştirince hepsi birlikte güncellenir.", en: "is shared — changing it here updates them all together.", de: "wird gemeinsam genutzt — eine Änderung hier aktualisiert alle zusammen." })}</div>

      {/* Kırpma uyarısı — istenen sıklık fiziksel tavanı aşıyorsa diyagram tavanla çizilir */}
      {s.aracKirpildi && (
        <div className="mb-1 rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: "#FBECEC", color: "#8E1224" }}>
          ⚠ {t({ tr: "İstenen", en: "The requested", de: "Die angeforderten" })} {s.filo} {t({ tr: "araç hatta sığmıyor — diyagram, taşınabilen", en: "vehicles do not fit on the line — the diagram was drawn with the", de: "Fahrzeuge passen nicht auf die Linie — das Diagramm wurde mit den" })} {s.cizilenArac} {t({ tr: "araçla (en küçük uygulanabilir aralık", en: "vehicles it can hold (smallest feasible headway", de: "möglichen Fahrzeugen gezeichnet (kleinste umsetzbare Zugfolgezeit" })} {sure(s.cevrimSn / Math.max(1, s.cizilenArac))}{t({ tr: ") çizildi.", en: ").", de: ")." })}
        </div>
      )}

      {/* Konum diyagramı */}
      <div className="-mx-1 overflow-x-auto px-1 sm:mx-0" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="min-w-[680px] sm:min-w-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t({ tr: "Sefer & ters işletme konum diyagramı", en: "Service & reverse-running position diagram", de: "Fahrt- & Kehrbetriebs-Positionsdiagramm" })}>
            {/* x-ekseni km ızgarası — dikey ince çizgiler + km değerleri (her zaman girili) */}
            {kmTicks.map((k, i) => (
              <g key={`km${i}`}>
                <line x1={X(k)} y1={midY - 22} x2={X(k)} y2={axisY} stroke={brand.border} strokeWidth={0.6} strokeDasharray="2 3" />
                <text x={X(k)} y={axisY + 12} textAnchor="middle" fontSize={8} fill={brand.muted}>{k.toFixed(k % 1 === 0 ? 0 : 1)}</text>
              </g>
            ))}
            <text x={W - padR} y={axisY + 12} textAnchor="end" fontSize={8} fontWeight={600} fill={brand.inkSoft}>km →</text>
            {/* hat */}
            <line x1={padL} y1={midY} x2={W - padR} y2={midY} stroke={CK.track} strokeWidth={4} strokeLinecap="round" />
            {/* makaslar — TERS İŞLETME YAPILABİLEN TÜM MAKASLAR: işaret (◆) + km etiketi */}
            {s.makaslar.map((m, i) => {
              const x = X(m.km), renk = m.onerilir ? CK.red : brand.inkSoft;
              const ly = i % 2 === 1 ? midY + 35 : midY + 24; // km etiketlerini iki satıra dağıt → üst üste binmesin
              return (
                <g key={i}>
                  <line x1={x} y1={midY - 9} x2={x} y2={midY + 9} stroke={renk} strokeWidth={m.onerilir ? 2 : 1.2} />
                  <rect x={x - 3} y={midY - 3} width={6} height={6} transform={`rotate(45 ${x} ${midY})`} fill={renk} />
                  <text x={x} y={ly} textAnchor="middle" fontSize={7.5} fontWeight={m.onerilir ? 700 : 500} fill={renk}>{m.onerilir ? "🔄 " : ""}{m.km.toFixed(2)}</text>
                  <title>{`${m.ad} (${m.crossover === "x" ? "X" : "S"}-${t({ tr: "makas", en: "switch", de: "Weiche" })}) · ${m.km.toFixed(2)} km${m.onerilir ? ` · ${t({ tr: "kısa dönüş adayı", en: "short-turn candidate", de: "Kehr-Kandidat" })}` : ` · ${t({ tr: "ters işletme mümkün", en: "reverse running possible", de: "Kehrbetrieb möglich" })}`}`}</title>
                </g>
              );
            })}
            {/* öneri okları: araç → makas */}
            {s.oneriler.map((o, i) => (
              <line key={`ok${i}`} x1={X(o.aracKm)} y1={midY - 16} x2={X(o.makasKm)} y2={midY - 16} stroke={CK.red} strokeWidth={0.8} strokeDasharray="3 2" markerEnd="url(#ok)" />
            ))}
            <defs><marker id="ok" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={CK.red} /></marker></defs>
            {/* araçlar */}
            {s.araclar.map((a) => {
              const x = X(a.km), oner = oneriAracSet.has(a.no);
              const y = a.gidis ? midY - 6 : midY + 6;
              const renk = oner ? CK.red : a.gidis ? CK.blue : CK.orange;
              const ok = a.gidis ? `${x - 4},${y - 4} ${x + 4},${y} ${x - 4},${y + 4}` : `${x + 4},${y - 4} ${x - 4},${y} ${x + 4},${y + 4}`;
              return (
                <g key={a.no}>
                  <polygon points={ok} fill={renk} />
                  <text x={x} y={a.gidis ? y - 6 : y + 12} textAnchor="middle" fontSize={7} fontWeight={oner ? 700 : 500} fill={renk}>{a.no}</text>
                  <title>{`${t({ tr: "Araç", en: "Vehicle", de: "Fahrzeug" })} ${a.no} · ${a.km.toFixed(2)} km · ${a.gidis ? t({ tr: "gidiş", en: "outbound", de: "Hinfahrt" }) : t({ tr: "dönüş", en: "return", de: "Rückfahrt" })} · ${a.durum}`}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs" style={{ color: brand.muted }}>
        <span><span style={{ color: CK.blue }}>▲</span> {t({ tr: "gidiş", en: "outbound", de: "Hinfahrt" })} · <span style={{ color: CK.orange }}>▼</span> {t({ tr: "dönüş", en: "return", de: "Rückfahrt" })} · <span style={{ color: CK.red }}>🔄</span> {t({ tr: "kısa dönüş adayı / bağlanan araç", en: "short-turn candidate / bound vehicle", de: "Kehr-Kandidat / gebundenes Fahrzeug" })}</span>
        <span><span style={{ color: brand.inkSoft }}>◆</span> {t({ tr: "ters işletme yapılabilen makas (tümü km ile işaretli)", en: "switch where reverse running is possible (all marked with km)", de: "Weiche mit möglichem Kehrbetrieb (alle mit km markiert)" })}</span>
      </div>

      {/* Tramvay ekleme ihtiyacı modülü */}
      {s.filoIhtiyac && (() => {
        const f = s.filoIhtiyac!;
        const stil: Record<string, { bg: string; bd: string; ik: string; et: string }> = {
          dengeli: { bg: "#EEF7F1", bd: "#2E7D57", ik: "#1E5C40", et: t({ tr: "Filo dengeli", en: "Fleet balanced", de: "Flotte ausgewogen" }) },
          tersYeter: { bg: "#EEF4FC", bd: CK.blue, ik: "#1B4E86", et: t({ tr: "Ters işletme yeterli", en: "Reverse running sufficient", de: "Kehrbetrieb ausreichend" }) },
          ekle: { bg: "#FDF3F4", bd: CK.red, ik: "#8E1224", et: t({ tr: "Tramvay ekle", en: "Add trams", de: "Straßenbahnen hinzufügen" }) },
          altyapi: { bg: "#FBECEC", bd: "#8E1224", ik: "#6E0E1C", et: t({ tr: "Altyapı sınırı", en: "Infrastructure limit", de: "Infrastrukturgrenze" }) },
          aracYetersiz: { bg: "#FBECEC", bd: "#8E1224", ik: "#6E0E1C", et: t({ tr: "Sefer sıklığı sağlanamaz", en: "Frequency cannot be met", de: "Taktdichte nicht erreichbar" }) },
        };
        const c = stil[f.durum];
        const py = (r: number) => `%${Math.round(r * 100)}`;
        return (
          <div className="mt-3 rounded-lg border-l-4 px-3 py-2.5" style={{ borderColor: c.bd, background: c.bg }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: c.bd }}>{f.problem ? "⚠ " : "✓ "}{c.et}</span>
              <span className="text-sm font-semibold" style={{ color: c.ik }}>{t({ tr: "Pik", en: "Peak", de: "Spitze" })} {Math.round(f.tepeYuk)} {t({ tr: "yolcu/sa", en: "pax/h", de: "Fahrgäste/h" })} · {f.tepeDurak} · {t({ tr: "en yoğun kesim", en: "busiest segment", de: "stärkster Abschnitt" })} {py(f.tepeDoluluk)} ({t({ tr: "hedef", en: "target", de: "Ziel" })} {py(f.hedefDoluluk)})</span>
            </div>
            <p className="mt-1 text-sm" style={{ color: brand.inkSoft }}>{f.mesaj}</p>
            {f.durum === "aracYetersiz" ? (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: brand.ink }}>
                <span>{t({ tr: "İstenen serviste:", en: "Requested in service:", de: "Angefordert im Betrieb:" })} <b style={{ color: c.bd }}>{f.serviste}</b></span>
                <span>{t({ tr: "Fiziksel tavan:", en: "Physical ceiling:", de: "Physische Obergrenze:" })} <b>{f.teorikTavan} {t({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })}</b></span>
                <span>{t({ tr: "Fazla:", en: "Excess:", de: "Überschuss:" })} <b style={{ color: c.bd }}>{f.acikAdet} {t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })}</b></span>
                <span>{t({ tr: "En küçük uygulanabilir aralık:", en: "Smallest feasible headway:", de: "Kleinste umsetzbare Zugfolgezeit:" })} <b>{sure(f.minAralikSn)}</b></span>
              </div>
            ) : f.eklenecek > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: brand.ink }}>
                <span>{t({ tr: "Serviste:", en: "In service:", de: "Im Betrieb:" })} <b>{f.serviste}</b></span>
                <span>{t({ tr: "Önerilen:", en: "Recommended:", de: "Empfohlen:" })} <b style={{ color: c.bd }}>+{f.eklenecek} {t({ tr: "tramvay", en: "trams", de: "Straßenbahnen" })}</b> → <b>{f.yeniServiste}</b></span>
                <span>{t({ tr: "Yeni aralık:", en: "New headway:", de: "Neue Zugfolgezeit:" })} <b>{sure(f.yeniHeadwaySn)}</b></span>
                <span>{t({ tr: "Doluluk:", en: "Occupancy:", de: "Auslastung:" })} {py(f.tepeDoluluk)} → <b>{py(f.yeniDoluluk)}</b></span>
                {f.durum === "altyapi" && <span style={{ color: c.bd }}>{t({ tr: "Karşılanamayan:", en: "Unmet:", de: "Nicht gedeckt:" })} <b>{f.acikAdet} {t({ tr: "araç", en: "vehicles", de: "Fahrzeuge" })}</b></span>}
              </div>
            )}
            {f.problem && (
              <button type="button" onClick={() => panelAcVeGit("filo-paneli", c.bd)}
                className="mt-2 rounded-md px-2.5 py-1 text-xs font-semibold text-white" style={{ background: c.bd }}>
                {t({ tr: "Gereken Filo Paneli’ne git →", en: "Go to Required Fleet Panel →", de: "Zum Panel Benötigte Flotte →" })}
              </button>
            )}
          </div>
        );
      })()}

      {/* Öneriler */}
      {s.oneriler.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-semibold" style={{ color: brand.ink }}>{t({ tr: "Kısa dönüş önerileri (araca bağlı)", en: "Short-turn recommendations (per vehicle)", de: "Kehr-Empfehlungen (je Fahrzeug)" })}</div>
          {s.oneriler.map((o, i) => (
            <div key={i} className="rounded-lg border-l-4 px-3 py-2 text-sm" style={{ borderColor: CK.red, background: "#FDF3F4", color: brand.inkSoft }}>
              <div className="font-semibold" style={{ color: brand.ink }}>
                🔄 {t({ tr: "Araç", en: "Vehicle", de: "Fahrzeug" })} {o.aracNo} → {o.makasAd} ({o.crossover === "x" ? "X" : "S"}-{t({ tr: "makas", en: "switch", de: "Weiche" })} · {o.makasKm.toFixed(2)} km)
                <span className="ml-2 text-xs font-normal" style={{ color: brand.muted }}>{t({ tr: "makasa", en: "reaches switch in", de: "erreicht Weiche in" })} ~{sure(o.ulasimSn)} {t({ tr: "sonra ulaşır · yoğun/sessiz", en: "· busy/quiet", de: "· voll/leer" })} {Math.round(o.oran * 10) / 10}× · ≈{sure(o.kazancSn)} {t({ tr: "daha sık", en: "more frequent", de: "häufiger" })}</span>
              </div>
              <div className="mt-0.5 text-xs">{o.gerekce}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border px-3 py-2 text-sm" style={{ borderColor: brand.border, color: brand.muted }}>{t({ tr: "Bu an için araca bağlı kısa dönüş önerisi yok — zaman çubuğunu oynatınca makasa yaklaşan araç değişir.", en: "No vehicle-bound short-turn recommendation for this moment — move the time slider and the vehicle approaching the switch changes.", de: "Für diesen Moment keine fahrzeuggebundene Kehr-Empfehlung — beim Bewegen des Zeitreglers ändert sich das der Weiche nahende Fahrzeug." })}</div>
      )}

      {/* Bilgilendirme */}
      <ul className="mt-3 ml-4 list-disc text-xs" style={{ color: brand.muted }}>
        {s.bilgi.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  );
}
