import { flush } from '@weft-js/core'
import { setHead } from '@weft-js/core/head'
import { applyMatches, client, level, type Level, type NavigateOptions, type RoutePayload } from '../router'
import type { ClientRoutes } from '../run'
import { streamed, type mount } from './boot'
import { matchingRouteAssets } from '../asset-receipt.mjs'
import { ask, current_, guess, revive } from './helpers'
import type { PreparedRouteShape } from './shape-preparation'
import { retainSourceContext, type SourceContext } from './source-context'

const SLOW_FADE = 100
const RETRY = 1000,
  RETRIES = 30_000

type Options = NavigateOptions & { pop?: boolean; hops?: number }
type Page = ReturnType<typeof mount>
type Warm = { path: string; at: number; since: number; res: Promise<Response> }

export class Navigation {
  route: Page['route']
  chunk: Page['chunk']
  island: Page['island']
  setBag: Page['setBag']
  tags: Page['initialTags']
  current: AbortController | undefined
  refreshing: { ctrl: AbortController; tags: string[] } | undefined
  /** Tags invalidated while a navigation was out: its route may read them, and that's only known when it lands. */
  owed: string[] = []
  again: ReturnType<typeof setTimeout> | undefined
  tries = 0
  warm: Warm | undefined
  // A fade pictures the whole page twice, and the picture holds up every frame. Where that's slow, the page just changes.
  fades = !(navigator.hardwareConcurrency <= 4)
  fading: ViewTransition | undefined
  painted = false
  at!: string
  shape: { outlet: Level; leases: PreparedRouteShape[] } | undefined
  source: SourceContext | undefined
  committedURL = location.href
  committedBase = document.baseURI

  constructor(
    readonly routes: ClientRoutes,
    page: Page,
  ) {
    this.route = page.route
    this.chunk = page.chunk
    this.island = page.island
    this.setBag = page.setBag
    this.tags = page.initialTags
    // Two frames in, the page has painted; a transition before then has no old picture to hold.
    requestAnimationFrame(() => requestAnimationFrame(() => (this.painted = true)))
  }

  now = () => client.now?.() ?? 0
  needs = (next: RoutePayload) =>
    Promise.all([...next.m.map((m) => this.chunk(m.id)), ...(next.i ?? []).map(this.island)])
  reads = (t: string[]) => this.tags.some((l) => l.some((x) => t.includes(x)))

  /** The page moved on: drop old chunks and build held Boundaries from this data. */
  release() {
    const h = streamed.$wh || {}
    for (const k of Object.keys(h)) {
      const build = h[k]!
      h[k] = () => {}
      build()
    }
  }

