// @weft-js/core/dom: `render`, `hydrate`, the keyed list, and the helpers weft's back end emits (most live in dom-next.ts;
// these are the shared pieces: placing child nodes, attributes, classes, styles, events). Compiled code only; app
// code imports `render` (or `hydrate`) and nothing else from here.

import { Box, DEV, clean, createRoot, devComponent, getOwner, flat, hole, memo, NONE, onCleanup, rt, runMounts, setFlat, untrack, view, within, type Computation, type Owner } from './index'
import { DEFER, ENDS, FLAT, LINEAR, RECORD, ROWBOX, SCAN, STEADY, SWAP, TEXT, WIPE } from './flags'
import { keys, step, under } from './keys'

export { memo }
export { attr, bind, change, child, cls, component, css, delegate, focus, kids, on, spread, tpl } from './dom-next'
export { first, hchild, htpl, next } from './claim'
export { hydrate, hydration } from './hydrate'
export { drain, enter, level, wake } from './island'
export { egg } from './egg'

type Mountable = Element | DocumentFragment

let instances = 0

/** `name`/`loc` (dev builds): the component's name and `file:line`; bindings created inside carry them. */
export function createComponent<P>(Comp: (props: P) => unknown, props: P, name?: string, loc?: string) {
  if (!DEV || !name) return untrack(() => Comp(props))
  const prev = devComponent.label, prevId = devComponent.id
  devComponent.label = `<${name}> (${loc})`
  devComponent.id = ++instances // tells instances apart in the dev graph (@weft-js/core/devtools)
  try { return untrack(() => Comp(props)) } finally { devComponent.label = prev; devComponent.id = prevId }
}

/** Builds `code` into `container` and returns what takes it down again. */
export function render(code: () => unknown, container: Element): () => void {
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

type Bag = Record<string, unknown>

/** Every hole's first `current`. `place` only rearranges a list of two or more. */
const EMPTY: Node[] = []

function resolve(value: unknown, out: Node[], reuse?: { from: Node[]; texts?: Text[]; at: number }): Node[] {
  while (typeof value === 'function') value = value()
  if (value == null || value === true || value === false) return out
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) resolve(value[i], out, reuse)
  } else if (value instanceof Node) {
    if (value.nodeType === 11) out.push(...value.childNodes)
    else out.push(value)
  } else {
    // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
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

// Set by `For`, so an app without one doesn't ship them: only long lists have ends to trade or to empty at a stroke.
let trade: typeof swap | undefined
let wipe: typeof empty | undefined
let longest: typeof inOrder | undefined

/** Without `For`: the nodes already in order, first come. Only a list ever needs the longest run. */
function kept(next: Node[], current: Node[]) {
  const out = new Set<Node>()
  let at = -1
  for (const n of next) {
    const i = current.indexOf(n)
    if (i > at) {
      at = i
      out.add(n)
    }
  }
  return out
}

/** The two ends of what's left traded places: moves them, and says so. */
function swap(parent: Node, current: Node[], next: Node[], start: number, was: number, now: number) {
  const a = current[start]!, b = current[was - 1]!
  if (was - start < 2 || was !== now || next[start] !== b || next[now - 1] !== a || a.parentNode !== parent || b.parentNode !== parent) return false
  const after = b.nextSibling
  parent.insertBefore(b, a)
  parent.insertBefore(a, after)
  current[start] = b
  current[was - 1] = a
  return true
}

/** None stay, and this hole is all that's in there. */
function empty(parent: Node, current: Node[], before: Node[], marker: Node | null) {
  if (marker || before.length !== current.length || parent.firstChild !== current[0] || parent.lastChild !== current[current.length - 1]) return false
  parent.textContent = ''
  return true
}

/** Makes `value` the nodes between `current` and `marker` with as few DOM writes as it can; returns the new nodes. */
export function place(parent: Node, value: unknown, current: Node[], marker: Node | null): Node[] {
  if (typeof value === 'string' || typeof value === 'number') {
    // Fast paths: one text node in, one primitive out → update in place (one characterData write at most); none in
    // → one new text node, in an exact-size list.
    if (current.length === 1 && current[0]!.nodeType === 3) {
      const text = String(value)
      if ((current[0] as Text).data !== text) (current[0] as Text).data = text
      return current
    }
    if (!current.length) {
      if (TEXT && value !== '' && !parent.firstChild) {
        parent.textContent = value as string
        return [parent.firstChild!]
      }
      return [parent.insertBefore(document.createTextNode(value as string), marker)] // the DOM converts a number
    }
  }
  const next: Node[] = FLAT && value === flat ? value as Node[] : resolve(value, [], { from: current, at: 0 })
  // Nodes that stayed at either end, and ends that traded places, cost no lookups. The middle is what's left.
  let start = 0, was = current.length, now = next.length
  for (;;) {
    while (start < was && start < now && next[start] === current[start]) start++
    while (was > start && now > start && next[now - 1] === current[was - 1]) {
      was--
      now--
    }
    if (!SWAP || !trade?.(parent, current, next, start, was, now)) break
  }
  if (start === was && start === now) return current
  const before = current.slice(start, was), after = next.slice(start, now)
  let stable: Set<Node> | undefined
  if ((!SCAN || before.length) && after.some(n => n.parentNode === parent)) {
    const keep = new Set(after)
    for (const n of before) if (!keep.has(n) && n.parentNode === parent) parent.removeChild(n)
    // Nodes on the longest run that is already in order stay put; every other node moves once.
    stable = (longest ?? kept)(after, before)
  } else if (!WIPE || !wipe?.(parent, current, before, marker)) {
    for (const n of before) if (n.parentNode === parent) parent.removeChild(n)
  }
  let last = next[now] ?? marker
  for (let i = after.length - 1; i >= 0; i--) {
    const n = after[i]!
    if (!stable?.has(n) || n.parentNode !== parent) parent.insertBefore(n, last)
    last = n
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
    const at = was.get(next[i]!)
    if (at === undefined) continue
    let lo = 0, hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (was.get(next[tails[mid]!]!)! < at) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1
    tails[lo] = i
  }
  const out = new Set<Node>()
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = prev[i]!) out.add(next[i]!)
  return out
}

