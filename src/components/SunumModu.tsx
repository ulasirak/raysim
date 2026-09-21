"use client";

// raysim — SUNUM / HİKAYE MODU (Büyük sıçrama H).
// Sistemi tek nefeste anlatan rehberli pitch: KUR → ANALİZ → SİSTEM → BELGELE →
// KARŞILAŞTIR. Her adımda ilgili bölüme yumuşak kaydırır ve altta kısa bir anlatım
// şeridi gösterir. Sağ-alt "başa dön" ile çakışmasın diye sol-altta başlatılır;
// klavye ← → ile gezinir, Esc ile çıkar. Ana sayfada (tek-sayfa stüdyo) çalışır.

import { useEffect, useState } from "react";
import { brand } from "@/lib/anaray/brand";
import type { BolumSlug } from "@/components/TekSayfa";

// `tikla`: bu adıma girince OTO-tıklanacak butonlar (data-sunum anahtarı) — sunum,
// adımın gerektirdiği görünümü kendisi açar (ör. filoyu onayla → Harita'ya geç).
// `hedefId`: kaydırma hedefi slug yerine (ör. "canli" = Canlı Ağ/harita paneli).
const ADIMLAR: { slug: BolumSlug; hedefId?: string; tikla?: string[]; no: string; faz: string; baslik: string; anlatim: string }[] = [
  { slug: "ringler", no: "1", faz: "KUR", baslik: "Hattı kur", anlatim: "Durak arası ringleri, makas bölgelerini ve kurpları gerçek CAD verisiyle tanımla — buradaki her veri kalıcıdır." },
  { slug: "sefer", no: "2", faz: "ANALİZ ET", baslik: "Simüle et", anlatim: "Hattı canlı ağda çalıştır: mikroskobik fizik, ulaşılan sefer aralığı, ters işletme ve tarife tek akışta." },
  { slug: "sefer", hedefId: "canli", tikla: ["filo-onayla", "harita"], no: "3", faz: "HARİTA", baslik: "Gerçek harita & gidiş-geliş", anlatim: "Aynı ağı GERÇEK haritada gör: işleyen hatta koordinatlar OpenStreetMap'ten OTOMATİK gelir; inşaat/yeni hatta CAD güzergâhından tek tıkla içe aktarılır. Trenler çift-ray gidiş-geliş (mavi gidiş · turuncu dönüş) + yön oklarıyla akar; tekerlek/butonlarla yakınlaş-uzaklaş, sürükleyerek gez." },
  { slug: "sefer", hedefId: "canli", tikla: ["harita"], no: "4", faz: "HARİTA", baslik: "Hız sınırı & kurp konfor", anlatim: "Haritada makas/geçit/kurp hız sınırları km/h ile işaretli; kurp konfor önerileri HER İSTASYONDAN alınan yolcu sayısına (doluluk) eşlenir. Bir işarete TIKLA → hız sınırı + öneri popup'ı; Ringler'de düzenle, anında haritaya yansır." },
  { slug: "sistem", no: "5", faz: "SİSTEM", baslik: "Kapasite & sinyalizasyon", anlatim: "UIC 406 kapasite, blocking-time, doğrulama (V&V), kilitleme kontrol tablosu ve karar-destek — hepsi bir arada." },
  { slug: "belgeler", no: "6", faz: "BELGELE", baslik: "Raporla", anlatim: "Analizden profesyonel, izlenebilir PDF tasarım dokümantasyonu üret — her sayı girdi+yöntem künyeli." },
  { slug: "karsilastirma", no: "7", faz: "KARŞILAŞTIR", baslik: "Karar ver", anlatim: "Senaryoları/projeleri yan yana koy — objektif, sayıya dayalı karar desteği." },
];

