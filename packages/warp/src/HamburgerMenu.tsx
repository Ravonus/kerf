import { dialog, uid } from '@weft-js/warp-core'
import { derived, state, type State, untrack } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/button.css'
import '@weft-js/warp-core/styles/components/hamburger.css'

/** A top link in a HamburgerMenu. */
export interface HamburgerLink {
  href: string
  label: string
}

/** Props for HamburgerMenu. */
export interface HamburgerMenuProps {
  /** Names the button and the menu. */
  label?: string
  /** Pass a box to open or close it from outside. */
  open?: State<boolean>
  /** The site's main links, shown large. */
  links?: HamburgerLink[]
  /** The current page's href: its link is marked. */
  current?: string
  /** Shown at the top left of the open menu, usually the site's brand. */
  brand?: unknown
  /** More navigation under the links: sections, a filter, a footer. */
  children?: unknown
}

const Bars = () => (
  <span data-part="bars" aria-hidden="true">
    <i></i>
    <i></i>
    <i></i>
  </span>
)

/**
 * A site's main navigation on small screens: a button whose bars become an X, opening a full-screen menu over the
 * page. The page behind stops scrolling, and pressing a link closes the menu while the route changes underneath.
 * For a section's own pages beside the content, use SideNav.
 */
export function HamburgerMenu(props: HamburgerMenuProps) {
  const id = uid('menu')
  const open = untrack(() => props.open) ?? state(false)
  let el: HTMLDialogElement | undefined
  use(
    dialog,
    () => el,
    () => ({ open: open.value, onClose: () => (open.value = false) }),
  )
  const show = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    el?.style.setProperty('--_x', `${Math.round(r.left + r.width / 2)}px`)
    el?.style.setProperty('--_y', `${Math.round(r.top + r.height / 2)}px`)
    open.value = true
  }
  const follow = (e: MouseEvent) => {
    if ((e.target as Element).closest?.('a[href]')) open.value = false
  }
  const label = derived(() => props.label ?? 'Menu')
  return (
    <>
      <button
        type="button"
        data-scope="button"
        data-emphasis="ghost"
        data-tone="neutral"
        data-icon-only=""
        data-hamburger=""
        aria-label={label.value}
        aria-controls={id}
        aria-expanded={open.value ? 'true' : 'false'}
        onClick={show}
      >
        <Bars />
      </button>
      <dialog
        ref={(n) => (el = n)}
        id={id}
        data-scope="menu-screen"
        aria-label={label.value}
        onClick={follow}
      >
        <div data-part="head">
          <span data-part="brand">{props.brand}</span>
          <button
            type="button"
            data-scope="button"
            data-emphasis="ghost"
            data-tone="neutral"
            data-icon-only=""
            data-hamburger=""
            data-part="close"
            data-close=""
            aria-label="Close"
            aria-expanded="true"
          >
            <Bars />
          </button>
        </div>
        <nav data-part="body" aria-label={label.value}>
          {props.links && (
            <ul data-part="links">
              {props.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} aria-current={l.href === props.current ? 'page' : undefined}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {props.children}
        </nav>
      </dialog>
    </>
  )
}
