// The sweep phase machine (SIGNATURE §1.4, §1b, §4), ported from docs/design/warp/specimens/warp-sweep.js.
// warp.css (@layer warp.signature) draws everything; this only writes host[data-phase]:
//   active            → "in"   (from "out": "idle", one style flush, then "in", so every entry draws left to right)
//   inactive, "in"    → "out"  (the sweep keeps travelling left to right)
//   "out" + transitionend on the travelling part, or a ms+150 backstop → "idle"
//   duration 0 (reduced motion, data-motion="reduce") → straight to "idle"
// Active = hover (not touch) | focus (:focus-within for fields, :focus-visible elsewhere) | held (data-pin, data-hold,
// aria-expanded/aria-pressed true, data-state=open, :popover-open, an open field) | a touch tap | a one-shot confirm().
// Hosts are [data-sweep]; data-static hosts are frozen demo states and never touched. Events are delegated once per
// document and a MutationObserver follows held states and new hosts, so a framework binding only renders the markup
// (with data-phase="idle") and never calls in here on its own.

const HOST = '[data-sweep]'
const TRIGGER = '[data-sweep-trigger], label[data-scope="checkbox"], label[data-scope="radio"], label[data-scope="switch"]'
const WITHIN = '[data-scope="field"] > [data-part="control"], [data-scope="field"][data-sweep], [data-scope="composer"], [data-part="input-row"], [data-sweep-focus="within"]'
const HELD = '[data-pin], [data-hold], [aria-expanded="true"], [aria-pressed="true"], [data-state="open"]'
const HELD_CHILD = ':scope > [aria-expanded="true"], :scope > [data-part="heading"] [aria-expanded="true"], :scope > [data-part="input"][aria-expanded="true"], :scope > [data-part="trigger"][aria-expanded="true"]'
const ATTRS = ['data-sweep', 'data-pin', 'data-hold', 'aria-expanded', 'aria-pressed', 'data-state', 'data-open']

export interface SweepMachine {
  /** Set data-phase="idle" on new hosts in `scope` and bring every host to its current phase. */
  init(scope?: ParentNode): void
  /** Re-evaluate a host, or every host inside a container. */
  sync(el: Element | null | undefined): void
  /** Hold a host "in" (data-pin) or release it. */
  pin(el: Element | null | undefined, on: boolean): void
  /** One full pass, in then out, as feedback (sent, saved, copied). */
  confirm(el: Element | null | undefined): void
  /** The host's real sweep duration in ms (0 under reduced motion), cached per dial stop and host kind. */
  duration(el?: Element | null): number
  /** Remove the listeners and the observer. */
  destroy(): void
}

const machines = new WeakMap<Document, SweepMachine>()

/** The document's one sweep machine, installed on first use. */
export function installSweep(doc: Document = document): SweepMachine {
  let m = machines.get(doc)
  if (!m) machines.set(doc, (m = create(doc)))
  return m
}

/** Action form: make `el` (a host, or a container of hosts) follow the machine. */
export function sweep(el: Element) {
  const m = installSweep(el.ownerDocument)
  m.init(el)
  return { update: () => m.sync(el), destroy() {} }
}

