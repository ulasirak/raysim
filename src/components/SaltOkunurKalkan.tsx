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
import { Ikon } from "@/components/Ikon";
import { useDil } from "@/components/DilProvider";

export function SaltOkunurKalkan({ children }: { children: React.ReactNode }) {
  const { t } = useDil();
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
          <><Ikon ad="goz" size={13} className="mr-1 inline-block align-[-2px]" /><b>{t({ tr: "Salt-okunur paylaşım görünümü", en: "Read-only shared view", de: "Schreibgeschützte geteilte Ansicht" })}</b>{t({ tr: ". Bu hattı yalnızca görüntülüyorsunuz; düzenleme kapalı.", en: ". You are only viewing this line; editing is disabled.", de: ". Sie sehen diese Linie nur an; die Bearbeitung ist deaktiviert." })}</>
        ) : (
          <><Ikon ad="kilit" size={13} className="mr-1 inline-block align-[-2px]" /><b>{t({ tr: "Demo hattı; düzenleme kapalı.", en: "Demo line; editing is disabled.", de: "Demolinie; Bearbeitung deaktiviert." })}</b> {t({ tr: "Kendi hattını kurup kaydetmek için ", en: "To build and save your own line, ", de: "Um eine eigene Linie aufzubauen und zu speichern, " })}
            <Link href="/giris" className="underline" style={{ color: brand.red }}>{t({ tr: "giriş yap", en: "sign in", de: "melden Sie sich an" })}</Link>{t({ tr: " ya da ", en: " or ", de: " oder " })}
            <Link href="/giris?mod=kayit" className="underline" style={{ color: brand.red }}>{t({ tr: "hesap aç", en: "create an account", de: "erstellen Sie ein Konto" })}</Link>{t({ tr: ". Simülasyonları çalıştırıp inceleyebilirsin.", en: ". You can still run and inspect the simulations.", de: ". Sie können die Simulationen trotzdem ausführen und untersuchen." })}</>
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
