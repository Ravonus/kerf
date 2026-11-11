// @kerf-js/core/ssr: the string renderer, and the helpers kerf's back end emits for `generate: 'ssr'` (research 19 §3). It
// runs on kerf's own reactive core with effects off. Each template renders as `ssr(k => "<li" + key(k) + … )`: `k`
// is the instance's hydration key (research 19 §2.4), written as ` wk="…"` on the root when the output is
// hydratable, and each hole renders in its own scope (`hole(k, slot, value)`), wrapped in `<!--[-->…<!--]-->` when
// it shares its parent with other content. `renderToString` renders what it can now (a pending `resource` renders
// its Boundary's fallback, and the client fetches after hydrating); `renderToStringAsync` waits for the resources
// and renders again until none is pending; `renderToStream` sends the shell at once (pending Boundaries show their
// fallbacks) and then each Boundary's content as its resources resolve (research 25 §4).
//
// Hydratable output ends with `<script type="application/json" data-kerf>`: resolved resources and boundary
// states by key. Put the whole string in the container `hydrate()` gets.

import { createRoot, memo, type SsrData } from './index'
import { rt } from './index/graph'
import { keys, nextKey, under } from './keys'
import { createApp, dehydrate, useApp, type AppOptions } from './scope'
import { withHead, type HeadOptions } from './head'
import { attr, escape, resolveSelects } from './ssr/attrs'
import { streamRender, type PassArgs } from './ssr/stream'
import { component } from './dom-next'

export { SWAP } from './ssr/stream'

export { attr, escape, ref, spread, spreads, merged, inner } from './ssr/attrs'

export { memo }
export { For, mergeProps } from './dom'
export { component }
export { mergeMeta, metaTags, headTags } from './head'
export type { HeadOptions, Merged, Meta, Og, Site, Tag, Twitter, Extra, Image } from './head'

type Node = { t: string }

let selects = false // set by modules that bind a <select> value (`select`)
let writeKeys = true
// A static region (partial hydration, PLAN §11): nothing will claim it, so it gets no keys and no markers. Off again
// inside an island, on again in the island's slot.
let quiet = false

/** Passes in a row that read nothing new before a render stops waiting: a read whose key changes each pass never lands in the next. */
const STALLED = 3

/** Whether a render's still getting somewhere, by how many resources each pass had values for. */
function headway(first: number) {
  let most = first
  let idle = 0
  return {
    get idle() {
      return idle
    },
    pass(got: number) {
      if (got > most) {
        most = got
        idle = 0
      } else idle++
      return idle < STALLED
    },
  }
}

/** How a server render runs: its deadline, its head, whether it's hydratable. */
export interface RenderOptions {
  /** Emit hydration keys for `hydrate()` (default true). */
  hydratable?: boolean
  /** The request's app: each render pass gets its own defineState instances (seeded from `state`), never a shared one. */
  app?: AppOptions
  /**
   * Page metadata (research 20): merged and written as `data-wm` tags at the top of the app's `<head>`, or, when the
   * app renders no `<head>`, the output is wrapped in a minimal document that has them.
   */
  head?: HeadOptions
  /** A failure as the page may show it. A read's error reaches the HTML and the page data through this. */
  shown?: (e: unknown) => unknown
  /** The render stopped waiting because its passes stopped getting anywhere. */
  stalled?: () => void
}

/** Render `code` (usually `() => <App />`) to HTML now. Effects and watchers don't run on the server. */
export function renderToString(code: () => unknown, options: RenderOptions = {}): string {
  const html = pass({ code, options, cache: {}, wait: [], flight: new Map() })
  return options.head ? withHead(html, options.head) : html
}

/** Render, wait for the resources it started, and render again until none is pending or that stops getting anywhere (at most `passes`). */
export async function renderToStringAsync(
  code: () => unknown,
  options: RenderOptions & { passes?: number } = {},
): Promise<string> {
  const cache: SsrData['r'] = {}
  const flight = new Map<string, Promise<unknown>>()
  let way: ReturnType<typeof headway> | undefined
  for (let n = 1; ; n++) {
    const wait: Promise<unknown>[] = []
    const html = pass({ code, options, cache, wait, flight })
    const going = way ? way.pass(rt.got!) : !!(way = headway(rt.got!))
    if (!going) options.stalled?.()
    if (!wait.length || !going || n >= (options.passes ?? 10))
      return options.head ? withHead(html, options.head) : html
    await Promise.all(wait)
  }
}

