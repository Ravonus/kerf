// The client router (research 25 §3): hydrate the server's page, then navigate without page loads. A navigation
// fetches `/_weft/data/<path>` (the server matches, runs the loaders and merges the head, so loaders never ship to
// the client), loads the route chunks it needs (started in parallel from a guess against the route table), and
// writes the levels: a level that keeps its route keeps its component and gets new params/data in place.
// `setHead` writes the server's merged tags for the tab title and history; crawlers only read the server's HTML.

import { hydrate } from 'weft/dom'
import { setHead } from 'weft/head'
import { applyMatches, client, createRouteState, type Component, type Match, type NavigateOptions, type RoutePayload } from './router'
import { App } from './view'
import { ErrorPage, NotFoundPage } from './builtin'

/** The client half of `virtual:weft/routes`: the page routes in match order, and a chunk loader per route id. */
export interface ClientRoutes {
  table: { id: string; pattern: string; layouts: string[] }[]
  load: Record<string, () => Promise<{ default?: Component }>>
}

/** Hydrate the page in `#app` and take over its links. Resolves once hydrated. */
export async function start(routes: ClientRoutes, options: { container?: Element } = {}) {
  const container = options.container ?? document.getElementById('app')!
  const page: RoutePayload = JSON.parse(document.getElementById('weft-route')!.textContent!)
  const data = JSON.parse(document.getElementById('weft-data')?.textContent ?? 'null')
  const comps: Record<string, Component> = {}
  // The built-in 404 and error pages stand in only when the app has no route file for them.
  const builtin: Record<string, Component> = { 404: NotFoundPage, error: ErrorPage }
  const chunk = (id: string) =>
    comps[id] ? Promise.resolve()
    : routes.load[id] ? routes.load[id]().then(m => { if (m.default) comps[id] = m.default })
    : Promise.resolve(builtin[id] && (comps[id] = builtin[id]))
  await Promise.all(page.m.map(m => chunk(m.id)))
  const route = createRouteState(page, comps)
  hydrate(() => <App route={route} />, container, { data })
  client.route = route

  let current: AbortController | undefined
  async function go(href: string, opts: NavigateOptions & { pop?: boolean } = {}) {
    const url = new URL(href, location.href)
    if (url.origin !== location.origin) return location.assign(url.href)
    current?.abort()
    const ctrl = (current = new AbortController())
    const path = url.pathname + url.search
    guess(routes, url.pathname).forEach(chunk) // chunk loads start with the data fetch, not after it
    let next: RoutePayload
    try {
      const res = await fetch(`/_weft/data${path === '/' ? '' : url.pathname}${url.search}`, { signal: ctrl.signal, headers: { accept: 'application/json' } })
      next = await res.json()
    } catch (e) {
      if (ctrl.signal.aborted) return
      return location.assign(url.href) // the data request failed: let the server render the page
    }
    if (next.r) return go(next.r, { replace: true })
    await Promise.all(next.m.map(m => chunk(m.id)))
    if (ctrl.signal.aborted) return
    if (!opts.pop) history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.href)
    applyMatches(route, next.m.map(revive), path, next.s)
    if (next.h) setHead(next.h, url.pathname)
    if (opts.scroll !== false && !opts.pop) {
      const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)))
      target ? target.scrollIntoView() : window.scrollTo(0, 0)
    }
  }
  client.navigate = go

  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a')
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin || url.pathname.startsWith('/_weft/')) return
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return // in-page anchor
    e.preventDefault()
    go(url.href)
  })
  addEventListener('popstate', () => go(location.href, { pop: true }))
  return route
}

/** Deferred fields arrive resolved on navigation: they become settled promises again, so resources read them alike. */
function revive(m: Match): Match {
  if (!m.d?.length) return m
  const data: any = { ...(m.data as object) }
  for (const k of m.d) data[k] = Promise.resolve(data[k])
  return { ...m, data }
}

/** The route ids `pathname` probably needs (its layouts and page), from the table; the server's answer decides. */
function guess(routes: ClientRoutes, pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean)
  for (const r of routes.table) {
    const segs = r.pattern.split('/').filter(Boolean)
    const splat = segs.at(-1) === '$'
    if (splat ? parts.length < segs.length - 1 : parts.length !== segs.length) continue
    if (segs.every((s, i) => s === '$' || s.startsWith('$') || s === decodeURIComponent(parts[i] ?? ''))) return [...r.layouts, r.id]
  }
  return []
}
