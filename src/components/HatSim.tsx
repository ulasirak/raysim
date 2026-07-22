"use client";

// türkray — TAM HAT ÇOK-TREN CANLI SİMÜLASYONU (ring + anklaşman birleşik).
// Ring hücreleri tek koridora zincirlenir; trenler sabit-blok headway ile akar,
// makas bölgelerinde gerçek interlocking'e girer (tanzim→yeşil→işgal→release kilidi).
// Headway sıkışınca makas/blok kuyruklanması → gerçek darboğaz canlı görünür.
// Tüm mesafe/hız/zamanlayıcılar paylaşılan config'ten (Sistem Merkezi) gelir.

import { useEffect, useMemo, useRef, useState } from "react";
import { loopToHat, simuleHat, type ZonFaz } from "@/lib/anaray/hatsim";
import { useSimConfig, useProje } from "@/components/SimConfigProvider";
import { varsayilanArac } from "@/lib/anaray/vehicles";
import { saat, sure } from "@/lib/anaray/format";
import { brand } from "@/lib/anaray/brand";

const VBW = 900;
const VBH = 180;
const MX = 40; // yatay kenar boşluğu
const YHAT = 96; // koridor y
const HIZLAR = [1, 5, 15, 30, 60];

const FAZ_RENK: Record<ZonFaz, string> = {
  bos: brand.faint,
  tanzim: brand.gold, // sarı — tanzim
  kilitli: "#0E7C57", // yeşil — rota kurulu
  release: brand.red, // kırmızı — release kilidi
};
const FAZ_AD: Record<ZonFaz, string> = { bos: "boş", tanzim: "tanzim (sarı)", kilitli: "kurulu (yeşil)", release: "release kilidi" };

function sampleS(points: { t: number; s: number }[], t: number): { s: number; active: boolean } {
  if (points.length === 0) return { s: 0, active: false };
  const first = points[0], last = points[points.length - 1];
  if (t < first.t - 1e-6) return { s: first.s, active: false };
  if (t > last.t + 1e-6) return { s: last.s, active: false };
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      const p0 = points[i - 1], p1 = points[i];
      const f = (t - p0.t) / ((p1.t - p0.t) || 1);
      return { s: p0.s + (p1.s - p0.s) * f, active: true };
    }
  }
  return { s: last.s, active: true };
}

function fazAt(olaylar: { t: number; faz: ZonFaz }[] | undefined, t: number): ZonFaz {
  if (!olaylar || olaylar.length === 0) return "bos";
  let f: ZonFaz = "bos";
  for (const o of olaylar) { if (o.t <= t + 1e-9) f = o.faz; else break; }
  return f;
}

