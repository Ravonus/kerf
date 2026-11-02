// The request handler (research 25 §3–§5): match the path and run the loaders on @tanstack/router-core, merge the
// metadata (research 20 §1: awaited before the first byte, plain data), then stream the page: the head with every
// tag and the shell first, each Boundary's content as it resolves, the page data last. The same resolve step answers
// client navigations (`/_weft/data/<path>`) and renders share cards (`/_weft/og/<path>.png`).
//
// Status codes are decided before the first byte: 404 when nothing matches or a loader returns `notFound()`, 500 when
// a loader or `meta` throws, 307 (or the given status) when a loader calls `redirect()`. 404 and 500 render inside
// the root layout when it loaded.
//
// A build's stylesheets go in the page, a round trip saved before the first paint. Each `<style>` keeps a disabled link
// beside it: a disabled link is never fetched, and it is how Vite's preload helper, on importing a route's chunk, sees
// the sheet is there and doesn't apply it twice.
//
// Server functions (research 27): each request gets a scope (AsyncLocalStorage), so `q.fetch()` in loaders and `q()`
// in the render share one request cache; `/_weft/fn/<id>` answers the client's calls; the page ends with the
// scope's resolved entries (`#weft-cache`) so the client cache starts seeded and hydration fetches nothing.
//
// Forms and media (research 29): a form POST to a page URL runs its mutation, then answers 303 or the page with the
// errors in it, so `<Form>` works without JS. `/_weft/m/<hash>/<width>.<fmt>` serves media through the `media.server`
// provider. The request's cookies reach `persist: 'cookie'` boxes, and the `rt.isolated` below makes a scope reached
// outside a render S002: this process serves many users, so it has no "the tab's app".

import { AsyncLocalStorage } from 'node:async_hooks'
import { BaseRootRoute, BaseRoute, RouterCore, createNonReactiveMutableStore, createNonReactiveReadonlyStore, isNotFound } from '@tanstack/router-core'
import { createMemoryHistory } from '@tanstack/history'
import { rt } from 'weft'
import { headTags, mergeMeta, metaTags, region, renderToStream, renderToString, renderToStringAsync, type Merged, type Meta as MetaObject, type Site, type Stream } from 'weft/ssr'
import { createRouteState, type Component, type Match, type RoutePayload } from './router'
import { sessionChanged, type AuthProvider } from './auth'
import { EXTENSION, type ExtensionEntry, type ServerExtension } from './extension'
import { CLIENT_IP, decodeForm, fieldsOf, FnError, fns, isRedirect, keyOf, runtime, StartError, type Redirect, type SchemaIssue, type Wire } from './data'
import * as exec from './exec'
import type { MediaServer, Scope, Store } from './exec'
import { configure, hub, rtRoute, type RealtimeOptions } from './hub'
import { socketRoute } from './socket'
import { App } from './view'
import { DefaultCard } from './og/DefaultCard'
import { ErrorPage, NotFoundPage } from './builtin'
// @ts-expect-error: plain JS module
import { renderCard } from './og/index.mjs'
// @ts-expect-error: plain JS module
import { pageStyles } from './inline.mjs'
import { capture } from './capture.mjs'

export interface RouteEntry { id: string; file: string; layouts: string[]; pattern: string; params: string[]; splat?: string; card?: string; kind: 'page' | '404' | 'error' }
export interface LayoutEntry { id: string; file: string; dir: string; parent?: string }
export interface Manifest { dir: string; routes: RouteEntry[]; layouts: LayoutEntry[]; defaultCard?: string }

export interface RouteModule {
  default?: Component
  load?: (args: { params: Record<string, string>; request: Request; signal: AbortSignal; ctx: any }) => unknown
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
  /** The client entry and what to preload (Nitro's `?assets=client`), plus the font build's preloads (`weft:fonts/preloads`). */
  assets?: { entry?: string; js?: { href: string }[]; css?: { href: string }[]; fonts?: { href: string; type: string }[]; inline?: Record<string, string> }
  /** Changes with every build: part of each card's `?v=` hash. */
  build?: string
  dev?: boolean
  fonts?: Font[]
  /** Route and layout ids with no client code (PLAN §11): the server sends their HTML. */
  statics?: string[]
  /** Client chunks by level or island id: the page's own are preloaded, so they don't wait for the entry to ask. */
  chunks?: Record<string, { js?: { href: string }[]; css?: { href: string }[] }>
  /** Some island can wait, so every page carries the capture script: a navigation can arrive at one that does. */
  lazy?: boolean
  /** Stream timeout for Boundaries (ms). */
  timeout?: number
  /** The app's context for `load` and server functions (`src/context.server.ts`'s default export). */
  context?: (args: { request: Request }) => object | Promise<object>
  /** The shared cache for `cache: { life }` queries (memory by default). */
  store?: Store
  /** `src/auth.server.ts`'s default export, any provider: mounted at its base path, checked on the first request. */
  auth?: Pick<AuthProvider, 'handler' | 'basePath' | '$weft'>
  /** `server.extension` providers with an app file (`virtual:weft/extensions`), loaded on the first request. */
  extensions?: ExtensionEntry[]
  /** The app's migrations (`drizzle/`); dev reads them each request, so `weft db generate` needs no restart. */
  migrations?: () => { tag: string; sql: string }[]
  /** The `media.server` provider (`virtual:weft/media`), loaded on first use. */
  media?: () => Promise<MediaServer>
  /** `src/realtime.server.ts`'s default export: the bus, origins and limits. */
  realtime?: RealtimeOptions
  /** Dev and tests: diagnostics found while serving (H005–H008, Q002–Q010). */
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
  /** A loader called `redirect()`: nothing renders. */
  redirect?: Redirect
}

