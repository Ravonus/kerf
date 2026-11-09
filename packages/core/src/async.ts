// resource and <Boundary> (PLAN §3.1, §6.2). A resource is an async derived value; a Boundary shows `pending` while
// a resource beneath it has no value yet, and `error(e, retry)` when one fails or its children throw.
//
// Timing (§6.2): nothing for 150 ms, then the fallback, held at least 400 ms; the content swaps in whole. Refetches
// never bring the fallback back: only a resource's first value counts.
//
// SSR: the server renders the content if its resources resolved (`renderToStringAsync` waits for them) and the
// fallback if not, and writes resolved values and each boundary's state to the page's data. Hydration reads them
// back: a resolved resource starts with the server's value instead of fetching, and a boundary claims whichever
// side the server rendered. Both take a key where they're created (research 19 §2.4); a boundary's content and
// fallback render in two fixed scopes under it (`<key>c/`, `<key>f/`), so the keys line up either way.

import { effect, onCleanup, state, untrack, type State } from './index'
import { rt } from './index/graph'
import { keys, nextKey } from './keys'
import { boundaries } from './async/shared'
import type { Resource, ResourceOptions } from './async/types'

export { timing, waiting } from './async/shared'
export type { Resource, ResourceOptions } from './async/types'
export { Boundary } from './async/boundary'

/** A server render's: `shown` is a failure as a page may show it. */
type Pass = typeof rt & { shown?: (e: unknown) => unknown }

const thenable = (v: unknown): v is PromiseLike<unknown> =>
  v != null && typeof (v as PromiseLike<unknown>).then === 'function'
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * `resource(async signal => (await fetch(url(), { signal })).json())`. Reads before the first `await` are tracked:
 * when they change, the in-flight fetch is aborted and a new one starts. Reads after an `await` are not (W012).
 */
export function resource<T>(
  fetcher: (signal: AbortSignal) => Promise<T> | T,
  options: ResourceOptions<T> = {},
): Resource<T> {
  const data = options.data === false ? undefined : rt.data
  const key = keys.on ? nextKey() : undefined
  const value = state<T | undefined>(options.initial)
  const pending = state(false)
  const error = state<unknown>(undefined)
  const first = state(true)
  const version = state(0)
  const refresh = () => void version.value++
  boundaries.use?.add({ first, err: error, refresh, shape: options.shape })
  const pass = rt as Pass
  const shown = pass.shown ?? ((e: unknown) => e) // kept: a fetch fails after its pass has ended

  const settle = (v: T) => {
    value.value = v
    error.value = undefined
    pending.value = false
    first.value = false
  }
  const fail = (e: unknown) => {
    error.value = e
    pending.value = false
  }
  const saved = key !== undefined ? data?.r[key] : undefined
  if (saved) saved.e !== undefined ? fail(new Error(saved.e)) : settle(saved.v as T)

  if (rt.server && options.data === false) {
    try {
      const out = untrack(() => fetcher(new AbortController().signal))
      if (thenable(out)) {
        pending.value = true
        const done = Promise.resolve(out).catch(() => {})
        rt.wait?.push(done)
        if (!boundaries.use) rt.top?.push(done)
      } else settle(out)
    } catch (e) {
      fail(shown(e))
    }
  } else if (rt.server) {
    const flying = key !== undefined ? rt.flight?.get(key) : undefined
    if (flying && !saved) {
      pending.value = true // an earlier pass started it: wait on that fetch, don't start another
      rt.wait?.push(flying)
      if (!boundaries.use) rt.top?.push(flying)
    } else if (!saved && key !== undefined && data) {
      const record = (r: { v?: unknown; e?: string }) => void (data.r[key] = r)
      try {
        const out = untrack(() => fetcher(new AbortController().signal))
        if (thenable(out)) {
          pending.value = true
          const done = Promise.resolve(out).then(
            (v) => record({ v }),
            (e) => record({ e: message(shown(e)) }),
          )
          rt.flight?.set(key, done)
          rt.wait?.push(done)
          if (!boundaries.use) rt.top?.push(done)
        } else {
          settle(out)
          record({ v: out })
        }
      } catch (caught) {
        const e = shown(caught)
        fail(e)
        record({ e: message(e) })
      }
    }
  } else {
    clientFetch({ fetcher, saved, version, pending, settle, fail })
  }

  if (rt.server && pass.got !== undefined && !untrack(() => pending.value)) pass.got++

  return resourceView(value, pending, error, options, refresh)
}

function clientFetch<T>({
  fetcher,
  saved,
  version,
  pending,
  settle,
  fail,
}: {
  fetcher: (signal: AbortSignal) => Promise<T> | T
  saved: unknown
  version: State<number>
  pending: State<boolean>
  settle: (value: T) => void
  fail: (error: unknown) => void
}) {
  let ctrl: AbortController | undefined
  let hydrated = !!saved
  effect(
    () => {
      void version.value
      ctrl?.abort()
      const c = (ctrl = new AbortController())
      let out: Promise<T> | T
      if (rt.probe === undefined) setTimeout(() => (rt.probe = undefined))
      rt.probe = hydrated && rt.probe !== false
      try {
        out = fetcher(c.signal)
      } catch (e) {
        out = Promise.reject(e)
      }
      return [out, c] as const
    },
    ([out, c]) => {
      if (hydrated) {
        // The server's value stands. This run only tracked the fetcher's reads; its fetch is cancelled.
        hydrated = false
        c.abort()
        if (out instanceof Promise) out.catch(() => {})
        return
      }
      if (!thenable(out)) return settle(out)
      pending.value = true
      Promise.resolve(out).then(
        (v) => {
          if (c === ctrl && !c.signal.aborted) settle(v)
        },
        (e) => {
          if (c === ctrl && !c.signal.aborted) fail(e)
        },
      )
    },
  )
  onCleanup(() => ctrl?.abort())
}

function resourceView<T>(
  value: State<T | undefined>,
  pending: State<boolean>,
  error: State<unknown>,
  options: ResourceOptions<T>,
  refresh: () => void,
): Resource<T> {
  return {
    get value() {
      return value.value
    },
    get pending() {
      return pending.value
    },
    get error() {
      return error.value
    },
    get shape() {
      return options.shape?.read()
    },
    refresh,
  }
}
