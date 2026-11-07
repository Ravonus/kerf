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

/** Pointer admission and its click fallback; the returned disposer removes only these listeners. */
export function routeClicks(
  doc: Document,
  routes: ClientRoutes,
  go: (href: string) => void | Promise<void>,
) {
  let accepted: { id: number; anchor: HTMLAnchorElement } | undefined
  const down = (event: PointerEvent) => {
    accepted = undefined
    const target = admitLink(event, routes)
    if (!target) return
    accepted = { id: event.pointerId, anchor: target.anchor }
    if (!target.noop) void Promise.resolve(go(target.url.href)).catch(() => {})
  }
  const cancel = (event: PointerEvent) => {
    if (accepted?.id === event.pointerId) accepted = undefined
  }
  const click = (event: MouseEvent) => {
    const record = accepted
    accepted = undefined
    const pointer = event as PointerEvent
    if (
      record &&
      event.detail > 0 &&
      (pointer.pointerId === record.id || event.composedPath().includes(record.anchor))
    ) {
      event.preventDefault()
      return
    }
    const target = admitLink(event, routes)
    if (!target) return
    event.preventDefault()
    if (!target.noop) void go(target.url.href)
  }
  doc.addEventListener('pointerdown', down)
  doc.addEventListener('pointercancel', cancel)
  doc.addEventListener('click', click)
  return () => {
    doc.removeEventListener('pointerdown', down)
    doc.removeEventListener('pointercancel', cancel)
    doc.removeEventListener('click', click)
  }
}
