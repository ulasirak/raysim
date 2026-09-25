// raysim — bölümler arası "kusursuz" yönlendirme yardımcısı (saf DOM, domain'siz).
// CTA butonları (ör. "Filo & Öneri'de filo sayınızı onaylayın") tıklanınca hedef bölümü
// hep GÖRÜNÜR + AÇIK göstermeli.
//
// Uygulama saf-CSS sekmeler kullanır (Tabs.tsx): pasif sekmeler DOM'da kalır ama
// `display:none`'dır. `display:none` bir öğeye scrollIntoView HİÇBİR ŞEY yapmaz. Bu yüzden
// hedef başka bir sekmedeyse ÖNCE o sekmeyi açmak (radio'yu işaretlemek) şarttır; ardından
// hedef katlanır bir Panel ise (native <details>) açılır ve oraya yumuşakça kaydırılır.

/**
 * Verilen id'li bölüme yönlendirir:
 * 1) Hedef gizli bir CSS-sekmesindeyse (`.<pre>-panel[data-t="n"]`) o sekmeyi açar.
 * 2) Hedefin kendisi/içindeki ilk `<details>` çekmecesi kapalıysa açar.
 * 3) Yapışkan üst menünün (metro nav + sekme çubuğu) ALTINA gelecek şekilde kaydırır —
 *    aksi halde panel başlığı menünün arkasında kalır (kullanıcı panelin ortasına düşer).
 *    `vurgu` (renk) verilirse hedefi kısa süre çerçeveleyerek dikkat çeker.
 */
export function panelAcVeGit(id: string, vurgu?: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;

  // 1) Hedef bir CSS-sekme panelinin (Tabs.tsx) içindeyse önce o sekmeyi aktifleştir.
  //    Panel sınıfı `<pre>-panel`, sekme no `data-t` → radio id `<pre>-t<no>`.
  const sekmePanel = el.closest<HTMLElement>("[data-t]");
  const onek = sekmePanel?.className.match(/([A-Za-z0-9]+)-panel/)?.[1];
  if (sekmePanel && onek) {
    const no = sekmePanel.getAttribute("data-t");
    const radio = document.getElementById(`${onek}-t${no}`) as HTMLInputElement | null;
    if (radio && !radio.checked) radio.checked = true; // saf CSS → panel anında görünür olur
  }

  // 2) Katlanır <details> çekmecesini aç (varsa).
  const det = (el.matches("details") ? el : el.querySelector("details")) as HTMLDetailsElement | null;
  if (det && !det.open) det.open = true;

  // 3) Sekme/çekmece görünürlüğü yerleşime yansısın diye bir kare sonra kaydır.
  requestAnimationFrame(() => {
    // Yapışkan üst menü payı: metro nav (--ray-nav-h) + varsa modülün sekme çubuğu (.<pre>-bar).
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ray-nav-h")) || 0;
    const bar = onek ? document.querySelector<HTMLElement>(`.${onek}-bar`) : null;
    const barH = bar ? bar.getBoundingClientRect().height : 0;
    const pay = navH + barH + 12; // küçük nefes payı
    const hedefY = window.scrollY + el.getBoundingClientRect().top - pay;
    window.scrollTo({ top: Math.max(0, hedefY), behavior: "smooth" });
    if (vurgu) {
      el.style.outline = `2px solid ${vurgu}`;
      el.style.outlineOffset = "3px";
      el.style.borderRadius = "10px";
      window.setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 1800);
    }
  });
}
