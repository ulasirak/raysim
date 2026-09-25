// raysim — KPI (istatistik kutusu) primitifi (kurumsal tasarım sistemi).
// Tek tutarlı sayı gösterimi: üstte resmî alan etiketi (versal, harf aralıklı),
// ortada büyük tabular-nums değer, altta ölçülü ipucu. `ton` değeri anlamsal
// renklendirir (nötr/kritik/iyi/uyarı), `boyut` değer puntosunu belirler.
// Dağınık `field-label + text-lg/2xl font-bold tabular-nums` varyasyonlarını
// tek dile getirir → aynı punto, aynı hiza, aynı renk mantığı.

import { brand, ds } from "@/lib/anaray/brand";
import { Kart } from "@/components/Kart";
import { useDil } from "@/components/DilProvider";

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

/**
 * MiniStat — küçük istatistik kutusu: kurumsal `Kart` (ic="sm") içinde tek `Kpi`.
 * Modüllerdeki dağınık yerel `MiniStat` (`rounded border p-2.5` + elle field-label)
 * kopyalarının TEK ORTAK kaynağıdır → aynı yüzey, aynı punto, aynı renk mantığı.
 * `vurgu`: hesaplanmış durum rengi (chartkit CK.* vb.), Kpi'nin `renk`ine geçer.
 */
// ————— Durum rozeti —————
// Tek tip sonuç göstergesi: ✓ Uygun / ▲ Uyarı / ⚠ İhlal. Her panel/başlıkta aynı dil,
// aynı renk → hattın sağlığı tek bakışta okunur. Dağınık "UYGUN/İHLAL" metinleri yerine.
const DURUM_STIL: Record<"uygun" | "uyari" | "ihlal", { ik: string; et: { tr: string; en: string; de: string }; fg: string; bg: string }> = {
  uygun: { ik: "✓", et: { tr: "Uygun", en: "Compliant", de: "Konform" }, fg: ds.status.success, bg: "#EAF7F0" },
  uyari: { ik: "▲", et: { tr: "Uyarı", en: "Warning", de: "Warnung" }, fg: "#8A5A00", bg: "#FBF3E2" },
  ihlal: { ik: "⚠", et: { tr: "İhlal", en: "Violation", de: "Verstoß" }, fg: ds.status.danger, bg: "#FBE9EC" },
};

export function Durum({ tip, metin, className = "" }: { tip: "uygun" | "uyari" | "ihlal"; metin?: React.ReactNode; className?: string }) {
  const { t } = useDil();
  const d = DURUM_STIL[tip];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${className}`.trim()} style={{ background: d.bg, color: d.fg }}>
      {d.ik} {metin ?? t(d.et)}
    </span>
  );
}

export function MiniStat({
  etiket,
  deger,
  alt,
  vurgu,
  birim,
}: {
  etiket: React.ReactNode;
  deger: React.ReactNode;
  alt?: React.ReactNode;
  vurgu?: string;
  birim?: React.ReactNode;
}) {
  return (
    <Kart ic="sm">
      <Kpi etiket={etiket} deger={deger} birim={birim} alt={alt} renk={vurgu} title={typeof alt === "string" ? alt : undefined} />
    </Kart>
  );
}
