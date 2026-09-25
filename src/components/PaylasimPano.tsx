"use client";

// raysim — PAYLAŞIM PANOSU (salt-okunur link).
// Hesap menüsündeki iki ayrı "paylaşımı aç/kapat" + "linki kopyala" satırının yerini
// alan tek, net panel: durum anahtarı · okunur link alanı · kopyala (geri bildirimli) ·
// QR (telefonla tara) · sistem paylaşım sayfası (mobil). Hepsi salt-okunur; yazma
// asla açılmaz. Kapatınca erişim anında kesilir (Firestore kuralı).

import { useEffect, useMemo, useRef, useState } from "react";
import { useHesap } from "@/components/SimConfigProvider";
import { useDil } from "@/components/DilProvider";
import { qrSvgString } from "@/lib/anaray/qr";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function PaylasimPano() {
  const { aktifId, aktifAd, paylasimAcik, paylasimDegistir } = useHesap();
  const { t } = useDil();
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
      await navigator.share?.({ title: `RaySim — ${aktifAd}`, text: `RaySim ${t({ tr: "hat simülasyonu", en: "line simulation", de: "Liniensimulation" })}: ${aktifAd}`, url: link });
    } catch { /* kullanıcı vazgeçti / desteklenmiyor — sessiz */ }
  };

  const degistir = async (acik: boolean) => {
    setMesgul(true);
    try { await paylasimDegistir(acik); } catch { /* durum hesap çubuğunda gösterilir */ } finally { setMesgul(false); }
  };

  return (
    <div className="border-b px-3 py-2.5" style={{ borderColor: brand.border }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="field-label" style={{ color: paylasimAcik ? CK.good : brand.faint }}>
          {paylasimAcik ? t({ tr: "PAYLAŞIM LİNKİ · AÇIK (SALT-OKUNUR)", en: "SHARE LINK · ON (READ-ONLY)", de: "FREIGABELINK · AN (SCHREIBGESCHÜTZT)" }) : t({ tr: "PAYLAŞIM LİNKİ OLUŞTUR", en: "CREATE SHARE LINK", de: "FREIGABELINK ERSTELLEN" })}
        </span>
        {/* Durum anahtarı */}
        <button
          onClick={() => degistir(!paylasimAcik)}
          disabled={mesgul || !aktifId}
          title={paylasimAcik ? t({ tr: "Paylaşımı kapat — erişim anında kesilir", en: "Turn off sharing — access is cut immediately", de: "Freigabe deaktivieren — Zugriff wird sofort getrennt" }) : t({ tr: "Salt-okunur link oluştur", en: "Create read-only link", de: "Schreibgeschützten Link erstellen" })}
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
              {kopyalandi ? "✓" : t({ tr: "Kopyala", en: "Copy", de: "Kopieren" })}
            </button>
          </div>

          {/* Aksiyonlar: QR + (mobil) sistem paylaşımı */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setQrAcik((a) => !a)} className="rounded border px-2 py-1 text-[0.7rem] font-medium transition hover:bg-slate-50"
              style={{ borderColor: brand.border, color: brand.inkSoft }}>
              {qrAcik ? t({ tr: "QR gizle", en: "Hide QR", de: "QR ausblenden" }) : t({ tr: "📷 QR (telefonla tara)", en: "📷 QR (scan with phone)", de: "📷 QR (mit Handy scannen)" })}
            </button>
            {webShareVar && (
              <button onClick={paylas} className="rounded border px-2 py-1 text-[0.7rem] font-medium transition hover:bg-slate-50"
                style={{ borderColor: brand.border, color: brand.inkSoft }}>
                📱 {t({ tr: "Paylaş", en: "Share", de: "Teilen" })}
              </button>
            )}
          </div>

          {qrAcik && (
            <div className="mt-2 flex flex-col items-center gap-1 rounded border p-2" style={{ borderColor: brand.border, background: brand.surface }}>
              <div ref={qrRef} aria-label={t({ tr: "Paylaşım linki QR kodu", en: "Share link QR code", de: "Freigabelink-QR-Code" })} />
              <span className="text-[0.65rem]" style={{ color: brand.muted }}>{t({ tr: "Telefon kamerasıyla tarayın — hat salt-okunur açılır.", en: "Scan with your phone camera — the line opens read-only.", de: "Mit der Handykamera scannen — die Linie öffnet schreibgeschützt." })}</span>
            </div>
          )}

          <p className="mt-1.5 text-[0.65rem] leading-snug" style={{ color: brand.muted }}>
            {t({ tr: "Linki bilen herkes ", en: "Anyone with the link, for the ", de: "Jeder mit dem Link kann für die Linie " })}<b>“{aktifAd}”</b>{t({ tr: " hattını yalnız ", en: " line, can only ", de: " nur " })}<b>{t({ tr: "görüntüler", en: "view", de: "ansehen" })}</b>{t({ tr: ", değiştiremez. Kapatınca erişim anında kesilir.", en: ", not change it. Access is cut immediately when turned off.", de: ", nicht ändern. Beim Deaktivieren wird der Zugriff sofort getrennt." })}
          </p>
        </div>
      ) : (
        <p className="text-[0.7rem] leading-snug" style={{ color: brand.muted }}>
          {t({ tr: "Açarsanız ", en: "If you turn it on, a ", de: "Wenn du es aktivierst, wird ein " })}<b>{t({ tr: "salt-okunur", en: "read-only", de: "schreibgeschützter" })}</b>{t({ tr: " bir link üretilir: linki verdiğiniz kişi hattı görüntüler ama değiştiremez. Rapor QR’ı da bu hatta bağlanır.", en: " link is created: whoever you give the link to can view the line but not change it. The report QR also links to this line.", de: " Link erstellt: wer den Link erhält, kann die Linie ansehen, aber nicht ändern. Auch der Bericht-QR-Code verweist auf diese Linie." })}
        </p>
      )}
    </div>
  );
}
