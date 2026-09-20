// raysim — BOŞ DURUM primitifi (kurumsal tasarım sistemi).
// "Henüz veri yok" anlarını tutarlı, ölçülü, marka-hizalı bir yüzeyle karşılar
// (dağınık satır-içi "… yok" notları yerine). globals.css `.ds-empty` sınıfını
// kullanır → tek kaynaktan tipografi/boşluk/cetvel/köşe. Kısa (`sik`) varyant
// panel-içi küçük alanlar için daha ölçülü dolgu verir.

import { brand } from "@/lib/anaray/brand";

export function BosDurum({
  baslik,
  ipucu,
  eylem,
  sik = false,
}: {
  /** Ana satır — ne eksik (ör. "Kayıtlı proje yok"). */
  baslik: string;
  /** İkincil satır — kullanıcı ne yapmalı (ör. "Ringler'de bir hat kur…"). */
  ipucu?: React.ReactNode;
  /** İsteğe bağlı eylem düğmesi/bağlantısı. */
  eylem?: React.ReactNode;
  /** Panel-içi küçük alan için ölçülü dolgu. */
  sik?: boolean;
}) {
  return (
    <div className="ds-empty" style={sik ? { padding: "20px 16px" } : undefined}>
      {/* Nötr amblem — ölçülü, marka mürekkebi tonunda */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.55 }}>
        <rect x="3.5" y="5" width="17" height="14" rx="2" stroke={brand.muted} strokeWidth="1.4" />
        <path d="M3.5 9.5h17M8 5V3.5M16 5V3.5" stroke={brand.muted} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <div className="text-sm font-medium" style={{ color: brand.inkSoft }}>{baslik}</div>
      {ipucu != null && (
        <div className="max-w-sm text-xs leading-relaxed" style={{ color: brand.muted }}>{ipucu}</div>
      )}
      {eylem != null && <div className="mt-1">{eylem}</div>}
    </div>
  );
}
