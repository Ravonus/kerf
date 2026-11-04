// @weft-js/core/devtools: the live reactive graph in dev builds, for agents (`weft browser snapshot`/`set`) and people (the
// overlay, Alt+Shift+G). The weft() Vite plugin loads it when serving; production builds never do.
//
//   Cart.total = 42.5 ← Cart.subtotal, Cart.coupon → 1 binding in <Cart>
//
// Names come from the compiler's dev pass (`name(state(0), "Cart.count")`) and from `defineState` (`cart.items`).
// The page gets `window.__weft__ = { graph, set, flush, errors, overlay }`.

import { Box, DEV, Memo, flush, named, type Computation } from './index'

/** One named box or derived value in the graph: its value, what it reads and what it feeds. */
export interface GraphNode {
  /** `Cart.total`, or `Cart#2.total` when more than one instance of the component is alive. */
  name: string
  kind: 'state' | 'derived'
  /** A JSON-safe preview of the current value (long strings and big lists cut). */
  value: unknown
  /** Derived only: true when a source changed and nothing has read it since (the value shown is the last one). */
  stale?: boolean
  /** What it reads: other named nodes. */
  reads: string[]
  /** What reads it: named derived values, and bindings counted per component (`2 bindings in <Cart> (Cart.tsx:4)`). */
  feeds: string[]
  /** The component it was created in, with its source location. */
  in?: string
}

type Node = Box<unknown> | Computation
const ids = new WeakMap<Node, string>()

function label(nodes: Node[]) {
  // `Cart.total` twice → `Cart#1.total`, `Cart#2.total`, by the order the instances were created.
  const count = new Map<string, number>()
  for (const n of nodes) count.set(n.n!, (count.get(n.n!) ?? 0) + 1)
  const seen = new Map<string, Map<string, number>>()
  for (const n of nodes) {
    if (count.get(n.n!)! < 2) {
      ids.set(n, n.n!)
      continue
    }
    const byInst = seen.get(n.n!) ?? new Map<string, number>()
    seen.set(n.n!, byInst)
    // Instances are told apart by the component run that made them (dev `createComponent`), in creation order.
    const key = String((n as { i?: number }).i ?? objectId(n))
    if (!byInst.has(key)) byInst.set(key, byInst.size + 1)
    const [comp, ...rest] = n.n!.split('.')
    ids.set(n, `${comp}#${byInst.get(key)}.${rest.join('.')}`)
  }
}

const objectIds = new WeakMap<object, number>()
let nextObject = 0
const objectId = (o: object) => objectIds.get(o) ?? (objectIds.set(o, ++nextObject), nextObject)

