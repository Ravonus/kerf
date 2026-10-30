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

import { DEV, context, createRoot, derived, effect, getOwner, memo, onCleanup, rt, state, untrack, watch, type State } from './index'
import { keys, nextKey, under } from './keys'

export const timing = { showAfter: 150, hold: 400 }

export interface Resource<T> {
  readonly value: T | undefined
  /** A fetch is in flight (the first or a refresh). */
  readonly pending: boolean
  readonly error: unknown
  /** Fetch again. The current value stays until the new one lands. */
  refresh(): void
}

type Tracked = { first: State<boolean>; err: State<unknown>; refresh(): void }
const boundaries = context<{ add(r: Tracked): void } | undefined>(undefined)

const thenable = (v: any): v is PromiseLike<any> => v != null && typeof v.then === 'function'
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * `resource(async signal => (await fetch(url(), { signal })).json())`. Reads before the first `await` are tracked:
 * when they change, the in-flight fetch is aborted and a new one starts. Reads after an `await` are not (W012).
 */
export function resource<T>(fetcher: (signal: AbortSignal) => Promise<T> | T, options: { initial?: T } = {}): Resource<T> {
  const data = rt.data
  const key = keys.on ? nextKey() : undefined
  const value = state<T | undefined>(options.initial)
  const pending = state(false)
  const error = state<unknown>(undefined)
  const first = state(true)
  const version = state(0)
  const refresh = () => void version.value++
  boundaries.use?.add({ first, err: error, refresh })

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

  if (rt.server) {
    const flying = key !== undefined ? rt.flight?.get(key) : undefined
    if (flying && !saved) {
      pending.value = true // an earlier pass started it: wait on that fetch, don't start another
      rt.wait?.push(flying)
    } else if (!saved && key !== undefined && data) {
      const record = (r: { v?: unknown; e?: string }) => void (data.r[key] = r)
      try {
        const out = untrack(() => fetcher(new AbortController().signal))
        if (thenable(out)) {
          pending.value = true
          const done = Promise.resolve(out).then(v => record({ v }), e => record({ e: message(e) }))
          rt.flight?.set(key, done)
          rt.wait?.push(done)
        } else {
          settle(out)
          record({ v: out })
        }
      } catch (e) {
        fail(e)
        record({ e: message(e) })
      }
    }
  } else {
    let ctrl: AbortController | undefined
    let hydrated = !!saved
    effect(
      () => {
        version.value
        ctrl?.abort()
        const c = (ctrl = new AbortController())
        let out: Promise<T> | T
        try { out = fetcher(c.signal) } catch (e) { out = Promise.reject(e) }
        return [out, c] as const
      },
      ([out, c]) => {
        if (hydrated) {
          // The server's value stands. This run only tracked the fetcher's reads; its fetch is cancelled.
          hydrated = false
          c.abort()
          if (thenable(out)) Promise.resolve(out).catch(() => {})
          return
        }
        if (!thenable(out)) return settle(out)
        pending.value = true
        Promise.resolve(out).then(
          v => { if (c === ctrl && !c.signal.aborted) settle(v) },
          e => { if (c === ctrl && !c.signal.aborted) fail(e) },
        )
      },
    )
    onCleanup(() => ctrl?.abort())
  }

  return {
    get value() { return value.value },
    get pending() { return pending.value },
    get error() { return error.value },
    refresh,
  }
}

/**
 * `<Boundary pending={<Skeleton />} error={(e, retry) => …}>…</Boundary>`. Without `error`, a failure renders
 * nothing (dev builds log it).
 */
