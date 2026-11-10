// @weft-js/core/dom: `render`, `hydrate`, the keyed list, and the helpers weft's back end emits (most live in dom-next.ts;
// these are the shared pieces: placing child nodes, attributes, classes, styles, events). Compiled code only; app
// code imports `render` (or `hydrate`) and nothing else from here.

import { Box } from './index/state'
import { DEV, createRoot, memo, onCleanup, untrack } from './index'
import { clean, devComponent, flat, runMounts } from './index/graph'
import { hole } from './index/lifecycle'
import { FLAT, RECORD, ROWBOX, SCAN, STEADY, SWAP, TEXT, WIPE } from './flags'
import { keys } from './keys'
import { swap, empty, inOrder } from './dom/optimizations'
import { Row, reader, zero } from './dom/rows'
import { listMemo, type ListState } from './dom/list'
import { delegateEvents, addEvent } from './dom/events'
import {
  WORDS,
  setAttribute,
  className,
  attrName,
  cssName,
  cssValue,
  style,
  ref,
  mergeProps,
} from './dom/attributes'

export { memo }
export {
  attr,
  bind,
  change,
  child,
  cls,
  component,
  css,
  delegate,
  focus,
  kids,
  on,
  spread,
  tpl,
} from './dom-next'
export { first, hchild, htpl, next } from './claim'
export { hydrate, hydration } from './hydrate'
export { drain, enter, level, settled, wake } from './island'
export { egg } from './egg'

type Mountable = Element | DocumentFragment

let instances = 0

/** `name`/`loc` (dev builds): the component's name and `file:line`; bindings created inside carry them. */
export function createComponent<P>(
  Comp: (props: P) => unknown,
  props: P,
  name?: string,
  loc?: string,
) {
  if (!DEV || !name) return untrack(() => Comp(props))
  const prev = devComponent.label,
    prevId = devComponent.id
  devComponent.label = `<${name}> (${loc})`
  devComponent.id = ++instances // tells instances apart in the dev graph (@weft-js/core/devtools)
  try {
    return untrack(() => Comp(props))
  } finally {
    devComponent.label = prev
    devComponent.id = prevId
  }
}

/** Builds `code` into `container` and returns what takes it down again. */
export function render(code: () => unknown, container: Element): () => void {
  let dispose!: () => void
  createRoot((d) => {
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

function resolve(
  value: unknown,
  out: Node[],
  reuse?: { from: Node[]; texts?: Text[]; at: number },
): Node[] {
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
    const t = reuse && (reuse.texts ??= reuse.from.filter((n) => made.has(n)) as Text[])[reuse.at++]
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
  const next: Node[] =
    FLAT && value === flat ? (value as Node[]) : resolve(value, [], { from: current, at: 0 })
  // Nodes that stayed at either end, and ends that traded places, cost no lookups. The middle is what's left.
  let start = 0,
    was = current.length,
    now = next.length
  for (;;) {
    while (start < was && start < now && next[start] === current[start]) start++
    while (was > start && now > start && next[now - 1] === current[was - 1]) {
      was--
      now--
    }
    if (!SWAP || was !== now || !trade?.(parent, current, next, start, was)) break
  }
  if (start === was && start === now) return current
  const before = current.slice(start, was),
    after = next.slice(start, now)
  let stable: Set<Node> | undefined
  if ((!SCAN || before.length) && after.some((n) => n.parentNode === parent)) {
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

/**
 * `marker` undefined: the value is the parent's only dynamic content, appended at the end.
 * `marker` null: append at the end after static children. A node: insert before it.
 */
export function insert(parent: Mountable, value: unknown, marker?: Node | null) {
  const current = EMPTY
  const at = marker ?? null
  // Dev: hot-swappable components (@weft-js/core/hmr) are accessors, so a static array of them (`<><A /><B /></>`) is live.
  if (DEV && Array.isArray(value) && value.some((v) => typeof v === 'function')) {
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
export interface Hold {
  p: Mountable
  m: Node | null
  c: Node[]
  t: Text | undefined
}

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
  const c = (h.c = place(h.p, v, h.c, h.m))
  if (STEADY) h.t = primitive && c.length === 1 && c[0]!.nodeType === 3 ? (c[0] as Text) : undefined
}

export { WORDS, setAttribute, className, attrName, cssName, cssValue, style, ref, mergeProps }

export { delegateEvents, addEvent }

// ---- keyed list (§3.4) ----------------------------------------------------------------------------------------

/**
 * Compiled from `xs.map(x => <Row key={x.id} … />)`. Rows are keyed by `by(item, index)` (or the item itself): a new
 * object under the same key updates the row in place through its live `item` accessor; it never rebuilds it.
 */
export function For<T>(props: {
  each: readonly T[] | null | undefined
  by?: ((item: T, index: number) => unknown) | undefined
  children: (item: () => T, index: () => number) => unknown
}) {
  const base = keys.p // rows created while keys are on are scoped `<hole scope><row key>/`
  const data: ListState = { order: [], out: [], fresh: false, single: true, r: undefined! }
  const make = () =>
    props.children(
      reader((ROWBOX ? data.r : data.r.box) as Box<T>),
      data.r.index ? reader(data.r.index) : zero,
    )
  const claim = () => {
    const { hydrating } = keys
    const nodes = make()
    keys.hydrating = hydrating
    return nodes
  }
  Object.setPrototypeOf(Row.prototype, Box.prototype) // here, so an app without a list keeps no Row
  if (SWAP) trade = swap
  if (WIPE) wipe = empty
  longest = inOrder
  // Only the first row of a key is kept: a repeat is built anew each pass.
  const repeats = () => {
    data.fresh = false
    const seen = new Set<unknown>()
    for (const row of data.order) {
      if (seen.has(row.key)) row.key = { duplicate: row.key }
      seen.add(row.key)
    }
  }
  onCleanup(() => {
    for (const row of data.order) clean(row)
    data.order = []
  })
  return listMemo({ props, base, data, make, claim, repeats })
}
