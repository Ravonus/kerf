// weft/dom: `render`, `hydrate`, the keyed list, and the helpers weft's back end emits (most live in dom-next.ts;
// these are the shared pieces: placing child nodes, attributes, classes, styles, events). Compiled code only; app
// code imports `render` (or `hydrate`) and nothing else from here.

import { Box, DEV, clean, createRoot, devComponent, getOwner, hole, memo, onCleanup, untrack, within, type Owner } from './index'
import { keys, step, under } from './keys'

export { memo }
export { attr, bind, child, cls, component, css, delegate, on, spread, tpl } from './dom-next'
export { first, hchild, htpl, next } from './claim'
export { hydrate } from './hydrate'

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
  return () => {
    dispose()
    container.textContent = ''
  }
}

// ---- inserting dynamic children -------------------------------------------------------------------------------

function resolve(value: any, out: Node[]): Node[] {
  while (typeof value === 'function') value = value()
  if (value == null || value === true || value === false) return out
  if (Array.isArray(value)) {
    for (const v of value) resolve(v, out)
  } else if (value instanceof Node) {
    if (value.nodeType === 11) out.push(...(value.childNodes as any))
    else out.push(value)
  } else {
    out.push(document.createTextNode(String(value)))
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
  const next = resolve(value, [])
  if (next.length === current.length && next.every((n, i) => n === current[i])) return current
  const keep = new Set(next)
  for (const n of current) if (!keep.has(n) && n.parentNode === parent) parent.removeChild(n)
  // Nodes on the longest run that is already in order stay put; every other node moves once.
  const stable = inOrder(next, current)
  let after = marker
  for (let i = next.length - 1; i >= 0; i--) {
    const n = next[i]
    if (!stable.has(n) || n.parentNode !== parent) parent.insertBefore(n, after)
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
  let current: Node[] = []
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

export function setAttribute(node: Element, name: string, value: any) {
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

export function style(node: HTMLElement, value: any, prev?: any) {
  if (typeof value === 'string' || value == null) {
    node.style.cssText = value ?? ''
    return
  }
  const p = prev && typeof prev === 'object' ? prev : {}
  for (const k in p) if (value[k] == null) node.style.removeProperty(k)
  for (const k in value) if (value[k] !== p[k]) node.style.setProperty(k, value[k])
}

/** `ref={fn}` or `ref={[fn, …]}` (nested arrays flatten): each is called with the element, untracked. */
export function ref(get: () => any, el: Element) {
  const r = untrack(get)
  if (typeof r === 'function') r(el)
  else if (Array.isArray(r)) for (const f of r.flat(Infinity)) f && f(el)
}

export function mergeProps(...sources: any[]) {
  return new Proxy({} as any, {
    get(_, k) {
      for (let i = sources.length - 1; i >= 0; i--) {
        const s = typeof sources[i] === 'function' ? sources[i]() : sources[i]
        if (s && k in s) return s[k]
      }
    },
    has: (_, k) => sources.some(s => s && k in (typeof s === 'function' ? s() : s)),
    ownKeys: () => [...new Set(sources.flatMap(s => (s ? Reflect.ownKeys(typeof s === 'function' ? s() : s) : [])))],
    getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
  })
}

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

/** A row is its own root (no closure to dispose it). `index` exists only when `children` takes one. */
interface Row extends Owner { item: Box<any>; index: Box<number> | undefined; nodes: any }

const reader = (box: Box<any>) => () => box.value

/**
 * Compiled from `xs.map(x => <Row key={x.id} … />)`. Rows are keyed by `by(item)` (or the item itself): a new
 * object under the same key updates the row in place through its live `item` accessor; it never rebuilds it.
 */
export function For<T>(props: { each: readonly T[] | null | undefined; by?: (item: T) => unknown; children: (item: () => T, index: () => number) => any }) {
  const base = keys.p // rows created while keys are on are scoped `<hole scope><row key>/`
  let rows = new Map<unknown, Row>()
  let order: Row[] = []
  let out: any[] = []
  onCleanup(() => {
    for (const r of rows.values()) clean(r)
    rows.clear()
  })
  return memo(() => {
    const list = props.each || []
    const parent = getOwner()
    // A callback that takes an index (or might: `(...args)`) gets an index box; `(row) =>` doesn't.
    const indexed = props.children.length !== 1
    return untrack(() => {
      const next = new Map<unknown, Row>()
      const nextOrder: Row[] = []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        let key = props.by ? props.by(item) : item
        if (next.has(key)) key = { duplicate: key }
        let row = rows.get(key)
        if (row) {
          rows.delete(key)
          row.item.value = item
          if (row.index) row.index.value = i
        } else {
          const r: Row = (row = {
            owned: null, cleanups: null, owner: parent, context: parent?.context,
            item: new Box(item), index: indexed ? new Box(i) : undefined, nodes: undefined,
          })
          const make = () => props.children(reader(r.item), r.index ? reader(r.index) : () => 0)
          r.nodes = within(r, keys.on ? () => under(base + step(key) + '/', make) : make)
        }
        next.set(key, row)
        nextOrder.push(row)
      }
      for (const r of rows.values()) clean(r)
      rows = next
      if (nextOrder.length !== order.length || nextOrder.some((r, i) => r !== order[i])) {
        order = nextOrder
        out = nextOrder.map(r => r.nodes)
      }
      return out
    })
  })
}
