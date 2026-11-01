// The client router (research 25 §3): hydrate the server's page, then navigate without page loads. A navigation
// fetches `/_weft/data/<path>` (the server matches, runs the loaders and merges the head, so loaders never ship to
// the client), loads the route chunks it needs (started in parallel from a guess against the route table), and
// writes the levels: a level that keeps its route keeps its component and gets new params/data in place.
// `setHead` writes the server's merged tags for the tab title and history; crawlers only read the server's HTML.
//
// Server functions (research 27): the query cache seeds itself from the page's `#weft-cache` as it loads, and gets
// each navigation's `c` through `client.seed`, so hydration fetches nothing (and an app without queries doesn't ship
// the cache). Redirects from loaders and server functions navigate (at most 5 in a row); a
// mutation that invalidates a tag the current route's loaders read refetches the route data in place.

import { enter, hydrate, level as staticLevel } from 'weft/dom'
import { flush } from 'weft'
import { setHead } from 'weft/head'
import { applyMatches, client, createRouteState, type Component, type Match, type NavigateOptions, type RoutePayload } from './router'
import { App } from './view'
import { ErrorPage, NotFoundPage } from './builtin'

/** The client half of `virtual:weft/routes`: the page routes in match order, and a chunk loader per route id. */
export interface ClientRoutes {
  table: { id: string; pattern: string; layouts: string[] }[]
  load: Record<string, () => Promise<{ default?: Component }>>
  /** Each island's code, by id: all a static level loads (PLAN §11). */
  islands?: Record<string, () => Promise<{ default: (props: any) => unknown }>>
}

/** Hydrate the page in `#app` and take over its links. Resolves once hydrated. */
export async function start(routes: ClientRoutes, options: { container?: Element } = {}) {
  const container = options.container ?? document.getElementById('app')!
  const page: RoutePayload = JSON.parse(document.getElementById('weft-route')!.textContent!)
  const data = JSON.parse(document.getElementById('weft-data')?.textContent ?? 'null')
  let tags = page.m.map(m => m.t ?? [])
  const comps: Record<string, Component> = {}
  // The built-in 404 and error pages stand in only when the app has no route file for them.
  const builtin: Record<string, Component> = { 404: NotFoundPage, error: ErrorPage }
  const chunk = (id: string) =>
    comps[id] ? Promise.resolve()
    : routes.load[id] ? routes.load[id]().then(m => { if (m.default) comps[id] = m.default })
    : Promise.resolve(builtin[id] && (comps[id] = builtin[id]))
  const islands: Record<string, (props: any) => unknown> = {}
  const island = (id: string) => islands[id] ? undefined : routes.islands![id]().then(m => { islands[id] = m.default })
  await Promise.all([...page.m.filter(m => !m.s).map(m => chunk(m.id)), ...(page.i ?? []).map(island)])
  const route = createRouteState(page, comps)
  let bag: RoutePayload['b']
  route.mount = (html, depth, next) => staticLevel(html, depth, next, id => islands[id], bag ?? undefined)
  route.around = (_d, _id, body) => enter(body)
  hydrate(() => <App route={route} />, container, { data })
  client.route = route

  let current: AbortController | undefined
  let warm: { path: string; at: number; res: Promise<Response> } | undefined
  async function go(href: string, opts: NavigateOptions & { pop?: boolean; hops?: number } = {}) {
    const url = new URL(href, location.href)
    if (url.origin !== location.origin) return location.assign(url.href)
    current?.abort()
    const ctrl = (current = new AbortController())
    const path = url.pathname + url.search
    guess(routes, url.pathname).forEach(chunk) // chunk loads start with the data fetch, not after it
    let next: RoutePayload
    try {
      const held = warm?.path === path && performance.now() - warm.at < 10_000 ? warm.res : undefined
      warm = undefined
      next = await (held ?? ask(url, ctrl.signal)).then(r => r.clone().json())
    } catch (e) {
      if (ctrl.signal.aborted) return
      return location.assign(url.href) // the data request failed: let the server render the page
    }
    if (next.r) {
      const hops = (opts.hops ?? 0) + 1
      return hops > 5 ? location.assign(next.r) : go(next.r, { replace: opts.pop || opts.replace, hops }) // a back/forward to a moved URL replaces its entry
    }
    await Promise.all([...next.m.map(m => chunk(m.id)), ...(next.i ?? []).map(island)])
    if (ctrl.signal.aborted) return
    if (!opts.pop) history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.href)
    if (next.c) client.seed ? client.seed(next.c) : (client.seeds ??= []).push(...next.c)
    tags = next.m.map(m => m.t ?? [])
    bag = next.b
    applyMatches(route, next.m.map(revive), path, next.s)
    if (next.m.some(m => m.s)) current_(url.pathname)
    if (next.h) setHead(next.h, url.pathname)
    if (opts.scroll !== false && !opts.pop) {
      const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)))
      target ? target.scrollIntoView() : window.scrollTo(0, 0)
    }
  }
  client.navigate = go
  // A mutation invalidated tags: when the route's loaders read one, refetch the route data (no history entry, no scroll).
  client.invalidated = t => {
    warm = undefined
    if (tags.some(l => l.some(x => t.includes(x)))) void go(location.href, { pop: true })
  }

  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const url = ours(e.target)
    if (!url) return
    e.preventDefault()
    go(url.href)
  })
  // A link the pointer rests on, or the keyboard lands on, has its chunks and data by the time it is pressed.
  // `data-preload="off"` on a link opts out, and so does Save-Data.
  let pending: ReturnType<typeof setTimeout> | undefined
  const intent = (e: Event) => {
    clearTimeout(pending)
    const url = ours(e.target)
    const path = url && url.pathname + url.search
    if (!url || warm?.path === path || (e.target as Element).closest('[data-preload="off"]') || (navigator as any).connection?.saveData) return
    pending = setTimeout(() => {
      guess(routes, url.pathname).forEach(chunk)
      warm = { path: path!, at: performance.now(), res: ask(url) }
      warm.res.catch(() => { warm = undefined })
    }, e.type === 'focusin' ? 0 : 80)
  }
  document.addEventListener('pointerover', intent)
  document.addEventListener('focusin', intent)
  addEventListener('popstate', () => go(location.href, { pop: true }))
  return route
}

const ask = (url: URL, signal?: AbortSignal) => fetch(`/_weft/data${url.pathname === '/' ? '' : url.pathname}${url.search}`, { signal, headers: { accept: 'application/json' } })

/** The URL a client navigation would take from this event's link, or nothing for a link the browser should follow. */
function ours(target: EventTarget | null) {
  const a = (target as Element | null)?.closest?.('a')
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || url.pathname.startsWith('/_weft/')) return
  return url.pathname === location.pathname && url.search === location.search && url.hash ? undefined : url // not an in-page anchor
}

/** A kept static level has no binding for its links' current-page state: the same rule as `Link`, after the swap. */
function current_(path: string) {
  flush()
  for (const a of document.querySelectorAll('a[aria-current="page"]')) if (a.getAttribute('href') !== path) a.removeAttribute('aria-current')
  for (const a of document.querySelectorAll(`a[href="${CSS.escape(path)}"]:not([aria-current])`)) a.setAttribute('aria-current', 'page')
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
