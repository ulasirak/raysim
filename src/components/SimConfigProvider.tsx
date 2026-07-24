"use client";

// raysim — paylaşılan PROJE DURUMU context'i (ÇOK KİRACILI).
//
// Tüm modüller aynı kaynaktan okur: `useSimConfig()` → sayısal parametreler,
// `useProje()` → hat (ring dizisi) + künye, `useHesap()` → oturum + proje yönetimi.
// Böylece o an hangi hesabın hangi projesi aktifse, YEDİ MODÜLÜN TAMAMI tek bir
// hatta hizmet eder.
//
// Depolama üç kademeli:
//   • Giriş yapmış kullanıcı → Firestore `projeler/{id}` (kiracı izolasyonu
//     güvenlik kurallarıyla), değişiklikler geciktirmeli (debounce) otomatik kaydedilir.
//   • Salt-okunur paylaşım linki (?proje=<id>) → o proje yalnız görüntülenir.
//   • Giriş yok → demo hattı (tohum), SALT OKUNUR; hiçbir yere yazılmaz.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { varsayilanConfig, varsayilanMeta, type SimConfig, type ProjeMeta } from "@/lib/anaray/config";
import { konya2EtapSeed, type DurakArasiRing } from "@/lib/anaray/ring";
import { useAuth } from "@/components/AuthProvider";
import {
  projeleriListele, projeOlustur, projeGetir, projeKaydet, projeSil,
  projeAdiDegistir, paylasimAyarla, type ProjeOzet, type ProjeVerisi,
} from "@/lib/projeler";

// Eski (tek kullanıcılı) yerel taslak anahtarları — yalnız İLK projeye taşımak için okunur.
const ESKI_CFG = "raysim_simconfig_v1";
const ESKI_RING = "raysim_rings_v3";
const ESKI_META = "raysim_projemeta_v2";
const AKTIF_ANAHTAR = (uid: string) => `raysim_aktif_proje_${uid}`;

export type KayitDurumu = "yukleniyor" | "hazir" | "kaydediliyor" | "kaydedildi" | "hata";

interface Ctx {
  cfg: SimConfig;
  patch: (p: Partial<SimConfig>) => void;
  sifirla: () => void;
  rings: DurakArasiRing[];
  setRings: React.Dispatch<React.SetStateAction<DurakArasiRing[]>>;
  sifirlaRings: () => void;
  meta: ProjeMeta;
  patchMeta: (p: Partial<ProjeMeta>) => void;
  // — hesap / proje —
  yazilabilir: boolean;
  demoMu: boolean;
  paylasimGorunumu: boolean;
  durum: KayitDurumu;
  hataMetni: string | null;
  projeler: ProjeOzet[];
  aktifId: string | null;
  aktifAd: string;
  paylasimAcik: boolean;
  projeSec: (id: string) => void;
  projeYeni: (ad: string) => Promise<void>;
  projeSilmeIstegi: (id: string) => Promise<void>;
  projeAdiGuncelle: (ad: string) => Promise<void>;
  paylasimDegistir: (acik: boolean) => Promise<void>;
}

const SimConfigCtx = createContext<Ctx | null>(null);

function seedRings(): DurakArasiRing[] {
  return konya2EtapSeed().rings;
}

// İlk giriş kurulumu kilidi (uid → süren oluşturma sözü). React geliştirme
// modunda effect'ler iki kez koşar; kilit olmadan aynı kullanıcıya İKİ proje
// açılırdı. Modül düzeyinde tutulur ki yeniden bağlanmalarda da paylaşılsın.
const ilkKurulum = new Map<string, Promise<string>>();

