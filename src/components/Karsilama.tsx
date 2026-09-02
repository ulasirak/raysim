"use client";

// raysim — İLK GİRİŞ KARŞILAMA SİHİRBAZI (onboarding).
// Yeni kullanıcı boş "İlk hattım" ile açılıp yönlendirmesiz boş bir editöre
// bakıyordu. Bu sihirbaz, ilk girişte bir kez, boru hattını (KUR → ANALİZ →
// BELGELE → KARŞILAŞTIR) tanıtır ve kullanıcıyı ilk adıma (Ringler) taşır ya da
// örnek bir Konya hattını ayrı sekmede incelemeye yönlendirir.
//
// GÖRÜNME KOŞULU: giriş yapmış + yazılabilir (kendi hattı) + paylaşım/demo DEĞİL
// + bu hesap için daha önce kapatılmamış (localStorage bayrağı uid'e bağlı).
// Kapanınca bayrak yazılır; bir daha açılmaz. "Sihirbazı tekrar göster" için
// bayrağı sıfırlayan bir kanca da dışa verilir (HesapCubugu ileride kullanabilir).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";

const BAYRAK = (uid: string) => `raysim_karsilama_v1_${uid}`;

/** Sihirbazı bu hesap için yeniden açılabilir yap (bayrağı sil). */
export function karsilamaSifirla(uid: string) {
  try { localStorage.removeItem(BAYRAK(uid)); } catch { /* sessiz */ }
}

interface Adim {
  rozet: string;
  baslik: string;
  govde: React.ReactNode;
}

// Boru hattı istasyonları — AppShell metro hattıyla aynı sıra/anlam.
const ISTASYONLAR: { no: number; ad: string; not: string }[] = [
  { no: 1, ad: "Durak Arası Ringler", not: "Hattı ve makas bölgelerini kur — buradaki her veri kalıcı." },
  { no: 2, ad: "Sefer Simülasyonu", not: "Kurduğun hattı simüle et: canlı ağ, fizik, sefer aralığı." },
  { no: 3, ad: "Sistem Merkezi", not: "Kapasite · blocking-time · darboğaz teşhisi." },
  { no: 4, ad: "Ters İşletme", not: "Kısa dönüş, makas varyasyonları, talebe göre filo." },
  { no: 5, ad: "Teknik Belgeler", not: "Analizden profesyonel PDF rapor üret." },
  { no: 6, ad: "Karşılaştırma", not: "Senaryoları yan yana koy — karar desteği." },
];

