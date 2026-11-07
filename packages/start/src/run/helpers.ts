import { flush } from '@weft-js/core'
import { rt } from '@weft-js/core/internal'
import type { Component, Match, RoutePayload } from '../router'
import type { ClientRoutes } from '../run'

/**
 * A deferred field on a page that loaded with its value still out. A chunk brings what's rendered from it; this is for
 * the render that hasn't one, a Boundary's retry or one the stream gave up on. The route has it, and only that asks.
 */
export function deferred(path: string, level: number, key: string): PromiseLike<unknown> {
  let got: Promise<unknown> | undefined
  const value = () => {
    if (rt.probe) return new Promise(() => {}) // a hydrate run only tracks its reads, and nothing waits on what it gets
    if (!got) {
      got = ask(new URL(path, location.href))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Server function failed.'))))
        .then((next: RoutePayload) => (next.m[level]!.data as Record<string, unknown>)[key])
      got.catch(() => (got = undefined))
    }
    return got
  }
  return {
    // oxlint-disable-next-line unicorn/no-thenable -- it is a promise, one that asks the server only once something awaits it
    then: (ok, no) => value().then(ok, no),
    catch: (no?: (e: unknown) => unknown) => value().catch(no),
    finally: (fn?: () => void) => value().finally(fn),
  } as PromiseLike<unknown>
}

export const ask = (url: URL, signal?: AbortSignal, tag?: string) =>
  fetch(`/_weft/data${url.pathname === '/' ? '' : url.pathname}${url.search}`, {
    signal: signal ?? null,
    cache: 'no-cache',
    headers: { accept: 'application/json', ...(tag && { 'if-none-match': tag }) },
  })

/** Whether every client component and island required by a route is already loaded. */
export function routeCodeReady(
  next: RoutePayload,
  comps: Record<string, Component>,
  islands: Record<string, Component>,
) {
  return next.m.every((m) => m.s || !!comps[m.id]) && (next.i ?? []).every((id) => !!islands[id])
}

/** The URL a client navigation would take from this event's link, or nothing for a link the browser should follow. */
export function ours(target: EventTarget | null) {
  const a = (target as Element | null)?.closest?.('a')
  if (
    !a ||
    (a.target && a.target.toLowerCase() !== '_self') ||
    a.hasAttribute('download') ||
    [...a.relList].some((token) => token.toLowerCase() === 'external')
  )
    return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || url.pathname.startsWith('/_weft/')) return
  return url.pathname === location.pathname && url.search === location.search && url.hash
    ? undefined
    : url // not an in-page anchor
}

/** A kept static level has no binding for its links' current-page state: the same rule as `Link`, after the swap. */
export function current_(path: string) {
  flush()
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let match = false
    try {
      const url = new URL(a.href)
      match = url.origin === location.origin && url.pathname === path && !url.search && !url.hash
    } catch {
      /* malformed links cannot match */
    }
    if (match && !a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page')
    else if (!match && a.getAttribute('aria-current') === 'page') a.removeAttribute('aria-current')
  }
}

/** Deferred fields arrive resolved on navigation: they become settled promises again, so resources read them alike. */
export function revive(m: Match): Match {
  if (!m.d?.length) return m
  const data = { ...(m.data as Record<string, unknown>) }
  for (const k of m.d) data[k] = Promise.resolve(data[k])
  return { ...m, data }
}

/** The route ids `pathname` probably needs (its layouts and page), from the table; the server's answer decides. */
export function guess(routes: ClientRoutes, pathname: string): string[] {
  // A server load canonicalizes trailing slashes before it has a page match.
  if (pathname.length > 1 && pathname.endsWith('/')) return []
  let parts: string[]
  try {
    const path = pathname.replace(/^\/+|\/+$/g, '')
    parts = path ? path.split('/').map(decodeURIComponent) : []
  } catch {
    return []
  }
  for (const r of routes.table) {
    const segs = r.pattern.split('/').filter(Boolean)
    const splat = segs.at(-1) === '$'
    if (splat ? parts.length < segs.length - 1 : parts.length !== segs.length) continue
    if (
      segs.every(
        (s, i) =>
          s === '$' ||
          (s.startsWith('$') ? !!parts[i] : s.toLowerCase() === parts[i]?.toLowerCase()),
      )
    )
      return [...r.layouts, r.id]
  }
  return []
}

/** Find the outlet whose route parameter changed against the committed URL. */
export function changedRouteParams(
  routes: ClientRoutes,
  committedURL: string,
  ids: string[],
  url: URL,
) {
  const from = new URL(committedURL)
  if (from.pathname === url.pathname && from.search === url.search) return -1
  const route = routes.table.find((item) => item.id === ids.at(-1))
  if (!route || guess(routes, from.pathname).join('\0') !== ids.join('\0')) return -1
  try {
    const partsOf = (path: string) => {
      const trimmed = path.replace(/^\/+|\/+$/g, '')
      return trimmed ? trimmed.split('/').map(decodeURIComponent) : []
    }
    const before = partsOf(from.pathname)
    const after = partsOf(url.pathname)
    const parts = route.pattern.split('/').filter(Boolean)
    const changed = parts.findIndex(
      (part, index) =>
        part.startsWith('$') &&
        (part === '$'
          ? JSON.stringify(before.slice(index)) !== JSON.stringify(after.slice(index))
          : before[index] !== after[index]),
    )
    if (changed >= 0) {
      const layout = ids.findIndex(
        (id, depth) =>
          depth < ids.length - 1 &&
          id.startsWith('layout:') &&
          id.slice(7).split('/').filter(Boolean).length > changed,
      )
      return layout < 0 ? ids.length - 1 : layout
    }
    return from.search !== url.search ? ids.length - 1 : -1
  } catch {
    return -1
  }
}
