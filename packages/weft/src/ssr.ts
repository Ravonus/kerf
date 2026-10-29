// weft/ssr: the string renderer, and the helpers Solid 2's SSR back end imports (`generate: 'ssr'`). It runs on
// weft's own reactive core with effects off, so the server and the client build the same owner tree and the
// hydration keys (`_hk`) line up: memos, roots and `scope()` holes take an id from their owner; elements take one
// each. `renderToString` renders what it can now (a pending `resource` renders its Boundary's fallback, and the
// client fetches after hydrating); `renderToStringAsync` waits for the resources and renders again until none is
// pending. Streaming comes with Phase 3.
//
// Hydratable output ends with `<script type="application/json" data-weft>`: resolved resources and boundary
// states by hydration key. Put the whole string in the container `hydrate()` gets.

import { childKey, createRoot, getOwner, memo, rt, runWith, type Owner, type SsrData } from './index'
import { createApp, useApp, type AppOptions } from './scope'

export { memo }
export { createComponent, For, mergeProps } from './dom'

type Node = { t: string }

let selects = false // set once by modules that bind a <select> value (ssrSelectValues)

export interface RenderOptions {
  /** Emit hydration keys and markers for `hydrate()` (default true). */
  hydratable?: boolean
  /** The request's app: each render gets its own defineState instances (seeded from `state`), never a shared one. */
  app?: AppOptions
}

/** Render `code` (usually `() => <App />`) to HTML now. Effects and watchers don't run on the server. */
export function renderToString(code: () => unknown, options: RenderOptions = {}): string {
  return pass(code, options, {}, [])
}

/** Render, wait for the resources it started, and render again until none is pending (at most `passes`). */
export async function renderToStringAsync(code: () => unknown, options: RenderOptions & { passes?: number } = {}): Promise<string> {
  const cache: SsrData['r'] = {}
  for (let n = 1; ; n++) {
    const wait: Promise<unknown>[] = []
    const html = pass(code, options, cache, wait)
    if (!wait.length || n >= (options.passes ?? 10)) return html
    await Promise.all(wait)
  }
}

function pass(code: () => unknown, options: RenderOptions, cache: SsrData['r'], wait: Promise<unknown>[]): string {
  const prev = { ...rt }
  const data: SsrData = { r: cache, b: {} }
  Object.assign(rt, { server: true, ids: options.hydratable !== false, data, wait, resolve })
  let html = ''
  const prevApp = useApp(createApp(options.app)) // a swap, not an owner: the render is synchronous and ids stay put
  try {
    createRoot(dispose => {
      try { html = resolve(code()) } finally { dispose() }
    }, null, rt.ids ? '' : undefined)
  } finally {
    useApp(prevApp)
    Object.assign(rt, { ids: prev.ids, server: prev.server, data: prev.data, wait: prev.wait, resolve: prev.resolve })
  }
  if (selects) html = resolveSelects(html)
  if (options.hydratable === false || (!Object.keys(data.r).length && !Object.keys(data.b).length)) return html
  const json = JSON.stringify({ r: data.r, b: data.b }).replace(/</g, '\\u003c')
  return `${html}<script type="application/json" data-weft>${json}</script>`
}

// ---- holes ----------------------------------------------------------------------------------------------------

function resolve(v: any): string {
  while (typeof v === 'function') v = v()
  if (v == null || typeof v === 'boolean') return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return '' + v
  if (Array.isArray(v)) {
    let s = ''
    for (const x of v) s += resolve(x)
    return s
  }
  if (typeof v.t === 'string') return v.t
  return escape(String(v))
}

/** A compiled template: static parts around holes. A group (`ssrGroup`) fills several holes from one call. */
export function ssr(t: string[] | string, ...holes: any[]): Node {
  if (typeof t === 'string') return { t }
  let s = t[0], group: any, values: any[] = [], at = 0
  for (let i = 0; i < holes.length; i++) {
    let h = holes[i]
    if (typeof h === 'function' && h.$g) {
      if (h !== group) { group = h; values = h(); at = 0 }
      h = values[at++]
    }
    s += resolve(h) + t[i + 1]
  }
  return { t: s }
}

export function ssrGroup<T extends () => any[]>(fn: T, n: number): T {
  ;(fn as any).$g = n
  return fn
}

/**
 * A content hole that can create owners or elements: it reserves the next id now, in template order, and its
 * content counts from zero under that id whenever it renders (the client's scoped insert effect does the same).
 */
export function scope(fn: () => unknown): () => unknown {
  if (!rt.ids) return fn
  const parent = getOwner()
  const o: Owner = { owned: null, cleanups: null, owner: parent, context: parent?.context, hk: childKey(parent) }
  return () => {
    o.hc = 0
    return { t: runWith(o, () => resolve(fn())) }
  }
}

export function ssrHydrationKey(): string {
  const key = rt.ids ? childKey(getOwner()) : undefined
  return key === undefined ? '' : ` _hk=${key}`
}

