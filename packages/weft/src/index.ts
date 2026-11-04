// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
//
// Push-pull graph: a write marks observers DIRTY/CHECK; derived values recompute lazily when read;
// effects are queued and flushed in creation order (parents before children) on a microtask or by `flush()`.

import { CHAIN, INLINE, LITERAL, MICRO, ORDERED, POP, REUSE } from './flags'

const CLEAN = 0, CHECK = 1
/** A node's value is out of date: it recomputes the next time it's read or flushed. */
export const DIRTY = 2
/** `effect` of a disposed node: it never runs again, and there's no field for it on the live ones. */
const DEAD = 3

/** Dev build: diagnostic text, dev names and dev-only checks. Vite folds it to `false` in production builds. */
export const DEV: boolean = (import.meta as { env?: { DEV?: boolean } }).env?.DEV !== false

type Source = { v: unknown; /** first reader, then the rest */ f: Computation | undefined; o: Computation[]; /** a `get(key)` source: its box and key */ b?: Box<unknown>; key?: PropertyKey }

/** What holds computations and cleanups: a root, or a computation over what it makes. Disposing it disposes them. */
export interface Owner {
  /** First owned; `CHAIN` follows `sib`, or a list. */
  owned: Computation | Computation[] | null
  /** Last owned. */
  tail?: Computation | null | undefined
  cleanups: (() => void)[] | null
  owner: Owner | null
  /** Set by `provide` on its root; everything below finds it through `owner`. */
  context?: Record<symbol, unknown>
}

/** A node of the graph: a derived value or an effect, with what it reads and what reads it. */
export interface Computation extends Source, Owner {
  /** The next computation its owner owns. */
  sib: Computation | null
  fn: (prev: unknown) => unknown
  /** First source, then the rest. */
  p: Source | undefined
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued), 2: effect whose value is unwrapped (a child hole: functions are called), 3: disposed */
  effect: 0 | 1 | 2 | 3
  /** Effects: writes the computed value, untracked (`apply(value, prev)`). */
  a: ((value: unknown, prev: unknown, h: unknown) => void) | undefined
  /** What a shared `a` works on. */
  h: unknown
  id: number
  /** Dev name: the binding (`li.children`), its source location and the component it was created in. */
  n?: string
}

/** Dev names compiled bindings pass (`name`/`loc`). */
export interface EffectOptions { name?: string | undefined; loc?: string | undefined }

/** Dev only: the component being created (`createComponent(Comp, props, name, loc)`), for binding names. */
export const devComponent: { label?: string | undefined; id?: number | undefined } = {}

/** The computation reading right now: whatever it reads, it subscribes to. */
export let listener: Computation | null = null
let owner: Owner | null = null
let nextId = 0
/** How many of `listener.s` this run has read again, in order. Those links stay as they are. */
let at = 0
let queue: Computation[] = []
/** @weft-js/core/keyed: tells a box's entry readers about a write. */
let keyed: ((box: Box<unknown>, prev: unknown, v: unknown) => void) | undefined
/** Hands the core its entry-reader update, so an app that never calls `get` doesn't ship it. */
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
  data?: SsrData | undefined
  /** Server only: fetches the current render started, and a hole resolver (@weft-js/core/ssr). */
  wait?: Promise<unknown>[]
  /** Server only: the resources this pass has values for. Client: a tick's cancelled hydrate runs, false once a real one is among them. */
  got?: number
  probe?: boolean | undefined
  /** Resources outside any Boundary: `settle()` waits for them, since they have nowhere to stream to. */
  top?: Promise<unknown>[]
  resolve?: (v: unknown) => string
  /** Server only: fetches in flight by resource key, so a later render pass waits on them instead of refetching. */
  flight?: Map<string, Promise<unknown>>
  /** Server only, streaming: each resolved Boundary's content HTML by key; pending ones wrap their fallback in markers. */
  stream?: Map<string, string>
  /** The state payload of the page being hydrated: each scope takes its entry once, as it's created (research 29 §2). */
  state?: Record<string, Record<string, unknown>> | undefined
  /** A server process (@weft-js/start): a scope reached outside a render throws S002 instead of sharing one app. */
  isolated?: boolean
  /** @weft-js/core/test: slot overrides for this render (`render(App, {}, { slots })`), so a slot needs no generated module. */
  slots?: Record<string, unknown> | undefined
} = { server: false }