/** A render as it streams: the shell now, then what each Boundary resolves to. */
export interface Stream {
  /** The first pass: what renders now, with each pending Boundary's fallback between `<!--wb:key-->` markers. */
  shell: string
  /**
   * Each later chunk: a Boundary's content as `<template>` + `<script>$wb(key)</script>`, which swaps it in for the
   * fallback, in the order they resolve. The first chunk also defines `$wb`. Send them after the shell, outside the
   * container `hydrate()` gets; the page data comes last, from `data()`.
   */
  chunks: AsyncIterable<string>
  /** After `chunks` ends: the page data for `hydrate(code, container, { data })` (resources and boundary states), or null. */
  data(): SsrData | null
  /**
   * Wait for the resources outside any Boundary, which have nowhere to stream to, and update `shell`. Without it they
   * render empty and the client fetches them again. They hold the first byte, as `load` does.
   */
  settle(): Promise<void>
  /**
   * Wait up to `ms` for the Boundaries' resources, and when they all land, render them into `shell`: data that's that
   * quick goes in the page itself, with no chunk to swap in. Call after `settle`, before reading `chunks`.
   */
  hold(ms: number): Promise<void>
}

/** Render with streaming, sending the shell before each resolved Boundary. */
export function renderToStream(
  code: () => unknown,
  options: RenderOptions & { timeout?: number; passes?: number; landing?: () => string } = {},
): Stream {
  return streamRender(code, options, pass, headway)
}

function pass(a: PassArgs & { stream?: undefined; top?: undefined }): string
function pass(a: PassArgs & { stream: Map<string, string>; top: Promise<unknown>[] }): {
  html: string
  data: SsrData
}
function pass({
  code,
  options,
  cache,
  wait,
  flight,
  stream,
  top,
}: PassArgs): string | { html: string; data: SsrData } {
  const prev = { ...rt }
  const prevKeys = { ...keys }
  const prevWrite = writeKeys
  const prevQuiet = quiet
  quiet = false
  const data: SsrData = { r: cache, b: {} }
  Object.assign(rt, {
    server: true,
    data,
    wait,
    resolve: text,
    flight,
    stream,
    top,
    shown: options.shown,
    got: 0,
  })
  // Keys are always computed (resources and boundaries are found by them across passes); written only if hydratable.
  Object.assign(keys, { on: true, hydrating: false, p: '', n: 0 })
  writeKeys = options.hydratable !== false
  ;(globalThis as unknown as Record<symbol, (() => void) | undefined>)[
    Symbol.for('kerf.render')
  ]?.() // veneer-core's ids (store.ts)
  let html = ''
  const app = createApp(options.app)
  const prevApp = useApp(app) // a swap, not an owner: the render is synchronous
  try {
    createRoot((dispose) => {
      try {
        html = text(code)
      } finally {
        dispose()
      }
    }, null)
  } finally {
    useApp(prevApp)
    Object.assign(rt, {
      server: prev.server,
      data: prev.data,
      wait: prev.wait,
      resolve: prev.resolve,
      flight: prev.flight,
      stream: prev.stream,
      shown: (prev as typeof prev & { shown?: unknown }).shown,
    })
    Object.assign(keys, prevKeys)
    writeKeys = prevWrite
    quiet = prevQuiet
  }
  if (selects) html = resolveSelects(html)
  const s = dehydrate(app) // this pass's: every pass re-runs the setups, and the last one is what the page shows
  if (stream) return { html, data: { r: data.r, b: data.b, ...(s && { s }) } }
  if (
    options.hydratable === false ||
    (!Object.keys(data.r).length && !Object.keys(data.b).length && !s)
  )
    return html
  const json = JSON.stringify({ r: data.r, b: data.b, ...(s && { s }) }).replace(/</g, '\\u003c')
  return `${html}<script type="application/json" data-kerf>${json}</script>`
}

// ---- templates and holes --------------------------------------------------------------------------------------

/** A template instance: `fn` gets its key and returns its HTML. */
export function ssr(fn: (k: string) => string): Node {
  return { t: fn(nextKey()) }
}

/** The root's key attribute, when the output is hydratable. */
export function key(k: string): string {
  return writeKeys && !quiet ? ` wk="${k}"` : ''
}

/**
 * Hole `slot` of the template keyed `k`: its value, escaped, rendered in the hole's own scope. `mixed`: it shares its
 * parent, so it needs a range: `1` always, `2` unless static structure came out as one element, which the client's walk
 * takes for the hole itself.
 */
export function hole(k: string, at: number, value: unknown, mixed?: 1 | 2): string {
  return under(`${k}.${at}/`, () => {
    if (!mixed || quiet) return text(value)
    if (mixed === 2) {
      const v = (value as () => unknown)() as { t?: unknown } | null | undefined
      if (v && typeof v.t === 'string' && /^<[a-z]/i.test(v.t)) return v.t
      value = v
    }
    const h = text(value)
    return h ? `<!--[-->${h}<!--]-->` : '<!---->' // nothing to bound: one marker holds the place
  })
}

let open: { read: boolean } | undefined
let plain = false

