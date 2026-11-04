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
import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  isNotFound,
} from '@tanstack/router-core'
import { createMemoryHistory } from '@tanstack/history'
import { rt } from '@weft-js/core'
import {
  headTags,
  mergeMeta,
  metaTags,
  region,
  renderToStream,
  renderToString,
  renderToStringAsync,
  type Merged,
  type Meta as MetaObject,
  type Stream,
} from '@weft-js/core/ssr'
import { createRouteState, type Component, type RoutePayload } from './router'
import { EXTENSION, type ServerExtension } from './extension'
import { deployUrl, pageText, pathPages } from './derive.mjs'
import {
  decodeForm,
  fieldsOf,
  FnError,
  fns,
  isRedirect,
  keyOf,
  runtime,
  StartError,
  type SchemaIssue,
  type Wire,
} from './data'
import * as exec from './exec'
import type { MediaServer, Scope } from './exec'
import { configure, hub, rtRoute } from './hub'
import { socketRoute } from './socket'
import { App } from './view'
import { DefaultCard } from './og/DefaultCard'
import { ErrorPage, NotFoundPage } from './builtin'
import { renderCard } from './og/index.mjs'
import { keptSheets, pageStyles, sheetId } from './inline.mjs'
import { capture } from './capture.mjs'
import { compressed, whole } from './server/compression'
import { serverFunction } from './server/functions'
import {
  tableStyles,
  pageChunks,
  pageSheets,
  saveData,
  islandsOf,
  modulepreloads,
  withLevels,
} from './server/render'
import { json, esc, moved, thenable, cardPath, hash } from './server/text'
import { routeTree, cleanParams, type LoadContext } from './server/routes'
import { stamped, cookieJar, echoed, withHeaders } from './server/request'

import type {
  RouteEntry,
  LayoutEntry,
  HandlerOptions,
  Level,
  MetaSource,
  Resolved,
} from './server/types'
export { cardPath, hash } from './server/text'
export type {
  RouteEntry,
  LayoutEntry,
  Manifest,
  RouteModule,
  Font,
  HandlerOptions,
  Level,
  MetaSource,
  Resolved,
} from './server/types'

type RouterOptions = ConstructorParameters<typeof RouterCore>[0]

const als = new AsyncLocalStorage<Scope>()
runtime.scope = () => als.getStore()
runtime.enter = (scope, fn) => als.run(scope as Scope, fn)
runtime.exec = exec
rt.isolated = true
runtime.poke = (tags, origin) => hub().poke(tags, origin)

const CARD = { width: 1200, height: 630 }
const stores = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (f: () => void) => f(),
})
/** The origin a head's URLs are built on, or none: then canonical and og:url stay out. */
function pointAt(head: Merged, origin: string | undefined) {
  if (origin) head.url = origin
  else delete head.url
}

/** Render passes a page may take. Only a backstop: a render stops when its passes stop reading anything new, and `timeout` ends a stream. */
const PASSES = 1024