  apply(next: RoutePayload, url: URL, path: string, since: number, scroll: boolean) {
    const owner = this.current
    const current = () => this.current === owner && !owner?.signal.aborted
    return () => {
      if (!current()) return
      this.at = path
      if (next.c) client.seed ? client.seed(next.c, since) : (client.seeds ??= []).push(...next.c)
      if (!current()) return
      this.tags = next.m.map((m) => m.t ?? [])
      this.route.assetBytes = matchingRouteAssets(next.a, this.routes.build)
      this.setBag(next.b)
      if (!current()) return
      const source = this.source
      this.source = undefined
      source?.stop()
      const old = this.detachShape()
      const previousURL = this.committedURL
      const previousBase = this.committedBase
      this.committedURL = url.href
      this.committedBase = document.baseURI
      try {
        applyMatches(this.route, next.m.map(revive), path, next.s)
        if (!current()) return
        if (next.m.some((m) => m.s)) current_(url.pathname)
        if (!current()) return
        if (next.h) setHead(next.h, url.pathname)
        if (!current()) return
        this.release()
        if (!current()) return
        flush()
      } catch (error) {
        if (current()) {
          this.committedURL = previousURL
          this.committedBase = previousBase
        }
        throw error
      } finally {
        old?.forEach((lease) => lease.release())
        source?.release()
      }
      if (!current()) return
      if (scroll) {
        const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)))
        target ? target.scrollIntoView() : window.scrollTo(0, 0)
      }
    }
  }

  /** Prepare all changed levels before replacing the current outlet. */
  present(ids: string[]) {
    const first = ids.findIndex((id, depth) => this.route.levels[depth]?.id.value !== id)
    if (first < 0 || !this.route.prepareShape) return false
    const leases: PreparedRouteShape[] = []
    try {
      for (const id of ids.slice(first)) {
        const lease = this.route.prepareShape(id)
        if (!lease) {
          leases.forEach((item) => item.release())
          return false
        }
        leases.push(lease)
      }
    } catch {
      leases.forEach((item) => item.release())
      return false
    }
    const outlet = level(this.route, first)
    const old = this.detachShape()
    outlet.shape.value = leases
    this.shape = { outlet, leases }
    try { flush() } finally { old?.forEach((lease) => lease.release()) }
    return true
  }

  detachShape() {
    const shape = this.shape
    if (!shape) return
    this.shape = undefined
    shape.outlet.shape.value = undefined
    return shape.leases
  }

  clearShape() {
    const leases = this.detachShape()
    if (leases) {
      try { flush() } finally { leases.forEach((lease) => lease.release()) }
    }
  }

  /** No navigation is out any more: what it left owed is for the page now showing. */
  settle() {
    this.clearShape()
    if (this.source && this.current?.signal.aborted) {
      history.replaceState(history.state, '', this.committedURL)
      const url = new URL(this.committedURL)
      this.at = url.pathname + url.search
      this.route.path.value = this.at
      current_(url.pathname)
      flush()
    }
    this.source?.release()
    this.source = undefined
    this.current = undefined
    const t = this.owed
    this.owed = []
    if (this.reads(t)) void this.refresh(t)
  }

  dispose = () => {
    this.current?.abort()
    this.current = undefined
    this.clearShape()
    this.source?.release()
    this.source = undefined
  }

  go = async (href: string, opts: Options = {}) => {
    const url = new URL(href, location.href)
    if (url.origin !== location.origin) return location.assign(url.href)
    if (!opts.pop && url.href === location.href) return
    this.current?.abort()
    if (this.refreshing) {
      this.refreshing.ctrl.abort()
      this.owed.push(...this.refreshing.tags)
      this.refreshing = undefined
    }
    const ctrl = (this.current = new AbortController())
    const path = url.pathname + url.search
    try {
      this.source ??= retainSourceContext(document, this.committedURL, this.committedBase) ??
        undefined
      if (!this.source) return opts.pop ? location.replace(url.href) : location.assign(url.href)
      if (!opts.pop && url.href !== location.href)
        history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.href)
      this.at = path
      this.route.path.value = path
      current_(url.pathname)
      flush()
      this.present(guess(this.routes, url.pathname))
      await this.travel(url, ctrl, opts)
    } finally {
      if (this.current === ctrl) this.settle()
    }
  }

  async travel(url: URL, ctrl: AbortController, opts: Options) {
    const path = url.pathname + url.search
    for (const id of guess(this.routes, url.pathname)) void this.chunk(id).catch(() => {})
    let next: RoutePayload
    let since = this.now()
    try {
      const held =
        this.warm?.path === path && performance.now() - this.warm.at < 10_000
          ? this.warm
          : undefined
      this.warm = undefined
      if (held) since = held.since
      next = await (held?.res ?? ask(url, ctrl.signal)).then((r) => r.clone().json())
    } catch (e) {
      if (ctrl.signal.aborted) return
      return location.replace(url.href)
    }
    if (ctrl.signal.aborted) return
    if (next.r) {
      const hops = (opts.hops ?? 0) + 1
      return hops > 5
        ? location.replace(next.r)
        : this.go(next.r, { replace: true, hops })
    }
    try {
      await this.needs(next)
    } catch {
      if (!ctrl.signal.aborted) location.replace(url.href)
      return
    }
    if (ctrl.signal.aborted) return
    const swap = () => {
      if (ctrl.signal.aborted || this.current !== ctrl) return
      this.apply(next, url, path, since, opts.scroll !== false && !opts.pop)()
    }
    if (
      this.fades &&
      this.painted &&
      document.startViewTransition &&
      !document.hidden &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const started = performance.now()
      const fade = (this.fading = document.startViewTransition(swap))
      void fade.ready
        .then(() => {
          if (performance.now() - started > SLOW_FADE) this.fades = false
          return fade.finished
        })
        .catch(() => {})
        .then(() => {
          if (this.fading === fade) this.fading = undefined
        })
      // A transition the browser aborts rejects `finished`: the page already swapped.
      void fade.finished.catch(() => {})
      await fade.updateCallbackDone
    } else swap()
  }

  /** Fetch the page's data again in place, retrying a failed refresh. */
  async refresh(t: string[]) {
    t = [...new Set([...t, ...(this.refreshing?.tags ?? [])])]
    this.refreshing?.ctrl.abort()
    const self = (this.refreshing = { ctrl: new AbortController(), tags: t })
    const url = new URL(location.href),
      since = this.now()
    try {
      const next: RoutePayload = await ask(url, self.ctrl.signal).then((r) => r.json())
      if (next.r && !self.ctrl.signal.aborted) {
        this.refreshing = undefined
        return void this.go(next.r, { replace: true })
      }
      await this.needs(next)
      if (self.ctrl.signal.aborted) return
      this.apply(next, url, url.pathname + url.search, since, false)()
      this.tries = 0
    } catch {
      if (this.refreshing === self) {
        this.owed.push(...t)
        clearTimeout(this.again)
        this.again = setTimeout(this.owing, Math.min(RETRIES, RETRY * 2 ** this.tries++))
      }
    }
    if (this.refreshing === self) this.refreshing = undefined
  }

  owing = () => {
    if (!this.current && !this.refreshing) this.settle()
  }

  reloaded = async ({ queries }: { queries: boolean }) => {
    const url = new URL(location.href),
      since = this.now()
    const res = await ask(url)
    if (!res.ok || (await res.clone().json()).s >= 500) return
    if (queries) client.refreshed?.()
    this.warm = {
      path: url.pathname + url.search,
      at: performance.now(),
      since,
      res: Promise.resolve(res),
    }
    await this.go(url.href, { pop: true })
  }

  invalidated = (t: string[]) => {
    this.warm = undefined
    if (this.current) this.owed.push(...t)
    else if (this.reads(t)) void this.refresh(t)
  }
}
