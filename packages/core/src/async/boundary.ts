import {
  DEV,
  createRoot,
  derived,
  getOwner,
  memo,
  onCleanup,
  state,
  untrack,
  watch,
  type SsrData,
  type State,
} from '../index'
import { rt } from '../index/graph'
import { keys, nextKey, under } from '../keys'
import { boundaries, timing, waiting, type Tracked } from './shared'
import { around, checkSwap } from './view'

type Pass = typeof rt & { shown?: (e: unknown) => unknown }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

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

type BoundaryProps = {
  pending?: unknown
  /** What `pending="shape"` compiles to: a variant, its place reserved from the first paint. */ shape?: () => unknown
  error?: (e: unknown, retry: () => void) => unknown
  children?: unknown
}

/**
 * `<Boundary pending={<Skeleton />} error={(e, retry) => …}>…</Boundary>`. Without `error`, a failure renders
 * nothing (dev builds log it).
 */
export function Boundary(props: BoundaryProps) {
  const parent = getOwner()
  const list: Tracked[] = []
  const added = state(0)
  const thrown = state<unknown>(undefined)
  const track = {
    add(r: Tracked) {
      list.push(r)
      untrack(() => added.value++)
    },
  }
  const loading = derived(
    () => (added.value, list.some((r) => r.first.value && r.err.value === undefined)),
  )
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
  const boundary: BoundaryState = {
    was,
    held: was === 'p' && !!data?.w && page.$wh !== 0,
    content: undefined,
    dispose: undefined,
  }
  const failed = () => (thrown.value = new Error(data!.r[key!]?.e ?? 'server render failed'))
  if (boundary.was === 'e') failed()
  /** Run `fn` in the content (`c`) or fallback (`f`) scope while keys are on; fresh otherwise. */
  const scoped = <T>(side: 'c' | 'f', fn: () => T): T =>
    keys.on && key !== undefined ? under(key + side + '/', fn) : fn()

  const build = makeBuilder(list, boundary, scoped, track, props, thrown, parent)
  // What failed on the server isn't asked again until someone says to: the error view's retry builds it.
  if (!boundary.held && boundary.was !== 'e') build()

  const show = state<'wait' | 'fallback' | 'content'>('content')
  if (rt.server) {
    const status = untrack(() => (failure.value !== undefined ? 'e' : loading.value ? 'p' : 'c'))
    if (key !== undefined && data) {
      data.b[key] = status
      if (status === 'e') data.r[key] = { e: message(untrack(() => failure.value)) }
    }
    if (status === 'p') show.value = 'fallback'
    else if (status === 'c' && key !== undefined)
      rt.stream?.set(key, (boundary.content as { t?: string } | null | undefined)?.t ?? '')
  } else showClient(boundary, show, loading, page, key, data, failed, build)

  const retry = () => {
    if (untrack(() => thrown.value) !== undefined) {
      thrown.value = undefined
      build()
    }
    for (const r of list) if (untrack(() => r.err.value) !== undefined) r.refresh()
  }

  return boundaryView(parent, list, props, scoped, boundary, key, failure, retry, show)
}

/** What a page that's still streaming carries once the client runs: `w` claims a chunk's nodes (@weft-js/start's client). */
type Streamed = Omit<SsrData, 'w'> & { w?: 1 | ((root: Element, fn: () => void) => void) }

type Page = {
  $wh?: Record<string, (t?: HTMLTemplateElement) => void> | 0
  $wc?: Partial<SsrData>[]
}

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

type Scoped = <T>(side: 'c' | 'f', fn: () => T) => T
function makeBuilder(
  list: Tracked[],
  boundary: BoundaryState,
  scoped: Scoped,
  track: { add(r: Tracked): void },
  props: BoundaryProps,
  thrown: State<unknown>,
  parent: ReturnType<typeof getOwner>,
) {
  return (chunk?: boolean) => {
    boundary.dispose?.()
    list.length = 0
    const { on, hydrating } = keys
    if (hydrating && boundary.was !== undefined && boundary.was !== 'c')
      Object.assign(keys, { on: false, hydrating: false }) // the server rendered a fallback: build the content fresh
    try {
      boundary.content = createRoot(
        (dispose) =>
          scoped('c', () => {
            boundary.dispose = dispose
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
                if (DEV && e && typeof e === 'object' && (e as { weft?: string }).weft)
                  console.error(
                    `weft: <Boundary> caught an error in ${(e as { weft?: string }).weft}`,
                  )
                thrown.value = rt.server ? ((rt as Pass).shown?.(e) ?? e) : e
                return null
              }
            })
          }),
        parent,
      )
    } finally {
      Object.assign(keys, { on, hydrating })
    }
  }
}

