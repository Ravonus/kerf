import { client, type RoutePayload } from '../router'
import { ask } from './helpers'
import type { Navigation } from './navigation'

const RETRY = 1000,
  RETRIES = 30_000

/** Refresh the mounted route after a mutation, retrying a failed refresh. */
export async function refresh(nav: Navigation, t: string[]) {
  t = [...new Set([...t, ...(nav.refreshing?.tags ?? [])])]
  nav.refreshing?.ctrl.abort()
  const self = (nav.refreshing = { ctrl: new AbortController(), tags: t })
  const url = new URL(location.href),
    since = nav.now()
  try {
    const next: RoutePayload = await ask(url, self.ctrl.signal).then((r) => r.json())
    if (self.ctrl.signal.aborted) return
    if (next.s === 401 || next.s === 403) {
      nav.cache.clear()
      nav.prefetch.cancel(true)
    }
    if (next.r && !self.ctrl.signal.aborted) {
      nav.refreshing = undefined
      return void nav.go(next.r, { replace: true })
    }
    await nav.needs(next)
    if (self.ctrl.signal.aborted) return
    nav.apply(next, url, url.pathname + url.search, since, false)()
    nav.tries = 0
  } catch {
    if (nav.refreshing === self) {
      nav.owed.push(...t)
      clearTimeout(nav.again)
      nav.again = setTimeout(nav.owing, Math.min(RETRIES, RETRY * 2 ** nav.tries++))
    }
  }
  if (nav.refreshing === self) nav.refreshing = undefined
}

/** Refresh the current route when Vite replaces server code. */
export async function reloaded(nav: Navigation, { queries }: { queries: boolean }) {
  const owner = nav.current
  nav.cache.clear()
  nav.prefetch.cancel(true)
  const url = new URL(location.href),
    since = nav.now()
  let version = nav.cache.version
  const res = await ask(url)
  if (version !== nav.cache.version || !res.ok) return
  const next: RoutePayload = await res.clone().json()
  nav.cache.setBuild(nav.routes.build)
  if (version !== nav.cache.version || next.s >= 500) return
  if (next.s === 401 || next.s === 403) {
    nav.cache.clear()
    version = nav.cache.version
  }
  if (queries) client.refreshed?.()
  nav.cache.setBuild(nav.routes.build)
  if (version !== nav.cache.version || nav.current !== owner) return
  if (next.r) return await nav.go(next.r, { replace: true })
  if (nav.current) return await nav.go(url.href, { pop: true })
  await nav.needs(next)
  nav.cache.setBuild(nav.routes.build)
  if (version !== nav.cache.version || nav.current !== owner) return
  nav.apply(next, url, url.pathname + url.search, since, false)()
}