/**
 * `marker` undefined: the value is the parent's only dynamic content, appended at the end.
 * `marker` null: append at the end after static children. A node: insert before it.
 */
export function insert(parent: Mountable, value: unknown, marker?: Node | null) {
  const current = EMPTY
  const at = marker ?? null
  // Dev: hot-swappable components (@weft-js/core/hmr) are accessors, so a static array of them (`<><A /><B /></>`) is live.
  if (DEV && Array.isArray(value) && value.some(v => typeof v === 'function')) {
    const list = value
    value = () => list
  }
  if (typeof value !== 'function') {
    place(parent, value, current, at)
    return
  }
  const h: Hold = { p: parent, m: at, c: current, t: undefined }
  if (RECORD) hole(value as () => unknown, write, h)
  else hole(value as () => unknown, (v, was) => write(v, was, h))
}

/** A hole: its parent, its marker, its nodes, and its one text node when that's all it holds (then `c` may lag). */
export interface Hold { p: Mountable; m: Node | null; c: Node[]; t: Text | undefined }

/** A hole's apply: writes `v` over what's there, with one text node's cheap path when that's all it holds. */
export function write(v: unknown, was: unknown, h: Hold) {
  const primitive = typeof v === 'string' || typeof v === 'number'
  if (STEADY && h.t && primitive) {
    if (v !== was) h.t.data = v as string // the DOM converts a number
    return
  }
  if (STEADY) {
    if (primitive && h.c === EMPTY) {
      // No list for one text node: `h.c` stays empty until the hole holds something else.
      if (TEXT && v !== '' && !h.m && !h.p.firstChild) {
        h.p.textContent = v as string
        h.t = h.p.firstChild as unknown as Text
      } else h.t = h.p.insertBefore(document.createTextNode(v as string), h.m)
      return
    }
    if (h.t) h.c = [h.t]
  }
  const c = h.c = place(h.p, v, h.c, h.m)
  if (STEADY) h.t = primitive && c.length === 1 && c[0]!.nodeType === 3 ? c[0] as Text : undefined
}

// ---- attributes and properties ---------------------------------------------------------------------------------

/** Attributes whose states are the words `true`/`false`, so `false` can't mean a missing attribute. Prefixes keep it short. */
export const WORDS = /^(?:aria-|contented|draggab|focusab|spellch)/i

/** `null`/`false` remove the attribute and `true` writes it empty, except `WORDS`. */
export function setAttribute(node: Element, name: string, value: unknown) {
  if (typeof value === 'boolean' && WORDS.test(name)) value = String(value)
  if (value == null || value === false) node.removeAttribute(name)
  else node.setAttribute(name, (value === true ? '' : value) as string) // the DOM converts the rest
}

