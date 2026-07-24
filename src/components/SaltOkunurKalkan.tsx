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
  if (yazilabilir) return <>{children}</>;

  return (
    <>
      {(demoMu || paylasimGorunumu) && (
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
      )}
      <fieldset disabled className="contents">{children}</fieldset>
    </>
  );
}
