import { flush } from '@weft-js/core'
import { setHead } from '@weft-js/core/head'
import {
  applyMatches,
  client,
  level,
  type Level,
  type NavigateOptions,
  type RoutePayload,
} from '../router'
import type { ClientRoutes } from '../run'
import { streamed, type mount } from './boot'
import { matchingRouteAssets } from '../asset-receipt.mjs'
import { ask, changedRouteParams, current_, guess, revive } from './helpers'
import type { PreparedRouteShape } from './shape-preparation'
import { retainSourceContext, type SourceContext } from './source-context'
import { RouteCache, type Read } from './cache'
import { Prefetch } from './prefetch'
import { CachePresentation, retryDelay } from './cache-presentation'

const SLOW_FADE = 100
const RETRY = 1000,
  RETRIES = 30_000

type Options = NavigateOptions & { pop?: boolean; hops?: number }
type Page = ReturnType<typeof mount>

export class Navigation {
  route: Page['route']
  chunk: Page['chunk']
  island: Page['island']
  setBag: Page['setBag']
  ready: Page['ready']
  tags: Page['initialTags']
  current: AbortController | undefined
  refreshing: { ctrl: AbortController; tags: string[] } | undefined
  /** Tags invalidated while a navigation was out: its route may read them, and that's only known when it lands. */
  owed: string[] = []
  again: ReturnType<typeof setTimeout> | undefined
  tries = 0
  prefetch: Prefetch
  cache: RouteCache
  presentation = new CachePresentation()
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
    this.cache = new RouteCache(routes.build)
    this.prefetch = new Prefetch(this.cache, this.now, () => !!client.seed)
    this.ready = page.ready
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

  /** Find the first layout containing a changed parameter, or the leaf for a changed query. */
  changedParams(ids: string[], url: URL) {
    return changedRouteParams(this.routes, this.committedURL, ids, url)
  }

