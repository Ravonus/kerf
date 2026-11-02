// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
//
// Push-pull graph: a write marks observers DIRTY/CHECK; derived values recompute lazily when read;
// effects are queued and flushed in creation order (parents before children) on a microtask or by `flush()`.

import { CHAIN, INLINE, LITERAL, MICRO, ORDERED, POP, REUSE } from './flags'

const CLEAN = 0, CHECK = 1
export const DIRTY = 2
/** `effect` of a disposed node: it never runs again, and there's no field for it on the live ones. */
const DEAD = 3

/** Dev build: diagnostic text, dev names and dev-only checks. Vite folds it to `false` in production builds. */
export const DEV: boolean = (import.meta as any).env?.DEV !== false

type Source = { v: any; /** first reader, then the rest */ f: Computation | undefined; o: Computation[]; /** a `get(key)` source: its box and key */ b?: Box<any>; key?: PropertyKey }

export interface Owner {
  /** First owned; `CHAIN` follows `sib`, or a list. */
  owned: any
  /** Last owned. */
  tail?: Computation | null
  cleanups: (() => void)[] | null
  owner: Owner | null
  /** Set by `provide` on its root; everything below finds it through `owner`. */
  context?: Record<symbol, unknown>
}

export interface Computation extends Source, Owner {
  /** The next computation its owner owns. */
  sib: Computation | null
  fn: (prev: any) => any
  /** First source, then the rest. */
  p: Source | undefined
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued), 2: effect whose value is unwrapped (a child hole: functions are called), 3: disposed */
  effect: 0 | 1 | 2 | 3
  /** Effects: writes the computed value, untracked (`apply(value, prev)`). */
  a: ((value: any, prev: any, h: any) => void) | undefined
  /** What a shared `a` works on. */
  h: unknown
  id: number
  /** Dev name: the binding (`li.children`), its source location and the component it was created in. */
  n?: string
}

/** Dev names compiled bindings pass (`name`/`loc`). */
export interface EffectOptions { name?: string; loc?: string }

/** Dev only: the component being created (`createComponent(Comp, props, name, loc)`), for binding names. */
export const devComponent: { label?: string; id?: number } = {}

export let listener: Computation | null = null
let owner: Owner | null = null
let nextId = 0
/** How many of `listener.s` this run has read again, in order. Those links stay as they are. */
let at = 0
let queue: Computation[] = []
/** @weft-js/core/keyed: tells a box's entry readers about a write. */
let keyed: ((box: Box<any>, prev: any, v: any) => void) | undefined
export const setKeyed = (f: typeof keyed) => { keyed = f }
/** The newest queued effect's id, and whether one came out of creation order. */
let last = 0
let mixed = false
/** A flush is on the microtask queue. */
let scheduled = false
/** `onMount` callbacks waiting for their nodes to be placed: run after `render` and at the end of each `flush`. */
let mounts: (() => void)[] = []

/** SSR and hydration switches: `server` skips effects (@weft-js/core/ssr); `data` is the page's server data (@weft-js/core/dom hydrate). */
export const rt: {
  server: boolean
  /** The render's data: resolved resources and boundary states by key, written by the server, read by hydrate. */
  data?: SsrData
  /** Server only: fetches the current render started, and a hole resolver (@weft-js/core/ssr). */
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
  /** A server process (@weft-js/start): a scope reached outside a render throws S002 instead of sharing one app. */
  isolated?: boolean
  /** @weft-js/core/test: slot overrides for this render (`render(App, {}, { slots })`), so a slot needs no generated module. */
  slots?: Record<string, unknown>
} = { server: false }

export type SsrData = { r: Record<string, { v?: unknown; e?: string }>; b: Record<string, 'c' | 'p' | 'e'>; /** `defineState` boxes that differ from `init`, by scope */ s?: Record<string, Record<string, unknown>> }

/** Reactive work counter, read by `@weft-js/core/test` (`toTouchAtMost(n, { runs })`). */
export const stats = { runs: 0 }

/** The empty list every graph list starts as (never written: `add` replaces it). */
export const NONE: any[] = []

/**
 * `list` with `x` appended. Graph lists are mostly 1–3 long, and V8's first `push` reserves 17 slots, so short
 * lists are copied at their exact size (memory: research 19 §5.8).
 */
function add<T>(list: T[], x: T): T[] {
  const n = list.length
  if (LITERAL && !n) return [x]
  if (LITERAL && n === 1) return [list[0], x]
  if (n < 8) return list.concat([x])
  list.push(x)
  return list
}

