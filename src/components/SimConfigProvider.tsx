"use client";

// raysim — paylaşılan PROJE DURUMU context'i (ÇOK KİRACILI).
//
// Tüm modüller aynı kaynaktan okur: `useSimConfig()` → sayısal parametreler,
// `useProje()` → hat (ring dizisi) + künye, `useHesap()` → oturum + proje yönetimi.
// Böylece o an hangi hesabın hangi projesi aktifse, YEDİ MODÜLÜN TAMAMI tek bir
// hatta hizmet eder.
//
// Depolama iki kademeli:
//   • Giriş yapmış kullanıcı → Firestore `projeler/{id}` (kiracı izolasyonu
//     güvenlik kurallarıyla), değişiklikler geciktirmeli (debounce) otomatik kaydedilir.
//   • Salt-okunur paylaşım linki (?proje=<id>) → o proje yalnız görüntülenir.
// Giriş yoksa içerik YOKTUR: `Kapi` bileşeni giriş/kayıt ekranını gösterir.
//
// İLK HAT TOHUMU: yönetici hesabı vitrin hattını (Konya Tramvay 2. Etap taslağı)
// hazır bulur; başka her hesap SIFIRDAN BOŞ hatla başlar ve kendi verisini girer.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { varsayilanConfig, varsayilanMeta, konyaMeta, type SimConfig, type ProjeMeta } from "@/lib/anaray/config";
import { konya2EtapSeed, type DurakArasiRing } from "@/lib/anaray/ring";
import { yoneticiMi } from "@/lib/anaray/yetki";
import { useAuth } from "@/components/AuthProvider";
import {
  projeleriListele, projeOlustur, ilkProjeOlustur, projeGetir, projeKaydet, projeSil,
  projeAdiDegistir, paylasimAyarla, veriBoyutu,
  PROJE_KOTASI, VERI_BAYT_SINIRI, type ProjeOzet, type ProjeVerisi,
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
  /** Bu hesap vitrin (Konya) hattının sahibi mi? Yalnız tohum/etiket kararı. */
  yonetici: boolean;
  demoMu: boolean;
  paylasimGorunumu: boolean;
  /** Paylaşım (salt-okunur) görünümünden çıkıp kendi hattına döner. */
  paylasimdanCik: () => void;
  durum: KayitDurumu;
  hataMetni: string | null;
  projeler: ProjeOzet[];
  aktifId: string | null;
  aktifAd: string;
  paylasimAcik: boolean;
  /** Hesap başına hat sınırı; `null` = sınırsız (yönetici). */
  kota: number | null;
  /** Kota dolduysa `projeYeni` reddeder — arayüz düğmeyi kapatmalı. */
  kotaDoldu: boolean;
  projeSec: (id: string) => void;
  projeYeni: (ad: string) => Promise<void>;
  projeSilmeIstegi: (id: string) => Promise<void>;
  projeAdiGuncelle: (ad: string) => Promise<void>;
  paylasimDegistir: (acik: boolean) => Promise<void>;
}

const SimConfigCtx = createContext<Ctx | null>(null);

function vitrinRings(): DurakArasiRing[] {
  return konya2EtapSeed().rings;
}

// İlk giriş kurulumu kilidi (uid → süren oluşturma sözü). Aynı sayfa yüklemesi
// içinde effect iki kez koşarsa ikinci çağrı aynı sözü bekler.
// DİKKAT: bu kilit yalnız TEK bir JS bağlamını korur — kayıt sonrası sayfa
// yenilenince sıfırlanır. Asıl güvence `ilkProjeOlustur`un uid'den türettiği
// SABİT doküman kimliğidir; iki ayrı bağlam bile aynı dokümanda birleşir.
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

/** Sıfırdan başlayan hesap: hat BOŞ, künye nötr. Kullanıcı kendi verisini girer. */
function bosVeri(): ProjeVerisi {
  return { rings: [], cfg: varsayilanConfig, meta: varsayilanMeta };
}

/** Yönetici vitrini: Konya Tramvay 2. Etap taslağı hazır gelir. */
function vitrinVerisi(): ProjeVerisi {
  return { rings: vitrinRings(), cfg: varsayilanConfig, meta: konyaMeta };
}

