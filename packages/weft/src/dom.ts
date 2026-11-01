// weft/dom: `render`, `hydrate`, the keyed list, and the helpers weft's back end emits (most live in dom-next.ts;
// these are the shared pieces: placing child nodes, attributes, classes, styles, events). Compiled code only; app
// code imports `render` (or `hydrate`) and nothing else from here.

import { Box, DEV, clean, createRoot, devComponent, getOwner, hole, memo, onCleanup, runMounts, untrack, view, within, type Owner } from './index'
import { keys, step, under } from './keys'

export { memo }
export { attr, bind, change, child, cls, component, css, delegate, focus, kids, on, spread, tpl } from './dom-next'
export { first, hchild, htpl, next } from './claim'
export { hydrate, hydration } from './hydrate'
export { drain, enter, level, wake } from './island'

type Mountable = Element | DocumentFragment

let instances = 0

/** `name`/`loc` (dev builds): the component's name and `file:line`; bindings created inside carry them. */
export function createComponent<P>(Comp: (props: P) => any, props: P, name?: string, loc?: string) {
  if (!DEV || !name) return untrack(() => Comp(props))
  const prev = devComponent.label, prevId = devComponent.id
  devComponent.label = `<${name}> (${loc})`
  devComponent.id = ++instances // tells instances apart in the dev graph (weft/devtools)
  try { return untrack(() => Comp(props)) } finally { devComponent.label = prev; devComponent.id = prevId }
}

export function render(code: () => any, container: Element): () => void {
  let dispose!: () => void
  createRoot(d => {
    dispose = d
    insert(container, code())
  }, null)
  runMounts()
  return () => {
    dispose()
    container.textContent = ''
  }
}

// ---- inserting dynamic children -------------------------------------------------------------------------------

// Text nodes a hole made for primitives in a list: when the list is placed again they are reused in order, so
// `Cart ({n})` costs one text write, not three new nodes. Nobody else holds them, so reuse can't take a node away.
const made = new WeakSet<Node>()

/** Every hole's first `current`. `place` only rearranges a list of two or more. */
const EMPTY: Node[] = []

function resolve(value: any, out: Node[], reuse?: { from: Node[]; texts?: Text[]; at: number }): Node[] {
  while (typeof value === 'function') value = value()
  if (value == null || value === true || value === false) return out
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) resolve(value[i], out, reuse)
  } else if (value.nodeType) {
    if (value.nodeType === 11) out.push(...value.childNodes)
    else out.push(value)
  } else {
    const text = String(value)
    const t = reuse && (reuse.texts ??= reuse.from.filter(n => made.has(n)) as Text[])[reuse.at++]
    if (t) {
      if (t.data !== text) t.data = text
      out.push(t)
    } else {
      const n = document.createTextNode(text)
      made.add(n)
      out.push(n)
    }
  }
  return out
}

export function place(parent: Node, value: any, current: Node[], marker: Node | null): Node[] {
  if (typeof value === 'string' || typeof value === 'number') {
    // Fast paths: one text node in, one primitive out → update in place (one characterData write at most); none in
    // → one new text node, in an exact-size list.
    if (current.length === 1 && current[0].nodeType === 3) {
      const text = String(value)
      if ((current[0] as Text).data !== text) (current[0] as Text).data = text
      return current
    }
    if (!current.length) return [parent.insertBefore(document.createTextNode(value as string), marker)] // the DOM converts a number
  }
  const next = resolve(value, [], { from: current, at: 0 })
  // Nodes that stayed at either end, and ends that traded places, cost no lookups. The middle is what's left.
  let start = 0, was = current.length, now = next.length
  for (;;) {
    while (start < was && start < now && next[start] === current[start]) start++
    while (was > start && now > start && next[now - 1] === current[was - 1]) was--, now--
    const a = current[start], b = current[was - 1]
    if (was - start < 2 || was !== now || next[start] !== b || next[now - 1] !== a || a.parentNode !== parent || b.parentNode !== parent) break
    const after = b.nextSibling
    parent.insertBefore(b, a)
    parent.insertBefore(a, after)
    current[start] = b
    current[was - 1] = a
  }
  if (start === was && start === now) return current
  let stable: Set<Node> | undefined
  if (was > start) {
    const before = current.slice(start, was), after = next.slice(start, now)
    const keep = new Set(after)
    for (const n of before) if (!keep.has(n) && n.parentNode === parent) parent.removeChild(n)
    // Nodes on the longest run that is already in order stay put; every other node moves once.
    stable = inOrder(after, before)
  }
  let after = now < next.length ? next[now] : marker
  for (let i = now - 1; i >= start; i--) {
    const n = next[i]
    if (!stable?.has(n) || n.parentNode !== parent) parent.insertBefore(n, after)
    after = n
  }
  return next
}

