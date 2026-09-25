"use client";

// raysim — DURAK ARASI RİNG editörü.
// Her durak-arası hücrenin ZORUNLU şartları girilir/düzenlenir (mesafe, makas
// bölgeleri, hemzemin, tehlike noktaları). Her değişiklikte worst/best köşeleri,
// headway (240 s) uygunluğu, durak-çiftleri arası denge ve tren-sayısı
// darboğazı anında yeniden hesaplanır. Hücreler bir loop (kapalı hat) oluşturur.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { useSimConfig, useProje, useArac, useIsletme, useHesap } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";
import { HatIceAktar, type IceAktarMod } from "@/components/HatIceAktar";
import { SubeEditor } from "@/components/SubeEditor";
import { etkinBogazIsgali, terminalDonusParalel, etkinPeronSayisi, terminalMakasSayilari, terminalSeriDonus, type DonusTip, type TerminalConfig } from "@/lib/anaray/config";
import { maksimumTren } from "@/lib/anaray/kapasite";
import { tersIsletmeAnaliz } from "@/lib/anaray/tersisletme";
import { yolcuAkisSuresi } from "@/lib/anaray/yolcu";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";
import { kmh, km, sure, indir } from "@/lib/anaray/format";
import { railmlIhrac } from "@/lib/anaray/railml";
import { gtfsIhrac, type GtfsDurakZaman } from "@/lib/anaray/gtfs";
import { ringDogrula, ringSenaryo, dengeOnerisi, yeniHemzemin, yeniMakas, yeniTehlike, yeniKurp, yeniSinyal, ringDuraklari, durakAdiDegistir, durakEkleBas, durakEkleSon, durakBol, durakSil, duraklardanHat, type DurakArasiRing, type SinyalLambasi, type HemzeminTip, type MakasTip, type Kurp } from "@/lib/anaray/ring";
import { Num, SubBaslik, Panel } from "@/components/RingUI";


import { KMH, OK, Kucuk } from "@/components/ringEditorOrtak";
import { RingKart } from "@/components/RingKart";

const DONUS_TIP_AD: Record<DonusTip, string> = {
  korTerminal: "Kör terminal (stub)",
  ciftPeron: "Çift peron + makas",
  dongu: "Balon döngü (loop)",
  makasliGecis: "Makaslı geçiş",
};

// Her dönüş tipinin ne olduğu + terminal aralığına/kapasiteye NE FARK yarattığı (dürüst).
const DONUS_TIP_ACIKLAMA: Record<DonusTip, string> = {
  korTerminal: "Tren tek perona girer, durur, aynı perondan ters yönde çıkar. Dönüş süresi = peron işgali ÷ etkin dönüş yolu; tek peron/tek makasla en yavaş dönüş → terminal darboğazının alt sınırını bu belirler. En yaygın basit tramvay terminali.",
  ciftPeron: "İki ayrı peron: biri dönerken diğerine gelen tren girer → dönüşler paralel. Etkin dönüş = min(peron, makas yolu) arttıkça terminal aralığı buna bölünür (ör. 2 peron → ~yarı süre) → daha sık sefer.",
  dongu: "Balon (loop) hattı: tren durmadan döner, ters dönüş yok. Terminal dönüş beklemesi ≈ 0 (turnback süresi sıfır) → en yüksek kapasite; ama fiziksel loop alanı ister, tramvayda nadir.",
  makasliGecis: "Hat üstü makas (crossover) ile ters dönüş — ayrı terminal peronu şart değil, ara noktada da olabilir. Dönüş kapasitesi makas (S/X) yoluyla sınırlı; kısa dönüş / esnek işletme için uygun.",
};

