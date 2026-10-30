// The request handler (research 25 §3–§5): match the path and run the loaders on @tanstack/router-core, merge the
// metadata (research 20 §1: awaited before the first byte, plain data), then stream the page: the head with every
// tag and the shell first, each Boundary's content as it resolves, the page data last. The same resolve step answers
// client navigations (`/_weft/data/<path>`) and renders share cards (`/_weft/og/<path>.png`).
//
// Status codes are decided before the first byte: 404 when nothing matches or a loader returns `notFound()`, 500 when
// a loader or `meta` throws. Both render inside the root layout when it loaded.

import { BaseRootRoute, BaseRoute, RouterCore, createNonReactiveMutableStore, createNonReactiveReadonlyStore, isNotFound } from '@tanstack/router-core'
import { createMemoryHistory } from '@tanstack/history'
import { headTags, mergeMeta, metaTags, renderToStream, renderToString, type Merged, type Meta as MetaObject, type Site } from 'weft/ssr'
import { createRouteState, type Component, type Match, type RoutePayload } from './router'
import { App } from './view'
import { DefaultCard } from './og/DefaultCard'
import { ErrorPage, NotFoundPage } from './builtin'
// @ts-expect-error: plain JS module
import { renderCard } from './og/index.mjs'

export interface RouteEntry { id: string; file: string; layouts: string[]; pattern: string; params: string[]; splat?: string; card?: string; kind: 'page' | '404' | 'error' }
export interface LayoutEntry { id: string; file: string; dir: string; parent?: string }
export interface Manifest { dir: string; routes: RouteEntry[]; layouts: LayoutEntry[]; defaultCard?: string }

export interface RouteModule {
  default?: Component
  load?: (args: { params: Record<string, string>; request: Request; signal: AbortSignal }) => unknown
  meta?: MetaObject | ((args: { params: Record<string, string>; data: any }) => MetaObject | Promise<MetaObject>)
  prerender?: Record<string, string>[] | (() => Record<string, string>[] | Promise<Record<string, string>[]>)
  size?: { width: number; height: number }
}

export interface Font { name: string; data: Uint8Array; weight?: number; style?: 'normal' | 'italic' }

export interface HandlerOptions {
  manifest: Manifest
  /** Route, layout and card modules by manifest file. */
  modules: Record<string, RouteModule>
  site?: Site
  /** The client entry and what to preload (Nitro's `?assets=client`). */
  assets?: { entry?: string; js?: { href: string }[]; css?: { href: string }[] }
  /** Changes with every build: part of each card's `?v=` hash. */
  build?: string
  dev?: boolean
  fonts?: Font[]
  /** Stream timeout for Boundaries (ms). */
  timeout?: number
  /** Dev and tests: diagnostics found while serving (H005–H008). */
  onDiagnostic?: (d: { code: string; severity: string; message: string; route?: string }) => void
}

export interface Level extends Match { mod?: RouteModule; raw: unknown }

export interface Resolved {
  status: number
  path: string
  levels: Level[]
  head: Merged
  /** The page route, when one matched. */
  route?: RouteEntry
  error?: unknown
}

