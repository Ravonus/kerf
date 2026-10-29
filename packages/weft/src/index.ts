// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
//
// Push-pull graph: a write marks observers DIRTY/CHECK; derived values recompute lazily when read;
// effects are queued and flushed in creation order (parents before children) on a microtask or by `flush()`.

const CLEAN = 0, CHECK = 1, DIRTY = 2

type Source = { v: any; o: Computation[] }

export interface Owner {
  owned: Computation[] | null
  cleanups: (() => void)[] | null
  owner: Owner | null
  context?: Record<symbol, unknown>
}

interface Computation extends Source, Owner {
  fn: (prev: any) => any
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued) */
  effect: 0 | 1
  id: number
  dead?: true
}

let listener: Computation | null = null
let owner: Owner | null = null
let nextId = 0
let queue: Computation[] = []
let scheduled = false

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
  const prevListener = listener, prevOwner = owner
  listener = owner = node
  try {
    const v = node.fn(node.v)
    if (!Object.is(v, node.v)) {
      node.v = v
      for (const o of node.o) o.state = DIRTY
    }
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

function computation(fn: (prev: any) => any, effect: 0 | 1, init?: any): Computation {
  const node: Computation = {
    fn, v: init, o: [], s: [], state: DIRTY, effect, id: nextId++,
    owned: null, cleanups: null, owner, context: owner?.context,
  }
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
}

export interface Derived<T> {
  readonly value: T
}

class Box<T> implements State<T> {
  v: T
  o: Computation[] = []
  constructor(v: T) { this.v = v }
  get value() { read(this); return this.v }
  set value(v: T) { write(this, v) }
  set(update: (draft: T) => void) {
    const v: any = this.v
    const draft = Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? { ...v } : v
    update(draft)
    write(this, draft)
  }
}

export function state<T>(init: T): State<T> {
  return new Box(init)
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
  }
}

export function derived<T>(fn: () => T): Derived<T> {
  const node = computation(fn, 0)
  return {
    get value() {
      update(node)
      read(node)
      return node.v
    },
  }
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

/** Compiled binding: `compute` is tracked, `apply(value, prev)` writes the DOM. Runs once now. */
export function effect<T>(compute: (prev?: T) => T, apply: (value: T, prev: T | undefined) => void) {
  let prev: T | undefined
  const node = computation(() => {
    const v = compute(prev)
    untrack(() => apply(v, prev))
    prev = v
  }, 1)
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

export function createRoot<T>(fn: (dispose: () => void) => T, parent: Owner | null = owner): T {
  const root: Owner = { owned: null, cleanups: null, owner: parent, context: parent?.context }
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

export function context<T>(fallback?: T) {
  const id = Symbol()
  return {
    provide<R>(value: T, fn: () => R): R {
      return createRoot(() => {
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
