// Partial hydration on the client (PLAN §11). A static level is the server's HTML with no code behind it; the islands in
// it are the only components that run. `<!--wi:["id","key",[values]]-->` opens an island in the server's output,
// followed by its range; `<!--wl:d:["p",n]-->` … `<!--/wl:d-->` bound route level `d`. `level` adopts a level already
// in the page (`html` empty) or builds one the server sent for a navigation; the next level goes where its markers are.
//
// Islands claim by key like any hydration, each starting from the scope the server recorded. Disposal is the caller's:
// everything here is owned by the hole that shows the level.
//
// An island whose comment ends in `"v"` or `"i"` waits. Its nodes keep their `wk` and it stays in `later`, with the owner
// and page data of its level, until `wake` (an event on it, through capture.mjs) or the viewport: `v`
// runs when it's near, `i` only fetches then. Claiming it is a pass of its own, and then `drain` replays what the script
// held, in order: an event on an island still loading holds up those behind it, so a click can't pass the typing before.

import { DEV, flush, getOwner, onCleanup, within, type Owner, type SsrData } from './index'
import { rt, runMounts } from './index/graph'
import { hchild } from './claim'
import { hydration, sweep } from './hydrate'
import { keys, under } from './keys'
import { siblings, comments, bounds, slot, closing } from './island/dom'

export type Load = (id: string) => (props: { v: unknown[]; s: unknown }) => unknown

/** A comment only the claim reads, which never belongs to a hole: a level's or an island's or a slot's. */
export const marks = (n: Node) => n.nodeType === 8 && /^\/?w[lis]:?/.test((n as Comment).data)

interface Later {
  key: string
  when: string
  wait: () => Promise<unknown>
  mount(): void
  running?: Promise<void>
  /** The element the viewport observer watches for it, until it runs or is disposed. */
  el?: Element
}
const later = new Map<string, Later>()
/** What `capture.mjs` left: see there for the fields. */
const held = () =>
  (
    window as Window & {
      __wq?: {
        q: Event[]
        d: boolean
        r?: number | undefined
        p(e: Event): void
        l?: Element
        w(k: Element, lead?: 1): void
      }
    }
  ).__wq

/** The island `el` (which has `wk`) is in, if it's still waiting. Keys nest by `/`, an island's own being the prefix. */
function waiting(el: Element | null | undefined) {
  for (let k = el?.getAttribute('wk'); k; k = k.slice(0, Math.max(k.lastIndexOf('/'), 0))) {
    const r = later.get(k)
    if (r) return r
  }
  return undefined
}

/**
 * Code that won't load, usually a page older than the deploy serving it: the fresh page once, then saying so. An island
 * that stays quiet looks alive and does nothing.
 */
function stale() {
  const key = `weft:reloaded:${location.pathname}`
  try {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      return location.reload()
    }
  } catch {}
  if (document.querySelector('[data-weft-stale]')) return
  const note = document.createElement('p')
  note.setAttribute('data-weft-stale', '')
  note.setAttribute('role', 'alert')
  note.style.cssText =
    'position:fixed;inset:auto 1rem 1rem;z-index:2147483647;margin:0;padding:.75rem 1rem;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif'
  note.textContent = 'Part of this page could not load. Reload to try again.'
  document.body.append(note)
}

const RETRY_MS = 800

/** Load and claim, once. Code that can't load is tried again, then `stale`: its held events take their defaults. */
// oxlint-disable no-promise-executor-return -- `setTimeout` returns nothing a promise looks at, and braces cost bytes on every page with an island
const run = (r: Later) =>
  (r.running ??= r
    .wait()
    .catch(() =>
      new Promise(
        (go) => setTimeout(go, RETRY_MS) /* oxlint-enable no-promise-executor-return */,
      ).then(r.wait),
    )
    .then(
      () => {
        if (later.get(r.key) === r) {
          later.delete(r.key)
          r.mount()
        }
      },
      () => {
        // Disposed while it retried (the user moved on): nothing is left to call stale.
        if (later.get(r.key) !== r) return
        later.delete(r.key)
        stale()
      },
    )
    .catch(console.error)
    .then(drain))

/** Claims the island `el` is in now, without waiting for what it was waiting for. */
export function wake(el: Element) {
  const r = waiting(el)
  r ? void run(r) : drain()
}

