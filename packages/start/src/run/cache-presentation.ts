import { client } from '../router'
import { guess } from './helpers'
import type { RouteCache } from './cache'
import type { Navigation } from './navigation'

type Cached = NonNullable<ReturnType<RouteCache['peek']>>

/** Own the one provisional history presentation and its expiry timer. */
export class CachePresentation {
  private pending: { ctrl: AbortController; url: URL; timer: ReturnType<typeof setTimeout> } | undefined

  show(nav: Navigation, ctrl: AbortController, url: URL, cached: Cached | undefined) {
    if (!cached || !nav.ready?.(cached.next)) return false
    nav.cache.setBuild(nav.routes.build)
    if (cached.version !== nav.cache.version || ctrl.signal.aborted || nav.current !== ctrl) return false
    nav.apply(cached.next, url, url.pathname + url.search, cached.since, false)()
    nav.cache.setBuild(nav.routes.build)
    if (ctrl.signal.aborted || nav.current !== ctrl) return false
    if (this.pending) clearTimeout(this.pending.timer)
    const timer = setTimeout(() => this.check(nav), Math.max(0, cached.until! - performance.now()))
    this.pending = { ctrl, url, timer }
    this.check(nav)
    return true
  }

  check(nav: Navigation) {
    const pending = this.pending
    if (!pending || nav.current !== pending.ctrl || pending.ctrl.signal.aborted) return
    const cached = nav.cache.peek(pending.url, !!client.seed)
    if (cached) {
      clearTimeout(pending.timer)
      pending.timer = setTimeout(() => this.check(nav),
        Math.max(1, Math.ceil(cached.until! - performance.now())))
      return
    }
    if (!nav.present(guess(nav.routes, pending.url.pathname), pending.url, true)) {
      nav.current = undefined
      pending.ctrl.abort()
      location.replace(pending.url.href)
    }
  }

  stop(ctrl: AbortController) {
    if (this.pending?.ctrl !== ctrl) return
    clearTimeout(this.pending.timer)
    this.pending = undefined
  }
}

/** Wait for one retry, or stop promptly when a newer navigation cancels it. */
export function retryDelay(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, ms)
    if (signal.aborted) finish()
    else signal.addEventListener('abort', finish, { once: true })
  })
}
