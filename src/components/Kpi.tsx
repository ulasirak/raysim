// raysim — KPI (istatistik kutusu) primitifi (kurumsal tasarım sistemi).
// Tek tutarlı sayı gösterimi: üstte resmî alan etiketi (versal, harf aralıklı),
// ortada büyük tabular-nums değer, altta ölçülü ipucu. `ton` değeri anlamsal
// renklendirir (nötr/kritik/iyi/uyarı), `boyut` değer puntosunu belirler.
// Dağınık `field-label + text-lg/2xl font-bold tabular-nums` varyasyonlarını
// tek dile getirir → aynı punto, aynı hiza, aynı renk mantığı.

import { brand, ds } from "@/lib/anaray/brand";

type Ton = "notr" | "danger" | "success" | "warn";

const RENK: Record<Ton, string> = {
  notr: brand.ink,
  danger: ds.status.danger,
  success: ds.status.success,
  warn: ds.status.warn,
};

const PUNTO = { sm: "text-base", md: "text-lg", lg: "text-2xl" } as const;

export function Kpi({
  etiket,
  deger,
  birim,
  alt,
  ton = "notr",
  renk,
  boyut = "md",
  hiza = "sol",
  className = "",
  style,
  title,
}: {
  /** Alan etiketi (versal). */
  etiket: React.ReactNode;
  /** Büyük değer. */
  deger: React.ReactNode;
  /** Değerin yanındaki küçük birim (ör. "km/h", "s"). */
  birim?: React.ReactNode;
  /** Altta ölçülü açıklama/ipucu. */
  alt?: React.ReactNode;
  ton?: Ton;
  /** Hesaplanmış durum rengi (ör. chartkit CK.*) — verilirse `ton`u ezer. */
  renk?: string;
  boyut?: keyof typeof PUNTO;
  hiza?: "sol" | "orta";
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const degerRenk = renk ?? RENK[ton];
  return (
    <div className={`${hiza === "orta" ? "text-center" : ""} ${className}`.trim()} style={style} title={title}>
      <span className="field-label block">{etiket}</span>
      <div className={`mt-1 ${PUNTO[boyut]} font-bold leading-tight tabular-nums`} style={{ color: degerRenk }}>
        {deger}
        {birim != null && <span className="ml-1 text-sm font-medium" style={{ color: brand.muted }}>{birim}</span>}
      </div>
      {alt != null && (
        <span className="mt-0.5 block text-[0.65rem] leading-snug" style={{ color: ton === "danger" ? ds.status.danger : brand.muted }}>
          {alt}
        </span>
      )}
    </div>
  );
}
