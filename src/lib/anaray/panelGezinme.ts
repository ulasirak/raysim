// raysim — bölümler arası "kusursuz" yönlendirme yardımcısı (saf DOM, domain'siz).
// CTA butonları (ör. "Filo & Öneri'de filo sayınızı onaylayın") tıklanınca hedef bölümü
// hep AÇIK göstermeli: hedef katlanır bir Panel ise (native <details> çekmecesi) önce
// açılır, sonra yumuşakça kaydırılır — kapalı panele kaydırıp kullanıcıyı boş bırakmaz.

/**
 * Verilen id'li bölüme yönlendirir.
 * - Hedefin kendisi ya da içindeki ilk `<details>` çekmecesi kapalıysa AÇAR.
 * - Açılma yeniden yerleşim tetiklediğinden, doğru konuma bir kare sonra kaydırır.
 * - `vurgu` (renk) verilirse hedefi kısa süre çerçeveleyerek dikkat çeker.
 */
export function panelAcVeGit(id: string, vurgu?: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const det = (el.matches("details") ? el : el.querySelector("details")) as HTMLDetailsElement | null;
  if (det && !det.open) det.open = true;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (vurgu) {
      el.style.outline = `2px solid ${vurgu}`;
      el.style.outlineOffset = "3px";
      el.style.borderRadius = "10px";
      window.setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 1800);
    }
  });
}
