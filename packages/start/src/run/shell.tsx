// Mount a shell route from release code and independently admitted loader values.
import { flush } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'
import { setHead } from '@kerf-js/core/head'
import { mergeMeta } from '@kerf-js/core/ssr'
import { ErrorPage, NotFoundPage } from '../builtin'
import { client, createRouteState, applyMatches, type Match, type NavigateOptions } from '../router'
import { ERROR_ROUTE, FALLBACK_ROUTE, errorData, errorReference, isErrorRoute } from '../failure'
import type { ClientRouteModule, ClientRoutes } from '../run'
import { matchShell, type ShellConfig } from '../shell/routes'
import { admitLink, routeClicks } from './admission'
import { crossfade } from './helpers'
import { recover } from './outlet'
import { App } from '../view'
import { readShell } from './shell-data'
import { captureSharedElements } from './shared-elements'

type Routes = ClientRoutes & { shell: ShellConfig }
type Options = NavigateOptions & { pop?: boolean; arrive?: boolean }
type Commit = { status: number; matches: Match[]; head: Awaited<ReturnType<typeof routeHead>> }
const pathOf = (url: URL) => url.pathname + url.search

const builtin: Record<string, ClientRouteModule> = {
  '404': { default: NotFoundPage },
  [ERROR_ROUTE]: { default: ErrorPage },
  [FALLBACK_ROUTE]: { default: ErrorPage },
}

class ShellNavigation {
  private at = pathOf(new URL(location.href))
  readonly route = createRouteState({ m: [], p: this.at, s: 200 }, { [FALLBACK_ROUTE]: ErrorPage })
  private readonly outlet = recover(this.route)
  private readonly modules = new Map<string, Promise<ClientRouteModule>>()
  private readonly failed = new Set<string>()
  private current: AbortController | undefined
  private committed: AbortController | undefined
  private matches: Match[] = []
  private readonly transition: Parameters<typeof crossfade>[0] = {
    fades: !(navigator.hardwareConcurrency <= 4),
    painted: false,
    fading: undefined,
  }

  constructor(private readonly routes: Routes) {}

  mount(container: Element) {
    client.route = this.route
    client.navigate = this.go
    let retry: Promise<void> | undefined
    this.outlet.recovery.retry = () => {
      if (retry) return retry
      this.outlet.pending.value = true
      retry = this.go(location.href, { reload: true, scroll: false, shared: false }).finally(() => {
        this.outlet.pending.value = false
        retry = undefined
      })
      return retry
    }
    this.outlet.recovery.fail = (depth) => this.outletFailed(depth)
    container.replaceChildren()
    const route = this.route
    render(() => <App route={route} />, container)
    routeClicks(document, this.routes, this.go, this.warm)
    document.addEventListener('focusin', (event) => {
      const target = admitLink(event, this.routes)
      if (target && !target.noop && !target.anchor.closest('[data-preload="off"]'))
        this.warm(target.url)
    })
    addEventListener('popstate', () => {
      const url = new URL(location.href)
      if (pathOf(url) !== this.at || !this.committed) void this.go(url.href, { pop: true })
      else if (this.current !== this.committed) this.current?.abort()
    })
    addEventListener('pagehide', () => {
      this.current?.abort()
      this.committed?.abort()
    })
    void this.go(location.href, { arrive: true, scroll: false })
    return this.route
  }

  private local(url: URL) {
    return matchShell(this.routes.table, this.routes.shell.root, url.pathname)
  }

