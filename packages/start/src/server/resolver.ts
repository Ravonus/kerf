import type { AsyncLocalStorage } from 'node:async_hooks'
import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  isNotFound,
} from '@tanstack/router-core'
import { createMemoryHistory } from '@tanstack/history'
import { mergeMeta, type Merged, type Meta as MetaObject } from '@weft-js/core/ssr'
import type { Component } from '../router'
import { StartError } from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { cleanParams, type routeTree, type LoadContext } from './routes'
import { split, settledView } from './payload'
import type {
  HandlerOptions,
  LayoutEntry,
  Level,
  MetaSource,
  Resolved,
  RouteEntry,
  RouteModule,
} from './types'

type RouterOptions = ConstructorParameters<typeof RouterCore>[0]
export interface ResolverDeps {
  als: AsyncLocalStorage<Scope>
  scopeOptions: Parameters<typeof exec.createScope>[1]
  tree: ReturnType<typeof routeTree>
  site: NonNullable<HandlerOptions['site']>
  manifest: HandlerOptions['manifest']
  byId: Map<string, RouteEntry>
  mod: (file?: string) => RouteModule | undefined
  comps: Record<string, Component>
  options: HandlerOptions
  originOf: (request: Request) => string | undefined
}
const stores = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (f: () => void) => f(),
})
/** The origin a head's URLs are built on, or none. */
export function pointAt(head: Merged, origin: string | undefined) {
  if (origin) head.url = origin
  else delete head.url
}

export async function resolveRoute(
  deps: ResolverDeps,
  path: string,
  request: Request,
): Promise<Resolved> {
  const { als, scopeOptions, tree } = deps
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
  return resolvedMatches(deps, router, hold, path, request)
}

async function resolvedMatches(
  deps: ResolverDeps,
  router: InstanceType<typeof RouterCore>,
  hold: LoadContext,
  path: string,
  request: Request,
): Promise<Resolved> {
  const { site, manifest, byId, mod, comps, options } = deps
  const native =
    router._serverResult?.type === 'redirect' ? router._serverResult.redirect : undefined
  const href = native?.headers.get('location')
  const goes =
    hold.out.redirect ??
    (native && href ? { isRedirect: true as const, href, status: native.status } : undefined)
  if (goes)
    return {
      status: goes.status,
      path,
      levels: [],
      head: mergeMeta(site),
      redirect: goes,
      ...(!hold.out.redirect && native ? { redirectHeaders: native.headers } : {}),
    }
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
  const missing = !route || matches.some((x) => x.m.status === 'notFound' || isNotFound(x.m.error))
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
  const finish = (shown: Level[], status: number, matched?: RouteEntry, error?: unknown) =>
    finishResolution(deps, path, request, shown, status, matched, error)

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

export async function finishResolution(
  deps: ResolverDeps,
  path: string,
  request: Request,
  shown: Level[],
  status: number,
  matched?: RouteEntry,
  error?: unknown,
): Promise<Resolved> {
  const { site, options, originOf } = deps
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
