import { onCleanup, onMount } from '@kerf-js/core'
import { Icon, type IconRef } from './Icon'
import './styles'
import '@kerf-js/veneer-core/styles/layout/tokens.css'
import '@kerf-js/veneer-core/styles/layout/tab-bar.css'

/** One destination in a TabBar. */
export interface TabBarItem {
  href: string
  label: string
  icon: IconRef
  /** The main action (a bag, a new post): raised in the accent. One at most. */
  primary?: boolean | undefined
  /** A badge count; 0 or undefined shows none. */
  count?: number | undefined
  /** Which paths mark it current. Default: the href itself, and anything under it (exact for "/"). */
  match?: ((path: string) => boolean) | undefined
}

/** Tucks the bar away while the page scrolls down and brings it back on any scroll up, once per frame. */
function tucker(bar: HTMLElement, allowed: () => boolean) {
  let last = scrollY
  let frame = 0
  return () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const y = scrollY
      const dy = y - last
      if (Math.abs(dy) < 6) return
      // tuck only past the first screen's top and away from the bottom edge, where it must stay reachable
      const end = document.documentElement.scrollHeight - innerHeight - 24
      bar.toggleAttribute('data-tucked', allowed() && dy > 0 && y > 80 && y < end)
      last = y
    })
  }
}

/**
 * A site's bottom navigation on a phone (under 760px; wider, nothing is drawn): four or five destinations under the thumb.
 * It slips away while the page scrolls down and comes back on any scroll up, steps aside while the keyboard is up, and
 * pads the page's end by its own height while it shows. `current` names the current path; by default it reads
 * location.pathname and follows client navigation.
 */
export function TabBar(props: {
  items: TabBarItem[]
  label?: string
  current?: () => string
  hideOnScroll?: boolean
}) {
  let bar!: HTMLElement
  const on = (it: TabBarItem, path: string) =>
    it.match
      ? it.match(path)
      : it.href === '/'
        ? path === '/'
        : path === it.href || path.startsWith(`${it.href}/`)
  onMount(() => {
    const path = () => props.current?.() ?? location.pathname
    const mark = () => {
      const p = path()
      bar.querySelectorAll<HTMLAnchorElement>('[data-part="item"]').forEach((a, i) => {
        const it = props.items[i]
        if (it && on(it, p)) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
      })
      bar.removeAttribute('data-tucked')
    }
    const scroll = tucker(bar, () => props.hideOnScroll !== false)
    const vv = window.visualViewport
    const keyboard = () => {
      if (!vv) return
      bar.toggleAttribute('data-off', innerHeight - vv.height > 150)
    }
    mark()
    addEventListener('scroll', scroll, { passive: true })
    addEventListener('popstate', mark)
    // client navigation: the Navigation API hears every route change; a click on our own links marks at once
    const clicked = () => queueMicrotask(mark)
    bar.addEventListener('click', clicked)
    const nav = (window as { navigation?: EventTarget }).navigation
    nav?.addEventListener('navigatesuccess', mark)
    vv?.addEventListener('resize', keyboard)
    onCleanup(() => {
      removeEventListener('scroll', scroll)
      removeEventListener('popstate', mark)
      bar.removeEventListener('click', clicked)
      nav?.removeEventListener('navigatesuccess', mark)
      vv?.removeEventListener('resize', keyboard)
    })
  })
  return (
    <nav data-scope="tab-bar" aria-label={props.label ?? 'Main'} ref={(n) => (bar = n)}>
      <ul>
        {props.items.map((it) => (
          <li key={it.href}>
            <a href={it.href} data-part="item" data-primary={it.primary ? '' : undefined}>
              <span data-part="icon">
                <Icon name={it.icon} />
                {!!it.count && (
                  <span data-part="count" aria-hidden="true">
                    {it.count > 99 ? '99+' : it.count}
                  </span>
                )}
              </span>
              <span data-part="label">{it.label}</span>
              {!!it.count && <span data-part="count-label">, {it.count} items</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
