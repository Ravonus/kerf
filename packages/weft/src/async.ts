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

import { DEV, context, createRoot, derived, effect, getOwner, memo, onCleanup, rt, state, untrack, watch, type SsrData, type State } from './index'
import { keys, nextKey, under } from './keys'

export const timing = { showAfter: 150, hold: 400 }

/** An async value: what it holds now, whether a fetch is in flight, and how it last failed. */
export interface Resource<T> {
  readonly value: T | undefined
  /** A fetch is in flight (the first or a refresh). */
  readonly pending: boolean
  readonly error: unknown
  /** Fetch again. The current value stays until the new one lands. */
  refresh(): void
  /** A placeholder value of the result's type (research 31 §2): what a pending view sizes itself from. */
  readonly shape?: T | undefined
}

/** How a resource starts and transfers. */
export interface ResourceOptions<T> {
  initial?: T
  /**
   * `false`: the value isn't written into the page's data or read back from it, because the caller's own cache
   * transfers it (@weft-js/start's query cache, research 27 §4). The fetcher is called on every server pass (return the
   * value synchronously once it's known) and during hydration (return the transferred value synchronously, so the
   * resource settles as it's created and hydration writes nothing).
   */
  data?: false
  /** Where `.shape` comes from, and what a shape variant asks for this resource by (`of`, research 31 §5). */
  shape?: { of: unknown; read(): T | undefined }
}

type Tracked = { first: State<boolean>; err: State<unknown>; refresh(): void; shape?: ResourceOptions<unknown>['shape'] }
const boundaries = context<{ add(r: Tracked): void } | undefined>(undefined)
/** While a Boundary's `pending` renders: the resources it's waiting for (@weft-js/core/shape). */
export const waiting = context<Tracked[] | undefined>(undefined)

/** A server render's: `shown` is a failure as a page may show it. */
type Pass = typeof rt & { shown?: (e: unknown) => unknown }

const thenable = (v: unknown): v is PromiseLike<unknown> => v != null && typeof (v as PromiseLike<unknown>).then === 'function'
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
          const done = Promise.resolve(out).then(v => record({ v }), e => record({ e: message(shown(e)) }))
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
        try { out = fetcher(c.signal) } catch (e) { out = Promise.reject(e) }
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
          v => { if (c === ctrl && !c.signal.aborted) settle(v) },
          e => { if (c === ctrl && !c.signal.aborted) fail(e) },
        )
      },
    )
    onCleanup(() => ctrl?.abort())
  }

  if (rt.server && pass.got !== undefined && !untrack(() => pending.value)) pass.got++

  return {
    get value() { return value.value },
    get pending() { return pending.value },
    get error() { return error.value },
    get shape() { return options.shape?.read() },
    refresh,
  }
}

/** Content's own holes, which a client reads after `scoped` has ended and the server read inside it: same scope, same keys. */
function inScope(c: unknown) {
  if (typeof c !== 'function' && !Array.isArray(c)) return c
  const { p, n } = keys
  const read = (v: unknown): unknown => {
    while (typeof v === 'function') v = v()
    return Array.isArray(v) ? v.map(read) : v
  }
  return () => (keys.on ? under(p, () => ((keys.n = n), read(c))) : c)
}

/**
 * `<Boundary pending={<Skeleton />} error={(e, retry) => …}>…</Boundary>`. Without `error`, a failure renders
 * nothing (dev builds log it).
 */