/** What the server hands the client: resolved resources, boundary states and changed state boxes. */
export type SsrData = { r: Record<string, { v?: unknown; e?: string }>; b: Record<string, 'c' | 'p' | 'e'>; /** The page is still streaming: the client may start before its Boundaries land. */ w?: 1; /** `defineState` boxes that differ from `init`, by scope */ s?: Record<string, Record<string, unknown>> }

/** Reactive work counter, read by `@weft-js/core/test` (`toTouchAtMost(n, { runs })`). */
export const stats = { runs: 0 }

/** The empty list every graph list starts as (never written: `add` replaces it). */
export const NONE: never[] = []

/**
 * `list` with `x` appended. Graph lists are mostly 1–3 long, and V8's first `push` reserves 17 slots, so short
 * lists are copied at their exact size (memory: research 19 §5.8).
 */
function add<T>(list: T[], x: T): T[] {
  const n = list.length
  if (LITERAL && !n) return [x]
  if (LITERAL && n === 1) return [list[0]!, x]
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
  for (let i = 0; i < o.length; i++) mark(o[i]!, state)
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
  for (let i = s.length - 1; i >= rest; i--) drop(s[i]!, node)
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
      for (let c = node.owned as Computation; ; c = c.sib!) {
        dispose(c)
        if (c === end) break
      }
      node.tail = null
    } else for (const c of node.owned as Computation[]) dispose(c)
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
      if (typeof v === 'function') settle(computation(v as () => unknown, 2, node.a, node.h))
      else parts(v as unknown[], node)
    } else if (node.a) {
      listener = null
      node.a(v, node.v, node.h)
      node.v = v
    } else if (!Object.is(v, node.v)) {
      node.v = v
      if (INLINE && node.f) node.f.state = DIRTY
      const o = node.o
      for (let i = 0; i < o.length; i++) o[i]!.state = DIRTY
    }
  } catch (e) {
    if (DEV && node.n && e && typeof e === 'object' && !(e as { weft?: string }).weft) (e as { weft?: string }).weft = node.n // where it threw
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
 * A live list (`<Card>{cond ? <A /> : <B />}<Row /></Card>` gives Card's children as one, and a fragment's parts can hold
 * a component's `children`, itself a list with live parts): each live part gets a level of its own, as a lone function
 * does, and writes its slot; the hole gets the whole list. One level reading every part would call them all again when
 * any changed, and rebuild what they made: a Boundary swapping its content in would make itself anew, pending again.
 */
function parts(v: unknown[], node: Computation) {
  const out = v.slice()
  let ready = false
  const put = () => node.a!(out.slice(), undefined, node.h)
  for (let i = 0; i < v.length; i++) {
    const x = v[i]
    if (live(x)) settle(computation(typeof x === 'function' ? x as () => unknown : () => x, 2, y => { out[i] = y; if (ready) put() }))
  }
  ready = true
  untrack(put)
}

const live = (v: unknown): boolean => typeof v === 'function' || (Array.isArray(v) && v !== flat && v.some(live))

/** The last row list made of single elements (@weft-js/core/dom `For`): nothing in it is live, and `place` can take it as it is. */
export let flat: unknown = NONE
/** Records the list `place` may take whole: see `flat`. */
export const setFlat = (list: unknown) => { flat = list }

function adopt(node: Computation) {
  if (!CHAIN) owner!.owned = add((owner!.owned ?? NONE) as Computation[], node)
  else {
    const t = owner!.tail
    node.sib = t! // back, while it's the last: `settle` can take it off again
    if (t) t.sib = node
    else owner!.owned = node
    owner!.tail = node
  }
}

function computation(fn: Computation['fn'], kind: 0 | 1 | 2, a?: Computation['a'], h?: unknown): Computation {
  const node: Computation = {
    fn, v: undefined, f: undefined, o: NONE, p: undefined, s: NONE, state: DIRTY, effect: kind, a, h, id: nextId++,
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
      const due = !ORDERED || mixed ? queue.sort((a, b) => a.id - b.id) : queue
      mixed = false
      last = 0
      queue = []
      for (let i = 0; i < due.length; i++) update(due[i]!)
    }
    runMounts() // the DOM is placed now; a callback's writes queue more work, applied in this same flush
  } while (queue.length)
}

/** Run pending `onMount` callbacks (in creation order). @weft-js/core/dom calls it once `render`/`hydrate` placed the app. */
export function runMounts() {
  while (mounts.length) {
    const due = mounts
    mounts = []
    for (const f of due) f()
  }
}

/** A box: a value that readers re-run on. */
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

/** How a box is kept: where it persists, whether tabs share it, and whether undo sees it. */
export interface StateOptions<T> {
  /** Persist through reloads (§4.5). Only inside `defineState`. The short form takes primitive `init` only. */
  persist?: 'local' | 'session' | 'cookie' | 'memory' | {
    in: 'local' | 'session' | 'cookie' | 'memory'
    /** Required for object and array values: a Standard Schema (Zod, Valibot, ArkType). */
    schema?: StandardSchema<T>
    version?: number
    migrate?: Record<number, (old: never) => unknown>
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

/** A value computed from boxes: lazy, cached, and read-only. */
export interface Derived<T> {
  readonly value: T
}

/** Set by `defineState` while a setup runs, to collect the boxes it creates. */
export let collecting: Box<unknown>[] | null = null
/** Runs `fn` and returns what it returned, with every box it created. */
export function collect<T>(fn: () => T): [T, Box<unknown>[]] {
  const prev = collecting, boxes: Box<unknown>[] = (collecting = [])
  try { return [fn(), boxes] } finally { collecting = prev }
}

/** True for an object literal: one whose own keys are all there is to compare. */
export const plain = (x: unknown) => Object.getPrototypeOf(x ?? 0) === Object.prototype

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
  declare h?: ((box: Box<unknown>, prev: unknown) => void) | undefined
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
    const prev = this.v
    if (Object.is(prev, v)) return
    this.v = v
    if (this.k) keyed!(this, prev, v)
    reach(this, DIRTY)
    schedule()
    if (this.h) this.h(this, prev)
  }
}

/** A box that follows `source` until written, and says when the source moved under a local edit. */
export interface Linked<T> extends State<T> {
  /** With `key`: the source moved under a local edit. `theirs` is its value now, `base` the one the edit started from. */
  readonly conflict: Derived<{ theirs: T; base: T } | undefined>
}

/** A box. `.linked`, `.get` and `.set` come with @weft-js/core/keyed, which the `weft` entry and the Vite plugin bring in. */
export const state: {
  <T>(init: T, options?: StateOptions<T>): State<T>
  linked<T>(source: () => T, options?: { key: () => unknown }): Linked<T>
} = ((init: unknown, options?: StateOptions<unknown>) => new Box(init, options)) as unknown as typeof state

/** The object `derived` returns: a computation with a `value`. */
export class Memo<T> implements Derived<T> {
  constructor(public node: Computation) {}
  get value(): T {
    update(this.node)
    if (this.node.p || this.node.s !== NONE) read(this.node) // read nothing, so nothing can change it
    return this.node.v as T
  }
}

/** Dev only: named boxes and derived values that are alive now, for the graph (@weft-js/core/devtools). */
export const named = new Set<Box<unknown> | Computation>()

/**
 * Dev builds: the compiler wraps component `state`/`derived` as `name(state(0), "Cart.count")`. The graph
 * (`weft browser snapshot`, the overlay) shows the value under that name; the entry goes when its owner does.
 */
export function name<T>(value: T, label: string): T {
  if (!DEV) return value
  const node = value instanceof Box ? value : value instanceof Memo ? value.node : null
  if (!node) return value
  if (!(node instanceof Box) || !node.n) node.n = label
  ;(node as { c?: unknown }).c = devComponent.label
  ;(node as { i?: unknown }).i = devComponent.id
  named.add(node)
  onCleanup(() => named.delete(node))
  return value
}

/** A value computed by `fn`: it recomputes when something it read changed and it's read again. */
export function derived<T>(fn: () => T): Derived<T> {
  if (fixed()) return new Once(fn)
  return new Memo(computation(fn, 0))
}

/** Accessor form used by compiled code (`memo`). */
export function memo<T>(fn: () => T): () => T {
  if (fixed()) return once(() => untrack(fn))
  const d = derived(fn)
  return () => d.value
}

/**
 * A server render's own derived values can't move: the render reads them in one go and is thrown away. No node, then.
 * One made outside a render (a module's) or in a `defineState` setup (a store, read across renders) stays live.
 */
const fixed = () => rt.server && owner !== null && collecting === null

/** A derived value on a server render: worked out once, when first read, like a memo's first run. */
class Once<T> implements Derived<T> {
  private done = false
  private v!: T
  constructor(private fn: () => T) {}
  get value(): T {
    if (!this.done) {
      this.v = untrack(this.fn)
      this.done = true
    }
    return this.v
  }
}

/**
 * Side effects only. `source` is tracked; `act` is not. `act` may return a cleanup, called before the next run
 * and when the owner is disposed.
 */
export function watch<T>(source: () => T, act: (value: T, prev: T | undefined) => void | (() => void)) {
  let cleanup: void | (() => void)
  let prev: T | undefined
  effect(source, value => {
    if (cleanup) cleanup()
    cleanup = untrack(() => act(value, prev))
    prev = value
  })
  onCleanup(() => cleanup && cleanup())
}

/** Compiled binding: `compute` is tracked, `apply(value, prev)` writes the DOM. Runs once now; never on the server. */
export function effect<T>(compute: (prev?: T) => T, apply: (value: T, prev: T | undefined) => void, options?: EffectOptions) {
  if (rt.server) return
  const node = computation(compute as Computation['fn'], 1, apply as Computation['a'])
  if (DEV && options?.name) node.n = `${options.name} (${options.loc})${node.n ? ` in ${node.n}` : ''}`
  settle(node)
}

/** First run. A node that read nothing reactive and owns nothing can never re-run: its owner drops it (memory). */
function settle(node: Computation) {
  run(node)
  const done = !node.p && node.s === NONE && !node.owned
  if (done && !node.cleanups && owner) {
    if (!CHAIN) {
      if ((owner.owned as Computation[] | null)?.[(owner.owned as Computation[]).length - 1] === node) (owner.owned as Computation[]).pop()
    } else if (owner.tail === node) {
      owner.tail = node.sib
      if (!node.sib) owner.owned = null
    }
  }
  return done
}

/** A child hole (@weft-js/core/dom `insert`): `value` is tracked and unwrapped (functions called), `apply` places it. True: it read nothing, so it's done. */
export function hole<H>(value: () => unknown, apply: (value: unknown, was: unknown, h: H) => void, h?: H) {
  if (rt.server) return false
  return settle(computation(value, 2, apply as Computation['a'], h))
}

/** Runs `fn` when the current owner is disposed, or before it runs again. */
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
  const mine = owner
  let alive = true
  onCleanup(() => { alive = false })
  mounts.push(() => { if (alive) within(mine!, fn) })
  schedule()
}

