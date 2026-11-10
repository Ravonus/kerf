import { drain, wake } from '@weft-js/core/dom'
import type { Held } from '../boot'
import { client, peers } from '../router'
import { admitLink, routeClicks } from './admission'
import type { Navigation } from './navigation'

type Hot = { on(event: string, on: (data: { queries: boolean }) => unknown): void }

export function listeners(nav: Navigation, hot: () => Hot | undefined) {
  addEventListener('online', nav.owing)
  addEventListener('focus', nav.owing)
  addEventListener('pagehide', nav.dispose)
  // A page restored from the back/forward cache was disposed on the way out: let it prefetch again.
  addEventListener('pageshow', (e) => e.persisted && nav.prefetch.resume())
  // A cross-document transition's pagereveal and pageswap are settled from the head (page-stream.tsx `REVEAL`): the page
  // reveals before this runs. One still going when it does is settled here too.
  settle((document as Document & { activeViewTransition?: ViewTransition }).activeViewTransition)
  if (hot()) hot()!.on('weft:refresh', (changed) => void nav.reloaded(changed))
  client.invalidated = nav.invalidated
  client.sessionChanged = nav.dispose
  clicks(nav)
  preload(nav)
  history(nav)
  peers?.addEventListener('message', (m) => {
    if (!m.data) {
      nav.dispose()
      location.reload()
    }
  })
  const q = (window as Window & { __wq?: Held }).__wq
  if (q) {
    q.w = wake
    q.s = 1
    if (q.l) wake(q.l)
    drain()
  }
}

// A fade can intercept a click; replay it on the element underneath once the picture is gone.
function clicks(nav: Navigation) {
  const network = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection
  routeClicks(
    document,
    nav.routes,
    (href) => nav.go(href),
    (url) => {
      if (!document.hidden) nav.prefetch.start(url, 'press', network, navigator.onLine)
    },
  )
  let ended: Promise<unknown> | undefined
  document.addEventListener(
    'pointerdown',
    () => {
      ended = nav.fading?.finished.catch(() => {})
      nav.fading?.skipTransition()
      nav.fading = undefined
    },
    true,
  )
  document.addEventListener(
    'click',
    (e) => {
      const gone = ended
      ended = undefined
      if (!gone || e.target !== document.documentElement) return
      void gone.then(() => {
        const under = document.elementFromPoint(e.clientX, e.clientY)
        if (under !== document.documentElement) under?.dispatchEvent(new MouseEvent('click', e))
      })
    },
    true,
  )
}

// Only known-cost intent can start a bounded data request; no page module runs here.
export function preload(nav: Navigation) {
  let pending: ReturnType<typeof setTimeout> | undefined
  const network = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean
        effectiveType?: string
        addEventListener?: (type: string, fn: () => void) => void
        removeEventListener?: (type: string, fn: () => void) => void
      }
    }
  ).connection
  const cancel = () => {
    clearTimeout(pending)
    nav.prefetch.cancel()
  }
  const intent = (e: Event) => {
    clearTimeout(pending)
    const target = e.target as Element | null
    const admitted = admitLink(e, nav.routes)
    if (
      !admitted ||
      admitted.noop ||
      !target ||
      target.closest('[data-preload="off"]') ||
      target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')
    )
      return
    pending = setTimeout(
      () => {
        if (document.hidden) return
        const version = nav.cache.version
        nav.cache.setBuild(nav.routes.build)
        if (version !== nav.cache.version) nav.prefetch.cancel(true)
        nav.prefetch.start(
          admitted.url,
          e.type === 'focusin' ? 'focus' : 'hover',
          network,
          navigator.onLine,
        )
      },
      e.type === 'focusin' ? 0 : 80,
    )
  }
  document.addEventListener('pointerover', intent)
  document.addEventListener('focusin', intent)
  document.addEventListener('pointerout', cancel)
  document.addEventListener('focusout', cancel)
  const visibility = () => {
    if (document.hidden) cancel()
  }
  document.addEventListener('visibilitychange', visibility)
  addEventListener('offline', cancel)
  addEventListener('pagehide', cancel)
  network?.addEventListener?.('change', cancel)
  return () => {
    cancel()
    document.removeEventListener('pointerover', intent)
    document.removeEventListener('focusin', intent)
    document.removeEventListener('pointerout', cancel)
    document.removeEventListener('focusout', cancel)
    document.removeEventListener('visibilitychange', visibility)
    removeEventListener('offline', cancel)
    removeEventListener('pagehide', cancel)
    network?.removeEventListener?.('change', cancel)
  }
}

// An in-page anchor fires popstate too; only a changed path needs a navigation.
function history(nav: Navigation) {
  nav.at = location.pathname + location.search
  addEventListener('popstate', () => {
    if (location.pathname + location.search !== nav.at)
      return void nav.go(location.href, { pop: true })
    if (nav.current) {
      nav.current.abort()
      nav.settle()
    }
  })
}

/** Mark a transition's outcome as seen: a skipped one rejects all three of its promises. */
function settle(t: ViewTransition | null | undefined) {
  if (!t) return
  const seen = () => {}
  t.ready.catch(seen)
  t.finished.catch(seen)
  t.updateCallbackDone.catch(seen)
}