const notWire = (v: unknown): string | undefined => {
  if (v == null || typeof v === 'string' || typeof v === 'boolean') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? undefined : String(v)
  if (Array.isArray(v)) return v.map(notWire).find(Boolean)
  if (
    typeof v !== 'object' ||
    (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
  )
    return typeof v === 'function' ? 'a function' : `a ${v?.constructor?.name ?? typeof v}`
  return Object.values(v).map(notWire).find(Boolean)
}

/**
 * A component the compiler made an island: in a static region, its nodes with what the client needs to adopt them.
 * `names`: the props that go as JSON, `when`: `v` or `i` when it can wait for the page to need it. Anywhere else it's
 * the component.
 */
export function island(
  id: string,
  names: string[],
  Comp: (props: never) => unknown,
  props: Record<string, unknown>,
  slotted?: 1,
  when?: string,
): unknown {
  if (!quiet) return component(Comp, (slotted ? authored(props) : props) as never)
  const k = nextKey()
  const v = names.map((n) => {
    const bad = notWire(props[n])
    if (bad)
      throw Object.assign(
        new Error(
          `H009 prop \`${n}\` of an island (${id}) is ${bad}, which can't go from the server to the client. Pass plain data, or put \`/* @kerf client */\` on the component that renders it.`,
        ),
        { code: 'H009' },
      )
    return props[n]
  })
  const frame = { read: false }
  const outer = open
  open = frame
  quiet = false
  let html: string
  try {
    html = under(k + '/', () => text(component(Comp, props as never)))
  } finally {
    quiet = true
    open = outer
  }
  const data = JSON.stringify(when ? [id, k, v, when] : [id, k, v]).replace(/--/g, '-\\u002d')
  const rest =
    slotted && !frame.read ? `<template>${(props.children as { h: string }).h}</template>` : ''
  return { t: `<!--wi:${data}--><!--[-->${html}<!--]-->${rest}` }
}

/** Props whose children are the page's own after all: the compiler wrote a slot, but this island sits in client code. */
function authored(props: Record<string, unknown>) {
  const own = Object.getOwnPropertyDescriptor(props, 'children')
  return Object.defineProperty(props, 'children', {
    enumerable: true,
    get() {
      plain = true
      try {
        return own?.get?.call(props)
      } finally {
        plain = false
      }
    },
  })
}

/**
 * An island's children, which stay the server's. Where the island is only a component (`island` above, in client code)
 * the client renders them too, so they're ordinary output with keys to claim, with the shape a client call gives them.
 */
export function slot(fn: () => unknown): unknown {
  if (plain) {
    plain = false
    const kids = fn() as unknown[]
    return kids.length === 1 ? kids[0] : kids
  }
  if (open) open.read = true
  const was = quiet
  quiet = true
  try {
    const h = text(fn)
    return { t: `<!--ws-->${h}<!--/ws-->`, h }
  } finally {
    quiet = was
  }
}

/**
 * Route level `d`: `on` for a static one, whose islands are all that runs. `held`: the level above is static, and has
 * to find this one. Nothing needs the markers between two client levels.
 */
export function region(on: boolean, d: number, held: boolean, fn: () => unknown): unknown {
  if (!on && !held) return fn()
  const was = quiet
  const at = `<!--wl:${d}:${JSON.stringify([keys.p, keys.n]).replace(/--/g, '-\\u002d')}-->`
  quiet = on
  try {
    return { t: `${at}${text(fn)}<!--/wl:${d}-->` }
  } finally {
    quiet = was
  }
}

/**
 * A value as HTML: functions are read, finished nodes pass through, text is escaped, and adjacent texts get a
 * `<!--,-->` between them so the client finds one text node per value.
 */
function text(v: unknown): string {
  while (typeof v === 'function') v = v()
  if (v == null || typeof v === 'boolean' || v === '') return ''
  if (Array.isArray(v)) {
    const out = { html: '', lastText: false }
    append(v, out)
    return out.html
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  return typeof (v as { t?: unknown }).t === 'string' ? (v as { t: string }).t : escape(String(v))
}

/** `+=`, not an array's `join`: that copies the whole subtree at every level, and this leaves one flatten at the end. */
function append(list: unknown[], out: { html: string; lastText: boolean }) {
  for (let v of list) {
    while (typeof v === 'function') v = v()
    if (v == null || typeof v === 'boolean' || v === '') continue
    if (Array.isArray(v)) append(v, out)
    else if (typeof (v as { t?: unknown }).t === 'string') {
      out.html += (v as { t: string }).t
      out.lastText = false
    } else {
      // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
      out.html += (out.lastText && !quiet ? '<!--,-->' : '') + escape(String(v))
      out.lastText = true
    }
  }
}

/** A `<select>`'s value: the render then marks the matching `<option selected>`. */
export function select(value: unknown): string {
  selects = true
  return attr('value', value)
}