/** The app as a `(Request) => Response`: pages, data, functions and cards. */
export function createHandler(options: HandlerOptions) {
  const { manifest, modules, site = {} } = options
  const byId = new Map(manifest.routes.map((r) => [r.id, r]))
  const mod = (file?: string) => (file ? modules[file] : undefined)
  const comps: Record<string, Component> = { 404: NotFoundPage, error: ErrorPage }
  for (const l of manifest.layouts) if (mod(l.file)?.default) comps[l.id] = mod(l.file)!.default!
  for (const r of manifest.routes) if (mod(r.file)?.default) comps[r.id] = mod(r.file)!.default!
  const statics = new Set(options.statics)
  /**
   * What each route's last render needed in its head, by status, Save-Data and levels: the next request sends that head
   * before it renders. `null`: a route whose render sets headers, so it renders first.
   */
  const heads = new Map<string, Head | null>()
  const remember = (shape: string, head: Head) => {
    if (heads.size >= HEADS_MAX && !heads.has(shape)) heads.clear()
    heads.set(shape, head)
  }
  const publicUrl = deployUrl(
    site,
    (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process
      ?.env,
  )
  let warned = false
  /**
   * The origin canonical, og:url and og:image are built on. Without a configured one, the request's: right for what
   * a browser asked, but it's whatever `Host` said, so a production server says so once. A prerender has no public
   * request at all (it would write `localhost` into a file), so its pages stay relative and H001 reports them.
   */
  const originOf = (request: Request) => {
    if (publicUrl) return publicUrl
    if (request.headers.has('x-nitro-prerender') || options.requestOrigin === false)
      return undefined
    if (!options.dev && !warned) {
      warned = true
      options.onDiagnostic?.({
        code: 'H001',
        severity: 'warning',
        message:
          "H001 `site.url` is not set, so canonical, og:url and og:image use the request's Host header. Set `site.url`, or `WEFT_SITE_URL` in the deploy environment.",
      })
    }
    return new URL(request.url).origin
  }
  /** The route state of a server render: where a static level is in it, it marks where each level starts (`region`). */
  const stateOf = (r: Resolved, payload: RoutePayload) => {
    const route = createRouteState(
      { ...payload, m: r.levels.map((lv) => ({ id: lv.id, params: lv.params, data: lv.raw })) },
      comps,
    )
    if (r.levels.some((l) => statics.has(l.id)))
      route.around = (d, id, body) =>
        region(statics.has(id), d, statics.has(r.levels[d - 1]?.id ?? ''), body)
    return route
  }
  const tree = routeTree(manifest, modules, als)
  let provider: Promise<MediaServer> | undefined
  const mediaServer = () => (provider ??= options.media?.())
  const scopeOptions = {
    context: options.context,
    store: options.store,
    dev: options.dev,
    onDiagnostic: options.onDiagnostic,
    media: mediaServer,
    extensions: undefined as ServerExtension[] | undefined,
  }
  let checked = !options.dev
  const authBase = (options.auth?.basePath ?? '/api/auth').replace(/\/$/, '')
  const extensions = new Map<string, ServerExtension>()
  let loading: Promise<void> | undefined
  const loadExtensions = () =>
    (loading ??= (async () => {
      for (const e of options.extensions ?? []) extensions.set(e.key, await e.load())
      scopeOptions.extensions = [...extensions.values()]
    })())
  let applied = -1
  configure({
    ...options.realtime,
    build: options.build,
    dev: options.dev,
    store: options.store,
    required: options.liveRequired,
    onDiagnostic: options.onDiagnostic,
  })

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
      const report = (e: unknown) =>
        options.onDiagnostic?.({
          code: 'Q016',
          severity: 'error',
          message: `Q016: ${String((e as Error | null)?.message ?? e)}`,
        })
      runtime.migrations = { list, report }
    }
    if (runtime.dbs?.size)
      await Promise.all([...runtime.dbs].map((ready) => Promise.resolve(ready()).catch(() => {})))
  }

  async function resolve(path: string, request: Request): Promise<Resolved> {
    const scope = als.getStore() ?? exec.createScope(request, scopeOptions)
    const hold: LoadContext = { request, scope, tags: new Map(), out: {} }
    const router = new RouterCore(
      {
        routeTree: tree,
        history: createMemoryHistory({ initialEntries: [path] }),
        isServer: true,
        context: hold,
      } as RouterOptions,
      stores,
    )
    // The page's `[...name]`, so its layouts see the catch-all under that name too (the loaders copy `hold` as they start).
    hold.splat = (
      router.getMatchedRoutes(router.latestLocation.pathname)[2] as
        | { options: { weft?: RouteEntry } }
        | undefined
    )?.options.weft?.splat
    await router.load()
    const goes = hold.out.redirect
    if (goes)
      return { status: goes.status, path, levels: [], head: mergeMeta(site), redirect: goes }
    const matches = router.state.matches.map((m) => ({
      m,
      weft: (router.routesById as Record<string, { options: { weft?: RouteEntry | LayoutEntry } }>)[
        m.routeId
      ]?.options.weft,
    }))
    const params = (m: { params: Record<string, unknown> }, splat?: string) =>
      cleanParams(m.params, splat)
    const leaf = matches.at(-1)?.weft
    const route = leaf && 'kind' in leaf ? leaf : undefined
    const failed = matches.find((x) => x.m.status === 'error')
    const missing =
      !route || matches.some((x) => x.m.status === 'notFound' || isNotFound(x.m.error))
    const rootLayout = manifest.layouts.find((l) => l.dir === '')
    const rootOk =
      rootLayout && matches[0]?.weft === rootLayout && matches[0].m.status === 'success'
        ? matches[0]
        : undefined
    const levelOf = (x: (typeof matches)[number]): Level => {
      const raw = x.m.loaderData
      const t = hold.tags.get(x.weft!.file)
      return {
        id: x.weft!.id,
        params: params(x.m, hold.splat),
        mod: mod(x.weft!.file),
        raw,
        ...split(raw),
        ...(t?.size && { t: [...t] }),
      }
    }
    const special = (id: '404' | 'error', status: number, error?: unknown): Promise<Resolved> => {
      const entry = byId.get(id)
      if (error instanceof StartError && error.code)
        options.onDiagnostic?.({ code: error.code, severity: 'error', message: error.message })
      const shown =
        id === 'error'
          ? {
              status,
              message:
                options.dev && error instanceof Error ? error.message : 'Something went wrong.',
            }
          : { path }
      const levels: Level[] = [
        ...(rootOk && !(failed && failed === rootOk) ? [levelOf(rootOk)] : []),
        { id, params: {}, data: shown, raw: shown, mod: mod(entry?.file) },
      ]
      if (entry && mod(entry.file)?.default) comps[id] = mod(entry.file)!.default!
      return finish(levels, status, undefined, error)
    }
    const finish = async (
      shown: Level[],
      status: number,
      matched?: RouteEntry,
      error?: unknown,
    ): Promise<Resolved> => {
      const metas: MetaObject[] = []
      const source: MetaSource = {
        title: site.name ? 'config' : 'none',
        description: site.description ? 'config' : 'none',
        image: 'none',
      }
      for (const lv of shown) {
        const m =
          lv.mod?.meta ??
          (lv.id === '404'
            ? { title: 'Not found' }
            : lv.id === 'error'
              ? { title: 'Error' }
              : undefined)
        if (!m) continue
        const value =
          typeof m === 'function'
            ? await m({ params: lv.params, data: settledView(lv.raw, lv.d, lv.id, options) })
            : m
        metas.push(value)
        const who = lv === shown.at(-1) ? 'route' : 'layout'
        if (value?.title != null) source.title = who
        if (value?.description != null) source.description = who
      }
      const resolved: Resolved = {
        status,
        path,
        levels: shown,
        head: mergeMeta(site, ...metas),
        route: matched,
        error,
        metas,
        source,
        origin: originOf(request),
      }
      pointAt(resolved.head, resolved.origin)
      return resolved
    }

    if (failed) {
      const e = exec.dbError(failed.m.error)
      return special('error', (e as { code?: string } | null)?.code === 'Q016' ? 503 : 500, e)
    }
    if (missing) return special('404', 404)
    const levels = matches.filter((x) => x.weft).map(levelOf)
    try {
      return await finish(levels, 200, route)
    } catch (e) {
      if (isNotFound(e)) return special('404', 404)
      return special('error', 500, e)
    }
  }

  const timing = options.timeout === undefined ? {} : { timeout: options.timeout }
  const leftToPage = (s: MetaSource['title']) => s === 'config' || s === 'none'

  /**
   * The content hash of a generated card: what it draws. The built-in card reads the head and the site's look and
   * nothing else, so a loader's timestamp can't change its URL; an `.og.tsx` also gets the page's data.
   */
  function cardUrl(route: RouteEntry, levels: Level[], head: Merged, path: string) {
    const card = route.card ?? manifest.defaultCard
    const size = mod(card)?.size ?? CARD
    const { image: _, ...graph } = head.og
    const leaf = levels.at(-1)!
    const v = hash(
      [
        options.build ?? '',
        card ?? 'builtin',
        JSON.stringify(size),
        JSON.stringify({ ...head, og: graph }),
        JSON.stringify(site.card ?? null),
        card ? JSON.stringify(leaf.data ?? null) : '',
      ].join('\0'),
    )
    return `/_weft/og/${cardPath(path)}.png?v=${v}`
  }

  /**
   * The rest of the head, once the page's HTML can speak for it (research 20 §10): a level that set no title or
   * description gets the page's own, under anything a layout or the route wrote, and `image: 'auto'` becomes the
   * card, whose URL hashes the text it shows. Called once per request, before anything is written.
   */
  function complete(r: Resolved, html?: string) {
    if (!r.metas || !r.source) return r.head
    const { metas, source } = r
    r.metas = undefined
    const left = leftToPage(source.title) || leftToPage(source.description)
    const words = left && r.status === 200 && html ? pageText(html) : {}
    const title = leftToPage(source.title) ? words.title : undefined
    const description = leftToPage(source.description) ? words.description : undefined
    if (title) source.title = 'auto'
    if (description) source.description = 'auto'
    const head = (r.head = mergeMeta(
      site,
      { ...(title !== undefined && { title }), ...(description !== undefined && { description }) },
      ...metas,
    ))
    pointAt(head, r.origin)
    if (
      head.jsonLd === undefined &&
      r.route?.pattern === '/' &&
      r.status === 200 &&
      r.origin &&
      site.name
    )
      head.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
        url: r.origin,
        ...(site.description && { description: site.description }),
      }
    if (head.og.image === 'auto') {
      const showing = r.status === 200 && r.route
      if (showing)
        head.og.image = {
          url: cardUrl(r.route!, r.levels, head, r.path),
          ...CARD,
          alt: head.og.title ?? head.title,
        }
      else delete head.og.image
      if (showing) source.image = r.route!.card || manifest.defaultCard ? 'card' : 'auto'
    } else if (head.og.image) source.image = 'explicit'
    return head
  }

  /** What `page` shows a reader, without the streaming: the same pass, so a page, its navigation and its card agree. */
  async function shell(r: Resolved, request: Request) {
    const route = stateOf(r, payloadOf(r, false))
    const s = renderToStream(() => <App route={route} />, {
      ...timing,
      passes: PASSES,
      app: { cookies: cookieJar(request) },
    })
    await s.settle()
    return s.shell
  }

  /**
   * The finished head of a request that doesn't otherwise render: it renders only when a level left words to the page.
   * A render that fails here (a build with no database) leaves the words to the config; the page still shows its own.
   */
  const finished = async (r: Resolved, request: Request) => {
    if (
      !r.metas ||
      r.status !== 200 ||
      !(leftToPage(r.source!.title) || leftToPage(r.source!.description))
    )
      return complete(r)
    return complete(r, await shell(r, request).catch(() => undefined))
  }

  /** `weft routes --meta`: one page's finished head, its HTML and where its words came from, in a request scope. */
  const inspect = (path: string, request: Request) =>
    als.run(exec.createScope(request, scopeOptions), async () => {
      const r = await resolve(path, request)
      if (r.redirect) return { ...r, html: '' }
      const html = await shell(r, request).catch(() => '')
      complete(r, html)
      return { ...r, html }
    })

  async function page(url: URL, request: Request, scope: Scope): Promise<Response> {
    const path = url.pathname + url.search
    const r = await resolve(path, request)
    if (r.redirect)
      return withHeaders(
        new Response(moved(r.redirect.href), {
          status: r.redirect.status,
          headers: {
            location: r.redirect.href,
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-cache',
          },
        }),
        scope,
      )
    scope.started = true // from here a redirect can't change the status (Q007)
    // The server renders from the raw data (deferred fields are still promises, for Boundaries to stream); the page
    // carries the settled part.
    const route = stateOf(r, payloadOf(r, false))
    const sent = new Set<string>()
    const told: { r: Record<string, unknown>; b: Record<string, unknown>; s?: string } = {
      r: {},
      b: {},
    }
    /** Cache entries the client hasn't got. */
    const news = () => {
      const fresh = wire(scope).filter((w) => !sent.has(keyOf(w[0], w[1])))
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
      return {
        r: scrubbed(changed(d?.r ?? {}, told.r), scope),
        b: changed(d?.b ?? {}, told.b),
        ...(fresh && d?.s && { s: d.s }),
      }
    }
    const shown = (e: unknown) => exec.shown(e, scope)
    const stalled = () =>
      options.onDiagnostic?.({
        code: 'E_STREAM',
        severity: 'warning',
        message: `${path}: a render stopped reading anything new, so what's still out is left to the client. Is a query's input different on every render, a \`Date.now()\` say?`,
      })
    const render = () =>
      renderToStream(() => <App route={route} />, {
        ...timing,
        passes: PASSES,
        shown,
        stalled,
        app: { cookies: cookieJar(request) },
        landing: () => `(self.$wc=self.$wc||[]).push(${json({ c: news(), ...since() })});`,
      })
    let s!: Stream
    const assets = options.assets ?? {}
    const lang = site.locale ? ` lang="${esc(site.locale.replace('_', '-'))}"` : ''
    /** The head down to the fonts. Written once `complete` has finished it. */
    const top = () =>
      `<!doctype html>\n<html${lang}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      metaTags(r.head, url.pathname) +
      '\n' +
      (site.head ? site.head + '\n' : '') +
      (assets.fonts ?? [])
        .map(
          (f) =>
            `<link rel="preload" as="font" type="${esc(f.type)}" href="${esc(f.href)}" crossorigin>\n`,
        )
        .join('')
    // Dev: Vite's client (HMR) and weft's agent bridge, which transformIndexHtml adds to HTML-file apps.
    const dev = options.dev
      ? '<script type="module" src="/@vite/client"></script>\n<script type="module" src="/@weft-agent.js"></script>\n'
      : ''
    /** What this render's head needs, from its HTML. */
    const shaped = () => {
      const payload = withLevels(payloadOf(r, false), s.shell, statics, false)
      const parts = islandsOf(s.shell)
      // A Boundary is waiting: the page is usable before it lands, so the client starts now, not at the last byte.
      const streaming = Object.values(s.data()?.b ?? {}).includes('p')
      const now = !parts.lazy.length || payload.m.some((m) => !m.s) || !!payload.i?.length
      // The entry's own script tag already fetches it. Above the styles: a preload found past 50 KB of CSS starts late.
      const preloads = modulepreloads(
        [
          ...(assets.js ?? []),
          ...pageChunks(payload, options.chunks, saveData(request) ? [] : parts.fold, now),
        ],
        assets,
      )
      return {
        payload,
        parts,
        streaming,
        now,
        preloads,
        sheets: pageSheets(assets.css, parts, options.chunks),
      }
    }
    /** The build's first-paint table (`site.criticalCss`, on by default) for this render's sheets. Without it, `pageStyles`. */
    const table = (p: ReturnType<typeof shaped>) =>
      assets.pieces && tableStyles(assets.pieces, p.sheets, site.head, lang)
    /** From `<div id="app">` to what's left to stream. `after`: what goes right past the shell, a table's sheets. */
    const page_ = (p: ReturnType<typeof shaped>, after = '') =>
      `<div id="app">${s.shell}</div>\n` +
      after +
      `<script type="application/json" id="weft-route">${json(p.payload)}</script>\n` +
      (scope.form
        ? `<script type="application/json" id="weft-form">${json(scope.form)}</script>\n`
        : '') +
      // Async, and after all it reads, so it can run while the stream goes on.
      (p.streaming ? (since(), dataTags({ ...pageData(s.data(), scope)!, w: 1 }, news())) : '') +
      (assets.entry && p.streaming
        ? `<script type="module" async src="${esc(assets.entry)}"></script>\n`
        : '')
    const finish = async (streaming: boolean) => {
      const cached = wire(scope)
      // Read after the queries ran: what's published from here on, the first connect replays (research 30 §1).
      if (scope.live) await hub().ready()
      const liveScript = scope.live
        ? `<script type="application/json" id="weft-rt">${json({ c: hub().cursor(), b: options.build })}</script>\n`
        : ''
      // A client that starts after this finds the whole page, as if it had never streamed.
      const stale = streaming
        ? '<script>["weft-data","weft-cache"].forEach(function(i){(i=document.getElementById(i))&&i.remove()})</script>\n'
        : ''
      return stale + dataTags(pageData(s.data(), scope), cached) + liveScript + '</body>\n</html>\n'
    }
    const status = r.status === 200 && scope.form ? scope.form.status : r.status
    const enc = new TextEncoder()
    const rest = async (
      controller: ReadableStreamDefaultController<Uint8Array>,
      styles: Pick<ReturnType<typeof pageStyles>, 'late'>,
      streaming: boolean,
    ) => {
      try {
        for await (const chunk of s.chunks)
          controller.enqueue(
            enc.encode(
              styles.late(pageSheets([], islandsOf(chunk), options.chunks), chunk) + chunk + '\n',
            ),
          )
      } catch (e) {
        options.onDiagnostic?.({ code: 'E_STREAM', severity: 'error', message: String(e) })
      }
      controller.enqueue(enc.encode(await finish(streaming)))
      controller.close()
    }

    // The route rendered before: its head goes out now, from what that render needed, and the page follows it.
    const cold = `${status} ${saveData(request) ? 1 : 0} ${r.levels.map((l) => l.id).join()}`
    // A browser that has the page's sheets gets links: its head is remembered apart, as it has no rules in it. A table's
    // head has no rules either way, so it has no such head.
    const kept = assets.pieces ? undefined : keptSheets(request.headers.get('cookie'))
    const warm = kept && heads.get(cold + ' w')
    const shape = warm && warm.sheets.every((c) => kept.has(sheetId(c.href))) ? cold + ' w' : cold
    const known = heads.get(shape)
    // A level left its title or description to the page's own words (`complete`): those are only known once it renders.
    const worded =
      !!r.metas &&
      r.status === 200 &&
      (leftToPage(r.source!.title) || leftToPage(r.source!.description))
    // Only for a render slow enough to wait on: a fast page goes out whole, compressed once and kept.
    if (known && known.ms >= EARLY_MS && !worded) {
      complete(r)
      // A session read can set cookies, which have to be in the headers: read it before they go.
      if (request.headers.has('cookie')) await scope.ctx().catch(() => {})
      const set = [...scope.headers].length
      const styles = assets.pieces
        ? undefined
        : pageStyles(
            assets,
            known.sheets,
            '',
            site.head,
            known,
            kept,
            request.headers.has('cookie'),
          )
      // With a table, the rules come with the shell they're for: here there's only the order of the layers.
      const head =
        top() +
        known.preloads +
        (assets.entry ? `<link rel="modulepreload" href="${esc(assets.entry)}">\n` : '') +
        (styles ? styles.head : `<style>${assets.pieces!.layers}</style>\n`) +
        (known.capture ? `<script>${capture(known.now)}</script>\n` : '') +
        dev +
        '</head>\n<body>\n'
      const init = {
        status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
          ...(known.fold && { vary: 'Save-Data, Sec-CH-Prefers-Reduced-Data' }),
        },
      }
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(enc.encode(head))
          try {
            const t0 = performance.now()
            s = render()
            await s.settle() // queries read outside a Boundary have nowhere to stream to
            await s.hold(options.hold ?? HOLD)
            const ms = performance.now() - t0
            const p = shaped()
            const t = table(p)
            const capturing = !!options.lazy || p.streaming
            // What this page has beyond the head: sheets, rules, and chunks that render didn't reach.
            const have = new Set(known.preloads.split(/(?=<link )/))
            const more = p.preloads
              .split(/(?=<link )/)
              .filter((l) => l && !have.has(l))
              .join('')
            const rules = t && t.rules(s.shell)
            const lead =
              (t ? (rules ? `<style>${rules}</style>\n` : '') : styles!.late(p.sheets, s.shell)) +
              more +
              (capturing && !known.capture ? `<script>${capture(p.now)}</script>\n` : '')
            controller.enqueue(
              enc.encode(
                lead +
                  page_(p, t ? t.links : '') +
                  (assets.entry && !p.streaming
                    ? `<script type="module" src="${esc(assets.entry)}"></script>\n`
                    : ''),
              ),
            )
            // A render that set a header after they went can't use this: the route goes back to rendering first.
            if ([...scope.headers].length !== set) {
              heads.set(cold, null).set(cold + ' w', null)
              options.onDiagnostic?.({
                code: 'E_HEAD',
                severity: 'warning',
                message: `${path}: a render set a response header after the head was sent, so this route now renders before sending anything.`,
              })
            } else
              remember(styles?.links ? cold + ' w' : cold, {
                ...p,
                ms,
                split: styles?.split ?? false,
                found: styles?.found() ?? new Set(),
                capture: capturing,
                fold: !!p.parts.fold.length,
                preloads: [...have, ...more.split(/(?=<link )/)].filter(Boolean).join(''),
              })
            await rest(controller, t || styles!, p.streaming)
          } catch (e) {
            heads.set(cold, null).set(cold + ' w', null)
            options.onDiagnostic?.({
              code: 'E_HEAD',
              severity: 'error',
              message: `${path}: ${String(e)}`,
            })
            controller.enqueue(
              enc.encode('<p>Something went wrong. <a href="">Reload</a></p>\n</body>\n</html>\n'),
            )
            controller.close()
          }
        },
      })
      return withHeaders(new Response(body, init), scope)
    }

    const t0 = performance.now()
    s = render()
    await s.settle() // queries read outside a Boundary have nowhere to stream to
    await s.hold(options.hold ?? HOLD)
    const ms = performance.now() - t0
    complete(r, s.shell)
    const p = shaped()
    const t = table(p)
    const styles = t
      ? undefined
      : pageStyles(
          assets,
          p.sheets,
          s.shell,
          site.head,
          undefined,
          kept,
          request.headers.has('cookie'),
        )
    const capturing = !!options.lazy || p.streaming
    if (known !== null && !options.dev)
      remember(styles?.links ? cold + ' w' : cold, {
        ...p,
        ms,
        split: styles?.split ?? false,
        found: styles?.found() ?? new Set(),
        capture: capturing,
        fold: !!p.parts.fold.length,
      })
    const head =
      top() +
      p.preloads +
      // A streamed page's entry is at the end of what the shell sends, so its script tag is found late.
      (assets.entry && p.streaming
        ? `<link rel="modulepreload" href="${esc(assets.entry)}">\n`
        : '') +
      (t ? `<style>${assets.pieces!.layers}${t.rules(s.shell)}</style>\n` : styles!.head) +
      (capturing ? `<script>${capture(p.now)}</script>\n` : '') +
      dev +
      (assets.entry && !p.streaming
        ? `<script type="module" src="${esc(assets.entry)}"></script>\n`
        : '') +
      '</head>\n<body>\n' +
      page_(p, t ? t.links : '')
    const init = {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
        ...(p.parts.fold.length && { vary: 'Save-Data, Sec-CH-Prefers-Reduced-Data' }),
      },
    }
    // No Boundary is waiting, so there's nothing to stream: the page goes out in one piece.
    if (!p.streaming) {
      const res = new Response(null, init)
      whole.set(res, head + (await finish(false)))
      return withHeaders(res, scope)
    }
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(enc.encode(head))
        await rest(controller, t || styles!, true)
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
    const from = request.headers.get('sec-fetch-site')
    if (
      !(origin
        ? origin === url.origin && (!from || from === 'same-origin')
        : from === 'same-origin')
    ) {
      options.onDiagnostic?.({
        code: 'F002',
        severity: 'error',
        message: `F002: a form POST to ${url.pathname} without the same-origin proof (\`Origin\` or \`Sec-Fetch-Site\`)`,
      })
      return new Response('Forbidden', { status: 403 })
    }
    const fields = await request.formData()
    const named = fields.get('$fn')
    const id = typeof named === 'string' ? named : ''
    const f = fns.get(id)
    if (f?.kind !== 'mutation') {
      options.onDiagnostic?.({
        code: 'F003',
        severity: 'error',
        message: `F003: a form POST names \`${id}\`, which is no mutation (the page is older than the server)`,
      })
      return new Response('Not found', { status: 404 })
    }
    const see = (href: string) =>
      withHeaders(
        new Response(null, {
          status: 303,
          headers: { location: href, 'cache-control': 'no-cache' },
        }),
        scope,
      )
    const input = decodeForm(fields)
    try {
      await exec.runMutation(scope, f, input, [], true)
      return see(url.pathname + url.search)
    } catch (e) {
      if (isRedirect(e)) return see(e.href)
      const known = e instanceof StartError || e instanceof FnError
      if (!known)
        options.onDiagnostic?.({
          code: 'E_FN',
          severity: 'error',
          message: `${id}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
        })
      const failure = e as { issues?: SchemaIssue[]; status?: number; message?: string } | null
      const issues = failure?.issues
      const { errors, message } = fieldsOf(issues)
      const key = fields.get('$form')
      scope.form = {
        id,
        ...(typeof key === 'string' && { key }),
        values: echoed(input),
        errors,
        message: issues ? message : (exec.shown(e, scope) as Error).message,
        status: issues ? 422 : (failure?.status ?? 500),
      }
      return page(url, request, scope)
    }
  }

  /** `/_weft/m/<hash>/<width>.<fmt>` (research 29 §6): content-addressed, so cached for good; `auto` varies on `Accept`. */
  async function media(url: URL, request: Request): Promise<Response> {
    const m = /^\/_weft\/m\/([0-9a-f]{32})\/(\d+)\.([a-z0-9]+)$/.exec(url.pathname)
    const server = await mediaServer()
    if (!server)
      options.onDiagnostic?.({
        code: 'M017',
        severity: 'error',
        message:
          'M017: a media URL was requested, but nothing provides `media.server`. Add `media()` from `@weft-js/plugin-media` to `plugins`',
      })
    const out =
      m &&
      (await server?.serve({
        hash: m[1]!,
        width: Number(m[2]),
        format: m[3]!,
        accept: request.headers.get('accept') ?? '',
      }))
    if (!out) return new Response('Not found', { status: 404 })
    const headers = new Headers({
      'content-type': out.type,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${m[1]}-${out.width}-${out.format}"`,
      'x-content-type-options': 'nosniff',
    })
    if (out.negotiated) headers.set('vary', 'Accept')
    if (out.type === 'image/svg+xml')
      headers.set(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      )
    if (out.temporary) {
      // The original, standing in for a rung still encoding.
      headers.set('cache-control', 'no-store')
      headers.delete('etag')
    }
    if (request.headers.get('if-none-match') === headers.get('etag'))
      return new Response(null, { status: 304, headers })
    const range =
      /^(video|audio)\//.test(out.type) &&
      /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '')
    if (!range) return new Response(out.bytes as BodyInit, { headers })
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : Infinity, out.bytes.length - 1)
    if (start > end)
      return new Response(null, {
        status: 416,
        headers: { 'content-range': `bytes */${out.bytes.length}` },
      })
    headers.set('content-range', `bytes ${start}-${end}/${out.bytes.length}`)
    return new Response(out.bytes.subarray(start, end + 1) as BodyInit, { status: 206, headers })
  }

  /** The route as JSON for client navigation: deferred fields awaited (no streaming on navigation yet). */
  async function data(path: string, request: Request, scope: Scope): Promise<Response> {
    const r = await resolve(path, request)
    if (r.redirect)
      return withHeaders(
        Response.json(
          { m: [], p: path, s: r.redirect.status, r: r.redirect.href } satisfies RoutePayload,
          { headers: { 'cache-control': 'no-cache' } },
        ),
        scope,
      )
    for (const lv of r.levels)
      if (lv.d?.length)
        lv.data = {
          ...(lv.data as object),
          ...Object.fromEntries(
            await Promise.all(
              lv.d.map(async (k) => [k, await (lv.raw as Record<string, unknown>)[k]]),
            ),
          ),
        }
    await finished(r, request)
    const c = wire(scope)
    let payload = payloadOf(r, true)
    if (r.levels.some((lv) => statics.has(lv.id))) {
      const route = stateOf(r, payload)
      const out = await renderToStringAsync(() => <App route={route} />, {
        passes: PASSES,
        shown: (e) => exec.shown(e, scope),
        app: { cookies: cookieJar(request) },
      })
      const at = out.lastIndexOf('<script type="application/json" data-weft>')
      payload = {
        ...withLevels(payload, at < 0 ? out : out.slice(0, at), statics, true),
        ...(at >= 0 && {
          b: JSON.parse(
            out
              .slice(at)
              .replace(/^<[^>]*>/, '')
              .replace(/<\/script>$/, ''),
          ),
        }),
      }
    }
    return withHeaders(
      Response.json(
        { ...payload, ...(c.length && { c }) },
        { status: 200, headers: { 'cache-control': 'no-cache' } },
      ),
      scope,
    )
  }

  async function og(url: URL, request: Request): Promise<Response> {
    const path =
      '/' +
      url.pathname
        .slice('/_weft/og/'.length)
        .replace(/\.png$/, '')
        .replace(/^index$/, '')
    const r = await resolve(path, request)
    if (r.status !== 200 || !r.route) return new Response('Not found', { status: 404 }) // only params the route's own load accepts
    const head = await finished(r, request)
    const image = head.og.image
    if (typeof image !== 'object' || !image.url.startsWith('/_weft/og/'))
      return new Response('Not found', { status: 404 }) // this page has no generated card
    const want = new URL(image.url, url).searchParams.get('v')
    const cardMod = mod(r.route.card ?? manifest.defaultCard)
    const leaf = r.levels.at(-1)!
    const cardProps = {
      params: leaf.params,
      data: settledView(leaf.raw, leaf.d, leaf.id, options),
      meta: head,
      site: { ...site, url: r.origin },
      path: r.path,
      title: head.og.title ?? head.title,
      description: head.og.description ?? head.description ?? '',
    }
    const Card = (cardMod?.default ?? DefaultCard) as (props: typeof cardProps) => unknown
    const html = renderToString(() => <Card {...cardProps} />, { hydratable: false })
    const png = await renderCard(html, cardMod?.size ?? CARD, options.fonts ?? [], {
      strict: false,
      onDiagnostic: (d: { code: string; severity: string; message: string }) =>
        options.onDiagnostic?.({ ...d, route: r.route!.id }),
    })
    // A signed-in request can see what a public cache must not keep.
    const fresh = url.searchParams.get('v') === want && !request.headers.has('cookie')
    const cache = options.dev
      ? 'no-store'
      : fresh
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
    return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': cache } })
  }

  /** Every path `weft build` prerenders: pages from `prerender`, and the card of each page that has a generated one. */
  async function prerenderPaths(request: Request): Promise<string[]> {
    const paths: string[] = []
    for (const route of manifest.routes) {
      if (route.kind !== 'page') continue
      const p = mod(route.file)?.prerender
      const given = typeof p === 'function' ? await p() : p
      const list: Record<string, string>[] =
        given === true ? [{}] : (given ?? (route.params.length ? [] : [{}]))
      for (const params of list) {
        const path = fill(route.pattern, params, route.splat)
        const r = await resolve(path, request)
        if (given && r.status === 200) paths.push(path)
        const image = (await finished(r, request)).og.image
        if (
          r.status === 200 &&
          typeof image === 'object' &&
          image &&
          image.url.startsWith('/_weft/og/')
        )
          paths.push(image.url.replace(/\?.*/, ''))
      }
    }
    return paths
  }

  /**
   * Build mode (research 20 §4.3): the card URLs `weft build` prerenders, queued through Nitro's `x-nitro-prerender`.
   * It's a header, so a big site's list comes a page at a time: too long a header is an error that Nitro's client
   * logs and carries on from, and the build ends with no cards.
   */
  let listing: Promise<string[][]> | undefined
  async function prerenderList(request: Request, url: URL): Promise<Response> {
    const pages = await (listing ??= prerenderPaths(request).then((p) => pathPages(p)))
    const n = Number(url.searchParams.get('page') ?? 0)
    const paths = [
      ...(pages[n] ?? []),
      ...(n + 1 < pages.length ? [`/_weft/og-routes?page=${n + 1}`] : []),
    ]
    // HTML, because Nitro's prerenderer only follows links (and this header) from HTML responses.
    const list = paths.map((p) => `<a href="${esc(p)}">${esc(p)}</a>`).join('\n')
    return new Response(`<!doctype html>\n<meta name="robots" content="noindex">\n${list}\n`, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-nitro-prerender': paths.join(',') },
    })
  }

  /** Everything under `/_weft/x/<key>/`, for the extension with that key. Nothing else reaches it. */
  async function extensionRoute(url: URL, request: Request, scope: Scope) {
    const [key = '', ...rest] = url.pathname.slice(EXTENSION.length).split('/')
    const extension = extensions.get(key)
    if (!extension?.handle) return new Response('Not found', { status: 404 })
    return extension.handle(request, rest.join('/'), {
      invalidate: (tags) => exec.invalidate(scope, tags),
      report: (d) => options.onDiagnostic?.(d),
    })
  }

  const route = (request: Request, scope: Scope): Promise<Response> => {
    const url = new URL(request.url)
    if (options.auth && (url.pathname === authBase || url.pathname.startsWith(authBase + '/')))
      return Promise.resolve(options.auth.handler(request))
    if (url.pathname.startsWith('/_weft/fn/')) return serverFunction(options, url, request, scope)
    if (url.pathname.startsWith(EXTENSION)) return extensionRoute(url, request, scope)
    if (
      request.method === 'POST' &&
      !url.pathname.startsWith('/_weft/') &&
      /^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(
        request.headers.get('content-type') ?? '',
      )
    )
      return form(url, request, scope)
    if (url.pathname === '/_weft/rt') return rtRoute(request, scope, options.realtime?.origins)
    if (url.pathname === '/_weft/ws') return socketRoute(request, scope, options.realtime?.origins)
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return Promise.resolve(new Response('Method not allowed', { status: 405 }))
    if (url.pathname.startsWith('/_weft/m/')) return media(url, request)
    if (url.pathname.startsWith('/_weft/og/') && url.pathname.endsWith('.png'))
      return og(url, request)
    if (url.pathname.startsWith('/_weft/data/') || url.pathname === '/_weft/data')
      return data((url.pathname.slice('/_weft/data'.length) || '/') + url.search, request, scope)
    if (url.pathname === '/_weft/og-routes') return prerenderList(request, url)
    return page(url, request, scope)
  }
  const handler = async (incoming: Request): Promise<Response> => {
    const request = options.auth ? stamped(incoming) : incoming
    await loadExtensions()
    if (!checked) {
      checked = true
      exec.checkTags((d) => options.onDiagnostic?.(d))
    }
    const scope = exec.createScope(request, scopeOptions)
    // The build's prerender only lists cards: it holds no secrets and may have no database.
    if (new URL(request.url).pathname === '/_weft/og-routes')
      return als.run(scope, () => route(request, scope))
    await boot()
    if (options.liveRequired?.length) await hub().probed
    if (hub().refused)
      return Response.json(
        {
          e: {
            code: 'R015',
            message: options.dev ? hub().refused!.message : 'Live data is unavailable.',
          },
        },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      )
    return compressed(request, await als.run(scope, () => route(request, scope)))
  }
  return Object.assign(handler, { resolve, inspect })
}

