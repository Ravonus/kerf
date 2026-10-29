// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
//
// Push-pull graph: a write marks observers DIRTY/CHECK; derived values recompute lazily when read;
// effects are queued and flushed in creation order (parents before children) on a microtask or by `flush()`.

const CLEAN = 0, CHECK = 1, DIRTY = 2

/** Dev build: diagnostic text, dev names and dev-only checks. Vite folds it to `false` in production builds. */
export const DEV: boolean = (import.meta as any).env?.DEV !== false

type Source = { v: any; o: Computation[] }

export interface Owner {
  owned: Computation[] | null
  cleanups: (() => void)[] | null
  owner: Owner | null
  context?: Record<symbol, unknown>
  /** Hydration id and child counter (SSR and hydration only, `rt.ids`); `t`: transparent, children count on the parent. */
  hk?: string
  hc?: number
  t?: boolean
}

interface Computation extends Source, Owner {
  fn: (prev: any) => any
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued) */
  effect: 0 | 1
  id: number
  dead?: true
  /** Dev name: the binding (`li.children`), its source location and the component it was created in. */
  n?: string
}

/** The options compiled bindings pass (`scope` from `scope()` holes; `name`/`loc` from the back end's `sourceNames`). */
export interface EffectOptions { scope?: boolean; name?: string; loc?: string }

/** Dev only: the component being created (`createComponent(Comp, props, name, loc)`), for binding names. */
export const devComponent: { label?: string } = {}

let listener: Computation | null = null
let owner: Owner | null = null
let nextId = 0
let queue: Computation[] = []
let scheduled = false

/** SSR and hydration switches: `ids` gives owners hydration ids, `server` skips effects (weft/ssr, weft/dom hydrate). */
export const rt: {
  ids: boolean
  server: boolean
  /** The render's data: resolved resources and boundary states by key, written by the server, read by hydrate. */
  data?: SsrData
  /** Server only: fetches the current render started, and a hole resolver (weft/ssr). */
  wait?: Promise<unknown>[]
  resolve?: (v: unknown) => string
} = { ids: false, server: false }

export type SsrData = { r: Record<string, { v?: unknown; e?: string }>; b: Record<string, 'c' | 'p' | 'e'>; n?: number }

/** The next hydration id under `o` (its nearest non-transparent ancestor): Solid 2's scheme, so keys match its output. */
export function childKey(o: Owner | null): string | undefined {
  while (o && o.t) o = o.owner
  if (!o || o.hk === undefined) return undefined
  const n = (o.hc = (o.hc ?? 0) + 1) - 1
  const num = n.toString(36)
  return o.hk + (num.length > 1 ? String.fromCharCode(63 + num.length) : '') + num
}

/** Reactive work counter, read by `weft/test` (`toTouchAtMost(n, { runs })`). */
export const stats = { runs: 0 }