const als = new AsyncLocalStorage<Scope>()
runtime.scope = () => als.getStore()
runtime.enter = (scope, fn) => als.run(scope, fn)
runtime.exec = exec
rt.isolated = true
runtime.poke = (tags, origin) => hub().poke(tags, origin)

const CARD = { width: 1200, height: 630 }
const stores = () => ({ createMutableStore: createNonReactiveMutableStore, createReadonlyStore: createNonReactiveReadonlyStore, batch: (f: () => void) => f() })
const json = (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c')
const esc = (s: string) => s.replace(/[&<"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&quot;'))
const thenable = (v: any): v is PromiseLike<unknown> => v != null && typeof v.then === 'function'

/** Render passes a page may take. Only a backstop: a render stops when its passes stop reading anything new, and `timeout` ends a stream. */
const PASSES = 1024

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
  const statics = new Set(options.statics)
  /** The route state of a server render: where a static level is in it, it marks where each level starts (`region`). */
  const stateOf = (r: Resolved, payload: RoutePayload) => {
    const route = createRouteState({ ...payload, m: r.levels.map(lv => ({ id: lv.id, params: lv.params, data: lv.raw })) }, comps)
    if (r.levels.some(l => statics.has(l.id))) route.around = (d, id, body) => region(statics.has(id), d, statics.has(r.levels[d - 1]?.id), body)
    return route
  }
  const tree = routeTree(manifest, modules)
  let provider: Promise<MediaServer> | undefined
  const mediaServer = () => (provider ??= options.media?.())
  const scopeOptions = { context: options.context, store: options.store, dev: options.dev, onDiagnostic: options.onDiagnostic, media: mediaServer, extensions: undefined as ServerExtension[] | undefined }
  let checked = !options.dev
  const authBase = (options.auth?.basePath ?? '/api/auth').replace(/\/$/, '')
  const extensions = new Map<string, ServerExtension>()
  let loading: Promise<void> | undefined
  const loadExtensions = () => (loading ??= (async () => {
    for (const { key, load } of options.extensions ?? []) extensions.set(key, await load())
    scopeOptions.extensions = [...extensions.values()]
  })())
  let applied = -1
  configure({ ...options.realtime, build: options.build, dev: options.dev })

  /**
   * Before the first request (and in dev, when `drizzle/` grows): the auth secret, and the list each database applies
   * before its first statement (db/core.ts), so a page with no queries doesn't need one. A client whose statements can't
   * be held is migrated here; if that fails the request goes on, and Q016 is what using the database then gives.
   */
  async function boot() {
    const list = options.migrations?.() ?? []
    if (applied !== list.length) {
      options.auth?.$weft?.check()
      for (const e of extensions.values()) e.check?.(options.dev)
      applied = list.length
      const report = (e: unknown) => options.onDiagnostic?.({ code: 'Q016', severity: 'error', message: `Q016: ${(e as any)?.message ?? e}` })
      runtime.migrations = { list, report }
    }
    if (runtime.dbs?.size) await Promise.all([...runtime.dbs].map(ready => ready()?.catch(() => {})))
  }

  async function resolve(path: string, request: Request): Promise<Resolved> {
    const scope = als.getStore() ?? exec.createScope(request, scopeOptions)
    const hold: LoadContext = { request, scope, tags: new Map(), out: {} }
    const router = new RouterCore({ routeTree: tree, history: createMemoryHistory({ initialEntries: [path] }), isServer: true, context: hold } as any, stores as any)
    await router.load()
    const moved = hold.out.redirect
    if (moved) return { status: moved.status, path, levels: [], head: mergeMeta(site), redirect: moved }
    const matches = router.state.matches.map(m => ({ m, weft: (router.routesById as any)[m.routeId]?.options.weft as RouteEntry | LayoutEntry | undefined }))
    const params = (m: any, splat?: string) => cleanParams(m.params, splat)
    const leaf = matches.at(-1)?.weft
    const route = leaf && 'kind' in leaf ? leaf : undefined
    const failed = matches.find(x => x.m.status === 'error')
    const missing = !route || matches.some(x => x.m.status === 'notFound' || isNotFound(x.m.error))
    const rootLayout = manifest.layouts.find(l => l.dir === '')
    const rootOk = rootLayout && matches[0]?.weft === rootLayout && matches[0].m.status === 'success' ? matches[0] : undefined
    const levelOf = (x: (typeof matches)[number]): Level => {
      const raw = x.m.loaderData
      const t = hold.tags.get(x.weft!.file)
      return { id: x.weft!.id, params: params(x.m, (x.weft as RouteEntry).splat), mod: mod(x.weft!.file), raw, ...split(raw), ...(t?.size && { t: [...t] }) }
    }
    const special = (id: '404' | 'error', status: number, error?: unknown): Promise<Resolved> => {
      const entry = byId.get(id)
      if ((error as any)?.code && error instanceof StartError) options.onDiagnostic?.({ code: error.code, severity: 'error', message: error.message })
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

    if (failed) {
      const e = exec.dbError(failed.m.error)
      return special('error', (e as any)?.code === 'Q016' ? 503 : 500, e)
    }
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

  async function page(url: URL, request: Request, scope: Scope): Promise<Response> {
    const path = url.pathname + url.search
    const r = await resolve(path, request)
    if (r.redirect) return withHeaders(new Response(null, { status: r.redirect.status, headers: { location: r.redirect.href, 'cache-control': 'no-cache' } }), scope)
    scope.started = true // from here a redirect can't change the status (Q007)
    // The server renders from the raw data (deferred fields are still promises, for Boundaries to stream); the page
    // carries the settled part.
    const route = stateOf(r, payloadOf(r, false))
    const sent = new Set<string>()
    const told: { r: Record<string, unknown>; b: Record<string, unknown>; s?: string } = { r: {}, b: {} }
    /** Cache entries the client hasn't got. */
    const news = () => {
      const fresh = wire(scope).filter(w => !sent.has(keyOf(w[0], w[1])))
      for (const w of fresh) sent.add(keyOf(w[0], w[1]))
      return fresh
    }
    /** What the client hasn't been told of the render: each thing once, or a page of chunks repeats the page. */
    const since = () => {
      const d = s.data()
      const changed = <T,>(from: Record<string, T>, seen: Record<string, unknown>) => {
        const out = Object.fromEntries(Object.entries(from).filter(([k, v]) => seen[k] !== v))
        Object.assign(seen, out)
        return out
      }
      const state = JSON.stringify(d?.s)
      const fresh = state !== told.s
      told.s = state
      return { r: scrubbed(changed(d?.r ?? {}, told.r), scope), b: changed(d?.b ?? {}, told.b), ...(fresh && d?.s && { s: d.s }) }
    }
    const shown = (e: unknown) => exec.shown(e, scope)
    const stalled = () => options.onDiagnostic?.({ code: 'E_STREAM', severity: 'warning', message: `${path}: a render stopped reading anything new, so what's still out is left to the client. Is a query's input different on every render, a \`Date.now()\` say?` })
    const s = renderToStream(() => <App route={route} />, { timeout: options.timeout, passes: PASSES, shown, stalled, app: { cookies: cookieJar(request) }, landing: () => `(self.$wc=self.$wc||[]).push(${json({ c: news(), ...since() })});` })
    await s.settle() // queries read outside a Boundary have nowhere to stream to
    const payload = withLevels(payloadOf(r, false), s.shell, statics, false)
    const assets = options.assets ?? {}
    const parts = islandsOf(s.shell)
    // A Boundary is waiting: the page is usable before it lands, so the client starts now, not at the last byte.
    const streaming = Object.values(s.data()?.b ?? {}).includes('p')
    const now = !parts.lazy.length || payload.m.some(m => !m.s) || !!payload.i?.length
    const styles = pageStyles(assets, pageSheets(assets.css, parts, options.chunks), s.shell, site.head)
    const lang = site.locale ? ` lang="${esc(site.locale.replace('_', '-'))}"` : ''
    const head =
      `<!doctype html>\n<html${lang}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      metaTags(r.head, url.pathname) + '\n' +
      (site.head ? site.head + '\n' : '') +
      (assets.fonts ?? []).map(f => `<link rel="preload" as="font" type="${esc(f.type)}" href="${esc(f.href)}" crossorigin>\n`).join('') +
      // The entry's own script tag, just below, already fetches it. Above the styles: a preload found past 50 KB of CSS starts late.
      modulepreloads([...(assets.js ?? []), ...pageChunks(payload, options.chunks, saveData(request) ? [] : parts.fold, now)], assets) +
      // A streamed page's entry is at the end of what the shell sends, so its script tag is found late.
      (assets.entry && streaming ? `<link rel="modulepreload" href="${esc(assets.entry)}">\n` : '') +
      styles.head +
      (options.lazy || streaming ? `<script>${capture(now)}</script>\n` : '') +
      // Dev: Vite's client (HMR) and weft's agent bridge, which transformIndexHtml adds to HTML-file apps.
      (options.dev ? '<script type="module" src="/@vite/client"></script>\n<script type="module" src="/@weft-agent.js"></script>\n' : '') +
      (assets.entry && !streaming ? `<script type="module" src="${esc(assets.entry)}"></script>\n` : '') +
      `</head>\n<body>\n<div id="app">${s.shell}</div>\n<script type="application/json" id="weft-route">${json(payload)}</script>\n` +
      (scope.form ? `<script type="application/json" id="weft-form">${json(scope.form)}</script>\n` : '') +
      // Async, and after all it reads, so it can run while the stream goes on.
      (streaming ? (since(), dataTags({ ...pageData(s.data(), scope)!, w: 1 }, news())) : '') +
      (assets.entry && streaming ? `<script type="module" async src="${esc(assets.entry)}"></script>\n` : '')
    const finish = async () => {
      const cached = wire(scope)
      // Read after the queries ran: what's published from here on, the first connect replays (research 30 §1).
      if (scope.live) await hub().ready()
      const rt = scope.live ? `<script type="application/json" id="weft-rt">${json({ c: hub().cursor(), b: options.build })}</script>\n` : ''
      // A client that starts after this finds the whole page, as if it had never streamed.
      const stale = streaming ? '<script>["weft-data","weft-cache"].forEach(function(i){(i=document.getElementById(i))&&i.remove()})</script>\n' : ''
      return stale + dataTags(pageData(s.data(), scope), cached) + rt + '</body>\n</html>\n'
    }
    const status = r.status === 200 && scope.form ? scope.form.status : r.status
    const init = { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', ...(parts.fold.length && { vary: 'Save-Data, Sec-CH-Prefers-Reduced-Data' }) } }
    // No Boundary is waiting, so there's nothing to stream: the page goes out in one piece.
    if (!streaming) {
      const res = new Response(null, init)
      whole.set(res, head + (await finish()))
      return withHeaders(res, scope)
    }
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode(head))
        try {
          for await (const chunk of s.chunks) controller.enqueue(enc.encode(styles.late(pageSheets([], islandsOf(chunk), options.chunks)) + chunk + '\n'))
        } catch (e) {
          options.onDiagnostic?.({ code: 'E_STREAM', severity: 'error', message: String(e) })
        }
        controller.enqueue(enc.encode(await finish()))
        controller.close()
      },
    })
    return withHeaders(new Response(body, init), scope)
  }

  /**
   * A form POST to a page (research 29 §5): the mutation, then 303 (Post/Redirect/Get) or the page again with the
   * errors and what was typed. A form can't send `x-weft`, so the CSRF proof is the browser's own origin headers.
   */
  async function form(url: URL, request: Request, scope: Scope): Promise<Response> {
    const origin = request.headers.get('origin')
    const site = request.headers.get('sec-fetch-site')
    if (!(origin ? origin === url.origin && (!site || site === 'same-origin') : site === 'same-origin')) {
      options.onDiagnostic?.({ code: 'F002', severity: 'error', message: `F002: a form POST to ${url.pathname} without the same-origin proof (\`Origin\` or \`Sec-Fetch-Site\`)` })
      return new Response('Forbidden', { status: 403 })
    }
    const data = await request.formData()
    const id = String(data.get('$fn'))
    const f = fns.get(id)
    if (f?.kind !== 'mutation') {
      options.onDiagnostic?.({ code: 'F003', severity: 'error', message: `F003: a form POST names \`${id}\`, which is no mutation (the page is older than the server)` })
      return new Response('Not found', { status: 404 })
    }
    const see = (href: string) => withHeaders(new Response(null, { status: 303, headers: { location: href, 'cache-control': 'no-cache' } }), scope)
    const input = decodeForm(data)
    try {
      await exec.runMutation(scope, f, input, [], true)
      return see(url.pathname + url.search)
    } catch (e: any) {
      if (isRedirect(e)) return see(e.href)
      const known = e instanceof StartError || e instanceof FnError
      if (!known) options.onDiagnostic?.({ code: 'E_FN', severity: 'error', message: `${id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}` })
      const issues = e?.issues as SchemaIssue[] | undefined
      const { errors, message } = fieldsOf(issues)
      const key = data.get('$form')
      scope.form = {
        id, ...(typeof key === 'string' && { key }), values: echoed(input), errors,
        message: issues ? message : (exec.shown(e, scope) as Error).message,
        status: issues ? 422 : (e?.status as number) ?? 500,
      }
      return page(url, request, scope)
    }
  }

  /** `/_weft/m/<hash>/<width>.<fmt>` (research 29 §6): content-addressed, so cached for good; `auto` varies on `Accept`. */
  async function media(url: URL, request: Request): Promise<Response> {
    const m = /^\/_weft\/m\/([0-9a-f]{32})\/(\d+)\.([a-z0-9]+)$/.exec(url.pathname)
    const server = await mediaServer()
    if (!server) options.onDiagnostic?.({ code: 'M017', severity: 'error', message: 'M017: a media URL was requested, but nothing provides `media.server`. Add `media()` from `@weft/plugin-media` to `plugins`' })
    const out = m && (await server?.serve({ hash: m[1], width: Number(m[2]), format: m[3], accept: request.headers.get('accept') ?? '' }))
    if (!out) return new Response('Not found', { status: 404 })
    const headers = new Headers({ 'content-type': out.type, 'cache-control': 'public, max-age=31536000, immutable', etag: `"${m![1]}-${out.width}-${out.format}"`, 'x-content-type-options': 'nosniff' })
    if (out.negotiated) headers.set('vary', 'Accept')
    if (out.type === 'image/svg+xml') headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    if (out.temporary) { // The original, standing in for a rung still encoding.
      headers.set('cache-control', 'no-store')
      headers.delete('etag')
    }
    if (request.headers.get('if-none-match') === headers.get('etag')) return new Response(null, { status: 304, headers })
    const range = /^(video|audio)\//.test(out.type) && /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (!range) return new Response(out.bytes as BodyInit, { headers })
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : Infinity, out.bytes.length - 1)
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${out.bytes.length}` } })
    headers.set('content-range', `bytes ${start}-${end}/${out.bytes.length}`)
    return new Response(out.bytes.subarray(start, end + 1) as BodyInit, { status: 206, headers })
  }

  /** The route as JSON for client navigation: deferred fields awaited (no streaming on navigation yet). */
  async function data(path: string, request: Request, scope: Scope): Promise<Response> {
    const r = await resolve(path, request)
    if (r.redirect) return withHeaders(Response.json({ m: [], p: path, s: r.redirect.status, r: r.redirect.href } satisfies RoutePayload, { headers: { 'cache-control': 'no-cache' } }), scope)
    for (const lv of r.levels) if (lv.d?.length) lv.data = { ...(lv.data as object), ...Object.fromEntries(await Promise.all(lv.d.map(async k => [k, await (lv.raw as any)[k]]))) }
    const c = wire(scope)
    let payload = payloadOf(r, true)
    if (r.levels.some(lv => statics.has(lv.id))) {
      const route = stateOf(r, payload)
      const out = await renderToStringAsync(() => <App route={route} />, { passes: PASSES, shown: e => exec.shown(e, scope), app: { cookies: cookieJar(request) } })
      const at = out.lastIndexOf('<script type="application/json" data-weft>')
      payload = { ...withLevels(payload, at < 0 ? out : out.slice(0, at), statics, true), ...(at >= 0 && { b: JSON.parse(out.slice(at).replace(/^<[^>]*>/, '').replace(/<\/script>$/, '')) }) }
    }
    return withHeaders(Response.json({ ...payload, ...(c.length && { c }) }, { status: 200, headers: { 'cache-control': 'no-cache' } }), scope)
  }

  /** `/_weft/fn/<id>`: GET runs a query, POST a mutation (CSRF-checked), both answering JSON (research 27 §3). */
  async function fn(url: URL, request: Request, scope: Scope): Promise<Response> {
    const id = decodeURIComponent(url.pathname.slice('/_weft/fn/'.length))
    const f = fns.get(id)
    const out = (body: unknown, status = 200) => withHeaders(Response.json(body, { status, headers: { 'cache-control': 'no-store' } }), scope)
    const fail = (code: string, message: string, status: number, extra: object = {}, sent?: unknown) => {
      options.onDiagnostic?.({ code, severity: 'error', message })
      return out({ e: { code, message: sent instanceof Error ? sent.message : message, ...extra } }, status)
    }
    if (!f) return fail('Q009', `Q009: no server function \`${id}\` (the page is older than the server, or the module isn't a server module): reload`, 404)
    let fromForm = false
    if (f.kind === 'stream') return fail('Q009', `Q009: \`${id}\` is a stream: its client reads it over \`/_weft/rt\``, 405)
    try {
      if (f.kind === 'query') {
        if (request.method !== 'GET' && request.method !== 'HEAD') return fail('Q009', `Q009: \`${id}\` is a query: GET only`, 405)
        const raw = url.searchParams.get('i')
        const e = await exec.fetchQuery(scope, f, raw === null ? undefined : JSON.parse(raw))
        return out({ v: e.v, t: e.tags })
      }
      if (request.method !== 'POST') return fail('Q010', `Q010: mutation \`${id}\` needs POST`, 405)
      const origin = request.headers.get('origin')
      const site = request.headers.get('sec-fetch-site')
      const cross = (origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none')
      const type = request.headers.get('content-type') ?? ''
      const multipart = type.startsWith('multipart/form-data') // `<Form>` with a file; `x-weft` still forces a preflight
      if (cross || request.headers.get('x-weft') !== '1' || !(multipart || type.startsWith('application/json')))
        return fail('Q010', `Q010: mutation \`${id}\` without the CSRF proof (POST + JSON + \`x-weft: 1\`, same origin): call it through its stub`, 403)
      const body = multipart ? await multipartBody(request) : ((await request.json()) as { i?: unknown; f?: [string, unknown][]; c?: 1 })
      fromForm = !!body.c
      const answer = await exec.runMutation(scope, f, body.i, Array.isArray(body.f) ? body.f.slice(0, 200) : [], fromForm)
      if (options.dev && sessionChanged(scope.headers)) options.onDiagnostic?.({ code: 'A004', severity: 'warning', message: `\`${id}\` changed the session cookie without a redirect: the tab keeps what the last session cached. \`redirect()\` after it` })
      return out(answer)
    } catch (e) {
      // The session changed: a full load, so nothing cached for the last user survives in the tab (research 28 §3).
      if (isRedirect(e)) return out({ r: e.href, ...(sessionChanged(scope.headers) && { x: 1 }) })
      if (e instanceof FnError) return out({ e: { code: e.code, message: e.message } }, e.status)
      // A wrong field in a form is an answer, not a fault: nothing to log.
      if (e instanceof StartError && fromForm && e.extra.issues) return out({ e: { code: e.code, message: e.message, issues: e.extra.issues } }, 422)
      if (e instanceof StartError) return fail(e.code, e.message, (e.extra.status as number) ?? 500, e.extra.issues ? { issues: e.extra.issues } : e.extra.typed ? { data: e.extra.data } : {}, exec.shown(e, scope))
      options.onDiagnostic?.({ code: 'E_FN', severity: 'error', message: `${id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}` })
      return out({ e: { message: options.dev && e instanceof Error ? e.message : 'Server function failed.' } }, 500)
    }
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
      const p = mod(route.file)?.prerender
      const given = typeof p === 'function' ? await p() : p
      const list: Record<string, string>[] = given === true ? [{}] : given ?? (route.params.length ? [] : [{}])
      for (const params of list) {
        const path = fill(route.pattern, params, route.splat)
        const r = await resolve(path, request)
        if (given && r.status === 200) paths.push(path)
        const image = r.head.og.image
        if (r.status === 200 && typeof image === 'object' && image.url.startsWith('/_weft/og/')) paths.push(image.url.replace(/\?.*/, ''))
      }
    }
    // HTML, because Nitro's prerenderer only follows links (and this header) from HTML responses.
    const list = paths.map(p => `<a href="${esc(p)}">${esc(p)}</a>`).join('\n')
    return new Response(`<!doctype html>\n<meta name="robots" content="noindex">\n${list}\n`, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-nitro-prerender': paths.join(',') } })
  }

  /** Everything under `/_weft/x/<key>/`, for the extension with that key. Nothing else reaches it. */
  async function extensionRoute(url: URL, request: Request, scope: Scope) {
    const [key = '', ...rest] = url.pathname.slice(EXTENSION.length).split('/')
    const extension = extensions.get(key)
    if (!extension?.handle) return new Response('Not found', { status: 404 })
    return extension.handle(request, rest.join('/'), { invalidate: tags => exec.invalidate(scope, tags), report: d => options.onDiagnostic?.(d) })
  }

  const route = (request: Request, scope: Scope): Promise<Response> => {
    const url = new URL(request.url)
    if (options.auth && (url.pathname === authBase || url.pathname.startsWith(authBase + '/'))) return options.auth.handler(request)
    if (url.pathname.startsWith('/_weft/fn/')) return fn(url, request, scope)
    if (url.pathname.startsWith(EXTENSION)) return extensionRoute(url, request, scope)
    if (request.method === 'POST' && !url.pathname.startsWith('/_weft/') && /^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(request.headers.get('content-type') ?? '')) return form(url, request, scope)
    if (url.pathname === '/_weft/rt') return rtRoute(request, scope, options.realtime?.origins)
    if (url.pathname === '/_weft/ws') return socketRoute(request, scope, options.realtime?.origins)
    if (request.method !== 'GET' && request.method !== 'HEAD') return Promise.resolve(new Response('Method not allowed', { status: 405 }))
    if (url.pathname.startsWith('/_weft/m/')) return media(url, request)
    if (url.pathname.startsWith('/_weft/og/') && url.pathname.endsWith('.png')) return og(url, request)
    if (url.pathname.startsWith('/_weft/data/') || url.pathname === '/_weft/data') return data((url.pathname.slice('/_weft/data'.length) || '/') + url.search, request, scope)
    if (url.pathname === '/_weft/og-routes') return prerenderList(request)
    return page(url, request, scope)
  }
  const handler = async (incoming: Request): Promise<Response> => {
    const request = options.auth ? stamped(incoming) : incoming
    await loadExtensions()
    if (!checked) {
      checked = true
      exec.checkTags(d => options.onDiagnostic?.(d))
    }
    const scope = exec.createScope(request, scopeOptions)
    // The build's prerender only lists cards: it holds no secrets and may have no database.
    if (new URL(request.url).pathname === '/_weft/og-routes') return als.run(scope, () => route(request, scope))
    await boot()
    return compressed(request, await als.run(scope, () => route(request, scope)))
  }
  return Object.assign(handler, { resolve })
}

/** A complete page's text. Its Response holds no body until `compressed` gives it one: compressed, it's never read. */
const whole = new WeakMap<Response, string>()

type Encoding = 'br' | 'gzip'
type Zlib = typeof import('node:zlib')

let loaded: Promise<Zlib | undefined> | undefined
const loadZlib = () => (loaded ??= import('node:zlib').catch(() => undefined))
const brotli = (zlib: Zlib, sizeHint: number) => ({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: sizeHint } })