/** Tarayıcıda kalmış tek kullanıcılı taslak (varsa) — ilk projeye taşınır. */
function eskiYerelTaslak(): ProjeVerisi | null {
  try {
    const hr = localStorage.getItem(ESKI_RING);
    if (!hr) return null;
    const rings = JSON.parse(hr) as DurakArasiRing[];
    if (!Array.isArray(rings) || rings.length === 0) return null;
    const hc = localStorage.getItem(ESKI_CFG);
    const hm = localStorage.getItem(ESKI_META);
    return {
      rings,
      cfg: { ...varsayilanConfig, ...(hc ? (JSON.parse(hc) as Partial<SimConfig>) : {}) },
      meta: { ...varsayilanMeta, ...(hm ? (JSON.parse(hm) as Partial<ProjeMeta>) : {}) },
    };
  } catch {
    return null;
  }
}

function demoVerisi(): ProjeVerisi {
  return { rings: seedRings(), cfg: varsayilanConfig, meta: varsayilanMeta };
}

export function SimConfigProvider({ children }: { children: React.ReactNode }) {
  const { user, hazir: authHazir } = useAuth();

  const [cfg, setCfg] = useState<SimConfig>(varsayilanConfig);
  const [rings, setRingsRaw] = useState<DurakArasiRing[]>(seedRings);
  const [meta, setMeta] = useState<ProjeMeta>(varsayilanMeta);

  const [projeler, setProjeler] = useState<ProjeOzet[]>([]);
  const [aktifId, setAktifId] = useState<string | null>(null);
  const [aktifAd, setAktifAd] = useState<string>("Demo hattı");
  const [paylasimAcik, setPaylasimAcik] = useState(false);
  const [paylasimId, setPaylasimId] = useState<string | null>(null);
  const [durum, setDurum] = useState<KayitDurumu>("yukleniyor");
  const [hataMetni, setHataMetni] = useState<string | null>(null);

  // Otomatik kayıt kontrolü: yükleme sırasında tetiklenmesin diye son yazılan
  // içeriğin imzası tutulur; yalnız gerçek değişiklikte kaydedilir.
  const imzaRef = useRef<string>("");
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paylasimGorunumu = paylasimId !== null;
  const demoMu = !paylasimGorunumu && !user;
  const yazilabilir = Boolean(user) && !paylasimGorunumu && aktifId !== null;

  const veriUygula = useCallback((v: ProjeVerisi) => {
    setRingsRaw(v.rings);
    setCfg({ ...varsayilanConfig, ...v.cfg });
    setMeta({ ...varsayilanMeta, ...v.meta });
    imzaRef.current = JSON.stringify(v);
  }, []);

  // 1) Paylaşım linki (?proje=<id>) — yalnız istemcide okunur (hydration güvenli).
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("proje");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (id) setPaylasimId(id);
    } catch { /* sessiz */ }
  }, []);

  // 2) Aktif veriyi yükle: paylaşım linki > kullanıcı projesi > demo
  useEffect(() => {
    if (!authHazir) return;
    let iptal = false;

    const calistir = async () => {
      setDurum("yukleniyor");
      setHataMetni(null);
      try {
        if (paylasimId) {
          const p = await projeGetir(paylasimId);
          if (iptal) return;
          veriUygula(p.veri);
          setAktifAd(p.ad);
          setPaylasimAcik(p.paylasimAcik);
          setDurum("hazir");
          return;
        }

        if (!user) {
          if (iptal) return;
          veriUygula(demoVerisi());
          setProjeler([]);
          setAktifId(null);
          setAktifAd("Demo hattı");
          setDurum("hazir");
          return;
        }

        const liste = await projeleriListele(user.uid);
        if (iptal) return;

        if (liste.length === 0) {
          // İlk giriş: tarayıcıdaki eski taslak varsa onu taşı, yoksa örnek hattı ver.
          const taslak = eskiYerelTaslak();
          let soz = ilkKurulum.get(user.uid);
          if (!soz) {
            soz = projeOlustur(
              user.uid,
              taslak ? "Taşınan taslak" : (varsayilanMeta.hatAdi || "İlk projem"),
              taslak ?? demoVerisi()
            );
            ilkKurulum.set(user.uid, soz);
          }
          const id = await soz;
          if (iptal) return;
          const yeni = await projeleriListele(user.uid);
          if (iptal) return;
          setProjeler(yeni);
          setAktifId(id);
          const p = await projeGetir(id);
          if (iptal) return;
          veriUygula(p.veri);
          setAktifAd(p.ad);
          setPaylasimAcik(p.paylasimAcik);
          setDurum("hazir");
          return;
        }

        setProjeler(liste);
        const kayitli = localStorage.getItem(AKTIF_ANAHTAR(user.uid));
        const secili = liste.find((p) => p.id === kayitli) ?? liste[0];
        setAktifId(secili.id);
        const p = await projeGetir(secili.id);
        if (iptal) return;
        veriUygula(p.veri);
        setAktifAd(p.ad);
        setPaylasimAcik(p.paylasimAcik);
        setDurum("hazir");
      } catch (e) {
        if (iptal) return;
        setHataMetni(e instanceof Error ? e.message : String(e));
        setDurum("hata");
      }
    };

    calistir();
    return () => { iptal = true; };
  }, [authHazir, user, paylasimId, veriUygula]);

  // 3) Otomatik kayıt (geciktirmeli) — yalnız yazılabilir durumda ve gerçek değişimde
  useEffect(() => {
    if (!yazilabilir || !aktifId || durum === "yukleniyor") return;
    const veri: ProjeVerisi = { rings, cfg, meta };
    const imza = JSON.stringify(veri);
    if (imza === imzaRef.current) return;

    if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
    zamanlayiciRef.current = setTimeout(async () => {
      try {
        setDurum("kaydediliyor");
        await projeKaydet(aktifId, veri);
        imzaRef.current = imza;
        setDurum("kaydedildi");
      } catch (e) {
        setHataMetni(e instanceof Error ? e.message : String(e));
        setDurum("hata");
      }
    }, 1200);

    return () => { if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current); };
  }, [rings, cfg, meta, yazilabilir, aktifId, durum]);

  // — yazma sarmalayıcıları —
  // Salt-okunur modda (demo / paylaşım linki) yazma SESSİZCE yok sayılır. Arayüz
  // tarafında ayrıca `SaltOkunurKalkan` girdileri kapatır; buradaki kontrol son
  // savunma hattıdır (bir bileşen kalkanın dışında kalırsa veri yine korunur).
  const setRings: React.Dispatch<React.SetStateAction<DurakArasiRing[]>> = useCallback((v) => {
    if (!yazilabilir) return;
    setRingsRaw((eski) => (typeof v === "function" ? (v as (p: DurakArasiRing[]) => DurakArasiRing[])(eski) : v));
  }, [yazilabilir]);

  const patch = useCallback((p: Partial<SimConfig>) => {
    if (!yazilabilir) return;
    setCfg((c) => ({ ...c, ...p }));
  }, [yazilabilir]);

  const sifirla = useCallback(() => {
    if (!yazilabilir) return;
    setCfg(varsayilanConfig);
  }, [yazilabilir]);

  const sifirlaRings = useCallback(() => {
    if (!yazilabilir) return;
    setRingsRaw(seedRings());
  }, [yazilabilir]);

  const patchMeta = useCallback((p: Partial<ProjeMeta>) => {
    if (!yazilabilir) return;
    setMeta((m) => ({ ...m, ...p }));
  }, [yazilabilir]);

  // — proje yönetimi —
  const projeSec = useCallback((id: string) => {
    if (!user) return;
    try { localStorage.setItem(AKTIF_ANAHTAR(user.uid), id); } catch { /* sessiz */ }
    setAktifId(id);
    setDurum("yukleniyor");
    projeGetir(id)
      .then((p) => {
        veriUygula(p.veri);
        setAktifAd(p.ad);
        setPaylasimAcik(p.paylasimAcik);
        setDurum("hazir");
      })
      .catch((e) => { setHataMetni(e instanceof Error ? e.message : String(e)); setDurum("hata"); });
  }, [user, veriUygula]);

  const projeYeni = useCallback(async (ad: string) => {
    if (!user) return;
    const id = await projeOlustur(user.uid, ad || "Yeni proje", demoVerisi());
    setProjeler(await projeleriListele(user.uid));
    projeSec(id);
  }, [user, projeSec]);

  const projeSilmeIstegi = useCallback(async (id: string) => {
    if (!user) return;
    await projeSil(id);
    const liste = await projeleriListele(user.uid);
    setProjeler(liste);
    if (id === aktifId) {
      if (liste.length > 0) projeSec(liste[0].id);
      else { setAktifId(null); veriUygula(demoVerisi()); setAktifAd("Demo hattı"); }
    }
  }, [user, aktifId, projeSec, veriUygula]);

  const projeAdiGuncelle = useCallback(async (ad: string) => {
    if (!user || !aktifId) return;
    await projeAdiDegistir(aktifId, ad);
    setAktifAd(ad);
    setProjeler(await projeleriListele(user.uid));
  }, [user, aktifId]);

  const paylasimDegistir = useCallback(async (acik: boolean) => {
    if (!user || !aktifId) return;
    await paylasimAyarla(aktifId, acik);
    setPaylasimAcik(acik);
    setProjeler(await projeleriListele(user.uid));
  }, [user, aktifId]);

  const deger = useMemo<Ctx>(() => ({
    cfg, patch, sifirla, rings, setRings, sifirlaRings, meta, patchMeta,
    yazilabilir, demoMu, paylasimGorunumu, durum, hataMetni,
    projeler, aktifId, aktifAd, paylasimAcik,
    projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle, paylasimDegistir,
  }), [
    cfg, patch, sifirla, rings, setRings, sifirlaRings, meta, patchMeta,
    yazilabilir, demoMu, paylasimGorunumu, durum, hataMetni,
    projeler, aktifId, aktifAd, paylasimAcik,
    projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle, paylasimDegistir,
  ]);

  return <SimConfigCtx.Provider value={deger}>{children}</SimConfigCtx.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(SimConfigCtx);
  if (!c) throw new Error("Context, SimConfigProvider içinde kullanılmalı");
  return c;
}

