// The app shell's behaviour (02 §6): what isn't markup or CSS. The binding renders the one element tree.
import { pushLayer } from './layers'
import { announce } from './toast'

/** Options for the app shell. */
export interface ShellOptions {
  /** The overlay sidebar is open (tablet rail expand, or the hidden mode's edge tab). */
  navOpen: boolean
  /** The route: a change draws the route line, replays the page's enter and announces the new h1. */
  current?: string
  onToggle(): void
  onCloseNav(): void
  /** The shell's own width crossed 1000px (a container step, never the window). */
  onWide(wide: boolean): void
  onCommand?(): void
}

const ROUTE_MS = 1200

/** The app shell's sidebar, keyboard and viewport behaviour. */
export function shell(root: HTMLElement, opts: ShellOptions) {
  let o = opts
  let remove: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let wide: boolean | undefined
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const nav = () => root.querySelector<HTMLElement>('[data-part="nav"]')

  const onKey = (e: KeyboardEvent) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && o.onCommand) { e.preventDefault(); return o.onCommand() }
    if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || !nav()) return
    if ((e.target as Element).closest?.('input, textarea, select, [contenteditable]')) return
    o.onToggle()
  }
  doc.addEventListener('keydown', onKey)

  const measure = () => {
    const now = root.clientWidth >= 1000
    if (now !== wide) o.onWide((wide = now))
  }
  const sizes = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(measure) : undefined
  sizes?.observe(root) // reports before first paint, without forcing a layout of its own
  if (!sizes) measure()

  // the browser shrank only the visual viewport (Safari ignores interactive-widget): the keyboard is up
  const vv = win.visualViewport
  const onViewport = () => {
    const covered = Math.round(win.innerHeight - vv!.height - vv!.offsetTop)
    root.toggleAttribute('data-keyboard', covered > 80)
    if (covered > 80) root.style.setProperty('--warp-keyboard', `${covered}px`)
    else root.style.removeProperty('--warp-keyboard')
  }
  vv?.addEventListener('resize', onViewport)

  const layer = () => {
    const el = nav()
    if (o.navOpen && !remove && el) {
      remove = pushLayer({
        el,
        close: reason => {
          if (reason === 'escape') root.querySelector<HTMLElement>('[data-collapsed="hidden"] [data-part="edge-tab"], [data-part="nav-toggle"]')?.focus()
          o.onCloseNav()
        },
      })
    } else if (!o.navOpen) { remove?.(); remove = undefined }
  }
  layer()

  const routed = () => {
    root.removeAttribute('data-routing')
    const page = root.querySelector<HTMLElement>('[data-part="page"]')
    page?.removeAttribute('data-enter')
    void root.offsetWidth // restart both animations
    root.setAttribute('data-routing', '')
    page?.setAttribute('data-enter', '')
    clearTimeout(timer)
    timer = setTimeout(() => root.removeAttribute('data-routing'), ROUTE_MS)
    win.queueMicrotask(() => {
      const h1 = root.querySelector('h1')?.textContent?.trim()
      if (h1) announce(doc, h1)
    })
  }

  return {
    update(next: ShellOptions) {
      const moved = next.current !== o.current
      o = next
      layer()
      if (moved) routed()
    },
    destroy() {
      doc.removeEventListener('keydown', onKey)
      sizes?.disconnect()
      vv?.removeEventListener('resize', onViewport)
      remove?.()
      clearTimeout(timer)
    },
  }
}