/** Runs `fn` with no reader, so what it reads subscribes nothing. */
export function untrack<T>(fn: () => T): T {
  const prev = listener
  listener = null
  try {
    return fn()
  } finally {
    listener = prev
  }
}

/** Runs `fn`. Writes are always batched until the flush; this says so at the call. */
export function batch<T>(fn: () => T): T {
  return fn()
}

/** The owner of what's being created now, if any. */
export function getOwner() {
  return owner
}

/** Runs `fn` under a new owner that outlives its caller; `dispose` ends it and all it owns. */
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

/** A value a subtree reads without props: `provide` sets it below an owner, `use` reads the nearest. */
export function context<T>(fallback?: T) {
  const id = Symbol()
  return {
    provide<R>(value: T, fn: () => R): R {
      const parent = owner
      return createRoot(end => {
        if (parent) (parent.cleanups ??= []).push(end) // the subtree goes when its parent does
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
  return () => (done ? v : ((v = fn()), (done = true), v))
}

/**
 * A live view of `sources` merged (later wins), without the `skip` keys. A source is an object, or a getter for one
 * (a spread of a prop), which may be undefined (`{...rest.attrs}`). `mergeProps` and `omit` are both views.
 */
export function view(sources: unknown[], skip: string[] = []): Record<PropertyKey, unknown> {
  if (rt.server && sources.length === 1) return seen(sources[0], skip)
  // A server renders once and nothing it reads can move: a getter (a `restOf` copy, so every prop) runs once, not per read.
  if (rt.server) sources = sources.map(s => (typeof s === 'function' ? once(s as () => unknown) : s))
  const open = (s: unknown): Record<PropertyKey, unknown> => Object(typeof s === 'function' ? s() : s)
  const kept = (k: PropertyKey) => !skip.includes(k as string)
  // Which source holds each key, later winning, in the order keys were first met. Once on a server, for the same reason.
  let held: Map<PropertyKey, Record<PropertyKey, unknown>> | undefined
  const owners = () => {
    if (held) return held
    const map = new Map<PropertyKey, Record<PropertyKey, unknown>>()
    for (const s of sources) {
      const o = open(s)
      for (const k of Reflect.ownKeys(o)) if (kept(k)) map.set(k, o)
    }
    if (rt.server) held = map
    return map
  }
  return new Proxy({}, {
    get(_, k) {
      if (rt.server) {
        const o = owners().get(k)
        if (o) return o[k]
      }
      if (kept(k))
        for (let i = sources.length - 1; i >= 0; i--) {
          const s = open(sources[i])
          if (k in s) return s[k]
        }
      return undefined
    },
    has: (_, k) => kept(k) && sources.some(s => k in open(s)),
    ownKeys: () => [...owners().keys()] as (string | symbol)[],
    getOwnPropertyDescriptor: (_, k) => (kept(k) && (!rt.server || owners().has(k)) ? { configurable: true, enumerable: true } : undefined),
  })
}

/** A server's view of one source: itself, when nothing is left out, or a thin view that only drops `skip`. */
function seen(source: unknown, skip: string[]): Record<PropertyKey, unknown> {
  const s = typeof source === 'function' ? once(source as () => unknown) : source
  const open: () => Record<PropertyKey, unknown> = typeof s === 'function' ? () => Object(s()) : () => Object(s)
  if (!skip.length && typeof s !== 'function') return open()
  return new Proxy({}, {
    get: (_, k) => (skip.includes(k as string) ? undefined : open()[k]),
    has: (_, k) => !skip.includes(k as string) && k in open(),
    ownKeys: () => Reflect.ownKeys(open()).filter(k => !skip.includes(k as string)),
    getOwnPropertyDescriptor: (_, k) => (!skip.includes(k as string) && Object.hasOwn(open(), k) ? { configurable: true, enumerable: true } : undefined),
  })
}

export { localProps } from './linked'

/**
 * `<Card person={bind(name)} />`: `person` reads the box, and a write in `Card` reaches it. Without this, a child's
 * writes stay in the child. The compiler reads the call; this is its value where nothing compiled it.
 */
export const bind = <T>(box: State<T>): T => box.value

/** A live view of `props` without `keys` (`({ a, ...rest }) =>`, §3.3). */
export const omit = <P extends object, K extends PropertyKey>(props: P, keys: K[]) => view([props], keys as string[]) as Omit<P, K>

/** `<div {...rest}>`: a plain copy of `props` without `keys`, read where the element's spread reads its attributes. */
export function restOf<P extends object>(props: P, keys: string[]) {
  const out: Record<string, unknown> = {}
  // Not `for in`: over a view (a Proxy) it asks for every key's descriptor and walks the prototype, which costs more than the copy.
  for (const k of Reflect.ownKeys(props)) if (typeof k === 'string' && !keys.includes(k)) out[k] = (props as Record<string, unknown>)[k]
  return out
}

export { Boundary, resource, type Resource, type ResourceOptions } from './async'
export { defineState, StateError, type ScopeHandle, type History, type HistoryEntry } from './scope'

/** A component's props, for the rare case inference doesn't cover: `Props<typeof Button>`. Types only. */
export type Props<C> = C extends (props: infer P, ...rest: never[]) => unknown ? P : never
