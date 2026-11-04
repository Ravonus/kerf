let installed = false

/** One delegated listener: a vivid button that asks to follow (data-follow) has its fill follow the hand. */
export function pressOrigin(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
) {
  if (installed || !doc) return
  installed = true
  let host: HTMLElement | null = null,
    box: DOMRect,
    x = 0,
    y = 0,
    frame = 0
  const write = () => {
    frame = 0
    if (!host) return
    const swing = (Math.min(Math.max(x / 100, 0), 1) - 0.5) * 0.3
    const st = host.style
    st.setProperty('--warp-mx', `${x.toFixed(1)}%`)
    st.setProperty('--warp-my', `${y.toFixed(1)}%`)
    st.setProperty('--warp-lead-a', (1 - Math.max(0, swing)).toFixed(3))
    st.setProperty('--warp-lead-b', (1 + Math.min(0, swing)).toFixed(3))
  }
  const at = (e: PointerEvent) => {
    x = ((e.clientX - box.left) / box.width) * 100
    y = ((e.clientY - box.top) / box.height) * 100
  }
  doc.addEventListener(
    'pointerover',
    (e: PointerEvent) => {
      const b = (e.target as Element).closest?.(
        '[data-scope="button"][data-follow]',
      ) as HTMLElement | null
      if (b === host) return
      host = b
      if (!b) return
      box = b.getBoundingClientRect() // one read per entry; a write on leave would jump the seam, so there is none
      if (!box.width || !box.height) {
        host = null
        return
      }
      at(e)
      write()
    },
    { passive: true, capture: true },
  )
  doc.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (host) {
        at(e)
        frame ||= requestAnimationFrame(write)
      }
    },
    { passive: true, capture: true },
  )
}
