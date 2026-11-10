import type { ClientRoutes } from '../run'
import { guess, ours } from './helpers'

/** Admit a link only after the app's own event handlers have run. */
export function admitLink(event: Event, routes: ClientRoutes) {
  if (event.defaultPrevented) return
  if (
    event instanceof MouseEvent &&
    (event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      ((event.type === 'pointerdown' || event.type === 'click') && event.button !== 0))
  )
    return
  if (event.type === 'pointerdown' && 'isPrimary' in event && !event.isPrimary) return
  const path = event.composedPath()
  const anchor = path.find((item) => item instanceof HTMLAnchorElement)
  if (
    !anchor ||
    path.some(
      (item) =>
        item instanceof Element &&
        item.matches('[data-navigation="off"], [contenteditable]:not([contenteditable="false"])'),
    )
  )
    return
  try {
    const url = ours(anchor)
    if (!url || !['http:', 'https:'].includes(url.protocol)) return
    if (!guess(routes, url.pathname).length) return
    return { anchor, url, noop: url.href === location.href }
  } catch {
    return undefined
  }
}

/**
 * Links go on their click. A press (pointerdown) only warms the route: it starts the fetch the click will claim, so the
 * head start is kept, but the page never changes under a pointer that is still down. Swapping it on the press lost the
 * click itself (the button came up on the new page, so the click landed on <html> or never fired), and with it every
 * click handler: a menu that closes when its link is followed, a sheet, an analytics hook. The returned disposer
 * removes only these listeners.
 */
export function routeClicks(
  doc: Document,
  routes: ClientRoutes,
  go: (href: string) => void | Promise<void>,
  warm?: (url: URL) => void,
) {
  const down = (event: PointerEvent) => {
    const target = admitLink(event, routes)
    if (target && !target.noop) warm?.(target.url)
  }
  const click = (event: MouseEvent) => {
    const target = admitLink(event, routes)
    if (!target) return
    event.preventDefault()
    if (!target.noop) void Promise.resolve(go(target.url.href)).catch(() => {})
  }
  doc.addEventListener('pointerdown', down)
  doc.addEventListener('click', click)
  return () => {
    doc.removeEventListener('pointerdown', down)
    doc.removeEventListener('click', click)
  }
}
