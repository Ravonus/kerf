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
  /** A placeholder value of the result's type (research 31 §2): what a pending view sizes itself from. */
  readonly shape?: T
}

export interface ResourceOptions<T> {
  initial?: T
  /**
   * `false`: the value isn't written into the page's data or read back from it, because the caller's own cache
   * transfers it (@weft/start's query cache, research 27 §4). The fetcher is called on every server pass (return the
   * value synchronously once it's known) and during hydration (return the transferred value synchronously, so the
   * resource settles as it's created and hydration writes nothing).
   */
  data?: false
  /** Where `.shape` comes from, and what a shape variant asks for this resource by (`of`, research 31 §5). */
  shape?: { of: unknown; read(): T | undefined }
}

type Tracked = { first: State<boolean>; err: State<unknown>; refresh(): void; shape?: ResourceOptions<any>['shape'] }
const boundaries = context<{ add(r: Tracked): void } | undefined>(undefined)
/** While a Boundary's `pending` renders: the resources it's waiting for (weft/shape). */
export const waiting = context<Tracked[] | undefined>(undefined)

const thenable = (v: any): v is PromiseLike<any> => v != null && typeof v.then === 'function'
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * `resource(async signal => (await fetch(url(), { signal })).json())`. Reads before the first `await` are tracked:
 * when they change, the in-flight fetch is aborted and a new one starts. Reads after an `await` are not (W012).
 */
export function resource<T>(fetcher: (signal: AbortSignal) => Promise<T> | T, options: ResourceOptions<T> = {}): Resource<T> {
  const data = options.data === false ? undefined : rt.data
  const key = keys.on ? nextKey() : undefined
  const value = state<T | undefined>(options.initial)
  const pending = state(false)
  const error = state<unknown>(undefined)
  const first = state(true)
  const version = state(0)
  const refresh = () => void version.value++
  boundaries.use?.add({ first, err: error, refresh, shape: options.shape })

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
      fail(e)
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
          const done = Promise.resolve(out).then(v => record({ v }), e => record({ e: message(e) }))
          rt.flight?.set(key, done)
          rt.wait?.push(done)
          if (!boundaries.use) rt.top?.push(done)
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
    get shape() { return options.shape?.read() },
    refresh,
  }
}

/**
 * `<Boundary pending={<Skeleton />} error={(e, retry) => …}>…</Boundary>`. Without `error`, a failure renders
 * nothing (dev builds log it).
 */
export function Boundary(props: { pending?: any; /** What `pending="shape"` compiles to: a variant, its place reserved from the first paint. */ shape?: () => any; error?: (e: unknown, retry: () => void) => any; children?: any }) {
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
  const pendingView = () => waiting.provide(list, () => {
    const v = props.shape ? props.shape() : props.pending
    return rt.server ? { t: rt.resolve!(v) } : v
  })
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
      return { t: `<!--wb:${k}-->${rt.resolve!(sideView('p', pendingView))}<!--/wb:${k}-->` }
    }
    if (s === 'fallback' || (s === 'wait' && props.shape)) {
      // A shape holds its place unseen until the 150 ms are up, so showing it moves nothing (research 11 §7.4).
      const n = sideView('p', pendingView)
      if (props.shape && !rt.server) n.style.visibility = s === 'wait' ? 'hidden' : ''
      return n
    }
    if (side) {
      if (DEV && s === 'content' && side.kind === 'p') checkSwap(side.node, content)
      side.dispose()
      side = undefined
    }
    return s === 'content' ? content : null
  })
}

/** The border box around the elements of a rendered value (nodes, arrays of them), or undefined when it has none. */
function boxOf(value: unknown): { w: number; h: number } | undefined {
  let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit)
    if (typeof Element === 'undefined' || !(v instanceof Element) || !v.isConnected) return
    if (getComputedStyle(v).display === 'contents') return visit([...v.children]) // a shape variant's wrapper has no box
    const r = v.getBoundingClientRect()
    top = Math.min(top, r.top); left = Math.min(left, r.left); bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right)
  }
  visit(value)
  return top === Infinity ? undefined : { w: right - left, h: bottom - top }
}

/**
 * X031 (dev only, research 11 §8.5): at the swap, measure the `pending` fallback while it is still on screen and the
 * content once it is in, and warn when the boxes differ by more than 1 px (that difference is layout shift).
 */
function checkSwap(fallback: unknown, content: unknown) {
  if (rt.server) return
  const before = boxOf(fallback)
  if (!before) return
  queueMicrotask(() => {
    const after = boxOf(content)
    if (!after) return
    const dw = after.w - before.w, dh = after.h - before.h
    if (Math.abs(dw) > 1 || Math.abs(dh) > 1) {
      const px = (n: number) => `${Math.round(n * 10) / 10}`
      console.warn(`weft: X031 <Boundary> pending fallback was ${px(before.w)}×${px(before.h)} px, the content is ${px(after.w)}×${px(after.h)} px (Δ ${px(dw)}, ${px(dh)}): the swap shifts layout. Size the fallback like the content (warp's <Shape> with the content's counts), or fix the size.`)
    }
  })
}
