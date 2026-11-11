// A bottom sheet's hand (05 §3 Drawer/Sheet): the grabber and the header drag it, between a half-height stop that leaves
// the page in view and a tall one, and down past the lowest to close. A flick carries: where it lands is where the
// release was heading. A press on the grabber steps between the stops, and so do Enter, Space and the arrow keys on it.
// Content shorter than the half stop has no stops: the sheet sits at its own height and only drags closed. The sheet
// CSS draws it all from --_sheet-h (its height), --_drag (how far it has been pulled down past the lowest stop),
// [data-detent] and [data-dragging]; this only sets them. Side sheets are left alone.
import type { Action } from './store'

/** A bottom sheet's resting heights: half the window, or nearly all of it. */
export type Detent = 'half' | 'full'

/** Options for a sheet. */
export interface SheetOptions {
  /** Whether the sheet is open: each opening starts it at `at`. */
  open: boolean
  /** Where it opens when its content is taller than the half stop. Half by default. */
  at?: Detent | undefined
  /** Called when a drag or flick takes it below its lowest stop: the binding writes open = false. */
  onClose(): void
  /** Hears each stop it settles on. */
  onDetent?: ((d: Detent) => void) | undefined
  /** At the half stop the page behind stays live: it scrolls and takes taps, and the sheet waits over it. */
  peek?: boolean | undefined
}

const HALF = 0.5,
  FULL = 0.92
/** How far a release looks ahead: velocity (px/ms) times this many ms is where the flick was going. */
const CARRY = 160
const LABEL: Record<Detent, string> = {
  half: 'Sheet height: half. Press to expand.',
  full: 'Sheet height: tall. Press to shrink.',
}

type Drag = { y: number; h: number; last: number; t: number; v: number; moved: boolean; id: number }
type Stop = [Detent | null | 'close', number]

/** One sheet's state, shared by its handlers. */
interface Hand {
  el: HTMLDialogElement
  o: SheetOptions
  /** null: no stops, the sheet's own height */
  at: Detent | null
  drag: Drag | null
  /** the click that follows a drag is not a press */
  swallow: boolean
}

const bottom = (s: Hand) => s.el.dataset.side === 'bottom'
const px = (s: Hand, d: Detent) =>
  (d === 'half' ? HALF : FULL) * (s.el.ownerDocument.defaultView ?? window).innerHeight

/** The sheet's own part under a target: in closest(), :scope is the target, not the sheet, so match by parent. */
function part(s: Hand, t: EventTarget | null, ...names: string[]) {
  const hit = (t as Element | null)?.closest?.(names.map((n) => `[data-part="${n}"]`).join(','))
  return hit && hit.parentElement === s.el ? hit : null
}

function settle(s: Hand, d: Detent | null) {
  const { el } = s
  s.at = d
  // the stylesheet's own 0px: writing it would be one more mutation on every open
  el.style.removeProperty('--_drag')
  if (!d) {
    el.style.removeProperty('--_sheet-h')
    delete el.dataset.detent
    return
  }
  el.style.setProperty('--_sheet-h', `${(d === 'half' ? HALF : FULL) * 100}dvh`)
  el.dataset.detent = d
  if (s.o.peek) modal(el, d === 'full')
  el.querySelector(':scope > [data-part="handle"]')?.setAttribute('aria-label', LABEL[d])
  s.o.onDetent?.(d)
}

/** Swaps a shown dialog between modal (the page inert behind a scrim) and not, keeping it on screen and its focus. */
function modal(el: HTMLDialogElement, on: boolean) {
  if (!el.open || el.matches(':modal') === on || !el.showModal) return
  const doc = el.ownerDocument
  const focus =
    doc.activeElement instanceof HTMLElement && el.contains(doc.activeElement)
      ? doc.activeElement
      : null
  el.setAttribute('data-swapping', '')
  el.close()
  if (on) el.showModal()
  else el.show()
  el.removeAttribute('data-swapping')
  focus?.focus({ preventScroll: true })
}

/** On opening: stops only when the content would stand taller than the half stop. */
function start(s: Hand) {
  if (!bottom(s)) return settle(s, null)
  s.el.style.removeProperty('--_sheet-h')
  settle(s, s.el.scrollHeight > px(s, 'half') + 24 ? (s.o.at ?? 'half') : null)
}

function down(s: Hand, e: PointerEvent) {
  if (!bottom(s) || e.button !== 0 || !part(s, e.target, 'handle', 'header')) return
  const t = e.target as Element | null
  if (t?.closest?.('button:not([data-part="handle"]), a, input, select, textarea')) return
  const h = s.el.getBoundingClientRect().height
  s.drag = { y: e.clientY, h, last: e.clientY, t: e.timeStamp, v: 0, moved: false, id: e.pointerId }
}

