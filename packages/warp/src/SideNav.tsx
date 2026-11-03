import { RightIcon, XIcon } from '@weft-js/warp-icons'
import { navIndicator, readFolds, sideNav, uid, writeFolds, type Folds } from '@weft-js/warp-core'
import { derived, onMount, state, untrack, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the close button
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
  /** The localStorage key for what a viewer folded; `false` keeps nothing. Default `warp:sidenav:<label>`. */
  remember?: string | false | undefined
  /** The panel's id. Any button with `aria-controls` naming it opens the panel on a phone, such as a header's menu button. */
  id?: string | undefined
  /** Links shown above the sections only while the panel is laid over the page, such as a site's top links. */
  lead?: SideNavLink[] | undefined
}

/**
 * A docs sidebar: one left panel whose sections fold. The section holding the current page starts open, the rest
 * closed, and a viewer's own choices are remembered. From 900px the panel is docked: sticky, scrolling on its own.
 * Below that the same panel waits off the left edge, and a button elsewhere whose `aria-controls` names its `id` opens
 * it over the page, full height, with a close button, focus kept inside, and Escape, the backdrop or a link closing it.
 * Links are plain anchors, so a router that handles `<a>` clicks navigates as usual.
 */
export function SideNav(props: SideNavProps) {
  const id = untrack(() => props.id) ?? uid('sidenav')
  const chosen = state<Folds>({})
  const query = state('')
  const open = state(false)
  let root: HTMLElement | undefined
  let list: HTMLElement | undefined

  const key = () => (props.remember === false ? undefined : props.remember ?? `warp:sidenav:${props.label}`)
  const holds = (s: SideNavSection) => s.items.some(i => i.href === props.current)
  const words = derived(() => query.value.trim().toLowerCase())
  const shown = derived(() => props.sections
    .map((section, n) => ({ section, n, items: words.value ? section.items.filter(i => i.label.toLowerCase().includes(words.value)) : section.items }))
    .filter(x => x.items.length > 0))
  const unfolded = (s: SideNavSection) => words.value !== '' || !!s.pinned || (chosen.value[s.title] ?? holds(s))
  const toggle = (s: SideNavSection) => {
    chosen.value = { ...chosen.value, [s.title]: !unfolded(s) }
    const k = key()
    if (k) writeFolds(k, chosen.value)
  }
  // Arriving on a page opens its section, whatever was remembered, so the current link is never folded away.
  const reveal = () => {
    const s = props.sections.find(holds)
    if (s && chosen.value[s.title] === false) chosen.value = { ...chosen.value, [s.title]: true }
  }
  onMount(() => {
    const k = key()
    if (k) chosen.value = readFolds(k)
    reveal()
  })
  watch(() => props.current, () => { reveal(); open.value = false })
  use(sideNav, () => root, () => ({ current: props.current, open: open.value, onOpenChange: (v: boolean) => (open.value = v) }))
  // warp's sliding bar, as Nav and the on-page rail have it: it follows the pointer and keyboard, and slides to a new page.
  use(navIndicator, () => list, () => ({ axis: 'y' as const }))

  const filterText = () => (typeof props.filter === 'string' ? props.filter : `Filter ${props.label.toLowerCase()}`)
  return (
    <div ref={n => (root = n)} data-scope="sidenav" data-open={open.value ? '' : undefined}>
      <div data-part="backdrop" aria-hidden="true"></div>
      <div data-part="panel" id={id} tabindex="-1">
        <div data-part="head">
          <p data-part="title" id={`${id}-t`}>{props.label}</p>
          <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" data-size="sm" aria-label="Close" data-part="close"><XIcon /></button>
        </div>
        <div data-part="scroll">
          {props.lead && props.lead.length > 0 && (
            <div data-part="lead" data-scope="navlist">
              <ul>
                {props.lead.map(i => <li key={i.href}><a data-part="item" href={i.href} aria-current={props.current?.startsWith(i.href) ? 'true' : undefined}>{i.label}</a></li>)}
              </ul>
            </div>
          )}
          {props.filter && (
            <input type="search" data-part="filter" placeholder={filterText()} aria-label={filterText()} value={query.value} onInput={(e: Event) => (query.value = (e.currentTarget as HTMLInputElement).value)} />
          )}
          <nav ref={n => (list = n)} data-scope="navlist" data-bar="" aria-label={props.label}>
            <ul data-part="sections">
              {shown.value.map(x => (
                <li key={x.section.title} data-current={holds(x.section) ? '' : undefined}>
                  {x.section.pinned
                    ? <p data-part="group-label">{x.section.title}</p>
                    : (
                      <button type="button" data-part="item" data-fold="" aria-expanded={unfolded(x.section) ? 'true' : 'false'} aria-controls={`${id}-${x.n}`} onClick={() => toggle(x.section)}>
                        <span data-part="fold-label">{x.section.title}</span>
                        <span data-part="chevron" aria-hidden="true"><RightIcon /></span>
                      </button>
                    )}
                  <ul id={`${id}-${x.n}`} hidden={!unfolded(x.section)}>
                    {x.items.map(i => <li key={i.href}><a data-part="item" href={i.href} aria-current={i.href === props.current ? 'page' : undefined}>{i.label}</a></li>)}
                  </ul>
                </li>
              ))}
            </ul>
            <span data-part="indicator" aria-hidden="true"></span>
          </nav>
          {words.value !== '' && shown.value.length === 0 && <p data-part="empty">No pages match “{query.value.trim()}”.</p>}
        </div>
      </div>
    </div>
  )
}
