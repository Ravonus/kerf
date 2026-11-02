// @weft-js/core/ssr: the string renderer, and the helpers weft's back end emits for `generate: 'ssr'` (research 19 §3). It
// runs on weft's own reactive core with effects off. Each template renders as `ssr(k => "<li" + key(k) + … )`: `k`
// is the instance's hydration key (research 19 §2.4), written as ` wk="…"` on the root when the output is
// hydratable, and each hole renders in its own scope (`hole(k, slot, value)`), wrapped in `<!--[-->…<!--]-->` when
// it shares its parent with other content. `renderToString` renders what it can now (a pending `resource` renders
// its Boundary's fallback, and the client fetches after hydrating); `renderToStringAsync` waits for the resources
// and renders again until none is pending; `renderToStream` sends the shell at once (pending Boundaries show their
// fallbacks) and then each Boundary's content as its resources resolve (research 25 §4).
//
// Hydratable output ends with `<script type="application/json" data-weft>`: resolved resources and boundary
// states by key. Put the whole string in the container `hydrate()` gets.

import { createRoot, memo, rt, type SsrData } from './index'
import { keys, nextKey, under } from './keys'
import { createApp, dehydrate, useApp, type AppOptions } from './scope'
import { withHead, type HeadOptions } from './head'
import { attrName, cssName, cssValue, WORDS } from './dom'

export { memo }
export { For, mergeProps } from './dom'
import { component } from './dom-next'
export { component }
export { mergeMeta, metaTags, headTags } from './head'
export type { HeadOptions, Merged, Meta, Og, Site, Tag, Twitter, Extra, Image } from './head'

type Node = { t: string }

let selects = false // set by modules that bind a <select> value (`select`)
let writeKeys = true
// A static region (partial hydration, PLAN §11): nothing will claim it, so it gets no keys and no markers. Off again
// inside an island, on again in the island's slot.
let quiet = false

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
}

/** Render `code` (usually `() => <App />`) to HTML now. Effects and watchers don't run on the server. */
export function renderToString(code: () => unknown, options: RenderOptions = {}): string {
  const html = pass(code, options, {}, [], new Map())
  return options.head ? withHead(html, options.head) : html
}

/** Render, wait for the resources it started, and render again until none is pending (at most `passes`). */
export async function renderToStringAsync(code: () => unknown, options: RenderOptions & { passes?: number } = {}): Promise<string> {
  const cache: SsrData['r'] = {}
  const flight = new Map<string, Promise<unknown>>()
  for (let n = 1; ; n++) {
    const wait: Promise<unknown>[] = []
    const html = pass(code, options, cache, wait, flight)
    if (!wait.length || n >= (options.passes ?? 10)) return options.head ? withHead(html, options.head) : html
    await Promise.all(wait)
  }
}

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
}

/** The swap: the template before this script (or `t`) replaces the nodes between its key's markers. No key: drop every marker. */
export const SWAP = `$wb=function(k,t){var d=document,w=d.createTreeWalker(d.body,128),a,b,n,r=[];if(k)t=t||d.currentScript.previousElementSibling;while(n=w.nextNode()){if(!k){if(/^\\/?wb:/.test(n.data))r.push(n)}else if(n.data=='wb:'+k)a=n;else if(n.data=='/wb:'+k){b=n;break}}r.forEach(function(n){n.remove()});if(!a||!b)return;while(a.nextSibling!=b)a.nextSibling.remove();b.replaceWith(t.content);a.remove();t.remove()}`

/**
 * Render with streaming: `shell` now, then a chunk per Boundary whose resources resolve, re-rendering after each
 * settles (cached values, in-flight fetches reused, so nothing is fetched twice). Boundaries that are still pending
 * after `timeout` ms keep their fallbacks, and the client fetches them after hydrating.
 */
