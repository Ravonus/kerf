import { DEV, flush, untrack, type State } from '@kerf-js/core'
import { client, peers } from '../router'
import { entries, entry, setBase, staleTags, relieve, cache, type Entry, type Layer } from './cache'
import { fnOf, fns, go, runtime, server } from './foundation'
import { FnError } from './primitives'
import { transport } from './transport'
import type { Answer, Fn, OptimisticCache } from './types'

export async function mutate(
  fn: Fn,
  input: unknown,
  calls: State<number>,
  error: State<unknown>,
  form?: true | FormData,
): Promise<unknown> {
  const scope = server()
  if (scope) return (await runtime.exec!.runMutation(scope, fn, input, [], !!form)).v
  const m = ++callId
  const touched = new Set<Entry>()
  let overlap = 0
  untrack(() => calls.value++)
  const drop = (e: Entry) => {
    e.layers.value = e.layers.value.filter((l) => l.m !== m)
  }
  const wait = (e: Entry) => {
    e.layers.value = e.layers.value.map((l) => (l.m === m ? { ...l, waiting: true } : l))
  }
  try {
    if (fn.def.optimistic) untrack(() => fn.def.optimistic!({ input }, overlay(m, touched)))
    const refresh = [...entries.values()]
      .filter((e) => e.readers > 0)
      .map((e) => [e.id, e.input] as [string, unknown])
    if (!open++) run++
    overlap = run
    const a = await settled(() => transport().mutate(fn.$id, input, refresh, form))
    if (a.x) client.sessionChanged?.()
    const out = applyResult({ fn, a, touched, m, overlap, error, drop, wait })
    if (a.t?.length) peers?.postMessage(a.t)
    if (a.x) peers?.postMessage(0)
    if (a.r !== undefined) {
      if (a.x) location.assign(a.r)
      else go(a.r)
    }
    return out
  } catch (err) {
    untrack(() => {
      for (const e of touched) {
        drop(e) // only this call's prediction goes
        if (overlap && (!(err instanceof FnError) || err.status >= 500)) e.held = true // the reply was lost, not the write: it may have landed
      }
      flush() // readers roll back now, not when the read below answers
      for (const e of touched) relieve(e)
      error.value = err
    })
    throw err
  } finally {
    untrack(() => calls.value--)
  }
}
function applyResult(o: {
  fn: Fn
  a: Answer
  touched: Set<Entry>
  m: number
  overlap: number
  error: State<unknown>
  drop: (e: Entry) => void
  wait: (e: Entry) => void
}) {
  const { fn, a, touched, m, overlap, error, drop, wait } = o
  let out: unknown
  untrack(() => {
    const refreshed = new Set<string>()
    const seen: Entry[] = []
    for (const w of a.c ?? []) {
      const e = entry(fns.get(w[0]) ?? ({ $id: w[0] } as Fn), w[1])
      refreshed.add(e.key)
      seen.push(e)
      // Replies don't say which came first, and one taken in arrival order can put back what a later call changed: where
      // calls overlap on an entry its layers stay, in order, and it reads once the last has answered.
      if (e.held || e.run === overlap || e.layers.value.some((l) => l.m !== m)) {
        e.held = true
        wait(e)
      } else {
        setBase(e, w[2], w[3])
        drop(e)
        e.run = overlap
      }
    }
    for (const e of touched) {
      if (refreshed.has(e.key)) continue
      // S011: the server sent no fresh value for an entry this call predicted. Keep the layer until the entry's
      // next value (refetched now) instead of flashing back to the old one.
      if (DEV && !e.tags.some((t) => a.t?.includes(t)))
        console.warn(
          `kerf: S011 \`${fn.$id}\`'s optimistic updated \`${e.key}\` (tags ${JSON.stringify(e.tags)}), but its invalidated tags ${JSON.stringify(a.t ?? [])} don't cover it: the prediction had no fresh value to land on.\n  fix: add one of its tags to \`invalidates\``,
        )
      wait(e)
      e.held = true
    }
    staleTags(a.t ?? [], refreshed)
    for (const e of seen) relieve(e)
    for (const e of touched) relieve(e)
    error.value = undefined
    out = a.v
  })
  return out
}

let callId = 0
/** Calls in flight, and which unbroken run of overlapping calls they belong to. */
let open = 0
let run = 0
const settled = async <T>(call: () => Promise<T>) => {
  try {
    return await call()
  } finally {
    open--
  }
}

/** The `cache` an `optimistic` gets: `update` and `set` add this call's layers instead of writing the base. */
function overlay(m: number, touched: Set<Entry>): OptimisticCache {
  const push = (q: unknown, input: unknown, apply: Layer['apply']) => {
    const e = entry(fnOf(q), input)
    touched.add(e)
    e.layers.value = [...e.layers.value, { m, apply }]
  }
  return {
    ...cache,
    update: (q, input, recipe) => push(q, input, recipe as Layer['apply']),
    set: (q, input, value) => push(q, input, () => value),
  }
}

export function resetMutation() {
  callId = open = 0
}
