"use client";

// raysim — paylaşılan PROJE DURUMU context'i.
// Tüm modüller aynı kaynaktan okur: `useSimConfig()` → sayısal parametreler,
// `useProje()` → hat (ring dizisi) + proje künyesi. Değişiklikler localStorage'a
// yazılır (oturumlar arası kalıcı) ve tüm modüllere + belge üreticiye anında
// yansır. Böylece herhangi bir karşı taraf hattını girer, her yerde tutarlı olur.

import { createContext, useContext, useEffect, useState } from "react";
import { varsayilanConfig, varsayilanMeta, type SimConfig, type ProjeMeta } from "@/lib/anaray/config";
import { ornekSeed, type DurakArasiRing } from "@/lib/anaray/ring";

const CFG_ANAHTAR = "raysim_simconfig_v1";
// v2: eski "Konya 2. Etap" örnek verisi jenerik seed'le değiştirildi → v1 kayıtları
// yok sayılır ki tarayıcıda kalan eski test verisi otomatik temizlensin.
const RING_ANAHTAR = "raysim_rings_v2";
const META_ANAHTAR = "raysim_projemeta_v1";

interface Ctx {
  cfg: SimConfig;
  patch: (p: Partial<SimConfig>) => void;
  sifirla: () => void;
  rings: DurakArasiRing[];
  setRings: React.Dispatch<React.SetStateAction<DurakArasiRing[]>>;
  sifirlaRings: () => void;
  meta: ProjeMeta;
  patchMeta: (p: Partial<ProjeMeta>) => void;
}

const SimConfigCtx = createContext<Ctx | null>(null);

function seedRings(): DurakArasiRing[] {
  return ornekSeed().rings;
}

export function SimConfigProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<SimConfig>(varsayilanConfig);
  const [rings, setRings] = useState<DurakArasiRing[]>(seedRings);
  const [meta, setMeta] = useState<ProjeMeta>(varsayilanMeta);

  // Kalıcı değerleri mount sonrası yükle (SSR ↔ ilk render tutarlı kalsın diye
  // başlangıç daima varsayılan; localStorage yalnız istemcide okunur).
  useEffect(() => {
    try {
      const hc = localStorage.getItem(CFG_ANAHTAR);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (hc) setCfg({ ...varsayilanConfig, ...(JSON.parse(hc) as Partial<SimConfig>) });
      const hr = localStorage.getItem(RING_ANAHTAR);
      if (hr) { const arr = JSON.parse(hr) as DurakArasiRing[]; if (Array.isArray(arr) && arr.length) setRings(arr); }
      const hm = localStorage.getItem(META_ANAHTAR);
      if (hm) setMeta({ ...varsayilanMeta, ...(JSON.parse(hm) as Partial<ProjeMeta>) });
    } catch {
      // bozuk kayıt → varsayılanla devam
    }
  }, []);

  // rings her değiştiğinde kalıcı yaz
  useEffect(() => {
    try { localStorage.setItem(RING_ANAHTAR, JSON.stringify(rings)); } catch { /* sessiz */ }
  }, [rings]);

  const patch = (p: Partial<SimConfig>) =>
    setCfg((c) => {
      const yeni = { ...c, ...p };
      try { localStorage.setItem(CFG_ANAHTAR, JSON.stringify(yeni)); } catch { /* sessiz */ }
      return yeni;
    });

  const sifirla = () => {
    try { localStorage.removeItem(CFG_ANAHTAR); } catch { /* sessiz */ }
    setCfg(varsayilanConfig);
  };

  const sifirlaRings = () => setRings(seedRings());

  const patchMeta = (p: Partial<ProjeMeta>) =>
    setMeta((m) => {
      const yeni = { ...m, ...p };
      try { localStorage.setItem(META_ANAHTAR, JSON.stringify(yeni)); } catch { /* sessiz */ }
      return yeni;
    });

  return (
    <SimConfigCtx.Provider value={{ cfg, patch, sifirla, rings, setRings, sifirlaRings, meta, patchMeta }}>
      {children}
    </SimConfigCtx.Provider>
  );
}

function useCtx(): Ctx {
  const c = useContext(SimConfigCtx);
  if (!c) throw new Error("Context, SimConfigProvider içinde kullanılmalı");
  return c;
}

/** Sayısal simülasyon parametreleri. */
export function useSimConfig(): { cfg: SimConfig; patch: (p: Partial<SimConfig>) => void; sifirla: () => void } {
  const { cfg, patch, sifirla } = useCtx();
  return { cfg, patch, sifirla };
}

/** Proje hattı (ring dizisi) + künye — paylaşılan tek kaynak. */
export function useProje(): {
  rings: DurakArasiRing[];
  setRings: React.Dispatch<React.SetStateAction<DurakArasiRing[]>>;
  sifirlaRings: () => void;
  meta: ProjeMeta;
  patchMeta: (p: Partial<ProjeMeta>) => void;
} {
  const { rings, setRings, sifirlaRings, meta, patchMeta } = useCtx();
  return { rings, setRings, sifirlaRings, meta, patchMeta };
}