export function HatSim() {
  const { cfg } = useSimConfig();
  const { rings } = useProje();
  const [headway, setHeadway] = useState(120);
  const [count, setCount] = useState(8);
  const [t, setT] = useState(0);
  const [oynat, setOynat] = useState(false);
  const [hiz, setHiz] = useState(15);
  const [mounted, setMounted] = useState(false);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  const model = useMemo(() => loopToHat(rings, true, cfg), [rings, cfg]);
  const sonuc = useMemo(
    () => simuleHat(model, varsayilanArac, { headway, count, maxBlockLen: cfg.blokMaxUzunluk, captureFrames: true }),
    [model, headway, count, cfg.blokMaxUzunluk]
  );

  const L = model.line.length;
  const T = sonuc.tMax || 1;

  // headway/tren değişince zamanı sıfırla (render sırasında, effect değil)
  const [sonAnahtar, setSonAnahtar] = useState("");
  const anahtar = `${headway}|${count}|${cfg.blokMaxUzunluk}`;
  if (anahtar !== sonAnahtar) {
    setSonAnahtar(anahtar);
    if (t !== 0) setT(0);
    if (oynat) setOynat(false);
  }

  useEffect(() => {
    if (!oynat) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const d = (now - last.current) / 1000;
      last.current = now;
      setT((prev) => {
        const nx = prev + d * hiz;
        if (nx >= T) { setOynat(false); return T; }
        return nx;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [oynat, hiz, T]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const x = (s: number) => MX + (Math.max(0, Math.min(L, s)) / L) * (VBW - 2 * MX);

  // anlık tren konumları
  const trenler = sonuc.trains
    .map((tr) => ({ index: tr.index, ...sampleS(tr.points, t) }))
    .filter((x) => x.active);

  // işgal blokları
  const occ = new Set<number>();
  for (const tr of trenler) {
    for (let i = 0; i < sonuc.blocks.length - 1; i++) {
      if (tr.s >= sonuc.blocks[i] - 1e-6 && tr.s < sonuc.blocks[i + 1] - 1e-6) { occ.add(i); break; }
    }
  }

  const oynatDurdur = () => { if (t >= T) setT(0); setOynat((o) => !o); };
  const stat = (v: number) => (v > 0 ? sure(v) : "—");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 border-b pb-4" style={{ borderColor: brand.border }}>
        <div className="field-label">Tam Hat Çok-Tren Canlı Simülasyonu — Ring + Anklaşman Birleşik</div>
        <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>Konya 2. Etap · Tam Hat İşletme</h1>
        <p className="mt-1 text-sm" style={{ color: brand.muted }}>
          Durak-arası ring hücreleri tek koridora zincirlendi. Trenler sabit-blok headway ile akar; makas bölgelerinde
          gerçek interlocking&apos;e girer (tanzim → yeşil → işgal → release kilidi). Tren sayısını/aralığını artırdıkça makas
          ve blok kuyruklanması → gerçek darboğaz canlı belirir. Parametreler Sistem Merkezi&apos;nden gelir.
        </p>
      </div>

      <div className="flex flex-col gap-4">
      {/* Koridor görselleştirmesi */}
      {!mounted ? (
        <div className="h-[220px] w-full animate-pulse rounded-md" style={{ background: "#EDF0F3" }} aria-hidden />
      ) : (
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto" role="img" aria-label="Tam hat çok-tren canlı simülasyonu">
        {/* Boş hat */}
        <line x1={x(0)} y1={YHAT} x2={x(L)} y2={YHAT} stroke={brand.borderStrong} strokeWidth={5} strokeLinecap="round" />

        {/* İşgal edilen bloklar (kırmızı) */}
        {[...occ].map((i) => (
          <line key={`oc${i}`} x1={x(sonuc.blocks[i])} y1={YHAT} x2={x(sonuc.blocks[i + 1])} y2={YHAT} stroke={brand.red} strokeWidth={5} strokeLinecap="round" />
        ))}

        {/* Blok sınırları (ince çentik) */}
        {sonuc.blocks.map((s, i) => (
          <line key={`b${i}`} x1={x(s)} y1={YHAT - 6} x2={x(s)} y2={YHAT + 6} stroke={brand.faint} strokeWidth={1} />
        ))}

        {/* Makas bölgeleri — canlı aspekt bandı + sinyal */}
        {sonuc.zones.map((z) => {
          const faz = fazAt(sonuc.zoneTimeline[z.id], t);
          const col = FAZ_RENK[faz];
          return (
            <g key={z.id}>
              <rect x={x(z.start)} y={YHAT - 10} width={Math.max(3, x(z.end) - x(z.start))} height={20} rx={2} fill={col} opacity={faz === "bos" ? 0.25 : 0.85} />
              <circle cx={x(z.start)} cy={YHAT - 20} r={4} fill={col} stroke={brand.surface} strokeWidth={1.5} />
              <text x={x(z.merkez)} y={YHAT + 30} fill={brand.muted} fontSize={8.5} textAnchor="middle">⑂ {z.ad.replace(/\(.*\)/, "").trim()}</text>
            </g>
          );
        })}

        {/* İstasyonlar */}
        {model.line.stations.map((st) => (
          <g key={st.id}>
            <circle cx={x(st.position)} cy={YHAT} r={5} fill={brand.surface} stroke={brand.ink} strokeWidth={2} />
            <text x={x(st.position)} y={YHAT - 30} fill={brand.inkSoft} fontSize={9} textAnchor="middle">{st.name}</text>
          </g>
        ))}

        {/* Trenler */}
        {trenler.map((tr) => (
          <g key={`tr${tr.index}`} transform={`translate(${x(tr.s)},${YHAT})`}>
            <circle r={8} fill={brand.ink} stroke={brand.surface} strokeWidth={2} />
            <text x={0} y={3.5} fill="#fff" fontSize={9} fontWeight={700} textAnchor="middle">{tr.index + 1}</text>
          </g>
        ))}

        {/* Saat + hatta tren */}
        <g transform="translate(14,22)">
          <rect x={-6} y={-15} width={90} height={22} rx={4} fill={brand.ink} />
          <text x={39} y={1} fill="#fff" fontSize={13} fontWeight={700} textAnchor="middle" className="font-mono">{saat(t)}</text>
        </g>
        <text x={VBW - 12} y={20} fill={brand.muted} fontSize={11} textAnchor="end">Hatta {trenler.length} tren</text>
      </svg>
      )}

      {/* Oynatma kontrolleri */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={oynatDurdur} className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90" style={{ background: brand.red }}>
          {oynat ? "⏸ Duraklat" : t >= T ? "↻ Baştan" : "▶ Oynat"}
        </button>
        <div className="flex items-center gap-1">
          {HIZLAR.map((h) => (
            <button key={h} onClick={() => setHiz(h)} className="rounded px-2 py-1 text-xs font-medium transition"
              style={hiz === h ? { background: brand.ink, color: "#fff" } : { background: "#EDF0F3", color: brand.inkSoft }}>
              {h}×
            </button>
          ))}
        </div>
        <input type="range" min={0} max={T} step={0.5} value={t} onChange={(e) => { setOynat(false); setT(parseFloat(e.target.value)); }}
          className="min-w-[160px] flex-1" style={{ accentColor: brand.red }} aria-label="Zaman çubuğu" />
        <span className="font-mono text-xs" style={{ color: brand.muted }}>{saat(t)} / {saat(T)}</span>
      </div>

      {/* Sefer parametreleri */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm" style={{ color: brand.inkSoft }}>
          <span className="flex justify-between"><span>Sefer aralığı (headway)</span><span className="font-mono" style={{ color: brand.ink }}>{sure(headway)}</span></span>
          <input type="range" min={30} max={300} step={10} value={headway} onChange={(e) => setHeadway(parseInt(e.target.value))} style={{ accentColor: brand.red }} />
        </label>
        <label className="flex flex-col gap-1 text-sm" style={{ color: brand.inkSoft }}>
          <span className="flex justify-between"><span>Tren sayısı</span><span className="font-mono" style={{ color: brand.ink }}>{count}</span></span>
          <input type="range" min={1} max={16} step={1} value={count} onChange={(e) => setCount(parseInt(e.target.value))} style={{ accentColor: brand.red }} />
        </label>
      </div>

      {/* Metrikler + darboğaz */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric ad="Tek tren süresi" deger={stat(sonuc.baseTime)} />
        <Metric ad="Gerçekleşen headway" deger={stat(sonuc.achievedHeadway)} vurgu={sonuc.achievedHeadway > headway + 5} />
        <Metric ad="Kapasite (min headway)" deger={stat(sonuc.kapasiteHeadway)} />
        <Metric ad="Kapasite (tren/saat)" deger={sonuc.throughput.toFixed(1)} />
      </div>

      {/* Darboğaz kartı */}
      {sonuc.darbogaz && (
        <div className="rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: brand.surface, borderColor: sonuc.darbogaz.tur === "makas" ? "#0E7C57" : brand.red }}>
          <div className="font-medium" style={{ color: brand.ink }}>
            Darboğaz: {sonuc.darbogaz.tur === "makas" ? "Makas anklaşmanı" : "Blok + durak aralığı"} — {sonuc.darbogaz.ad}
          </div>
          <div className="mt-0.5" style={{ color: brand.muted }}>{sonuc.darbogaz.aciklama}</div>
          {sonuc.achievedHeadway > headway + 5 && (
            <div className="mt-1 font-medium" style={{ color: brand.red }}>
              ⚠ Talep edilen {sure(headway)} sürdürülemiyor → sistem {sure(sonuc.kapasiteHeadway)} aralığa doyuyor.
            </div>
          )}
        </div>
      )}

      {/* Makas bölgesi tablosu */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs" style={{ color: brand.inkSoft }}>
          <thead>
            <tr style={{ color: brand.muted }}>
              <th className="py-1 pr-3 font-medium">Makas bölgesi</th>
              <th className="py-1 pr-3 font-medium">Tip</th>
              <th className="py-1 pr-3 font-medium">Anlık aspekt</th>
              <th className="py-1 pr-3 font-medium">Geçiş</th>
              <th className="py-1 pr-3 font-medium">Çevrim</th>
              <th className="py-1 pr-3 font-medium">Meşguliyet</th>
            </tr>
          </thead>
          <tbody>
            {sonuc.zoneStats.map((z) => {
              const faz = fazAt(sonuc.zoneTimeline[z.id], t);
              return (
                <tr key={z.id} className="border-t" style={{ borderColor: brand.border }}>
                  <td className="py-1 pr-3">{z.ad}</td>
                  <td className="py-1 pr-3">{z.tip}</td>
                  <td className="py-1 pr-3">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FAZ_RENK[faz] }} />
                      {FAZ_AD[faz]}
                    </span>
                  </td>
                  <td className="py-1 pr-3 font-mono">{z.gecisSayisi}</td>
                  <td className="py-1 pr-3 font-mono">{sure(z.dongu)}</td>
                  <td className="py-1 pr-3 font-mono">%{(z.mesguliyet * 100).toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: brand.muted }}>
        <span style={{ color: brand.ink }}>●</span> tren · <span style={{ color: brand.red }}>▬</span> işgal blok ·
        makas bandı: <span style={{ color: FAZ_RENK.tanzim }}>■</span> tanzim · <span style={{ color: FAZ_RENK.kilitli }}>■</span> kurulu · <span style={{ color: FAZ_RENK.release }}>■</span> release.
        Ring hücreleri tek koridora zincirlendi; makaslar gerçek interlocking ile kilitlenir.
      </p>
      </div>
    </div>
  );
}

function Metric({ ad, deger, vurgu }: { ad: string; deger: string; vurgu?: boolean }) {
  return (
    <div className="rounded-md px-3 py-2" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
      <div className="text-[0.65rem] uppercase tracking-wide" style={{ color: brand.muted }}>{ad}</div>
      <div className="font-mono text-lg font-semibold" style={{ color: vurgu ? brand.red : brand.ink }}>{deger}</div>
    </div>
  );
}
