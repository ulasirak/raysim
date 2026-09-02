"use client";

// raysim — KULLANICI KILAVUZU / TANITIM SİHİRBAZI.
// Yeni kullanıcı asıl olarak GİRİŞ/KAYIT ekranından geçer → kılavuz orada
// (girisModu) bir kez otomatik açılır. Oturum içinde (AppShell) OTOMATİK AÇILMAZ;
// yalnız "Tanıtımı göster" ile (event) açılır — böylece ana sayfa yenilenince
// tekrar çıkmaz (eski bug).
//
// GÖSTERME KONTROLÜ iki katmanlı:
//   • KALICI (localStorage): "bir daha gösterme" işaretliyse bir daha hiç açılmaz.
//   • OTURUMLUK (sessionStorage): bir kez gösterilince aynı oturumda (refresh dahil)
//     yeniden açılmaz — kullanıcı kapatmadan yenilese bile nag olmaz.
// "Tanıtımı göster" (tanitimAc) her iki bayrağı da yok sayıp zorla açar.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { brand } from "@/lib/anaray/brand";

const KALICI = (uid: string | null) => (uid ? `raysim_karsilama_v2_${uid}` : "raysim_karsilama_giris_v2");
const OTURUM = (uid: string | null) => `raysim_karsilama_ses_${uid ?? "giris"}`;
const OLAY = "raysim-tanitim-ac"; // "Tanıtımı göster" tetikleyicisi

/** Tanıtımı zorla aç (menüden ya da giriş ekranı butonundan). */
export function tanitimAc() {
  try { window.dispatchEvent(new CustomEvent(OLAY)); } catch { /* sessiz */ }
}

/** Bu hesap/ziyaretçi için kılavuzu yeniden açılabilir yap (bayrakları temizle). */
export function karsilamaSifirla(uid: string | null) {
  try {
    localStorage.removeItem(KALICI(uid));
    sessionStorage.removeItem(OTURUM(uid));
  } catch { /* sessiz */ }
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
    baslik: "Kendi hattınla başla",
    govde: (
      <div className="flex flex-col gap-3 text-sm leading-relaxed" style={{ color: brand.inkSoft }}>
        <p>
          Hesabın <strong>boş bir hatla</strong> açılır. Sıra şu:
        </p>
        <ol className="flex flex-col gap-2">
          {[
            ["1", "Hattı kur", "Ringler'de durakları, mesafeleri ve makasları gir — GTFS / railML / DXF / shapefile içe aktarabilir ya da coğrafi koordinattan üretebilirsin."],
            ["2", "Simüle et", "Sefer ve Sistem Merkezi'nde canlı ağı, kapasiteyi ve darboğazları çöz."],
            ["3", "Belgele", "Teknik Belgeler'den amblemli, baskıya hazır PDF raporu üret."],
          ].map(([n, b, a]) => (
            <li key={n} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white" style={{ background: brand.red }}>{n}</span>
              <span className="min-w-0">
                <span className="font-medium" style={{ color: brand.ink }}>{b}</span>
                <span className="block text-[0.82rem]" style={{ color: brand.muted }}>{a}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    ),
  },
];

/** girisModu: giriş/kayıt ekranında otomatik açılır. Aksi halde (oturum içi) yalnız
 *  "Tanıtımı göster" event'iyle açılır — otomatik açılmaz. */
export function Karsilama({ girisModu = false }: { girisModu?: boolean } = {}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [acik, setAcik] = useState(false);
  const [i, setI] = useState(0);
  const [birDaha, setBirDaha] = useState(true); // "bir daha gösterme" — varsayılan işaretli

  // OTOMATİK AÇILIŞ yalnız giriş ekranında: kalıcı + oturumluk bayrak yoksa aç,
  // ve açılır açılmaz oturumluk bayrağı yaz (aynı oturumda yenileyince tekrar açılmasın).
  useEffect(() => {
    if (!girisModu) return;
    try {
      if (localStorage.getItem(KALICI(uid)) || sessionStorage.getItem(OTURUM(uid))) return;
      sessionStorage.setItem(OTURUM(uid), "1");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAcik(true);
      setI(0);
    } catch { /* sessiz */ }
  }, [girisModu, uid]);

  // "Tanıtımı göster" — bayrakları yok say, zorla aç.
  useEffect(() => {
    const ac = () => { setI(0); setBirDaha(true); setAcik(true); };
    window.addEventListener(OLAY, ac);
    return () => window.removeEventListener(OLAY, ac);
  }, []);

  const kapat = () => {
    // "Bir daha gösterme" işaretliyse KALICI bayrağı yaz (bir daha hiç açılmaz).
    if (birDaha) { try { localStorage.setItem(KALICI(uid), "1"); } catch { /* sessiz */ } }
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

  const bitir = () => {
    kapat();
    // Oturum içi açıldıysa ilk adıma (Ringler) kaydır; giriş ekranında kaydıracak bir şey yok.
    if (!girisModu) {
      setTimeout(() => {
        document.getElementById("ringler")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
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
          <button onClick={kapat} title="Kapat"
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

        {/* "Bir daha gösterme" seçeneği */}
        <label className="flex cursor-pointer items-center gap-2 border-t px-5 py-2.5 text-xs" style={{ borderColor: brand.border, color: brand.inkSoft }}>
          <input type="checkbox" checked={birDaha} onChange={(e) => setBirDaha(e.target.checked)} className="h-3.5 w-3.5" style={{ accentColor: brand.red }} />
          <span>Bir daha gösterme <span style={{ color: brand.faint }}>· istediğinde “Tanıtımı göster”den tekrar açabilirsin</span></span>
        </label>

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
            <button
              onClick={bitir}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ background: brand.red }}
            >
              {girisModu ? "Anladım" : "Hattı kurmaya başla →"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
