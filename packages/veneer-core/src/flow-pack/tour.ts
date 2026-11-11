import { installSweep } from '../sweep'
import { pushLayer } from '../layers'

// ---- tour (09 §3.2) ------------------------------------------------------------------------------------------------

/** A rectangle in viewport pixels: the tour's target or its card. */
export interface TourBox {
  x: number
  y: number
  w: number
  h: number
}

/** Where the card goes: beside the target with a flip; on a phone, docked to the edge away from it. */
export function tourPlacement(
  target: TourBox,
  card: { w: number; h: number },
  view: { w: number; h: number },
): { left: number; top: number; width?: number } {
  if (view.w < 600)
    return {
      left: 12,
      width: view.w - 24,
      top: target.y + target.h / 2 > view.h / 2 ? 12 : view.h - card.h - 12,
    }
  if (target.x + target.w + card.w + 24 < view.w && target.x < view.w * 0.3)
    return {
      left: target.x + target.w + 14,
      top: Math.min(Math.max(12, target.y + target.h / 2 - card.h / 2), view.h - card.h - 12),
    }
  const left = Math.min(Math.max(12, target.x + target.w - card.w), view.w - card.w - 12)
  const below = target.y + target.h + 14
  return { left, top: below + card.h > view.h - 12 ? Math.max(12, target.y - card.h - 14) : below }
}

const CARD_FOCUS =
  'button:not(:disabled):not([hidden]), a[href], input:not(:disabled), [tabindex="0"]'

/** Prefer an element that is on screen: a target can exist twice, in a hidden layout. */
function findTarget(doc: Document, selector: string) {
  const all = [...doc.querySelectorAll<HTMLElement>(selector)]
  return all.find((t) => t.getClientRects().length) ?? all[0] ?? null
}

/** Options for the tour spotlight action. */
export interface TourSpotOptions {
  /** The step's target selector. */
  target: string
  /** The step number: the same target can come twice. */
  step: number
  /** The target stays pressable ("Try it: click New"); otherwise the scrim blocks every press. */
  interactive?: boolean | undefined
  onNext(): void
  onPrev(): void
  onClose(): void
  /** The target isn't in the page: skip this step. */
  onMissing(): void
  /** Started over another overlay: never run. */
  onBlocked(): void
}

/**
 * `[data-scope="tour"]`, mounted while a tour runs: places the spotlight and the card, draws the ring on arrival, scrolls
 * the target in, describes it by the card, keeps Tab in the card, blocks presses outside it, ends on Escape and returns
 * focus to where the tour began. `<dialog open>` anywhere stops it before it starts.
 */
export function tourSpot(root: HTMLElement, opts: TourSpotOptions) {
  let o = opts
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const opener = doc.activeElement as HTMLElement | null
  const spot = root.querySelector<HTMLElement>('[data-part="spotlight"]')!
  const card = root.querySelector<HTMLElement>('[data-part="card"]')!
  const m = installSweep(doc)
  let off = false
  // anchor()'s precedent: the layer is viewport-sized wherever the app mounts it
  root.style.setProperty('position', 'fixed')

  const description = tourDescription(card)
  const place = placeTour(() => description.target, spot, card, win)
  function arrive() {
    if (off) return
    const t = findTarget(doc, o.target)
    if (!t) return o.onMissing()
    description.describe(t)
    const instant =
      win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      doc.documentElement.dataset.motion === 'reduce'
    t.scrollIntoView?.({ block: 'center', behavior: instant ? 'instant' : 'smooth' })
    place()
    spot.dataset.phase = 'idle'
    void spot.offsetWidth // redraw L→R on each step
    m.sync(spot)
    card.querySelector<HTMLElement>('h4, h3, h2')?.focus({ preventScroll: true })
  }
  const onKey = tourKeys(() => o, card, doc)
  const block = tourBlock(
    card,
    () => o,
    () => description.target,
  )
  if (doc.querySelector('dialog[open]')) {
    off = true
    queueMicrotask(() => o.onBlocked())
    return {
      update(next: TourSpotOptions) {
        o = next
      },
      destroy() {},
    }
  }
  const remove = pushLayer({ el: card, modal: true, close: () => o.onClose() })
  card.addEventListener('keydown', onKey)
  for (const t of ['pointerdown', 'mousedown', 'click']) doc.addEventListener(t, block, true)
  win.addEventListener('scroll', place, true)
  win.addEventListener('resize', place)
  arrive()
  return {
    update(next: TourSpotOptions) {
      const moved = next.step !== o.step
      o = next
      if (moved) queueMicrotask(arrive)
    },
    destroy() {
      off = true
      remove()
      description.describe(null)
      card.removeEventListener('keydown', onKey)
      for (const t of ['pointerdown', 'mousedown', 'click']) doc.removeEventListener(t, block, true)
      win.removeEventListener('scroll', place, true)
      win.removeEventListener('resize', place)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    },
  }
}