/** Sayısal simülasyon parametreleri. */
export function useSimConfig(): {
  cfg: SimConfig;
  patch: (p: Partial<SimConfig>) => void;
  sifirla: () => void;
  yazilabilir: boolean;
} {
  const { cfg, patch, sifirla, yazilabilir } = useCtx();
  return { cfg, patch, sifirla, yazilabilir };
}

/** Proje hattı (ring dizisi) + künye — aktif projenin tek kaynağı. */
export function useProje(): {
  rings: DurakArasiRing[];
  setRings: React.Dispatch<React.SetStateAction<DurakArasiRing[]>>;
  sifirlaRings: () => void;
  meta: ProjeMeta;
  patchMeta: (p: Partial<ProjeMeta>) => void;
  yazilabilir: boolean;
} {
  const { rings, setRings, sifirlaRings, meta, patchMeta, yazilabilir } = useCtx();
  return { rings, setRings, sifirlaRings, meta, patchMeta, yazilabilir };
}

/** Oturum + proje yönetimi (kabuk/başlık için). */
export function useHesap(): Omit<Ctx, "cfg" | "patch" | "sifirla" | "rings" | "setRings" | "sifirlaRings" | "meta" | "patchMeta"> {
  const c = useCtx();
  return {
    yazilabilir: c.yazilabilir, demoMu: c.demoMu, paylasimGorunumu: c.paylasimGorunumu,
    durum: c.durum, hataMetni: c.hataMetni, projeler: c.projeler, aktifId: c.aktifId,
    aktifAd: c.aktifAd, paylasimAcik: c.paylasimAcik, projeSec: c.projeSec,
    projeYeni: c.projeYeni, projeSilmeIstegi: c.projeSilmeIstegi,
    projeAdiGuncelle: c.projeAdiGuncelle, paylasimDegistir: c.paylasimDegistir,
  };
}