export function SunumModu() {
  const [aktif, setAktif] = useState(false);
  const [i, setI] = useState(0);
  const [oto, setOto] = useState(false);

  const git = (n: number) => setI(Math.max(0, Math.min(ADIMLAR.length - 1, n)));

  // Oto-oynat: her adımda ~6,5 s sonra ilerle; son adımda oto kapanır (hands-free pitch).
  useEffect(() => {
    if (!aktif || !oto) return;
    const son = i >= ADIMLAR.length - 1;
    const id = setTimeout(() => { if (son) setOto(false); else setI(i + 1); }, son ? 3000 : 6500);
    return () => clearTimeout(id);
  }, [aktif, oto, i]);

  // Adım değişince: adımın gerektirdiği butonları OTO-tıkla (ör. filoyu onayla → Harita'ya
  // geç), sonra ilgili bölüme/haritaya kaydır (görünüm render'ı için küçük gecikme).
  useEffect(() => {
    if (!aktif) return;
    const a = ADIMLAR[i];
    for (const key of a.tikla ?? []) {
      document.querySelector<HTMLButtonElement>(`[data-sunum="${key}"]`)?.click();
    }
    const t = setTimeout(() => {
      document.getElementById(a.hedefId ?? a.slug)?.scrollIntoView({ behavior: "smooth", block: a.hedefId ? "center" : "start" });
    }, a.tikla?.length ? 260 : 0);
    return () => clearTimeout(t);
  }, [aktif, i]);

  // Klavye: ← → gezinir, Esc çıkar.
  useEffect(() => {
    if (!aktif) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); git(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); git(i - 1); }
      else if (e.key === "Escape") setAktif(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [aktif, i]);

  if (!aktif) {
    return (
      <button
        type="button"
        data-noprint
        onClick={() => { setI(0); setOto(false); setAktif(true); }}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
        style={{ background: "#0C2233", borderColor: "#A8842C", color: "#fff" }}
        title="Sistemi tek nefeste gezdiren rehberli sunum"
      >
        <span aria-hidden="true">▷</span> Sunum Modu
      </button>
    );
  }

  const a = ADIMLAR[i];
  const son = i === ADIMLAR.length - 1;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 shadow-2xl" data-noprint
      style={{ background: "linear-gradient(180deg,#0F2B40 0%,#0C2233 100%)", borderColor: brand.gold }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        {/* Faz rozeti + adım */}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold tabular-nums"
            style={{ background: brand.red, color: "#fff", boxShadow: `0 0 0 4px ${brand.red}33` }}>{a.no}</span>
          <div className="min-w-0">
            <div className="font-brand text-[0.7rem] font-bold tracking-[0.2em]" style={{ color: "#E7D9B0" }}>{a.faz}</div>
            <div className="text-sm font-semibold text-white">{a.baslik}</div>
          </div>
        </div>
        {/* Anlatım */}
        <p className="min-w-0 flex-1 text-xs leading-snug sm:px-3" style={{ color: "#AEBECB" }}>{a.anlatim}</p>
        {/* İlerleme noktaları */}
        <div className="flex items-center gap-1.5">
          {ADIMLAR.map((s, k) => (
            <button key={s.slug} type="button" onClick={() => git(k)} aria-label={`Adım ${k + 1}`}
              className="h-2 rounded-full transition-all"
              style={{ width: k === i ? 18 : 8, background: k === i ? brand.gold : "#31536B" }} />
          ))}
        </div>
        {/* Kontroller */}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOto((o) => !o)} aria-label={oto ? "Duraklat" : "Oto-oynat"}
            title={oto ? "Duraklat" : "Otomatik ilerlet"}
            className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={{ background: oto ? brand.gold : "#12314A", color: oto ? "#0C2233" : "#fff" }}>
            {oto ? "⏸" : "⏵"}
          </button>
          <button type="button" onClick={() => git(i - 1)} disabled={i === 0}
            className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            style={{ border: "1px solid #31536B", color: "#fff" }}>◁ Geri</button>
          {son ? (
            <button type="button" onClick={() => { setOto(false); setAktif(false); }}
              className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ background: brand.gold, color: "#0C2233" }}>Bitir ✓</button>
          ) : (
            <button type="button" onClick={() => git(i + 1)}
              className="rounded-md px-3 py-1.5 text-xs font-bold text-white" style={{ background: brand.red }}>İleri ▷</button>
          )}
          <button type="button" onClick={() => { setOto(false); setAktif(false); }} aria-label="Sunumdan çık"
            className="rounded-md px-2 py-1.5 text-xs" style={{ color: "#8494A3" }}>✕</button>
        </div>
      </div>
    </div>
  );
}