function tourDescription(card: HTMLElement) {
  let target: HTMLElement | null = null
  let described: string | null = null
  const describe = (t: HTMLElement | null) => {
    if (target) {
      if (described === null) target.removeAttribute('aria-describedby')
      else target.setAttribute('aria-describedby', described)
    }
    target = t
    if (t) {
      described = t.getAttribute('aria-describedby')
      t.setAttribute(
        'aria-describedby',
        [described, card.getAttribute('aria-describedby')].filter(Boolean).join(' '),
      )
    }
  }
  return {
    get target() {
      return target
    },
    describe,
  }
}

function tourBlock(
  card: HTMLElement,
  options: () => TourSpotOptions,
  getTarget: () => HTMLElement | null,
) {
  return (e: Event) => {
    const t = e.target as Node
    if (card.contains(t) || (options().interactive && getTarget()?.contains(t))) return
    e.preventDefault()
    e.stopPropagation()
  }
}

function placeTour(
  getTarget: () => HTMLElement | null,
  spot: HTMLElement,
  card: HTMLElement,
  win: Window,
) {
  return () => {
    const target = getTarget()
    if (!target?.isConnected) return
    const r = target.getBoundingClientRect()
    const box = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 }
    spot.style.left = `${box.x}px`
    spot.style.top = `${box.y}px`
    spot.style.width = `${box.w}px`
    spot.style.height = `${box.h}px`
    const p = tourPlacement(
      box,
      { w: card.offsetWidth || 300, h: card.offsetHeight || 170 },
      { w: win.innerWidth, h: win.innerHeight },
    )
    card.style.left = `${p.left}px`
    card.style.top = `${p.top}px`
    card.style.width = p.width ? `${p.width}px` : ''
  }
}

function tourKeys(options: () => TourSpotOptions, card: HTMLElement, doc: Document) {
  return (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') return options().onNext()
    if (e.key === 'ArrowLeft') return options().onPrev()
    if (e.key !== 'Tab') return
    const all = [...card.querySelectorAll<HTMLElement>(CARD_FOCUS)]
    const at = all.indexOf(doc.activeElement as HTMLElement)
    e.preventDefault()
    all[e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at + 1) % all.length]?.focus()
  }
}

/** A coachmark's layer: no scrim; the beacon sits on the target's corner and the card by it. */
export function coachSpot(
  root: HTMLElement,
  opts: { target: string; open: boolean; onClose(): void },
) {
  let o = opts
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const beacon = root.querySelector<HTMLElement>('[data-beacon]')!
  let remove: (() => void) | undefined
  root.style.setProperty('position', 'fixed')
  beacon.style.setProperty('position', 'absolute')
  beacon.style.setProperty('pointer-events', 'auto')
  function place() {
    const t = findTarget(doc, o.target)
    beacon.hidden = !t
    if (!t) return
    const r = t.getBoundingClientRect()
    beacon.style.left = `${r.right - 16}px`
    beacon.style.top = `${r.top - 8}px`
    const card = root.querySelector<HTMLElement>('[data-part="card"]')
    if (!card) return
    const p = tourPlacement(
      { x: r.left, y: r.top, w: r.width, h: r.height },
      { w: card.offsetWidth || 300, h: card.offsetHeight || 170 },
      { w: win.innerWidth, h: win.innerHeight },
    )
    card.style.left = `${p.left}px`
    card.style.top = `${p.top}px`
    card.style.width = p.width ? `${p.width}px` : ''
  }
  function sync() {
    remove?.()
    remove = undefined
    place()
    if (!o.open) return
    const card = root.querySelector<HTMLElement>('[data-part="card"]')
    if (!card) return
    remove = pushLayer({ el: card, trigger: beacon, close: () => o.onClose() })
    card.querySelector<HTMLElement>('h4')?.focus({ preventScroll: true })
  }
  win.addEventListener('scroll', place, true)
  win.addEventListener('resize', place)
  sync()
  return {
    update(next: typeof opts) {
      const closed = o.open && !next.open
      o = next
      queueMicrotask(sync)
      if (closed) beacon.focus({ preventScroll: true })
    },
    destroy() {
      remove?.()
      win.removeEventListener('scroll', place, true)
      win.removeEventListener('resize', place)
    },
  }
}