  /** Prepare all changed levels before replacing the current outlet. */
  present(ids: string[], url: URL, force = false) {
    let first = ids.findIndex((id, depth) => this.route.levels[depth]?.id.value !== id)
    if (first < 0) first = force ? ids.length - 1 : this.changedParams(ids, url)
    if (first < 0) {
      const committed = new URL(this.committedURL)
      if (url.pathname === committed.pathname && url.search === committed.search) this.clearShape()
      return false
    }
    if (!this.route.prepareShape) return false
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
    // A same-id layout stays mounted; its existing child outlet owns the presentation.
    let depth = first
    while (depth < ids.length - 1 && this.route.levels[depth]?.id.value === ids[depth]) depth++
    const retained = leases.splice(0, depth - first)
    retained.forEach((lease) => lease.release())
    const outlet = level(this.route, depth)
    const old = this.detachShape()
    outlet.shape.value = leases
    this.shape = { outlet, leases }
    try {
      flush()
    } finally {
      old?.forEach((lease) => lease.release())
    }
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
      try {
        flush()
      } finally {
        leases.forEach((lease) => lease.release())
      }
    }
  }

  /** No navigation is out any more: what it left owed is for the page now showing. */
  settle() {
    // Every way a navigation ends comes through here, so its cached-presentation timer stops here too.
    if (this.current) this.presentation.stop(this.current)
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
    this.cache.clear()
    this.prefetch.stop()
    if (this.current) this.presentation.stop(this.current)
    this.current?.abort()
    this.current = undefined
    this.refreshing?.ctrl.abort()
    this.refreshing = undefined
    clearTimeout(this.again)
    this.owed = []
    this.clearShape()
    this.source?.release()
    this.source = undefined
  }

  go = async (href: string, opts: Options = {}) => {
    const url = new URL(href, location.href)
    if (url.origin !== location.origin) return location.assign(url.href)
    if (!opts.pop && url.href === location.href) return
    const buildVersion = this.cache.version
    this.cache.setBuild(this.routes.build)
    if (buildVersion !== this.cache.version) this.prefetch.cancel(true)
    if (this.current) this.presentation.stop(this.current)
    this.current?.abort()
    if (this.refreshing) {
      this.refreshing.ctrl.abort()
      this.owed.push(...this.refreshing.tags)
      this.refreshing = undefined
    }
    const ctrl = (this.current = new AbortController())
    const path = url.pathname + url.search
    try {
      this.source ??=
        retainSourceContext(document, this.committedURL, this.committedBase) ?? undefined
      if (!this.source) return opts.pop ? location.replace(url.href) : location.assign(url.href)
      if (!opts.pop && url.href !== location.href)
        history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.href)
      this.at = path
      this.route.path.value = path
      current_(url.pathname)
      flush()
      const speculative = this.prefetch.claim(url, ctrl.signal)
      this.prefetch.cancel()
      const cached = opts.pop ? this.cache.peek(url, !!client.seed) : undefined
      const shown = this.presentation.show(this, ctrl, url, cached)
      if (ctrl.signal.aborted || this.current !== ctrl) return
      if (!shown) this.present(guess(this.routes, url.pathname), url)
      await this.travel(url, ctrl, opts, shown, speculative)
    } finally {
      this.presentation.stop(ctrl)
      if (this.current === ctrl) this.settle()
    }
  }

  async travel(
    url: URL,
    ctrl: AbortController,
    opts: Options,
    shown = false,
    speculative?: Promise<Read | undefined>,
  ) {
    const path = url.pathname + url.search
    for (const id of guess(this.routes, url.pathname)) void this.chunk(id).catch(() => {})
    let next: RoutePayload
    let since: number
    let version: number
    let retries = 0
    for (;;) {
      try {
        const shared = speculative ? await speculative : undefined
        speculative = undefined
        const read =
          shared && (!shared.next.c?.length || client.seed)
            ? shared
            : await this.cache.read(
                url,
                ctrl.signal,
                ask,
                this.now,
                () => !!client.seed,
                shown ? () => this.presentation.check(this) : undefined,
              )
        this.cache.setBuild(this.routes.build)
        if (ctrl.signal.aborted) return
        if (read.version !== this.cache.version) continue
        next = read.next
        if (next.s === 401 || next.s === 403) this.prefetch.cancel(true)
        since = read.since
        version = read.version
        if (next.r) {
          const hops = (opts.hops ?? 0) + 1
          return hops > 5 ? location.replace(next.r) : this.go(next.r, { replace: true, hops })
        }
        if (shown && (next.s === 401 || next.s === 403)) {
          if (this.ready?.(next)) {
            this.apply(next, url, path, since, false)()
            return
          }
          this.presentation.check(this)
          if (ctrl.signal.aborted) return
        }
        await this.needs(next)
        this.cache.setBuild(this.routes.build)
        if (ctrl.signal.aborted) return
        if (read.version !== this.cache.version) continue
        if (shown && read.notModified) return
        break
      } catch {
        if (ctrl.signal.aborted) return
        if (!shown) return location.replace(url.href)
        if (!this.cache.peek(url, !!client.seed)) {
          this.current = undefined
          ctrl.abort()
          return location.replace(url.href)
        }
        await retryDelay(ctrl.signal, Math.min(RETRIES, RETRY * 2 ** retries++))
        continue
      }
    }
    let swapped = false
    const swap = () => {
      swapped = true
      this.cache.setBuild(this.routes.build)
      if (ctrl.signal.aborted || this.current !== ctrl || this.cache.version !== version) return
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
      // Aborted before its update ran ("invalid state"): swap without the fade.
      await fade.updateCallbackDone.catch(() => swapped || swap())
    } else swap()
    if (!ctrl.signal.aborted && this.current === ctrl && this.cache.version !== version)
      await this.travel(url, ctrl, opts, shown)
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
      if (self.ctrl.signal.aborted) return
      if (next.s === 401 || next.s === 403) {
        this.cache.clear()
        this.prefetch.cancel(true)
      }
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
    const owner = this.current
    this.cache.clear()
    this.prefetch.cancel(true)
    const url = new URL(location.href),
      since = this.now()
    let version = this.cache.version
    const res = await ask(url)
    if (version !== this.cache.version || !res.ok) return
    const next: RoutePayload = await res.clone().json()
    this.cache.setBuild(this.routes.build)
    if (version !== this.cache.version || next.s >= 500) return
    if (next.s === 401 || next.s === 403) {
      this.cache.clear()
      version = this.cache.version
    }
    if (queries) client.refreshed?.()
    this.cache.setBuild(this.routes.build)
    if (version !== this.cache.version || this.current !== owner) return
    if (next.r) return await this.go(next.r, { replace: true })
    if (this.current) return await this.go(url.href, { pop: true })
    await this.needs(next)
    this.cache.setBuild(this.routes.build)
    if (version !== this.cache.version || this.current !== owner) return
    this.apply(next, url, url.pathname + url.search, since, false)()
  }

  invalidated = (t: string[]) => {
    this.cache.invalidate(t)
    this.presentation.check(this)
    this.prefetch.cancel(true)
    if (this.current) this.owed.push(...t)
    else if (this.reads(t)) void this.refresh(t)
  }
}
