// İSTEMCİDEN gelen sim girdilerini (araç / cfg / işletme) GÜVENLİ aralığa kıskaçlayan
// paylaşımlı fail-safe katmanı. Rapor ve Karşılaştırma route'ları ortak kullanır.
//
// Neden: rapor/karşılaştırma sunucuda üretilir ve bedel düşülür; istemci bozuk/NaN/
// negatif/0 sayı yollarsa (a) 0-hız bandı hareket motorunu sonsuz döngüye kilitleyebilir,
// (b) NaN/negatif değer bedelli rapora sızabilir. Bu katman her sayısal alanı finite'e,
// tehlikeli alanları (hız/genişlik/headway/ivme/yavaşlama/kapasite) pozitif tabana çeker.

import { varsayilanArac } from "./vehicles";
import { varsayilanConfig, varsayilanIsletme, type SimConfig, type Isletme } from "./config";
import type { RollingStock } from "./types";

/**
 * Araç verisini güvenli aralığa kıskaçlar. Varsayılandan başlar; her sayısal alanı
 * `Number.isFinite` + makul alt/üst sınırla değiştirir. Bozuk/negatif/NaN girdi ne
 * simülasyonu kilitler ne de rapora NaN yazar.
 */
export function saglamArac(a: Partial<RollingStock> | undefined): RollingStock {
  const d = varsayilanArac;
  const n = (v: unknown, def: number, lo: number, hi: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
  };
  return {
    id: typeof a?.id === "string" ? a.id : d.id,
    name: typeof a?.name === "string" ? a.name : d.name,
    mass: n(a?.mass, d.mass, 1_000, 2_000_000),                       // kg
    rotatingMassFactor: n(a?.rotatingMassFactor, d.rotatingMassFactor, 0, 0.5),
    length: n(a?.length, d.length, 1, 1_000),                        // m
    maxSpeed: n(a?.maxSpeed, d.maxSpeed, 1, 150),                    // m/s (taban 1 → stall yok)
    startingTractiveEffort: n(a?.startingTractiveEffort, d.startingTractiveEffort, 1, 5_000_000), // N
    power: n(a?.power, d.power, 1_000, 50_000_000),                  // W
    maxBraking: n(a?.maxBraking, d.maxBraking, 0.1, 5),              // m/s²
    davisA: n(a?.davisA, d.davisA, 0, 1e7),
    davisB: n(a?.davisB, d.davisB, 0, 1e6),
    davisC: n(a?.davisC, d.davisC, 0, 1e5),
  };
}

/**
 * cfg'yi güvenli aralığa kıskaçlar. Her SAYISAL alan finite'e (değilse varsayılan),
 * string/bool alanlar yalnız aynı tipteyse geçer. Kritik alanlara alt sınır: hızlar/
 * genişlik/headway/ivme/yavaşlama > 0 (0-hız → loopYorunge stall'ı; NaN → rapora NaN),
 * dolulukTavani (0,2].
 */
export function saglamCfg(c: unknown): SimConfig {
  const d = varsayilanConfig as unknown as Record<string, unknown>;
  const src = (c && typeof c === "object") ? c as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(d)) {
    const dv = d[k];
    if (typeof dv === "number") { const x = Number(src[k]); out[k] = Number.isFinite(x) ? x : dv; }
    else out[k] = (typeof src[k] === typeof dv) ? src[k] : dv;
  }
  const taban = (k: string, min: number) => { if (!((out[k] as number) >= min)) out[k] = min; };
  taban("vAnahat", 0.5); taban("vSahasal", 0.5); taban("vMakas", 0.5); taban("vHemzemin", 0.5); taban("vAcil", 0.5);
  taban("kisitGenisligi", 1); taban("headway", 1); taban("ivme", 0.05); taban("yavaslama", 0.05);
  taban("ekartman", 0.5); taban("aYanalKonfor", 0.05);
  out.dolulukTavani = Math.min(2, (out.dolulukTavani as number) > 0 ? (out.dolulukTavani as number) : (d.dolulukTavani as number));
  return out as unknown as SimConfig;
}

/** Terminal alt-nesnesini kıskaçlar: her sayısal alan finite ≥ 0; tip/enum korunur. */
function saglamTerminal(t: unknown, def: Record<string, unknown>): Record<string, unknown> {
  const src = (t && typeof t === "object") ? t as Record<string, unknown> : {};
  const out: Record<string, unknown> = { ...def, ...src };
  for (const k of Object.keys(def)) {
    if (typeof def[k] === "number") { const x = Number(out[k]); out[k] = Number.isFinite(x) ? Math.max(0, x) : def[k]; }
  }
  return out;
}

/**
 * İşletme girdisini kıskaçlar. Varsayılan + istemci (opsiyonel alanlar — ör. istasyonYolcu
 * talep haritası — KORUNUR), sonra bilinen sayısal skalerler finite ≥ 0'a; aracYolcuKapasite
 * ≥ 1 (0'a bölme koruması); terminaller ayrıca kıskaçlanır. NaN mcMean* (expRand'da NaN
 * üretirdi) böylece nötrlenir.
 */
export function saglamIsletme(i: unknown): Isletme {
  const src = (i && typeof i === "object") ? i as Record<string, unknown> : {};
  const d = varsayilanIsletme as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d, ...src };
  for (const k of Object.keys(d)) {
    if (typeof d[k] === "number") { const x = Number(out[k]); out[k] = Number.isFinite(x) ? Math.max(0, x) : d[k]; }
  }
  if (!((out.aracYolcuKapasite as number) >= 1)) out.aracYolcuKapasite = d.aracYolcuKapasite;
  out.terminalBas = saglamTerminal(out.terminalBas, d.terminalBas as Record<string, unknown>);
  out.terminalSon = saglamTerminal(out.terminalSon, d.terminalSon as Record<string, unknown>);
  return out as unknown as Isletme;
}
