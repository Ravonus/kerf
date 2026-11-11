// The veneer-core half of the live pack (07 §0, §3, §4): pure logic and actions, no framework.
import { nextIndex } from './focus'

export * from './live/notifications'
export * from './live/status'
export * from './live/preferences'
export * from './live/meetings'
export * from './live/transport'
export * from './live/sim'

/** Runs `tick` every `ms` while `el` is on screen and the page visible (07 §4.7: no pings for nobody). */
export function whileSeen(el: HTMLElement, opts: { ms: number; tick(): void }) {
  let o = opts
  const doc = el.ownerDocument
  const win = doc.defaultView
  let seen = !win?.IntersectionObserver
  let timer: ReturnType<typeof setInterval> | undefined
  const sync = () => {
    clearInterval(timer)
    timer = undefined
    if (seen && !doc.hidden) timer = setInterval(() => o.tick(), o.ms)
  }
  const io = win?.IntersectionObserver
    ? new win.IntersectionObserver((es) => {
        for (const e of es) seen = e.isIntersecting
        sync()
      })
    : undefined
  io?.observe(el)
  doc.addEventListener('visibilitychange', sync)
  sync()
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() {
      clearInterval(timer)
      io?.disconnect()
      doc.removeEventListener('visibilitychange', sync)
    },
  }
}

/** Toolbar and radio-style key handling share nextIndex; this is the toolbar's tab stop (07 §3.4). */
export function toolbar(el: HTMLElement, opts: { items: string }) {
  let o = opts
  const items = () =>
    [...el.querySelectorAll<HTMLElement>(o.items)].filter((n) => !n.matches(':disabled'))
  const rove = (t: HTMLElement) => {
    for (const n of items()) n.tabIndex = n === t ? 0 : -1
  }
  const onKey = (e: KeyboardEvent) => {
    const list = items()
    const at = list.indexOf(e.target as HTMLElement)
    if (at < 0) return
    const to = nextIndex(e.key, at, list.length, { rtl: getComputedStyle(el).direction === 'rtl' })
    if (to < 0) return
    e.preventDefault()
    rove(list[to]!)
    list[to]!.focus()
  }
  const onFocus = (e: FocusEvent) => {
    if ((e.target as Element).matches?.(o.items)) rove(e.target as HTMLElement)
  }
  el.addEventListener('keydown', onKey)
  el.addEventListener('focusin', onFocus)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() {
      el.removeEventListener('keydown', onKey)
      el.removeEventListener('focusin', onFocus)
    },
  }
}