export function renderToStream(code: () => unknown, options: RenderOptions & { timeout?: number; passes?: number } = {}): Stream {
  const cache: SsrData['r'] = {}
  const flight = new Map<string, Promise<unknown>>()
  const html = new Map<string, string>()
  let wait: Promise<unknown>[] = []
  let top: Promise<unknown>[] = []
  let last: SsrData | null = null
  const run = () => {
    html.clear()
    wait = []
    top = []
    const out = pass(code, options, cache, wait, flight, html, top)
    last = out.data
    return out.html
  }
  const pending = () => Object.keys(last?.b ?? {}).filter(k => last!.b[k] === 'p')
  async function* chunks() {
    const deadline = Date.now() + (options.timeout ?? 10_000)
    let open = new Set(pending())
    let defined = false
    for (let n = 1; open.size && wait.length && n < (options.passes ?? 50); n++) {
      const left = deadline - Date.now()
      if (left <= 0) break
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = await Promise.race([
        Promise.race(wait).then(() => false),
        new Promise<boolean>(ok => (timer = setTimeout(ok, left, true))),
      ])
      clearTimeout(timer)
      if (late) break
      await new Promise(ok => setTimeout(ok, 0)) // fetches that settle together go out together
      run()
      let out = ''
      for (const k of [...open]) {
        const content = html.get(k)
        if (content === undefined) continue
        open.delete(k)
        const id = encodeURIComponent(k)
        out += `<template>${content}</template><script>${defined ? '' : SWAP + ';'}$wb(${JSON.stringify(id)})</script>`
        defined = true
      }
      for (const k of pending()) open.add(k) // nested Boundaries inside content that just arrived
      if (out) yield out
    }
    if (open.size) yield `<script>${defined ? '' : SWAP + ';'}$wb()</script>` // what's left keeps its fallback
  }
  const stream: Stream = {
    shell: run(),
    chunks: chunks(),
    data: () => (last && (Object.keys(last.r).length || Object.keys(last.b).length || last.s) ? last : null),
    async settle() {
      const deadline = Date.now() + (options.timeout ?? 10_000)
      for (let n = 1; top.length && n < (options.passes ?? 50); n++) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const late = await Promise.race([
          Promise.all(top).then(() => false),
          new Promise<boolean>(ok => (timer = setTimeout(ok, Math.max(0, deadline - Date.now()), true))),
        ])
        clearTimeout(timer)
        if (late) return
        stream.shell = run()
      }
    },
  }
  return stream
}

