// Toasts (05 §5; components.html:1704-1790). The store is the list (newest first) and what each toast is; the
// toaster() action on the pre-mounted region does everything the DOM does: the collapsed stack (10px offset, 5%
// smaller, three visible) that fans out on hover or focus, the timer (a Web Animation on the progress hairline,
// paused while the region is hovered, focused or the page hidden), swipe to dismiss, F8, and announcing through the
// pre-mounted live regions.
import { onTopModal } from './layers'
import { store, uid } from './store'

export type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'
export interface ToastInput { title: string; description?: string; tone?: Tone; action?: { label: string; onClick(): void }; duration?: number; id?: string; /** Spinner in place of the icon; it stays until updated. */ loading?: boolean }
export interface Toast extends ToastInput { id: string; life: number; state?: 'closed' | 'swiped' }
export interface ToastPromise<T> { pending: string | ToastInput; done: string | ToastInput | ((value: T) => string | ToastInput); error: string | ToastInput | ((reason: unknown) => string | ToastInput) }

/** 5s + 60ms a word; 10s with an action; a critical toast with an action stays until dismissed (life 0). */
export function lifeOf(t: ToastInput) {
  if (t.loading) return 0
  if (t.duration !== undefined) return t.duration
  if (t.tone === 'critical' && t.action) return 0
  if (t.action) return 10000
  const words = `${t.title} ${t.description ?? ''}`.trim().split(/\s+/).length
  return 5000 + 60 * words
}

