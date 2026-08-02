"use client";

// raysim — global KAYIT BİLDİRİMİ (toast).
//
// Uygulama ayrı "Kaydet" düğmesi kullanmaz; değişiklikler otomatik (debounce)
// Firestore'a yazılır. Ama tek gösterge hesap çubuğundaki sabit "✓ kaydedildi"
// yazısıydı → yeni bir kayıt olduğunda dikkat çekmiyor, "kaydettim mi?" belirsizliği
// doğuyordu. Bu bileşen her kayıt döngüsünde kısa süreli belirgin bir bildirim
// gösterir: araç, parametre, Ringler, istasyon — hangi modülde olursa olsun.

import { useEffect, useRef, useState } from "react";
import { useHesap } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

type Gorunum = { tip: "kaydediliyor" | "kaydedildi" | "hata"; metin: string } | null;

export function KayitBildirimi() {
  const { durum, hataMetni, yazilabilir } = useHesap();
  const [gorunum, setGorunum] = useState<Gorunum>(null);
  const oncekiRef = useRef(durum);
  const zamanRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bu effect, harici durum makinesini (kayıt `durum`u) geçici bir toast'a
  // SENKRONLAR — meşru bir "dış sisteme abone ol + geçişte state güncelle" kullanımı:
  // geçiş tespiti (oncekiRef) + otomatik gizleme zamanlayıcısı gerektirir, effect'siz
  // yazılamaz. `set-state-in-effect` kuralı burada kasıtlı devre dışı.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const onceki = oncekiRef.current;
    oncekiRef.current = durum;
    // Salt-okunur (demo/paylaşım) oturumda kayıt olmaz → gösterim render'da
    // `yazilabilir` ile kapatılır; burada state güncellenmez.
    if (!yazilabilir) return;

    if (durum === "kaydediliyor") {
      if (zamanRef.current) clearTimeout(zamanRef.current);
      setGorunum({ tip: "kaydediliyor", metin: "Kaydediliyor…" });
    } else if (durum === "kaydedildi" && onceki === "kaydediliyor") {
      // Yalnız GERÇEK bir kayıt döngüsü sonrası (ilk yükleme "hazir"i değil).
      setGorunum({ tip: "kaydedildi", metin: "Kaydedildi" });
      if (zamanRef.current) clearTimeout(zamanRef.current);
      zamanRef.current = setTimeout(() => setGorunum(null), 2200);
    } else if (durum === "hata") {
      if (zamanRef.current) clearTimeout(zamanRef.current);
      setGorunum({ tip: "hata", metin: hataMetni ?? "Kayıt hatası" });
    }
  }, [durum, hataMetni, yazilabilir]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => () => { if (zamanRef.current) clearTimeout(zamanRef.current); }, []);

  // Salt-okunur oturumda ya da gösterilecek bildirim yoksa çizme.
  if (!yazilabilir || !gorunum) return null;

  const renk =
    gorunum.tip === "hata" ? brand.red
      : gorunum.tip === "kaydedildi" ? CK.good
        : brand.muted;
  const isaret = gorunum.tip === "hata" ? "⚠" : gorunum.tip === "kaydedildi" ? "✓" : "⟳";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      aria-live="polite"
      role="status"
    >
      <div
        className="pointer-events-auto flex max-w-[90vw] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg"
        style={{
          background: "#fff",
          borderColor: renk,
          color: brand.ink,
          boxShadow: "0 6px 24px rgba(12,34,51,0.16)",
        }}
      >
        <span
          className={gorunum.tip === "kaydediliyor" ? "animate-spin" : ""}
          style={{ color: renk, fontSize: "1rem", lineHeight: 1 }}
        >
          {isaret}
        </span>
        <span className={gorunum.tip === "hata" ? "max-w-xs truncate" : ""} title={gorunum.metin}>
          {gorunum.metin}
        </span>
      </div>
    </div>
  );
}
