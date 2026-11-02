// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
//
// Push-pull graph: a write marks observers DIRTY/CHECK; derived values recompute lazily when read;
// effects are queued and flushed in creation order (parents before children) on a microtask or by `flush()`.

const CLEAN = 0, CHECK = 1, DIRTY = 2
/** `effect` of a disposed node: it never runs again, and there's no field for it on the live ones. */
const DEAD = 3

/** Dev build: diagnostic text, dev names and dev-only checks. Vite folds it to `false` in production builds. */
export const DEV: boolean = (import.meta as any).env?.DEV !== false

type Source = { v: any; o: Computation[]; /** a `get(key)` source: its box and key */ b?: Box<any>; key?: PropertyKey }

export interface Owner {
  owned: Computation[] | null
  cleanups: (() => void)[] | null
  owner: Owner | null
  /** Set by `provide` on its root; everything below finds it through `owner`. */
  context?: Record<symbol, unknown>
}

export interface Computation extends Source, Owner {
  fn: (prev: any) => any
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued), 2: effect whose value is unwrapped (a child hole: functions are called), 3: disposed */
  effect: 0 | 1 | 2 | 3
  /** Effects: writes the computed value, untracked (`apply(value, prev)`). */
  a: ((value: any, prev: any) => void) | undefined
  id: number
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
/** How many of `listener.s` this run has read again, in order. Those links stay as they are. */
let at = 0
let queue: Computation[] = []
/** Queued out of id order, so `flush` has to sort: rare, as writes mostly reach bindings in creation order. */
let shuffled = false
/** A flush is on the microtask queue. */
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
  /** weft/test: slot overrides for this render (`render(App, {}, { slots })`), so a slot needs no generated module. */
  slots?: Record<string, unknown>
} = { server: false }

export type SsrData = { r: Record<string, { v?: unknown; e?: string }>; b: Record<string, 'c' | 'p' | 'e'>; /** The page is still streaming: the client may start before its Boundaries land. */ w?: 1; /** `defineState` boxes that differ from `init`, by scope */ s?: Record<string, Record<string, unknown>> }

/** Reactive work counter, read by `weft/test` (`toTouchAtMost(n, { runs })`). */
export const stats = { runs: 0 }

/** The empty list every graph list starts as (never written: `add` replaces it). */
const NONE: any[] = []

/**
 * `list` with `x` appended. Graph lists are mostly 1–3 long, and V8's first `push` reserves 17 slots, so short
 * lists are copied at their exact size (memory: research 19 §5.8).
 */
function add<T>(list: T[], x: T): T[] {
  const n = list.length
  if (!n) return [x]
  if (n === 1) return [list[0], x]
  if (n < 8) return list.concat([x])
  list.push(x)
  return list
}

/**
 * A run reads what the run before it read, nearly always, so a read that matches the list by position only moves on.
 * From the first that doesn't, the rest of the list is dropped and rebuilt as reads come in.
 */
function read(node: Source) {
  const l = listener
  if (l) {
    const s = l.s
    if (s[at] === node) at++
    else if (!at || at > 8 || s.lastIndexOf(node, at - 1) < 0) { // short lists don't hold one box twice
      if (at < s.length) unlink(l, at)
      l.s = add(l.s, node)
      node.o = add(node.o, l)
      at++
    }
  }
}

function mark(node: Computation, state: number) {
  if (node.state >= state) return
  if (node.state === CLEAN && node.effect) {
    if (node.id < queue[queue.length - 1]?.id) shuffled = true
    queue.push(node)
  }
  node.state = state
  const o = node.o
  for (let i = 0; i < o.length; i++) mark(o[i], CHECK)
}

function schedule() {
  if (!scheduled && (queue.length || mounts.length)) {
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      flush()
    })
  }
}

/** Take `node` off its sources from `from` on. */
function unlink(node: Computation, from: number) {
  const s = node.s
  for (let i = s.length - 1; i >= from; i--) {
    const c = s[i], o = c.o, j = o.indexOf(node)
    if (j === o.length - 1) o.pop()
    else if (j >= 0) o.splice(j, 1)
    if (c.b && !o.length) c.b.k!.delete(c.key!) // its last reader went
  }
  if (from) s.length = from
  else node.s = NONE
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
  node.effect = DEAD
  unlink(node, 0)
  clean(node)
}