export function toastStore() {
  const list = store<Toast[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const dismiss = (id: string, how: 'closed' | 'swiped' = 'closed') => {
    if (!list.get().some(t => t.id === id && !t.state)) return
    list.set(list.get().map(t => (t.id === id ? { ...t, state: how } : t)))
    clearTimeout(timers.get(id))
    // the exit runs on the element (data-state); then it leaves the list
    timers.set(id, setTimeout(() => { timers.delete(id); list.set(list.get().filter(t => t.id !== id)) }, 320))
  }
  const show = (input: ToastInput) => {
    const t: Toast = { ...input, id: input.id ?? uid('toast'), life: lifeOf(input) }
    list.set([t, ...list.get().filter(x => x.id !== t.id)])
    return t.id
  }
  const shape = (v: string | ToastInput): ToastInput => (typeof v === 'string' ? { title: v } : v)
  /** One toast through a promise's life: pending, then what it settled to, in place (05 §5). */
  const promise = <T>(p: Promise<T>, m: ToastPromise<T>) => {
    const id = show({ ...shape(m.pending), loading: true })
    const settle = (next: ToastInput) => { list.set(list.get().map(t => (t.id === id ? { ...next, id, life: lifeOf(next) } : t))) }
    p.then(v => settle({ tone: 'positive', ...shape(typeof m.done === 'function' ? m.done(v) : m.done) }), e => settle({ tone: 'critical', ...shape(typeof m.error === 'function' ? m.error(e) : m.error) }))
    return p
  }
  return { get: list.get, subscribe: list.subscribe, show, dismiss, promise }
}
export type ToastStore = ReturnType<typeof toastStore>

/** Write `text` into the pre-mounted announcer (polite role=status, or assertive role=alert): clear, then write 60ms later. */
export function announce(doc: Document, text: string, assertive = false) {
  const el = doc.querySelector<HTMLElement>(`[data-scope="announcer"][aria-live="${assertive ? 'assertive' : 'polite'}"]`)
  if (!el) return
  el.textContent = ''
  setTimeout(() => (el.textContent = text), 60)
}

// a timer is an Animation (the progress bar) or a timeout (Node's is an object too)
const stop = (a: any) => (typeof a?.cancel === 'function' ? a.cancel() : clearTimeout(a))

export function toaster(region: HTMLElement, toasts: ToastStore) {
  const doc = region.ownerDocument
  const win = doc.defaultView!
  const timers = new Map<HTMLElement, Animation | ReturnType<typeof setTimeout>>()
  const seen = new Set<string>()
  const items = () => [...region.querySelectorAll<HTMLElement>(':scope > [data-scope="toast"][data-part="root"]:not([data-state])')]
  const expanded = () => region.matches(':hover, :focus-within')
  const paused = () => expanded() || doc.hidden

  function layout() {
    const list = items()
    const open = expanded()
    let y = 0
    const front = list[0]?.offsetHeight ?? 0
    list.forEach((el, i) => {
      el.style.zIndex = String(100 - i)
      const behind = i > 0 && !open
      el.toggleAttribute('data-behind', behind)
      el.inert = behind
      el.style.maxBlockSize = behind ? `${front}px` : ''
      el.style.overflow = behind ? 'hidden' : ''
      if (open) {
        el.style.setProperty('--_y', `${-y}px`)
        el.style.setProperty('--_s', '1')
        el.style.setProperty('--_o', i < 5 ? '1' : '0')
        y += el.offsetHeight + 8
      } else {
        const k = Math.min(i, 3)
        el.style.setProperty('--_y', `${-k * 12}px`)
        el.style.setProperty('--_s', String(1 - k * 0.05))
        el.style.setProperty('--_o', i < 3 ? '1' : '0')
      }
    })
    region.style.blockSize = list.length ? `${open ? Math.max(0, y - 8) : front}px` : ''
  }

  // the timer is the progress hairline running down; its end dismisses
  function arm(el: HTMLElement, t: { id: string; life: number }) {
    if (timers.has(el) || !t.life) return
    const bar = el.querySelector<HTMLElement>(':scope > [data-part="progress"]')
    if (bar?.animate) {
      const a = bar.animate([{ scale: '1 1' }, { scale: '0 1' }], { duration: t.life, easing: 'linear', fill: 'forwards' })
      a.onfinish = () => toasts.dismiss(t.id)
      if (paused()) a.pause()
      timers.set(el, a)
    } else timers.set(el, setTimeout(() => toasts.dismiss(t.id), t.life))
  }
  const syncTimers = () => {
    for (const a of timers.values()) if (typeof a === 'object' && 'pause' in a) paused() ? a.pause() : a.play()
  }

  const render = () => {
    const now = toasts.get()
    for (const el of items()) {
      const t = now.find(x => x.id === el.dataset.id)
      if (!t) continue
      arm(el, t)
      if (!seen.has(t.id)) { seen.add(t.id); announce(doc, [t.title, t.description].filter(Boolean).join('. '), t.tone === 'critical') }
    }
    for (const [el, a] of timers) if (!el.isConnected || el.dataset.state) { stop(a); timers.delete(el) }
    layout()
  }
  // the binding renders the list into the region; follow it
  const observer = new win.MutationObserver(() => render())
  observer.observe(region, { childList: true, attributes: true, attributeFilter: ['data-state'], subtree: false })
  const unsubscribe = toasts.subscribe(() => win.queueMicrotask(render))

  const onHover = () => { layout(); syncTimers() }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'F8') return
    e.preventDefault()
    region.focus()
    items()[0]?.querySelector<HTMLElement>('button')?.focus()
  }
  // swipe: the toast follows the pointer; past 35% of its width or a flick (> 0.5px/ms) dismisses it that way
  let drag: { el: HTMLElement; x: number; t: number; id: string } | null = null
  const onDown = (e: PointerEvent) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-scope="toast"][data-part="root"]')
    if (!el || (e.target as Element).closest('button') || !el.dataset.id) return
    drag = { el, x: e.clientX, t: e.timeStamp, id: el.dataset.id }
    el.setPointerCapture?.(e.pointerId)
    el.setAttribute('data-swiping', '')
  }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    drag.el.style.setProperty('--_x', `${dx}px`)
    drag.el.style.setProperty('--_o', String(Math.max(0, 1 - Math.abs(dx) / drag.el.offsetWidth)))
  }
  const onUp = (e: PointerEvent) => {
    if (!drag) return
    const { el, id } = drag
    const dx = e.clientX - drag.x, v = Math.abs(dx) / Math.max(1, e.timeStamp - drag.t)
    el.removeAttribute('data-swiping')
    drag = null
    if (Math.abs(dx) > el.offsetWidth * 0.35 || v > 0.5) {
      el.style.setProperty('--_x', `${Math.sign(dx) * (el.offsetWidth + 40)}px`)
      toasts.dismiss(id, 'swiped')
    } else {
      el.style.setProperty('--_x', '0px')
      layout()
    }
  }
  // showModal makes everything outside the dialog inert, top layer or not, so while a modal is open the region and the
  // live regions live inside the topmost one, a popover there so the dialog's box neither clips nor positions it. A
  // comment holds their place. data-moving stops the toasts replaying their entrance; their timers are Animations,
  // which don't notice.
  let home: Comment | null = null
  const follow = (top: HTMLElement | null) => {
    const live = doc.querySelectorAll('[data-scope="announcer"]')
    const focused = region.contains(doc.activeElement) ? doc.activeElement as HTMLElement : null
    const hovered = region.matches(':hover') // lost with the move, until the pointer next moves
    region.setAttribute('data-moving', '')
    if (region.matches(':popover-open')) region.hidePopover()
    if (top) {
      if (!home) region.before((home = doc.createComment('')))
      top.append(region, ...live)
      region.setAttribute('popover', 'manual')
      region.showPopover?.()
    } else if (home) {
      region.removeAttribute('popover')
      if (home.parentNode) home.replaceWith(region, ...live)
      else { region.remove(); for (const n of live) n.remove() } // the Toaster went while it was away
      home = null
    }
    focused?.focus({ preventScroll: true })
    win.requestAnimationFrame(() => region.removeAttribute('data-moving'))
    if (hovered) doc.addEventListener('pointermove', onHover, { once: true })
    else onHover()
  }
  const unwatch = onTopModal(doc, follow)
  const on: [EventTarget, string, (e: any) => void][] = [
    [region, 'pointerenter', onHover], [region, 'pointerleave', onHover], [region, 'focusin', onHover], [region, 'focusout', () => win.requestAnimationFrame(onHover)],
    [doc, 'visibilitychange', syncTimers], [doc, 'keydown', onKey],
    [region, 'pointerdown', onDown], [region, 'pointermove', onMove], [region, 'pointerup', onUp], [region, 'pointercancel', onUp],
  ]
  for (const [t, type, fn] of on) t.addEventListener(type, fn)
  render()
  return {
    update: render,
    destroy() {
      observer.disconnect()
      unsubscribe()
      unwatch()
      follow(null)
      for (const [t, type, fn] of on) t.removeEventListener(type, fn)
      for (const a of timers.values()) stop(a)
    },
  }
}
