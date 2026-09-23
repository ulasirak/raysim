"use client";

// raysim — ASPECT DİZİLİM (SIGNAL ASPECT SEQUENCE) paneli (Sistem Merkezi).
// Büyük sıçrama G: sinyalizasyon derinliği. Hattın ileri-yön sinyallerinden 3-aspect
// blok dizilimini (Yol / Tedbir / Dur) çizer; işgal bloğu kaydırılınca aspect'ler
// adım adım değişir. Her bloğun UYARI (sarı) mesafesini tasarım hızındaki servis-fren
// mesafesine karşı denetler — sinyalizasyon mühendisliğinin klasik "aspect spacing"
// kontrolü. Veriler ring modelinden gelir (uydurma yok).

import { useMemo, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import { CK, ASPEKT } from "@/lib/anaray/chartkit";
import { useProje, useSimConfig } from "@/components/SimConfigProvider";
import { aspectDizilim, ASPECT_AD, type Aspect } from "@/lib/anaray/aspectDizilim";
import { BosDurum } from "@/components/BosDurum";

const kmFmt = (m: number) => `${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, "0")}`;

export function AspectDizilimPaneli() {
  const { rings } = useProje();
  const { cfg } = useSimConfig();
  const [isgalSecim, setIsgalSecim] = useState(0); // 0 = otomatik (motor seçer)

  const r = useMemo(() => aspectDizilim(rings, cfg, isgalSecim || undefined), [rings, cfg, isgalSecim]);

  if (r.bloklar.length === 0) {
    return (
      <div className="ds-card">
        <div className="border-b px-5 py-4" style={{ borderColor: brand.border }}>
          <div className="field-label">Aspect Dizilimi (Signal Aspect Sequence)</div>
          <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>3-aspect blok dizilimi · görüş/fren denetimi</h3>
        </div>
        <div className="p-5">
          <BosDurum sik baslik="Blok sınırı yok" ipucu="Ringler’de istasyon/sinyal ekleyince aspect dizilimi burada türetilir." />
        </div>
      </div>
    );
  }

  // ————— SVG düzeni —————
  const W = 940, padL = 52, padR = 34;
  const trackY = 120, lampY = 72, mastTop = 84;
  const x = (km: number) => padL + (km / Math.max(1, r.hatUzunluk)) * (W - padL - padR);

  const isgalB = r.bloklar[r.isgalBlok - 1];       // işgal bloğu
  const uyariB = r.bloklar[r.isgalBlok - 2];        // bir gerideki uyarı (Tedbir) bloğu — yoksa null
  const uyariYeterli = uyariB ? uyariB.uzunluk + 1e-6 >= r.frenMesafesi : true;

  // Fren-mesafesi cetveli: kırmızı sinyalden (işgal bloğu girişi) GERİYE gerekli fren mesafesi.
  const kirmiziKm = isgalB.basKm;
  const gerekliKm = kirmiziKm - r.frenMesafesi; // < 0 olabilir (kısa uyarı bloğunda kadraj dışı)

  const lampColor = (a: Aspect) => ASPEKT[a];

  return (
    <div className="ds-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Aspect Dizilimi (Signal Aspect Sequence)</div>
          <h3 className="font-brand mt-0.5 text-lg font-semibold" style={{ color: brand.ink }}>3-aspect blok dizilimi · görüş/fren denetimi</h3>
          <p className="mt-1 max-w-2xl text-xs" style={{ color: brand.inkSoft }}>
            İleri-yön sinyallerinden türetilen klasik 3-aspect dizilim: işgal edilen bloğa yaklaşan tren
            <b style={{ color: ASPEKT.kirmizi }}> Dur</b> → <b style={{ color: ASPEKT.sari }}>Tedbir</b> → <b style={{ color: ASPEKT.yesil }}>Yol</b> görür.
            Her uyarı (sarı) bloğu, tasarım hızındaki servis-fren mesafesinden uzun olmalıdır.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{ color: r.yetersizBlok ? CK.red : brand.ink }}>{r.bloklar.length}</div>
          <div className="text-xs font-medium" style={{ color: brand.muted }}>blok · {Math.round(r.tasarimHizKmh)} km/h tasarım</div>
          <div className="mt-0.5 text-[0.7rem]" style={{ color: r.yetersizBlok ? CK.red : brand.muted }}>
            fren ≈ {Math.round(r.frenMesafesi)} m · {r.yetersizBlok ? `${r.yetersizBlok} yetersiz blok` : "tüm bloklar yeterli"}
          </div>
        </div>
      </div>

      {/* Diyagram */}
      <div className="overflow-x-auto px-3 py-4">
        <svg viewBox={`0 0 ${W} 200`} className="w-full" style={{ minWidth: 640 }} role="img"
          aria-label="Sinyal aspect dizilim diyagramı">
          {/* fren-mesafesi cetveli (kırmızı sinyalden geriye gerekli fren mesafesi) */}
          {(() => {
            const gx = Math.max(padL, x(gerekliKm));       // kadraj içine kırp
            const renk = uyariYeterli ? CK.good : CK.red;  // uyarı bloğu yetiyorsa yeşil, yoksa kırmızı
            const orta = (gx + x(kirmiziKm)) / 2;
            return (
              <g>
                <line x1={gx} y1={trackY + 30} x2={x(kirmiziKm)} y2={trackY + 30} stroke={renk} strokeWidth={1.5} strokeDasharray="4 3" />
                <line x1={gx} y1={trackY + 26} x2={gx} y2={trackY + 34} stroke={renk} strokeWidth={1.5} />
                <line x1={x(kirmiziKm)} y1={trackY + 26} x2={x(kirmiziKm)} y2={trackY + 34} stroke={CK.red} strokeWidth={1.5} />
                <text x={orta} y={trackY + 44} textAnchor="middle" fontFamily={CK.sans} fontSize={9} fill={renk}>
                  gerekli fren mesafesi ≈ {Math.round(r.frenMesafesi)} m{uyariYeterli ? "" : " · uyarı bloğu KISA"}
                </text>
              </g>
            );
          })()}

          {/* bloklar (tıklanabilir) */}
          {r.bloklar.map((b) => {
            const bx = x(b.basKm), bw = x(b.sonKm) - x(b.basKm);
            const isgal = b.no === r.isgalBlok;
            const fill = isgal ? "rgba(200,16,46,0.10)" : !b.yeterli ? CK.amberBg : "transparent";
            return (
              <g key={b.no} style={{ cursor: "pointer" }} onClick={() => setIsgalSecim(b.no)}>
                <rect x={bx} y={trackY - 12} width={bw} height={24} fill={fill}
                  stroke={isgal ? "rgba(200,16,46,0.35)" : "transparent"} strokeWidth={1} rx={2} />
                {/* blok no + uzunluk */}
                <text x={bx + bw / 2} y={trackY + 60} textAnchor="middle" fontFamily={CK.sans} fontSize={9}
                  fontWeight={isgal ? 700 : 500} fill={isgal ? CK.red : brand.ink}>B{b.no}</text>
                <text x={bx + bw / 2} y={trackY + 72} textAnchor="middle" fontFamily={CK.sans} fontSize={8}
                  fill={b.yeterli ? CK.muted : CK.amberInk} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {b.uzunluk} m{b.yeterli ? "" : " ⚠"}
                </text>
              </g>
            );
          })}

          {/* ray */}
          <line x1={padL} y1={trackY} x2={W - padR} y2={trackY} stroke={CK.baseline} strokeWidth={3} strokeLinecap="round" />

          {/* işgal treni (kırmızı bloğun içinde duran araç) */}
          {isgalB && (
            <g>
              <rect x={x(isgalB.basKm) + 4} y={trackY - 7} width={Math.max(14, Math.min(34, x(isgalB.sonKm) - x(isgalB.basKm) - 8))} height={14}
                rx={3} fill={CK.red} opacity={0.9} />
              <text x={x(isgalB.basKm) + 8} y={trackY + 3.5} fontFamily={CK.sans} fontSize={8} fontWeight={700} fill="#fff">■</text>
            </g>
          )}

          {/* sinyaller (her blok girişi) + aspect lambası */}
          {r.sinyaller.map((s) => (
            <g key={s.no}>
              <line x1={x(s.km)} y1={mastTop} x2={x(s.km)} y2={trackY - 12} stroke={CK.ink2} strokeWidth={1.5} />
              <circle cx={x(s.km)} cy={lampY} r={7} fill={lampColor(s.aspect)}
                stroke={brand.ink} strokeOpacity={0.25} strokeWidth={1} />
              {s.aspect !== "yesil" && (
                <text x={x(s.km)} y={lampY - 12} textAnchor="middle" fontFamily={CK.sans} fontSize={8.5}
                  fontWeight={700} fill={lampColor(s.aspect)}>{ASPECT_AD[s.aspect]}</text>
              )}
              <text x={x(s.km)} y={trackY + 20} textAnchor="middle" fontFamily={CK.sans} fontSize={7.5}
                fill={CK.faint} style={{ fontVariantNumeric: "tabular-nums" }}>{kmFmt(s.km)}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* İşgal bloğu kaydırıcı */}
      <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3" style={{ borderColor: brand.border }}>
        <span className="field-label whitespace-nowrap">İşgal bloğu</span>
        <input type="range" min={1} max={r.bloklar.length} value={r.isgalBlok}
          onChange={(e) => setIsgalSecim(Number(e.target.value))}
          className="flex-1" style={{ accentColor: CK.red, minWidth: 160 }}
          aria-label="İşgal edilen blok" />
        <span className="text-sm font-semibold tabular-nums" style={{ color: CK.red }}>
          B{r.isgalBlok} · k{kmFmt(isgalB.basKm)}–{kmFmt(isgalB.sonKm)}
        </span>
        {isgalSecim > 0 && (
          <button onClick={() => setIsgalSecim(0)} className="text-xs underline" style={{ color: brand.muted }}>otomatik</button>
        )}
      </div>

      <div className="border-t px-5 py-3 text-[0.72rem] leading-relaxed" style={{ borderColor: brand.border, color: brand.muted }}>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ASPEKT.yesil }} /> <b style={{ color: brand.inkSoft }}>Yol</b></span> proceed ·{" "}
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ASPEKT.sari }} /> <b style={{ color: brand.inkSoft }}>Tedbir</b></span> durmaya hazırlan ·{" "}
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ASPEKT.kirmizi }} /> <b style={{ color: brand.inkSoft }}>Dur</b></span> blok işgal.
        Bloklar = istasyon sınırları + ileri-yön sinyaller. Tasarım hızı = ana hat azami ({Math.round(r.tasarimHizKmh)} km/h), servis fren = {cfg.yavaslama.toLocaleString("tr-TR")} m/s².
        Bir uyarı bloğu fren mesafesinden kısaysa (⚠) sürücü Tedbir görüp bloğun sonundaki Dur'a yetişemeden duramaz → görüş/blok uzunluğu artırılmalı.
      </div>
    </div>
  );
}