let draining = false
/** Replay what was held, up to the first event on an island that isn't running yet. */
export function drain() {
  const c = held()
  if (!c || draining) return
  draining = true
  try {
    while (c.q.length) {
      const e = c.q[0]!
      const r = waiting((e.target as Element).closest?.('[wk]'))
      if (r) return void run(r)
      c.q.shift()
      if (e.type === 'input' && c.q[0]?.type === 'input' && c.q[0].target === e.target) continue // the DOM has the last value
      c.p(e)
      flush()
    }
  } finally {
    draining = false
  }
}

type Control = HTMLInputElement & HTMLSelectElement

/** Controls that moved with no event the script saw (autofill, a restored form): the island hears about them too. */
function typed(nodes: Node[]) {
  const c = held()
  if (!c) return
  for (const n of nodes) {
    if (n.nodeType !== 1) continue
    for (const el of [
      n as Control,
      ...(n as Element).querySelectorAll<Control>('input,textarea,select'),
    ]) {
      if (!/^(input|textarea|select)$/.test(el.localName) || c.q.some((e) => e.target === el))
        continue
      const moved =
        el.localName === 'select'
          ? el.selectedIndex !==
            Math.max(
              [...el.options].findIndex((o) => o.defaultSelected),
              0,
            )
          : /^(checkbox|radio)$/.test(el.type)
            ? el.checked !== el.defaultChecked
            : el.value !== el.defaultValue
      if (!moved) continue
      const was = c.r
      c.r = 1
      for (const t of ['input', 'change']) el.dispatchEvent(new Event(t, { bubbles: true }))
      c.r = was
    }
  }
}

let near: IntersectionObserver | undefined
const watched = new WeakMap<Element, Later>()
function watch(r: Later, c: Comment) {
  const el = c.nextElementSibling
  // oxlint-disable-next-line typescript/no-misused-promises -- `run` retries and then marks the island stale itself; a `void` here costs bytes on every page with an island
  if (!el) return void (r.when === 'v' && setTimeout(() => run(r)))
  near ??= new IntersectionObserver(
    (list) => {
      for (const e of list) {
        const hit = e.isIntersecting && watched.get(e.target)
        if (!hit) continue
        near!.unobserve(e.target)
        void (hit.when === 'v' ? run(hit) : hit.wait().catch(() => {}))
      }
    },
    { rootMargin: '600px' },
  )
  watched.set(el, r)
  r.el = el
  near.observe(el)
}

function drop(c: Comment, close: Node) {
  for (let n: Node | null = c.nextSibling; n && n !== close;) {
    const x: Node | null = n.nextSibling
    n.parentNode!.removeChild(n)
    n = x
  }
  close.parentNode?.removeChild(close)
  c.parentNode?.removeChild(c)
}