/** Writes a `class`: a string, or an object whose true keys are the classes. */
export function className(node: Element, value: unknown, prev?: unknown) {
  if (value == null || value === false) {
    if (prev != null) node.removeAttribute('class')
    return
  }
  if (typeof value !== 'object') {
    // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
    if (value !== prev) node.setAttribute('class', String(value))
    return
  }
  const p = (prev && typeof prev === 'object' ? prev : {}) as Bag
  for (const k in p) if (!(value as Bag)[k]) node.classList.remove(k)
  for (const k in value) if ((value as Bag)[k] && !p[k]) node.classList.add(k)
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
export const cssValue = (name: string, v: unknown) =>
  v == null || typeof v === 'boolean' ? null : typeof v === 'number' && v && !UNITLESS.test(name) ? `${v}px` : v

/** Writes a `style`: a string, or an object in React's shape. */
export function style(node: HTMLElement, value: unknown, prev?: unknown) {
  if (typeof value === 'string' || value == null) {
    node.style.cssText = value ?? ''
    return
  }
  const p = (prev && typeof prev === 'object' ? prev : {}) as Bag
  for (const k in p) if ((value as Bag)[k] == null) node.style.removeProperty(cssName(k))
  for (const k in value) {
    if ((value as Bag)[k] === p[k]) continue
    const name = cssName(k)
    const v = cssValue(name, (value as Bag)[k])
    if (v == null) node.style.removeProperty(name)
    else node.style.setProperty(name, v as string) // the DOM converts a number
  }
}

/** `ref={fn}` or `ref={[fn, …]}` (nested arrays flatten): each is called with the element, untracked. */
export function ref(get: () => unknown, el: Element) {
  const r = untrack(get)
  if (typeof r === 'function') r(el)
  else if (Array.isArray(r)) for (const f of r.flat(Infinity)) f && f(el)
}

/** `<Comp {...a} b={x}>`: a live view of the sources (later wins). A source is an object or a getter for one. */
export const mergeProps = (...sources: unknown[]) => view(sources)

// ---- events ---------------------------------------------------------------------------------------------------

/** A node as delegation reads it: its handlers sit on it under `_$$<event>`. */
type Listening = Node & { disabled?: boolean } & Record<string, unknown>

const delegated = new Set<string>()

function dispatch(e: Event) {
  const key = `_$$${e.type}`
  let node = e.target as Listening | null
  Object.defineProperty(e, 'currentTarget', { configurable: true, get: () => node || document })
  while (node) {
    const handler = node[key] as ((...args: unknown[]) => void) | undefined
    if (handler && !node.disabled) {
      const data = node[`${key}Data`]
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e)
      if (e.cancelBubble) return
    }
    node = node.parentNode as Listening | null
  }
}

/** Puts one document listener behind each of `names`; handlers then sit on their nodes. */
export function delegateEvents(names: string[]) {
  for (const name of names) {
    if (delegated.has(name)) continue
    delegated.add(name)
    document.addEventListener(name, dispatch)
  }
}

/** `onX={handler}`, read once: delegated when the event is. `[fn, data]` calls `fn(data, event)`. */
export function addEvent(node: Element, name: string, handler: unknown, delegate?: boolean) {
  if (!delegate) return node.addEventListener(name, Array.isArray(handler) ? (e: Event) => handler[0](handler[1], e) : handler as EventListener)
  const key = `_$$${name}`
  if (Array.isArray(handler)) {
    (node as unknown as Listening)[key] = handler[0]
    ;(node as unknown as Listening)[`${key}Data`] = handler[1]
  } else (node as unknown as Listening)[key] = handler
}

// ---- keyed list (§3.4) ----------------------------------------------------------------------------------------

/**
 * A row is its own root (no closure to dispose it) and the box of its item. `index` exists only when `children` takes
 * one. It sets a box's fields itself: built through `extends Box`, every row costs a derived constructor.
 */
class Row {
  v: unknown
  f: Computation | undefined = undefined
  o: Computation[] = NONE
  owned: Owner['owned'] = null
  tail: Owner['tail'] = null
  cleanups: Owner['cleanups'] = null
  nodes: unknown = undefined
  constructor(item: unknown, public key: unknown, public owner: Owner | null, public index: Box<number> | undefined) {
    this.v = item
  }
}
/** A row as `For` sees it, with the prototype it gets there. `box` holds the item when rows aren't boxes themselves. */
type Item = Row & Box<unknown> & { box: Box<unknown> }

/** The row under `k` between `from` and `end`, taken out. */
function find(order: Item[], from: number, end: number, k: unknown): Item | undefined {
  for (let i = from; i < end; i++) {
    const r = order[i]
    // oxlint-disable-next-line no-self-compare -- `k !== k` is the NaN check for a key: this loop is the list's hot path, and Number.isNaN costs bytes and a call
    if (r && (r.key === k || (k !== k && r.key !== r.key))) return (order[i] = undefined!), r
  }
  return undefined
}

const reader = <V>(box: Box<V>) => () => box.value
const zero = () => 0

