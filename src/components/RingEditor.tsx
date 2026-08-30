"use client";

// raysim — DURAK ARASI RİNG editörü.
// Her durak-arası hücrenin ZORUNLU şartları girilir/düzenlenir (mesafe, makas
// bölgeleri, hemzemin, tehlike noktaları). Her değişiklikte worst/best köşeleri,
// headway (240 s) uygunluğu, durak-çiftleri arası denge ve tren-sayısı
// darboğazı anında yeniden hesaplanır. Hücreler bir loop (kapalı hat) oluşturur.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RollingStock } from "@/lib/anaray/types";
import { useSimConfig, useProje, useArac, useIsletme } from "@/components/SimConfigProvider";
import { type SimConfig, type DonusTip, type TerminalConfig } from "@/lib/anaray/config";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { brand } from "@/lib/anaray/brand";
import { CK, SERI } from "@/lib/anaray/chartkit";
import { kmh, km, sure } from "@/lib/anaray/format";
import {
  MAKAS_TIP_AD,
  ringChallenge,
  ringDogrula,
  ringKisitDizisi,
  ringSenaryo,
  dengeOnerisi,
  tccGerekli,
  yeniHemzemin,
  yeniMakas,
  yeniTehlike,
  ringDuraklari,
  durakAdiDegistir,
  durakEkleBas,
  durakEkleSon,
  durakBol,
  durakSil,
  duraklardanHat,
  type DurakArasiRing,
  type HemzeminTip,
  type KisitTur,
  type MakasTip,
} from "@/lib/anaray/ring";
import { Num, Rozet, SubBaslik, MiniStat, Panel } from "@/components/RingUI";
import { KisitSeridi, EkleFormu, SeritEkleBtn, KisitRozet, MakasEkleMenu, type EkleTur } from "@/components/RingSerit";

const KMH = 1 / 3.6;
const OK = CK.good;

const DONUS_TIP_AD: Record<DonusTip, string> = {
  korTerminal: "Kör terminal (stub)",
  ciftPeron: "Çift peron + makas",
  dongu: "Balon döngü (loop)",
  makasliGecis: "Makaslı geçiş",
};