function mountIslands(nodes: Node[], load: Load, wait?: (id: string) => Promise<unknown>) {
  const found: [Comment, boolean][] = []
  const tops = new Set(nodes)
  let nested = 0
  comments(nodes, (c) => {
    if (c.data.startsWith('wl:')) nested++
    else if (c.data.startsWith('/wl:')) nested--
    else if (!nested && c.data.startsWith('wi:')) found.push([c, tops.has(c)])
  })
  for (const [c, top] of found) {
    const [id, key, v, when] = JSON.parse(c.data.slice(3)) as [string, string, unknown[], string?]
    const open = c.nextSibling!
    const close = closing(open)
    const mount = () => {
      const ranges = slot(open, close!, hydration.trash)
      let read = 0
      const props = {
        v,
        get s() {
          return ranges[read++ % ranges.length]
        },
      }
      under(key + '/', () =>
        hchild(c.parentNode as Element, () => load(id)(props), close, undefined, undefined, 1),
      )
      // At the level's top with a range that stays: the island decides what's in it, so the level can't list it.
      if (top && !hydration.trash.includes(close as ChildNode)) onCleanup(() => drop(c, close!))
      else hydration.trash.push(c)
    }
    if (!when || !wait) {
      mount()
      continue
    }
    const owner = getOwner() as Owner
    const data = rt.data
    const r: Later = {
      key,
      when,
      wait: () => wait(id),
      mount() {
        const range = siblings(open, close)
        within(owner, () => claiming(range, data, mount))
        runMounts()
        typed(range)
      },
    }
    later.set(key, r)
    onCleanup(() => {
      if (later.get(key) !== r) return
      later.delete(key)
      if (r.el) near?.unobserve(r.el)
      if (top) drop(c, close!)
    })
    // No capture script (a strict CSP, say): nothing would ever wake it, so it doesn't wait.
    // oxlint-disable-next-line typescript/no-misused-promises -- `run` retries and then marks the island stale itself; a `void` here costs bytes on every page with an island
    if (!held()) setTimeout(() => run(r))
    else if (!held()!.d) watch(r, c)
    // Not part of this pass: `hydrate` would call them unclaimed.
    if (DEV)
      for (const n of siblings(open, close))
        if (n.nodeType === 1)
          for (const el of [n as Element, ...(n as Element).querySelectorAll('[wk]')])
            hydration.registry.delete(el.getAttribute('wk')!)
  }
}
/** Run `fn` as a claiming pass over `nodes`, for HTML that isn't part of `hydrate()`'s own pass. */
function claiming(nodes: Node[], data: SsrData | undefined, fn: () => void) {
  const { registry } = hydration
  for (const n of nodes) {
    if (n.nodeType !== 1) continue
    if ((n as Element).hasAttribute('wk'))
      registry.set((n as Element).getAttribute('wk')!, n as Element)
    for (const el of (n as Element).querySelectorAll('[wk]'))
      registry.set(el.getAttribute('wk')!, el)
  }
  const was = { d: rt.data, s: rt.state }
  const missed = hydration.misses
  rt.data = data
  rt.state = data?.s
  Object.assign(keys, { on: true, hydrating: true, p: '', n: 0 })
  try {
    fn()
  } finally {
    if (hydration.misses > missed)
      console.warn(
        'weft: rendered fresh, a key differs between server and client (see `weft docs W044`)',
      )
    Object.assign(keys, { on: false, hydrating: false, miss: false, p: '', n: 0 })
    rt.data = was.d
    rt.state = was.s
    registry.clear()
    sweep()
  }
}
let resume: [string, number] | undefined
/** End markers a parent level inserts before: they outlive the level they close. */
const anchors = new WeakSet<Node>()
/** A level's start: when a static level holds it, the key scope the server recorded there (`region`). */
export function enter<T>(fn: () => T): T {
  const s = resume
  resume = undefined
  return s && keys.on ? under(s[0], () => ((keys.n = s[1]), fn())) : fn()
}
/**
 * Show level `d`: the nodes of `html`, or those between its markers when `html` is empty, with its islands running and
 * `next` (the next level) where that level's markers are. The value goes in the hole that shows the level. `wait`
 * loads an island that doesn't have to be there first.
 */
// oxlint-disable-next-line max-params -- compiler-emitted code calls this; its arity is part of the compiler's output
export function level(
  html: string,
  d: number,
  next: () => unknown,
  load: Load,
  data?: SsrData,
  wait?: (id: string) => Promise<unknown>,
): unknown {
  const page = !html
  const t = document.createElement('template')
  let own: Comment[] = []
  const read = () => {
    if (!page) return [...t.content.childNodes]
    const [a, b] = bounds([document.body], d)
    own = a && b ? [a, b] : []
    return a && b ? siblings(a, b) : []
  }
  // oxlint-disable-next-line weft/no-html-sink -- `html` is the app's own server's render, streamed to this same page
  t.innerHTML = html
  let nodes = read()
  const [a, b] = bounds(nodes, d + 1)
  resume =
    page && a
      ? (JSON.parse(a.data.slice(a.data.indexOf(':', 3) + 1)) as [string, number])
      : undefined
  const scope = resume
  resume = undefined
  const islands = () => mountIslands(nodes, load, wait)
  page ? islands() : claiming(nodes, data, islands)
  resume = scope
  hydration.trash.push(...own.filter((n) => !anchors.has(n)))
  if (!page) sweep()
  nodes = read().filter((n) => n === a || n === b || !marks(n))
  if (!a) return nodes
  const i = nodes.indexOf(a)
  if (i >= 0) {
    // At the level's top: the next level is part of this value.
    hydration.trash.push(a, b!)
    if (!page) sweep()
    return [...nodes.slice(0, i), next, ...nodes.slice(nodes.indexOf(b!) + 1)]
  }
  // Inside an element: its own hole, before the end marker, which stays as the anchor.
  hydration.trash.push(a)
  anchors.add(b!)
  if (!page) sweep()
  hchild(a.parentNode as Element, next, b)
  return nodes
}