export function RingEditor() {
  const { t } = useDil();
  // Alias: terminal .map bloğunda `const t = isletme[uc]` çevirmeni gölgeler → orada `tt`.
  const tt = t;
  const { cfg } = useSimConfig();
  const { rings, setRings, sifirlaRings, meta, patchMeta, yukleniyor, yazilabilir } = useProje();
  const { projeYeni } = useHesap();
  const [iceMesgul, setIceMesgul] = useState(false);
  // Araç ve işletme parametreleri KALICI (projeye kayıtlı) — tek kaynak.
  const { arac: stock } = useArac();
  const { isletme, patchIsletme } = useIsletme();
  const patchTerminal = (uc: "terminalBas" | "terminalSon", p: Partial<TerminalConfig>) =>
    patchIsletme({ [uc]: { ...isletme[uc], ...p } });
  // Peron işgali bileşenleri (varış + iniş/biniş + ters dönüş + kalkış temizleme).
  // peronIsgali = toplam (yetkili). Bileşen yoksa mevcut toplamdan makul bölünür.
  const terminalBilesen = (t: TerminalConfig) => {
    if (t.varisTampon != null || t.inisBinis != null || t.tersDonus != null || t.kalkisTemizleme != null || t.toparlanma != null) {
      return { varis: t.varisTampon ?? 0, inis: t.inisBinis ?? 0, ters: t.tersDonus ?? 0, kalkis: t.kalkisTemizleme ?? 0, topar: t.toparlanma ?? 0 };
    }
    const toplam = t.peronIsgali || 0;
    const base = toplam >= 60 ? { varis: 15, inis: 30, ters: toplam - 60, kalkis: 15 } : { varis: 0, inis: 0, ters: toplam, kalkis: 0 };
    return { ...base, topar: 0 };
  };
  const patchTerminalBilesen = (uc: "terminalBas" | "terminalSon", alan: "varis" | "inis" | "ters" | "kalkis" | "topar", v: number) => {
    const c = terminalBilesen(isletme[uc]);
    const n = { ...c, [alan]: Math.max(0, Math.round(v)) };
    patchTerminal(uc, { varisTampon: n.varis, inisBinis: n.inis, tersDonus: n.ters, kalkisTemizleme: n.kalkis, toparlanma: n.topar, peronIsgali: n.varis + n.inis + n.ters + n.kalkis + n.topar });
  };
  // Canlı maksimum tramvay kapasitesi (bottleneck) — inputların hemen altında geri besleme.
  const maks = useMemo(() => maksimumTren(rings, stock, cfg, isletme), [rings, stock, cfg, isletme]);
  // Kurp konfor uyarısını GERÇEK per-ring doluluğa bağlamak için (PDF 2.2 ile birebir).
  const dolulukByRing = useMemo(() => {
    const out: Record<string, number> = {};
    const tia = rings.length >= 2 ? tersIsletmeAnaliz(rings, stock, isletme, cfg) : null;
    if (tia) rings.forEach((r, i) => { const d = tia.duraklar[i]; if (d) out[r.id] = d.doluluk; });
    return out;
  }, [rings, stock, isletme, cfg]);
  // Her ringin hat başından kümülatif başlangıç kilometrajı (kurp mutlak km gösterimi için).
  const ringBasiKm = useMemo(() => { const o: number[] = []; let a = 0; for (const r of rings) { o.push(a); a += r.uzunluk; } return o; }, [rings]);
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

  // İçe aktarma — 3 mod. "yeniHat" mevcut hatta HİÇ dokunmaz (yeni proje açar, ona doldurur).
  const iceAktarUygula = async (yeni: DurakArasiRing[], ad: string, mod: IceAktarMod, koord?: Record<string, { lat: number; lon: number }>, geometri?: { insaat?: boolean; noktalar: [number, number][] }[]) => {
    // koord: GTFS durak lat/lon (GTFS export için); geometri: GTFS shape (gerçek harita hizası).
    if (mod === "degistir") { silHatirla(() => yeni); patchMeta({ hatAdi: ad }); patchIsletme({ istasyonKoordinat: koord ?? {}, hatGeometri: geometri, koordinatKaynak: "iceaktar" }); }
    else if (mod === "ekle") {
      silHatirla((rs) => [...rs, ...yeni]);
      // Koordinat + geometri BİRLEŞTİR (değiştir'in aksine üzerine yazma) → harita eklenen
      // kısımla tutarlı kalır. Geometri = polyline dizisi; eklenen polyline'lar sona eklenir.
      if (koord || geometri) patchIsletme({
        istasyonKoordinat: { ...(isletme.istasyonKoordinat ?? {}), ...(koord ?? {}) },
        hatGeometri: [...(isletme.hatGeometri ?? []), ...(geometri ?? [])],
        koordinatKaynak: "iceaktar",
      });
    }
    else if (mod === "yeniHat") {
      setIceMesgul(true);
      try { await projeYeni(ad); setRings(() => yeni); patchMeta({ hatAdi: ad }); patchIsletme({ istasyonKoordinat: koord ?? {}, hatGeometri: geometri, koordinatKaynak: "iceaktar" }); }
      catch (e) { alert(e instanceof Error ? e.message : t({ tr: "Yeni hat oluşturulamadı.", en: "Could not create new line.", de: "Neue Strecke konnte nicht erstellt werden." })); }
      finally { setIceMesgul(false); }
    }
  };

  const oneriler = useMemo(() => dengeOnerisi(rings, stock, cfg), [rings, stock, cfg]);
  const tumEksik = useMemo(() => rings.flatMap((r) => ringDogrula(r, cfg)), [rings, cfg]);
  // Durak zinciri (ring uçlarından türer) — üstteki hızlı durak editörü için.
  const duraklar = useMemo(() => ringDuraklari(rings), [rings]);
  // GTFS export ancak TÜM duraklar geçerli (finite) lat/lon taşıyorsa mümkün.
  // Koordinat GTFS içe aktarımından gelir ya da aşağıdan ELLE girilir.
  const gtfsKoordVar = duraklar.length > 0 && duraklar.every((d) => {
    const k = isletme.istasyonKoordinat?.[d.ad];
    return !!k && Number.isFinite(k.lat) && Number.isFinite(k.lon);
  });
  const koordSayisi = duraklar.filter((d) => { const k = isletme.istasyonKoordinat?.[d.ad]; return !!k && Number.isFinite(k.lat) && Number.isFinite(k.lon); }).length;
  // "Ekle" süreklilik kontrolü için mevcut hattın SON durak koordinatı (varsa) — HatIceAktar,
  // eklenecek hattın başıyla arasındaki boşluğu ölçüp kopuksa uyarır.
  const mevcutSonKoord = useMemo(() => {
    if (!rings.length || !duraklar.length) return null;
    const son = duraklar[duraklar.length - 1];
    const k = son && isletme.istasyonKoordinat?.[son.ad];
    return k && Number.isFinite(k.lat) && Number.isFinite(k.lon) ? { ad: son.ad, lat: k.lat, lon: k.lon } : null;
  }, [rings.length, duraklar, isletme.istasyonKoordinat]);
  const koordGuncelle = (ad: string, alan: "lat" | "lon", v: number) => {
    const cur = isletme.istasyonKoordinat ?? {};
    const mevcut = cur[ad] ?? { lat: NaN, lon: NaN };
    patchIsletme({ istasyonKoordinat: { ...cur, [ad]: { ...mevcut, [alan]: v } }, koordinatKaynak: "manuel" });
  };
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
  // Dwell OTO açık ringde etkin dwell yolcu akışından hesaplanır (görüntü için).
  const etkinDwell = (r: DurakArasiRing) => r.dwellOto
    ? Math.max(isletme.minDurusSuresi, yolcuAkisSuresi(r.inenYolcu ?? 0, r.binenYolcu ?? 0, stock, isletme.yolcuAkisHizi)) + (r.kapiAcma ?? 2) + (r.kapiKapama ?? 2)
    : r.dwell;
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
  const patchKurp = (rid: string, kid: string, p: Partial<Kurp>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, kurplar: (r.kurplar ?? []).map((k) => (k.id === kid ? { ...k, ...p } : k)) } : r)));

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
  const kurpEkle = (rid: string, konum?: number, ekstra?: Partial<Kurp>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, kurplar: [...(r.kurplar ?? []), { ...yeniKurp(konum ?? Math.round(r.uzunluk * 0.5)), ...ekstra }] } : r)));
  const kurpSil = (rid: string, kid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, kurplar: (r.kurplar ?? []).filter((k) => k.id !== kid) } : r)));
  const sinyalEkle = (rid: string, yon: "giden" | "gelen", konum: number, tersIsletme: boolean) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, sinyaller: [...(r.sinyaller ?? []), yeniSinyal(yon, Math.max(0, Math.min(r.uzunluk, Math.round(konum))), tersIsletme)] } : r)));
  const patchSinyal = (rid: string, sid: string, p: Partial<SinyalLambasi>) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, sinyaller: (r.sinyaller ?? []).map((s) => (s.id === sid ? { ...s, ...p } : s)) } : r)));
  const sinyalSil = (rid: string, sid: string) =>
    setRings((rs) => rs.map((r) => (r.id === rid ? { ...r, sinyaller: (r.sinyaller ?? []).filter((s) => s.id !== sid) } : r)));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Başlık */}
      <div className="mb-6 flex items-end justify-between border-b pb-4" style={{ borderColor: brand.border }}>
        <div>
          <div className="field-label">{t({ tr: "Durak Arası Ring Editörü — Gerçek-Hayat İşletim Hücreleri", en: "Inter-Stop Section Editor — Real-Life Operating Cells", de: "Editor für Streckenabschnitte — Betriebszellen aus der Praxis" })}</div>
          <h1 className="font-brand mt-1 text-2xl font-semibold" style={{ color: brand.ink }}>{meta.hatAdi || t({ tr: "Adsız Hat", en: "Untitled Line", de: "Unbenannte Strecke" })} · {t({ tr: "Loop (Çevrim) Şartları", en: "Loop (Cycle) Conditions", de: "Umlauf-Bedingungen" })}</h1>
        </div>
        <button
          onClick={() => {
            if (rings.length > 0 && !confirm(t({ tr: "Bu hattın tüm ringleri silinsin mi? (geri alınamaz)", en: "Delete all sections of this line? (cannot be undone)", de: "Alle Abschnitte dieser Strecke löschen? (nicht widerrufbar)" }))) return;
            sifirla();
          }}
          className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50" style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}>
          {t({ tr: "🗑 Hattı temizle", en: "🗑 Clear line", de: "🗑 Strecke leeren" })}
        </button>
      </div>

      {/* Silme GERİ AL çubuğu — yanlış silinen durak/ring tek tıkla geri gelir. */}
      {geriAl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 px-4 py-2 text-sm" style={{ background: CK.amberBg, borderColor: CK.amber, color: brand.ink }}>
          <span>{t({ tr: "↩︎ Silme işlemi yapıldı. Yanlışlıkla mı? Geri alabilirsin.", en: "↩︎ A deletion was made. By accident? You can undo it.", de: "↩︎ Eine Löschung wurde vorgenommen. Versehentlich? Sie können sie rückgängig machen." })}</span>
          <button onClick={geriAlUygula} className="shrink-0 rounded-md px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>
            {t({ tr: "↺ Silmeyi geri al", en: "↺ Undo deletion", de: "↺ Löschung rückgängig" })}
          </button>
        </div>
      )}

      {/* GTFS içe aktarma — bir toplu taşıma ağının .zip'inden hattı otomatik kurar
          (mevcut hattın üzerine yazar; "Silmeyi geri al" ile dönülebilir). */}
      {!yukleniyor && (
        <HatIceAktar onIceAktar={iceAktarUygula} mevcutSonKoord={mevcutSonKoord} disabled={!yazilabilir} mesgulDis={iceMesgul} />
      )}

      {/* ŞUBE / TALİ HAT EDİTÖRÜ (dallanma, #1) — ana hattan ayrılan tali hatlar */}
      {!yukleniyor && rings.length > 0 && <SubeEditor />}

      {/* railML DIŞA AKTARMA — hattı endüstri-standart railML 2.x XML olarak indir
          (OpenTrack/RailSys köprüsü). */}
      {!yukleniyor && rings.length > 0 && (
        <details className="mt-4 rounded-lg border bg-white" style={{ borderColor: brand.border }}>
          <summary className="flex cursor-pointer select-none items-center gap-2 p-4">
            <span className="h-4 w-[3px]" style={{ background: brand.red }} aria-hidden="true" />
            <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Dışa Aktar", en: "Export", de: "Export" })}</span>
            <span className="ml-2 text-xs" style={{ color: brand.muted }}>{t({ tr: "railML 2.2 (altyapı + araç + çizelge) · GTFS (çift yön + servis)", en: "railML 2.2 (infrastructure + rolling stock + timetable) · GTFS (both directions + service)", de: "railML 2.2 (Infrastruktur + Fahrzeuge + Fahrplan) · GTFS (beide Richtungen + Betrieb)" })}</span>
          </summary>
          <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: brand.border }}>
            <p className="mb-3 text-xs" style={{ color: brand.muted }}>
              Hattı standart formatlara indir. <b>railML 2.2</b> = altyapı (istasyon · kilometraj · <b>makas · sinyal · eğim</b>) + <b>araç (rollingstock)</b> + <b>çizelge (timetable, çift yön)</b> → OpenTrack/RailSys köprüsü. <b>GTFS</b> = duraklar + <b>çift yön çizelge</b> + <b>frequencies (servis penceresi)</b> + shapes (transit araçları).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button"
                onClick={() => {
                  const hhmm = (s?: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : undefined; };
                  const xml = railmlIhrac(rings, meta.hatAdi || "RaySim hattı", {
                    stock, cfg, headwaySn: cfg.headway,
                    servisBasSn: hhmm(isletme.servisBas), servisBitSn: hhmm(isletme.servisBit),
                  });
                  const ad = (meta.hatAdi || "raysim-hat").trim().replace(/[^\w.-]+/g, "_") || "raysim-hat";
                  indir(new Blob([xml], { type: "application/xml" }), `${ad}.railml.xml`);
                }}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>
                {t({ tr: "⬆ railML (.xml)", en: "⬆ railML (.xml)", de: "⬆ railML (.xml)" })}
              </button>
              <button type="button" disabled={!gtfsKoordVar}
                title={gtfsKoordVar ? t({ tr: "GTFS .zip indir (duraklar + RaySim çizelgesi)", en: "Download GTFS .zip (stops + RaySim timetable)", de: "GTFS-.zip herunterladen (Haltestellen + RaySim-Fahrplan)" }) : t({ tr: "GTFS için durak koordinatı (lat/lon) gerekli — hattı GTFS'ten içe aktarın", en: "Stop coordinates (lat/lon) required for GTFS — import the line from GTFS", de: "Für GTFS sind Haltestellenkoordinaten (lat/lon) erforderlich — Strecke aus GTFS importieren" })}
                onClick={() => {
                  const kmap = isletme.istasyonKoordinat ?? {};
                  const dz: GtfsDurakZaman[] = [];
                  let t = 0;
                  for (let i = 0; i < duraklar.length; i++) {
                    const k = kmap[duraklar[i].ad];
                    if (!k || !Number.isFinite(k.lat) || !Number.isFinite(k.lon)) return; // eksik koordinat → GTFS geçersiz (buton zaten kapalı)
                    const dwell = i === 0 ? 0 : Math.max(0, rings[i - 1]?.dwell ?? 0);
                    const varis = t;
                    const kalkis = varis + dwell;
                    dz.push({ id: `S${i}`, ad: duraklar[i].ad, lat: k.lat, lon: k.lon, varisSn: varis, kalkisSn: kalkis });
                    if (i < rings.length) t = kalkis + ringSenaryo(rings[i], stock, cfg).nominalSeyir;
                  }
                  const hhmm = (s?: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? ""); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : undefined; };
                  const zip = gtfsIhrac({
                    hatAdi: meta.hatAdi || "RaySim hattı",
                    agency: meta.idare || meta.sinyalizasyonFirmasi || "RaySim",
                    duraklar: dz,
                    headwaySn: cfg.headway,
                    baslangicSn: hhmm(isletme.servisBas),
                    bitisSn: hhmm(isletme.servisBit),
                  });
                  const ad = (meta.hatAdi || "raysim-hat").trim().replace(/[^\w.-]+/g, "_") || "raysim-hat";
                  indir(new Blob([new Uint8Array(zip)], { type: "application/zip" }), `${ad}.gtfs.zip`);
                }}
                className="rounded-md border px-4 py-2 text-sm font-semibold transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                style={{ borderColor: brand.borderStrong, color: brand.ink }}>
                {t({ tr: "⬆ GTFS (.zip)", en: "⬆ GTFS (.zip)", de: "⬆ GTFS (.zip)" })}
              </button>
            </div>
            {!gtfsKoordVar && (
              <p className="mt-2 text-[0.7rem]" style={{ color: brand.muted }}>
                {t({ tr: "GTFS için durakların ", en: "For GTFS, the stops need their ", de: "Für GTFS benötigen die Haltestellen ihre " })}<b>{t({ tr: "coğrafi koordinatı (lat/lon)", en: "geographic coordinates (lat/lon)", de: "geografischen Koordinaten (lat/lon)" })}</b>{t({ tr: " gerekir — GTFS'ten içe aktarınca otomatik gelir, ya da ", en: " — they come automatically when importing from GTFS, or ", de: " — sie kommen automatisch beim Import aus GTFS, oder " })}<b>{t({ tr: "aşağıdan elle gir", en: "enter them manually below", de: "unten manuell eingeben" })}</b>{t({ tr: ". railML her hatta çalışır.", en: ". railML works for every line.", de: ". railML funktioniert für jede Strecke." })}
              </p>
            )}

            {/* ELLE KOORDİNAT — her durağa WGS84 lat/lon gir → GTFS herhangi bir hatta açılır.
                (Shapefile/DXF projeksiyonlu koordinat WGS84'e çevrilmez — CRS/proj4 gerekir;
                elle giriş her durumda çalışan güvenli yoldur.) */}
            {yazilabilir && duraklar.length > 0 && (
              <details className="mt-3 rounded border" style={{ borderColor: brand.border }}>
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium" style={{ color: brand.ink }}>
                  {t({ tr: "İstasyon koordinatları (GTFS için) — ", en: "Station coordinates (for GTFS) — ", de: "Stationskoordinaten (für GTFS) — " })}<span style={{ color: koordSayisi === duraklar.length ? "#16794C" : CK.amberInk }}>{koordSayisi}/{duraklar.length}</span> {t({ tr: "girildi", en: "entered", de: "eingegeben" })}
                </summary>
                <div className="max-h-64 overflow-auto border-t px-3 py-2" style={{ borderColor: brand.border }}>
                  <p className="mb-2 text-[0.68rem]" style={{ color: brand.muted }}>{t({ tr: "Enlem/boylam (WGS84, ondalık derece). Tümü dolunca GTFS indirilebilir. ", en: "Latitude/longitude (WGS84, decimal degrees). Once all are filled, GTFS can be downloaded. ", de: "Breite/Länge (WGS84, Dezimalgrad). Sobald alle ausgefüllt sind, kann GTFS heruntergeladen werden. " })}<b>{t({ tr: "İpucu:", en: "Tip:", de: "Tipp:" })}</b>{t({ tr: " Google Maps'te durağa sağ tık → koordinat çiftini kopyala.", en: " In Google Maps, right-click the stop → copy the coordinate pair.", de: " In Google Maps mit Rechtsklick auf die Haltestelle → das Koordinatenpaar kopieren." })}</p>
                  {duraklar.map((d, i) => {
                    const k = isletme.istasyonKoordinat?.[d.ad];
                    return (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                        <span className="w-40 shrink-0 truncate" title={d.ad} style={{ color: brand.inkSoft }}>{i + 1}. {d.ad}</span>
                        <input type="number" step="0.000001" placeholder={t({ tr: "enlem", en: "latitude", de: "Breite" })} value={k && Number.isFinite(k.lat) ? k.lat : ""} onChange={(e) => koordGuncelle(d.ad, "lat", parseFloat(e.target.value))}
                          className="w-28 rounded border px-1.5 py-0.5" style={{ borderColor: brand.border, color: brand.ink }} />
                        <input type="number" step="0.000001" placeholder={t({ tr: "boylam", en: "longitude", de: "Länge" })} value={k && Number.isFinite(k.lon) ? k.lon : ""} onChange={(e) => koordGuncelle(d.ad, "lon", parseFloat(e.target.value))}
                          className="w-28 rounded border px-1.5 py-0.5" style={{ borderColor: brand.border, color: brand.ink }} />
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        </details>
      )}

      {/* DURAKLAR & MESAFELER — hattın GİRİŞ NOKTASI. Boş hatta da görünür: müşteri
          önce buradan durak/mesafe/hız girer, ring hücreleri buradan doğar. Detaylı
          hücre şartları (worst/best, makas, hemzemin, tehlike, depo) alttaki kartlarda.
          Yükleme sırasında gizli (aşağıdaki "Hat yükleniyor…" gösterilir). */}
      {!yukleniyor && (
        <div className="mt-4">
          <Panel katlanir acik ozet={`${rings.length} ${t({ tr: "durak-arası (ring)", en: "inter-stop sections", de: "Streckenabschnitte" })}`} baslik={t({ tr: "Duraklar & Mesafeler", en: "Stops & Distances", de: "Haltestellen & Entfernungen" })} aciklama={t({ tr: "Hattın başladığı yer: durakları ve aralarındaki mesafe/hızları buradan gir. Başa · ortaya · sona durak ekle, adları düzenle. Her durak-arası bir işletim hücresi (ring) oluşturur — detaylı şartlar aşağıdaki kartlarda. Değişiklikler anında kaydedilir.", en: "Where the line begins: enter the stops and the distances/speeds between them here. Add a stop at the start · middle · end, edit names. Each inter-stop span forms an operating cell (section) — detailed conditions are in the cards below. Changes are saved instantly.", de: "Wo die Strecke beginnt: hier die Haltestellen und die Entfernungen/Geschwindigkeiten dazwischen eingeben. Haltestelle am Anfang · in der Mitte · am Ende hinzufügen, Namen bearbeiten. Jeder Abschnitt zwischen zwei Haltestellen bildet eine Betriebszelle — detaillierte Bedingungen in den Karten unten. Änderungen werden sofort gespeichert." })}>
            {duraklar.length === 0 ? (
              <div className="rounded-md border-2 border-dashed px-6 py-6" style={{ borderColor: brand.border }}>
                <div className="text-center">
                  <div className="font-brand text-base font-semibold" style={{ color: brand.ink }}>{t({ tr: "Hattınız boş — buradan başlayın", en: "Your line is empty — start here", de: "Ihre Strecke ist leer — hier beginnen" })}</div>
                  <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed" style={{ color: brand.muted }}>
                    <b>{t({ tr: "Toplam uzunluk + durak sayısı", en: "Total length + number of stops", de: "Gesamtlänge + Anzahl der Haltestellen" })}</b>{t({ tr: " gir → hat eşit bölünür; sonra adları ve mesafeleri tek tek düzenlersin. (Tek tek de başlayabilirsin.)", en: " → the line is split evenly; then you edit names and distances one by one. (You can also start one by one.)", de: " → die Strecke wird gleichmäßig aufgeteilt; danach bearbeiten Sie Namen und Entfernungen einzeln. (Sie können auch einzeln beginnen.)" })}
                  </p>
                </div>
                {/* Hızlı kurulum: toplam + sayı → eşit böl */}
                <div className="mx-auto mt-4 flex max-w-md flex-wrap items-end justify-center gap-3">
                  <label className="block">
                    <span className="field-label">{t({ tr: "Toplam uzunluk", en: "Total length", de: "Gesamtlänge" })}</span>
                    <div className="mt-1 flex items-center gap-1">
                      <input type="number" min={100} step={100} value={hizliToplam} onChange={(e) => setHizliToplam(Math.max(100, parseFloat(e.target.value) || 0))}
                        className="w-24 rounded border px-2 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                      <span className="text-xs" style={{ color: brand.muted }}>m</span>
                    </div>
                  </label>
                  <label className="block">
                    <span className="field-label">{t({ tr: "Durak sayısı", en: "Number of stops", de: "Anzahl der Haltestellen" })}</span>
                    <input type="number" min={2} step={1} value={hizliSayi} onChange={(e) => setHizliSayi(Math.max(2, Math.round(parseFloat(e.target.value) || 2)))}
                      className="mt-1 w-20 rounded border px-2 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
                  </label>
                  <button onClick={() => setRings(duraklardanHat(hizliToplam, hizliSayi))}
                    className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: brand.red }}>
                    {t({ tr: "Hattı kur (", en: "Build line (", de: "Strecke aufbauen (" })}{hizliSayi} {t({ tr: "durak · ", en: "stops · ", de: "Haltestellen · " })}{Math.round(hizliToplam / Math.max(1, hizliSayi - 1))} {t({ tr: "m ara)", en: "m spacing)", de: "m Abstand)" })}
                  </button>
                </div>
                <div className="mt-3 text-center">
                  <button onClick={() => ekleUygula((rs) => durakEkleSon(rs))} className="text-xs underline" style={{ color: brand.muted }}>{t({ tr: "veya tek durak-arasıyla başla →", en: "or start with a single inter-stop section →", de: "oder mit einem einzelnen Abschnitt beginnen →" })}</button>
                </div>
              </div>
            ) : (
            <>
            {/* Ekleme mesafesi + başa/sona ekle — yeni durak SEÇTİĞİN mesafeyle eklenir. */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
              <span className="text-xs font-medium" style={{ color: brand.inkSoft }}>{t({ tr: "Yeni durak mesafesi", en: "New stop distance", de: "Entfernung neue Haltestelle" })}</span>
              <input type="number" min={50} step={50} value={ekMesafe} onChange={(e) => setEkMesafe(Math.max(50, parseFloat(e.target.value) || 0))}
                className="w-24 rounded border px-2 py-1 text-right text-sm" style={{ borderColor: brand.border, color: brand.ink }} />
              <span className="text-xs" style={{ color: brand.muted }}>m</span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => ekleUygula((rs) => durakEkleBas(rs, ekMesafe))}
                  className="rounded-md border px-3 py-1 text-xs font-medium transition hover:bg-white" style={{ borderColor: brand.borderStrong, color: brand.ink }}>{t({ tr: "⇤ Başa ekle", en: "⇤ Add to start", de: "⇤ Am Anfang hinzufügen" })}</button>
                <button onClick={() => ekleUygula((rs) => durakEkleSon(rs, ekMesafe))}
                  className="rounded-md border px-3 py-1 text-xs font-medium transition hover:bg-white" style={{ borderColor: brand.borderStrong, color: brand.ink }}>{t({ tr: "Sona ekle ⇥", en: "Add to end ⇥", de: "Am Ende hinzufügen ⇥" })}</button>
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
                    <span className="shrink-0 font-mono text-xs" style={{ color: brand.faint }} title={t({ tr: "Hat başından uzaklık", en: "Distance from line start", de: "Entfernung vom Streckenanfang" })}>{km(d.konum)} km</span>
                    {i > 0 && (
                      <div className="flex shrink-0 items-center gap-1" title={t({ tr: "Bu durakta toplam bekleme (dwell) = kapı aç + yolcu + kapı kapa (aşağıdan düzenle)", en: "Total dwell at this stop = door open + passengers + door close (edit below)", de: "Gesamte Haltezeit an dieser Haltestelle = Tür auf + Fahrgäste + Tür zu (unten bearbeiten)" })}>
                        <span className="text-[0.65rem] font-medium" style={{ color: brand.inkSoft }}>{t({ tr: "bekleme", en: "dwell", de: "Haltezeit" })}</span>
                        <span className="text-xs font-semibold" style={{ color: rings[i - 1].dwellOto ? CK.good : brand.ink }}>{Math.round(etkinDwell(rings[i - 1]))}</span>
                        <span className="text-[0.65rem]" style={{ color: brand.muted }}>sn{rings[i - 1].dwellOto ? t({ tr: " (oto)", en: " (auto)", de: " (auto)" }) : ""}</span>
                      </div>
                    )}
                    {duraklar.length > 2 ? (
                      <button onClick={() => silHatirla((rs) => durakSil(rs, i))} title={t({ tr: "Durağı sil (orta durak → komşu ringleri birleştirir)", en: "Delete stop (middle stop → merges neighboring sections)", de: "Haltestelle löschen (mittlere Haltestelle → verbindet benachbarte Abschnitte)" })}
                        className="shrink-0 rounded px-1.5 py-1 text-xs transition hover:bg-red-50" style={{ color: brand.red }}>🗑</button>
                    ) : (<span className="w-6 shrink-0" />)}
                  </div>
                  {/* Durak bekleme bileşenleri (dwell = kapı aç + yolcu + kapı kapa) + kalkış ölü zamanı */}
                  <div className="ml-6 flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5 pl-2 text-[0.7rem]" style={{ color: brand.muted }}>
                    {i > 0 && (() => {
                      const r = rings[i - 1];
                      const oto = !!r.dwellOto;
                      const yolcuHesap = Math.max(isletme.minDurusSuresi, yolcuAkisSuresi(r.inenYolcu ?? 0, r.binenYolcu ?? 0, stock, isletme.yolcuAkisHizi));
                      return (
                        <>
                          <label className="flex items-center gap-1" title={t({ tr: "Dwell'i yolcu akışından otomatik hesapla: (inen+binen) ÷ (kapı sayısı × genişlik × akış hızı)", en: "Auto-compute dwell from passenger flow: (alighting+boarding) ÷ (door count × width × flow rate)", de: "Haltezeit automatisch aus dem Fahrgastfluss berechnen: (Aussteiger+Einsteiger) ÷ (Türanzahl × Breite × Flussrate)" })}>
                            <input type="checkbox" checked={oto} onChange={(e) => patch(r.id, { dwellOto: e.target.checked })} />
                            <span style={{ color: oto ? CK.good : brand.muted }}>{t({ tr: "oto dwell", en: "auto dwell", de: "Auto-Haltezeit" })}</span>
                          </label>
                          <span className="flex items-center gap-1" title={t({ tr: "Kapı açma süresi (s)", en: "Door opening time (s)", de: "Türöffnungszeit (s)" })}>{t({ tr: "kapı aç", en: "door open", de: "Tür auf" })}
                            <input type="number" min={0} step={1} value={Math.round(dwellBilesen(r).ac)}
                              onChange={(e) => patchDwell(r, "ac", parseFloat(e.target.value) || 0)}
                              className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                          {oto ? (
                            <>
                              <span className="flex items-center gap-1" title={t({ tr: "Bu durakta inen yolcu", en: "Passengers alighting at this stop", de: "Aussteigende Fahrgäste an dieser Haltestelle" })}>{t({ tr: "inen", en: "alighting", de: "Aussteiger" })}
                                <input type="number" min={0} step={5} value={Math.round(r.inenYolcu ?? 0)}
                                  onChange={(e) => patch(r.id, { inenYolcu: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-12 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                              <span className="flex items-center gap-1" title={t({ tr: "Bu durakta binen yolcu", en: "Passengers boarding at this stop", de: "Einsteigende Fahrgäste an dieser Haltestelle" })}>{t({ tr: "binen", en: "boarding", de: "Einsteiger" })}
                                <input type="number" min={0} step={5} value={Math.round(r.binenYolcu ?? 0)}
                                  onChange={(e) => patch(r.id, { binenYolcu: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-12 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                              <span title={t({ tr: "Yolcu akışından hesaplanan bölüm", en: "Portion computed from passenger flow", de: "Aus dem Fahrgastfluss berechneter Anteil" })} style={{ color: CK.good }}>{t({ tr: "yolcu", en: "passengers", de: "Fahrgäste" })} {Math.round(yolcuHesap)}s ✓</span>
                              <span className="basis-full rounded border-l-2 py-0.5 pl-2 text-[0.66rem] leading-snug" style={{ borderColor: CK.good, background: CK.goodBgSoft, color: brand.inkSoft }}>
                                <b>oto dwell</b>: bekleme yolcudan hesaplanır → kapı aç {Math.round(dwellBilesen(r).ac)}s + yolcu [(inen+binen) ÷ (kapı {stock.kapiSayisi ?? 4} × genişlik {stock.kapiGenisligi ?? 1.3}m × akış {isletme.yolcuAkisHizi})] + kapı kapa {Math.round(dwellBilesen(r).kapa)}s; en az {isletme.minDurusSuresi}s. Şu an yolcu {Math.round(yolcuHesap)}s → toplam <b>{Math.round(etkinDwell(r))}s</b>.
                              </span>
                            </>
                          ) : (
                            <span className="flex items-center gap-1" title={t({ tr: "Yolcu değişimi / iniş-biniş süresi (s)", en: "Passenger exchange / boarding-alighting time (s)", de: "Fahrgastwechsel- / Ein-Aussteigezeit (s)" })}>{t({ tr: "yolcu", en: "passengers", de: "Fahrgäste" })}
                              <input type="number" min={0} step={1} value={Math.round(dwellBilesen(r).yolcu)}
                                onChange={(e) => patchDwell(r, "yolcu", parseFloat(e.target.value) || 0)}
                                className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                          )}
                          <span className="flex items-center gap-1" title={t({ tr: "Kapı kapama süresi (s)", en: "Door closing time (s)", de: "Türschließzeit (s)" })}>{t({ tr: "kapı kapa", en: "door close", de: "Tür zu" })}
                            <input type="number" min={0} step={1} value={Math.round(dwellBilesen(r).kapa)}
                              onChange={(e) => patchDwell(r, "kapa", parseFloat(e.target.value) || 0)}
                              className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                        </>
                      );
                    })()}
                    {i < rings.length && (
                      <span className="flex items-center gap-1" title={t({ tr: "Bu duraktan kalkışta ölü zaman (start-up lost time, s). Hat geneli varsayılanı override eder.", en: "Start-up lost time when departing this stop (s). Overrides the line-wide default.", de: "Anfahr-Verlustzeit bei Abfahrt von dieser Haltestelle (s). Überschreibt den streckenweiten Standardwert." })}>
                        {t({ tr: "kalkış ölü", en: "start-up lost", de: "Anfahrverlust" })}
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
                      {t({ tr: "🅿 Parklanma", en: "🅿 Stabling", de: "🅿 Abstellung" })}
                    </button>
                    {depoDurum(i).on && (
                      <span className="flex items-center gap-1" style={{ color: brand.muted }}>
                        {t({ tr: "park eden tren", en: "stabled trains", de: "abgestellte Züge" })}
                        <button type="button" onClick={() => depoQueued(i, Math.max(0, depoDurum(i).q - 1))}
                          className="flex h-5 w-5 items-center justify-center rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }} title={t({ tr: "Bir tren çıkar", en: "Remove one train", de: "Einen Zug entfernen" })}>−</button>
                        <input type="number" min={0} max={40} step={1} value={depoDurum(i).q} onChange={(e) => depoQueued(i, parseFloat(e.target.value) || 0)}
                          className="w-12 rounded border px-1 py-0.5 text-center" style={{ borderColor: brand.border, color: brand.ink }} />
                        <button type="button" onClick={() => depoQueued(i, Math.min(40, depoDurum(i).q + 1))}
                          className="flex h-5 w-5 items-center justify-center rounded border font-semibold text-white" style={{ background: brand.ink, borderColor: brand.ink }} title={t({ tr: "Park eden tren ekle", en: "Add a stabled train", de: "Abgestellten Zug hinzufügen" })}>+</button>
                        {i === duraklar.length - 1 && <span style={{ color: CK.amber }} title={t({ tr: "Hattın sonundaki depo gidiş yönünde tren veremez (gidecek yer yok)", en: "A depot at the line end cannot release trains in the outbound direction (nowhere to go)", de: "Ein Depot am Streckenende kann keine Züge in Hinrichtung ausgeben (kein Ziel)" })}>{t({ tr: "⚠ uç", en: "⚠ end", de: "⚠ Ende" })}</span>}
                        {(() => {
                          const dr = i === 0 ? rings[0] : rings[i - 1];
                          const makasVar = !!dr && dr.makaslar.length > 0;
                          return makasVar
                            ? <span className="ml-1" style={{ color: "#16794C" }} title={t({ tr: "Araçlar servise çıkarken makastan gidiş ya da karşı şeride geçerek dönüş yönüne dağılır.", en: "When entering service, vehicles disperse via a switch to the outbound direction or cross to the opposite track for the return direction.", de: "Beim Ausrücken verteilen sich die Fahrzeuge über eine Weiche in die Hinrichtung oder wechseln auf das Gegengleis für die Rückrichtung." })}>{t({ tr: "✓ makas var", en: "✓ switch present", de: "✓ Weiche vorhanden" })}</span>
                            : <span className="ml-1 font-semibold" style={{ color: brand.red }} title={t({ tr: "Parklanma alanında MAKAS ZORUNLUDUR: araç ancak makastan gidiş/dönüş yönüne çıkabilir. Bu durak-arası ring'e makas ekle.", en: "A SWITCH IS MANDATORY in a stabling area: a vehicle can only exit to the outbound/return direction via a switch. Add a switch to this inter-stop section.", de: "In einem Abstellbereich ist eine WEICHE PFLICHT: ein Fahrzeug kann nur über eine Weiche in die Hin-/Rückrichtung ausfahren. Fügen Sie diesem Abschnitt eine Weiche hinzu." })}>{t({ tr: "⚠ MAKAS zorunlu — ekle", en: "⚠ SWITCH required — add", de: "⚠ WEICHE erforderlich — hinzufügen" })}</span>;
                        })()}
                      </span>
                    )}
                  </div>
                  {/* Durak-arası (ring i) — mesafe + hız + ortaya ekle */}
                  {i < rings.length && (
                    <div className="ml-6 flex flex-wrap items-center gap-2 py-1 pl-2 text-xs" style={{ color: brand.muted }}>
                      <span style={{ color: brand.faint }}>↓</span>
                      <span className="flex items-center gap-1">
                        {t({ tr: "mesafe", en: "distance", de: "Entfernung" })}
                        <input type="number" min={50} step={50} value={Math.round(rings[i].uzunluk)}
                          onChange={(e) => patch(rings[i].id, { uzunluk: Math.max(50, parseFloat(e.target.value) || 0) })}
                          className="w-20 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> m
                      </span>
                      <span className="flex items-center gap-1">
                        {t({ tr: "hız", en: "speed", de: "Geschw." })}
                        <input type="number" min={5} step={5} value={Math.round(kmh(rings[i].vmax))}
                          onChange={(e) => patch(rings[i].id, { vmax: Math.max(5, parseFloat(e.target.value) || 0) * KMH })}
                          className="w-16 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> km/h
                      </span>
                      <label className="flex items-center gap-1" title={t({ tr: "Bu kesim tek hatlı mı? (çift yön aynı hattı paylaşır → tek anda tek tren; maksimum treni düşürür)", en: "Is this section single-track? (both directions share one track → one train at a time; lowers the maximum train count)", de: "Ist dieser Abschnitt eingleisig? (beide Richtungen teilen sich ein Gleis → jeweils nur ein Zug; senkt die maximale Zugzahl)" })}>
                        <input type="checkbox" checked={!!rings[i].tekHat}
                          onChange={(e) => patch(rings[i].id, { tekHat: e.target.checked })} />
                        <span style={{ color: rings[i].tekHat ? brand.red : brand.muted }}>{t({ tr: "tek hat", en: "single track", de: "eingleisig" })}</span>
                      </label>
                      {bolRing === rings[i].id ? (
                        <span className="flex items-center gap-1">
                          {t({ tr: "böl:", en: "split:", de: "teilen:" })}
                          <input type="number" min={1} max={Math.max(1, Math.round(rings[i].uzunluk) - 1)} step={50} value={bolKonum}
                            onChange={(e) => setBolKonum(Math.max(1, parseFloat(e.target.value) || 1))}
                            className="w-16 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /> m
                          <button onClick={() => { ekleUygula((rs) => durakBol(rs, i, bolKonum)); setBolRing(null); }}
                            className="rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: brand.ink }}>{t({ tr: "böl", en: "split", de: "teilen" })}</button>
                          <button onClick={() => setBolRing(null)} className="rounded px-1" style={{ color: brand.muted }} title={t({ tr: "Vazgeç", en: "Cancel", de: "Abbrechen" })}>✕</button>
                        </span>
                      ) : (
                        <button onClick={() => { setBolRing(rings[i].id); setBolKonum(Math.round(rings[i].uzunluk / 2)); }}
                          title={t({ tr: "Bu ringi seçtiğin konumda bölerek ortaya durak ekle (varsayılan: orta)", en: "Add a stop in the middle by splitting this section at the chosen position (default: middle)", de: "Eine Haltestelle in der Mitte hinzufügen, indem dieser Abschnitt an der gewählten Position geteilt wird (Standard: Mitte)" })}
                          className="rounded border px-2 py-0.5 font-medium transition hover:bg-slate-50" style={{ borderColor: brand.border, color: brand.ink }}>
                          {t({ tr: "＋ ortaya durak", en: "＋ stop in middle", de: "＋ Haltestelle in der Mitte" })}
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

      {/* MAKSİMUM TRAMVAY & TERMİNALLER — hat DAİMA çift hat gidiş-dönüş çalışır.
          Terminal dönüş şartları girilir → tek sonuç: bu hatta en fazla kaç tramvay.
          En az 2 durak olunca anlamlı; boş hatta gösterilmez. */}
      {duraklar.length >= 2 && (
        <div className="mt-4">
          <Panel katlanir ozet={maks.gecerli ? `${maks.nTeorik} ${t({ tr: "tramvay · sürd.", en: "trams · sust.", de: "Straßenbahnen · nachh." })} ${maks.nSurdurulebilir}` : t({ tr: "terminal dönüş kapasitesi", en: "terminal turnback capacity", de: "Endstellen-Wendekapazität" })} baslik={t({ tr: "Maksimum Tramvay Kapasitesi", en: "Maximum Tram Capacity", de: "Maximale Straßenbahnkapazität" })} aciklama={t({ tr: "Hat çift hat, gidiş-dönüş çalışır (tramvay gider, döner, tekrar gider — sürekli çevrim). Terminal dönüş şartlarını gir; sistem bu hatta aynı anda en fazla kaç tramvayın sığacağını hesaplar. Darboğaz otomatik isimlenir.", en: "The line runs double-track, out and back (a tram goes, turns back, goes again — a continuous cycle). Enter the terminal turnback conditions; the system computes how many trams can fit on this line at once. The bottleneck is named automatically.", de: "Die Strecke fährt zweigleisig, hin und zurück (eine Straßenbahn fährt, wendet, fährt wieder — ein durchgehender Umlauf). Geben Sie die Endstellen-Wendebedingungen ein; das System berechnet, wie viele Straßenbahnen gleichzeitig auf diese Strecke passen. Der Engpass wird automatisch benannt." })}>
            {/* Bilgilendirme: neden makaslı turnback hesabı */}
            <div className="mb-2 rounded border-l-4 px-3 py-2 text-xs leading-relaxed" style={{ background: CK.goodBgSoft, borderColor: brand.ink, color: brand.inkSoft }}>
              ℹ️ <b>Neden makaslı hesap?</b> Tramvay uçta dönmek için karşı hatta <b>makasla (crossover)</b> geçmek zorundadır — yoksa gelen hatla <b>kafa kafaya çarpışır</b>. Terminalin en fazla kaç tramvay çevirebileceğini asıl bu makasın tipi belirler:
              <br />• <b>S-makas:</b> dönüşler <b>seri, tek tek</b> — bir tramvay dönüp boğazı boşaltmadan öbürü giremez → terminal aralığı = <b>tam peron işgali</b> (peron çok olsa da hızlanmaz).
              <br />• <b>X-makas:</b> iki bağımsız hareket → 2 tramvay <b>eş-zamanlı olmadan ardışık</b> hızlıca dönebilir → her X-makas = <b>2 dönüş yolu</b>.
              <br /><b>Dönüş yolu = (S sayısı × 1) + (X sayısı × 2).</b> Ör. Şehir Hastanesi <b>2 S + 1 X</b> → 2+2 = 4 yol; Adliye <b>2 S</b> → 2 yol.
              <br /><b>Peron sayısı</b> = terminaldeki dönüş rayı adedi (çift hatta genelde 2). <b>Tek yön</b> modunda yön başına girersin, sistem ×2 yapar. Etkin dönüş = <b>min(peron, dönüş yolu)</b> → terminal aralığı = peron işgali ÷ etkin dönüş. (n ardışık dönüş için hem n peron hem yeterli makas yolu gerekir.)
            </div>
            {/* Terminal (dönüş) girdileri — iki uç */}
            <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["terminalBas", "terminalSon"] as const).map((uc) => {
                const t = isletme[uc];
                const durakAd = uc === "terminalBas" ? (duraklar[0]?.ad || tt({ tr: "Başlangıç", en: "Start", de: "Anfang" })) : (duraklar[duraklar.length - 1]?.ad || tt({ tr: "Bitiş", en: "End", de: "Ende" }));
                return (
                  <div key={uc} className="rounded-md border p-3" style={{ borderColor: brand.border }}>
                    <SubBaslik>{uc === "terminalBas" ? tt({ tr: "Başlangıç", en: "Start", de: "Anfang" }) : tt({ tr: "Bitiş", en: "End", de: "Ende" })} {tt({ tr: "terminali —", en: "terminal —", de: "Endstelle —" })} {durakAd}</SubBaslik>
                    <p className="mb-1 text-xs" style={{ color: brand.muted }}>{tt({ tr: "Hattın ", en: "The line's ", de: "Die " })}{uc === "terminalBas" ? tt({ tr: "ilk", en: "first", de: "erste" }) : tt({ tr: "son", en: "last", de: "letzte" })} {tt({ tr: "durağı; tren burada ters döner.", en: "stop; the train turns back here.", de: "Haltestelle der Strecke; der Zug wendet hier." })}</p>
                    <label className="mt-2 block">
                      <span className="field-label">{tt({ tr: "Dönüş tipi", en: "Turnback type", de: "Wendetyp" })}</span>
                      <select value={t.tip} onChange={(e) => patchTerminal(uc, { tip: e.target.value as DonusTip })}
                        className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                        {(Object.keys(DONUS_TIP_AD) as DonusTip[]).map((k) => (
                          <option key={k} value={k}>{DONUS_TIP_AD[k]}</option>
                        ))}
                      </select>
                      <Kucuk>{tt({ tr: "terminalin fiziksel dönüş biçimi", en: "the terminal's physical turnback form", de: "die physische Wendeform der Endstelle" })}</Kucuk>
                    </label>
                    <p className="mt-1 rounded border-l-2 py-1 pl-2 text-[0.68rem] leading-relaxed" style={{ borderColor: t.tip === "dongu" ? CK.good : CK.amber, background: t.tip === "dongu" ? CK.goodBg : CK.amberBg, color: brand.inkSoft }}>
                      {DONUS_TIP_ACIKLAMA[t.tip]}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <Num label={tt({ tr: "Peron sayısı", en: "Platform count", de: "Bahnsteiganzahl" })} suffix={tt({ tr: "peron", en: "platforms", de: "Bahnsteige" })} step={1} max={6} value={t.peronSayisi}
                          onChange={(v) => patchTerminal(uc, { peronSayisi: Math.max(1, Math.round(v)) })} />
                        <div className="mt-0.5 flex gap-1">
                          {([[false, tt({ tr: "çift yön (toplam)", en: "both directions (total)", de: "beide Richtungen (gesamt)" })], [true, tt({ tr: "tek yön (yön başına)", en: "single direction (per direction)", de: "eine Richtung (je Richtung)" })]] as const).map(([ty, ad]) => (
                            <button key={String(ty)} type="button" onClick={() => patchTerminal(uc, { peronTekYon: ty })}
                              className="rounded border px-1.5 py-0.5 text-[0.6rem] font-medium"
                              style={(!!t.peronTekYon === ty) ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}>
                              {ad}
                            </button>
                          ))}
                        </div>
                        <Kucuk>{t.peronTekYon
                          ? `yön başına ${t.peronSayisi} peron → etkin ${t.peronSayisi * 2} (gidiş+dönüş çift hat)`
                          : tt({ tr: "terminaldeki TOPLAM dönüş peronu — çift hatta genelde 2", en: "TOTAL turnback platforms at the terminal — usually 2 on double track", de: "GESAMTZAHL der Wende-Bahnsteige an der Endstelle — bei zweigleisig meist 2" })}</Kucuk>
                      </div>
                    </div>
                    {/* Peron işgal süresi — bileşenli (ince model), toplam yetkili */}
                    <div className="mt-2 rounded border p-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="field-label">{tt({ tr: "Peron işgal süresi", en: "Platform occupation time", de: "Bahnsteigbelegungszeit" })}</span>
                        <span className="text-sm font-semibold" style={{ color: brand.ink }}>{Math.round(t.peronIsgali)} s</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Num label={tt({ tr: "Varış tamponu", en: "Arrival buffer", de: "Ankunftspuffer" })} suffix="s" step={5} value={terminalBilesen(t).varis}
                          onChange={(v) => patchTerminalBilesen(uc, "varis", v)} /><Kucuk>{tt({ tr: "perona girip durana dek", en: "until entering the platform and stopping", de: "bis zur Einfahrt in den Bahnsteig und Halt" })}</Kucuk></div>
                        <div><Num label={tt({ tr: "İniş/biniş", en: "Alighting/boarding", de: "Aus-/Einstieg" })} suffix="s" step={5} value={terminalBilesen(t).inis}
                          onChange={(v) => patchTerminalBilesen(uc, "inis", v)} /><Kucuk>{tt({ tr: "yolcu iniş-biniş", en: "passenger alighting-boarding", de: "Fahrgast-Aus-/Einstieg" })}</Kucuk></div>
                        <div><Num label={tt({ tr: "Ters dönüş", en: "Turnback", de: "Wende" })} suffix="s" step={5} value={terminalBilesen(t).ters}
                          onChange={(v) => patchTerminalBilesen(uc, "ters", v)} /><Kucuk>{tt({ tr: "yön değiştirme", en: "changing direction", de: "Richtungswechsel" })}</Kucuk></div>
                        <div><Num label={tt({ tr: "Kalkış temizleme", en: "Departure clearance", de: "Abfahrtsräumung" })} suffix="s" step={5} value={terminalBilesen(t).kalkis}
                          onChange={(v) => patchTerminalBilesen(uc, "kalkis", v)} /><Kucuk>{tt({ tr: "kalkıp boğazı boşaltana dek", en: "until departing and clearing the throat", de: "bis zur Abfahrt und Räumung des Weichenbereichs" })}</Kucuk></div>
                        <div><Num label={tt({ tr: "Toparlanma (recovery)", en: "Recovery", de: "Erholung (Recovery)" })} suffix="s" step={5} value={terminalBilesen(t).topar}
                          onChange={(v) => patchTerminalBilesen(uc, "topar", v)} /><Kucuk>{tt({ tr: "gecikme payı (program güvenliği)", en: "delay margin (schedule safety)", de: "Verspätungsreserve (Fahrplansicherheit)" })}</Kucuk></div>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                        {tt({ tr: "Toplam = trenin peronu tuttuğu tam süre. Terminal aralığı = bu ÷ peron. ", en: "Total = the full time the train holds the platform. Terminal interval = this ÷ platforms. ", de: "Gesamt = die volle Zeit, die der Zug den Bahnsteig belegt. Endstellen-Intervall = dies ÷ Bahnsteige. " })}<b>{tt({ tr: "Toparlanma", en: "Recovery", de: "Erholung" })}</b>{tt({ tr: ": gecikmeleri yutan program payı (schedule recovery).", en: ": schedule margin that absorbs delays (schedule recovery).", de: ": Fahrplanreserve, die Verspätungen auffängt (Schedule Recovery)." })}
                      </p>
                    </div>
                    {/* Boğaz (throat) işgali — oto (makastan) veya elle */}
                    <div className="mt-2 rounded border p-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="field-label">{tt({ tr: "Boğaz işgali", en: "Throat occupation", de: "Weichenbereichsbelegung" })}</span>
                        <span className="text-sm font-semibold" style={{ color: brand.ink }}>{etkinBogazIsgali(t, cfg)} s</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs" style={{ color: brand.inkSoft }}>
                        <input type="checkbox" checked={t.bogazOto} onChange={(e) => patchTerminal(uc, { bogazOto: e.target.checked })} />
                        {tt({ tr: "Makastan otomatik türet", en: "Derive automatically from switches", de: "Automatisch aus Weichen ableiten" })}
                      </label>
                      <div className="mt-1">
                        {t.bogazOto ? (
                          <div><Num label={tt({ tr: "Boğaz makas (crossover) sayısı", en: "Throat switch (crossover) count", de: "Anzahl Weichen im Weichenbereich (Crossover)" })} suffix={tt({ tr: "makas", en: "switches", de: "Weichen" })} step={1} max={8} value={t.bogazMakasSayisi}
                            onChange={(v) => patchTerminal(uc, { bogazMakasSayisi: Math.max(1, Math.round(v)) })} /><Kucuk>{tt({ tr: "boğazdaki makas adedi (süre bundan türetilir)", en: "number of switches in the throat (time is derived from this)", de: "Anzahl der Weichen im Weichenbereich (Zeit wird daraus abgeleitet)" })}</Kucuk></div>
                        ) : (
                          <div><Num label={tt({ tr: "Boğaz işgali (elle)", en: "Throat occupation (manual)", de: "Weichenbereichsbelegung (manuell)" })} suffix="s" step={5} value={t.bogazIsgali}
                            onChange={(v) => patchTerminal(uc, { bogazIsgali: Math.max(0, Math.round(v)) })} /><Kucuk>{tt({ tr: "bir trenin boğazı tuttuğu süre", en: "the time one train holds the throat", de: "die Zeit, die ein Zug den Weichenbereich belegt" })}</Kucuk></div>
                        )}
                      </div>
                      <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                        {tt({ tr: "Boğaz = peronlar önündeki ortak makas/geçiş bölgesi; bir tren geçerken kilitlenir. ", en: "Throat = the shared switch/transit zone in front of the platforms; it locks while one train passes. ", de: "Weichenbereich = die gemeinsame Weichen-/Durchfahrtzone vor den Bahnsteigen; sie ist gesperrt, während ein Zug durchfährt. " })}{t.bogazOto ? tt({ tr: "Oto = makas tanzim + geçiş + rota serbest. ", en: "Auto = switch setting + transit + route release. ", de: "Auto = Weichenstellung + Durchfahrt + Routenfreigabe. " }) : ""}{terminalSeriDonus(t) ? <>{tt({ tr: "Tek dönüş yolu (1 S makas): varış+kalkış seri → terminal alt sınırı ", en: "Single turnback path (1 S switch): arrival+departure in series → terminal lower bound ", de: "Einzelner Wendeweg (1 S-Weiche): Ankunft+Abfahrt seriell → Endstellen-Untergrenze " })}<b>{tt({ tr: "2 × boğaz işgali", en: "2 × throat occupation", de: "2 × Weichenbereichsbelegung" })}</b>.</> : <>{tt({ tr: "Çok yol (X veya ≥2 makas): ayrı bacaklar → terminal alt sınırı ", en: "Multiple paths (X or ≥2 switches): separate legs → terminal lower bound ", de: "Mehrere Wege (X oder ≥2 Weichen): getrennte Äste → Endstellen-Untergrenze " })}<b>{tt({ tr: "1 × boğaz işgali", en: "1 × throat occupation", de: "1 × Weichenbereichsbelegung" })}</b>.</>}
                      </p>
                    </div>
                    {/* Dönüş makası sayıları — terminal turnback kapasitesinin ASIL belirleyicisi */}
                    <div className="mt-2 rounded border p-2" style={{ borderColor: brand.ink, background: CK.goodBgSoft }}>
                      <span className="field-label">{tt({ tr: "Dönüş makası (crossover) sayıları — turnback belirleyici", en: "Turnback switch (crossover) counts — turnback determinant", de: "Wendeweichen-(Crossover-)Anzahl — bestimmend für die Wende" })}</span>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <div><Num label={tt({ tr: "S-makas", en: "S switch", de: "S-Weiche" })} suffix="ad" step={1} max={8} value={terminalMakasSayilari(t).s}
                          onChange={(v) => patchTerminal(uc, { sMakas: Math.max(0, Math.round(v)), makasTipi: undefined })} /><Kucuk>{tt({ tr: "her biri 1 dönüş yolu (seri)", en: "each 1 turnback path (in series)", de: "je 1 Wendeweg (seriell)" })}</Kucuk></div>
                        <div><Num label={tt({ tr: "X-makas", en: "X switch", de: "X-Weiche" })} suffix="ad" step={1} max={8} value={terminalMakasSayilari(t).x}
                          onChange={(v) => patchTerminal(uc, { xMakas: Math.max(0, Math.round(v)), makasTipi: undefined })} /><Kucuk>{tt({ tr: "her biri 2 dönüş yolu (ardışık)", en: "each 2 turnback paths (consecutive)", de: "je 2 Wendewege (aufeinanderfolgend)" })}</Kucuk></div>
                      </div>
                      <Kucuk>{(() => { const { s, x } = terminalMakasSayilari(t); const yol = s + x * 2; const etk = terminalDonusParalel(t);
                        return `${s}×S + ${x}×X = ${yol} ${tt({ tr: "dönüş yolu → etkin", en: "turnback paths → effective", de: "Wendewege → effektiv" })} ${etk} (${tt({ tr: "peron", en: "platform", de: "Bahnsteig" })} ${etkinPeronSayisi(t)} ${tt({ tr: "ile sınırlı) → terminal aralığı = peron işgali ÷", en: "limited) → terminal interval = platform occupation ÷", de: "begrenzt) → Endstellen-Intervall = Bahnsteigbelegung ÷" })} ${etk}`; })()}</Kucuk>
                    </div>
                    {t.tip === "dongu" && (
                      <p className="mt-1 text-xs" style={{ color: brand.muted }}>{tt({ tr: "Balon döngüde terminal kısıtı yok (dönüş ~0).", en: "With a balloon loop there is no terminal constraint (turnback ~0).", de: "Bei einer Ballonschleife gibt es keine Endstellen-Einschränkung (Wende ~0)." })}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Gerçekçilik: kalkış ölü zamanı (start-up lost time) */}
            <div className="mb-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Num label={t({ tr: "Kalkış ölü zamanı (varsayılan)", en: "Start-up lost time (default)", de: "Anfahr-Verlustzeit (Standard)" })} suffix="s" step={1} max={30} value={isletme.kalkisOluZamaniSn}
                  onChange={(v) => patchIsletme({ kalkisOluZamaniSn: Math.max(0, Math.min(30, Math.round(v))) })} />
              </div>
              <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                {t({ tr: "Dwell/yeşil sonrası harekete geçme tepkisi (start-up lost time) — her durakta çevrime ve durak bloğunun minimum aralığına eklenir. Hat geneli varsayılan; her durak kendi değerini (aşağıda) girebilir.", en: "The reaction of setting off after dwell/green (start-up lost time) — added at every stop to the cycle and to the stop block's minimum interval. Line-wide default; each stop can enter its own value (below).", de: "Die Anfahrreaktion nach Haltezeit/Grün (Start-up Lost Time) — wird an jeder Haltestelle zum Umlauf und zur Mindestzugfolgezeit des Haltestellenblocks addiert. Streckenweiter Standard; jede Haltestelle kann ihren eigenen Wert eingeben (unten)." })}
              </p>
            </div>

            {/* TEK SONUÇ — bu hatta en fazla kaç tramvay */}
            {maks.gecerli && (
              <div className="rounded-md border-l-4 px-4 py-3" style={{ background: CK.goodBgSoft, borderColor: brand.ink }}>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <div>
                    <span className="text-3xl font-semibold" style={{ color: brand.ink }}>{maks.nTeorik}</span>
                    <span className="ml-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "tramvay — teorik maksimum", en: "trams — theoretical maximum", de: "Straßenbahnen — theoretisches Maximum" })}</span>
                  </div>
                  <div>
                    <span className="text-2xl font-semibold" style={{ color: OK }}>{maks.nSurdurulebilir}</span>
                    <span className="ml-1 text-xs" style={{ color: brand.muted }}>{t({ tr: "sürdürülebilir (UIC 406 tamponlu)", en: "sustainable (UIC 406 buffered)", de: "nachhaltig (UIC 406 gepuffert)" })}</span>
                  </div>
                </div>
                <p className="mt-1 text-[0.7rem]" style={{ color: brand.muted }}>
                  <b>{t({ tr: "Teorik maksimum", en: "Theoretical maximum", de: "Theoretisches Maximum" })}</b>{t({ tr: ": darboğazın izin verdiği fiziksel tavan (sıfır pay). ", en: ": the physical ceiling the bottleneck allows (zero margin). ", de: ": die physische Obergrenze, die der Engpass zulässt (kein Spielraum). " })}<b>{t({ tr: "Sürdürülebilir", en: "Sustainable", de: "Nachhaltig" })}</b>{t({ tr: ": UIC 406 doluluk tavanıyla (blok başına ~%60–75 kullanım) her gün güvenle çalıştırılabilen sayı — küçük gecikmeler zincirlemesin, toparlanma payı kalsın diye teorikten düşüktür (gerçek işletme bunu hedefler).", en: ": the number that can be run safely every day under the UIC 406 occupancy ceiling (~60–75% utilization per block) — lower than the theoretical value so that small delays don't cascade and a recovery margin remains (real operation targets this).", de: ": die Zahl, die unter der UIC-406-Belegungsgrenze (~60–75 % Auslastung pro Block) täglich sicher gefahren werden kann — niedriger als der theoretische Wert, damit kleine Verspätungen sich nicht fortpflanzen und eine Erholungsreserve bleibt (der reale Betrieb strebt dies an)." })}
                </p>
                <p className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                  {t({ tr: "Darboğaz:", en: "Bottleneck:", de: "Engpass:" })} <b>{maks.baglayanAd}</b> · {t({ tr: "min. aralık", en: "min. interval", de: "min. Intervall" })} {sure(maks.hMin)} · {t({ tr: "çevrim", en: "cycle", de: "Umlauf" })} {sure(maks.cevrimSuresi)}
                  <span style={{ color: brand.faint }}> · {t({ tr: "aynı sayı Sefer'de de görünür (tek kaynak); tam kısıt & blocking-time dökümü ", en: "the same number also appears under Service (single source); full constraint & blocking-time breakdown in ", de: "dieselbe Zahl erscheint auch unter Betrieb (eine Quelle); vollständige Einschränkungs- & Blocking-Time-Aufschlüsselung in " })}<Link href="/#sistem" className="underline">{t({ tr: "Sistem Merkezi", en: "System Center", de: "Systemzentrale" })}</Link>{t({ tr: "'nde.", en: ".", de: "." })}</span>
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

      {/* Eksik şart uyarısı */}
      {tumEksik.length > 0 && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: brand.red, background: CK.badBgSoft }}>
          <div className="mb-1 text-sm font-semibold" style={{ color: brand.red }}>{t({ tr: "⚠ Zorunlu şartlar eksik — loop kurulamaz (", en: "⚠ Mandatory conditions missing — loop cannot be built (", de: "⚠ Pflichtbedingungen fehlen — Umlauf kann nicht aufgebaut werden (" })}{tumEksik.length})</div>
          <ul className="ml-4 list-disc text-xs" style={{ color: brand.inkSoft }}>
            {tumEksik.slice(0, 8).map((e, i) => (<li key={i}>{e.mesaj}</li>))}
            {tumEksik.length > 8 && <li>{t({ tr: "… ve ", en: "… and ", de: "… und " })}{tumEksik.length - 8}{t({ tr: " tane daha", en: " more", de: " weitere" })}</li>}
          </ul>
        </div>
      )}

      {/* Hat verisi yükleniyorken (girişli hesapta sayfa yenileme) rings henüz []'dir.
          "Hattınız boş / ring ekle" davetini burada göstermek, veri gelince kaybolan
          bir "aç-kapa" titremesine yol açıyordu; yükleme bitene kadar nötr bir yer
          tutucu gösterip gerçek boşluk kararını veriye bırakıyoruz. */}
      {yukleniyor && rings.length === 0 && (
        <div className="mt-6 rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm" style={{ borderColor: brand.border, color: brand.muted }}>
          {t({ tr: "⟳ Hat yükleniyor…", en: "⟳ Loading line…", de: "⟳ Strecke wird geladen…" })}
        </div>
      )}


      {/* RİNG EDİTÖRÜ başlığı — alttaki kartlar durak zincirinin İLERİ şartlarıdır
          (worst/best köşeleri + makas/hemzemin/tehlike). Üst paneldan görsel olarak ayrık. */}
      {rings.length > 0 && (
        <div className="mt-8 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 pb-2" style={{ borderColor: brand.ink }}>
          <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>{t({ tr: "Ring Editörü", en: "Section Editor", de: "Abschnitts-Editor" })}</span>
          <span className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold" style={{ background: CK.badBgSoft, color: brand.red }}>{rings.length} {t({ tr: "hücre", en: "cells", de: "Zellen" })}</span>
          <span className="text-xs" style={{ color: brand.muted }}>{t({ tr: "— her durak-arası hücrenin ileri şartları: worst/best köşeleri · makas · hemzemin · tehlike. Yukarıda kurduğun zinciri burada detaylandır.", en: "— the advanced conditions of each inter-stop cell: worst/best corner cases · switch · level crossing · hazard. Detail the chain you built above here.", de: "— die erweiterten Bedingungen jeder Abschnittszelle: Worst/Best-Grenzfälle · Weiche · Bahnübergang · Gefahr. Detaillieren Sie hier die oben aufgebaute Kette." })}</span>
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
            isletme={isletme}
            doluluk={dolulukByRing[r.id]}
            ringBasiKm={ringBasiKm[i]}
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
            onKurpEkle={(konum, ekstra) => kurpEkle(r.id, konum, ekstra)}
            onKurpSil={(kid) => kurpSil(r.id, kid)}
            onKurpPatch={(kid, pp) => patchKurp(r.id, kid, pp)}
            onSinyalEkle={(yon, konum, ters) => sinyalEkle(r.id, yon, konum, ters)}
            onSinyalSil={(sid) => sinyalSil(r.id, sid)}
            onSinyalPatch={(sid, pp) => patchSinyal(r.id, sid, pp)}
          />
          </div>
        ))}
      </div>

      {/* Ring ekleme artık ÜSTTEKİ "Duraklar & Mesafeler" panelinden (durak zinciri) —
          tek ekleme yeri, çift buton karmaşası yok. */}

      {/* Eşit şartlar — durak-çiftleri dengeleme önerisi. Hattın ALTINDA: önce hattı
          gör/kur, sonra iyileştirme tavsiyesi (dolu hatta sayfa artık öneriyle açılmaz). */}
      {oneriler.length > 0 && (
        <div className="mt-6">
          <Panel katlanir ozet={t({ tr: "durak-çiftleri denge önerileri", en: "stop-pair balancing suggestions", de: "Ausgleichsvorschläge für Haltestellenpaare" })} baslik={t({ tr: "Eşit Şartlar — Dengeleme Önerileri", en: "Equal Conditions — Balancing Suggestions", de: "Gleiche Bedingungen — Ausgleichsvorschläge" })} aciklama={t({ tr: "Best-case yakın-mesafe hedefi: durak-çiftleri arası worst-case süreler eşitlendikçe headway kararlı olur. Ortalamadan sapan ringler ve öneriler:", en: "Best-case short-distance target: as the worst-case times between stop pairs are equalized, the headway becomes stable. Sections deviating from the average and suggestions:", de: "Best-Case-Kurzstreckenziel: je mehr die Worst-Case-Zeiten zwischen Haltestellenpaaren angeglichen werden, desto stabiler wird die Zugfolgezeit. Vom Durchschnitt abweichende Abschnitte und Vorschläge:" })}>
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
        {t({ tr: "RaySim · Ring editörü — canlı parametreler (Sistem Merkezi'nden): sahasal", en: "RaySim · Section editor — live parameters (from System Center): open-track", de: "RaySim · Abschnitts-Editor — Live-Parameter (aus der Systemzentrale): freie Strecke" })} {kmh(cfg.vSahasal).toFixed(0)} · {t({ tr: "makas", en: "switch", de: "Weiche" })} {kmh(cfg.vMakas).toFixed(0)} · {t({ tr: "hemzemin", en: "level crossing", de: "Bahnübergang" })} {kmh(cfg.vHemzemin).toFixed(0)} km/h · a={cfg.ivme} b={cfg.yavaslama} m/s² · headway {cfg.headway} s
      </footer>
    </div>
  );
}

// ————————————————————————————————————————————————
// Ring kartı
// ————————————————————————————————————————————————

