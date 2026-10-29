// weft/ssr: the string renderer, and the helpers weft's back end emits for `generate: 'ssr'` (research 19 §3). It
// runs on weft's own reactive core with effects off. Each template renders as `ssr(k => "<li" + key(k) + … )`: `k`
// is the instance's hydration key (research 19 §2.4), written as ` wk="…"` on the root when the output is
// hydratable, and each hole renders in its own scope (`hole(k, slot, value)`), wrapped in `<!--[-->…<!--]-->` when
// it shares its parent with other content. `renderToString` renders what it can now (a pending `resource` renders
// its Boundary's fallback, and the client fetches after hydrating); `renderToStringAsync` waits for the resources
// and renders again until none is pending. Streaming comes with Phase 3.
//
// Hydratable output ends with `<script type="application/json" data-weft>`: resolved resources and boundary
// states by key. Put the whole string in the container `hydrate()` gets.

import { createRoot, memo, rt, type SsrData } from './index'
import { keys, nextKey, under } from './keys'
import { createApp, useApp, type AppOptions } from './scope'

export { memo }
export { For, mergeProps } from './dom'
export { component } from './dom-next'

type Node = { t: string }

let selects = false // set by modules that bind a <select> value (`select`)
let writeKeys = true

export interface RenderOptions {
  /** Emit hydration keys for `hydrate()` (default true). */
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
  const prevKeys = { ...keys }
  const prevWrite = writeKeys
  const data: SsrData = { r: cache, b: {} }
  Object.assign(rt, { server: true, data, wait, resolve: text })
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
    Object.assign(rt, { server: prev.server, data: prev.data, wait: prev.wait, resolve: prev.resolve })
    Object.assign(keys, prevKeys)
    writeKeys = prevWrite
  }
  if (selects) html = resolveSelects(html)
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

/** ` name="value"` for a dynamic attribute or property: `null`/`false` drop it, `true` writes the bare name. */
export function attr(name: string, value: any): string {
  name = NAMES[name] ?? name
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