type BoundaryState = {
  was: string | undefined
  held: boolean
  content: unknown
  dispose: (() => void) | undefined
}
type Display = State<'wait' | 'fallback' | 'content'>
type Observable<T> = { readonly value: T }

function showClient(
  boundary: BoundaryState,
  show: Display,
  loading: Observable<boolean>,
  page: Page,
  key: string | undefined,
  data: Streamed | undefined,
  failed: () => unknown,
  build: (chunk?: boolean) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let shownAt = 0
  if (boundary.was === 'p') {
    show.value = 'fallback' // the server's fallback is on screen: hold it from now
    shownAt = Date.now()
  } else if (untrack(() => loading.value)) {
    show.value = 'wait'
    timer = setTimeout(() => {
      show.value = 'fallback'
      shownAt = Date.now()
    }, timing.showAfter)
  }
  watch(
    () => loading.value,
    (busy) => {
      if (busy || boundary.held || show.value === 'content') return // held: not loading only because nothing's been built
      clearTimeout(timer)
      const left = show.value === 'fallback' ? timing.hold - (Date.now() - shownAt) : 0
      if (left > 0) timer = setTimeout(() => (show.value = 'content'), left)
      else show.value = 'content'
    },
  )
  onCleanup(() => clearTimeout(timer))
  if (boundary.held) {
    const id = encodeURIComponent(key!)
    const holds = (page.$wh ||= {})
    // Its chunk, or none when the server gave up on it. The chunk's data is what the server rendered it from, so
    // nothing's asked again. Built here, not in the memo: what it reads has to reach the memo.
    holds[id] = (t) => {
      boundary.held = false
      boundary.was = landed(data!, page)[key!]
      if (boundary.was === 'e') failed()
      else if (t && boundary.was === 'c' && typeof data!.w === 'function')
        claim(t, data!, () => build(true))
      else build()
      if (!untrack(() => loading.value)) show.value = 'content'
    }
    onCleanup(() => void delete holds[id])
  }
}

function boundaryView(
  parent: ReturnType<typeof getOwner>,
  list: Tracked[],
  props: BoundaryProps,
  scoped: Scoped,
  boundary: BoundaryState,
  key: string | undefined,
  failure: Observable<unknown>,
  retry: () => void,
  show: Display,
) {
  let side: { kind: 'p' | 'e'; node: unknown; dispose: () => void } | undefined
  // `parent` is only where they look things up, so nothing else disposes these two. What they read may outlive the page.
  onCleanup(() => {
    boundary.dispose?.()
    side?.dispose()
  })
  const pendingView = () =>
    waiting.provide(list, () => {
      const v = props.shape ? props.shape() : props.pending
      return rt.server ? { t: rt.resolve!(v) } : v
    })
  const sideView = (kind: 'p' | 'e', make: () => unknown) => {
    if (side?.kind === kind && kind === 'p') return side.node
    side?.dispose()
    const s: { kind: 'p' | 'e'; node: unknown; dispose: () => void } = {
      kind,
      node: null,
      dispose: () => {},
    }
    s.node = createRoot((d) => ((s.dispose = d), scoped('f', () => untrack(make))), parent)
    side = s
    return s.node
  }

  /** The server's markers around the fallback, which is theirs until the chunk: claiming it without them would take them out. */
  const marks = boundary.held ? around(encodeURIComponent(key!)) : undefined

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
      if (props.shape && !rt.server)
        (n as HTMLElement).style.visibility = s === 'wait' ? 'hidden' : ''
      return boundary.held && marks ? [marks[0], n, marks[1]] : n
    }
    if (side) {
      if (DEV && s === 'content' && side.kind === 'p') checkSwap(side.node, boundary.content)
      side.dispose()
      side = undefined
    }
    return s === 'content' ? boundary.content : null
  })
}