/** A JSON-safe, bounded copy of a value. */
export function preview(v: unknown, depth = 0, seen = new Set<unknown>()): unknown {
  if (v === undefined) return { $: 'undefined' }
  if (typeof v === 'function') return { $: 'function' }
  if (typeof v === 'bigint') return { $: 'bigint', v: String(v) }
  if (typeof v === 'number' && !Number.isFinite(v)) return { $: String(v) }
  if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 200)}…` : v
  if (!v || typeof v !== 'object') return v
  if (seen.has(v)) return { $: 'cycle' }
  if (typeof Node !== 'undefined' && v instanceof globalThis.Node)
    return { $: 'node', v: v.nodeName }
  if (depth > 3) return { $: Array.isArray(v) ? `array(${v.length})` : 'object' }
  seen.add(v)
  if (Array.isArray(v)) {
    const out: unknown[] = v.slice(0, 20).map((x) => preview(x, depth + 1, seen))
    if (v.length > 20) out.push({ $: `…${v.length - 20} more` })
    return out
  }
  if (v instanceof Map) return { $: 'Map', v: preview([...v.entries()], depth, seen) }
  if (v instanceof Set) return { $: 'Set', v: preview([...v], depth, seen) }
  if (v instanceof Date) return { $: 'Date', v: v.toISOString() }
  const out: Record<string, unknown> = {}
  const keys = Object.keys(v)
  for (const k of keys.slice(0, 30))
    out[k] = preview((v as Record<string, unknown>)[k], depth + 1, seen)
  if (keys.length > 30) out.$more = keys.length - 30
  return out
}

const isBox = (n: Node): n is Box<unknown> => n instanceof Box

/** Every named node alive now. `filter` keeps names starting with it (`Cart`, `Cart.total`, `cart.`). */
export function graph(filter?: string): GraphNode[] {
  const nodes = [...named].filter((n) => (n as Computation).effect !== 3)
  label(nodes)
  const out: GraphNode[] = []
  for (const n of nodes) {
    const id = ids.get(n)!
    if (filter && !id.startsWith(filter) && !n.n!.startsWith(filter)) continue
    const readers = new Set<Computation>(n.f ? [n.f, ...n.o] : n.o)
    if (isBox(n) && n.k)
      for (const s of n.k.values()) for (const o of s.f ? [s.f, ...s.o] : s.o) readers.add(o)
    const feeds: string[] = []
    const bindings = new Map<string, number>()
    const derivs = new Map<string, number>()
    for (const r of readers) {
      if (named.has(r)) feeds.push(ids.get(r) ?? r.n!)
      else if (r.effect)
        bindings.set(r.n ?? 'an effect', (bindings.get(r.n ?? 'an effect') ?? 0) + 1)
      else derivs.set(r.n ?? '', (derivs.get(r.n ?? '') ?? 0) + 1)
    }
    for (const [where, count] of derivs)
      feeds.push(`${count} derived${where ? ` in ${where}` : ' (unnamed)'}`)
    for (const [where, count] of bindings)
      feeds.push(`${count} binding${count > 1 ? 's' : ''} in ${where}`)
    const reads: string[] = []
    if (!isBox(n))
      for (const s of n.p ? [n.p, ...n.s] : n.s) {
        const src = (s.b ?? s) as Node // a `get(key)` source stands for its box
        const name = named.has(src) ? ids.get(src) : src.n
        const key = s.b ? `.get(${JSON.stringify(s.key)})` : ''
        reads.push(name ? `${name}${key}` : 'an unnamed value')
      }
    out.push({
      name: id,
      kind: isBox(n) ? 'state' : 'derived',
      value: preview(n.v),
      ...(!isBox(n) && n.state !== 0 ? { stale: true } : {}),
      reads: [...new Set(reads)],
      feeds,
      ...((n as { c?: unknown }).c ? { in: (n as { c?: unknown }).c as string } : {}),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** One line per node: `Cart.total = 42.5 ← Cart.subtotal → 1 binding in <Cart> (Cart.tsx:4)`. */
export function format(nodes: GraphNode[]) {
  return nodes
    .map(
      (n) =>
        `${n.name} = ${JSON.stringify(n.value)}${n.stale ? ' (stale)' : ''}${n.reads.length ? ` ← ${n.reads.join(', ')}` : ''}${n.feeds.length ? ` → ${n.feeds.join(', ')}` : ''}`,
    )
    .join('\n')
}

/** Write a box by its graph name (dev only): reach a state fast. Derived values can't be set. Flushes. */
export function set(target: string, value: unknown) {
  const nodes = [...named]
  label(nodes)
  const hit = nodes.filter((n) => ids.get(n) === target || n.n === target)
  if (!hit.length)
    throw new Error(
      `no state named ${target}; names: ${nodes
        .map((n) => ids.get(n))
        .slice(0, 20)
        .join(', ')}`,
    )
  if (hit.length > 1)
    throw new Error(`${target} is ambiguous: ${hit.map((n) => ids.get(n)).join(', ')}`)
  const [n] = hit as [Node]
  if (!isBox(n))
    throw new Error(
      `${target} is derived; set what it reads instead (${graph(target)[0]?.reads.join(', ') || 'nothing named'})`,
    )
  n.w(value)
  flush()
  return graph(ids.get(n))[0]
}

/** Uncaught errors since the last call, with the binding or component they came from (`@weft-js/core` on the error). */
const caught: { message: string; at?: string; stack?: string }[] = []
/** The errors the page has thrown since it loaded, newest last. */
export function errors() {
  return caught.splice(0)
}

// ---- the overlay ------------------------------------------------------------------------------------------------

let panel: HTMLElement | null = null
let timer: ReturnType<typeof setInterval> | undefined

function paint(filter: string) {
  if (!panel) return
  const body = panel.querySelector('pre')!
  body.textContent = format(graph(filter || undefined)) || '(no named state yet)'
}

/** Show or hide the graph panel; `true`/`false` forces it. */
export function overlay(show?: boolean) {
  if (typeof document === 'undefined') return false
  const on = show ?? !panel
  if (!on) {
    panel?.remove()
    panel = null
    clearInterval(timer)
    return false
  }
  if (panel) return true
  panel = document.createElement('aside')
  panel.setAttribute('aria-label', 'weft graph')
  panel.setAttribute('data-weft-devtools', '')
  panel.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:2147483647;max-width:min(560px,90vw);max-height:45vh;overflow:auto;' +
    'background:#111c;color:#eee;font:12px/1.4 ui-monospace,monospace;padding:8px 10px;border-radius:6px;backdrop-filter:blur(4px)'
  const input = document.createElement('input')
  input.placeholder = 'filter (Cart, cart.)'
  input.setAttribute('aria-label', 'Filter the weft graph')
  input.style.cssText =
    'width:100%;margin-bottom:6px;background:#0008;color:inherit;border:1px solid #fff3;font:inherit;padding:2px 4px'
  input.oninput = () => paint(input.value)
  panel.append(input, document.createElement('pre'))
  panel.querySelector('pre')!.style.margin = '0'
  document.body.append(panel)
  paint('')
  timer = setInterval(() => paint(input.value), 250)
  return true
}

if (DEV && typeof window !== 'undefined') {
  ;(window as Window & { __weft__?: object }).__weft__ = {
    graph,
    format,
    set,
    flush,
    errors,
    overlay,
    version: 1,
  }
  addEventListener('error', (e) =>
    caught.push({
      message: e.message,
      at: e.error?.weft,
      stack: e.error?.stack?.split('\n').slice(0, 4).join('\n'),
    }),
  )
  addEventListener('unhandledrejection', (e) =>
    caught.push({ message: String(e.reason?.message ?? e.reason), at: e.reason?.weft }),
  )
  addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyG') overlay()
  })
}

export { Memo }