function create(doc: Document): SweepMachine {
  const win = doc.defaultView!
  const hovered = new WeakSet<Element>(), touched = new WeakSet<Element>(), confirming = new WeakSet<Element>()
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  const later = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  const data = (h: Element) => (h as HTMLElement).dataset

  const live = (h: Element) => h.isConnected && h.matches(HOST) && !h.hasAttribute('data-static')
  const trig = (h: Element) => h.parentElement?.closest(TRIGGER) ?? h
  const popOpen = (el: Element) => { try { return el.matches(':popover-open') } catch { return false } }
  // every host a node belongs to: its host ancestors, plus the hosts a trigger ancestor owns
  function hostsAt(node: EventTarget | null): Element[] {
    const out = new Set<Element>()
    const start = node instanceof win.Element ? node : (node as Node | null)?.parentElement
    for (let n = start ?? null; n; n = n.parentElement) {
      if (n.matches(HOST)) out.add(n)
      if (n.matches(TRIGGER)) for (const h of n.querySelectorAll(HOST)) if (trig(h) === n) out.add(h)
    }
    return [...out].filter(live)
  }

  // the part whose transition ends "out": the stroke, the frame's corners, the fill, or the rail's inner sweep
  const travel = (h: Element) =>
    h.querySelector(':scope > [data-part="sweep"], :scope > [data-part="sweep-corners"]') ??
    h.querySelector(':scope > [data-part="sweep-fill"], :scope > [data-part="icon"] > [data-part="sweep"]') ??
    [...h.querySelectorAll('[data-part="rail-hover"]')].find(p => p.closest(HOST) === h) ?? null
  const secs = (list: string) => Math.max(0, ...list.split(',').map(v => parseFloat(v) * (/ms\s*$/.test(v) ? 1 : 1000) || 0))
  // The real duration, read from the part that travels (never by parsing the calc() custom property). At idle the
  // part has transition: none, so then resolve the same token through a probe in the host. Reading it forces a style
  // recalc, so it is cached by what it depends on: the nearest expression and motion scopes, the OS reduced-motion
  // setting, and the host kind (the frame button runs on --warp-frame-duration). A page that overrides
  // --warp-sweep-duration inline on a host opts out with data-sweep-duration="live".
  const cache = new Map<string, number>()
  const reduceMQ = win.matchMedia?.('(prefers-reduced-motion: reduce)')
  const clear = () => cache.clear()
  reduceMQ?.addEventListener?.('change', clear)
  const keyOf = (el: Element) => {
    if (el.closest('[data-sweep-duration="live"]')) return null
    const kind = el.matches(HOST) ? (el.querySelector(':scope > [data-part="sweep-outline"]') ? 'frame' : 'sweep') : 'token'
    return [(el.closest('[data-expression]') as HTMLElement | null)?.dataset.expression ?? '', (el.closest('[data-motion]') as HTMLElement | null)?.dataset.motion ?? '', reduceMQ?.matches ? 1 : 0, kind].join('|')
  }
  function measure(el: Element) {
    const p = el.matches(HOST) ? travel(el) : null
    if (p && win.getComputedStyle(p).transitionProperty !== 'none') return secs(win.getComputedStyle(p).transitionDuration)
    const t = doc.createElement('i')
    t.style.cssText = 'position:absolute;visibility:hidden;transition-duration:var(--warp-sweep-duration)'
    el.append(t)
    const v = secs(win.getComputedStyle(t).transitionDuration)
    t.remove()
    return v
  }
  function duration(el?: Element | null) {
    const target = el ?? doc.body
    const k = keyOf(target)
    if (k === null) return measure(target)
    if (!cache.has(k)) cache.set(k, measure(target))
    return cache.get(k)!
  }

  function active(h: Element) {
    if (hovered.has(h) || touched.has(h) || confirming.has(h)) return true
    const t = trig(h)
    if (h.matches(HELD) || (t !== h && t.matches(HELD)) || popOpen(h) || h.querySelector(HELD_CHILD)) return true
    if (h.closest('[data-scope="field"][data-open], [data-sweep][data-open=""]')) return true
    return h.matches(WITHIN) ? h.matches(':focus-within') : t.matches(':focus-visible, :has(:focus-visible)')
  }
  const idle = (h: Element) => { if (data(h).phase === 'out') data(h).phase = 'idle' }

  // one attribute write per change
  function step(h: Element) {
    if (!live(h)) return
    clearTimeout(timers.get(h))
    const d = data(h)
    if (active(h)) {
      if (d.phase === 'in') return
      if (d.phase === 'out') { d.phase = 'idle'; void (h as HTMLElement).offsetWidth } // restart from the left
      d.phase = 'in'
      return
    }
    if (d.phase !== 'in') { if (!d.phase) d.phase = 'idle'; return }
    d.phase = 'out'
    const ms = duration(h)
    if (!ms) idle(h)
    else timers.set(h, setTimeout(() => idle(h), ms + 150)) // backstop for transitionend
  }
  function sync(el: Element | null | undefined) {
    if (!el) return
    if (el.matches?.(HOST)) step(el)
    else el.querySelectorAll?.(HOST).forEach(step)
  }
  function init(scope: ParentNode = doc) {
    const list: Element[] = (scope as Element).matches?.(HOST) ? [scope as Element] : []
    list.push(...scope.querySelectorAll(HOST))
    for (const h of list) if (!h.hasAttribute('data-static')) { if (!data(h).phase) data(h).phase = 'idle'; step(h) }
  }
  const pin = (el: Element | null | undefined, on: boolean) => { if (!el) return; el.toggleAttribute('data-pin', on); sync(el) }
  // data-confirm is set for the pass so CSS can show it on dial-gated hosts (--_on: 1)
  function confirm(el: Element | null | undefined) {
    if (!el || !live(el)) return
    clearTimeout(later.get(el))
    confirming.add(el)
    el.setAttribute('data-confirm', '')
    step(el)
    later.set(el, setTimeout(() => {
      confirming.delete(el)
      step(el)
      later.set(el, setTimeout(() => el.removeAttribute('data-confirm'), duration(el) + 150))
    }, duration(el)))
  }

  const on: [string, (e: any) => void, boolean?][] = [
    ['pointerover', (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      for (const h of hostsAt(e.target)) if (!hovered.has(h)) { hovered.add(h); step(h) }
    }],
    ['pointerout', (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      for (const h of hostsAt(e.target)) {
        if (!hovered.has(h) || (e.relatedTarget && trig(h).contains(e.relatedTarget as Node))) continue
        hovered.delete(h)
        step(h)
      }
    }],
    // touch: a tap shows the full "in" state for one sweep, then exits like a hover leave
    ['pointerdown', (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      for (const h of hostsAt(e.target)) {
        touched.add(h)
        h.setAttribute('data-touch-effect', 'true')
        step(h)
        clearTimeout(later.get(h))
        later.set(h, setTimeout(() => { touched.delete(h); h.removeAttribute('data-touch-effect'); step(h) }, duration(h) + 80))
      }
    }],
    ['focusin', focus],
    ['focusout', focus],
    ['transitionend', (e: TransitionEvent) => {
      if (!/^(clip-path|transform)$/.test(e.propertyName)) return
      const h = (e.target as Element).closest?.(HOST)
      if (h && data(h).phase === 'out' && travel(h) === e.target) { clearTimeout(timers.get(h)); idle(h) }
    }],
    // popovers open and close without an attribute change
    ['toggle', (e: Event) => sync(e.target as Element), true],
  ]
  function focus(e: FocusEvent) {
    const hs = hostsAt(e.target)
    win.requestAnimationFrame(() => hs.forEach(step))
  }
  for (const [type, fn, capture] of on) doc.addEventListener(type, fn, capture)

  // held states and new hosts: whatever the page changes, the phase follows
  const observer = new win.MutationObserver(records => {
    const todo = new Set<Element>()
    for (const r of records) {
      if (r.type === 'childList') { for (const n of r.addedNodes) if (n.nodeType === 1) init(n as Element); continue }
      const t = r.target as Element
      if (r.attributeName === 'data-sweep' && t.hasAttribute('data-sweep')) { init(t); continue }
      hostsAt(t).forEach(h => todo.add(h))
      if (r.attributeName === 'data-open' && t.matches('[data-scope="field"]')) t.querySelectorAll(':scope > [data-part="control"]').forEach(h => todo.add(h))
    }
    todo.forEach(step)
  })
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS })
  init()

  return {
    init, sync, pin, confirm, duration,
    destroy() {
      for (const [type, fn, capture] of on) doc.removeEventListener(type, fn, capture)
      reduceMQ?.removeEventListener?.('change', clear)
      observer.disconnect()
      machines.delete(doc)
    },
  }
}