// ---- escaping -------------------------------------------------------------------------------------------------

const CONTENT = /[&<]/g
const ATTR = /[&"<]/g
const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '"': '&quot;' }

/** Escape a hole's value: text (`&`, `<`) or an attribute (`&`, `"`, `<`). Finished nodes pass through. */
export function escape(s: any, attr?: boolean): any {
  if (typeof s === 'string') {
    const re = attr ? ATTR : CONTENT
    re.lastIndex = 0
    return re.test(s) ? s.replace(re, c => ENTITY[c]) : s
  }
  if (attr) return s == null || typeof s === 'boolean' || typeof s === 'number' ? s : escape(String(s), true)
  if (Array.isArray(s)) return s.map(x => escape(x))
  if (typeof s === 'function') {
    if (s.$e) return s
    const late = () => escape(s())
    late.$e = true
    return late
  }
  return s
}

// ---- attributes -----------------------------------------------------------------------------------------------

/** `value` is already escaped by the compiler; `key` is a literal attribute name. */
export function ssrAttribute(key: string, value: any): string {
  if (typeof value === 'string') return ` ${key}="${value}"`
  if (value == null || value === false) return ''
  if (value === true) return ` ${key}`
  return ` ${key}="${typeof value === 'number' ? value : escape(String(value), true)}"`
}

export function ssrClassName(value: any): string {
  if (typeof value === 'number') return '' + value
  if (!value) return ''
  if (typeof value === 'string') return escape(value, true)
  const on = Array.isArray(value) ? value.filter(Boolean).flatMap(v => (typeof v === 'string' ? [v] : Object.keys(v).filter(k => v[k]))) : Object.keys(value).filter(k => value[k])
  return on.map(k => escape(k, true)).join(' ')
}

export function ssrStyle(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return escape(value, true)
  let out = ''
  for (const k of Object.keys(value)) {
    const v = value[k]
    if (v != null) out += (out ? ';' : '') + `${escape(k, true)}:${escape(v, true)}`
  }
  return out
}

/** `name` arrives as `"color:"` (the compiler escapes computed keys). */
export function ssrStyleProperty(name: string, value: any): string {
  return value != null ? name + value : ''
}

export function ssrStyleProperties(...entries: any[]): string {
  let out = ''
  for (let i = 0; i < entries.length; i += 2) {
    const e = ssrStyleProperty(entries[i], entries[i + 1])
    if (e) out = out ? out + ';' + e : e
  }
  return out
}

/** One attribute of a spread element, as `ssrElement` writes it. */
export function ssrElementAttribute(key: string, value: any): string {
  if (value == null) return ''
  if (key === 'class' || key === 'style') return ` ${key}="${key === 'class' ? ssrClassName(value) : ssrStyle(value)}"`
  if (typeof value === 'boolean') return value ? ` ${key}` : ''
  return value === '' ? ` ${key}` : ` ${key}="${escape(value, true)}"`
}

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/
const NAMES: Record<string, string> = { className: 'class', htmlFor: 'for' }

/**
 * `<div {...props}>`: `props` is a source, an array of them (later wins per key) or a thunk returning either.
 * `skip(key)` names keys `attrs()` writes; `children` is the compiled children thunk, else `props.children`.
 */
export function ssrElement(tag: string, props: any, children?: any, needsId?: boolean, skip?: (k: string) => boolean, attrs?: () => string): Node {
  const hk = needsId ? ssrHydrationKey() : '' // before the props thunk: its memos take ids after the element's
  if (typeof props === 'function') props = props()
  const sources: any[] = (Array.isArray(props) ? props : [props]).map(s => (typeof s === 'function' ? s() : s)).filter(s => s != null)
  const owner = new Map<string, any>()
  for (const s of sources) for (const k of Object.keys(s)) { owner.delete(k); owner.set(k, s) }
  let a = ''
  for (const [k, s] of owner) {
    if (k === 'children' || k === 'ref' || /^on[A-Z]/.test(k) || k.includes(':') || skip?.(k)) continue
    a += ssrElementAttribute(NAMES[k] ?? k, s[k])
  }
  if (attrs) a += attrs()
  if (VOID.test(tag)) return { t: `<${tag}${hk}${a}>` }
  const body = children !== undefined ? resolve(children) : owner.has('children') ? resolve(escape(owner.get('children').children)) : ''
  return { t: `<${tag}${hk}${a}>${body}</${tag}>` }
}

/** Anchors a router marks as current; weft has no router yet, so nothing is added. */
export function ssrLinkClaim(_attrs: Record<string, unknown>): string {
  return ''
}

/** Refs don't run on the server. */
export function applyRef(_r: unknown, _el: unknown) {}

// ---- <select value> -------------------------------------------------------------------------------------------

/** Emitted once by modules that bind a `<select>` value: the render then marks the matching options. */
export function ssrSelectValues() {
  selects = true
}

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