const ADIMLAR: Adim[] = [
  {
    rozet: "HOŞ GELDİN",
    baslik: "RaySim'e hoş geldin",
    govde: (
      <p className="text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
        RaySim, bir demiryolu/tramvay hattını uçtan uca kurup simüle ettiğin,
        kapasitesini ve darboğazlarını çözümlediğin, sonra bunlardan profesyonel
        dokümantasyon ürettiğin bir <strong>ağ simülasyon sistemidir</strong>.
        Blocking-time · Sperrzeitentreppe · UIC 406 metodolojisine dayanan
        bağımsız bir çekirdek kullanır. Aşağıda nasıl çalıştığını 30 saniyede
        gösterelim.
      </p>
    ),
  },
  {
    rozet: "BORU HATTI",
    baslik: "Altı istasyonluk bir iş akışı",
    govde: (
      <div>
        <p className="mb-3 text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
          Üstteki metro hattı, verinin akışıdır: soldan sağa <strong>kur → analiz
          et → belgele</strong>. Yukarıdan aşağı kaydırarak ilerlersin.
        </p>
        <ul className="flex flex-col gap-2">
          {ISTASYONLAR.map((s) => (
            <li key={s.no} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[0.68rem] font-semibold tabular-nums"
                style={{ background: brand.ink, borderColor: brand.ink, color: "#fff" }}
              >
                {s.no}
              </span>
              <span className="min-w-0 text-sm leading-tight">
                <span className="font-medium" style={{ color: brand.ink }}>{s.ad}</span>
                <span className="block text-[0.78rem]" style={{ color: brand.muted }}>{s.not}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    rozet: "BAŞLARKEN",
    baslik: "İki yoldan başlayabilirsin",
    govde: (
      <div className="flex flex-col gap-3 text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
        <p>
          Hesabın <strong>boş bir hatla</strong> açıldı. İki seçeneğin var:
        </p>
        <div className="rounded-md border p-3" style={{ borderColor: brand.border, background: brand.paper }}>
          <div className="font-medium" style={{ color: brand.ink }}>① Kendi hattını kur</div>
          <div className="text-[0.82rem]" style={{ color: brand.muted }}>
            Ringler'de durakları, mesafeleri ve makasları gir. GTFS / railML / DXF /
            shapefile içe aktarabilir ya da coğrafi koordinattan üretebilirsin.
          </div>
        </div>
        <div className="rounded-md border p-3" style={{ borderColor: brand.border, background: brand.paper }}>
          <div className="font-medium" style={{ color: brand.ink }}>② Örnek Konya hattını incele</div>
          <div className="text-[0.82rem]" style={{ color: brand.muted }}>
            Gerçek CAD verisinden hazırlanmış bir tramvay hattını yeni sekmede aç,
            canlı simülasyonu oynat, çalışan bir örneği kurcala. (Kendi hattın
            olduğu gibi kalır.)
          </div>
        </div>
      </div>
    ),
  },
];

export function Karsilama() {
  const { user } = useAuth();
  const { paylasimGorunumu, demoMu } = useHesap();
  const [acik, setAcik] = useState(false);
  const [i, setI] = useState(0);

  // Görünme kararı: giriş yapmış + kendi hattı görünümü + bayrak yazılmamış.
  useEffect(() => {
    if (!user || paylasimGorunumu || demoMu) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(BAYRAK(user.uid))) setAcik(true);
    } catch { /* sessiz */ }
  }, [user, paylasimGorunumu, demoMu]);

  const kapat = () => {
    if (user) { try { localStorage.setItem(BAYRAK(user.uid), "1"); } catch { /* sessiz */ } }
    setAcik(false);
  };

  // ESC ile kapat.
  useEffect(() => {
    if (!acik) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") kapat(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  if (!acik) return null;

  const sonAdim = i === ADIMLAR.length - 1;
  const adim = ADIMLAR[i];

  const hattaGit = () => {
    kapat();
    // Kısa gecikme: modal kapanıp DOM oturunca ankora kaydır.
    setTimeout(() => {
      const el = document.getElementById("ringler");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const ornekIncele = () => {
    // Ayrı sekmede aç — kullanıcının kendi oturumu/hattı bozulmasın.
    try { window.open("/?hat=birlesik", "_blank", "noopener"); } catch { /* sessiz */ }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/55 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="RaySim tanıtımı"
      onClick={(e) => { if (e.target === e.currentTarget) kapat(); }}
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Başlık şeridi */}
        <div className="flex items-center justify-between rounded-t-xl px-5 py-3"
          style={{ background: "linear-gradient(180deg, #0F2B40 0%, #0C2233 100%)" }}>
          <span className="font-brand text-sm font-semibold tracking-[0.16em] text-white">RaySim</span>
          <button onClick={kapat} title="Kapat (bir daha gösterme)"
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">
            ✕ Atla
          </button>
        </div>

        {/* İçerik */}
        <div className="px-5 pb-2 pt-5">
          <span className="font-brand text-[0.7rem] font-bold tracking-[0.22em]" style={{ color: brand.red }}>
            {adim.rozet}
          </span>
          <h2 className="mb-3 mt-1 text-lg font-semibold" style={{ color: brand.ink }}>{adim.baslik}</h2>
          {adim.govde}
        </div>

        {/* İlerleme noktaları */}
        <div className="flex items-center justify-center gap-1.5 py-4">
          {ADIMLAR.map((_, k) => (
            <span key={k} className="h-1.5 rounded-full transition-all"
              style={{ width: k === i ? 18 : 6, background: k === i ? brand.red : brand.borderStrong }} />
          ))}
        </div>

        {/* Aksiyonlar */}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: brand.border }}>
          <button
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={i === 0}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition enabled:hover:bg-slate-50 disabled:opacity-40"
            style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}
          >
            ← Geri
          </button>

          {!sonAdim ? (
            <button
              onClick={() => setI((v) => Math.min(ADIMLAR.length - 1, v + 1))}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: brand.red }}
            >
              İleri →
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={ornekIncele}
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50"
                style={{ borderColor: brand.borderStrong, color: brand.inkSoft }}
              >
                Örneği incele ↗
              </button>
              <button
                onClick={hattaGit}
                className="rounded-md px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                style={{ background: brand.red }}
              >
                Hattı kurmaya başla →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