function read(node: Source) {
  if (listener) {
    listener.s.push(node)
    node.o.push(listener)
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
  if (!scheduled && queue.length) {
    scheduled = true
    queueMicrotask(flush)
  }
}

function unlink(node: Computation) {
  for (const s of node.s) {
    const i = s.o.indexOf(node)
    if (i >= 0) s.o.splice(i, 1)
  }
  node.s = []
}

function clean(node: Owner) {
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
  if (node.hk !== undefined) node.hc = 0
  const prevListener = listener, prevOwner = owner
  listener = owner = node
  try {
    const v = node.fn(node.v)
    if (!Object.is(v, node.v)) {
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
      if (node.state === DIRTY) break
    }
  }
  if (node.state === DIRTY && !node.dead) {
    stats.runs++
    run(node)
  }
  node.state = CLEAN
}

function computation(fn: (prev: any) => any, effect: 0 | 1, init?: any, transparent?: boolean): Computation {
  const node: Computation = {
    fn, v: init, o: [], s: [], state: DIRTY, effect, id: nextId++,
    owned: null, cleanups: null, owner, context: owner?.context,
  }
  if (transparent) node.t = true
  else if (rt.ids) node.hk = childKey(owner)
  if (DEV && devComponent.label) node.n = devComponent.label
  if (owner) (owner.owned ??= []).push(node)
  return node
}

/** Apply pending effects and DOM updates now. */
export function flush() {
  scheduled = false
  while (queue.length) {
    const batch = queue.sort((a, b) => a.id - b.id)
    queue = []
    for (const node of batch) if (!node.dead) update(node)
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
  persist?: 'local' | 'session' | 'memory' | {
    in: 'local' | 'session' | 'memory'
    /** Required for object and array values: a Standard Schema (Zod, Valibot, ArkType). */
    schema?: StandardSchema<T>
    version?: number
    migrate?: Record<number, (old: any) => unknown>
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
  o: Computation[] = []
  /** Per-entry sources for `get(key)`. */
  k?: Map<PropertyKey, Source>
  /** Write hook: a scope's history, persistence and transactions. */
  h?: (box: Box<T>, prev: T) => void
  /** Dev name (`cart.note`). */
  n?: string
  constructor(v: T, public opts?: StateOptions<T>) {
    this.v = v
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
      if (!s) k.set(key, (s = { v: undefined, o: [] }))
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

/** A writable box that resets whenever `source` changes (a local copy of a prop). */
state.linked = <T>(source: () => T): State<T> => {
  const src = derived(source)
  const local = new Box<{ v: T; from: T } | undefined>(undefined)
  return {
    get value() {
      const from = src.value
      const l = local.value
      return l && Object.is(l.from, from) ? l.v : from
    },
    set value(v: T) { local.value = { v, from: src.value } },
    set(update) { const d: any = this.value; update(d); this.value = d },
    get(key) { return (this.value as any)?.[key] },
  }
}

export class Memo<T> implements Derived<T> {
  constructor(private node: Computation) {}
  get value(): T {
    update(this.node)
    read(this.node)
    return this.node.v
  }
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

/**
 * Compiled binding: `compute` is tracked, `apply(value, prev)` writes the DOM. Runs once now; never on the server.
 * `options.scope` (a `scope()` hole): the effect takes a hydration id of its own instead of counting on its owner's.
 */
export function effect<T>(compute: (prev?: T) => T, apply: (value: T, prev: T | undefined) => void, options?: EffectOptions) {
  if (rt.server) return
  let prev: T | undefined
  const node = computation(() => {
    const v = compute(prev)
    untrack(() => apply(v, prev))
    prev = v
  }, 1, undefined, !options?.scope)
  if (DEV && options?.name) node.n = `${options.name} (${options.loc})${node.n ? ` in ${node.n}` : ''}`
  run(node)
}

export function onCleanup(fn: () => void) {
  if (owner) (owner.cleanups ??= []).push(fn)
}

export function onMount(fn: () => void) {
  effect(() => {}, () => untrack(fn))
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

/** `key`: the root's hydration id (`''` for a render root); otherwise it takes the next one under `parent`. */
export function createRoot<T>(fn: (dispose: () => void) => T, parent: Owner | null = owner, key?: string): T {
  const root: Owner = { owned: null, cleanups: null, owner: parent, context: parent?.context }
  if (key !== undefined || rt.ids) root.hk = key ?? childKey(parent)
  const prevOwner = owner, prevListener = listener
  owner = root
  listener = null
  try {
    return fn(() => clean(root))
  } finally {
    owner = prevOwner
    listener = prevListener
  }
}

/** Run `fn` under `o` with no listener (weft/ssr's hole scopes). */
export function runWith<T>(o: Owner | null, fn: () => T): T {
  const prevOwner = owner, prevListener = listener
  owner = o
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

/** A live view of `props` without `keys` (`({ a, ...rest }) =>`, §3.3). */
export function omit<T extends object>(props: T, keys: string[]): any {
  return new Proxy(props, {
    get: (t, k) => (keys.includes(k as string) ? undefined : (t as any)[k]),
    has: (t, k) => !keys.includes(k as string) && k in t,
    ownKeys: t => Reflect.ownKeys(t).filter(k => !keys.includes(k as string)),
    getOwnPropertyDescriptor: (t, k) =>
      keys.includes(k as string) ? undefined : { configurable: true, enumerable: true, get: () => (t as any)[k] },
  })
}

export { Boundary, resource, type Resource } from './async'
export { defineState, StateError, type ScopeHandle, type History, type HistoryEntry } from './scope'