function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[], flight: Map<string, Promise<unknown>>): string
function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[], flight: Map<string, Promise<unknown>>, stream: Map<string, string>, top: Promise<unknown>[]): { html: string; data: SsrData }
function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[], flight: Map<string, Promise<unknown>>, stream?: Map<string, string>, top?: Promise<unknown>[]): any {
  const prev = { ...rt }
  const prevKeys = { ...keys }
  const prevWrite = writeKeys
  const prevQuiet = quiet
  quiet = false
  const data: SsrData = { r: cache, b: {} }
  Object.assign(rt, { server: true, data, wait, resolve: text, flight, stream, top })
  // Keys are always computed (resources and boundaries are found by them across passes); written only if hydratable.
  Object.assign(keys, { on: true, hydrating: false, p: '', n: 0 })
  writeKeys = options.hydratable !== false
  ;(globalThis as any)[Symbol.for('weft.render')]?.() // warp-core's ids (store.ts)
  let html = ''
  const app = createApp(options.app)
  const prevApp = useApp(app) // a swap, not an owner: the render is synchronous
  try {
    createRoot(dispose => {
      try { html = text(code) } finally { dispose() }
    }, null)
  } finally {
    useApp(prevApp)
    Object.assign(rt, { server: prev.server, data: prev.data, wait: prev.wait, resolve: prev.resolve, flight: prev.flight, stream: prev.stream })
    Object.assign(keys, prevKeys)
    writeKeys = prevWrite
    quiet = prevQuiet
  }
  if (selects) html = resolveSelects(html)
  const s = dehydrate(app) // this pass's: every pass re-runs the setups, and the last one is what the page shows
  if (stream) return { html, data: { r: data.r, b: data.b, ...(s && { s }) } }
  if (options.hydratable === false || (!Object.keys(data.r).length && !Object.keys(data.b).length && !s)) return html
  const json = JSON.stringify({ r: data.r, b: data.b, ...(s && { s }) }).replace(/</g, '\\u003c')
  return `${html}<script type="application/json" data-weft>${json}</script>`
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
export function hole(k: string, slot: number, value: unknown, mixed?: 1 | 2): string {
  return under(`${k}.${slot}/`, () => {
    if (!mixed || quiet) return text(value)
    if (mixed === 2) {
      const v: any = (value as () => unknown)()
      if (v && typeof v.t === 'string' && /^<[a-z]/i.test(v.t)) return v.t as string
      return `<!--[-->${text(v)}<!--]-->`
    }
    return `<!--[-->${text(value)}<!--]-->`
  })
}

let open: { read: boolean } | undefined
let plain = false

const notWire = (v: any): string | undefined => {
  if (v == null || typeof v === 'string' || typeof v === 'boolean') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? undefined : String(v)
  if (Array.isArray(v)) return v.map(notWire).find(Boolean)
  if (typeof v !== 'object' || (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)) return typeof v === 'function' ? 'a function' : `a ${v?.constructor?.name ?? typeof v}`
  return Object.values(v).map(notWire).find(Boolean)
}

/**
 * A component the compiler made an island: in a static region, its nodes with what the client needs to adopt them.
 * `names`: the props that go as JSON, `when`: `v` or `i` when it can wait for the page to need it. Anywhere else it's
 * the component.
 */
export function island(id: string, names: string[], Comp: (props: any) => unknown, props: Record<string, unknown>, slotted?: 1, when?: string): unknown {
  if (!quiet) return component(Comp, slotted ? authored(props) : props)
  const k = nextKey()
  const v = names.map(n => {
    const bad = notWire(props[n])
    if (bad) throw Object.assign(new Error(`H009 prop \`${n}\` of an island (${id}) is ${bad}, which can't go from the server to the client. Pass plain data, or put \`/* @weft client */\` on the component that renders it.`), { code: 'H009' })
    return props[n]
  })
  const frame = { read: false }
  const outer = open
  open = frame
  quiet = false
  let html: string
  try {
    html = under(k + '/', () => text(component(Comp, props)))
  } finally {
    quiet = true
    open = outer
  }
  const data = JSON.stringify(when ? [id, k, v, when] : [id, k, v]).replace(/--/g, '-\\u002d')
  const rest = slotted && !frame.read ? `<template>${(props.children as { h: string }).h}</template>` : ''
  return { t: `<!--wi:${data}--><!--[-->${html}<!--]-->${rest}` }
}

/** Props whose children are the page's own after all: the compiler wrote a slot, but this island sits in client code. */
function authored(props: Record<string, unknown>) {
  const read = Object.getOwnPropertyDescriptor(props, 'children')?.get
  return Object.defineProperty(props, 'children', {
    enumerable: true,
    get() {
      plain = true
      try {
        return read?.call(props)
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
  return typeof (v as any).t === 'string' ? (v as any).t : escape(String(v))
}

/** `+=`, not an array's `join`: that copies the whole subtree at every level, and this leaves one flatten at the end. */
function append(list: unknown[], out: { html: string; lastText: boolean }) {
  for (let v of list as any[]) {
    while (typeof v === 'function') v = v()
    if (v == null || typeof v === 'boolean' || v === '') continue
    if (Array.isArray(v)) append(v, out)
    else if (typeof v.t === 'string') {
      out.html += v.t
      out.lastText = false
    } else {
      out.html += (out.lastText && !quiet ? '<!--,-->' : '') + escape(String(v))
      out.lastText = true
    }
  }
}

// ---- escaping -------------------------------------------------------------------------------------------------

const CONTENT = /[&<]/g
const ATTR = /[&"<]/g
const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '"': '&quot;' }

/** Escape text (`&`, `<`) or an attribute value (`&`, `"`, `<`). */
export function escape(s: string, attr?: boolean): string {
  const re = attr ? ATTR : CONTENT
  re.lastIndex = 0
  return re.test(s) ? s.replace(re, c => ENTITY[c]) : s
}

// ---- attributes -----------------------------------------------------------------------------------------------

/**
 * ` name="value"` for a dynamic attribute or property: `null`/`false` drop it, `true` writes the bare name. `WORDS`
 * attributes write booleans as the words (`aria-pressed="false"`), as @weft-js/core/dom does.
 */
export function attr(name: string, value: any): string {
  name = attribute(name)
  if (typeof value === 'boolean' && WORDS.test(name)) value = String(value)
  if (name === 'class') value = classes(value)
  else if (name === 'style') value = styles(value)
  if (value == null || value === false || value === '' && (name === 'class' || name === 'style')) return ''
  if (value === true) return ` ${name}`
  return ` ${name}="${escape(String(value), true)}"`
}

const NAMES_MAX = 2048
const names = new Map<string, string>()

/** `attrName`, remembered: a server sees the same few names on every request, and its regexes run on each. */
function attribute(k: string) {
  let name = names.get(k)
  if (name === undefined) {
    if (names.size >= NAMES_MAX) names.clear()
    names.set(k, (name = attrName(k)))
  }
  return name
}

function classes(v: any): string {
  if (v == null || v === false) return ''
  if (typeof v !== 'object') return String(v)
  return Object.keys(v).filter(k => v[k]).join(' ')
}

function styles(v: any): string {
  if (v == null || typeof v !== 'object') return v ?? ''
  let out = ''
  for (const k of Object.keys(v)) {
    const name = cssName(k)
    const value = cssValue(name, v[k])
    if (value != null) out += `${out ? ';' : ''}${name}:${value}`
  }
  return out
}

/** A `<select>`'s value: the render then marks the matching `<option selected>`. */
export function select(value: any): string {
  selects = true
  return attr('value', value)
}

/** `<div {...props}>`: the merged props' attributes (handlers, refs and children aren't attributes). */
export function spread(props: Record<string, any>): string {
  let out = ''
  for (const k of Reflect.ownKeys(props) as string[]) {
    if (k === 'children' || k === 'ref' || k === 'key' || k === 'innerHTML' || k === 'textContent' || k === 'dangerouslySetInnerHTML' || /^on[A-Z]/.test(k)) continue
    out += attr(k === 'defaultValue' ? 'value' : k === 'defaultChecked' ? 'checked' : k, props[k])
  }
  return out
}

/** What a spread element without JSX children holds: content its props set, or `children`. */
export function inner(props: Record<string, any>, tag: string): unknown {
  const raw = props.dangerouslySetInnerHTML?.__html ?? props.innerHTML
  if (raw != null) return { t: String(raw) }
  return props.textContent ?? (tag === 'textarea' ? props.value ?? props.defaultValue : undefined) ?? props.children
}

// ---- <select value> -------------------------------------------------------------------------------------------

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')

/** `<select value="b">…<option value="b">` → the value attribute dropped and `selected` on the option. */
function resolveSelects(html: string): string {
  return html.replace(/<select\b([^>]*?)\svalue="([^"]*)"([^>]*)>([\s\S]*?)<\/select>/g, (_, pre, value, post, body) => {
    const want = decode(value)
    const options = body.replace(/<option\b([^>]*)>([^<]*)/g, (m: string, attrs: string, text: string) => {
      if (/\sselected\b/.test(attrs)) return m
      const v = /\svalue="([^"]*)"/.exec(attrs)
      return (v ? decode(v[1]) : decode(text).trim()) === want ? `<option${attrs} selected>${text}` : m
    })
    return `<select${pre}${post}>${options}</select>`
  })
}