export function SimConfigProvider({ children }: { children: React.ReactNode }) {
  const { user, hazir: authHazir } = useAuth();

  const yonetici = yoneticiMi(user?.email);

  const [cfg, setCfg] = useState<SimConfig>(varsayilanConfig);
  // Başlangıç BOŞ: hiçbir hat, oturum çözülmeden ekrana düşmez.
  const [rings, setRingsRaw] = useState<DurakArasiRing[]>([]);
  const [meta, setMeta] = useState<ProjeMeta>(varsayilanMeta);

  const [projeler, setProjeler] = useState<ProjeOzet[]>([]);
  const [aktifId, setAktifId] = useState<string | null>(null);
  const [aktifAd, setAktifAd] = useState<string>("—");
  const [paylasimAcik, setPaylasimAcik] = useState(false);
  const [paylasimId, setPaylasimId] = useState<string | null>(null);
  const [durum, setDurum] = useState<KayitDurumu>("yukleniyor");
  const [hataMetni, setHataMetni] = useState<string | null>(null);

  // Otomatik kayıt kontrolü: yükleme sırasında tetiklenmesin diye son yazılan
  // içeriğin imzası tutulur; yalnız gerçek değişiklikte kaydedilir.
  const imzaRef = useRef<string>("");
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // BAYATLIK JETONU. Her yükleme isteği (ilk açılış effect'i VE hat değiştirme)
  // bir numara alır; asenkron sonuç döndüğünde numara hâlâ güncel değilse
  // yazılmaz. Olmadığında hızlı hat değiştirmede A'nın verisi B aktifken
  // uygulanıyor, ardından otomatik kayıt A'yı B'nin ÜSTÜNE yazıyordu.
  const yuklemeRef = useRef(0);
  const yeniJeton = () => ++yuklemeRef.current;
  const guncelMi = (jeton: number) => yuklemeRef.current === jeton;

  const paylasimGorunumu = paylasimId !== null;
  const demoMu = !paylasimGorunumu && !user;
  const yazilabilir = Boolean(user) && !paylasimGorunumu && aktifId !== null;

  const veriUygula = useCallback((v: ProjeVerisi) => {
    setRingsRaw(v.rings);
    setCfg({ ...varsayilanConfig, ...v.cfg });
    setMeta({ ...varsayilanMeta, ...v.meta });
    imzaRef.current = JSON.stringify(v);
  }, []);

  // Paylaşım görünümünden çıkış. ADRESTEKİ `?proje=` DE SİLİNİR: aksi halde
  // istemci-içi gezinme sağlayıcıyı yeniden kurmadığı için kullanıcı salt-okunur
  // görünümde kilitli kalıyordu (Link ile "/" demek yetmiyor).
  const paylasimdanCik = useCallback(() => {
    setPaylasimId(null);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("proje")) {
        u.searchParams.delete("proje");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch { /* sessiz */ }
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
    const jeton = yeniJeton();
    // Effect iptal edilmiş VEYA arada daha yeni bir yükleme başlamışsa yazma.
    const bayat = () => iptal || !guncelMi(jeton);

    const calistir = async () => {
      setDurum("yukleniyor");
      setHataMetni(null);
      try {
        if (paylasimId) {
          const p = await projeGetir(paylasimId);
          if (bayat()) return;
          // Kendi projesinin linkini açan SAHİP misafir sayılmaz: salt-okunur
          // görünümden çıkılır ve normal (yazılabilir) akış devreye girer.
          if (user && p.sahipUid === user.uid) {
            paylasimdanCik();
            return;
          }
          veriUygula(p.veri);
          setAktifAd(p.ad);
          setPaylasimAcik(p.paylasimAcik);
          setDurum("hazir");
          return;
        }

        if (!user) {
          // Giriş yok → hiçbir hat gösterilmez (Kapi giriş ekranını açar).
          if (bayat()) return;
          veriUygula(bosVeri());
          setProjeler([]);
          setAktifId(null);
          setAktifAd("—");
          setDurum("hazir");
          return;
        }

        const liste = await projeleriListele(user.uid);
        if (bayat()) return;

        if (liste.length === 0) {
          // İlk giriş. Yönetici → vitrin hattı (varsa tarayıcıdaki eski taslağı taşı).
          // Diğer herkes → SIFIRDAN boş hat; verisini kendisi girer.
          const taslak = yonetici ? eskiYerelTaslak() : null;
          const ilkVeri = taslak ?? (yonetici ? vitrinVerisi() : bosVeri());
          const ilkAd = taslak
            ? "Taşınan taslak"
            : yonetici
              ? konyaMeta.hatAdi
              : "İlk hattım";
          let soz = ilkKurulum.get(user.uid);
          if (!soz) {
            // Sabit kimlik (`ilk_<uid>`): eşzamanlı iki deneme tek dokümanda birleşir.
            soz = ilkProjeOlustur(user.uid, ilkAd, ilkVeri);
            // Başarısızsa kilidi bırak, sonraki deneme yeniden kurabilsin.
            soz.catch(() => ilkKurulum.delete(user.uid));
            ilkKurulum.set(user.uid, soz);
          }
          const id = await soz;
          if (bayat()) return;
          const yeni = await projeleriListele(user.uid);
          if (bayat()) return;
          setProjeler(yeni);
          setAktifId(id);
          const p = await projeGetir(id);
          if (bayat()) return;
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
        if (bayat()) return;
        veriUygula(p.veri);
        setAktifAd(p.ad);
        setPaylasimAcik(p.paylasimAcik);
        setDurum("hazir");
      } catch (e) {
        if (bayat()) return;
        setHataMetni(e instanceof Error ? e.message : String(e));
        setDurum("hata");
      }
    };

    calistir();
    return () => { iptal = true; };
  }, [authHazir, user, yonetici, paylasimId, veriUygula, paylasimdanCik]);

  // 3) Otomatik kayıt (geciktirmeli) — yalnız yazılabilir durumda ve gerçek değişimde
  useEffect(() => {
    if (!yazilabilir || !aktifId || durum === "yukleniyor") return;
    const veri: ProjeVerisi = { rings, cfg, meta };
    const imza = JSON.stringify(veri);
    if (imza === imzaRef.current) return;

    // Kaydın ait olduğu yükleme. Bekleme sırasında hat değişirse yazılmaz —
    // aksi halde eski hattın verisi yenisinin üstüne giderdi.
    const jeton = yuklemeRef.current;

    if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
    zamanlayiciRef.current = setTimeout(async () => {
      if (!guncelMi(jeton)) return;
      // Firestore kuralı 900 000 baytta reddediyor; ham "permission-denied"
      // yerine ne olduğunu söyleyen bir mesaj göster.
      const bayt = veriBoyutu(imza);
      if (bayt > VERI_BAYT_SINIRI) {
        setHataMetni(
          `Hat verisi çok büyük (${Math.round(bayt / 1024)} KB, sınır ${Math.round(VERI_BAYT_SINIRI / 1024)} KB) — kaydedilmedi. Ring sayısını azaltın veya hattı ikiye bölün.`,
        );
        setDurum("hata");
        return;
      }
      try {
        setDurum("kaydediliyor");
        await projeKaydet(aktifId, veri);
        if (!guncelMi(jeton)) return;
        imzaRef.current = imza;
        setDurum("kaydedildi");
      } catch (e) {
        if (!guncelMi(jeton)) return;
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

  // "Sıfırla": yöneticide vitrin hattına döner, diğer hesaplarda hattı BOŞALTIR
  // (kimseye başka bir projenin verisi tohumlanmaz).
  const sifirlaRings = useCallback(() => {
    if (!yazilabilir) return;
    setRingsRaw(yonetici ? vitrinRings() : []);
  }, [yazilabilir, yonetici]);

  const patchMeta = useCallback((p: Partial<ProjeMeta>) => {
    if (!yazilabilir) return;
    setMeta((m) => ({ ...m, ...p }));
  }, [yazilabilir]);

  // — proje yönetimi —
  // Yazma işlemlerinin ORTAK sarmalayıcısı. Öncesinde eski hatayı temizler,
  // hata olursa çubukta görünür kılar ve çağırana yeniden fırlatır. Bu olmadan
  // oluşturma/silme/paylaşım hataları (kural reddi, ağ kopması) sessizce yutuluyordu.
  const islem = useCallback(async <T,>(f: () => Promise<T>): Promise<T> => {
    setHataMetni(null);
    try {
      return await f();
    } catch (e) {
      setHataMetni(e instanceof Error ? e.message : String(e));
      setDurum("hata");
      throw e;
    }
  }, []);

  const projeSec = useCallback((id: string) => {
    if (!user) return;
    try { localStorage.setItem(AKTIF_ANAHTAR(user.uid), id); } catch { /* sessiz */ }
    const jeton = yeniJeton(); // bu seçimden sonra başlayan bir yükleme bunu geçersiz kılar
    setAktifId(id);
    setDurum("yukleniyor");
    setHataMetni(null);
    projeGetir(id)
      .then((p) => {
        if (!guncelMi(jeton)) return; // arada başka bir hatta geçildi — yazma
        veriUygula(p.veri);
        setAktifAd(p.ad);
        setPaylasimAcik(p.paylasimAcik);
        setDurum("hazir");
      })
      .catch((e) => {
        if (!guncelMi(jeton)) return;
        setHataMetni(e instanceof Error ? e.message : String(e));
        setDurum("hata");
      });
  }, [user, veriUygula]);

  const kota = yonetici ? null : PROJE_KOTASI;
  const kotaDoldu = kota !== null && projeler.length >= kota;

  // Yeni hat her zaman BOŞ açılır (yönetici dahil) — mevcut hat kopyalanmaz.
  const projeYeni = useCallback(async (ad: string) => {
    if (!user) return;
    await islem(async () => {
      // Kota SUNUCUDAKİ sayıya göre denetlenir: ekrandaki liste bayat olabilir
      // (başka sekmede hat açılmış olabilir).
      const mevcut = await projeleriListele(user.uid);
      if (kota !== null && mevcut.length >= kota) {
        setProjeler(mevcut);
        throw new Error(`Hat kotanız dolu (${mevcut.length}/${kota}). Yeni hat açmak için önce bir hattı silin.`);
      }
      const id = await projeOlustur(user.uid, ad || "Yeni hat", bosVeri());
      setProjeler(await projeleriListele(user.uid));
      projeSec(id);
    });
  }, [user, kota, islem, projeSec]);

  const projeSilmeIstegi = useCallback(async (id: string) => {
    if (!user) return;
    await islem(async () => {
      await projeSil(id);
      const liste = await projeleriListele(user.uid);
      setProjeler(liste);
      if (id === aktifId) {
        if (liste.length > 0) projeSec(liste[0].id);
        else {
          yeniJeton(); // süren bir yükleme varsa geçersiz kıl
          setAktifId(null);
          veriUygula(bosVeri());
          setAktifAd("—");
          setDurum("hazir");
        }
      }
    });
  }, [user, aktifId, islem, projeSec, veriUygula]);

  const projeAdiGuncelle = useCallback(async (ad: string) => {
    if (!user || !aktifId) return;
    await islem(async () => {
      await projeAdiDegistir(aktifId, ad);
      setAktifAd(ad);
      setProjeler(await projeleriListele(user.uid));
    });
  }, [user, aktifId, islem]);

  const paylasimDegistir = useCallback(async (acik: boolean) => {
    if (!user || !aktifId) return;
    await islem(async () => {
      await paylasimAyarla(aktifId, acik);
      setPaylasimAcik(acik);
      setProjeler(await projeleriListele(user.uid));
    });
  }, [user, aktifId, islem]);

  const deger = useMemo<Ctx>(() => ({
    cfg, patch, sifirla, rings, setRings, sifirlaRings, meta, patchMeta,
    yazilabilir, yonetici, demoMu, paylasimGorunumu, paylasimdanCik, durum, hataMetni,
    projeler, aktifId, aktifAd, paylasimAcik, kota, kotaDoldu,
    projeSec, projeYeni, projeSilmeIstegi, projeAdiGuncelle, paylasimDegistir,
  }), [
    cfg, patch, sifirla, rings, setRings, sifirlaRings, meta, patchMeta,
    yazilabilir, yonetici, demoMu, paylasimGorunumu, paylasimdanCik, durum, hataMetni,
    projeler, aktifId, aktifAd, paylasimAcik, kota, kotaDoldu,
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
  yonetici: boolean;
} {
  const { rings, setRings, sifirlaRings, meta, patchMeta, yazilabilir, yonetici } = useCtx();
  return { rings, setRings, sifirlaRings, meta, patchMeta, yazilabilir, yonetici };
}

/** Oturum + proje yönetimi (kabuk/başlık için). */
export function useHesap(): Omit<Ctx, "cfg" | "patch" | "sifirla" | "rings" | "setRings" | "sifirlaRings" | "meta" | "patchMeta"> {
  const c = useCtx();
  return {
    yazilabilir: c.yazilabilir, yonetici: c.yonetici, demoMu: c.demoMu, paylasimGorunumu: c.paylasimGorunumu,
    paylasimdanCik: c.paylasimdanCik,
    durum: c.durum, hataMetni: c.hataMetni, projeler: c.projeler, aktifId: c.aktifId,
    aktifAd: c.aktifAd, paylasimAcik: c.paylasimAcik, kota: c.kota, kotaDoldu: c.kotaDoldu,
    projeSec: c.projeSec,
    projeYeni: c.projeYeni, projeSilmeIstegi: c.projeSilmeIstegi,
    projeAdiGuncelle: c.projeAdiGuncelle, paylasimDegistir: c.paylasimDegistir,
  };
}
