import { DownIcon, RightIcon } from '@weft-js/warp-icons'
import { readFolds, sideNav, uid, writeFolds, type Folds } from '@weft-js/warp-core'
import { derived, onMount, state, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { Drawer } from './Drawer'
import './styles'
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
  /** Names the navigation landmark, titles the phone's sheet, and leads the phone's bar. */
  label: string
  sections: SideNavSection[]
  /** The current page's href: its link is marked, its section starts open, and the rail scrolls to it. */
  current?: string | undefined
  /** A filter box at the top, for a long list. A string is its placeholder. */
  filter?: boolean | string | undefined
  /** The localStorage key for what a viewer folded; `false` keeps nothing. Default `warp:sidenav:<label>`. */
  remember?: string | false | undefined
}

/**
 * A docs sidebar. Sections fold under their headings: the one holding the current page starts open, the rest closed,
 * and a viewer's own choices are remembered. From 900px it is a sticky rail that scrolls on its own; below that a slim
 * bar names the section and page, and opens the same list in a sheet with a close button, a focus trap, Escape and a
 * backdrop that close it. Links are plain anchors, so a router that handles `<a>` clicks navigates as usual.
 */
export function SideNav(props: SideNavProps) {
  const id = uid('sidenav')
  const chosen = state<Folds>({})
  const query = state('')
  const sheet = state(false)
  let rail: HTMLElement | undefined

  const key = () => (props.remember === false ? undefined : props.remember ?? `warp:sidenav:${props.label}`)
  const holds = (s: SideNavSection) => s.items.some(i => i.href === props.current)
  const here = derived(() => props.sections.flatMap(s => s.items).find(i => i.href === props.current))
  const words = derived(() => query.value.trim().toLowerCase())
  const shown = derived(() => props.sections
    .map((section, n) => ({ section, n, items: words.value ? section.items.filter(i => i.label.toLowerCase().includes(words.value)) : section.items }))
    .filter(x => x.items.length > 0))
  const open = (s: SideNavSection) => words.value !== '' || !!s.pinned || (chosen.value[s.title] ?? holds(s))
  const toggle = (s: SideNavSection) => {
    chosen.value = { ...chosen.value, [s.title]: !open(s) }
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
  watch(() => props.current, () => { reveal(); sheet.value = false })
  use(sideNav, () => rail, () => ({ current: props.current }))

  const filterText = () => (typeof props.filter === 'string' ? props.filter : `Filter ${props.label.toLowerCase()}`)
  const tree = (where: 'rail' | 'sheet') => (
    <>
      {props.filter && (
        <input type="search" data-part="filter" placeholder={filterText()} aria-label={filterText()} value={query.value} onInput={(e: Event) => (query.value = (e.currentTarget as HTMLInputElement).value)} />
      )}
      <ul data-part="sections">
        {shown.value.map(x => (
          <li key={x.section.title} data-current={holds(x.section) ? '' : undefined}>
            {x.section.pinned
              ? <p data-part="group-label">{x.section.title}</p>
              : (
                <button type="button" data-part="item" data-fold="" aria-expanded={open(x.section) ? 'true' : 'false'} aria-controls={`${id}-${where}-${x.n}`} onClick={() => toggle(x.section)}>
                  <span data-part="fold-label">{x.section.title}</span>
                  <span data-part="chevron" aria-hidden="true"><RightIcon /></span>
                </button>
              )}
            <ul id={`${id}-${where}-${x.n}`} hidden={!open(x.section)}>
              {x.items.map(i => <li key={i.href}><a data-part="item" href={i.href} aria-current={i.href === props.current ? 'page' : undefined}>{i.label}</a></li>)}
            </ul>
          </li>
        ))}
      </ul>
      {words.value !== '' && shown.value.length === 0 && <p data-part="empty">No pages match “{query.value.trim()}”.</p>}
    </>
  )

  return (
    <div data-scope="sidenav">
      <button type="button" data-part="bar" aria-haspopup="dialog" aria-expanded={sheet.value ? 'true' : 'false'} onClick={() => (sheet.value = true)}>
        <span data-part="bar-section">{props.label}</span>
        {here.value && <span data-part="bar-page"><span aria-hidden="true">/ </span>{here.value.label}</span>}
        <span data-part="bar-icon" aria-hidden="true"><DownIcon /></span>
      </button>
      <nav ref={n => (rail = n)} data-part="rail" data-scope="navlist" aria-label={props.label}>{tree('rail')}</nav>
      <Drawer open={sheet} title={props.label} side="left">
        <nav data-part="sheet-nav" data-scope="navlist" aria-label={props.label} onClick={(e: MouseEvent) => { if ((e.target as Element).closest?.('a')) sheet.value = false }}>{tree('sheet')}</nav>
      </Drawer>
    </div>
  )
}
