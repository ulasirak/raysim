"use client";

// raysim — ERİŞİM KAPISI.
// Sitenin girişi = giriş/kayıt ekranıdır. Oturum açılmadan hiçbir modül (ve
// hiçbir hat verisi) gösterilmez. Tek istisna: salt-okunur paylaşım linki
// (?proje=<id>) — sahibi açıkça paylaşmışsa link'i bilen görüntüleyebilir.
//
// Not: bu bir arayüz kapısıdır; asıl veri izolasyonunu firestore.rules sağlar.

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useHesap } from "@/components/SimConfigProvider";
import { GirisEkrani } from "@/components/GirisEkrani";
import { brand } from "@/lib/anaray/brand";

export type ErisimDurumu =
  | "bekliyor"   // oturum çözülüyor
  | "kapali"     // giriş gerekli → giriş/kayıt ekranı
  | "acik";      // içerik gösterilebilir (girişli · paylaşım linki · Firebase yok)

/** Kabuk ile kapının TEK karar noktası (nav/çubuk da buna göre gizlenir). */
export function useErisim(): ErisimDurumu {
  const { user, hazir, yapilandirildi } = useAuth();
  const { paylasimGorunumu } = useHesap();
  const pathname = usePathname() || "/";

  // Firebase yapılandırılmamışsa (yerel geliştirme, .env.local yok) kapı
  // uygulamayı büsbütün kilitlemesin — GirisEkrani zaten uyarıyı gösterir.
  if (!yapilandirildi) return "acik";
  // Paylaşım linki, /giris ve /canli (QR canlı sim vitrini) kapının dışındadır —
  // /canli DAİMA açık: ?hat= parametresi effect'te okunmadan önce login flaşı/yönlendirmesi olmasın.
  if (paylasimGorunumu || pathname.startsWith("/giris") || pathname.startsWith("/canli")) return "acik";
  if (!hazir) return "bekliyor";
  return user ? "acik" : "kapali";
}

export function Kapi({ children }: { children: React.ReactNode }) {
  const durum = useErisim();

  if (durum === "bekliyor") {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center text-sm" style={{ color: brand.muted }}>
        ⟳ Oturum kontrol ediliyor…
      </div>
    );
  }

  if (durum === "kapali") return <GirisEkrani kapiModu />;

  return <>{children}</>;
}
