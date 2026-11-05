import { drain, wake } from '@weft-js/core/dom'
import type { Held } from '../boot'
import { client, peers } from '../router'
import { ask, guess, ours } from './helpers'
import type { Navigation } from './navigation'

type Hot = { on(event: string, on: (data: { queries: boolean }) => unknown): void }

export function listeners(nav: Navigation, hot: () => Hot | undefined) {
  addEventListener('online', nav.owing)
  addEventListener('focus', nav.owing)
  if (hot()) hot()!.on('weft:refresh', (changed) => void nav.reloaded(changed))
  client.invalidated = nav.invalidated
  clicks(nav)
  preload(nav)
  history(nav)
  peers?.addEventListener('message', (m) => {
    if (!m.data) location.reload()
  })
  const q = (window as Window & { __wq?: Held }).__wq
  if (q) {
    q.w = wake
    if (q.l) wake(q.l)
    drain()
  }
}

// A fade can intercept a click; replay it on the element underneath once the picture is gone.
function clicks(nav: Navigation) {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return
    const url = ours(e.target)
    if (!url) return
    e.preventDefault()
    void nav.go(url.href)
  })
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

// A hovered or focused link can load its chunks and data before it is pressed.
function preload(nav: Navigation) {
  let pending: ReturnType<typeof setTimeout> | undefined
  const intent = (e: Event) => {
    clearTimeout(pending)
    const url = ours(e.target)
    const path = url && url.pathname + url.search
    if (
      !url ||
      nav.warm?.path === path ||
      (e.target as Element).closest('[data-preload="off"]') ||
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    )
      return
    pending = setTimeout(
      () => {
        for (const id of guess(nav.routes, url.pathname)) void nav.chunk(id).catch(() => {})
        nav.warm = { path: path!, at: performance.now(), since: nav.now(), res: ask(url) }
        nav.warm.res.catch(() => {
          nav.warm = undefined
        })
      },
      e.type === 'focusin' ? 0 : 80,
    )
  }
  document.addEventListener('pointerover', intent)
  document.addEventListener('focusin', intent)
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
