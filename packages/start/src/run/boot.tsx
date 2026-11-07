import { enter, hydrate, hydration, level as staticLevel } from '@weft-js/core/dom'
import { client, createRouteState, type Component, type RoutePayload } from '../router'
import { App } from '../view'
import { ErrorPage, NotFoundPage } from '../builtin'
import { matchingRouteAssets } from '../asset-receipt.mjs'
import type { ClientRoutes } from '../run'
import { deferred } from './helpers'

/** What the stream's scripts leave on `globalThis`: each chunk's data as it lands, and what a held Boundary builds with. */
export const streamed = globalThis as typeof globalThis & {
  $wc?: { r?: object; b?: object; s?: object }[]
  $wh?: Record<string, () => void> | 0
}

export function prepare(routes: ClientRoutes, options: { container?: Element }) {
  const container = options.container ?? document.getElementById('app')!
  const page: RoutePayload = JSON.parse(document.getElementById('weft-route')!.textContent)
  const data = JSON.parse(document.getElementById('weft-data')?.textContent ?? 'null')
  const tags = page.m.map((m) => m.t ?? [])
  const comps: Record<string, Component> = {}
  // The built-in 404 and error pages stand in only when the app has no route file for them.
  const builtin: Record<string, Component> = { 404: NotFoundPage, error: ErrorPage }
  const chunk = (id: string) =>
    comps[id]
      ? Promise.resolve()
      : routes.load[id]
        ? routes.load[id]().then((m) => {
            if (m.default) comps[id] = m.default
          })
        : Promise.resolve(builtin[id] && (comps[id] = builtin[id]))
  const islands: Record<string, Component> = {}
  const island = (id: string) =>
    islands[id]
      ? undefined
      : routes.islands![id]!().then((m) => {
          islands[id] = m.default
        })
  const loads = [
    ...page.m.filter((m) => !m.s).map((m) => chunk(m.id)),
    ...(page.i ?? []).map(island),
  ] as Promise<void>[]
  return { container, page, data, tags, comps, chunk, islands, island, loads, build: routes.build }
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
  route.around = (_d, _id, body) => enter(body)
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
    initialTags: tags,
    setBag: (next: RoutePayload['b']) => (bag = next),
  }
}
