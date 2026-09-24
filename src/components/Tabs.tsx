"use client";

// raysim — PAYLAŞILAN SEKME PRİMİTİFİ (TabBar).
// SAF CSS sekme: gizli radio `:checked ~ kardeş` seçicisiyle panelleri gösterir/gizler.
// JS/state YOK → freeze yok (bu app'te bilinçli tercih).
//
// TEK SAYFA UYARISI: app tek sayfada birden çok modülü (Sefer + Sistem…) aynı anda
// render eder. Bu yüzden her TabBar'a MODÜLE ÖZGÜ benzersiz `pre` öneki verilir —
// böylece radio grubu adı + id'ler + panel sınıfı çakışmaz. Kullanım:
//   <TabBar pre="sm" etiketler={["① A", "② B", …]} />
//   <div className="sm-panel" data-t="1">…</div>
//   <div className="sm-panel" data-t="2">…</div>
// TabBar (style + radiolar + çubuk) ile `${pre}-panel`'ler AYNI kapsayıcının
// KARDEŞİ olmalı (radiolar panellerden ÖNCE). En çok 6 sekme.

const RENK_METIN = "#6B7A8A";
const RENK_AKTIF = "#0C2233";
const RENK_CIZGI = "#C8102E";
const RENK_KENAR = "#DCE1E7";
const RENK_UYARI = "#C77700";

// Öneke göre sekme CSS'i üretir (id/sınıf çakışmasını önler). Çubuk YAPIŞKAN:
// kaydırırken metro-nav'ın (--ray-nav-h) hemen altında sabit kalır → gezinme hep elde.
function tabCss(pre: string): string {
  const idx = [1, 2, 3, 4, 5, 6];
  const goster = idx.map((i) => `#${pre}-t${i}:checked~.${pre}-panel[data-t="${i}"]`).join(",\n");
  const aktif = idx.map((i) => `#${pre}-t${i}:checked~.${pre}-bar label[for="${pre}-t${i}"]`).join(",\n");
  return `
.${pre}-panel{display:none}
${goster}{display:block}
.${pre}-bar{position:sticky;top:var(--ray-nav-h,88px);z-index:10;background:#fff}
.${pre}-tab{display:inline-flex;align-items:center;cursor:pointer;user-select:none;white-space:nowrap;border-bottom:2px solid transparent;padding:.55rem 1rem;font-size:.8rem;font-weight:600;color:${RENK_METIN};transition:color .15s,border-color .15s}
.${pre}-tab:hover{color:${RENK_AKTIF}}
${aktif}{color:${RENK_AKTIF};border-bottom-color:${RENK_CIZGI}}
.smx-dot{display:inline-block;width:7px;height:7px;border-radius:9999px;margin-left:6px}
.smx-dot-uyari{background:${RENK_UYARI}}
.smx-dot-ihlal{background:${RENK_CIZGI}}
@media (max-width:640px){.${pre}-tab{padding:.5rem .6rem;font-size:.72rem}}
`;
}

/**
 * Sekme çubuğu — style + gizli radiolar + tıklanabilir etiketler. Bir fragment döndürür;
 * çocukları (radiolar + .${pre}-bar) çağıran kapsayıcının doğrudan çocuğu olur, böylece
 * ardından gelen `.${pre}-panel[data-t]` kardeşlerini `:checked ~` ile hedefler.
 * `pre`: modüle özgü benzersiz önek (ör. "sm", "sf") — tek sayfada çakışmayı önler.
 * `durumlar`: isteğe bağlı — her sekmenin yanına durum noktası (o sekmede
 *   uyarı/ihlal varsa) koyar; kullanıcı hangi sekmede sorun olduğunu açmadan görür.
 */
export function TabBar({ pre, etiketler, durumlar }: { pre: string; etiketler: React.ReactNode[]; durumlar?: ("" | "uyari" | "ihlal")[] }) {
  return (
    <>
      <style>{tabCss(pre)}</style>
      {etiketler.map((e, i) => (
        <input
          key={i}
          id={`${pre}-t${i + 1}`}
          type="radio"
          name={`${pre}-grp`}
          defaultChecked={i === 0}
          className="sr-only"
          aria-label={typeof e === "string" ? e : `Sekme ${i + 1}`}
        />
      ))}
      <div className={`${pre}-bar mb-6 mt-1 flex gap-1 overflow-x-auto border-b`} style={{ borderColor: RENK_KENAR }} role="tablist">
        {etiketler.map((e, i) => {
          const d = durumlar?.[i];
          return (
            <label key={i} htmlFor={`${pre}-t${i + 1}`} className={`${pre}-tab`}>
              {e}
              {d ? <span className={`smx-dot smx-dot-${d}`} title={d === "ihlal" ? "İhlal var" : "Uyarı var"} /> : null}
            </label>
          );
        })}
      </div>
    </>
  );
}
