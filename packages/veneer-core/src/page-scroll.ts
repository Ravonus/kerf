/** Scroll a document to a known destination and announce it before movement, so media can prepare there. */
export function scrollPage(top: number, behavior: 'smooth' | 'instant' = 'smooth') {
  if (!Number.isFinite(top)) return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const target = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight))
  const mode = reduced ? 'instant' : behavior
  window.dispatchEvent(
    new CustomEvent('kerf:scroll-target', { detail: { top: target, behavior: mode } }),
  )
  window.scrollTo({ top: target, behavior: mode })
}