export function Boundary(props: { pending?: unknown; /** What `pending="shape"` compiles to: a variant, its place reserved from the first paint. */ shape?: () => unknown; error?: (e: unknown, retry: () => void) => unknown; children?: unknown }) {
  const parent = getOwner()
  const list: Tracked[] = []
  const added = state(0)
  const thrown = state<unknown>(undefined)
  const track = { add(r: Tracked) { list.push(r); untrack(() => added.value++) } }
  const loading = derived(() => (added.value, list.some(r => r.first.value && r.err.value === undefined)))
  const failure = derived(() => {
    void added.value
    if (thrown.value !== undefined) return thrown.value
    for (const r of list) if (r.err.value !== undefined) return r.err.value
    return undefined
  })

  const key = keys.on ? nextKey() : undefined
  const data = rt.data as Streamed | undefined
  let was = key !== undefined && !rt.server ? data?.b[key] : undefined
  const page = globalThis as Page
  if (was === 'p' && data?.w) was = landed(data, page)[key!] // a lazy island wakes after the client started, and its chunk may be in
  /** It's still coming: the fallback stays, and the content waits for its chunk, which brings the data with it. */
  let held = was === 'p' && !!data?.w && page.$wh !== 0
  const failed = () => (thrown.value = new Error(data!.r[key!]?.e ?? 'server render failed'))
  if (was === 'e') failed()
  /** Run `fn` in the content (`c`) or fallback (`f`) scope while keys are on; fresh otherwise. */
  const scoped = <T,>(side: 'c' | 'f', fn: () => T): T => (keys.on && key !== undefined ? under(key + side + '/', fn) : fn())

  let content: unknown
  let disposeContent: (() => void) | undefined
  const build = (chunk?: boolean) => {
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
            if (rt.server) return { t: rt.resolve!(c) } // resolve now: lazily created resources register here
            const v = keys.on ? inScope(c) : c
            if (!chunk || typeof v !== 'function') return v
            const claimed = memo(v as () => unknown) // the claim ends before anything places this: read it while it lasts
            claimed()
            return claimed
          } catch (e) {
            if (DEV && e && typeof e === 'object' && (e as { weft?: string }).weft) console.error(`weft: <Boundary> caught an error in ${(e as { weft?: string }).weft}`)
            thrown.value = rt.server ? (rt as Pass).shown?.(e) ?? e : e
            return null
          }
        })
      }), parent)
    } finally {
      Object.assign(keys, { on, hydrating })
    }
  }
  // What failed on the server isn't asked again until someone says to: the error view's retry builds it.
  if (!held && was !== 'e') build()

  const show = state<'wait' | 'fallback' | 'content'>('content')
  if (rt.server) {
    const status = untrack(() => (failure.value !== undefined ? 'e' : loading.value ? 'p' : 'c'))
    if (key !== undefined && data) {
      data.b[key] = status
      if (status === 'e') data.r[key] = { e: message(untrack(() => failure.value)) }
    }
    if (status === 'p') show.value = 'fallback'
    else if (status === 'c' && key !== undefined) rt.stream?.set(key, (content as { t?: string } | null | undefined)?.t ?? '')
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
      if (busy || held || show.value === 'content') return // held: not loading only because nothing's been built
      clearTimeout(timer)
      const left = show.value === 'fallback' ? timing.hold - (Date.now() - shownAt) : 0
      if (left > 0) timer = setTimeout(() => (show.value = 'content'), left)
      else show.value = 'content'
    })
    onCleanup(() => clearTimeout(timer))
    if (held) {
      const id = encodeURIComponent(key!)
      const holds = (page.$wh ||= {})
      // Its chunk, or none when the server gave up on it. The chunk's data is what the server rendered it from, so
      // nothing's asked again. Built here, not in the memo: what it reads has to reach the memo.
      holds[id] = t => {
        held = false
        was = landed(data!, page)[key!]
        if (was === 'e') failed()
        else if (t && was === 'c' && typeof data!.w === 'function') claim(t, data!, () => build(true))
        else build()
        if (!untrack(() => loading.value)) show.value = 'content'
      }
      onCleanup(() => void delete holds[id])
    }
  }

  const retry = () => {
    if (untrack(() => thrown.value) !== undefined) {
      thrown.value = undefined
      build()
    }
    for (const r of list) if (untrack(() => r.err.value) !== undefined) r.refresh()
  }

  let side: { kind: 'p' | 'e'; node: unknown; dispose: () => void } | undefined
  // `parent` is only where they look things up, so nothing else disposes these two. What they read may outlive the page.
  onCleanup(() => {
    disposeContent?.()
    side?.dispose()
  })
  const pendingView = () => waiting.provide(list, () => {
    const v = props.shape ? props.shape() : props.pending
    return rt.server ? { t: rt.resolve!(v) } : v
  })
  const sideView = (kind: 'p' | 'e', make: () => unknown) => {
    if (side?.kind === kind && kind === 'p') return side.node
    side?.dispose()
    const s: { kind: 'p' | 'e'; node: unknown; dispose: () => void } = { kind, node: null, dispose: () => {} }
    s.node = createRoot(d => ((s.dispose = d), scoped('f', () => untrack(make))), parent)
    side = s
    return s.node
  }

  /** The server's markers around the fallback, which is theirs until the chunk: claiming it without them would take them out. */
  const marks = held ? around(encodeURIComponent(key!)) : undefined

  return memo(() => {
    const e = failure.value
    if (e !== undefined) {
      if (DEV && !props.error) console.error('weft: <Boundary> without `error` caught', e)
      const view = props.error ? sideView('e', () => props.error!(e, retry)) : null
      if (!rt.stream || key === undefined) return view
      // The fallback may be out already: what replaces it is this, not the content that never came.
      const html = rt.resolve!(view)
      rt.stream.set(key, html)
      return { t: html }
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
      if (props.shape && !rt.server) (n as HTMLElement).style.visibility = s === 'wait' ? 'hidden' : ''
      return held && marks ? [marks[0], n, marks[1]] : n
    }
    if (side) {
      if (DEV && s === 'content' && side.kind === 'p') checkSwap(side.node, content)
      side.dispose()
      side = undefined
    }
    return s === 'content' ? content : null
  })
}

/** What a page that's still streaming carries once the client runs: `w` claims a chunk's nodes (@weft-js/start's client). */
type Streamed = Omit<SsrData, 'w'> & { w?: 1 | ((root: Element, fn: () => void) => void) }

type Page = { $wh?: Record<string, (t?: HTMLTemplateElement) => void> | 0; $wc?: Partial<SsrData>[] }

/** The page's data with what the stream's chunks have said since (their scripts push to `$wc`): the Boundaries' states. */
function landed(data: Streamed, page: Page) {
  for (const l of page.$wc ?? []) {
    Object.assign(data.r, l.r)
    Object.assign(data.b, l.b)
    if (l.s) Object.assign((data.s ??= {}), l.s)
  }
  return data.b
}

/** Run `fn` as a claiming pass over a chunk. Out of its template, whose document has no window for what mounts to ask for. */
function claim(t: HTMLTemplateElement, data: Streamed, fn: () => void) {
  const box = document.createElement('div')
  box.append(t.content)
  const outer = rt.state
  rt.data = data as SsrData
  rt.state = data.s
  Object.assign(keys, { on: true, hydrating: true, p: '', n: 0 })
  try {
    ;(data.w as (root: Element, fn: () => void) => void)(box, fn)
  } finally {
    Object.assign(keys, { on: false, hydrating: false, p: '', n: 0 })
    rt.data = undefined
    rt.state = outer
  }
}

function around(k: string) {
  const w = document.createTreeWalker(document.body, 128)
  let a: Comment | undefined
  for (let n; (n = w.nextNode() as Comment | null); ) {
    if (n.data === 'wb:' + k) a = n
    else if (a && n.data === '/wb:' + k) return [a, n] as const
  }
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