/**
 * A run reads what the run before it read, nearly always, so a read that matches the list by position only moves on.
 * From the first that doesn't, the rest of the list is dropped and rebuilt as reads come in.
 */
export function read(node: Source) {
  const l = listener
  if (l) {
    if (INLINE && !at) {
      if (l.p !== node) {
        if (l.p) unlink(l, 0)
        l.p = node
        link(node, l)
      }
      at = 1
      return
    }
    const s = l.s, r = INLINE ? at - 1 : at
    if (REUSE && s[r] === node) at++
    else if (l.p !== node && (!r || r > 8 || s.lastIndexOf(node, r - 1) < 0)) { // short lists don't hold one box twice
      if (r < s.length) unlink(l, at)
      l.s = add(l.s, node)
      link(node, l)
      at++
    }
  }
}

function link(node: Source, reader: Computation) {
  if (INLINE && !node.f) node.f = reader
  else node.o = add(node.o, reader)
}

/** Mark everything that reads `node`. */
export function reach(node: Source, state: number) {
  if (INLINE && node.f) mark(node.f, state)
  const o = node.o
  for (let i = 0; i < o.length; i++) mark(o[i], state)
}

function mark(node: Computation, state: number) {
  if (node.state >= state) return
  if (node.state === CLEAN && node.effect) {
    if (ORDERED) {
      if (node.id < last) mixed = true
      last = node.id
    }
    queue.push(node)
  }
  node.state = state
  reach(node, CHECK)
}

function schedule() {
  if (!scheduled && (queue.length || mounts.length)) {
    scheduled = true
    queueMicrotask(MICRO ? () => {
      scheduled = false
      flush()
    } : flush)
  }
}

/** Take `node` off its sources from `from` on. */
function unlink(node: Computation, from: number) {
  const s = node.s, rest = INLINE && from ? from - 1 : from
  for (let i = s.length - 1; i >= rest; i--) drop(s[i], node)
  if (INLINE && !from && node.p) {
    drop(node.p, node)
    node.p = undefined
  }
  if (POP && !from) node.s = NONE
  else s.length = rest
}

/** `node` no longer reads `c`. */
function drop(c: Source, node: Computation) {
  const o = c.o
  if (INLINE && c.f === node) c.f = o.pop()
  else {
    const j = o.indexOf(node)
    if (POP && j === o.length - 1) o.pop()
    else if (j >= 0) o.splice(j, 1)
  }
  if (c.b && !c.f && !o.length) c.b.k!.delete(c.key!) // its last reader went
}

