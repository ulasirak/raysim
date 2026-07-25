"use client";

// raysim — SALT-OKUNUR KALKAN.
// Demo (giriş yok) ve paylaşım-linki görünümlerinde proje verisini değiştiren
// alanları kapatır. Sağlayıcı yazmayı zaten yok sayar; bu kalkan girdileri de
// devre dışı bırakır ki arayüz "tıklıyorum bir şey olmuyor" hissi vermesin.
//
// `fieldset disabled` tüm alt form denetimlerini kapatır; `display:contents`
// ile yerleşim (flex/grid) hiç etkilenmez.

import Link from "next/link";
import { useHesap } from "@/components/SimConfigProvider";
import { brand } from "@/lib/anaray/brand";
import { CK } from "@/lib/anaray/chartkit";

export function SaltOkunurKalkan({ children }: { children: React.ReactNode }) {
  const { yazilabilir, demoMu, paylasimGorunumu } = useHesap();

  // YAPI SABİT: yazilabilir değişse de dönen ağacın şekli aynı kalır. Eskiden
  // `yazilabilir` true iken `<>{children}</>`, false iken `<fieldset>{children}</fieldset>`
  // dönüyordu; bu iki farklı eleman tipi olduğundan React tüm modülleri KOMPLE
  // yeniden mount ediyordu. Girişli hesapta sayfa yenilenince `aktifId` Firestore'dan
  // dönene kadar `yazilabilir` kısa süre false → true olur ve bu remount stüdyoyu
  // "aç-kapa" yaptırıyordu. Artık fieldset hep var; yalnız `disabled` prop'u değişir.
  const banner = (demoMu || paylasimGorunumu) ? (
    <div className="mx-auto max-w-6xl px-6 pt-6">
      <div className="rounded-md border-l-4 px-4 py-3 text-sm" style={{ background: CK.amberBg, borderColor: CK.amber, color: brand.ink }}>
        {paylasimGorunumu ? (
          <>👁 <b>Salt-okunur paylaşım görünümü</b> — bu hattı yalnız görüntülüyorsunuz; düzenleme kapalı.</>
        ) : (
          <>🔒 <b>Demo hattı — düzenleme kapalı.</b> Kendi hattınızı kurup kaydetmek için{" "}
            <Link href="/giris" className="underline" style={{ color: brand.red }}>giriş yapın</Link> ya da{" "}
            <Link href="/giris?mod=kayit" className="underline" style={{ color: brand.red }}>hesap açın</Link>.
            Simülasyonları çalıştırıp inceleyebilirsiniz.</>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {banner}
      <fieldset disabled={!yazilabilir} className="contents">{children}</fieldset>
    </>
  );
}
