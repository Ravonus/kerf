// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
//
// Push-pull graph: a write marks observers DIRTY/CHECK; derived values recompute lazily when read;
// effects are queued and flushed in creation order (parents before children) on a microtask or by `flush()`.

const CLEAN = 0, CHECK = 1, DIRTY = 2

/** Dev build: diagnostic text, dev names and dev-only checks. Vite folds it to `false` in production builds. */
export const DEV: boolean = (import.meta as any).env?.DEV !== false

type Source = { v: any; o: Computation[]; /** a `get(key)` source: its box and key */ b?: Box<any>; key?: PropertyKey }

export interface Owner {
  owned: Computation[] | null
  cleanups: (() => void)[] | null
  owner: Owner | null
  context?: Record<symbol, unknown>
}

export interface Computation extends Source, Owner {
  fn: (prev: any) => any
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued), 2: effect whose value is unwrapped (a child hole: functions are called) */
  effect: 0 | 1 | 2
  /** Effects: writes the computed value, untracked (`apply(value, prev)`). */
  a: ((value: any, prev: any) => void) | undefined
  id: number
  dead?: true
  /** Dev name: the binding (`li.children`), its source location and the component it was created in. */
  n?: string
}

/** Dev names compiled bindings pass (`name`/`loc`). */
export interface EffectOptions { name?: string; loc?: string }

/** Dev only: the component being created (`createComponent(Comp, props, name, loc)`), for binding names. */
export const devComponent: { label?: string; id?: number } = {}

let listener: Computation | null = null
let owner: Owner | null = null
let nextId = 0
let queue: Computation[] = []
let scheduled = false
/** `onMount` callbacks waiting for their nodes to be placed: run after `render` and at the end of each `flush`. */
let mounts: (() => void)[] = []

/** SSR and hydration switches: `server` skips effects (weft/ssr); `data` is the page's server data (weft/dom hydrate). */
export const rt: {
  server: boolean
  /** The render's data: resolved resources and boundary states by key, written by the server, read by hydrate. */
  data?: SsrData
  /** Server only: fetches the current render started, and a hole resolver (weft/ssr). */
  wait?: Promise<unknown>[]
  /** Resources outside any Boundary: `settle()` waits for them, since they have nowhere to stream to. */
  top?: Promise<unknown>[]
  resolve?: (v: unknown) => string
  /** Server only: fetches in flight by resource key, so a later render pass waits on them instead of refetching. */
  flight?: Map<string, Promise<unknown>>
  /** Server only, streaming: each resolved Boundary's content HTML by key; pending ones wrap their fallback in markers. */
  stream?: Map<string, string>
  /** The state payload of the page being hydrated: each scope takes its entry once, as it's created (research 29 §2). */
  state?: Record<string, Record<string, unknown>>
  /** A server process (@weft/start): a scope reached outside a render throws S002 instead of sharing one app. */
  isolated?: boolean
} = { server: false }

export type SsrData = { r: Record<string, { v?: unknown; e?: string }>; b: Record<string, 'c' | 'p' | 'e'>; /** `defineState` boxes that differ from `init`, by scope */ s?: Record<string, Record<string, unknown>> }

/** Reactive work counter, read by `weft/test` (`toTouchAtMost(n, { runs })`). */
export const stats = { runs: 0 }

/** The empty list every graph list starts as (never written: `add` replaces it). */
const NONE: any[] = []

/**
 * `list` with `x` appended. Graph lists are mostly 1–3 long, and V8's first `push` reserves 17 slots, so short
 * lists are copied at their exact size (memory: research 19 §5.8).
 */
function add<T>(list: T[], x: T): T[] {
  if (list.length < 8) return list.concat([x])
  list.push(x)
  return list
}

function read(node: Source) {
  if (listener) {
    listener.s = add(listener.s, node)
    node.o = add(node.o, listener)
  }
}