/** Dispose everything `node` owns and run its cleanups (a root's `dispose`). */
export function clean(node: Owner) {
  if (node.owned) {
    if (CHAIN) {
      const end = node.tail
      for (let c: Computation = node.owned; ; c = c.sib!) {
        dispose(c)
        if (c === end) break
      }
      node.tail = null
    } else for (const c of node.owned) dispose(c)
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
  if (node.owned || node.cleanups) clean(node)
  if (!REUSE) unlink(node, 0)
  const prevListener = listener, prevOwner = owner, prevAt = at
  listener = owner = node
  at = 0
  try {
    const v = node.effect === 2 ? (node.fn as () => unknown)() : node.fn(node.v) // a hole's value takes no arguments
    if (node.effect === 2 && live(v)) {
      // its reads are its own, or a change here would rebuild what `fn` made; a function gets a level of its own, as it
      // may build the very component whose fragment holds the live part
      settle(typeof v === 'function' ? computation(v as () => unknown, 2, node.a, node.h) : computation(() => unwrap(v), 1, node.a, node.h))
    } else if (node.a) {
      listener = null
      node.a(v, node.v, node.h)
      node.v = v
    } else if (!Object.is(v, node.v)) {
      node.v = v
      if (INLINE && node.f) node.f.state = DIRTY
      const o = node.o
      for (let i = 0; i < o.length; i++) o[i].state = DIRTY
    }
  } catch (e) {
    if (DEV && node.n && e && typeof e === 'object' && !(e as any).weft) (e as any).weft = node.n // where it threw
    throw e
  } finally {
    if (at < node.s.length + (INLINE && node.p ? 1 : 0)) unlink(node, at) // what this run didn't read
    listener = prevListener
    owner = prevOwner
    at = prevAt
  }
  node.state = CLEAN
}

function update(node: Computation) {
  if (node.state === CHECK) {
    if (INLINE && (node.p as Computation)?.state) update(node.p as Computation)
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

const live = (v: any): boolean => typeof v === 'function' || (Array.isArray(v) && v !== flat && v.some(live))

/** The last row list made of single elements (@weft-js/core/dom `For`): nothing in it is live, and `place` can take it as it is. */
export let flat: unknown = NONE
export const setFlat = (list: unknown) => { flat = list }

function adopt(node: Computation) {
  if (!CHAIN) owner!.owned = add(owner!.owned ?? NONE, node)
  else {
    const t = owner!.tail
    node.sib = t! // back, while it's the last: `settle` can take it off again
    if (t) t.sib = node
    else owner!.owned = node
    owner!.tail = node
  }
}

function computation(fn: (prev: any) => any, effect: 0 | 1 | 2, a?: Computation['a'], h?: unknown): Computation {
  const node: Computation = {
    fn, v: undefined, f: undefined, o: NONE, p: undefined, s: NONE, state: DIRTY, effect, a, h, id: nextId++,
    owned: null, tail: null, sib: null, cleanups: null, owner,
  }
  if (DEV && devComponent.label) node.n = devComponent.label
  if (owner) adopt(node)
  return node
}

/** Apply pending effects and DOM updates now. */
export function flush() {
  if (!MICRO) scheduled = false
  do {
    while (queue.length) {
      const batch = !ORDERED || mixed ? queue.sort((a, b) => a.id - b.id) : queue
      mixed = false
      last = 0
      queue = []
      for (let i = 0; i < batch.length; i++) update(batch[i])
    }
    runMounts() // the DOM is placed now; a callback's writes queue more work, applied in this same flush
  } while (queue.length)
}

/** Run pending `onMount` callbacks (in creation order). @weft-js/core/dom calls it once `render`/`hydrate` placed the app. */
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

export const plain = (x: any) => Object.getPrototypeOf(x ?? 0) === Object.prototype

/** An object's keys, and each as a number too: `get(1)` reads the key the object calls '1'. */

export class Box<T> implements State<T> {
  v: T
  f: Computation | undefined = undefined
  o: Computation[] = NONE
  // Rarely set, so not own fields of every box (memory).
  /** Per-entry sources for `get(key)`. */
  declare k?: Map<PropertyKey, Source>
  declare get: State<T>['get']
  declare set: State<T>['set']
  /** How many keys the last two values had, when they were compared key by key. */
  declare c?: number
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
  w(v: T) {
    const prev: any = this.v
    if (Object.is(prev, v)) return
    this.v = v
    if (this.k) keyed!(this, prev, v)
    reach(this, DIRTY)
    schedule()
    if (this.h) this.h(this, prev)
  }
}

export interface Linked<T> extends State<T> {
  /** With `key`: the source moved under a local edit. `theirs` is its value now, `base` the one the edit started from. */
  readonly conflict: Derived<{ theirs: T; base: T } | undefined>
}

/** A box. `.linked`, `.get` and `.set` come with @weft-js/core/keyed, which the `weft` entry and the Vite plugin bring in. */
export const state: {
  <T>(init: T, options?: StateOptions<T>): State<T>
  linked<T>(source: () => T, options?: { key: () => unknown }): Linked<T>
} = ((init: unknown, options?: StateOptions<unknown>) => new Box(init, options)) as any

export class Memo<T> implements Derived<T> {
  constructor(public node: Computation) {}
  get value(): T {
    update(this.node)
    read(this.node)
    return this.node.v
  }
}

/** Dev only: named boxes and derived values that are alive now, for the graph (@weft-js/core/devtools). */
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
  if (!node.p && node.s === NONE && !node.owned && !node.cleanups && owner) {
    if (!CHAIN) {
      if (owner.owned?.[owner.owned.length - 1] === node) owner.owned.pop()
    } else if (owner.tail === node) {
      owner.tail = node.sib
      if (!node.sib) owner.owned = null
    }
  }
}

/** A child hole (@weft-js/core/dom `insert`): `value` is tracked and unwrapped (functions called), `apply` places it. */
export function hole<H>(value: () => unknown, apply: (value: any, was: any, h: H) => void, h?: H) {
  if (rt.server) return
  settle(computation(value, 2, apply, h))
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
  const root: Owner = { owned: null, tail: null, cleanups: null, owner: parent }
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

export { localProps } from './linked'

/**
 * `<Card person={bind(name)} />`: `person` reads the box, and a write in `Card` reaches it. Without this, a child's
 * writes stay in the child. The compiler reads the call; this is its value where nothing compiled it.
 */
export const bind = <T>(box: State<T>): T => box.value

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

/** A component's props, for the rare case inference doesn't cover: `Props<typeof Button>`. Types only. */
export type Props<C> = C extends (props: infer P, ...rest: any[]) => any ? P : never