export function RingEditor() {
  const { cfg } = useSimConfig();
  const { rings, setRings, sifirlaRings, meta, yukleniyor, yazilabilir } = useProje();
  // Araç ve işletme parametreleri KALICI (projeye kayıtlı) — tek kaynak.
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  const patchTerminal = (uc: "terminalBas" | "terminalSon", p: Partial<TerminalConfig>) =>
    patchIsletme({ [uc]: { ...isletme[uc], ...p } });
  // Canlı maksimum tramvay kapasitesi (bottleneck) — inputların hemen altında geri besleme.
  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  const [acik, setAcik] = useState<Record<string, boolean>>(() => (rings[0] ? { [rings[0].id]: true } : {}));
  // Silme GERİ AL: silmeden ÖNCEKİ ring dizisini tutar; kullanıcı yanlışlıkla durak/
  // ring silerse tek tıkla geri döner. Zaman aşımında (araç çubuğu kalabalıklaşmasın)
  // temizlenir; başka bir silme yeni anlık görüntüyü yazar.
  const [geriAl, setGeriAl] = useState<DurakArasiRing[] | null>(null);
  const geriAlZaman = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silHatirla = (updater: (rs: DurakArasiRing[]) => DurakArasiRing[]) => {
    setGeriAl(rings); // silmeden önceki durumu sakla
    setRings(updater);
    if (geriAlZaman.current) clearTimeout(geriAlZaman.current);
    geriAlZaman.current = setTimeout(() => setGeriAl(null), 15000);
  };
  const geriAlUygula = () => {
    if (!geriAl) return;
    setRings(geriAl);
    setGeriAl(null);
    if (geriAlZaman.current) clearTimeout(geriAlZaman.current);
  };
  useEffect(() => () => { if (geriAlZaman.current) clearTimeout(geriAlZaman.current); }, []);

  const oneriler = useMemo(() => dengeOnerisi(rings, stock, cfg), [rings, stock, cfg]);
  const tumEksik = useMemo(() => rings.flatMap((r) => ringDogrula(r, cfg)), [rings, cfg]);
  // Durak zinciri (ring uçlarından türer) — üstteki hızlı durak editörü için.
  const duraklar = useMemo(() => ringDuraklari(rings), [rings]);
  // Durak ekleme yardımcı girdileri: hızlı kurulum (toplam+sayı), ekleme mesafesi,
  // ortaya bölme konumu (hangi ring + hangi metre).
  const [hizliToplam, setHizliToplam] = useState(6000);
  const [hizliSayi, setHizliSayi] = useState(7);
  const [ekMesafe, setEkMesafe] = useState(1000);
  const [bolRing, setBolRing] = useState<string | null>(null);
  const [bolKonum, setBolKonum] = useState(500);

  // Parklanma (depo) — durak i'nin deposu: origin (i=0) → ring0.fromDepot,
  // diğerleri → o durağa GELEN ring'in depot'u. (Eski Sefer editöründeki gibi durak satırında.)
  const depoDurum = (i: number) => (i === 0
    ? { on: !!rings[0]?.fromDepot, q: rings[0]?.fromQueued ?? 0 }
    : { on: !!rings[i - 1]?.depot, q: rings[i - 1]?.queued ?? 0 });
  const depoAyarla = (i: number, on: boolean) => {
    if (i === 0) { const r = rings[0]; if (r) patch(r.id, { fromDepot: on, fromQueued: on && !r.fromQueued ? 1 : r.fromQueued }); }
    else { const r = rings[i - 1]; if (r) patch(r.id, { depot: on, queued: on && !r.queued ? 1 : r.queued }); }
  };
  const depoQueued = (i: number, n: number) => {
    const q = Math.min(40, Math.max(0, Math.round(n))); // üst sınır: aşırı tren donmasın
    if (i === 0) { const r = rings[0]; if (r) patch(r.id, { fromQueued: q }); }
    else { const r = rings[i - 1]; if (r) patch(r.id, { queued: q }); }
  };

  // — güncelleyiciler —
  const patch = (id: string, p: Partial<DurakArasiRing>) =>
    setRings((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  // Dwell bileşenleri (kapı aç + yolcu + kapı kapa). dwell = toplam (yetkili, senkron).
  // Seed: bileşen yoksa mevcut dwell'i "yolcu değişimi"ne atar (toplam korunur).
  const dwellBilesen = (r: DurakArasiRing) => ({ ac: r.kapiAcma ?? 0, yolcu: r.yolcuDegisimi ?? r.dwell, kapa: r.kapiKapama ?? 0 });
  const patchDwell = (r: DurakArasiRing, alan: "ac" | "yolcu" | "kapa", v: number) => {
    const c = dwellBilesen(r);
    const n = { ...c, [alan]: Math.max(0, Math.round(v)) };
    patch(r.id, { kapiAcma: n.ac, yolcuDegisimi: n.yolcu, kapiKapama: n.kapa, dwell: n.ac + n.yolcu + n.kapa });
  };
  const patchMakas = (rid: string, mid: string, p: Partial<DurakArasiRing["makaslar"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: r.makaslar.map((m) => (m.id === mid ? { ...m, ...p } : m)) } : r)));
  const patchHz = (rid: string, hid: string, p: Partial<DurakArasiRing["hemzeminler"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: r.hemzeminler.map((h) => (h.id === hid ? { ...h, ...p } : h)) } : r)));
  const patchTn = (rid: string, tid: string, p: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: r.tehlikeNoktalari.map((t) => (t.id === tid ? { ...t, ...p } : t)) } : r)));

  const ringSil = (id: string) => silHatirla((rs) => rs.filter((r) => r.id !== id));
  const sifirla = () => {
    sifirlaRings();
    setAcik({});
  };

  // Durak/ring ekleme: yeni oluşan ring kart(lar)ını OTOMATİK AÇ (aksi halde katlı
  // gelir, kullanıcı şeridi/sürükle-taşıyı göremez) ve ilkine kaydır. Yeni ring'ler
  // = eski dizide olmayan id'ler (durakEkleBas/Son yeni id verir; durakBol iki yeni
  // id üretir). Tek jenerik yol — hatta özel hiçbir varsayım yok.
  const ekleUygula = (uret: (rs: DurakArasiRing[]) => DurakArasiRing[]) => {
    const yeni = uret(rings);
    const eskiIds = new Set(rings.map((r) => r.id));
    const yeniler = yeni.filter((r) => !eskiIds.has(r.id));
    setRings(yeni);
    if (yeniler.length) {
      setAcik((a) => { const n = { ...a }; yeniler.forEach((r) => { n[r.id] = true; }); return n; });
      requestAnimationFrame(() => document.getElementById(`ring-${yeniler[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  };

  // Deep-link: başka modülden `#ring-<id>` ankoruyla gelince o ring'i AÇ + kaydır.
  // (Sistem Merkezi blok teşhisi "→ Ringler'de düzelt" butonu bunu tetikler.)
  useEffect(() => {
    const acKaydir = () => {
      const m = window.location.hash.match(/^#ring-(.+)$/);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      if (!rings.some((r) => r.id === id)) return;
      setAcik((a) => ({ ...a, [id]: true }));
      // Kart açıldıktan (bir sonraki boya) sonra kaydır.
      requestAnimationFrame(() => document.getElementById(`ring-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    acKaydir();
    window.addEventListener("hashchange", acKaydir);
    return () => window.removeEventListener("hashchange", acKaydir);
  }, [rings]);

  // Ekleme fonksiyonları opsiyonel KONUM + EKSTRA parametre alır. Şeritten tıkla-
  // ekle akışı önce el kitabı varsayılanlı bir form açar, kullanıcı süre-etkileyen
  // alanları (motor süresi, route release, hız…) ayarlayınca bu ekstra ile ekler.
  const makasEkle = (rid: string, tip: MakasTip, konum?: number, ekstra?: Partial<DurakArasiRing["makaslar"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: [...r.makaslar, { ...yeniMakas(tip, konum ?? Math.round(r.uzunluk * 0.85)), ...ekstra }] } : r)));
  const makasSil = (rid: string, mid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, makaslar: r.makaslar.filter((m) => m.id !== mid) } : r)));
  const hzEkle = (rid: string, tip: HemzeminTip, konum?: number, ekstra?: Partial<DurakArasiRing["hemzeminler"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: [...r.hemzeminler, { ...yeniHemzemin(tip, konum ?? Math.round(r.uzunluk * 0.5)), ...ekstra }] } : r)));
  const hzSil = (rid: string, hid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, hemzeminler: r.hemzeminler.filter((h) => h.id !== hid) } : r)));
  const tnEkle = (rid: string, konum?: number, ekstra?: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: [...r.tehlikeNoktalari, { ...yeniTehlike(konum ?? Math.round(r.uzunluk * 0.7)), ...ekstra }] } : r)));
  const tnSil = (rid: string, tid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, tehlikeNoktalari: r.tehlikeNoktalari.filter((t) => t.id !== tid) } : r)));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Başlık */}
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">Durak Arası Ring Editörü — Gerçek-Hayat İşletim Hücreleri</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{meta.hatAdi || "Adsız Hat"} · Loop (Çevrim) Şartları</h1>
        </div>
        <button
          onClick={() => {
            if (rings.length > 0 && !confirm("Bu hattın tüm ringleri silinsin mi? (geri alınamaz)")) return;
            sifirla();
          }}
          className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
          🗑 Hattı temizle
        </button>
      </div>

      {/* MAKSİMUM TRAMVAY & TERMİNALLER — hat DAİMA çift hat gidiş-dönüş çalışır.
          Terminal dönüş şartları girilir → tek sonuç: bu hatta en fazla kaç tramvay.
          En az 2 durak olunca anlamlı; boş hatta gösterilmez. */}
      {duraklar.length >= 2 && (
        <div className="mt-4">
          <Panel baslik="Maksimum Tramvay Kapasitesi" aciklama="Hat çift hat, gidiş-dönüş çalışır (tramvay gider, döner, tekrar gider — sürekli çevrim). Terminal dönüş şartlarını gir; sistem bu hatta aynı anda en fazla kaç tramvayın sığacağını hesaplar. Darboğaz otomatik isimlenir.">
            {/* Terminal (dönüş) girdileri — iki uç */}
            <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["terminalBas", "terminalSon"] as const).map((uc) => {
                const t = isletme[uc];
                return (
                  <div key={uc} className="rounded-md border p-3" style={{ borderColor: brand.border }}>
                    <SubBaslik>{uc === "terminalBas" ? "Başlangıç terminali (dönüş)" : "Bitiş terminali (dönüş)"}</SubBaslik>
                    <label className="mt-2 block">
                      <span className="field-label">Dönüş tipi</span>
                      <select value={t.tip} onChange={(e) => patchTerminal(uc, { tip: e.target.value as DonusTip })}
                        className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                        {(Object.keys(DONUS_TIP_AD) as DonusTip[]).map((k) => (
                          <option key={k} value={k}>{DONUS_TIP_AD[k]}</option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <Num label="Peron sayısı" suffix="peron" step={1} max={6} value={t.peronSayisi}
                        onChange={(v) => patchTerminal(uc, { peronSayisi: Math.max(1, Math.round(v)) })} />
                      <Num label="Peron işgal süresi" suffix="s" step={5} value={t.peronIsgali}
                        onChange={(v) => patchTerminal(uc, { peronIsgali: Math.max(0, Math.round(v)) })} />
                      <Num label="Boğaz işgali" suffix="s" step={5} value={t.bogazIsgali}
                        onChange={(v) => patchTerminal(uc, { bogazIsgali: Math.max(0, Math.round(v)) })} />
                    </div>
                    <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                      Peron işgal süresi = varış + iniş/biniş + ters dönüş + kalkış temizleme (trenin peronu tuttuğu tam süre).
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: brand.inkSoft }}
                      title="Peronlar tek boğazı (lead/crossover) paylaşıyorsa peron sayısı artsa da ardışık trenler tek boğazdan geçer — boğaz işgali alt sınır olur.">
                      <input type="checkbox" checked={t.bogazPaylasimli}
                        onChange={(e) => patchTerminal(uc, { bogazPaylasimli: e.target.checked })} />
                      Peronlar tek boğazı (lead/crossover) paylaşıyor
                    </label>
                    {t.tip === "dongu" && (
                      <p className="mt-1 text-xs" style={{ color: brand.muted }}>Balon döngüde terminal kısıtı yok (dönüş ~0).</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Gerçekçilik: kalkış ölü zamanı (start-up lost time) */}
            <div className="mb-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Num label="Kalkış ölü zamanı (varsayılan)" suffix="s" step={1} max={30} value={isletme.kalkisOluZamaniSn}
                  onChange={(v) => patchIsletme({ kalkisOluZamaniSn: Math.max(0, Math.min(30, Math.round(v))) })} />
              </div>
              <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                Dwell/yeşil sonrası harekete geçme tepkisi (start-up lost time) — her durakta çevrime ve durak bloğunun minimum aralığına eklenir. Hat geneli varsayılan; her durak kendi değerini (aşağıda) girebilir.
              </p>
            </div>

            {/* TEK SONUÇ — bu hatta en fazla kaç tramvay */}
            {maks.gecerli && (
              <div className="rounded-md border-l-4 px-4 py-3" style={{ background: CK.goodBgSoft, borderColor: brand.ink }}>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <div>
                    <span className="text-3xl font-semibold" style={{ color: brand.ink }}>{maks.nTeorik}</span>
                    <span className="ml-1 text-xs" style={{ color: brand.muted }}>tramvay — teorik maksimum</span>
                  </div>
                  <div>
                    <span className="text-2xl font-semibold" style={{ color: OK }}>{maks.nSurdurulebilir}</span>
                    <span className="ml-1 text-xs" style={{ color: brand.muted }}>sürdürülebilir (UIC 406 tamponlu)</span>
                  </div>
                </div>
                <p className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                  Darboğaz: <b>{maks.baglayanAd}</b> · min. aralık {sure(maks.hMin)} · çevrim {sure(maks.cevrimSuresi)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {maks.kisitlar.map((k) => (
                    <span key={k.anahtar} title={k.aciklama}
                      className="rounded px-2 py-0.5 text-xs"
                      style={k.aktif
                        ? { background: brand.ink, color: "#fff" }
                        : { background: CK.goodBg, color: brand.inkSoft }}>
                      {k.ad}: {sure(k.headway)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Silme GERİ AL çubuğu — yanlış silinen durak/ring tek tıkla geri gelir. */}
      {geriAl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 px-4 py-2 text-sm" style={{ background: CK.amberBg, borderColor: CK.amber, color: brand.ink }}>
          <span>↩︎ Silme işlemi yapıldı. Yanlışlıkla mı? Geri alabilirsin.</span>
          <button onClick={geriAlUygula} className="shrink-0 rounded-md px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>
            ↺ Silmeyi geri al
          </button>
        </div>
      )}

      {/* DURAKLAR & MESAFELER — hattın GİRİŞ NOKTASI. Boş hatta da görünür: müşteri
          önce buradan durak/mesafe/hız girer, ring hücreleri buradan doğar. Detaylı
          hücre şartları (worst/best, makas, hemzemin, tehlike, depo) alttaki kartlarda.
          Yükleme sırasında gizli (aşağıdaki "Hat yükleniyor…" gösterilir). */}
      {!yukleniyor && (
        <div className="mt-4">
          <Panel baslik="Duraklar & Mesafeler" aciklama="Hattın başladığı yer: durakları ve aralarındaki mesafe/hızları buradan gir. Başa · ortaya · sona durak ekle, adları düzenle. Her durak-arası bir işletim hücresi (ring) oluşturur — detaylı şartlar aşağıdaki kartlarda. Değişiklikler anında kaydedilir.">
            {duraklar.length === 0 ? (
              <div className="rounded-md border-2 border-dashed px-6 py-6" style={{ borderColor: brand.border }}>
                <div className="text-center">
                  <div className="font-brand text-base font-semibold" style={{ color: brand.ink }}>Hattınız boş — buradan başlayın</div>
                  <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed" style={{ color: brand.muted }}>
                    <b>Toplam uzunluk + durak sayısı</b> gir → hat eşit bölünür; sonra adları ve mesafeleri tek tek düzenlersin.
                    (Tek tek de başlayabilirsin.)
                  </p>
                </div>
                {/* Hızlı kurulum: toplam + sayı → eşit böl */}
                <div className="mx-auto mt-4 flex max-w-md flex-wrap items-end justify-center gap-3">
                  <label className="block">
                    <span className="field-label">Toplam uzunluk</span>
                    <div className="mt-1 flex items-center gap-1">
                      <input type="number" min={100} step={100} value={hizliToplam} onChange={(e) => setHizliToplam(Math.max(100, parseFloat(e.target.value) || 0))}
                        className="w-24 rounded border px-2 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                      <span className="text-xs" style={{ color: brand.muted }}>m</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="field-label">Durak sayısı</span>
                    <input type="number" min={2} step={1} value={hizliSayi} onChange={(e) => setHizliSayi(Math.max(2, Math.round(parseFloat(e.target.value) || 2)))}
                      className="mt-1 w-20 rounded border px-2 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                  </label>
                  <button onClick={() => setRings(duraklardanHat(hizliToplam, hizliSayi))}
                    className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.red }}>
                    Hattı kur ({hizliSayi} durak · {Math.round(hizliToplam / Math.max(1, hizliSayi - 1))} m ara)
                  </button>
                </div>
                <div className="mt-3 text-center">
                  <button onClick={() => ekleUygula((rs) => durakEkleSon(rs))} className="text-xs underline" style={{ color: brand.muted }}>veya tek durak-arasıyla başla →</button>
                </div>
              </div>
            ) : (
            <>
            {/* Ekleme mesafesi + başa/sona ekle — yeni durak SEÇTİĞİN mesafeyle eklenir. */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
              <span className="text-xs font-medium" style={{ color: brand.inkSoft }}>Yeni durak mesafesi</span>
              <input type="number" min={50} step={50} value={ekMesafe} onChange={(e) => setEkMesafe(Math.max(50, parseFloat(e.target.value) || 0))}
                className="w-24 rounded border px-2 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>m</span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => ekleUygula((rs) => durakEkleBas(rs, ekMesafe))}
                  className="rounded-md border px-3 py-1 text-xs font-medium transition hover:bg-white" style={{ borderColor: brand.borderStrong, color: brand.ink }}>⇤ Başa ekle</button>
                <button onClick={() => ekleUygula((rs) => durakEkleSon(rs, ekMesafe))}
                  className="rounded-md border px-3 py-1 text-xs font-medium transition hover:bg-white" style={{ borderColor: brand.borderStrong, color: brand.ink }}>Sona ekle ⇥</button>
              </div>
            </div>
            <div className="flex flex-col">
              {duraklar.map((d, i) => (
                <div key={`durak-${i}`}>
                  {/* Durak satırı */}
                  <div className="flex items-center gap-2 rounded border px-2 py-1.5" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white" style={{ background: brand.ink }}>{i + 1}</span>
                    <input value={d.ad} onChange={(e) => setRings((rs) => durakAdiDegistir(rs, i, e.target.value))}
                      className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                    <span className="shrink-0 font-mono text-xs" style={{ color: brand.faint }} title="Hat başından uzaklık">{km(d.konum)} km</span>
                    {i > 0 && (
                      <div className="flex shrink-0 items-center gap-1" title="Bu durakta toplam bekleme (dwell) = kapı aç + yolcu + kapı kapa (aşağıdan düzenle)">
                        <span className="text-[0.65rem] font-medium" style={{ color: brand.inkSoft }}>bekleme</span>
                        <span className="text-xs font-semibold" style={{ color: brand.ink }}>{Math.round(rings[i - 1].dwell)}</span>
                        <span className="text-[0.65rem]" style={{ color: brand.muted }}>sn</span>
                      </div>
                    )}
                    {duraklar.length > 2 ? (
                      <button onClick={() => silHatirla((rs) => durakSil(rs, i))} title="Durağı sil (orta durak → komşu ringleri birleştirir)"
                        className="shrink-0 rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                    ) : (<span className="w-6 shrink-0" />)}
                  </div>
                  {/* Durak bekleme bileşenleri (dwell = kapı aç + yolcu + kapı kapa) + kalkış ölü zamanı */}
                  <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5 pl-2 text-[0.7rem]" style={{ color: brand.muted }}>
                    {i > 0 && (
                      <>
                        <span className="flex items-center gap-1" title="Kapı açma süresi (s)">kapı aç
                          <input type="number" min={0} step={1} value={Math.round(dwellBilesen(rings[i - 1]).ac)}
                            onChange={(e) => patchDwell(rings[i - 1], "ac", parseFloat(e.target.value) || 0)}
                            className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                        <span className="flex items-center gap-1" title="Yolcu değişimi / iniş-biniş süresi (s)">yolcu
                          <input type="number" min={0} step={1} value={Math.round(dwellBilesen(rings[i - 1]).yolcu)}
                            onChange={(e) => patchDwell(rings[i - 1], "yolcu", parseFloat(e.target.value) || 0)}
                            className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                        <span className="flex items-center gap-1" title="Kapı kapama süresi (s)">kapı kapa
                          <input type="number" min={0} step={1} value={Math.round(dwellBilesen(rings[i - 1]).kapa)}
                            onChange={(e) => patchDwell(rings[i - 1], "kapa", parseFloat(e.target.value) || 0)}
                            className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                      </>
                    )}
                    {i < rings.length && (
                      <span className="flex items-center gap-1" title="Bu duraktan kalkışta ölü zaman (start-up lost time, s). Hat geneli varsayılanı override eder.">
                        kalkış ölü
                        <input type="number" min={0} step={1} value={Math.round(rings[i].kalkisOlu ?? isletme.kalkisOluZamaniSn)}
                          onChange={(e) => patch(rings[i].id, { kalkisOlu: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> sn
                      </span>
                    )}
                  </div>
                  {/* Parklanma (depo) alanı — bu durakta çıkışa hazır bekleyen tren (Canlı Ağ besler) */}
                  <div className="ml-6 flex flex-wrap items-center gap-2 py-0.5 pl-2 text-xs">
                    <button onClick={() => depoAyarla(i, !depoDurum(i).on)}
                      className="rounded px-2 py-0.5 font-medium transition"
                      style={depoDurum(i).on ? { background: brand.ink, color: "#fff" } : { background: "transparent", color: brand.muted, border: `1px solid ${brand.border}` }}>
                      🅿 Parklanma
                    </button>
                    {depoDurum(i).on && (
                      <span className="flex items-center gap-1" style={{ color: brand.muted }}>
                        bekleyen
                        <input type="number" min={0} max={40} step={1} value={depoDurum(i).q} onChange={(e) => depoQueued(i, parseFloat(e.target.value) || 0)}
                          className="w-14 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> tren
                        {i === duraklar.length - 1 && <span style={{ color: CK.amber }} title="Hattın sonundaki depo gidiş yönünde tren veremez (gidecek yer yok)">⚠ uç</span>}
                      </span>
                    )}
                  </div>
                  {/* Durak-arası (ring i) — mesafe + hız + ortaya ekle */}
                  {i < rings.length && (
                    <div className="ml-6 flex flex-wrap items-center gap-2 py-1 pl-2 text-xs" style={{ color: brand.muted }}>
                      <span style={{ color: brand.faint }}>↓</span>
                      <span className="flex items-center gap-1">
                        mesafe
                        <input type="number" min={50} step={50} value={Math.round(rings[i].uzunluk)}
                          onChange={(e) => patch(rings[i].id, { uzunluk: Math.max(50, parseFloat(e.target.value) || 0) })}
                          className="w-20 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> m
                      </span>
                      <span className="flex items-center gap-1">
                        hız
                        <input type="number" min={5} step={5} value={Math.round(kmh(rings[i].vmax))}
                          onChange={(e) => patch(rings[i].id, { vmax: Math.max(5, parseFloat(e.target.value) || 0) * KMH })}
                          className="w-16 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> km/h
                      </span>
                      <label className="flex items-center gap-1" title="Bu kesim tek hatlı mı? (çift yön aynı hattı paylaşır → tek anda tek tren; maksimum treni düşürür)">
                        <input type="checkbox" checked={!!rings[i].tekHat}
                          onChange={(e) => patch(rings[i].id, { tekHat: e.target.checked })} />
                        <span style={{ color: rings[i].tekHat ? brand.red : brand.muted }}>tek hat</span>
                      </label>
                      {bolRing === rings[i].id ? (
                        <span className="flex items-center gap-1">
                          böl:
                          <input type="number" min={1} max={Math.max(1, Math.round(rings[i].uzunluk) - 1)} step={50} value={bolKonum}
                            onChange={(e) => setBolKonum(Math.max(1, parseFloat(e.target.value) || 1))}
                            className="w-16 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> m
                          <button onClick={() => { ekleUygula((rs) => durakBol(rs, i, bolKonum)); setBolRing(null); }}
                            className="rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: brand.ink }}>böl</button>
                          <button onClick={() => setBolRing(null)} className="rounded px-1" style={{ color: brand.muted }} title="Vazgeç">✕</button>
                        </span>
                      ) : (
                        <button onClick={() => { setBolRing(rings[i].id); setBolKonum(Math.round(rings[i].uzunluk / 2)); }}
                          title="Bu ringi seçtiğin konumda bölerek ortaya durak ekle (varsayılan: orta)"
                          className="rounded border px-2 py-0.5 font-medium transition hover:bg-slate-50" style={{ borderColor: brand.border, color: brand.ink }}>
                          ＋ ortaya durak
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            </>
            )}
          </Panel>
        </div>
      )}

      {/* Eksik şart uyarısı */}
      {tumEksik.length > 0 && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: brand.red, background: CK.badBgSoft }}>
          <div className="mb-1 text-sm font-semibold" style={{ color: brand.red }}>⚠ Zorunlu şartlar eksik — loop kurulamaz ({tumEksik.length})</div>
          <ul className="ml-4 list-disc text-xs" style={{ color: brand.inkSoft }}>
            {tumEksik.slice(0, 8).map((e, i) => (<li key={i}>{e.mesaj}</li>))}
            {tumEksik.length > 8 && <li>… ve {tumEksik.length - 8} tane daha</li>}
          </ul>
        </div>
      )}

      {/* Hat verisi yükleniyorken (girişli hesapta sayfa yenileme) rings henüz []'dir.
          "Hattınız boş / ring ekle" davetini burada göstermek, veri gelince kaybolan
          bir "aç-kapa" titremesine yol açıyordu; yükleme bitene kadar nötr bir yer
          tutucu gösterip gerçek boşluk kararını veriye bırakıyoruz. */}
      {yukleniyor && rings.length === 0 && (
        <div className="mt-6 rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm" style={{ borderColor: brand.border, color: brand.muted }}>
          ⟳ Hat yükleniyor…
        </div>
      )}


      {/* RİNG EDİTÖRÜ başlığı — alttaki kartlar durak zincirinin İLERİ şartlarıdır
          (worst/best köşeleri + makas/hemzemin/tehlike). Üst paneldan görsel olarak ayrık. */}
      {rings.length > 0 && (
        <div className="mt-8 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 pb-2" style={{ borderColor: brand.ink }}>
          <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>Ring Editörü</span>
          <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold" style={{ background: CK.badBgSoft, color: brand.red }}>{rings.length} hücre</span>
          <span className="text-xs" style={{ color: brand.muted }}>— her durak-arası hücrenin ileri şartları: worst/best köşeleri · makas · hemzemin · tehlike. Yukarıda kurduğun zinciri burada detaylandır.</span>
        </div>
      )}

      {/* Ring kartları — her biri `ring-<id>` ankoru taşır (Sistem Merkezi teşhis
          butonu buraya kaydırır); scroll-mt sticky nav altında kalmasını önler. */}
      <div className="flex flex-col gap-3">
        {rings.map((r, i) => (
          <div key={r.id} id={`ring-${r.id}`} className="scroll-mt-28">
          <RingKart
            ring={r}
            index={i}
            stock={stock}
            acik={!!acik[r.id]}
            cfg={cfg}
            sunum={!!meta.sunumModu}
            duzenlenebilir={yazilabilir}
            onToggle={() => setAcik((a) => ({ ...a, [r.id]: !a[r.id] }))}
            onPatch={(p) => patch(r.id, p)}
            onSil={() => ringSil(r.id)}
            onMakasEkle={(tip, konum, ekstra) => makasEkle(r.id, tip, konum, ekstra)}
            onMakasSil={(mid) => makasSil(r.id, mid)}
            onMakasPatch={(mid, p) => patchMakas(r.id, mid, p)}
            onHzEkle={(tip, konum, ekstra) => hzEkle(r.id, tip, konum, ekstra)}
            onHzSil={(hid) => hzSil(r.id, hid)}
            onHzPatch={(hid, p) => patchHz(r.id, hid, p)}
            onTnEkle={(konum, ekstra) => tnEkle(r.id, konum, ekstra)}
            onTnSil={(tid) => tnSil(r.id, tid)}
            onTnPatch={(tid, p) => patchTn(r.id, tid, p)}
          />
          </div>
        ))}
      </div>

      {/* Ring ekleme artık ÜSTTEKİ "Duraklar & Mesafeler" panelinden (durak zinciri) —
          tek ekleme yeri, çift buton karmaşası yok. */}

      {/* Eşit şartlar — durak-çiftleri dengeleme önerisi. Hattın ALTINDA: önce hattı
          gör/kur, sonra iyileştirme tavsiyesi (dolu hatta sayfa artık öneriyle açılmaz). */}
      {oneriler.length > 0 && !meta.sunumModu && (
        <div className="mt-6">
          <Panel baslik="Eşit Şartlar — Dengeleme Önerileri" aciklama="Best-case yakın-mesafe hedefi: durak-çiftleri arası worst-case süreler eşitlendikçe headway kararlı olur. Ortalamadan sapan ringler ve öneriler:">
            <div className="flex flex-col gap-1.5">
              {oneriler.map((o) => (
                <div key={o.ringId} className="flex items-start gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: o.fark > 0 ? brand.red + "55" : OK + "55", background: o.fark > 0 ? CK.badBgSoft : CK.goodBgSoft }}>
                  <span className="shrink-0 font-mono text-xs" style={{ color: o.fark > 0 ? brand.red : OK }}>{o.fark > 0 ? "+" : ""}{Math.round(o.fark)} s</span>
                  <span className="font-medium" style={{ color: brand.ink }}>{o.ad}:</span>
                  <span style={{ color: brand.inkSoft }}>{o.oneri}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <footer className="mt-10 border-t pt-4 text-xs" style={{ borderColor: brand.border, color: brand.faint }}>
        RaySim · Ring editörü — canlı parametreler (Sistem Merkezi&apos;nden): sahasal {kmh(cfg.vSahasal).toFixed(0)} · makas {kmh(cfg.vMakas).toFixed(0)} · hemzemin {kmh(cfg.vHemzemin).toFixed(0)} km/h · a={cfg.ivme} b={cfg.yavaslama} m/s² · headway {cfg.headway} s
      </footer>
    </div>
  );
}

// ————————————————————————————————————————————————
// Ring kartı
// ————————————————————————————————————————————————

interface KartProps {
  ring: DurakArasiRing;
  index: number;
  stock: RollingStock;
  acik: boolean;
  cfg: SimConfig;
  /** Sunum modu: ring kartındaki "Challenge (zorluk senaryosu)" listesi gizlenir. */
  sunum: boolean;
  onToggle: () => void;
  onPatch: (p: Partial<DurakArasiRing>) => void;
  onSil: () => void;
  /** Salt-okunur (demo/paylaşım) modda false → şerit tıkla-ekle/sürükle kapalı. */
  duzenlenebilir: boolean;
  onMakasEkle: (tip: MakasTip, konum?: number, ekstra?: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onMakasSil: (mid: string) => void;
  onMakasPatch: (mid: string, p: Partial<DurakArasiRing["makaslar"][number]>) => void;
  onHzEkle: (tip: HemzeminTip, konum?: number, ekstra?: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onHzSil: (hid: string) => void;
  onHzPatch: (hid: string, p: Partial<DurakArasiRing["hemzeminler"][number]>) => void;
  onTnEkle: (konum?: number, ekstra?: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) => void;
  onTnSil: (tid: string) => void;
  onTnPatch: (tid: string, p: Partial<DurakArasiRing["tehlikeNoktalari"][number]>) => void;
}

function RingKart(p: KartProps) {
  const { ring, index, stock, cfg, sunum } = p;
  const eksik = useMemo(() => ringDogrula(ring, cfg), [ring, cfg]);
  const sen = useMemo(() => ringSenaryo(ring, stock, cfg), [ring, stock, cfg]);
  const challenge = useMemo(() => ringChallenge(ring, stock, cfg), [ring, stock, cfg]);
  const kisitlar = useMemo(() => ringKisitDizisi(ring), [ring]);
  const tam = eksik.length === 0;

  // Konum ↔ SÜRE dönüşümü (yaklaşık): trenin durak başından o noktaya varış
  // süresi. worst seyir süresini konuma orantılar (hızlanma/yavaşlama ihmalli,
  // "sürelendirme" göstergesi için yeterli). Çift yönlü: kullanıcı süre girince
  // konuma çevrilir, konum değişince süre türetilir.
  const konumSuresi = (konum: number) => (ring.uzunluk > 0 ? (konum / ring.uzunluk) * sen.worstSeyir : 0);
  const sureKonumu = (saniye: number) => (sen.worstSeyir > 0 ? Math.max(0, Math.min(ring.uzunluk, (saniye / sen.worstSeyir) * ring.uzunluk)) : 0);

  // Görsel şerit: ekleme modu + sürükle-taşı/tıkla-ekle köprüsü.
  const [ekleTuru, setEkleTuru] = useState<EkleTur | null>(null);
  // Şeride tıklanınca hemen eklemek yerine, süre-etkileyen parametreleri el kitabı
  // varsayılanıyla soran bir form açılır (bkz. EkleFormu).
  const [bekleyen, setBekleyen] = useState<{ tur: EkleTur; konum: number } | null>(null);
  const seritTasi = (tur: KisitTur, id: string, konum: number) => {
    if (!p.duzenlenebilir) return; // salt-okunur: sürükle-taşı kapalı
    if (tur === "makas") p.onMakasPatch(id, { konum });
    else if (tur === "hemzemin") p.onHzPatch(id, { konum });
    else p.onTnPatch(id, { konum });
  };
  const seritEkle = (konum: number) => {
    if (!p.duzenlenebilir || !ekleTuru) return; // salt-okunur: tıkla-ekle kapalı
    setBekleyen({ tur: ekleTuru, konum }); // form aç
    setEkleTuru(null);
  };
  const ekleOnayla = (konum: number, ekstra: Record<string, unknown>) => {
    if (!p.duzenlenebilir || !bekleyen) return;
    const t = bekleyen.tur;
    if (t.kind === "makas") p.onMakasEkle((ekstra.tip as MakasTip) ?? t.tip, konum, ekstra);
    else if (t.kind === "hemzemin") p.onHzEkle(t.tip, konum, ekstra);
    else p.onTnEkle(konum, ekstra);
    setBekleyen(null);
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: tam ? brand.border : brand.red, borderLeftWidth: 4, borderLeftColor: tam ? brand.gold : brand.red }}>
      {/* Başlık satırı — üstteki durak satırlarından AYRIK: kare "R#" rozet + altın kenar. */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: tam ? "#FBFCFD" : "#FDF2F4" }}>
        <span className="flex shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-bold" style={{ background: CK.badBgSoft, color: brand.red }}>R{index + 1}</span>
        <button onClick={p.onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate font-brand text-sm font-semibold" style={{ color: brand.ink }}>{ring.fromAd} → {ring.toAd}</div>
          <div className="text-xs" style={{ color: brand.muted }}>
            {Math.round(ring.uzunluk)} m · {ring.makaslar.length} makas · {ring.hemzeminler.length} hemzemin
          </div>
        </button>
        <Rozet ok={tam} okText="Şartlar tam" hataText={`${eksik.length} eksik`} />
        <span className="hidden shrink-0 text-xs sm:inline" style={{ color: sen.headwayUygun ? OK : brand.red }}>
          worst {sure(sen.worstToplam)} {sen.headwayUygun ? "≤" : ">"} {cfg.headway} s
        </span>
        <button onClick={p.onToggle} className="rounded px-1.5 text-sm" style={{ color: brand.muted }}>{p.acik ? "▾" : "▸"}</button>
        <button onClick={p.onSil} title="Ringi sil" aria-label="Ringi sil" className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
      </div>

      {p.acik && (
        <div className="border-t p-4" style={{ borderColor: brand.border }}>
          {/* Duraklar + mesafe köşeleri */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <SubBaslik>Mesafe Köşeleri (worst/best = en kötü/en iyi)</SubBaslik>
              <div className="mb-2 text-xs" style={{ color: brand.muted }}>
                <b style={{ color: brand.ink }}>{ring.fromAd} → {ring.toAd}</b> · nominal <b style={{ color: brand.ink }}>{Math.round(ring.uzunluk)} m</b>
                <div className="mt-0.5 text-[0.65rem]" style={{ color: brand.faint }}>Ad · mesafe · hız · bekleme · parklanma → üstteki <b>“Duraklar &amp; Mesafeler”</b> panelinde. Burada yalnız worst/best köşeleri + kısıtlar.</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Best-case (en iyi) mesafe" suffix="m" step={50} value={ring.bestUzunluk} onChange={(v) => p.onPatch({ bestUzunluk: v })} />
                <Num label="Worst-case (en kötü) mesafe" suffix="m" step={50} value={ring.worstUzunluk} onChange={(v) => p.onPatch({ worstUzunluk: v })} />
              </div>
            </div>

            {/* Senaryo çıktısı */}
            <div>
              <SubBaslik>Senaryo Çıktısı</SubBaslik>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat etiket="Worst seyir" deger={sure(sen.worstSeyir)} alt="1500 m + kısıtlar" />
                <MiniStat etiket="Best seyir" deger={sure(sen.bestSeyir)} alt="yakın mesafe" />
                <MiniStat etiket="Makas/route ek" deger={`${sen.timingEk.toFixed(0)} s`} alt="tanzim + release" />
                <MiniStat etiket="Worst toplam" deger={sure(sen.worstToplam)} alt="+ bekleme" vurgu={sen.headwayUygun ? OK : brand.red} />
              </div>
              <div className="mt-2 rounded border p-2.5 text-xs" style={{ borderColor: sen.headwayUygun ? OK : brand.red, background: sen.headwayUygun ? CK.goodBgSoft : CK.badBgSoft }}>
                {sen.headwayUygun ? (
                  <span style={{ color: OK }}>✓ {cfg.headway} s headway&apos;e sığıyor — <b>{Math.round(sen.headwayPayi)} s</b> marj.</span>
                ) : (
                  <span style={{ color: brand.red }}>⚠ {cfg.headway} s headway ihlali — <b>{Math.round(-sen.headwayPayi)} s</b> aşım. Mesafeyi kısalt veya kısıtları azalt.</span>
                )}
              </div>
            </div>
          </div>

          {/* Kısıtlar arası mesafe + GÖRSEL ZAMAN/MESAFE ŞERİDİ */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SubBaslik>Kısıtlar & Zaman/Mesafe Şeridi</SubBaslik>
              {/* Şeride ekleme modu — bir tür seç, sonra şeride tıkla */}
              <div className="flex flex-wrap gap-1 text-[0.7rem]">
                <SeritEkleBtn aktif={ekleTuru?.kind === "makas"} renk={SERI.makasBlok}
                  onClick={() => setEkleTuru((e) => (e?.kind === "makas" ? null : { kind: "makas", tip: "headway" }))}>＋ makas</SeritEkleBtn>
                <SeritEkleBtn aktif={ekleTuru?.kind === "hemzemin" && ekleTuru.tip === "yaya"} renk={SERI.duzBlok}
                  onClick={() => setEkleTuru((e) => (e?.kind === "hemzemin" && e.tip === "yaya" ? null : { kind: "hemzemin", tip: "yaya" }))}>＋ yaya</SeritEkleBtn>
                <SeritEkleBtn aktif={ekleTuru?.kind === "hemzemin" && ekleTuru.tip === "karayolu"} renk={SERI.duzBlok}
                  onClick={() => setEkleTuru((e) => (e?.kind === "hemzemin" && e.tip === "karayolu" ? null : { kind: "hemzemin", tip: "karayolu" }))}>＋ karayolu</SeritEkleBtn>
                <SeritEkleBtn aktif={ekleTuru?.kind === "tehlike"} renk={brand.red}
                  onClick={() => setEkleTuru((e) => (e?.kind === "tehlike" ? null : { kind: "tehlike" }))}>＋ acil fren</SeritEkleBtn>
              </div>
            </div>

            <KisitSeridi ring={ring} kisitlar={kisitlar} konumSuresi={konumSuresi}
              onTasi={seritTasi} ekleTuru={ekleTuru} onSeritEkle={seritEkle} />

            {/* Ekleme parametre formu — süre-etkileyen alanlar el kitabı değeriyle ön-dolu */}
            {bekleyen && (
              <EkleFormu
                tur={bekleyen.tur}
                konum={bekleyen.konum}
                uzunluk={ring.uzunluk}
                konumSuresi={konumSuresi}
                sureKonumu={sureKonumu}
                onIptal={() => setBekleyen(null)}
                onEkle={ekleOnayla}
              />
            )}

            {kisitlar.length === 0 ? (
              <p className="mt-6 text-xs" style={{ color: brand.faint }}>Ringde makas/hemzemin/tehlike kısıtı yok — kesintisiz seyir. Yukarıdan bir tür seçip şeride tıklayarak ekleyin.</p>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-1 text-[0.7rem]">
                <KisitRozet tur="durak" ad={ring.fromAd} konum={0} />
                {kisitlar.map((k, i) => (
                  <span key={k.id} className="flex items-center gap-1">
                    <span className="font-mono" style={{ color: brand.faint }}>
                      —{Math.round(k.konum - (i === 0 ? 0 : kisitlar[i - 1].konum))}m→
                    </span>
                    <KisitRozet tur={k.tur} ad={k.ad} konum={k.konum} detay={k.detay} />
                  </span>
                ))}
                <span className="font-mono" style={{ color: brand.faint }}>—{Math.round(ring.uzunluk - kisitlar[kisitlar.length - 1].konum)}m→</span>
                <KisitRozet tur="durak" ad={ring.toAd} konum={ring.uzunluk} />
              </div>
            )}
          </div>

          {/* Challenge (karşılaşılabilecek zorluklar) — sunum modunda gizli */}
          {challenge.length > 0 && !sunum && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
              <SubBaslik>Challenge (zorluk senaryosu) — Karşılaşılabilecek Durumlar</SubBaslik>
              <div className="mt-2 flex flex-col gap-1.5">
                {challenge.map((c, i) => {
                  const renk = c.seviye === "kritik" ? brand.red : c.seviye === "uyari" ? CK.amber : brand.muted;
                  return (
                    <div key={i} className="flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs" style={{ borderColor: renk + "55", background: renk + "0F" }}>
                      <span className="shrink-0 font-medium" style={{ color: renk }}>{c.seviye === "kritik" ? "⚠" : c.seviye === "uyari" ? "▲" : "•"} {c.baslik}:</span>
                      <span style={{ color: brand.inkSoft }}>{c.mesaj}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Makas bölgeleri */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <SubBaslik>Makas Bölgeleri (zorunlu şart)</SubBaslik>
              <MakasEkleMenu onEkle={p.onMakasEkle} />
            </div>
            {ring.makaslar.length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Bu ringde makas bölgesi yok. Varsa yukarıdan ekleyin (konum + tip + 15 km/h geçiş zorunlu).</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ring.makaslar.map((m) => {
                  const konumHatali = m.konum < 0 || m.konum > ring.uzunluk;
                  const tccHatali = tccGerekli(m.tip) && !m.tccZorunlu;
                  return (
                    <div key={m.id} className="rounded border p-2" style={{ borderColor: konumHatali || tccHatali ? brand.red : brand.border }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={m.tip} onChange={(e) => { const tip = e.target.value as MakasTip; p.onMakasPatch(m.id, { tip, tccZorunlu: tccGerekli(tip), routeRelease: tip === "depo" ? cfg.routeReleaseDepo : cfg.routeReleaseAnahat }); }}
                          className="rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }}>
                          {(Object.keys(MAKAS_TIP_AD) as MakasTip[]).map((t) => (<option key={t} value={t}>{MAKAS_TIP_AD[t]}</option>))}
                        </select>
                        <input value={m.ad} placeholder="ad (ör. 1. Makas)" onChange={(e) => p.onMakasPatch(m.id, { ad: e.target.value })}
                          className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                        <button onClick={() => p.onMakasSil(m.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                        <Num label="Konum" suffix="m" step={10} value={m.konum} onChange={(v) => p.onMakasPatch(m.id, { konum: v })} hata={konumHatali} />
                        <Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(m.konum))} onChange={(v) => p.onMakasPatch(m.id, { konum: Math.round(sureKonumu(v)) })} />
                        <Num label="Geçiş hızı" suffix="km/h" step={1} value={Math.round(kmh(m.gecisHizi))} onChange={(v) => p.onMakasPatch(m.id, { gecisHizi: v * KMH })} />
                        <Num label="Makas sayısı" suffix="ad" step={1} value={m.makasSayisi} onChange={(v) => p.onMakasPatch(m.id, { makasSayisi: Math.max(1, Math.round(v)) })} />
                        <Num label="Adım süresi" suffix="s" step={1} value={m.makasAdimSuresi} onChange={(v) => p.onMakasPatch(m.id, { makasAdimSuresi: v })} />
                        <Num label="Route release" suffix="s" step={1} value={m.routeRelease} onChange={(v) => p.onMakasPatch(m.id, { routeRelease: v })} />
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: tccHatali ? brand.red : brand.inkSoft }}>
                        <input type="checkbox" checked={m.tccZorunlu} onChange={(e) => p.onMakasPatch(m.id, { tccZorunlu: e.target.checked })} />
                        Her geçişte TCC onayı {tccGerekli(m.tip) && <span style={{ color: brand.red }}>(bu tip için zorunlu)</span>}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hemzemin / yaya geçitleri */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <SubBaslik>Hemzemin & Yaya Geçitleri</SubBaslik>
              <div className="flex gap-1">
                <button onClick={() => p.onHzEkle("yaya")} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ yaya</button>
                <button onClick={() => p.onHzEkle("karayolu")} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ karayolu</button>
              </div>
            </div>
            {ring.hemzeminler.length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Hemzemin/yaya geçidi yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ring.hemzeminler.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-2 rounded border p-2" style={{ borderColor: brand.border }}>
                    <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium" style={{ background: h.tip === "yaya" ? "#EAF2FB" : "#FBF0EA", color: brand.inkSoft }}>{h.tip}</span>
                    <input value={h.ad} placeholder="ad" onChange={(e) => p.onHzPatch(h.id, { ad: e.target.value })}
                      className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                    <div className="w-20"><Num label="Konum" suffix="m" step={10} value={h.konum} onChange={(v) => p.onHzPatch(h.id, { konum: v })} hata={h.konum < 0 || h.konum > ring.uzunluk} /></div>
                    <div className="w-20"><Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(h.konum))} onChange={(v) => p.onHzPatch(h.id, { konum: Math.round(sureKonumu(v)) })} /></div>
                    <div className="w-20"><Num label="Hız" suffix="km/h" step={1} value={Math.round(kmh(h.hiz))} onChange={(v) => p.onHzPatch(h.id, { hiz: v * KMH })} /></div>
                    <button onClick={() => p.onHzSil(h.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tehlike / acil frenleme noktaları */}
          <div className="mt-4 border-t pt-3" style={{ borderColor: brand.border }}>
            <div className="mb-2 flex items-center justify-between">
              <SubBaslik>Tehlike / Acil Frenleme Noktaları</SubBaslik>
              <button onClick={() => p.onTnEkle()} className="rounded px-2 py-1 text-xs font-medium" style={{ background: CK.track, color: brand.inkSoft }}>＋ ekle</button>
            </div>
            {ring.tehlikeNoktalari.length === 0 ? (
              <p className="text-xs" style={{ color: brand.faint }}>Tehlike noktası yok.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ring.tehlikeNoktalari.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border p-2" style={{ borderColor: brand.border }}>
                    <input value={t.ad} placeholder="ad" onChange={(e) => p.onTnPatch(t.id, { ad: e.target.value })}
                      className="w-32 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                    <input value={t.aciklama} placeholder="açıklama" onChange={(e) => p.onTnPatch(t.id, { aciklama: e.target.value })}
                      className="min-w-0 flex-1 rounded border px-1.5 py-1 text-xs" style={{ borderColor: brand.border, color: brand.ink }} />
                    <div className="w-20"><Num label="Konum" suffix="m" step={10} value={t.konum} onChange={(v) => p.onTnPatch(t.id, { konum: v })} hata={t.konum < 0 || t.konum > ring.uzunluk} /></div>
                    <div className="w-20"><Num label="Süre (≈)" suffix="s" step={1} value={Math.round(konumSuresi(t.konum))} onChange={(v) => p.onTnPatch(t.id, { konum: Math.round(sureKonumu(v)) })} /></div>
                    <div className="w-20"><Num label="Acil hız" suffix="km/h" step={1} value={Math.round(kmh(t.hiz))} onChange={(v) => p.onTnPatch(t.id, { hiz: v * KMH })} /></div>
                    <button onClick={() => p.onTnSil(t.id)} className="rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Eksik listesi */}
          {eksik.length > 0 && (
            <ul className="mt-3 ml-4 list-disc text-xs" style={{ color: brand.red }}>
              {eksik.map((e, i) => (<li key={i}>{e.mesaj}</li>))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