function mark(node: Computation, state: number) {
  if (node.state >= state) return
  if (node.state === CLEAN && node.effect) queue.push(node)
  node.state = state
  for (const o of node.o) mark(o, CHECK)
}

function write(node: Source, value: any) {
  if (Object.is(node.v, value)) return
  node.v = value
  for (const o of node.o) mark(o, DIRTY)
  schedule()
}

function schedule() {
  if (!scheduled && (queue.length || mounts.length)) {
    scheduled = true
    queueMicrotask(flush)
  }
}

function unlink(node: Computation) {
  for (const s of node.s) {
    const i = s.o.indexOf(node)
    if (i >= 0) s.o.splice(i, 1)
    if (s.b && !s.o.length) s.b.k!.delete(s.key!) // its last reader went
  }
  node.s = NONE
}

/** Dispose everything `node` owns and run its cleanups (a root's `dispose`). */
export function clean(node: Owner) {
  if (node.owned) {
    for (const c of node.owned) dispose(c)
    node.owned = null
  }
  if (node.cleanups) {
    for (const f of node.cleanups) f()
    node.cleanups = null
  }
}

function dispose(node: Computation) {
  node.dead = true
  unlink(node)
  clean(node)
}

function run(node: Computation) {
  clean(node)
  unlink(node)
  const prevListener = listener, prevOwner = owner
  listener = owner = node
  try {
    const v = node.effect === 2 ? node.fn() : node.fn(node.v) // a hole's value takes no arguments
    if (node.effect === 2 && live(v)) {
      settle(computation(() => unwrap(v), 1, node.a)) // its reads are its own, or a change here would rebuild what `fn` made
    } else if (node.a) {
      listener = null
      node.a(v, node.v)
      node.v = v
    } else if (!Object.is(v, node.v)) {
      node.v = v
      for (const o of node.o) o.state = DIRTY
    }
  } catch (e) {
    if (DEV && node.n && e && typeof e === 'object' && !(e as any).weft) (e as any).weft = node.n // where it threw
    throw e
  } finally {
    listener = prevListener
    owner = prevOwner
  }
  node.state = CLEAN
}

function update(node: Computation) {
  if (node.state === CHECK) {
    for (const s of node.s) {
      if ('fn' in s) update(s as Computation)
      if ((node.state as number) === DIRTY) break
    }
  }
  if (node.state === DIRTY && !node.dead) {
    stats.runs++
    run(node)
  }
  node.state = CLEAN
}

/**
 * A child hole's value: functions are called (tracked), through nested arrays too: a fragment's parts can hold a
 * component's `children`, itself an array with live parts (`<>{icon}{children}</>` with children `Added {n}`).
 */
function unwrap(v: any): any {
  while (typeof v === 'function') v = v()
  return Array.isArray(v) ? v.map(unwrap) : v
}

const live = (v: any): boolean => typeof v === 'function' || (Array.isArray(v) && v.some(live))

function computation(fn: (prev: any) => any, effect: 0 | 1 | 2, a?: Computation['a']): Computation {
  const node: Computation = {
    fn, v: undefined, o: NONE, s: NONE, state: DIRTY, effect, a, id: nextId++,
    owned: null, cleanups: null, owner, context: owner?.context,
  }
  if (DEV && devComponent.label) node.n = devComponent.label
  if (owner) owner.owned = add(owner.owned ?? NONE, node)
  return node
}

/** Apply pending effects and DOM updates now. */
export function flush() {
  scheduled = false
  do {
    while (queue.length) {
      const batch = queue.sort((a, b) => a.id - b.id)
      queue = []
      for (const node of batch) if (!node.dead) update(node)
    }
    runMounts() // the DOM is placed now; a callback's writes queue more work, applied in this same flush
  } while (queue.length)
}

/** Run pending `onMount` callbacks (in creation order). weft/dom calls it once `render`/`hydrate` placed the app. */
export function runMounts() {
  while (mounts.length) {
    const batch = mounts
    mounts = []
    for (const f of batch) f()
  }
}