const PACKED_MAX = 16 * 1024 * 1024 // characters of text held, per encoding
const PACKED_ENTRY_MAX = 1024 * 1024

/**
 * Compressed bodies by their whole text, most recently used last. The text is the key, not a hash of it, so a response
 * is only ever reused for the same bytes: two users can share an entry only if each was already being sent that page.
 */
const packed: Record<Encoding, { entries: Map<string, Promise<Uint8Array>>; held: number }> = { br: { entries: new Map(), held: 0 }, gzip: { entries: new Map(), held: 0 } }

function compressWhole(zlib: Zlib, encoding: Encoding, text: string): Promise<Uint8Array> {
  const cache = packed[encoding]
  const hit = cache.entries.get(text)
  if (hit) {
    cache.entries.delete(text)
    cache.entries.set(text, hit)
    return hit
  }
  const out = new Promise<Uint8Array>((ok, no) => {
    const done = (e: Error | null, b: Buffer) => (e ? no(e) : ok(b))
    if (encoding === 'br') zlib.brotliCompress(text, brotli(zlib, Buffer.byteLength(text)), done)
    else zlib.gzip(text, done)
  })
  if (text.length > PACKED_ENTRY_MAX) return out
  cache.entries.set(text, out)
  cache.held += text.length
  for (const key of cache.entries.keys()) {
    if (cache.held <= PACKED_MAX) break
    cache.entries.delete(key)
    cache.held -= key.length
  }
  return out
}

