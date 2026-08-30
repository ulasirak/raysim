// raysim — GÜN İÇİ SERVİS PROFİLİ (parklanma / depoya giriş-çıkış).
//
// Gerçek işletmede filo gün boyu sabit değildir: pik saatte tüm filo hatta,
// pik-dışında bir kısmı DEPOYA döner (mola/parklanma), gece hepsi depoda bekler.
// Bu modül saatlik "hatta kaç tren / depoda kaç tren" profilini üretir; depo
// kapasitesi bunu barındırabiliyor mu kontrol eder.

import type { Isletme } from "./config";

export interface ServisSaat {
  saat: number;     // 0..23
  serviste: number; // hatta çalışan tren
  depoda: number;   // depoda bekleyen tren
  pik: boolean;     // pik saati mi?
  aktif: boolean;   // servis saatleri içinde mi?
}

export interface ServisProfil {
  saatler: ServisSaat[];
  toplamFilo: number;         // en yüksek filo (pik) = toplam araç
  maxDepoda: number;          // en fazla aynı anda depoda bekleyen (genelde gece)
  depoKapasiteToplam: number; // 0 = sınırsız
  kapasiteYeterli: boolean;
}

function saatToNum(s: string): number {
  const [h, m] = (s || "").split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m : 0) / 60;
}

export function servisProfili(isletme: Isletme, depoKapasiteToplam = 0): ServisProfil {
  const sb = saatToNum(isletme.servisBas);
  const se = saatToNum(isletme.servisBit); // 24:00 → 24
  const psb = saatToNum(isletme.pikSabahBas), pse = saatToNum(isletme.pikSabahBit);
  const pab = saatToNum(isletme.pikAksamBas), pae = saatToNum(isletme.pikAksamBit);
  const pik = Math.max(0, isletme.pikFilo);
  const pdisi = Math.max(0, isletme.pikDisiFilo);
  // Toplam filo MANUEL (= gece depoda bekleyen en fazla araç); serviste olanlar ondan çıkar.
  const toplamFilo = Math.max(isletme.toplamFilo || 0, pik, pdisi);

  const saatler: ServisSaat[] = [];
  for (let h = 0; h < 24; h++) {
    const aktif = sb < se ? h >= sb && h < se : h >= sb || h < se - 24; // gündüz servis / gece kapalı
    const pikMi = aktif && ((h >= psb && h < pse) || (h >= pab && h < pae));
    const serviste = aktif ? (pikMi ? pik : pdisi) : 0;
    saatler.push({ saat: h, serviste, depoda: Math.max(0, toplamFilo - serviste), pik: pikMi, aktif });
  }
  const maxDepoda = Math.max(toplamFilo, ...saatler.map((s) => s.depoda));
  return {
    saatler,
    toplamFilo,
    maxDepoda,
    depoKapasiteToplam,
    kapasiteYeterli: depoKapasiteToplam <= 0 || depoKapasiteToplam >= maxDepoda,
  };
}
