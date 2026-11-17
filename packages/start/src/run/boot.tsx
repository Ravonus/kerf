import { enter, hydrate, hydration, level as staticLevel, park } from '@kerf-js/core/dom'
import { client, createRouteState, type Component, type RoutePayload } from '../router'
import { onCleanup, state, untrack } from '@kerf-js/core'
import { onRenderError } from '@kerf-js/core/internal'
import { App } from '../view'
import { ErrorPage, NotFoundPage } from '../builtin'
import { matchingRouteAssets } from '../asset-receipt.mjs'
import type { ClientRoutes } from '../run'
import { deferred, routeCodeReady } from './helpers'
import { FALLBACK_ROUTE, LATE_ERROR } from '../failure'
import { RouteChunkError } from './failure'

/** What the stream's scripts leave on `globalThis`: each chunk's data as it lands, and what a held Boundary builds with. */
export const streamed = globalThis as typeof globalThis & {
  $wc?: { r?: object; b?: object; s?: object }[]
  $wh?: Record<string, () => void> | 0
}

export function prepare(routes: ClientRoutes, options: { container?: Element }) {
  const container = options.container ?? document.getElementById('app')!
  const page: RoutePayload = JSON.parse(document.getElementById('kerf-route')!.textContent)
  const data = JSON.parse(document.getElementById('kerf-data')?.textContent ?? 'null')
  const tags = page.m.map((m) => m.t ?? [])
  const comps: Record<string, Component> = { [FALLBACK_ROUTE]: ErrorPage }
  // The built-in 404 and error pages stand in only when the app has no route file for them.
  const builtin: Record<string, Component> = { 404: NotFoundPage, error: ErrorPage }
  const chunks = new Map<string, Promise<void>>()
  const failed = new Set<string>()
  const chunk = (id: string, retry = false): Promise<void> => {
    const original = routes.load[id]
    if (comps[id] || !original) {
      if (!comps[id] && builtin[id]) comps[id] = builtin[id]
      return Promise.resolve()
    }
    const fresh = retry && failed.delete(id)
    if (fresh) chunks.delete(id)
    const current = chunks.get(id)
    if (current) return current
    const load = fresh ? (routes.retryLoad?.[id] ?? original) : original
    const next = Promise.resolve()
      .then(load)
      .then((m) => {
        if (m.default) comps[id] = m.default
      })
      .catch((error) => {
        failed.add(id)
        throw error
      })
    chunks.set(id, next)
    return next
  }
  const islands: Record<string, Component> = {}
  const island = (id: string) =>
    islands[id]
      ? undefined
      : routes.islands![id]!().then((m) => {
          islands[id] = m.default
        })
  const loaded = Promise.all([
    ...page.m.map((m, depth) =>
      m.s ? undefined : chunk(m.id).catch((e) => new RouteChunkError(depth, e)),
    ),
    ...(page.i ?? []).map((id) =>
      island(id)?.catch(
        (e) =>
          new RouteChunkError(
            page.m.findIndex((m) => m.s),
            e,
          ),
      ),
    ),
  ]).then((errors) => errors.find((error) => error !== undefined))
  return { container, page, data, tags, comps, chunk, islands, island, loaded, build: routes.build }
}

export function mount({
  container,
  page,
  data,
  tags,
  comps,
  chunk,
  islands,
  island,
  build,
}: ReturnType<typeof prepare>) {
  page.m.forEach((m, i) => {
    for (const k of m.d ?? [])
      if (!m.s) (m.data as Record<string, unknown>)[k] = deferred(page.p, i, k)
  })
  const route = createRouteState(page, comps)
  const { pending, recovery } = recover(route)
  route.assetBytes = matchingRouteAssets(page.a, build)
  let bag: RoutePayload['b']
  route.mount = (html, depth, next) =>
    staticLevel(
      html,
      depth,
      next,
      (id) => islands[id]! as never,
      bag ?? undefined,
      (id) => Promise.resolve(island(id)),
    )
  route.hide = park
  route.around = (_d, _id, body) => enter(body)
  if (data && document.getElementById(LATE_ERROR)) data.w = 1
  // What landed while the chunks loaded: from here on, a Boundary that's still out is held, and its chunk builds it.
  if (data)
    for (const l of streamed.$wc ?? []) {
      Object.assign(data.r, l.r)
      Object.assign(data.b, l.b)
      if (l.s) Object.assign((data.s ??= {}), l.s)
    }
  // What a Boundary still out claims its chunk with, once it lands: a claim like this one, of nodes that came after it.
  if (data?.w)
    data.w = (root: Element, fn: () => void) => {
      for (const el of root.querySelectorAll('[wk]'))
        hydration.registry.set(el.getAttribute('wk')!, el)
      try {
        fn()
      } finally {
        hydration.registry.clear()
        const list = hydration.trash.splice(0)
        setTimeout(() => {
          for (const n of list) n.nodeType === 1 ? (n as Element).removeAttribute('wk') : n.remove()
        })
      }
    }
  hydrate(() => <App route={route} />, container, { data })
  client.route = route
  // The stream broke or failed before its last script: what's held takes its default, not a skeleton for good.
  if (data?.w) {
    const over = () => {
      // The route recovery disposes the failed outlet before it releases the surviving Boundaries.
      if (document.getElementById(LATE_ERROR)) return
      const h = streamed.$wh || {}
      streamed.$wh = 0
      for (const k in h) h[k]!()
    }
    document.readyState === 'complete' ? over() : addEventListener('load', over, { once: true })
  }

  return {
    route,
    chunk,
    island,
    ready: (next: RoutePayload) => routeCodeReady(next, comps, islands),
    initialTags: tags,
    pending,
    recovery,
    matches: page.m,
    setBag: (next: RoutePayload['b']) => (bag = next),
  }
}

function recover(route: ReturnType<typeof createRouteState>) {
  const pending = state(false)
  const recovery: { retry?: () => Promise<void>; fail?: (depth: number, error: unknown) => void } =
    {}
  route.recovery = {
    retry: () => recovery.retry?.() ?? Promise.resolve(),
    get pending() {
      return pending.value
    },
  }
  route.guard = (depth, id, body) => {
    const lv = route.levels[depth]!
    let alive = true
    onCleanup(() => {
      alive = false
    })
    onRenderError((error) => {
      queueMicrotask(() => {
        if (alive && untrack(() => lv.id.value) === id) recovery.fail?.(depth, error)
      })
    })
    return body()
  }
  return { pending, recovery }
}