function run(node: Computation) {
  clean(node)
  const prevListener = listener, prevOwner = owner, prevAt = at
  listener = owner = node
  at = 0
  try {
    const v = node.effect === 2 ? (node.fn as () => unknown)() : node.fn(node.v) // a hole's value takes no arguments
    if (node.effect === 2 && live(v)) {
      // its reads are its own, or a change here would rebuild what `fn` made; a function gets a level of its own, as it
      // may build the very component whose fragment holds the live part
      settle(typeof v === 'function' ? computation(v as () => unknown, 2, node.a) : computation(() => unwrap(v), 1, node.a))
    } else if (node.a) {
      listener = null
      node.a(v, node.v)
      node.v = v
    } else if (!Object.is(v, node.v)) {
      node.v = v
      const o = node.o
      for (let i = 0; i < o.length; i++) o[i].state = DIRTY
    }
  } catch (e) {
    if (DEV && node.n && e && typeof e === 'object' && !(e as any).weft) (e as any).weft = node.n // where it threw
    throw e
  } finally {
    if (at < node.s.length) unlink(node, at) // what this run didn't read
    listener = prevListener
    owner = prevOwner
    at = prevAt
  }
  node.state = CLEAN
}

function update(node: Computation) {
  if (node.state === CHECK) {
    const s = node.s
    for (let i = 0; i < s.length; i++) {
      const c = s[i] as Computation
      if (c.state) update(c)
      if ((node.state as number) === DIRTY) break
    }
  }
  if (node.state === DIRTY && node.effect !== DEAD) {
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
    owned: null, cleanups: null, owner,
  }
  if (DEV && devComponent.label) node.n = devComponent.label
  if (owner) owner.owned = add(owner.owned ?? NONE, node)
  return node
}

/** Apply pending effects and DOM updates now. */
export function flush() {
  do {
    while (queue.length) {
      const batch = shuffled ? queue.sort((a, b) => a.id - b.id) : queue
      queue = []
      shuffled = false
      for (let i = 0; i < batch.length; i++) update(batch[i])
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
  /** Keep this box the same in every tab (research 32 §1). Needs `persist`, not in `'session'`: new tabs read it there. */
  sync?: 'tabs'
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
    this.v = v
    if (this.k) {
      // Entry readers only: they re-run when their entry changed; whole-value readers are marked by write() below.
      for (const [key, s] of this.k) {
        if (!s.o.length) { this.k.delete(key); continue }
        if (!Object.is(prev?.[key], (v as any)?.[key])) for (const o of s.o) mark(o, DIRTY)
      }
    }
    const o = this.o
    for (let i = 0; i < o.length; i++) mark(o[i], DIRTY)
    schedule()
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
    if (this.node.s !== NONE) read(this.node) // read nothing, so nothing can change it
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
  const done = node.s === NONE && !node.owned
  if (done && !node.cleanups && owner?.owned?.[owner.owned.length - 1] === node) owner.owned.pop()
  return done
}

/** A child hole (weft/dom `insert`): `value` is tracked and unwrapped (functions called), `apply` places it. True: it read nothing, so it's done. */
export function hole(value: () => unknown, apply: (value: any) => void) {
  if (rt.server) return false
  return settle(computation(value, 2, apply))
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
  const root: Owner = { owned: null, cleanups: null, owner: parent }
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

/** The nearest `provide`'s values: each one holds its parents' too. */
function contexts(from: Owner | null) {
  while (from && !from.context) from = from.owner
  return from?.context
}

export function context<T>(fallback?: T) {
  const id = Symbol()
  return {
    provide<R>(value: T, fn: () => R): R {
      const parent = owner
      return createRoot(dispose => {
        if (parent) (parent.cleanups ??= []).push(dispose) // the subtree goes when its parent does
        owner!.context = { ...contexts(parent), [id]: value }
        return fn()
      })
    },
    get use(): T {
      const ctx = contexts(owner)
      return ctx && id in ctx ? (ctx[id] as T) : (fallback as T)
    },
  }
}

function once<T>(fn: () => T) {
  let done = false, v: T
  return () => (done ? v : ((done = true), (v = fn())))
}

/**
 * A live view of `sources` merged (later wins), without the `skip` keys. A source is an object, or a getter for one
 * (a spread of a prop), which may be undefined (`{...rest.attrs}`). `mergeProps` and `omit` are both views.
 */
export function view(sources: any[], skip: string[] = []): any {
  // A server renders once and nothing it reads can move: a getter (a `restOf` copy, so every prop) runs once, not per read.
  if (rt.server) sources = sources.map(s => (typeof s === 'function' ? once(s) : s))
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
    ownKeys: () => {
      const out: (string | symbol)[] = []
      for (const s of sources) for (const k of Reflect.ownKeys(at(s))) if (kept(k) && !out.includes(k)) out.push(k)
      return out
    },
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