const HEADS_MAX = 512
/** A render this long (ms) sends its head first. Under it, waiting for the whole page costs less than streaming it. */
const EARLY_MS = 4
/** Most queries answer within this (ms): a Boundary whose data does is rendered in the page, not swapped in from a chunk. */
const HOLD = 25
interface Head {
  ms: number
  sheets: { href: string }[]
  preloads: string
  now: boolean
  capture: boolean
  fold: boolean
  split: boolean
  found: Set<string>
}

function fill(pattern: string, params: Record<string, string>, splat?: string) {
  return pattern.replace(/\$([\w$]*)/g, (_, n) =>
    n ? encodeURIComponent(params[n]!) : (params[splat!] ?? ''),
  )
}

/** The data without its deferred (promise) fields, and their names. */
function split(raw: unknown): { data: unknown; d?: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: raw }
  const fields = raw as Record<string, unknown>
  const d = Object.keys(raw).filter((k) => thenable(fields[k]))
  if (!d.length) return { data: raw }
  for (const k of d) Promise.resolve(fields[k]).catch(() => {}) // a deferred failure surfaces in its Boundary
  return { data: Object.fromEntries(Object.entries(raw).filter(([k]) => !d.includes(k))), d }
}

/** What `meta` and cards see: the settled data. Reading a deferred field is H007 (it's still streaming). */
function settledView(
  raw: unknown,
  deferred: string[] | undefined,
  id: string,
  options: HandlerOptions,
) {
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
  const { jsonLd: _, ...head } = r.head // only a first response carries it (`metaTags`)
  return {
    m: r.levels.map(({ id, params, data, d, t }) => ({
      id,
      params,
      data,
      ...(d && { d }),
      ...(t && { t }),
    })),
    p: r.path,
    s: r.status,
    ...(withHead && { h: head }),
  }
}

const dataTags = (data: unknown, cached: Wire[]) =>
  `<script type="application/json" id="weft-data">${json(data)}</script>\n` +
  (cached.length
    ? `<script type="application/json" id="weft-cache">${json(cached)}</script>\n`
    : '')

/** A render's data as a page may carry it: what failed says only what `exec.shown` let through. */
function pageData(data: ReturnType<Stream['data']>, scope: Scope) {
  return data && { ...data, r: scrubbed(data.r, scope) }
}

const scrubbed = (r: Record<string, { v?: unknown; e?: string }>, scope: Scope) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v.e === undefined ? v : { e: exec.said(v.e, scope) }]),
  )

/** The request's resolved queries, as the client cache seeds them (failures are left for the client to retry). */
function wire(scope: Scope): Wire[] {
  return [...scope.entries.values()]
    .filter((e) => e.done && e.e === undefined)
    .map((e) => [e.id, e.input, e.v, e.tags])
}

export { headTags }
