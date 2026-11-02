let installed = false

/** One delegated listener: a vivid button's fill closes on where the hand arrived. Without it the fill closes on the middle. */
export function pressOrigin(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (installed || !doc) return
  installed = true
  doc.addEventListener('pointerover', (e: PointerEvent) => {
    const b = (e.target as Element).closest?.('[data-scope="button"]') as HTMLElement | null
    if (!b || b.contains(e.relatedTarget as Node)) return
    const r = b.getBoundingClientRect()
    b.style.setProperty('--warp-mx', `${((e.clientX - r.left) / r.width * 100).toFixed(1)}%`)
    b.style.setProperty('--warp-my', `${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`)
  }, { passive: true, capture: true })
}