/** The longest subsequence of `next` that keeps its relative order from `current` (O(n log n)). */
function inOrder(next: Node[], current: Node[]): Set<Node> {
  const was = new Map<Node, number>()
  current.forEach((n, i) => was.set(n, i))
  const tails: number[] = [] // index into next of the smallest tail for each run length
  const prev: number[] = []
  for (let i = 0; i < next.length; i++) {
    const at = was.get(next[i])
    if (at === undefined) continue
    let lo = 0, hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (was.get(next[tails[mid]])! < at) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1
    tails[lo] = i
  }
  const out = new Set<Node>()
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.add(next[i])
  return out
}

/**
 * `marker` undefined: the value is the parent's only dynamic content, appended at the end.
 * `marker` null: append at the end after static children. A node: insert before it.
 */
export function insert(parent: Mountable, value: any, marker?: Node | null) {
  let current = EMPTY
  const at = marker ?? null
  // Dev: hot-swappable components (weft/hmr) are accessors, so a static array of them (`<><A /><B /></>`) is live.
  if (DEV && Array.isArray(value) && value.some(v => typeof v === 'function')) {
    const list = value
    value = () => list
  }
  if (typeof value !== 'function') {
    place(parent, value, current, at)
    return
  }
  hole(value, v => { current = place(parent, v, current, at) })
}

// ---- attributes and properties ---------------------------------------------------------------------------------

/** Attributes whose states are the words `true`/`false`, so `false` can't mean a missing attribute. Prefixes keep it short. */
export const WORDS = /^(?:aria-|contented|draggab|focusab|spellch)/i

/** `null`/`false` remove the attribute and `true` writes it empty, except `WORDS`. */
export function setAttribute(node: Element, name: string, value: any) {
  if (typeof value === 'boolean' && WORDS.test(name)) value = String(value)
  if (value == null || value === false) node.removeAttribute(name)
  else node.setAttribute(name, value === true ? '' : value)
}

export function className(node: Element, value: any, prev?: any) {
  if (value == null || value === false) {
    if (prev != null) node.removeAttribute('class')
    return
  }
  if (typeof value !== 'object') {
    if (value !== prev) node.setAttribute('class', String(value))
    return
  }
  const p = prev && typeof prev === 'object' ? prev : {}
  for (const k in p) if (!value[k]) node.classList.remove(k)
  for (const k in value) if (value[k] && !p[k]) node.classList.add(k)
}

// The compiler resolves names it can see (crates/weft-compiler/src/react.rs); a spread's arrive here. DASHED leaves out
// SVG font attributes and other names no browser reads, so a spread keeps those as written.
const NAMES: Record<string, string> = { className: 'class', htmlFor: 'for', acceptCharset: 'accept-charset', httpEquiv: 'http-equiv', tabIndex: 'tabindex', crossOrigin: 'crossorigin', hrefLang: 'hreflang', referrerPolicy: 'referrerpolicy' }
const DASHED = /^(?:alignmentB|baselineS|clip(?:Path$|R)|color[IR]|dominantB|fill[OR]|flood[CO]|font[FSVW]|imageR|letterS|lightingC|marker[EMS]|paintO|pointerE|shapeR|stop[CO]|stroke[DLMOW]|text(?:An|D|R)|transformO|unicodeB|vectorE|wordS|writingM)/

/** The attribute a prop in a spread writes. HTML lowercases the rest itself. */
export const attrName = (k: string) =>
  NAMES[k] ?? (DASHED.test(k) ? k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) : /^(?:xlink|xmlns|xml)[A-Z]/.test(k) ? k.replace(/[A-Z]/, c => ':' + c.toLowerCase()) : k)

const UNITLESS = /^(?:--.*|(?:-\w+-)?(?:animation-iteration-count|aspect-ratio|border-image-(?:outset|slice|width)|box-(?:flex|flex-group|ordinal-group)|column-count|columns|flex(?:-grow|-shrink|-order|-positive|-negative)?|(?:fill|flood|stop|stroke)-opacity|font-weight|grid-(?:area|row|column)(?:-end|-span|-start)?|line-clamp|line-height|opacity|order|orphans|scale|stroke-(?:dasharray|dashoffset|miterlimit|width)|tab-size|widows|z-index|zoom))$/

/** `fontSize` → `font-size`, `WebkitBoxShadow` → `-webkit-box-shadow`, `msTransform` → `-ms-transform`. */
export const cssName = (k: string) => k === 'cssFloat' ? 'float' : k[1] === '-' ? k : k.replace(/^ms(?=[A-Z])/, '-ms').replace(/[A-Z]/g, c => '-' + c.toLowerCase())

/** React's values: numbers are pixels unless the property is unitless; `null` and booleans mean no declaration. */
export const cssValue = (name: string, v: any) =>
  v == null || typeof v === 'boolean' ? null : typeof v === 'number' && v && !UNITLESS.test(name) ? `${v}px` : v

