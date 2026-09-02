"use client";

// raysim — PAYLAŞIM PANOSU (salt-okunur link).
// Hesap menüsündeki iki ayrı "paylaşımı aç/kapat" + "linki kopyala" satırının yerini
// alan tek, net panel: durum anahtarı · okunur link alanı · kopyala (geri bildirimli) ·
// QR (telefonla tara) · sistem paylaşım sayfası (mobil). Hepsi salt-okunur; yazma
// asla açılmaz. Kapatınca erişim anında kesilir (Firestore kuralı).

import { useEffect, useMemo, useRef, useState } from "react";
import { useHesap } from "@/components/SimConfigProvider";
import { qrSvgString } from "@/lib/anaray/qr";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function PaylasimPano() {
  const { aktifId, aktifAd, paylasimAcik, paylasimDegistir } = useHesap();
  const [kopyalandi, setKopyalandi] = useState(false);
  const [qrAcik, setQrAcik] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [webShareVar, setWebShareVar] = useState(false);

  const link = useMemo(
    () => (aktifId && typeof window !== "undefined" ? `${window.location.origin}/?proje=${aktifId}` : ""),
    [aktifId],
  );

  // Web Share API (navigator.share) yalnız güvenli bağlamda + destekleyen (çoğu mobil)
  // tarayıcıda vardır — mount'ta belirle, yoksa düğmeyi gösterme.
  useEffect(() => {
    // Client-only özellik tespiti — SSR'de navigator yok; mount'ta bir kez belirlenir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebShareVar(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const qrRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (qrAcik && qrRef.current && link) qrRef.current.innerHTML = qrSvgString(link, 132, brand.ink);
  }, [qrAcik, link]);

  const kopyala = async () => {
    if (!link) return;
    try {
      await navigator.clipboard?.writeText(link);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch { /* pano erişimi yoksa sessiz — kullanıcı alanı elle seçebilir */ }
  };

  const paylas = async () => {
    if (!link) return;
    try {
      await navigator.share?.({ title: `RaySim — ${aktifAd}`, text: `RaySim hat simülasyonu: ${aktifAd}`, url: link });
    } catch { /* kullanıcı vazgeçti / desteklenmiyor — sessiz */ }
  };

  const degistir = async (acik: boolean) => {
    setMesgul(true);
    try { await paylasimDegistir(acik); } catch { /* durum hesap çubuğunda gösterilir */ } finally { setMesgul(false); }
  };

  return (
    <div className="border-b px-3 py-2.5" style={{ borderColor: brand.border }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="field-label" style={{ color: brand.faint }}>PAYLAŞIM (SALT-OKUNUR)</span>
        {/* Durum anahtarı */}
        <button
          onClick={() => degistir(!paylasimAcik)}
          disabled={mesgul || !aktifId}
          title={paylasimAcik ? "Paylaşımı kapat — erişim anında kesilir" : "Salt-okunur link oluştur"}
          className="relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50"
          style={{ background: paylasimAcik ? CK.good : brand.borderStrong }}
          aria-pressed={paylasimAcik}
        >
          <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition" style={{ transform: paylasimAcik ? "translateX(18px)" : "translateX(2px)" }} />
        </button>
      </div>

      {paylasimAcik ? (
        <div>
          {/* Okunur link + kopyala */}
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-[0.7rem]"
              style={{ borderColor: brand.border, color: brand.inkSoft, background: brand.paper }}
            />
            <button onClick={kopyala} className="shrink-0 rounded border px-2 py-1 text-[0.7rem] font-medium transition hover:bg-slate-50"
              style={{ borderColor: brand.borderStrong, color: kopyalandi ? CK.good : brand.ink }}>
              {kopyalandi ? "✓" : "Kopyala"}
            </button>
          </div>

          {/* Aksiyonlar: QR + (mobil) sistem paylaşımı */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setQrAcik((a) => !a)} className="rounded border px-2 py-1 text-[0.7rem] font-medium transition hover:bg-slate-50"
              style={{ borderColor: brand.border, color: brand.inkSoft }}>
              {qrAcik ? "QR gizle" : "📷 QR (telefonla tara)"}
            </button>
            {webShareVar && (
              <button onClick={paylas} className="rounded border px-2 py-1 text-[0.7rem] font-medium transition hover:bg-slate-50"
                style={{ borderColor: brand.border, color: brand.inkSoft }}>
                📱 Paylaş
              </button>
            )}
          </div>

          {qrAcik && (
            <div className="mt-2 flex flex-col items-center gap-1 rounded border p-2" style={{ borderColor: brand.border, background: brand.surface }}>
              <div ref={qrRef} aria-label="Paylaşım linki QR kodu" />
              <span className="text-[0.65rem]" style={{ color: brand.muted }}>Telefon kamerasıyla tarayın — hat salt-okunur açılır.</span>
            </div>
          )}

          <p className="mt-1.5 text-[0.65rem] leading-snug" style={{ color: brand.muted }}>
            Linki bilen herkes <b>“{aktifAd}”</b> hattını yalnız <b>görüntüler</b>, değiştiremez. Kapatınca erişim anında kesilir.
          </p>
        </div>
      ) : (
        <p className="text-[0.7rem] leading-snug" style={{ color: brand.muted }}>
          Açarsanız <b>salt-okunur</b> bir link üretilir: linki verdiğiniz kişi hattı görüntüler ama değiştiremez. Rapor QR&apos;ı da bu hatta bağlanır.
        </p>
      )}
    </div>
  );
}