export function Boundary(props: { pending?: any; error?: (e: unknown, retry: () => void) => any; children?: any }) {
  const parent = getOwner()
  const list: Tracked[] = []
  const added = state(0)
  const thrown = state<unknown>(undefined)
  const track = { add(r: Tracked) { list.push(r); untrack(() => added.value++) } }
  const loading = derived(() => (added.value, list.some(r => r.first.value && r.err.value === undefined)))
  const failure = derived(() => {
    added.value
    if (thrown.value !== undefined) return thrown.value
    for (const r of list) if (r.err.value !== undefined) return r.err.value
  })

  const key = keys.on ? nextKey() : undefined
  const data = rt.data
  const was = key !== undefined && !rt.server ? data?.b[key] : undefined
  if (was === 'e') thrown.value = new Error(data!.r[key!]?.e ?? 'server render failed')
  /** Run `fn` in the content (`c`) or fallback (`f`) scope while keys are on; fresh otherwise. */
  const scoped = <T,>(side: 'c' | 'f', fn: () => T): T => (keys.on && key !== undefined ? under(key + side + '/', fn) : fn())

  let content: any
  let disposeContent: (() => void) | undefined
  const build = () => {
    disposeContent?.()
    list.length = 0
    const { on, hydrating } = keys
    if (hydrating && was !== undefined && was !== 'c') Object.assign(keys, { on: false, hydrating: false }) // the server rendered a fallback: build the content fresh
    try {
      content = createRoot(dispose => scoped('c', () => {
        disposeContent = dispose
        return boundaries.provide(track, () => {
          try {
            const c = props.children
            return rt.server ? { t: rt.resolve!(c) } : c // resolve now: lazily created resources register here
          } catch (e) {
            if (DEV && e && typeof e === 'object' && (e as any).weft) console.error(`weft: <Boundary> caught an error in ${(e as any).weft}`)
            thrown.value = e
            return null
          }
        })
      }), parent)
    } finally {
      Object.assign(keys, { on, hydrating })
    }
  }
  build()

  const show = state<'wait' | 'fallback' | 'content'>('content')
  if (rt.server) {
    const status = untrack(() => (failure.value !== undefined ? 'e' : loading.value ? 'p' : 'c'))
    if (key !== undefined && data) {
      data.b[key] = status
      if (status === 'e') data.r[key] = { e: message(untrack(() => failure.value)) }
    }
    if (status === 'p') show.value = 'fallback'
    else if (status === 'c' && key !== undefined) rt.stream?.set(key, content?.t ?? '')
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined
    let shownAt = 0
    if (was === 'p') {
      show.value = 'fallback' // the server's fallback is on screen: hold it from now
      shownAt = Date.now()
    } else if (untrack(() => loading.value)) {
      show.value = 'wait'
      timer = setTimeout(() => {
        show.value = 'fallback'
        shownAt = Date.now()
      }, timing.showAfter)
    }
    watch(() => loading.value, busy => {
      if (busy || show.value === 'content') return
      clearTimeout(timer)
      const left = show.value === 'fallback' ? timing.hold - (Date.now() - shownAt) : 0
      if (left > 0) timer = setTimeout(() => (show.value = 'content'), left)
      else show.value = 'content'
    })
    onCleanup(() => clearTimeout(timer))
  }

  const retry = () => {
    if (untrack(() => thrown.value) !== undefined) {
      thrown.value = undefined
      build()
    }
    for (const r of list) if (untrack(() => r.err.value) !== undefined) r.refresh()
  }

  let side: { kind: 'p' | 'e'; node: any; dispose: () => void } | undefined
  const sideView = (kind: 'p' | 'e', make: () => any) => {
    if (side?.kind === kind && kind === 'p') return side.node
    side?.dispose()
    const s: { kind: 'p' | 'e'; node: any; dispose: () => void } = { kind, node: null, dispose: () => {} }
    s.node = createRoot(d => ((s.dispose = d), scoped('f', () => untrack(make))), parent)
    side = s
    return s.node
  }

  return memo(() => {
    const e = failure.value
    if (e !== undefined) {
      if (!props.error) {
        if (DEV) console.error('weft: <Boundary> without `error` caught', e)
        return null
      }
      return sideView('e', () => props.error!(e, retry))
    }
    const s = show.value
    if (s === 'fallback' && rt.stream && key !== undefined) {
      // Streaming: the fallback goes out between markers, and renderToStream sends the content to replace it.
      const k = encodeURIComponent(key)
      return { t: `<!--wb:${k}-->${rt.resolve!(sideView('p', () => props.pending))}<!--/wb:${k}-->` }
    }
    if (s === 'fallback') return sideView('p', () => props.pending)
    if (side) { side.dispose(); side = undefined }
    return s === 'content' ? content : null
  })
}
