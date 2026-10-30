// weft/ssr: the string renderer, and the helpers weft's back end emits for `generate: 'ssr'` (research 19 §3). It
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
import { createApp, useApp, type AppOptions } from './scope'
import { withHead, type HeadOptions } from './head'

export { memo }
export { For, mergeProps } from './dom'
export { component } from './dom-next'
export { mergeMeta, metaTags, headTags } from './head'
export type { HeadOptions, Merged, Meta, Og, Site, Tag, Twitter, Extra, Image } from './head'

type Node = { t: string }

let selects = false // set by modules that bind a <select> value (`select`)
let writeKeys = true

export interface RenderOptions {
  /** Emit hydration keys for `hydrate()` (default true). */
  hydratable?: boolean
  /** The request's app: each render gets its own defineState instances (seeded from `state`), never a shared one. */
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
  let last: SsrData | null = null
  const run = () => {
    html.clear()
    wait = []
    const out = pass(code, options, cache, wait, flight, html)
    last = out.data
    return out.html
  }
  const shell = run()
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
  return { shell, chunks: chunks(), data: () => (last && (Object.keys(last.r).length || Object.keys(last.b).length) ? last : null) }
}

function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[], flight: Map<string, Promise<unknown>>): string
function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[], flight: Map<string, Promise<unknown>>, stream: Map<string, string>): { html: string; data: SsrData }
function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[], flight: Map<string, Promise<unknown>>, stream?: Map<string, string>): any {
  const prev = { ...rt }
  const prevKeys = { ...keys }
  const prevWrite = writeKeys
  const data: SsrData = { r: cache, b: {} }
  Object.assign(rt, { server: true, data, wait, resolve: text, flight, stream })
  // Keys are always computed (resources and boundaries are found by them across passes); written only if hydratable.
  Object.assign(keys, { on: true, hydrating: false, p: '', n: 0 })
  writeKeys = options.hydratable !== false
  let html = ''
  const prevApp = useApp(createApp(options.app)) // a swap, not an owner: the render is synchronous
  try {
    createRoot(dispose => {
      try { html = text(code) } finally { dispose() }
    }, null)
  } finally {
    useApp(prevApp)
    Object.assign(rt, { server: prev.server, data: prev.data, wait: prev.wait, resolve: prev.resolve, flight: prev.flight, stream: prev.stream })
    Object.assign(keys, prevKeys)
    writeKeys = prevWrite
  }
  if (selects) html = resolveSelects(html)
  if (stream) return { html, data: { r: data.r, b: data.b } }
  if (options.hydratable === false || (!Object.keys(data.r).length && !Object.keys(data.b).length)) return html
  const json = JSON.stringify({ r: data.r, b: data.b }).replace(/</g, '\\u003c')
  return `${html}<script type="application/json" data-weft>${json}</script>`
}

// ---- templates and holes --------------------------------------------------------------------------------------

/** A template instance: `fn` gets its key and returns its HTML. */
export function ssr(fn: (k: string) => string): Node {
  return { t: fn(nextKey()) }
}

/** The root's key attribute, when the output is hydratable. */
export function key(k: string): string {
  return writeKeys ? ` wk="${k}"` : ''
}

/** Hole `slot` of the template keyed `k`: its value, escaped, rendered in the hole's own scope. */
export function hole(k: string, slot: number, value: unknown): string {
  return under(`${k}.${slot}/`, () => text(value))
}

/**
 * A value as HTML: functions are read, finished nodes pass through, text is escaped, and adjacent texts get a
 * `<!--,-->` between them so the client finds one text node per value.
 */
function text(v: unknown): string {
  const out: string[] = []
  let lastText = false
  const walk = (v: any) => {
    while (typeof v === 'function') v = v()
    if (v == null || typeof v === 'boolean' || v === '') return
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v === 'object' && typeof v.t === 'string') {
      out.push(v.t)
      lastText = false
      return
    }
    if (lastText) out.push('<!--,-->')
    out.push(escape(String(v)))
    lastText = true
  }
  walk(v)
  return out.join('')
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

const NAMES: Record<string, string> = { className: 'class', htmlFor: 'for' }

/**
 * ` name="value"` for a dynamic attribute or property: `null`/`false` drop it, `true` writes the bare name. ARIA
 * attributes write booleans as the words (`aria-pressed="false"`), as weft/dom does.
 */
export function attr(name: string, value: any): string {
  name = NAMES[name] ?? name
  if (typeof value === 'boolean' && name.startsWith('aria-')) value = String(value)
  if (name === 'class') value = classes(value)
  else if (name === 'style') value = styles(value)
  if (value == null || value === false || value === '' && (name === 'class' || name === 'style')) return ''
  if (value === true) return ` ${name}`
  return ` ${name}="${escape(String(value), true)}"`
}

function classes(v: any): string {
  if (v == null || v === false) return ''
  if (typeof v !== 'object') return String(v)
  return Object.keys(v).filter(k => v[k]).join(' ')
}

function styles(v: any): string {
  if (v == null || typeof v !== 'object') return v ?? ''
  let out = ''
  for (const k of Object.keys(v)) if (v[k] != null) out += `${out ? ';' : ''}${k}:${v[k]}`
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
    if (k === 'children' || k === 'ref' || k === 'key' || /^on[A-Z]/.test(k)) continue
    out += attr(k, props[k])
  }
  return out
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
