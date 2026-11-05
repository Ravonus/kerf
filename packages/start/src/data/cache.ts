import { createRoot, derived, state, untrack, type Derived, type State } from '@weft-js/core'
import { client } from '../router'
import { fnOf, fns, go, net, registered, runtime, server } from './foundation'
import { FnError, isRedirect, keyOf, redirect } from './primitives'
import { isMade, produce, resetMade, share } from './draft'
import { transport } from './transport'
import type { Fn, OptimisticCache, QueryRef, Wire } from './types'

export interface Layer {
  m: number
  apply: (draft: unknown) => unknown
  waiting?: boolean
}
export interface Entry {
  key: string
  id: string
  input: unknown
  base: State<unknown>
  has: State<boolean>
  stale: State<boolean>
  layers: State<Layer[]>
  value: Derived<unknown>
  tags: string[]
  readers: number
  p?: Promise<unknown> | undefined
  /** The `clock` when `p` left. */
  since: number
  /** The `clock` when something newer than any read in flight reached the entry. */
  gen: number
  /** Which overlapping run of calls last landed a reply here. */
  run: number
  /** A value was turned away while layers were on it: it reads again once they're done. */
  held?: boolean
  /** When a server value last landed. */
  at: number
}

export const entries = new Map<string, Entry>()
/** Orders what reaches an entry: a read or a navigation that left before `gen` is older than what's there. */
export let clock = 0
/** When each tag was last invalidated: a value read before that is out of date, whether or not the cache held it then. */
const written = new Map<string, number>()
const passed = (tags: string[], since: number) => tags.some((t) => written.get(t)! > since)
/** Each query's latest entry: a skeleton for other args takes its shape (research 31 §4). */
export const lastSeen = new Map<string, Entry>()

export function entry(fn: Fn, input: unknown): Entry {
  if (!registered) net()
  const key = keyOf(fn.$id, input)
  let e = entries.get(key)
  if (e) {
    entries.delete(key) // the map is in order of use: `evict` starts from its far end
    entries.set(key, e)
  } else {
    // Owned by no component: the entry outlives its readers (the next reader finds it seeded).
    e = createRoot(() => {
      const base = state<unknown>(undefined),
        has = state(false),
        dated = state(false),
        layers = state<Layer[]>([])
      const value = derived(() => {
        let v = base.value
        if (!has.value) return v
        for (const l of layers.value) v = produce(v, l.apply)
        return v
      })
      return {
        key,
        id: fn.$id,
        input,
        base,
        has,
        stale: dated,
        layers,
        value,
        tags: [],
        readers: 0,
        since: 0,
        gen: 0,
        run: 0,
        at: 0,
      }
    }, null)
    entries.set(key, e)
    if (entries.size > ceiling) evict(e)
  }
  return e
}

const ENTRIES = 1000
/** When to look again: a quarter past what's left, so a page with thousands of readers doesn't walk them all per entry. */
let ceiling = ENTRIES
/** A search box writes an entry per keystroke for the tab's life. What nothing reads goes, least recently used first. `fresh` is about to get its reader. */
function evict(fresh: Entry) {
  for (const e of entries.values()) {
    if (entries.size <= ENTRIES) break
    if (
      e !== fresh &&
      !e.readers &&
      !e.p &&
      !untrack(() => e.layers.value.length) &&
      lastSeen.get(e.id) !== e
    )
      entries.delete(e.key)
  }
  ceiling = Math.max(ENTRIES, entries.size + (entries.size >> 2))
}

export const fresh = (e: Entry) => e.has.value && !e.stale.value

/** A prediction no reply has confirmed yet. */
export const predicted = (e: Entry) => e.layers.value.some((l) => !l.waiting)

export function load(e: Entry): Promise<unknown> {
  if (e.p && e.gen <= e.since) return e.p
  // What's read now may or may not hold the calls in flight, so it can't go under their layers: it waits for them.
  if (untrack(() => e.has.value && predicted(e))) {
    e.held = true
    return Promise.resolve(untrack(() => e.value.value))
  }
  const since = (e.since = clock)
  const p: Promise<unknown> = transport()
    .query(e.id, e.input)
    .then(
      (a) => {
        if (e.p === p) e.p = undefined
        tries = 0
        if (a.r !== undefined) {
          go(a.r, true)
          redirect(a.r)
        }
        const tags = a.t ?? []
        if (untrack(() => !e.has.value) && passed(tags, since)) return load(e) // a first load's tags come with its answer
        if (!land(e, a.v, tags, since)) {
          if (e.p) return e.p
          if (untrack(() => e.stale.value)) return load(e)
        }
        return untrack(() => e.value.value)
      },
      (err) => {
        if (e.p === p) e.p = undefined
        untrack(() => {
          if (!e.has.value) return
          if (err instanceof FnError && (err.status === 401 || err.status === 403)) forget(e)
          else if (!isRedirect(err) && (!(err instanceof FnError) || err.status >= 500)) retry()
        })
        throw err
      },
    )
  return (e.p = p)
}