export interface State<T> {
  value: T
  /** Deep update: mutate a copy (arrays/objects are shallow-copied first). */
  set(update: (draft: T) => void): void
  /**
   * Read one entry of an object box. The reader re-runs only when that entry changes (`Object.is`), not on every
   * write to the box: `cart.get(p.id)?.qty` in 150 rows re-runs 1 row on add-one, `cart.value[p.id]` re-runs 150.
   */
  get<K extends keyof T>(key: K): T[K]
}

export interface StateOptions<T> {
  /** Persist through reloads (§4.5). Only inside `defineState`. The short form takes primitive `init` only. */
  persist?: 'local' | 'session' | 'cookie' | 'memory' | {
    in: 'local' | 'session' | 'cookie' | 'memory'
    /** Required for object and array values: a Standard Schema (Zod, Valibot, ArkType). */
    schema?: StandardSchema<T>
    version?: number
    migrate?: Record<number, (old: any) => unknown>
    /** `cookie` only: seconds it lives. Default one year. */
    maxAge?: number
  }
  /** Leave this box out of its scope's undo history. */
  history?: false
  /** Name inside its scope (`cart.<name>`). Returned boxes are named by their key; a private persisted box needs one. */
  name?: string
}

/** The validation half of the Standard Schema spec (standardschema.dev). */
export interface StandardSchema<T = unknown> {
  readonly '~standard': {
    validate(value: unknown): { value: T; issues?: undefined } | { issues: readonly { message: string }[] } | Promise<unknown>
  }
}

export interface Derived<T> {
  readonly value: T
}

/** Set by `defineState` while a setup runs, to collect the boxes it creates. */
export let collecting: Box<any>[] | null = null
export function collect<T>(fn: () => T): [T, Box<any>[]] {
  const prev = collecting, boxes: Box<any>[] = (collecting = [])
  try { return [fn(), boxes] } finally { collecting = prev }
}

export class Box<T> implements State<T> {
  v: T
  o: Computation[] = NONE
  // Rarely set, so not own fields of every box (memory).
  /** Per-entry sources for `get(key)`. */
  declare k?: Map<PropertyKey, Source>
  /** Write hook: a scope's history, persistence and transactions. */
  declare h?: (box: Box<T>, prev: T) => void
  /** Dev name (`cart.note`). */
  declare n?: string
  declare opts?: StateOptions<T>
  constructor(v: T, opts?: StateOptions<T>) {
    this.v = v
    if (opts) this.opts = opts
    if (collecting) collecting.push(this)
  }
  get value() { read(this); return this.v }
  set value(v: T) { this.w(v) }
  set(update: (draft: T) => void) {
    const v: any = this.v
    const draft = Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v
    update(draft)
    this.w(draft)
  }
  get<K extends keyof T>(key: K): T[K] {
    if (listener) {
      const k = (this.k ??= new Map())
      let s = k.get(key)
      if (!s) k.set(key, (s = { v: undefined, o: NONE, b: this, key }))
      read(s)
    }
    return (this.v as any)?.[key]
  }
  w(v: T) {
    const prev: any = this.v
    if (Object.is(prev, v)) return
    if (this.k) {
      // Entry readers only: they re-run when their entry changed; whole-value readers are marked by write() below.
      for (const [key, s] of this.k) {
        if (!s.o.length) { this.k.delete(key); continue }
        if (!Object.is(prev?.[key], (v as any)?.[key])) for (const o of s.o) mark(o, DIRTY)
      }
    }
    write(this, v)
    if (this.h) this.h(this, prev)
  }
}

export function state<T>(init: T, options?: StateOptions<T>): State<T> {
  return new Box(init, options)
}

export interface Linked<T> extends State<T> {
  /** With `key`: the source moved under a local edit. `theirs` is its value now, `base` the one the edit started from. */
  readonly conflict: Derived<{ theirs: T; base: T } | undefined>
}

