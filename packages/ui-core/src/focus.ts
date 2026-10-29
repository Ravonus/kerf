// Focus handling for composites and anchored layers.

export type Orientation = 'horizontal' | 'vertical'

/**
 * The index a key moves to in a composite of `count` items (tablist, toolbar, segmented, radio group): arrows step
 * and wrap, Home/End jump, right-to-left flips the horizontal arrows. -1 when the key does nothing.
 */
export function nextIndex(key: string, at: number, count: number, { orientation = 'horizontal', rtl = false }: { orientation?: Orientation; rtl?: boolean } = {}) {
  if (count === 0) return -1
  const [back, forward] = orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : rtl ? ['ArrowRight', 'ArrowLeft'] : ['ArrowLeft', 'ArrowRight']
  if (key === back) return (at - 1 + count) % count
  if (key === forward) return (at + 1) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}

/**
 * Roving focus as an action: one tab stop in `container`, arrow keys move focus among `items` (skipping disabled
 * ones); `onMove` runs with the item focus lands on, for widgets where selection follows focus (tabs).
 */
export function roving(container: HTMLElement, opts: { items: string; orientation?: Orientation; onMove?: (el: HTMLElement, index: number) => void }) {
  let o = opts
  const onKey = (e: KeyboardEvent) => {
    const items = [...container.querySelectorAll<HTMLElement>(o.items)].filter(el => !el.matches(':disabled, [aria-disabled="true"]'))
    const at = items.indexOf(container.ownerDocument.activeElement as HTMLElement)
    if (at < 0) return
    const rtl = getComputedStyle(container).direction === 'rtl'
    const to = nextIndex(e.key, at, items.length, { orientation: o.orientation, rtl })
    if (to < 0) return
    e.preventDefault()
    items[to].focus()
    o.onMove?.(items[to], to)
  }
  container.addEventListener('keydown', onKey)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy: () => container.removeEventListener('keydown', onKey),
  }
}

export type Placement = 'top' | 'bottom' | 'left' | 'right'

/**
 * Place `floating` next to `trigger` (fixed position, flipping when it would leave the viewport, clamped 8px inside
 * it) and keep it there on scroll and resize. Writes data-side for the CSS. An action: `update()` re-measures.
 */
export function anchor(trigger: Element, floating: HTMLElement, { placement = 'bottom', gap = 8 }: { placement?: Placement; gap?: number } = {}) {
  const win = floating.ownerDocument.defaultView!
  const place = () => {
    const a = trigger.getBoundingClientRect()
    const f = floating.getBoundingClientRect()
    const vw = win.innerWidth, vh = win.innerHeight
    let side = placement
    if (side === 'bottom' && a.bottom + gap + f.height > vh && a.top - gap - f.height > 0) side = 'top'
    else if (side === 'top' && a.top - gap - f.height < 0) side = 'bottom'
    else if (side === 'right' && a.right + gap + f.width > vw) side = 'left'
    else if (side === 'left' && a.left - gap - f.width < 0) side = 'right'
    const x = side === 'left' ? a.left - gap - f.width : side === 'right' ? a.right + gap : a.left + (a.width - f.width) / 2
    const y = side === 'top' ? a.top - gap - f.height : side === 'bottom' ? a.bottom + gap : a.top + (a.height - f.height) / 2
    floating.style.setProperty('position', 'fixed')
    floating.style.setProperty('inset', `${Math.round(Math.max(8, Math.min(y, vh - f.height - 8)))}px auto auto ${Math.round(Math.max(8, Math.min(x, vw - f.width - 8)))}px`)
    floating.style.setProperty('margin', '0')
    floating.dataset.side = side
  }
  place()
  win.addEventListener('scroll', place, true)
  win.addEventListener('resize', place)
  return {
    update: place,
    destroy() {
      win.removeEventListener('scroll', place, true)
      win.removeEventListener('resize', place)
    },
  }
}