const CARD = { width: 1200, height: 630 }
const stores = () => ({ createMutableStore: createNonReactiveMutableStore, createReadonlyStore: createNonReactiveReadonlyStore, batch: (f: () => void) => f() })
const json = (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c')
const esc = (s: string) => s.replace(/[&<"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&quot;'))
const thenable = (v: any): v is PromiseLike<unknown> => v != null && typeof v.then === 'function'

/** `/` → `index`, `/users/42` → `users/42`: the card path under `/_weft/og/`. */
export const cardPath = (path: string) => (path.replace(/[?#].*/, '').replace(/^\/+|\/+$/g, '') || 'index')

/** FNV-1a, twice (different seeds), in base 36: a stable, sync content hash for `?v=`. */
export function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  return ((a >>> 0).toString(36) + (b >>> 0).toString(36)).slice(0, 10)
}

export function createHandler(options: HandlerOptions) {
  const { manifest, modules, site = {} } = options
  const byId = new Map(manifest.routes.map(r => [r.id, r]))
  const layouts = new Map(manifest.layouts.map(l => [l.id, l]))
  const mod = (file?: string) => (file ? modules[file] : undefined)
  const comps: Record<string, Component> = { 404: NotFoundPage, error: ErrorPage }
  for (const l of manifest.layouts) if (mod(l.file)?.default) comps[l.id] = mod(l.file)!.default!
  for (const r of manifest.routes) if (mod(r.file)?.default) comps[r.id] = mod(r.file)!.default!
  const tree = routeTree(manifest, modules)

  async function resolve(path: string, request: Request): Promise<Resolved> {
    const router = new RouterCore({ routeTree: tree, history: createMemoryHistory({ initialEntries: [path] }), isServer: true, context: { request } } as any, stores as any)
    await router.load()
    const matches = router.state.matches.map(m => ({ m, weft: (router.routesById as any)[m.routeId]?.options.weft as RouteEntry | LayoutEntry | undefined }))
    const params = (m: any) => cleanParams(m.params)
    const leaf = matches.at(-1)?.weft
    const route = leaf && 'kind' in leaf ? leaf : undefined
    const failed = matches.find(x => x.m.status === 'error')
    const missing = !route || matches.some(x => x.m.status === 'notFound' || isNotFound(x.m.error))
    const rootLayout = manifest.layouts.find(l => l.dir === '')
    const rootOk = rootLayout && matches[0]?.weft === rootLayout && matches[0].m.status === 'success' ? matches[0] : undefined
    const levelOf = (x: (typeof matches)[number]): Level => {
      const raw = x.m.loaderData
      return { id: x.weft!.id, params: params(x.m), mod: mod(x.weft!.file), raw, ...split(raw) }
    }
    const special = (id: '404' | 'error', status: number, error?: unknown): Promise<Resolved> => {
      const entry = byId.get(id)
      const data = id === 'error' ? { status, message: options.dev && error instanceof Error ? error.message : 'Something went wrong.' } : { path }
      const levels: Level[] = [...(rootOk && !(failed && failed === rootOk) ? [levelOf(rootOk)] : []), { id, params: {}, data, raw: data, mod: mod(entry?.file) }]
      if (entry && mod(entry.file)?.default) comps[id] = mod(entry.file)!.default!
      return finish(levels, status, undefined, error)
    }
    const finish = async (levels: Level[], status: number, route?: RouteEntry, error?: unknown): Promise<Resolved> => {
      const metas: MetaObject[] = []
      for (const lv of levels) {
        const m = lv.mod?.meta ?? (lv.id === '404' ? { title: 'Not found' } : lv.id === 'error' ? { title: 'Error' } : undefined)
        if (!m) continue
        metas.push(typeof m === 'function' ? await m({ params: lv.params, data: settledView(lv.raw, lv.d, lv.id, options) }) : m)
      }
      const head = mergeMeta(site, ...metas)
      if (head.og.image === 'auto') head.og.image = status === 200 && route ? { url: cardUrl(route, levels, head, path), ...CARD } : undefined
      return { status, path, levels, head, route, error }
    }

    if (failed) return special('error', 500, failed.m.error)
    if (missing) return special('404', 404)
    const levels = matches.filter(x => x.weft).map(levelOf)
    try {
      return await finish(levels, 200, route)
    } catch (e) {
      if (isNotFound(e)) return special('404', 404)
      return special('error', 500, e)
    }
  }

  function cardUrl(route: RouteEntry, levels: Level[], head: Merged, path: string) {
    const card = route.card ?? manifest.defaultCard ?? 'builtin'
    const size = mod(route.card)?.size ?? CARD
    const leaf = levels.at(-1)!
    const { image: _, ...og } = head.og
    const v = hash([options.build ?? '', card, JSON.stringify(size), JSON.stringify({ ...head, og }), JSON.stringify(leaf.data ?? null)].join('\0'))
    return `/_weft/og/${cardPath(path)}.png?v=${v}`
  }

  async function page(url: URL, request: Request): Promise<Response> {
    const path = url.pathname + url.search
    const r = await resolve(path, request)
    // The server renders from the raw data (deferred fields are still promises, for Boundaries to stream); the page
    // carries the settled part.
    const route = createRouteState({ ...payloadOf(r, false), m: r.levels.map(lv => ({ id: lv.id, params: lv.params, data: lv.raw })) }, comps)
    const s = renderToStream(() => <App route={route} />, { timeout: options.timeout })
    const assets = options.assets ?? {}
    const lang = site.locale ? ` lang="${esc(site.locale.replace('_', '-'))}"` : ''
    const head =
      `<!doctype html>\n<html${lang}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      metaTags(r.head, url.pathname) + '\n' +
      (assets.css ?? []).map(c => `<link rel="stylesheet" href="${esc(c.href)}">\n`).join('') +
      (assets.js ?? []).map(c => `<link rel="modulepreload" href="${esc(c.href)}">\n`).join('') +
      // Dev: Vite's client (HMR) and weft's agent bridge, which transformIndexHtml adds to HTML-file apps.
      (options.dev ? '<script type="module" src="/@vite/client"></script>\n<script type="module" src="/@weft-agent.js"></script>\n' : '') +
      (assets.entry ? `<script type="module" src="${esc(assets.entry)}"></script>\n` : '') +
      `</head>\n<body>\n<div id="app">${s.shell}</div>\n<script type="application/json" id="weft-route">${json(payloadOf(r, false))}</script>\n`
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode(head))
        try {
          for await (const chunk of s.chunks) controller.enqueue(enc.encode(chunk + '\n'))
        } catch (e) {
          options.onDiagnostic?.({ code: 'E_STREAM', severity: 'error', message: String(e) })
        }
        controller.enqueue(enc.encode(`<script type="application/json" id="weft-data">${json(s.data())}</script>\n</body>\n</html>\n`))
        controller.close()
      },
    })
    return new Response(body, { status: r.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } })
  }

  /** The route as JSON for client navigation: deferred fields awaited (no streaming on navigation yet). */
  async function data(path: string, request: Request): Promise<Response> {
    const r = await resolve(path, request)
    for (const lv of r.levels) if (lv.d?.length) lv.data = { ...(lv.data as object), ...Object.fromEntries(await Promise.all(lv.d.map(async k => [k, await (lv.raw as any)[k]]))) }
    return Response.json(payloadOf(r, true), { status: 200, headers: { 'cache-control': 'no-cache' } })
  }

  async function og(url: URL, request: Request): Promise<Response> {
    const path = '/' + url.pathname.slice('/_weft/og/'.length).replace(/\.png$/, '').replace(/^index$/, '')
    const r = await resolve(path, request)
    if (r.status !== 200 || !r.route) return new Response('Not found', { status: 404 }) // only params the route's own load accepts
    const image = r.head.og.image
    const want = typeof image === 'object' ? new URL(image.url, url).searchParams.get('v') : null
    const cardMod = mod(r.route.card ?? manifest.defaultCard)
    const Card = (cardMod?.default ?? DefaultCard) as Component
    const leaf = r.levels.at(-1)!
    const props = { params: leaf.params, data: settledView(leaf.raw, leaf.d, leaf.id, options), meta: r.head, site, title: r.head.og.title ?? r.head.title, description: r.head.og.description ?? r.head.description ?? '' }
    const html = renderToString(() => <Card {...props} />, { hydratable: false })
    const png = await renderCard(html, cardMod?.size ?? CARD, options.fonts ?? [], {
      strict: false,
      onDiagnostic: (d: any) => options.onDiagnostic?.({ ...d, route: r.route!.id }),
    })
    const fresh = want !== null && url.searchParams.get('v') === want
    const cache = options.dev ? 'no-store' : fresh ? 'public, max-age=31536000, immutable' : 'no-cache'
    return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': cache } })
  }

  /** Build mode (research 20 §4.3): the card URLs `weft build` prerenders, queued through Nitro's `x-nitro-prerender`. */
  async function prerenderList(request: Request): Promise<Response> {
    const paths: string[] = []
    for (const route of manifest.routes) {
      if (route.kind !== 'page') continue
      let list: Record<string, string>[] = [{}]
      if (route.params.length) {
        const p = mod(route.file)?.prerender
        list = p ? (typeof p === 'function' ? await p() : p) : []
      }
      for (const params of list) {
        const path = fill(route.pattern, params, route.splat)
        const r = await resolve(path, request)
        const image = r.head.og.image
        if (r.status === 200 && typeof image === 'object' && image.url.startsWith('/_weft/og/')) paths.push(image.url.replace(/\?.*/, ''))
      }
    }
    // HTML, because Nitro's prerenderer only follows links (and this header) from HTML responses.
    const list = paths.map(p => `<a href="${esc(p)}">${esc(p)}</a>`).join('\n')
    return new Response(`<!doctype html>\n<meta name="robots" content="noindex">\n${list}\n`, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-nitro-prerender': paths.join(',') } })
  }

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
    if (url.pathname.startsWith('/_weft/og/') && url.pathname.endsWith('.png')) return og(url, request)
    if (url.pathname.startsWith('/_weft/data/') || url.pathname === '/_weft/data') return data((url.pathname.slice('/_weft/data'.length) || '/') + url.search, request)
    if (url.pathname === '/_weft/og-routes') return prerenderList(request)
    return page(url, request)
  }
  return Object.assign(handler, { resolve })
}

/** The router-core tree for the manifest: layouts are path prefixes, routes hang under their innermost layout. */
function routeTree(manifest: Manifest, modules: Record<string, RouteModule>) {
  const loader = (file: string) => async ({ params, context, abortController }: any) => {
    const load = modules[file]?.load
    if (!load) return undefined
    const v = await load({ params: cleanParams(params), request: context.request, signal: abortController.signal })
    if (isNotFound(v)) throw v
    return v
  }
  const rootLayout = manifest.layouts.find(l => l.dir === '')
  const root = new BaseRootRoute({ ...(rootLayout && { loader: loader(rootLayout.file), weft: rootLayout }) } as any)
  const top = { route: root, children: [] as any[], dir: '' }
  const nodes = new Map<string, typeof top>()
  const at = (id: string | undefined) => (id ? nodes.get(id) ?? top : top)
  for (const l of manifest.layouts) {
    if (l.dir === '') { nodes.set(l.id, top); continue }
    const parent = at(l.parent)
    const route = new BaseRoute({ getParentRoute: () => parent.route, path: toPath(l.dir, parent.dir), loader: loader(l.file), weft: l } as any)
    parent.children.push(route)
    nodes.set(l.id, { route, children: [], dir: l.dir })
  }
  for (const r of manifest.routes) {
    if (r.kind !== 'page') continue
    const parent = at(r.layouts.at(-1))
    const rel = r.pattern.slice(1).split('/').slice(parent.dir ? parent.dir.split('/').length : 0).join('/')
    parent.children.push(new BaseRoute({ getParentRoute: () => parent.route, path: rel || '/', loader: loader(r.file), weft: r } as any))
  }
  // Innermost layouts first, so each route's children are attached before its parent takes it.
  for (const n of [...new Set(nodes.values())].filter(n => n !== top).sort((a, b) => b.dir.length - a.dir.length)) if (n.children.length) n.route.addChildren(n.children)
  return root.addChildren(top.children)
}

/** A layout dir relative to its parent layout's, as a router-core path: `users/[id]` → `users/$id`. */
function toPath(dir: string, parentDir: string) {
  const rel = dir.split('/').slice(parentDir ? parentDir.split('/').length : 0)
  return rel.map(s => s.replace(/^\[\.\.\.(\w+)\]$/, '$').replace(/^\[(\w+)\]$/, '$$$1')).join('/')
}

/** router-core's params without its splat aliases; a splat is under its file name (`[...rest]` → `rest`). */
function cleanParams(p: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k in p) if (k !== '*' && k !== '_splat') out[k] = String(p[k])
  return out
}

function fill(pattern: string, params: Record<string, string>, splat?: string) {
  return pattern.replace(/\$([\w$]*)/g, (_, n) => (n ? encodeURIComponent(params[n]) : String(params[splat!] ?? '')))
}

/** The data without its deferred (promise) fields, and their names. */
function split(raw: unknown): { data: unknown; d?: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: raw }
  const d = Object.keys(raw).filter(k => thenable((raw as any)[k]))
  if (!d.length) return { data: raw }
  for (const k of d) Promise.resolve((raw as any)[k]).catch(() => {}) // a deferred failure surfaces in its Boundary
  return { data: Object.fromEntries(Object.entries(raw).filter(([k]) => !d.includes(k))), d }
}

/** What `meta` and cards see: the settled data. Reading a deferred field is H007 (it's still streaming). */
function settledView(raw: unknown, deferred: string[] | undefined, id: string, options: HandlerOptions) {
  if (!deferred?.length) return raw
  return new Proxy(raw as object, {
    get(t, k, r) {
      if (typeof k === 'string' && deferred.includes(k)) {
        const message = `H007 \`meta\` (or a card) of route ${id} reads \`data.${k}\`, a deferred field that is still streaming. Await it in \`load\`, or leave it out of \`meta\`.`
        options.onDiagnostic?.({ code: 'H007', severity: 'error', message, route: id })
        throw Object.assign(new Error(message), { code: 'H007' })
      }
      return Reflect.get(t, k, r)
    },
  })
}

function payloadOf(r: Resolved, withHead: boolean): RoutePayload {
  return { m: r.levels.map(({ id, params, data, d }) => ({ id, params, data, ...(d && { d }) })), p: r.path, s: r.status, ...(withHead && { h: r.head }) }
}

export { headTags }
