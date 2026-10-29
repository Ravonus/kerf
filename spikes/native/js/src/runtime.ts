// The spike's runtime: weft-shaped boxes on alien-signals, and a host renderer that turns reactive bindings into
// ops. What the compiler's `native` backend would emit for a TSX file is calls to `el`, `list` and `match`, with
// every live expression wrapped in a function. The app in app.ts is written in that lowered form by hand.
import { computed, effect, endBatch, setActiveSub, signal, startBatch } from 'alien-signals'
import { OpWriter } from './ops'
import type { EventName, NodeTypeName, PropName } from './protocol.gen'

// ---- boxes ----

export interface State<T> { value: T }
export interface Derived<T> { readonly value: T }

export function state<T>(init: T): State<T> {
  const s = signal(init)
  return { get value() { return s() }, set value(v: T) { s(v) } }
}

export function derived<T>(fn: () => T): Derived<T> {
  const c = computed(fn)
  return { get value() { return c() } }
}

const untracked = <T>(fn: () => T): T => {
  const prev = setActiveSub(undefined)
  try { return fn() } finally { setActiveSub(prev) }
}

// ---- ownership ----
// Effects are created detached from whatever is running and owned here instead, so a row created while a list
// effect runs lives until the list removes it, not until the list effect next re-runs.

class Owner {
  cleanups: (() => void)[] = []
  dispose() { for (const c of this.cleanups.splice(0).reverse()) c() }
}
let owner: Owner | null = null

function owned<T>(fn: () => T): { value: T; owner: Owner } {
  const o = new Owner(), prev = owner
  owner = o
  try { return { value: untracked(fn), owner: o } } finally { owner = prev }
}

function watch(fn: () => void) {
  const stop = untracked(() => effect(fn))
  owner?.cleanups.push(stop)
}

// ---- host ----

export interface Host { apply(bytes: Uint8Array, ops: number): void }

const out = new OpWriter()
let host: Host | null = null
let scheduled = false
const handlers = new Map<number, Partial<Record<EventName, (payload: string) => void>>>()
let nextId = 1

const defer: (fn: () => void) => void =
  typeof queueMicrotask === 'function' ? queueMicrotask : fn => { Promise.resolve().then(fn) }

function schedule() {
  if (scheduled || !host) return
  scheduled = true
  defer(flush)
}

/** Sends this tick's ops to the host now. The runtime also does this on a microtask after any change. */
export function flush() {
  scheduled = false
  if (host && out.pending) {
    const { bytes, ops } = out.take()
    host.apply(bytes, ops)
  }
}

/** Entry point for the host: one call per user event. */
export function dispatch(id: number, event: EventName, payload = '') {
  const fn = handlers.get(id)?.[event]
  if (!fn) return
  startBatch()
  try { fn(payload) } finally { endBatch() }
  schedule()
}

// ---- elements ----

type Val<T> = T | (() => T)
export type Props = Partial<Record<PropName, Val<string | number | boolean>>> & {
  onTap?: () => void
  onInput?: (text: string) => void
  onSelect?: (index: string) => void
}
export type Child = number | Region | null | false

function setProp(id: number, prop: PropName, v: string | number | boolean) {
  if (typeof v === 'string') out.setStr(id, prop, v)
  else if (typeof v === 'number') out.setNum(id, prop, v)
  else out.setBool(id, prop, v)
  schedule()
}

export function el(type: NodeTypeName, props: Props = {}, ...children: Child[]): number {
  const id = nextId++
  out.create(id, type)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'onTap' || k === 'onInput' || k === 'onSelect') continue
    const prop = k as PropName
    if (typeof v === 'function') {
      let last: unknown = undefined
      watch(() => {
        const next = (v as () => string | number | boolean)()
        if (next !== last) { last = next; setProp(id, prop, next) } // unchanged values cost no op
      })
    } else if (v !== undefined) setProp(id, prop, v as string | number | boolean)
  }
  if (props.onTap || props.onInput || props.onSelect) {
    handlers.set(id, { tap: props.onTap, input: props.onInput, select: props.onSelect })
    if (props.onTap) out.listen(id, 'tap')
    if (props.onInput) out.listen(id, 'input')
    if (props.onSelect) out.listen(id, 'select')
  }
  owner?.cleanups.push(() => handlers.delete(id))
  for (const c of children) {
    if (typeof c === 'number') out.insert(id, c)
    else if (c) c.attach(id)
  }
  schedule()
  return id
}

/** A dynamic child region. In the spike it must be its parent's only child. */
export interface Region { attach(parent: number): void }

/** Keyed list: one row subgraph per key, a live item per row, minimal moves. */
export function list<T>(items: () => readonly T[], key: (item: T) => string | number, render: (item: Derived<T>) => number): Region {
  return {
    attach(parent) {
      type Row = { node: number; item: ReturnType<typeof signal<T>>; owner: Owner }
      let rows = new Map<string | number, Row>()
      let order: (string | number)[] = []
      watch(() => {
        const next = items()
        untracked(() => {
          const keys = next.map(key)
          const wanted = new Set(keys)
          for (const k of order) {
            if (wanted.has(k)) continue
            const row = rows.get(k)!
            row.owner.dispose()
            out.remove(row.node)
            rows.delete(k)
          }
          const kept = order.filter(k => wanted.has(k))
          const oldIndex = new Map(kept.map((k, i) => [k, i]))
          const stable = lis(keys.map(k => oldIndex.get(k) ?? -1))
          const fresh = new Set<string | number>()
          next.forEach((value, i) => {
            const k = keys[i]
            const row = rows.get(k)
            if (row) row.item(value) // same reference: no-op; new object: only bindings whose value changed emit
            else {
              const item = signal(value)
              const made = owned(() => render({ get value() { return item() } }))
              rows.set(k, { node: made.value, item, owner: made.owner })
              fresh.add(k)
            }
          })
          let before = 0
          for (let i = keys.length - 1; i >= 0; i--) {
            const k = keys[i], row = rows.get(k)!
            if (fresh.has(k) || !stable.has(i)) out.insert(parent, row.node, before)
            before = row.node
          }
          order = keys
          schedule()
        })
      })
      owner?.cleanups.push(() => { for (const r of rows.values()) r.owner.dispose(); rows = new Map() })
    },
  }
}

/** Shows exactly one case at a time; switching disposes the old subtree. */
export function match<K extends string>(which: () => K, cases: Record<K, () => number>): Region {
  return {
    attach(parent) {
      let current: { key: K; node: number; owner: Owner } | null = null
      watch(() => {
        const k = which()
        if (current?.key === k) return
        untracked(() => {
          if (current) { current.owner.dispose(); out.remove(current.node) }
          const made = owned(cases[k])
          out.insert(parent, made.value)
          current = { key: k, node: made.value, owner: made.owner }
          schedule()
        })
      })
      owner?.cleanups.push(() => current?.owner.dispose())
    },
  }
}

/** Indices (into `seq`) of a longest increasing subsequence, ignoring -1 entries. Those rows don't move. */
function lis(seq: number[]): Set<number> {
  const tails: number[] = [], prev = new Array<number>(seq.length).fill(-1)
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] < 0) continue
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (seq[tails[mid]] < seq[i]) lo = mid + 1; else hi = mid }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const keep = new Set<number>()
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i)
  return keep
}

/** Mounts the app on a host. Returns a disposer. */
export function mount(target: Host, app: () => number): () => void {
  host = target
  const made = owned(app)
  out.root(made.value)
  flush()
  return () => { made.owner.dispose(); out.remove(made.value); flush(); host = null }
}
