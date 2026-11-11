import type { AsyncLocalStorage } from 'node:async_hooks'
import { region } from '@kerf-js/core/ssr'
import { createRouteState, type Component, type RoutePayload } from '../router'
import { ErrorPage, NotFoundPage } from '../builtin'
import { deployUrl } from '../derive.mjs'
import type { Scope } from '../exec'
import { routeTree } from './routes'
import type { Head } from './page-types'
import type { HandlerOptions, Resolved } from './types'

const HEADS_MAX = 512

/** Handler-local routing, component and head-cache state. */
export function makeCore(options: HandlerOptions, als: AsyncLocalStorage<Scope>) {
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
          "H001 `site.url` is not set, so canonical, og:url and og:image use the request's Host header. Set `site.url`, or `KERF_SITE_URL` in the deploy environment.",
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
  return { manifest, site, byId, mod, comps, statics, heads, remember, originOf, stateOf, tree }
}
