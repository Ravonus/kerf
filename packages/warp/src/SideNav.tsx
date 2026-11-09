import { RightIcon, XIcon } from '@weft-js/warp-icons'
import { untrack } from '@weft-js/core'
import { sideNavState } from './SideNav/state'
import { SideNavSections } from './SideNav/sections'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the close button, without a bar
import '@weft-js/warp-core/styles/layout/tokens.css' // the bar height, the view's height and the safe areas, without a Shell
import '@weft-js/warp-core/styles/layout/navlist.css'
import '@weft-js/warp-core/styles/layout/sidenav.css'

/** One page in a SideNav section. */
export interface SideNavLink {
  href: string
  label: string
}

/** A titled run of pages. `pinned` keeps it open, with a plain heading instead of a fold. */
export interface SideNavSection {
  title: string
  items: SideNavLink[]
  pinned?: boolean | undefined
}

/** Props for SideNav. */
export interface SideNavProps {
  /** Names the navigation landmark, and titles the panel when it is laid over the page. */
  label: string
  sections: SideNavSection[]
  /** The current page's href: its link is marked, its section starts open, and the panel scrolls to it. */
  current?: string | undefined
  /** A filter box at the top, for a long list. A string is its placeholder. */
  filter?: boolean | string | undefined
  /** The localStorage key for what a viewer folded, and `<key>:collapsed` for the docked panel's fold; `false` keeps
   * nothing. Default `warp:sidenav:<label>`. */
  remember?: string | false | undefined
  /** A collapse bar at the panel's edge: on a phone it is all that shows until pressed, and it opens the panel over the
   * page; docked, it folds the sidebar to its own width. Default true. `false` leaves the panel to an outside button. */
  collapsible?: boolean | undefined
  /** The panel's id. Any button with `aria-controls` naming it also opens the panel on a phone. */
  id?: string | undefined
  /** On a phone, where the open panel sits. `cover` (default) lays it over everything, header too. `under` opens it
   * below the header (`--warp-sidenav-top`), and a SideNavTitle in the header slides to the panel's title. */
  overlay?: 'cover' | 'under' | undefined
}

/**
 * A docs sidebar: one left panel whose sections fold, with a collapse bar at its edge. The section holding the current
 * page starts open, the rest closed, and a viewer's own choices are remembered. From 900px the panel is docked: sticky,
 * scrolling on its own, and its bar folds it to a slim strip and back, remembered too. Below that only the bar shows, a
 * slim strip down the left edge; pressing it brings the panel over the page, full height, with focus kept inside, and
 * the bar, Escape, the backdrop or a link closing it. Links are plain anchors, so a router that handles `<a>` clicks
 * navigates as usual.
 *
 * It is chrome that outlives a page: a view transition leaves it in place (`data-vt="side"`) rather than fading it
 * with the page. Keep it mounted across pages by rendering it in a layout above them all and
 * passing `sections` and `current` for where the reader is (`currentPath()` in `@weft-js/start`).
 */
export function SideNav(props: SideNavProps) {
  const nav = sideNavState(untrack(() => props))
  const { id, query, open, collapsible, collapsed, refs, words, shown } = nav
  const { holds, unfolded, toggle, filterText } = nav
  return (
    <div
      ref={(n) => (refs.root = n)}
      data-scope="sidenav"
      data-vt="side"
      data-open={open.value ? '' : undefined}
      data-collapsible={collapsible ? '' : undefined}
      data-collapsed={collapsible && collapsed.value ? '' : undefined}
      data-overlay={props.overlay === 'under' ? 'under' : undefined}
    >
      <div data-part="backdrop" aria-hidden="true"></div>
      <div data-part="panel" id={id} tabindex="-1">
        <div data-part="head">
          <p data-part="title" id={`${id}-t`}>
            {props.label}
          </p>
          {!collapsible && (
            <button
              type="button"
              data-scope="button"
              data-emphasis="ghost"
              data-tone="neutral"
              data-icon-only=""
              data-size="sm"
              aria-label="Close"
              data-part="close"
            >
              <XIcon />
            </button>
          )}
        </div>
        <div data-part="scroll">
          {props.filter && (
            <input
              type="search"
              data-part="filter"
              placeholder={filterText()}
              aria-label={filterText()}
              value={query.value}
              onInput={(e: Event) => (query.value = (e.currentTarget as HTMLInputElement).value)}
            />
          )}
          <SideNavSections
            props={props}
            id={id}
            refs={refs}
            shown={shown}
            holds={holds}
            unfolded={unfolded}
            toggle={toggle}
          />
          {words.value !== '' && shown.value.length === 0 && (
            <p data-part="empty">No pages match “{query.value.trim()}”.</p>
          )}
        </div>
        {/* Last, as Shell's toggle is at its nav's foot. Its name is the label; aria-expanded, kept by sideNav, says the rest. */}
        {collapsible && (
          <button type="button" data-part="bar" aria-controls={id} aria-expanded="false">
            <RightIcon />
            <span data-part="bar-label">{props.label}</span>
          </button>
        )}
      </div>
    </div>
  )
}