/** A stream of chunks, each flushed as it arrives so a Boundary reaches the client when it resolves. */
function compressStream(zlib: Zlib, encoding: Encoding, source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const z = encoding === 'br' ? zlib.createBrotliCompress(brotli(zlib, 0)) : zlib.createGzip()
  const reader = source.getReader()
  return new ReadableStream<Uint8Array>({
    start(out) {
      z.on('data', (d: Buffer) => out.enqueue(new Uint8Array(d)))
      z.on('end', () => out.close())
      z.on('error', e => out.error(e))
      ;(async () => {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return void z.end()
          z.write(value)
          await new Promise(ok => z.flush(ok as () => void))
        }
      })().catch(e => out.error(e))
    },
    cancel(reason) {
      z.destroy()
      return reader.cancel(reason)
    },
  })
}

/**
 * HTML and data go out brotli or gzipped when the client takes it. A response that is complete is compressed once and
 * kept, since most pages come out the same for every visitor; one still streaming is flushed chunk by chunk. A runtime
 * with no node:zlib sits behind a platform that compresses.
 */
async function compressed(request: Request, response: Response): Promise<Response> {
  const page = whole.get(response)
  const plain = () => (page === undefined ? response : new Response(page, response))
  if (page === undefined && (!response.body || response.headers.has('content-encoding'))) return response
  const type = response.headers.get('content-type') ?? ''
  if (!/^(text\/html|application\/json)/.test(type)) return plain()
  const accepts = request.headers.get('accept-encoding') ?? ''
  const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : undefined
  const zlib = encoding && (await loadZlib())
  if (!zlib) return plain()
  const text = page ?? (type.startsWith('application/json') ? await response.text() : undefined)
  const body = text === undefined ? compressStream(zlib, encoding, response.body!) : await compressWhole(zlib, encoding, text)
  const headers = new Headers(response.headers)
  headers.set('content-encoding', encoding)
  headers.append('vary', 'Accept-Encoding')
  headers.delete('content-length')
  return new Response(body as BodyInit, { status: response.status, statusText: response.statusText, headers })
}