/**
 * A writable box that resets whenever `source` changes (a local copy of a prop). With `key`, it resets when the key
 * changes; while the key stays, it follows the source until a local edit, then keeps the edit and reports `conflict`
 * (a refetch or a push never clobbers what someone is typing, research 14 §3.4).
 */
state.linked = <T>(source: () => T, options?: { key: () => unknown }): Linked<T> => {
  const src = derived(source)
  // A fresh object per key, so a write belongs to one key even if the key later returns to it. No `key`: the source.
  const from = derived<{ k: unknown }>(((prev?: { k: unknown }) => {
    const k = options ? options.key() : src.value
    return prev && Object.is(prev.k, k) ? prev : { k }
  }) as () => { k: unknown })
  const local = new Box<{ v: T; from: { k: unknown }; base: T } | undefined>(undefined)
  const edit = () => {
    const f = from.value
    const l = local.value
    return l && l.from === f ? l : undefined
  }
  return {
    get value() {
      const l = edit()
      return l ? l.v : src.value
    },
    set value(v: T) {
      const f = from.value
      const l = local.v
      local.value = { v, from: f, base: l && l.from === f ? l.base : untrack(() => src.value) }
    },
    set(update) { const d: any = this.value; update(d); this.value = d },
    get(key) { return (this.value as any)?.[key] },
    conflict: derived(() => {
      const l = edit()
      const theirs = src.value
      return l && !Object.is(theirs, l.base) ? { theirs, base: l.base } : undefined
    }),
  }
}

export class Memo<T> implements Derived<T> {
  constructor(public node: Computation) {}
  get value(): T {
    update(this.node)
    read(this.node)
    return this.node.v
  }
}

/** Dev only: named boxes and derived values that are alive now, for the graph (weft/devtools). */
export const named = new Set<Box<any> | Computation>()

/**
 * Dev builds: the compiler wraps component `state`/`derived` as `name(state(0), "Cart.count")`. The graph
 * (`weft browser snapshot`, the overlay) shows the value under that name; the entry goes when its owner does.
 */
export function name<T>(value: T, label: string): T {
  if (!DEV) return value
  const node = value instanceof Box ? value : value instanceof Memo ? value.node : null
  if (!node) return value
  if (!(node instanceof Box) || !node.n) node.n = label
  ;(node as any).c = devComponent.label
  ;(node as any).i = devComponent.id
  named.add(node)
  onCleanup(() => named.delete(node))
  return value
}

export function derived<T>(fn: () => T): Derived<T> {
  return new Memo(computation(fn, 0))
}

/** Accessor form used by compiled code (`memo`). */
export function memo<T>(fn: () => T): () => T {
  const d = derived(fn)
  return () => d.value
}

/**
 * Side effects only. `source` is tracked; `run` is not. `run` may return a cleanup, called before the next run
 * and when the owner is disposed.
 */
export function watch<T>(source: () => T, run: (value: T, prev: T | undefined) => void | (() => void)) {
  let cleanup: void | (() => void)
  let prev: T | undefined
  effect(source, value => {
    if (cleanup) cleanup()
    cleanup = untrack(() => run(value, prev))
    prev = value
  })
  onCleanup(() => cleanup && cleanup())
}

/** Compiled binding: `compute` is tracked, `apply(value, prev)` writes the DOM. Runs once now; never on the server. */
export function effect<T>(compute: (prev?: T) => T, apply: (value: T, prev: T | undefined) => void, options?: EffectOptions) {
  if (rt.server) return
  const node = computation(compute, 1, apply)
  if (DEV && options?.name) node.n = `${options.name} (${options.loc})${node.n ? ` in ${node.n}` : ''}`
  settle(node)
}

/** First run. A node that read nothing reactive and owns nothing can never re-run: its owner drops it (memory). */
function settle(node: Computation) {
  run(node)
  if (node.s === NONE && !node.owned && !node.cleanups && owner?.owned?.at(-1) === node) owner.owned.pop()
}