/**
 * Compiled from `xs.map(x => <Row key={x.id} … />)`. Rows are keyed by `by(item, index)` (or the item itself): a new
 * object under the same key updates the row in place through its live `item` accessor; it never rebuilds it.
 */
export function For<T>(props: { each: readonly T[] | null | undefined; by?: ((item: T, index: number) => unknown) | undefined; children: (item: () => T, index: () => number) => unknown }) {
  const base = keys.p // rows created while keys are on are scoped `<hole scope><row key>/`
  let order: Item[] = []
  let out: unknown[] = []
  let fresh = false // rows were made since the last pass
  let single = true // every row is one element
  let r: Item // the row being made
  const make = () => props.children(reader((ROWBOX ? r : r.box) as Box<T>), r.index ? reader(r.index) : zero)
  Object.setPrototypeOf(Row.prototype, Box.prototype) // here, so an app without a list keeps no Row
  if (SWAP) trade = swap
  if (WIPE) wipe = empty
  longest = inOrder
  // Only the first row of a key is kept: a repeat is built anew each pass.
  const repeats = () => {
    fresh = false
    const seen = new Set<unknown>()
    for (const row of order) {
      if (seen.has(row.key)) row.key = { duplicate: row.key }
      seen.add(row.key)
    }
  }
  onCleanup(() => {
    for (const row of order) clean(row)
    order = []
  })
  return memo(() => {
    const list = props.each || []
    const parent = getOwner()
    // A callback that takes an index (or might: `(...args)`) gets an index box; `(row) =>` doesn't.
    const indexed = props.children.length !== 1
    return untrack(() => {
      const by = props.by
      const key = (i: number) => (by ? by(list[i]!, i) : list[i])
      const paths = keys.on ? new Set<unknown>() : undefined // two rows with one key can't share a hydration scope
      if (DEFER && fresh && list.length) repeats() // not as they're made: making a row costs no lookup that way
      fresh = false
      // Rows that stayed at either end are found by position, ends that traded places by each other, the rest by key.
      let from = 0, end = order.length, stop = list.length, traded = false
      if (ENDS) for (;;) {
        while (from < end && from < stop && order[from]!.key === key(from)) from++
        while (from < end && from < stop && order[end - 1]!.key === key(stop - 1)) {
          end--
          stop--
        }
        const a = order[from]!, b = order[end - 1]!
        if (!SWAP || end - from < 2 || end !== stop || a.key !== key(stop - 1) || b.key !== key(from)) break
        order[from] = b
        order[end - 1] = a
        traded = true
      }
      let left: Map<unknown, Item> | undefined
      if (from < stop) {
        if (from < end && (!LINEAR || end - from > 8)) left = new Map()
        if (left) for (let i = from; i < end; i++) left.set(order[i]!.key, order[i]!)
      } else for (let i = from; i < end; i++) clean(order[i]!)
      // oxlint-disable-next-line unicorn/no-new-array -- sized up front: filling a list of known length is the keyed list's hot path
      const next = new Array<Item>(list.length), nodes = new Array<unknown>(list.length)
      for (let i = 0; i < list.length; i++) {
        const item = list[i]!
        let row = i < from ? order[i] : i >= stop ? order[i + end - stop] : undefined
        if (!row) {
          let k: unknown = key(i)
          if ((row = left?.get(k))) left!.delete(k)
          else if (LINEAR && !left && from < end && (row = find(order, from, end, k))) {} // taken out of `order`
          else {
            if (paths) {
              if (paths.has(k)) k = { duplicate: k }
              paths.add(k)
            }
            r = row = new Row(item, k, parent, indexed ? new Box(i) : undefined) as Item
            if (!ROWBOX) r.box = new Box<unknown>(item)
            r.nodes = within(r, keys.on ? () => under(base + step(k) + '/', make) : make)
            if (FLAT) single &&= !rt.server && r.nodes instanceof Node && r.nodes.nodeType !== 11
            fresh = true
            next[i] = row
            nodes[i] = r.nodes
            continue
          }
        }
        if (!ROWBOX) row.box.value = item
        else if (row.v !== item) row.value = item
        if (row.index) row.index.value = i
        next[i] = row
        nodes[i] = row.nodes
      }
      if (left) for (const row of left.values()) clean(row)
      else if (LINEAR && from < stop) for (let i = from; i < end; i++) if (order[i]) clean(order[i]!)
      order = next
      if (!DEFER && fresh) repeats()
      if (!ENDS || traded || from < end || from < stop) {
        out = nodes
        if (FLAT) {
          if (!out.length) single = true
          else if (single) setFlat(out)
        }
      }
      return out
    })
  })
}
