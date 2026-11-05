import {
  DIRTY,
  DEV,
  NONE,
  rt,
  devComponent,
  owner,
  keyed,
  read,
  reach,
  schedule,
  update,
  computation,
  settle,
  untrack,
} from './graph'
import { onCleanup } from './lifecycle'
import { once } from './view'
import type {
  Source,
  Computation,
  State,
  StateOptions,
  Derived,
  Linked,
  EffectOptions,
} from './types'

/** Set by `defineState` while a setup runs, to collect the boxes it creates. */
export let collecting: Box<unknown>[] | null = null
/** Runs `fn` and returns what it returned, with every box it created. */
export function collect<T>(fn: () => T): [T, Box<unknown>[]] {
  const prev = collecting,
    boxes: Box<unknown>[] = (collecting = [])
  try {
    return [fn(), boxes]
  } finally {
    collecting = prev
  }
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
  get value() {
    read(this)
    return this.v
  }
  set value(v: T) {
    this.w(v)
  }
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

/** A box. `.linked`, `.get` and `.set` come with @weft-js/core/keyed, which the `weft` entry and the Vite plugin bring in. */
export const state: {
  <T>(init: T, options?: StateOptions<T>): State<T>
  linked<T>(source: () => T, options?: { key: () => unknown }): Linked<T>
} = ((init: unknown, options?: StateOptions<unknown>) =>
  new Box(init, options)) as unknown as typeof state

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
export function watch<T>(
  source: () => T,
  act: (value: T, prev: T | undefined) => void | (() => void),
) {
  let cleanup: void | (() => void)
  let prev: T | undefined
  effect(source, (value) => {
    if (cleanup) cleanup()
    cleanup = untrack(() => act(value, prev))
    prev = value
  })
  onCleanup(() => cleanup && cleanup())
}

/** Compiled binding: `compute` is tracked, `apply(value, prev)` writes the DOM. Runs once now; never on the server. */
export function effect<T>(
  compute: (prev?: T) => T,
  apply: (value: T, prev: T | undefined) => void,
  options?: EffectOptions,
) {
  if (rt.server) return
  const node = computation(compute as Computation['fn'], 1, apply as Computation['a'])
  if (DEV && options?.name)
    node.n = `${options.name} (${options.loc})${node.n ? ` in ${node.n}` : ''}`
  settle(node)
}