/** A child hole (weft/dom `insert`): `value` is tracked and unwrapped (functions called), `apply` places it. */
export function hole(value: () => unknown, apply: (value: any) => void) {
  if (rt.server) return
  settle(computation(value, 2, apply))
}

export function onCleanup(fn: () => void) {
  if (owner) owner.cleanups = add(owner.cleanups ?? NONE, fn)
}

/**
 * `fn` runs once the component's nodes are in place (refs assigned, the DOM inserted): after `render` returns its
 * first pass, or at the end of the `flush` that created the component. Skipped if the owner is disposed first.
 * Its owner is the component's, so `onCleanup` inside it works.
 */
export function onMount(fn: () => void) {
  if (rt.server) return
  const at = owner
  let live = true
  onCleanup(() => { live = false })
  mounts.push(() => { if (live) within(at!, fn) })
  schedule()
}

export function untrack<T>(fn: () => T): T {
  const prev = listener
  listener = null
  try {
    return fn()
  } finally {
    listener = prev
  }
}

export function batch<T>(fn: () => T): T {
  return fn()
}

export function getOwner() {
  return owner
}

export function createRoot<T>(fn: (dispose: () => void) => T, parent: Owner | null = owner): T {
  const root: Owner = { owned: null, cleanups: null, owner: parent, context: parent?.context }
  return within(root, () => fn(() => clean(root)))
}

/** Run `fn` untracked with `root` as its owner: a root the caller made (For's rows are their own roots). */
export function within<T>(root: Owner, fn: () => T): T {
  const prevOwner = owner, prevListener = listener
  owner = root
  listener = null
  try {
    return fn()
  } finally {
    owner = prevOwner
    listener = prevListener
  }
}

export function context<T>(fallback?: T) {
  const id = Symbol()
  return {
    provide<R>(value: T, fn: () => R): R {
      const parent = owner
      return createRoot(dispose => {
        if (parent) (parent.cleanups ??= []).push(dispose) // the subtree goes when its parent does
        owner!.context = { ...owner!.context, [id]: value }
        return fn()
      })
    },
    get use(): T {
      const ctx = owner?.context
      return ctx && id in ctx ? (ctx[id] as T) : (fallback as T)
    },
  }
}

/**
 * A live view of `sources` merged (later wins), without the `skip` keys. A source is an object, or a getter for one
 * (a spread of a prop), which may be undefined (`{...rest.attrs}`). `mergeProps` and `omit` are both views.
 */
export function view(sources: any[], skip: string[] = []): any {
  const at = (s: any) => Object(typeof s === 'function' ? s() : s)
  const kept = (k: any) => !skip.includes(k)
  return new Proxy({}, {
    get(_, k) {
      if (kept(k))
        for (let i = sources.length - 1; i >= 0; i--) {
          const s = at(sources[i])
          if (k in s) return s[k]
        }
    },
    has: (_, k) => kept(k) && sources.some(s => k in at(s)),
    ownKeys: () => [...new Set(sources.flatMap(s => Reflect.ownKeys(at(s))))].filter(kept),
    getOwnPropertyDescriptor: (_, k) => (kept(k) ? { configurable: true, enumerable: true } : undefined),
  })
}

/** A live view of `props` without `keys` (`({ a, ...rest }) =>`, §3.3). */
export const omit = (props: object, keys: string[]): any => view([props], keys)

/** `<div {...rest}>`: a plain copy of `props` without `keys`, read where the element's spread reads its attributes. */
export function restOf(props: any, keys: string[]) {
  const out: any = {}
  for (const k in props) if (!keys.includes(k)) out[k] = props[k]
  return out
}

export { Boundary, resource, type Resource, type ResourceOptions } from './async'
export { defineState, StateError, type ScopeHandle, type History, type HistoryEntry } from './scope'
