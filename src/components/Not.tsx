// raysim — TEK-TİP KURUMSAL BİLGİLENDİRME NOTU.
// Uygulamadaki tüm açıklama/bilgilendirme kutuları TEK kaynaktan bu bileşenle çizilir:
// nötr, simgesiz, eşit fontlu, insan-ağzı metin. Dekoratif renkli kutular (mavi/yeşil
// zemin) KULLANILMAZ. Renk yalnız GERÇEK durumu kodlar:
//   tonu="notr"  (varsayılan) → ince nötr sol cetvel, zemin yok  → sıradan açıklama
//   tonu="uyari"                → ince amber sol şerit            → dikkat edilmesi gereken
//   tonu="hata"                 → ince kırmızı sol şerit          → gerçek sorun/ihlal
// Font tek boyut (0.8125rem — bodySm). Başlık (opsiyonel) kısa, düz sözcük; simge içermez.

import { brand, ds } from "@/lib/anaray/brand";

export type NotTonu = "notr" | "uyari" | "hata";

const SOL: Record<NotTonu, string> = {
  notr: brand.border,
  uyari: ds.status.warn,
  hata: brand.red,
};

export function Not({
  children,
  tonu = "notr",
  baslik,
  className = "",
}: {
  children: React.ReactNode;
  tonu?: NotTonu;
  /** Opsiyonel kısa başlık (ör. "Dikkat", "Yöntem"). Simge/emoji içermez. */
  baslik?: string;
  className?: string;
}) {
  const vurgu = tonu === "hata" ? brand.red : tonu === "uyari" ? ds.status.warn : brand.ink;
  return (
    <div
      className={`rounded-r-sm border-l-2 py-1.5 pl-3 pr-2 text-sm leading-relaxed ${className}`}
      style={{ borderColor: SOL[tonu], color: brand.inkSoft }}
      role={tonu === "hata" ? "alert" : undefined}
    >
      {baslik ? <b className="mr-1" style={{ color: vurgu }}>{baslik}</b> : null}
      {children}
    </div>
  );
}