export function style(node: HTMLElement, value: any, prev?: any) {
  if (typeof value === 'string' || value == null) {
    node.style.cssText = value ?? ''
    return
  }
  const p = prev && typeof prev === 'object' ? prev : {}
  for (const k in p) if (value[k] == null) node.style.removeProperty(cssName(k))
  for (const k in value) {
    if (value[k] === p[k]) continue
    const name = cssName(k)
    const v = cssValue(name, value[k])
    if (v == null) node.style.removeProperty(name)
    else node.style.setProperty(name, v)
  }
}

/** `ref={fn}` or `ref={[fn, …]}` (nested arrays flatten): each is called with the element, untracked. */
export function ref(get: () => any, el: Element) {
  const r = untrack(get)
  if (typeof r === 'function') r(el)
  else if (Array.isArray(r)) for (const f of r.flat(Infinity)) f && f(el)
}

/** `<Comp {...a} b={x}>`: a live view of the sources (later wins). A source is an object or a getter for one. */
export const mergeProps = (...sources: any[]) => view(sources)

// ---- events ---------------------------------------------------------------------------------------------------

const delegated = new Set<string>()

function dispatch(e: Event) {
  const key = `_$$${e.type}`
  let node = e.target as any
  Object.defineProperty(e, 'currentTarget', { configurable: true, get: () => node || document })
  while (node) {
    const handler = node[key]
    if (handler && !node.disabled) {
      const data = node[`${key}Data`]
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e)
      if (e.cancelBubble) return
    }
    node = node.parentNode
  }
}

export function delegateEvents(names: string[]) {
  for (const name of names) {
    if (delegated.has(name)) continue
    delegated.add(name)
    document.addEventListener(name, dispatch)
  }
}

/** `onX={handler}`, read once: delegated when the event is. `[fn, data]` calls `fn(data, event)`. */
export function addEvent(node: any, name: string, handler: any, delegate?: boolean) {
  if (!delegate) return node.addEventListener(name, Array.isArray(handler) ? (e: Event) => handler[0](handler[1], e) : handler)
  const key = `_$$${name}`
  if (Array.isArray(handler)) {
    node[key] = handler[0]
    node[`${key}Data`] = handler[1]
  } else node[key] = handler
}

// ---- keyed list (§3.4) ----------------------------------------------------------------------------------------

/** A row is its own root (no closure to dispose it) and the box of its item. `index` exists only when `children` takes one. */
class Row extends Box<any> implements Owner {
  owned: Owner['owned'] = null
  cleanups: Owner['cleanups'] = null
  nodes: any = undefined
  constructor(item: unknown, public key: unknown, public owner: Owner | null, public index: Box<number> | undefined) {
    super(item)
  }
}

const reader = (box: Box<any>) => () => box.value
const zero = () => 0

/**
 * Compiled from `xs.map(x => <Row key={x.id} … />)`. Rows are keyed by `by(item, index)` (or the item itself): a new
 * object under the same key updates the row in place through its live `item` accessor; it never rebuilds it.
 */
export function For<T>(props: { each: readonly T[] | null | undefined; by?: (item: T, index: number) => unknown; children: (item: () => T, index: () => number) => any }) {
  const base = keys.p // rows created while keys are on are scoped `<hole scope><row key>/`
  let order: Row[] = []
  let out: any[] = []
  onCleanup(() => {
    for (const r of order) clean(r)
    order = []
  })
  return memo(() => {
    const list = props.each || []
    const parent = getOwner()
    // A callback that takes an index (or might: `(...args)`) gets an index box; `(row) =>` doesn't.
    const indexed = props.children.length !== 1
    return untrack(() => {
      const next = new Array<Row>(list.length)
      const paths = keys.on ? new Set<unknown>() : undefined // two rows with one key can't share a hydration scope
      // Rows that stayed are found by position. From the first that didn't, the ones left are found by key.
      let left: Map<unknown, Row> | undefined
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        let key = props.by ? props.by(item, i) : item
        if (paths) {
          if (paths.has(key)) key = { duplicate: key }
          paths.add(key)
        }
        let row = left ? undefined : order[i]
        if (row && row.key !== key) {
          left = new Map()
          for (let j = order.length - 1; j >= i; j--) {
            const twin = left.get(order[j].key)
            if (twin) clean(twin)
            left.set(order[j].key, order[j])
          }
          row = undefined
        }
        if (left && (row = left.get(key))) left.delete(key)
        if (row) {
          row.value = item
          if (row.index) row.index.value = i
        } else {
          const r = (row = new Row(item, key, parent, indexed ? new Box(i) : undefined))
          const make = () => props.children(reader(r), r.index ? reader(r.index) : zero)
          r.nodes = within(r, keys.on ? () => under(base + step(key) + '/', make) : make)
        }
        next[i] = row
      }
      if (left) for (const r of left.values()) clean(r)
      else for (let i = list.length; i < order.length; i++) clean(order[i])
      if (left || next.length !== order.length) out = next.map(r => r.nodes)
      order = next
      return out
    })
  })
}
