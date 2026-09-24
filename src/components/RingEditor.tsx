"use client";

// raysim — DURAK ARASI RİNG editörü.
// Her durak-arası hücrenin ZORUNLU şartları girilir/düzenlenir (mesafe, makas
// bölgeleri, hemzemin, tehlike noktaları). Her değişiklikte worst/best köşeleri,
// headway (240 s) uygunluğu, durak-çiftleri arası denge ve tren-sayısı
// darboğazı anında yeniden hesaplanır. Hücreler bir loop (kapalı hat) oluşturur.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { useSimConfig, useProje, useArac, useIsletme, useHesap } from "@/components/SimConfigProvider";
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
      catch (e) { alert(e instanceof Error ? e.message : "Yeni hat oluşturulamadı."); }
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

      {/* Silme GERİ AL çubuğu — yanlış silinen durak/ring tek tıkla geri gelir. */}
      {geriAl && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 px-4 py-2 text-sm" style={{ background: CK.amberBg, borderColor: CK.amber, color: brand.ink }}>
          <span>↩︎ Silme işlemi yapıldı. Yanlışlıkla mı? Geri alabilirsin.</span>
          <button onClick={geriAlUygula} className="shrink-0 rounded-md px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90" style={{ background: brand.ink }}>
            ↺ Silmeyi geri al
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
            <span className="font-brand text-lg font-semibold" style={{ color: brand.ink }}>Dışa Aktar</span>
            <span className="ml-2 text-xs" style={{ color: brand.muted }}>railML 2.2 (altyapı + araç + çizelge) · GTFS (çift yön + servis)</span>
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
                ⬆ railML (.xml)
              </button>
              <button type="button" disabled={!gtfsKoordVar}
                title={gtfsKoordVar ? "GTFS .zip indir (duraklar + RaySim çizelgesi)" : "GTFS için durak koordinatı (lat/lon) gerekli — hattı GTFS'ten içe aktarın"}
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
                ⬆ GTFS (.zip)
              </button>
            </div>
            {!gtfsKoordVar && (
              <p className="mt-2 text-[0.7rem]" style={{ color: brand.muted }}>
                GTFS için durakların <b>coğrafi koordinatı (lat/lon)</b> gerekir — GTFS&apos;ten içe aktarınca otomatik gelir, ya da <b>aşağıdan elle gir</b>. railML her hatta çalışır.
              </p>
            )}

            {/* ELLE KOORDİNAT — her durağa WGS84 lat/lon gir → GTFS herhangi bir hatta açılır.
                (Shapefile/DXF projeksiyonlu koordinat WGS84'e çevrilmez — CRS/proj4 gerekir;
                elle giriş her durumda çalışan güvenli yoldur.) */}
            {yazilabilir && duraklar.length > 0 && (
              <details className="mt-3 rounded border" style={{ borderColor: brand.border }}>
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium" style={{ color: brand.ink }}>
                  İstasyon koordinatları (GTFS için) — <span style={{ color: koordSayisi === duraklar.length ? "#16794C" : CK.amberInk }}>{koordSayisi}/{duraklar.length}</span> girildi
                </summary>
                <div className="max-h-64 overflow-auto border-t px-3 py-2" style={{ borderColor: brand.border }}>
                  <p className="mb-2 text-[0.68rem]" style={{ color: brand.muted }}>Enlem/boylam (WGS84, ondalık derece). Tümü dolunca GTFS indirilebilir. <b>İpucu:</b> Google Maps&apos;te durağa sağ tık → koordinat çiftini kopyala.</p>
                  {duraklar.map((d, i) => {
                    const k = isletme.istasyonKoordinat?.[d.ad];
                    return (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                        <span className="w-40 shrink-0 truncate" title={d.ad} style={{ color: brand.inkSoft }}>{i + 1}. {d.ad}</span>
                        <input type="number" step="0.000001" placeholder="enlem" value={k && Number.isFinite(k.lat) ? k.lat : ""} onChange={(e) => koordGuncelle(d.ad, "lat", parseFloat(e.target.value))}
                          className="w-28 rounded border px-1.5 py-0.5" style={{ borderColor: brand.border, color: brand.ink }} />
                        <input type="number" step="0.000001" placeholder="boylam" value={k && Number.isFinite(k.lon) ? k.lon : ""} onChange={(e) => koordGuncelle(d.ad, "lon", parseFloat(e.target.value))}
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
          <Panel katlanir acik ozet={`${rings.length} durak-arası (ring)`} baslik="Duraklar & Mesafeler" aciklama="Hattın başladığı yer: durakları ve aralarındaki mesafe/hızları buradan gir. Başa · ortaya · sona durak ekle, adları düzenle. Her durak-arası bir işletim hücresi (ring) oluşturur — detaylı şartlar aşağıdaki kartlarda. Değişiklikler anında kaydedilir.">
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
                        <span className="text-xs font-semibold" style={{ color: rings[i - 1].dwellOto ? CK.good : brand.ink }}>{Math.round(etkinDwell(rings[i - 1]))}</span>
                        <span className="text-[0.65rem]" style={{ color: brand.muted }}>sn{rings[i - 1].dwellOto ? " (oto)" : ""}</span>
                      </div>
                    )}
                    {duraklar.length > 2 ? (
                      <button onClick={() => silHatirla((rs) => durakSil(rs, i))} title="Durağı sil (orta durak → komşu ringleri birleştirir)"
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
                          <label className="flex items-center gap-1" title="Dwell'i yolcu akışından otomatik hesapla: (inen+binen) ÷ (kapı sayısı × genişlik × akış hızı)">
                            <input type="checkbox" checked={oto} onChange={(e) => patch(r.id, { dwellOto: e.target.checked })} />
                            <span style={{ color: oto ? CK.good : brand.muted }}>oto dwell</span>
                          </label>
                          <span className="flex items-center gap-1" title="Kapı açma süresi (s)">kapı aç
                            <input type="number" min={0} step={1} value={Math.round(dwellBilesen(r).ac)}
                              onChange={(e) => patchDwell(r, "ac", parseFloat(e.target.value) || 0)}
                              className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                          {oto ? (
                            <>
                              <span className="flex items-center gap-1" title="Bu durakta inen yolcu">inen
                                <input type="number" min={0} step={5} value={Math.round(r.inenYolcu ?? 0)}
                                  onChange={(e) => patch(r.id, { inenYolcu: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-12 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                              <span className="flex items-center gap-1" title="Bu durakta binen yolcu">binen
                                <input type="number" min={0} step={5} value={Math.round(r.binenYolcu ?? 0)}
                                  onChange={(e) => patch(r.id, { binenYolcu: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  className="w-12 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                              <span title="Yolcu akışından hesaplanan bölüm" style={{ color: CK.good }}>yolcu {Math.round(yolcuHesap)}s ✓</span>
                              <span className="basis-full rounded border-l-2 py-0.5 pl-2 text-[0.66rem] leading-snug" style={{ borderColor: CK.good, background: CK.goodBgSoft, color: brand.inkSoft }}>
                                <b>oto dwell</b>: bekleme yolcudan hesaplanır → kapı aç {Math.round(dwellBilesen(r).ac)}s + yolcu [(inen+binen) ÷ (kapı {stock.kapiSayisi ?? 4} × genişlik {stock.kapiGenisligi ?? 1.3}m × akış {isletme.yolcuAkisHizi})] + kapı kapa {Math.round(dwellBilesen(r).kapa)}s; en az {isletme.minDurusSuresi}s. Şu an yolcu {Math.round(yolcuHesap)}s → toplam <b>{Math.round(etkinDwell(r))}s</b>.
                              </span>
                            </>
                          ) : (
                            <span className="flex items-center gap-1" title="Yolcu değişimi / iniş-biniş süresi (s)">yolcu
                              <input type="number" min={0} step={1} value={Math.round(dwellBilesen(r).yolcu)}
                                onChange={(e) => patchDwell(r, "yolcu", parseFloat(e.target.value) || 0)}
                                className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                          )}
                          <span className="flex items-center gap-1" title="Kapı kapama süresi (s)">kapı kapa
                            <input type="number" min={0} step={1} value={Math.round(dwellBilesen(r).kapa)}
                              onChange={(e) => patchDwell(r, "kapa", parseFloat(e.target.value) || 0)}
                              className="w-11 rounded border px-1 py-0.5 text-right" style={{ borderColor: brand.border, color: brand.ink }} /></span>
                        </>
                      );
                    })()}
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
                        park eden tren
                        <button type="button" onClick={() => depoQueued(i, Math.max(0, depoDurum(i).q - 1))}
                          className="flex h-5 w-5 items-center justify-center rounded border font-semibold" style={{ borderColor: brand.border, color: brand.ink }} title="Bir tren çıkar">−</button>
                        <input type="number" min={0} max={40} step={1} value={depoDurum(i).q} onChange={(e) => depoQueued(i, parseFloat(e.target.value) || 0)}
                          className="w-12 rounded border px-1 py-0.5 text-center" style={{ borderColor: brand.border, color: brand.ink }} />
                        <button type="button" onClick={() => depoQueued(i, Math.min(40, depoDurum(i).q + 1))}
                          className="flex h-5 w-5 items-center justify-center rounded border font-semibold text-white" style={{ background: brand.ink, borderColor: brand.ink }} title="Park eden tren ekle">+</button>
                        {i === duraklar.length - 1 && <span style={{ color: CK.amber }} title="Hattın sonundaki depo gidiş yönünde tren veremez (gidecek yer yok)">⚠ uç</span>}
                        {(() => {
                          const dr = i === 0 ? rings[0] : rings[i - 1];
                          const makasVar = !!dr && dr.makaslar.length > 0;
                          return makasVar
                            ? <span className="ml-1" style={{ color: "#16794C" }} title="Araçlar servise çıkarken makastan gidiş ya da karşı şeride geçerek dönüş yönüne dağılır.">✓ makas var</span>
                            : <span className="ml-1 font-semibold" style={{ color: brand.red }} title="Parklanma alanında MAKAS ZORUNLUDUR: araç ancak makastan gidiş/dönüş yönüne çıkabilir. Bu durak-arası ring'e makas ekle.">⚠ MAKAS zorunlu — ekle</span>;
                        })()}
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

      {/* MAKSİMUM TRAMVAY & TERMİNALLER — hat DAİMA çift hat gidiş-dönüş çalışır.
          Terminal dönüş şartları girilir → tek sonuç: bu hatta en fazla kaç tramvay.
          En az 2 durak olunca anlamlı; boş hatta gösterilmez. */}
      {duraklar.length >= 2 && (
        <div className="mt-4">
          <Panel katlanir ozet={maks.gecerli ? `${maks.nTeorik} tramvay · sürd. ${maks.nSurdurulebilir}` : "terminal dönüş kapasitesi"} baslik="Maksimum Tramvay Kapasitesi" aciklama="Hat çift hat, gidiş-dönüş çalışır (tramvay gider, döner, tekrar gider — sürekli çevrim). Terminal dönüş şartlarını gir; sistem bu hatta aynı anda en fazla kaç tramvayın sığacağını hesaplar. Darboğaz otomatik isimlenir.">
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
                const durakAd = uc === "terminalBas" ? (duraklar[0]?.ad || "Başlangıç") : (duraklar[duraklar.length - 1]?.ad || "Bitiş");
                return (
                  <div key={uc} className="rounded-md border p-3" style={{ borderColor: brand.border }}>
                    <SubBaslik>{uc === "terminalBas" ? "Başlangıç" : "Bitiş"} terminali — {durakAd}</SubBaslik>
                    <p className="mb-1 text-xs" style={{ color: brand.muted }}>Hattın {uc === "terminalBas" ? "ilk" : "son"} durağı; tren burada ters döner.</p>
                    <label className="mt-2 block">
                      <span className="field-label">Dönüş tipi</span>
                      <select value={t.tip} onChange={(e) => patchTerminal(uc, { tip: e.target.value as DonusTip })}
                        className="mt-1 w-full rounded border px-2 py-1 text-sm" style={{ borderColor: brand.border, color: brand.ink }}>
                        {(Object.keys(DONUS_TIP_AD) as DonusTip[]).map((k) => (
                          <option key={k} value={k}>{DONUS_TIP_AD[k]}</option>
                        ))}
                      </select>
                      <Kucuk>terminalin fiziksel dönüş biçimi</Kucuk>
                    </label>
                    <p className="mt-1 rounded border-l-2 py-1 pl-2 text-[0.68rem] leading-relaxed" style={{ borderColor: t.tip === "dongu" ? CK.good : CK.amber, background: t.tip === "dongu" ? CK.goodBg : CK.amberBg, color: brand.inkSoft }}>
                      {DONUS_TIP_ACIKLAMA[t.tip]}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <Num label="Peron sayısı" suffix="peron" step={1} max={6} value={t.peronSayisi}
                          onChange={(v) => patchTerminal(uc, { peronSayisi: Math.max(1, Math.round(v)) })} />
                        <div className="mt-0.5 flex gap-1">
                          {([[false, "çift yön (toplam)"], [true, "tek yön (yön başına)"]] as const).map(([ty, ad]) => (
                            <button key={String(ty)} type="button" onClick={() => patchTerminal(uc, { peronTekYon: ty })}
                              className="rounded border px-1.5 py-0.5 text-[0.6rem] font-medium"
                              style={(!!t.peronTekYon === ty) ? { background: brand.ink, color: "#fff", borderColor: brand.ink } : { borderColor: brand.border, color: brand.inkSoft }}>
                              {ad}
                            </button>
                          ))}
                        </div>
                        <Kucuk>{t.peronTekYon
                          ? `yön başına ${t.peronSayisi} peron → etkin ${t.peronSayisi * 2} (gidiş+dönüş çift hat)`
                          : "terminaldeki TOPLAM dönüş peronu — çift hatta genelde 2"}</Kucuk>
                      </div>
                    </div>
                    {/* Peron işgal süresi — bileşenli (ince model), toplam yetkili */}
                    <div className="mt-2 rounded border p-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="field-label">Peron işgal süresi</span>
                        <span className="text-sm font-semibold" style={{ color: brand.ink }}>{Math.round(t.peronIsgali)} s</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Num label="Varış tamponu" suffix="s" step={5} value={terminalBilesen(t).varis}
                          onChange={(v) => patchTerminalBilesen(uc, "varis", v)} /><Kucuk>perona girip durana dek</Kucuk></div>
                        <div><Num label="İniş/biniş" suffix="s" step={5} value={terminalBilesen(t).inis}
                          onChange={(v) => patchTerminalBilesen(uc, "inis", v)} /><Kucuk>yolcu iniş-biniş</Kucuk></div>
                        <div><Num label="Ters dönüş" suffix="s" step={5} value={terminalBilesen(t).ters}
                          onChange={(v) => patchTerminalBilesen(uc, "ters", v)} /><Kucuk>yön değiştirme</Kucuk></div>
                        <div><Num label="Kalkış temizleme" suffix="s" step={5} value={terminalBilesen(t).kalkis}
                          onChange={(v) => patchTerminalBilesen(uc, "kalkis", v)} /><Kucuk>kalkıp boğazı boşaltana dek</Kucuk></div>
                        <div><Num label="Toparlanma (recovery)" suffix="s" step={5} value={terminalBilesen(t).topar}
                          onChange={(v) => patchTerminalBilesen(uc, "topar", v)} /><Kucuk>gecikme payı (program güvenliği)</Kucuk></div>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                        Toplam = trenin peronu tuttuğu tam süre. Terminal aralığı = bu ÷ peron. <b>Toparlanma</b>: gecikmeleri yutan program payı (schedule recovery).
                      </p>
                    </div>
                    {/* Boğaz (throat) işgali — oto (makastan) veya elle */}
                    <div className="mt-2 rounded border p-2" style={{ borderColor: brand.border, background: "#FBFCFD" }}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="field-label">Boğaz işgali</span>
                        <span className="text-sm font-semibold" style={{ color: brand.ink }}>{etkinBogazIsgali(t, cfg)} s</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs" style={{ color: brand.inkSoft }}>
                        <input type="checkbox" checked={t.bogazOto} onChange={(e) => patchTerminal(uc, { bogazOto: e.target.checked })} />
                        Makastan otomatik türet
                      </label>
                      <div className="mt-1">
                        {t.bogazOto ? (
                          <div><Num label="Boğaz makas (crossover) sayısı" suffix="makas" step={1} max={8} value={t.bogazMakasSayisi}
                            onChange={(v) => patchTerminal(uc, { bogazMakasSayisi: Math.max(1, Math.round(v)) })} /><Kucuk>boğazdaki makas adedi (süre bundan türetilir)</Kucuk></div>
                        ) : (
                          <div><Num label="Boğaz işgali (elle)" suffix="s" step={5} value={t.bogazIsgali}
                            onChange={(v) => patchTerminal(uc, { bogazIsgali: Math.max(0, Math.round(v)) })} /><Kucuk>bir trenin boğazı tuttuğu süre</Kucuk></div>
                        )}
                      </div>
                      <p className="mt-1 text-xs" style={{ color: brand.muted }}>
                        Boğaz = peronlar önündeki ortak makas/geçiş bölgesi; bir tren geçerken kilitlenir. {t.bogazOto ? "Oto = makas tanzim + geçiş + rota serbest. " : ""}{terminalSeriDonus(t) ? <>Tek dönüş yolu (1 S makas): varış+kalkış seri → terminal alt sınırı <b>2 × boğaz işgali</b>.</> : <>Çok yol (X veya ≥2 makas): ayrı bacaklar → terminal alt sınırı <b>1 × boğaz işgali</b>.</>}
                      </p>
                    </div>
                    {/* Dönüş makası sayıları — terminal turnback kapasitesinin ASIL belirleyicisi */}
                    <div className="mt-2 rounded border p-2" style={{ borderColor: brand.ink, background: CK.goodBgSoft }}>
                      <span className="field-label">Dönüş makası (crossover) sayıları — turnback belirleyici</span>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <div><Num label="S-makas" suffix="ad" step={1} max={8} value={terminalMakasSayilari(t).s}
                          onChange={(v) => patchTerminal(uc, { sMakas: Math.max(0, Math.round(v)), makasTipi: undefined })} /><Kucuk>her biri 1 dönüş yolu (seri)</Kucuk></div>
                        <div><Num label="X-makas" suffix="ad" step={1} max={8} value={terminalMakasSayilari(t).x}
                          onChange={(v) => patchTerminal(uc, { xMakas: Math.max(0, Math.round(v)), makasTipi: undefined })} /><Kucuk>her biri 2 dönüş yolu (ardışık)</Kucuk></div>
                      </div>
                      <Kucuk>{(() => { const { s, x } = terminalMakasSayilari(t); const yol = s + x * 2; const etk = terminalDonusParalel(t);
                        return `${s}×S + ${x}×X = ${yol} dönüş yolu → etkin ${etk} (peron ${etkinPeronSayisi(t)} ile sınırlı) → terminal aralığı = peron işgali ÷ ${etk}`; })()}</Kucuk>
                    </div>
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
                <p className="mt-1 text-[0.7rem]" style={{ color: brand.muted }}>
                  <b>Teorik maksimum</b>: darboğazın izin verdiği fiziksel tavan (sıfır pay). <b>Sürdürülebilir</b>: UIC 406 doluluk tavanıyla (blok başına ~%60–75 kullanım) her gün güvenle çalıştırılabilen sayı — küçük gecikmeler zincirlemesin, toparlanma payı kalsın diye teorikten düşüktür (gerçek işletme bunu hedefler).
                </p>
                <p className="mt-1 text-xs" style={{ color: brand.inkSoft }}>
                  Darboğaz: <b>{maks.baglayanAd}</b> · min. aralık {sure(maks.hMin)} · çevrim {sure(maks.cevrimSuresi)}
                  <span style={{ color: brand.faint }}> · aynı sayı Sefer'de de görünür (tek kaynak); tam kısıt & blocking-time dökümü <Link href="/#sistem" className="underline">Sistem Merkezi</Link>'nde.</span>
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
          <Panel katlanir ozet="durak-çiftleri denge önerileri" baslik="Eşit Şartlar — Dengeleme Önerileri" aciklama="Best-case yakın-mesafe hedefi: durak-çiftleri arası worst-case süreler eşitlendikçe headway kararlı olur. Ortalamadan sapan ringler ve öneriler:">
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