  private warm = (url: URL) => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (document.hidden || connection?.saveData) return
    for (const id of this.local(url).ids) void this.chunk(id).catch(() => {})
  }

  private chunk(id: string, retry = false) {
    const load = this.routes.load[id]
    if (!load) {
      const module = builtin[id] ?? {}
      if (module.default) this.route.comps[id] = module.default
      return Promise.resolve(module)
    }
    const fresh = retry && this.failed.delete(id)
    if (fresh) this.modules.delete(id)
    let promise = this.modules.get(id)
    if (!promise) {
      promise = Promise.resolve()
        .then(fresh ? (this.routes.retryLoad?.[id] ?? load) : load)
        .then(
          (module) => {
            if (module.default) this.route.comps[id] = module.default
            return module
          },
          (error: unknown) => {
            this.failed.add(id)
            throw error
          },
        )
      this.modules.set(id, promise)
    }
    return promise
  }

  private async show(
    url: URL,
    next: Commit,
    { ctrl, ...opts }: Options & { ctrl: AbortController },
  ) {
    if (this.current !== ctrl || ctrl.signal.aborted) return
    const shared = captureSharedElements(opts.shared)
    let swapped = false
    const swap = () => {
      swapped = true
      if (this.current !== ctrl || ctrl.signal.aborted) return
      if (this.committed && this.committed !== ctrl) this.committed.abort()
      this.committed = ctrl
      if (!opts.pop && url.href !== location.href)
        history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.href)
      this.at = pathOf(url)
      this.matches = next.matches
      applyMatches(this.route, next.matches, this.at, next.status, true)
      applyHead(next.head, url.pathname)
      document.getElementById('kerf-shell-pending')?.remove()
      flush()
      this.transition.painted = true
      if (opts.scroll !== false && !opts.pop && !opts.arrive) scrollToRoute(url)
      shared?.arrive()
    }
    try {
      if (opts.reload || shared?.active) swap()
      else await crossfade(this.transition, swap, () => swapped)
    } finally {
      shared?.finish()
    }
  }

  private async failure(
    prefix: Match[] = [],
    reference = errorReference(),
    builtinOnly = false,
  ): Promise<Commit> {
    let id = builtinOnly ? FALLBACK_ROUTE : ERROR_ROUTE
    let module: ClientRouteModule | undefined
    try {
      module = await this.chunk(id)
    } catch {
      id = FALLBACK_ROUTE
    }
    const data = errorData(undefined, 500, reference)
    const fallback = { title: 'Error' }
    let meta: Awaited<ReturnType<typeof metaOf>> = fallback
    try {
      meta = (await metaOf(module, data, {})) ?? fallback
    } catch {
      id = FALLBACK_ROUTE
    }
    return {
      status: 500,
      matches: [...prefix, { id, params: {}, data }],
      head: mergeMeta(this.routes.shell.site, meta),
    }
  }

  private outletFailed(depth: number) {
    const ctrl = this.committed
    const id = this.matches[depth]?.id
    if (!ctrl || ctrl !== this.current || !id || id === FALLBACK_ROUTE) return
    const path = new URL(location.href)
    void this.failure(this.matches.slice(0, depth), undefined, isErrorRoute(id)).then((next) =>
      this.show(path, next, { ctrl, replace: true, scroll: false, shared: false }),
    )
  }

  private async read(url: URL, ctrl: AbortController, retry?: boolean) {
    const local = this.local(url)
    const modules = new Map(local.ids.map((id) => [id, this.chunk(id, retry)]))
    for (const promise of modules.values()) void promise.catch(() => {})
    const admitted = await readShell({
      url,
      routes: this.routes,
      local,
      signal: ctrl.signal,
      schemas: async (id) => (await modules.get(id))?.routeData,
    })
    if (admitted.kind === 'redirect') return admitted
    const { matches, kind, reference, immediate } = admitted
    const status = kind === 'page' ? 200 : kind === 'not-found' ? 404 : 500
    const lineage = await Promise.all(matches.map(async ({ id }) => modules.get(id)))
    try {
      if (kind !== 'page') {
        const id = kind === 'error' ? ERROR_ROUTE : '404'
        const mod = await this.chunk(id, retry)
        const data =
          kind === 'error' ? errorData(undefined, status, reference!) : { path: pathOf(url) }
        matches.push({ id, params: {}, data })
        lineage.push(mod)
        immediate.push(data)
      }
      const head = await routeHead(this.routes.shell.site, { lineage, matches, immediate, status })
      return { status, head, matches }
    } catch {
      return this.failure(matches.filter(({ id }) => id !== ERROR_ROUTE && id !== '404'))
    }
  }

  go = async (href: string, opts: Options = {}) => {
    const asked = new URL(href, location.href)
    if (asked.origin !== location.origin) {
      if (asked.protocol === 'https:' || asked.protocol === 'http:') location.assign(asked.href)
      return
    }
    if (!opts.reload && !opts.arrive && !opts.pop && asked.href === location.href) return
    this.transition.fading?.skipTransition()
    if (this.current !== this.committed) this.current?.abort()
    const ctrl = (this.current = new AbortController())
    let url = asked
    try {
      for (let hops = 0; hops <= 5; hops++) {
        const result = await this.read(url, ctrl, opts.reload)
        if (ctrl.signal.aborted || this.current !== ctrl) return
        if ('status' in result) return await this.show(url, result, { ...opts, ctrl })
        url = new URL(result.path, location.origin)
        opts = { ...opts, replace: opts.pop || opts.arrive || opts.replace, pop: false }
      }
    } catch {
      if (ctrl.signal.aborted || this.current !== ctrl) return
    }
    await this.show(asked, await this.failure(), { ...opts, ctrl })
  }
}

export function startShell(
  routes: Routes,
  { container = document.getElementById('app')! }: { container?: Element },
) {
  return new ShellNavigation(routes).mount(container)
}

function scrollToRoute(url: URL) {
  let hash = url.hash.slice(1)
  try {
    hash = decodeURIComponent(hash)
  } catch {
    /* Malformed fragments have no encoded target. */
  }
  const target = hash && document.getElementById(hash)
  if (target) target.scrollIntoView({ behavior: 'instant' })
  else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
}

async function metaOf(mod: ClientRouteModule | undefined, data: unknown, params: Match['params']) {
  return typeof mod?.meta === 'function' ? mod.meta({ data, params }) : mod?.meta
}

async function routeHead(
  site: ShellConfig['site'],
  {
    lineage,
    matches,
    immediate,
    status,
  }: {
    lineage: (ClientRouteModule | undefined)[]
    matches: Match[]
    immediate: unknown[]
    status: number
  },
) {
  const metas = await Promise.all(
    lineage.map((mod, i) => metaOf(mod, immediate[i], matches[i]!.params)),
  )
  const special =
    status === 500 ? { title: 'Error' } : status === 404 ? { title: 'Not found' } : undefined
  return mergeMeta(site, special, ...metas)
}

function applyHead(head: Commit['head'], pathname: string) {
  setHead(head, pathname)
  if (!head.jsonLd) return
  const data = document.createElement('script')
  data.type = 'application/ld+json'
  data.setAttribute('data-wm', '')
  data.textContent = JSON.stringify(head.jsonLd)
  document.head.append(data)
}