/** The server refused this session, so the value may not be this user's any more: readers get the first-load error. */
function forget(e: Entry) {
  e.has.value = false
  e.base.value = undefined
  if (lastSeen.get(e.id) === e) lastSeen.delete(e.id)
}

/** How often a failed read is tried again, doubling, for as long as something on screen is out of date. */
const RETRY = 1000,
  RETRIES = 30_000
let again: ReturnType<typeof setTimeout> | undefined
let tries = 0

function retry() {
  if (again === undefined) again = setTimeout(owed, Math.min(RETRIES, RETRY * 2 ** tries++))
}

/** Read what readers are owed, once the tab can use it. `online` and a returning tab come here at once. */
export function owed() {
  clearTimeout(again)
  again = undefined
  // Off a browser `onLine` isn't there, and that isn't offline.
  if (globalThis.document?.hidden || (navigator as { onLine?: boolean }).onLine === false) return // `back` or `online` comes here
  untrack(() => {
    for (const e of entries.values())
      if (e.readers && e.has.value && e.stale.value && !e.p && !e.held && !predicted(e))
        load(e).catch(() => {})
  })
}

/** A read or a navigation's value lands, unless something newer got here after it left, or layers are on the entry. */
function land(e: Entry, v: unknown, tags: string[], since: number): boolean {
  return untrack(() => {
    if (e.gen > since) return false
    if (e.has.value && predicted(e)) return !(e.held = true)
    setBase(e, v, tags)
    return true
  })
}

/** Mark the entry out of date: a read already out is older than what it has to tell. */
export function outdate(e: Entry) {
  e.gen = ++clock
  e.stale.value = true
}

/** The layers that held a value off are gone: read once, now that every call behind them has answered. */
export function relieve(e: Entry) {
  if (!e.held || predicted(e)) return
  e.held = false
  outdate(e)
  load(e).catch(() => {})
}

/** A server value lands: shared with the old base, layers of settled calls dropped, readers updated in place. */
export function setBase(e: Entry, v: unknown, tags: string[]) {
  untrack(() => {
    e.gen = ++clock
    e.at = performance.now()
    e.tags = tags
    e.base.value = share(e.base.value, v)
    e.has.value = true
    e.stale.value = false
    lastSeen.set(e.id, e)
    if (e.layers.value.some((l) => l.waiting))
      e.layers.value = e.layers.value.filter((l) => !l.waiting)
  })
}

/** Seed the cache from the server (the page's `#weft-cache`, a navigation's `c`). `since`: when that navigation left. */
export function seed(list: Wire[] | null | undefined, since = Infinity) {
  for (const [id, input, v, tags] of list ?? []) {
    const e = entry(fns.get(id) ?? ({ $id: id } as Fn), input)
    if (land(e, v, tags, since) && passed(tags, since)) outdate(e)
  }
}

/** Mark entries with any of `tags` stale: entries with readers refetch now, the rest on their next read. */
export function staleTags(tags: string[], except: Set<string> = new Set()) {
  if (!tags.length) return
  ++clock
  for (const t of tags) {
    written.delete(t) // in order of use, like `entries`
    written.set(t, clock)
  }
  for (const t of written.keys()) {
    if (written.size <= ENTRIES) break
    written.delete(t)
  }
  untrack(() => {
    for (const e of entries.values())
      if (!except.has(e.key) && e.tags.some((t) => tags.includes(t))) outdate(e)
  })
  owed() // one a failed read left stale has nothing else to wake it
  client.invalidated?.(tags)
}

/**
 * The client cache. In `optimistic`, `update`/`set` add layers; elsewhere they write the base (until the next server
 * value). `invalidate` marks tags stale (readers refetch).
 */
export const cache: OptimisticCache & {
  invalidate(...tags: string[]): Promise<void> | undefined
  clear(): void
} = {
  update(q, input, recipe) {
    const e = entry(fnOf(q), input)
    if (untrack(() => e.has.value))
      setBase(
        e,
        produce(
          untrack(() => e.base.value),
          recipe as Layer['apply'],
        ),
        e.tags,
      )
  },
  set(q, input, value) {
    const e = entry(fnOf(q), input)
    setBase(e, value, e.tags)
  },
  get<O>(q: QueryRef<O>, input?: unknown) {
    const e = entries.get(keyOf(fnOf(q).$id, input))
    return e && (untrack(() => e.value.value) as O)
  },
  isOptimistic: (v) => !!v && typeof v === 'object' && isMade(v),
  invalidate(...tags) {
    const scope = server()
    if (scope) return runtime.exec!.invalidate(scope, tags)
    staleTags(tags)
    return undefined
  },
  clear() {
    entries.clear()
    lastSeen.clear()
    written.clear()
    ceiling = ENTRIES
    resetMade()
  },
}

export function resetRetry() {
  clearTimeout(again)
  again = undefined
  tries = 0
}

/** Server: drop `tags` for this response and the shared cache. Client: refetch what reads them. */
export const invalidate = (...tags: string[]) => cache.invalidate(...tags)
