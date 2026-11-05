import { LONG_PRESS } from './drag'

/** Long press on `selector` inside `el`: `data-pressing` while held, `onPress` after 400ms, a move or lift cancels. */
export function longPress(
  el: HTMLElement,
  opts: { selector: string; onPress(row: HTMLElement): void },
) {
  let o = opts
  let timer: ReturnType<typeof setTimeout> | undefined
  let row: HTMLElement | undefined
  let start = { x: 0, y: 0 }
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
    if (row) delete row.dataset.pressing
    row = undefined
  }
  const down = (e: PointerEvent) => {
    const r = (e.target as Element).closest?.<HTMLElement>(o.selector)
    if (!r || e.button) return
    clear()
    row = r
    start = { x: e.clientX, y: e.clientY }
    r.dataset.pressing = ''
    timer = setTimeout(() => {
      const hit = row!
      clear()
      el.ownerDocument.defaultView?.navigator.vibrate?.(8)
      o.onPress(hit)
    }, LONG_PRESS)
  }
  const move = (e: PointerEvent) => {
    if (row && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clear()
  }
  const menu = (e: Event) => {
    if ((e.target as Element).closest?.(o.selector)) e.preventDefault()
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', clear)
  el.addEventListener('pointercancel', clear)
  el.addEventListener('contextmenu', menu)
  return {
    update(next: typeof opts) {
      o = next
    },
    destroy() {
      clear()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', clear)
      el.removeEventListener('pointercancel', clear)
      el.removeEventListener('contextmenu', menu)
    },
  }
}

/** Horizontal swipe between three pages (07 §2.3): axis lock at 8px, a quarter width or a flick pages. */
export function swipePages(
  el: HTMLElement,
  opts: { track(): HTMLElement | null | undefined; onStep(dir: 1 | -1): void },
) {
  let o = opts
  let st: { x: number; y: number; t: number; lock: 'x' | 'y' | null } | null = null
  const down = (e: PointerEvent) => {
    if (!e.button) st = { x: e.clientX, y: e.clientY, t: performance.now(), lock: null }
  }
  const move = (e: PointerEvent) => {
    if (!st) return
    const dx = e.clientX - st.x,
      dy = e.clientY - st.y
    if (!st.lock && Math.hypot(dx, dy) > 8) st.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (st.lock !== 'x') return
    const t = o.track()
    if (t) {
      t.dataset.dragging = ''
      t.style.setProperty('--_dx', `${dx}px`)
    }
    el.setPointerCapture?.(e.pointerId)
  }
  const up = (e: PointerEvent) => {
    if (!st) return
    const dx = e.clientX - st.x,
      flick = Math.abs(dx) / (performance.now() - st.t),
      was = st.lock
    st = null
    const t = o.track()
    if (t) delete t.dataset.dragging
    if (was !== 'x') return
    if (Math.abs(dx) > el.clientWidth * 0.25 || flick > 0.5) o.onStep(dx < 0 ? 1 : -1)
    else t?.style.setProperty('--_dx', '0px')
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return {
    update(next: typeof opts) {
      o = next
    },
    destroy() {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    },
  }
}

/** Motion is off, by the OS or the dial. */
export const motionOff = (el: Element) =>
  !!el.closest('[data-motion="reduce"]') ||
  !!el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Run `track` to `dx` on its transition, then `land` with transitions off for a frame; straight to `land` if nothing moves. */
export function slide(track: HTMLElement, dx: string, land: () => void) {
  const win = track.ownerDocument.defaultView!
  if (motionOff(track) || !(parseFloat(win.getComputedStyle(track).transitionDuration) > 0))
    return land()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    track.removeEventListener('transitionend', finish)
    track.dataset.dragging = ''
    land()
    win.requestAnimationFrame(() => delete track.dataset.dragging)
  }
  track.addEventListener('transitionend', finish, { once: true })
  setTimeout(finish, 500)
  track.style.setProperty('--_dx', dx)
}
