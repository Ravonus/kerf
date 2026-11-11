import { CHAIN, INLINE, LITERAL, MICRO, ORDERED, POP, REUSE } from '../flags'
import type { Box } from './state'
import type { Source, Owner, Computation, SsrData } from './types'

const CLEAN = 0,
  CHECK = 1
/** A node's value is out of date: it recomputes the next time it's read or flushed. */
export const DIRTY = 2
/** `effect` of a disposed node: it never runs again, and there's no field for it on the live ones. */
const DEAD = 3

/** Dev build: diagnostic text, dev names and dev-only checks. Vite folds it to `false` in production builds. */
export const DEV: boolean = (import.meta as { env?: { DEV?: boolean } }).env?.DEV !== false

/** Dev only: the component being created (`createComponent(Comp, props, name, loc)`), for binding names. */
export const devComponent: { label?: string | undefined; id?: number | undefined } = {}

/** The computation reading right now: whatever it reads, it subscribes to. */
export let listener: Computation | null = null
export let owner: Owner | null = null
let nextId = 0
/** How many of `listener.s` this run has read again, in order. Those links stay as they are. */
let at = 0
let queue: Computation[] = []
/** @kerf/core/keyed: tells a box's entry readers about a write. */
export let keyed: ((box: Box<unknown>, prev: unknown, v: unknown) => void) | undefined
/** Hands the core its entry-reader update, so an app that never calls `get` doesn't ship it. */
export const setKeyed = (f: typeof keyed) => {
  keyed = f
}
/** The newest queued effect's id, and whether one came out of creation order. */
let last = 0
let mixed = false
/** A flush is on the microtask queue. */
let scheduled = false
/** `onMount` callbacks waiting for their nodes to be placed: run after `render` and at the end of each `flush`. */
export let mounts: (() => void)[] = []

/** SSR and hydration switches: `server` skips effects (@kerf/core/ssr); `data` is the page's server data (@kerf/core/dom hydrate). */
export const rt: {
  server: boolean
  /** The render's data: resolved resources and boundary states by key, written by the server, read by hydrate. */
  data?: SsrData | undefined
  /** Server only: fetches the current render started, and a hole resolver (@kerf/core/ssr). */
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
  /** A server process (@kerf/start): a scope reached outside a render throws S002 instead of sharing one app. */
  isolated?: boolean
  /** @kerf/core/test: slot overrides for this render (`render(App, {}, { slots })`), so a slot needs no generated module. */
  slots?: Record<string, unknown> | undefined
} = { server: false }

/** Reactive work counter, read by `@kerf/core/test` (`toTouchAtMost(n, { runs })`). */
export const stats = { runs: 0 }

/** The empty list every graph list starts as (never written: `add` replaces it). */
export const NONE: never[] = []

/**
 * `list` with `x` appended. Graph lists are mostly 1–3 long, and V8's first `push` reserves 17 slots, so short
 * lists are copied at their exact size (memory: research 19 §5.8).
 */
export function add<T>(list: T[], x: T): T[] {
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
    const s = l.s,
      r = INLINE ? at - 1 : at
    if (REUSE && s[r] === node) at++
    else if (l.p !== node && (!r || r > 8 || s.lastIndexOf(node, r - 1) < 0)) {
      // short lists don't hold one box twice
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

export function schedule() {
  if (!scheduled && (queue.length || mounts.length)) {
    scheduled = true
    queueMicrotask(
      MICRO
        ? () => {
            scheduled = false
            flush()
          }
        : flush,
    )
  }
}

/** Take `node` off its sources from `from` on. */
function unlink(node: Computation, from: number) {
  const s = node.s,
    rest = INLINE && from ? from - 1 : from
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
  const prevListener = listener,
    prevOwner = owner,
    prevAt = at
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
    if (DEV && node.n && e && typeof e === 'object' && !(e as { kerf?: string }).kerf)
      (e as { kerf?: string }).kerf = node.n // where it threw
    throw e
  } finally {
    if (at < node.s.length + (INLINE && node.p ? 1 : 0)) unlink(node, at) // what this run didn't read
    listener = prevListener
    owner = prevOwner
    at = prevAt
  }
  node.state = CLEAN
}

export function update(node: Computation) {
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
    if (live(x))
      settle(
        computation(typeof x === 'function' ? (x as () => unknown) : () => x, 2, (y) => {
          out[i] = y
          if (ready) put()
        }),
      )
  }
  ready = true
  untrack(put)
}

const live = (v: unknown): boolean =>
  typeof v === 'function' || (Array.isArray(v) && v !== flat && v.some(live))

/** The last row list made of single elements (@kerf/core/dom `For`): nothing in it is live, and `place` can take it as it is. */
export let flat: unknown = NONE
/** Records the list `place` may take whole: see `flat`. */
export const setFlat = (list: unknown) => {
  flat = list
}

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

export function computation(
  fn: Computation['fn'],
  kind: 0 | 1 | 2,
  a?: Computation['a'],
  h?: unknown,
): Computation {
  const node: Computation = {
    fn,
    v: undefined,
    f: undefined,
    o: NONE,
    p: undefined,
    s: NONE,
    state: DIRTY,
    effect: kind,
    a,
    h,
    id: nextId++,
    owned: null,
    tail: null,
    sib: null,
    cleanups: null,
    owner,
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

/** Run pending `onMount` callbacks (in creation order). @kerf/core/dom calls it once `render`/`hydrate` placed the app. */
export function runMounts() {
  while (mounts.length) {
    const due = mounts
    mounts = []
    for (const f of due) f()
  }
}

/** First run. A node that read nothing reactive and owns nothing can never re-run: its owner drops it (memory). */
export function settle(node: Computation) {
  run(node)
  const done = !node.p && node.s === NONE && !node.owned
  if (done && !node.cleanups && owner) {
    if (!CHAIN) {
      if (
        (owner.owned as Computation[] | null)?.[(owner.owned as Computation[]).length - 1] === node
      )
        (owner.owned as Computation[]).pop()
    } else if (owner.tail === node) {
      owner.tail = node.sib
      if (!node.sib) owner.owned = null
    }
  }
  return done
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

/** Run `fn` untracked with `root` as its owner: a root the caller made (For's rows are their own roots). */
export function within<T>(root: Owner, fn: () => T): T {
  const prevOwner = owner,
    prevListener = listener
  owner = root
  listener = null
  try {
    return fn()
  } finally {
    owner = prevOwner
    listener = prevListener
  }
}
