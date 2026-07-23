// aslanray — enerji & güç analizi (Faz 2).
//
// Enerji dengesi (adım adım): çekiş işi − fren işi = ΔKinetik + direnç işi + eğim işi.
//   rhs = ΔKE + W_direnç + W_eğim
//   rhs > 0 → çekiş işi (W_tr);  rhs < 0 → fren işi (W_br)
// Şebeke enerjisi = W_tr / çekiş_verimi ; rejeneratif geri kazanım = W_br × regen_verimi.
// Yardımcı (iç/hotel) yük süre boyunca eklenir.

import type { Line, RollingStock, SimResult } from "./types";

const G = 9.81;
const EFF_TR = 0.85; // çekiş zinciri verimi
const EFF_REGEN = 0.3; // rejeneratif frenle geri kazanılan oran
const AUX_W = 15000; // yardımcı yük (aydınlatma/iklim), W

function segAt(line: Line, s: number) {
  for (const seg of line.segments) if (s >= seg.start && s < seg.end) return seg;
  return line.segments[line.segments.length - 1];
}

export interface EnergyResult {
  tractionKWh: number;
  regenKWh: number;
  auxKWh: number;
  netKWh: number;
  perKm: number; // net kWh/km
}

export function computeEnergy(line: Line, stock: RollingStock, result: SimResult): EnergyResult {
  const meff = stock.mass * (1 + stock.rotatingMassFactor);
  let Wtr = 0;
  let Wbr = 0;
  const pts = result.points;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const ds = p1.s - p0.s;
    if (ds <= 1e-6) continue; // durakta bekleme → hareket yok
    const vmid = (p0.v + p1.v) / 2;
    const seg = segAt(line, p0.s);
    const dKE = 0.5 * meff * (p1.v * p1.v - p0.v * p0.v);
    const Wres = (stock.davisA + stock.davisB * vmid + stock.davisC * vmid * vmid) * ds;
    const Wgrav = stock.mass * G * (seg.gradient / 1000) * ds;
    const rhs = dKE + Wres + Wgrav;
    if (rhs > 0) Wtr += rhs;
    else Wbr += -rhs;
  }
  const J = 3.6e6; // 1 kWh
  const tractionKWh = Wtr / EFF_TR / J;
  const regenKWh = (Wbr * EFF_REGEN) / J;
  const auxKWh = (AUX_W * result.totalTime) / J;
  const netKWh = tractionKWh - regenKWh + auxKWh;
  return { tractionKWh, regenKWh, auxKWh, netKWh, perKm: netKWh / (line.length / 1000) };
}