function move(s: Hand, e: PointerEvent) {
  const d = s.drag
  if (!d || e.pointerId !== d.id) return
  const dy = e.clientY - d.y
  if (!d.moved && Math.abs(dy) < 4) return
  if (!d.moved) {
    d.moved = true
    s.el.setAttribute('data-dragging', '')
    s.el.setPointerCapture?.(e.pointerId)
  }
  d.v = d.v * 0.6 + ((e.clientY - d.last) / Math.max(1, e.timeStamp - d.t)) * 0.4
  d.last = e.clientY
  d.t = e.timeStamp
  // the height follows the hand between the stops; below the lowest the whole sheet slides down instead
  const low = s.at ? px(s, 'half') : d.h
  const high = s.at ? px(s, 'full') : d.h
  const h = d.h - dy
  const shown = Math.min(high + (h > high ? Math.sqrt(h - high) * 4 : 0), Math.max(low, h))
  s.el.style.setProperty('--_sheet-h', `${shown}px`)
  s.el.style.setProperty('--_drag', `${Math.max(0, low - h)}px`)
}

/** Where a release lands: the stop nearest where it was heading, but closing wants a real pull or a flick. */
function land(s: Hand, d: Drag, h: number): Stop {
  const stops: Stop[] = s.at
    ? [
        ['close', 0],
        ['half', px(s, 'half')],
        ['full', px(s, 'full')],
      ]
    : [
        ['close', 0],
        [null, d.h],
      ]
  const heading = h - d.v * CARRY
  let pick = stops[0]!
  for (const st of stops) if (Math.abs(st[1] - heading) < Math.abs(pick[1] - heading)) pick = st
  // past a third of the lowest stop, or a flick
  if (pick[0] === 'close' && h > stops[1]![1] * 0.66 && d.v < 0.5) pick = stops[1]!
  return pick[0] === 'close' ? ['close', stops[1]![1]] : pick
}

function up(s: Hand, e: PointerEvent) {
  const d = s.drag
  if (!d || e.pointerId !== d.id) return
  s.drag = null
  if (!d.moved) return
  s.swallow = true
  s.el.removeAttribute('data-dragging')
  const [to, lowest] = land(s, d, d.h - (e.clientY - d.y))
  if (to !== 'close') return settle(s, to)
  s.el.style.setProperty('--_drag', `${lowest}px`)
  s.o.onClose()
}

function click(s: Hand, e: MouseEvent) {
  if (s.swallow) {
    s.swallow = false
    if (part(s, e.target, 'handle', 'header')) {
      e.stopPropagation()
      e.preventDefault()
    }
    return
  }
  if (s.at && part(s, e.target, 'handle')) settle(s, s.at === 'half' ? 'full' : 'half')
}

function key(s: Hand, e: KeyboardEvent) {
  if (!s.at || !part(s, e.target, 'handle')) return
  if (e.key === 'ArrowUp' && s.at === 'half') settle(s, 'full')
  else if (e.key === 'ArrowDown' && s.at === 'full') settle(s, 'half')
  else return
  e.preventDefault()
}

/** Attach to a sheet's <dialog>. It acts only while the sheet is at the bottom (`data-side="bottom"`). */
export function sheet(el: HTMLDialogElement, opts: SheetOptions): Action<SheetOptions> {
  const s: Hand = { el, o: opts, at: null, drag: null, swallow: false }
  let wasOpen = false
  const win = el.ownerDocument.defaultView ?? window
  const on: [string, EventListener, boolean?][] = [
    ['pointerdown', (e) => down(s, e as PointerEvent)],
    ['pointermove', (e) => move(s, e as PointerEvent)],
    ['pointerup', (e) => up(s, e as PointerEvent)],
    ['pointercancel', (e) => up(s, e as PointerEvent)],
    ['click', (e) => click(s, e as MouseEvent), true],
    ['keydown', (e) => key(s, e as KeyboardEvent)],
  ]
  const resize = () => s.at && settle(s, s.at)
  for (const [type, fn, capture] of on) el.addEventListener(type, fn, capture)
  win.addEventListener('resize', resize)
  const apply = () => {
    if (s.o.open && !wasOpen) start(s)
    wasOpen = s.o.open
  }
  apply()
  return {
    update(next) {
      s.o = next
      apply()
    },
    destroy() {
      for (const [type, fn, capture] of on) el.removeEventListener(type, fn, capture)
      win.removeEventListener('resize', resize)
    },
  }
}