/**
 * What each router-core loader gets as `context`: the request scope, and where it leaves tags and redirects (router-core
 * copies the context object, so those go in shared containers).
 */
interface LoadContext { request: Request; scope: Scope; tags: Map<string, Set<string>>; out: { redirect?: Redirect; chain?: Promise<unknown> } }

/** The router-core tree for the manifest: layouts are path prefixes, routes hang under their innermost layout. */
function routeTree(manifest: Manifest, modules: Record<string, RouteModule>) {
  const loader = (file: string, splat?: string) => async ({ params, context, abortController }: { params: any; context: LoadContext; abortController: AbortController }) => {
    const load = modules[file]?.load
    if (!load) return undefined
    // Parent first (router-core starts them together): a layout's `load` is a guard, so a child never runs for a
    // visitor its parent redirects (research 28 §3).
    const out = context.out
    const before = out.chain
    let done!: () => void
    out.chain = new Promise<void>(ok => (done = ok))
    await before
    if (out.redirect) return done(), undefined
    // Each loader runs in its own frame of the request scope, which records the tags of the queries it read.
    const f = exec.frame(context.scope)
    context.tags.set(file, f.tags!)
    try {
      const ctx = await f.ctx()
      const v = await als.run(f, () => load({ params: cleanParams(params, splat), request: context.request, signal: abortController.signal, ctx }))
      if (isNotFound(v)) throw v
      return v
    } catch (e) {
      if (!isRedirect(e)) throw e
      out.redirect ??= e
      return undefined
    } finally {
      done()
    }
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
    parent.children.push(new BaseRoute({ getParentRoute: () => parent.route, path: rel || '/', loader: loader(r.file, r.splat), weft: r } as any))
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
function cleanParams(p: Record<string, unknown> = {}, splat?: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k in p) if (k !== '*' && k !== '_splat') out[k] = String(p[k])
  if (splat && p._splat !== undefined) out[splat] = String(p._splat)
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
  return { m: r.levels.map(({ id, params, data, d, t }) => ({ id, params, data, ...(d && { d }), ...(t && { t }) })), p: r.path, s: r.status, ...(withHead && { h: r.head }) }
}

/**
 * The payload with its static levels marked: their hash, without their data (the HTML holds it), and with `html` their
 * HTML, each level's next one cut down to its markers. The `aria-current` a navigation moves doesn't count as a change.
 */
/**
 * The chunks `payload`'s page will want: its non-static levels and the islands that load with it, and `fold`, the lazy
 * ones in the first view. Those stay preloaded, fetched but not run, so a first click on them doesn't wait; the rest
 * load when they're needed. `$client`: the router and runtime, whenever any of that will run.
 */
const pageChunks = (payload: RoutePayload, chunks: HandlerOptions['chunks'] = {}, fold: string[] = [], now = true) => {
  const ids = [...payload.m.filter(m => !m.s).map(m => m.id), ...(payload.i ?? []), ...fold]
  return [...(now || ids.length ? ['$client'] : []), ...ids].flatMap(id => chunks[id]?.js ?? [])
}

/**
 * The route's stylesheets and those of every island on the page. An island is a dynamic import, so its CSS is not in the
 * route's chunk graph; without this the server's HTML paints bare and the sheets arrive with the script.
 */
const pageSheets = (css: { href: string }[] = [], parts: { now: string[]; lazy: string[]; fold: string[] }, chunks: HandlerOptions['chunks'] = {}) => {
  const found = [...parts.now, ...parts.lazy, ...parts.fold].flatMap(id => chunks[id]?.css ?? [])
  return [...new Map([...css, ...found].map(c => [c.href, c])).values()]
}

const saveData = (request: Request) => request.headers.get('save-data') === 'on' || request.headers.get('sec-ch-prefers-reduced-data') === 'reduce'

/** Where the first view ends, in px: past most laptops' and phones' first screen. */
const FOLD = 900

/**
 * About how far down the page `html` runs out, in px. The server has no layout, so this counts what makes a page tall:
 * blocks, and lines of their text. A wrong guess costs one chunk's fetch, either way: it's a preload, not a decision.
 */
function depth(html: string) {
  const plain = html.replace(/<(svg|style|template)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/g, '')
  const blocks = plain.match(/<(?:section|article|header|footer|h[1-6]|p|li|tr|img|form|pre|blockquote|video|figure)\b/g)?.length ?? 0
  return blocks * 32 + (plain.replace(/<[^>]*>/g, '').length / 60) * 24
}

/** What a page's HTML says about its islands: those that load with it, those that wait, and the waiting ones in view. */
function islandsOf(html: string) {
  const known = renderedOf(html)
  if (known.p) return known.p
  const parts = { now: [] as string[], lazy: [] as string[], fold: [] as string[] }
  let past = false
  for (const m of html.matchAll(/<!--wi:(\[.*?\])-->/g)) {
    const [id, , , when] = JSON.parse(m[1]) as [string, string, unknown[], string?]
    const list = when ? parts.lazy : parts.now
    if (!list.includes(id)) list.push(id)
    past ||= depth(html.slice(0, m.index)) >= FOLD
    if (when && !past && !parts.fold.includes(id)) parts.fold.push(id)
  }
  return (known.p = parts)
}

function modulepreloads(chunks: { href: string }[], assets: NonNullable<HandlerOptions['assets']>) {
  const hrefs = new Set(chunks.map(c => c.href))
  hrefs.delete(assets.entry!)
  return [...hrefs].map(href => `<link rel="modulepreload" href="${esc(href)}">\n`).join('')
}

/** What a render's HTML says about its levels, worked out as asked and kept by the exact text. */
interface Rendered { h: Record<number, string>; x: Record<number, string>; p?: { now: string[]; lazy: string[]; fold: string[] } }
const RENDERED_MAX = 64
const rendered = new Map<string, Rendered>()

function renderedOf(html: string) {
  let r = rendered.get(html)
  if (!r) {
    if (rendered.size >= RENDERED_MAX) rendered.clear()
    rendered.set(html, (r = { h: {}, x: {} }))
  }
  return r
}

function withLevels(payload: RoutePayload, html: string, statics: Set<string>, sendHtml: boolean): RoutePayload {
  if (!payload.m.some(m => statics.has(m.id))) return payload
  const known = renderedOf(html)
  const slice = (d: number) => {
    const open = html.indexOf(`<!--wl:${d}:`)
    const end = `<!--/wl:${d}-->`
    const close = html.indexOf(end)
    if (open < 0 || close < 0) return ''
    const body = html.slice(html.indexOf('-->', open) + 3, close)
    const kid = body.indexOf(`<!--wl:${d + 1}:`)
    const tail = body.indexOf(`<!--/wl:${d + 1}-->`)
    return kid < 0 || tail < 0 ? body : body.slice(0, body.indexOf('-->', kid) + 3) + body.slice(tail)
  }
  const m = payload.m.map((lv, d) => {
    if (!statics.has(lv.id)) return lv
    const { data: _, ...rest } = lv
    const h = (known.h[d] ??= slice(d))
    return { ...rest, s: 1 as const, x: (known.x[d] ??= hash(h.replaceAll(' aria-current="page"', ''))), ...(sendHtml && { h }) }
  })
  const i = islandsOf(html).now
  return { ...payload, m, ...(i.length && { i }) }
}

const dataTags = (data: unknown, cached: Wire[]) => `<script type="application/json" id="weft-data">${json(data)}</script>\n` + (cached.length ? `<script type="application/json" id="weft-cache">${json(cached)}</script>\n` : '')

/** A render's data as a page may carry it: what failed says only what `exec.shown` let through. */
function pageData(data: ReturnType<Stream['data']>, scope: Scope) {
  return data && { ...data, r: scrubbed(data.r, scope) }
}

const scrubbed = (r: Record<string, { v?: unknown; e?: string }>, scope: Scope) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.e === undefined ? v : { e: exec.said(v.e, scope) }]))

/** The request's resolved queries, as the client cache seeds them (failures are left for the client to retry). */
function wire(scope: Scope): Wire[] {
  return [...scope.entries.values()].filter(e => e.done && e.e === undefined).map(e => [e.id, e.input, e.v, e.tags])
}

/** The request with the socket's address in CLIENT_IP, replacing any the client sent. Nitro's server sets `.ip`. */
function stamped(request: Request): Request {
  const headers = new Headers(request.headers)
  const ip = (request as any).ip as string | undefined
  headers.delete(CLIENT_IP)
  if (ip) headers.set(CLIENT_IP, ip)
  // `new Request(request, …)` refuses the server's request wrapper; the parts are enough.
  return new Request(request.url, { method: request.method, headers, ...(request.body && { body: request.body, duplex: 'half' }) } as RequestInit)
}

/** The request's cookies for `persist: 'cookie'`, parsed on first read: a page with none pays nothing. */
function cookieJar(request: Request) {
  let jar: Map<string, string> | undefined
  return {
    get(name: string) {
      jar ??= new Map((request.headers.get('cookie') ?? '').split(/;\s*/).map(c => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]))
      return jar.get(name)
    },
  }
}

/** The multipart body `<Form>` sends when a form holds a file: the fields, and the refresh list in `$r`. */
async function multipartBody(request: Request) {
  const data = await request.formData()
  return { i: decodeForm(data), f: JSON.parse(String(data.get('$r') ?? '[]')) as [string, unknown][], c: 1 as const }
}

/** What a failed form's page gives back: no secrets (the HTML outlives the request) and no files. */
function echoed(input: Record<string, unknown>): Record<string, unknown> {
  const keep = (v: unknown): unknown => (typeof v === 'string' ? v : Array.isArray(v) ? v.filter(x => typeof x === 'string') : v && typeof v === 'object' && !(v instanceof Blob) ? echoed(v as Record<string, unknown>) : undefined)
  return Object.fromEntries(Object.entries(input).filter(([k]) => !/pass|secret|token|card|cvv|cvc/i.test(k)).map(([k, v]) => [k, keep(v)]))
}

/** The cookies and headers server functions set (`ctx.response.headers`), on the response. */
function withHeaders(res: Response, scope: Scope): Response {
  for (const [k, v] of scope.headers) res.headers.append(k, v)
  return res
}

export { headTags }
