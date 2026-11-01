import { CheckIcon, type IconComponent, DownIcon, LeftIcon, MoreIcon, PanelIcon, RightIcon, SearchIcon, XIcon } from '@weft/icons'
import { dialog, menu, shell, uid } from '@weft/warp-core'
import { derived, state, type State, untrack } from 'weft'
import { Icon, type IconRef } from './Icon'
import { use } from '@weft/warp-core/weft'
import './styles'
import '@weft/warp-core/styles/components/avatar.css'
import '@weft/warp-core/styles/components/button.css'
import '@weft/warp-core/styles/components/menu.css'
import '@weft/warp-core/styles/layout/tokens.css'
import '@weft/warp-core/styles/layout/base.css'
import '@weft/warp-core/styles/layout/shell.css'
import '@weft/warp-core/styles/layout/breadcrumb.css'

export type NavIcon = IconRef | (() => any)
export interface NavItem {
  id: string
  label: string
  icon?: NavIcon
  href?: string
  onSelect?: () => void
  count?: number
  /** Spoken after the count. Default " new". */
  countLabel?: string
  /** One of the phone bottom bar's tabs. Default the first group's first four. */
  tab?: boolean
}
export type NavGroup = { label?: string; items: NavItem[] }
export type Crumb = { label: string; href?: string }
export type MenuEntry = { label: string; icon?: NavIcon; href?: string; onSelect?: () => void; shortcut?: string; keys?: string; tone?: 'critical' } | 'separator'
export type Workspace = { id: string; name: string; initials: string; meta?: string }

export interface ShellProps {
  /** app (default) · focus: a wizard or checkout, with no nav. */
  variant?: 'app' | 'focus'
  brand?: { name: string; href?: string; mark?: any }
  /** The phone bar's title; always shown in focus. */
  title?: any
  /** The tablet and desktop header's path. The last is the current page. */
  crumbs?: Crumb[]
  depth?: 'root' | 'child'
  /** Phone, depth child: the back button in the brand's place. */
  back?: { label: string; href?: string; onClick?: () => void }
  /** Focus variant: Close at the start and the step count at the end. */
  close?: { label: string; href?: string; onClick?: () => void }
  step?: any
  command?: { label?: string; hint?: string; shortcut?: string; onOpen: () => void }
  /** Header actions, between the command field and the account button. */
  actions?: any
  account?: { name: string; email?: string; initials: string; items?: MenuEntry[] }
  switcher?: { current: string; workspaces: Workspace[]; onSwitch: (id: string) => void }
  /** The first group is the main list; the rest are saved views and the like (sidebar only, the More sheet below). */
  nav?: NavGroup[]
  /** The nav's pinned items, above the collapse toggle. */
  foot?: NavItem[]
  current?: string
  navLabel?: string
  /** false · true: the rail · 'hidden': no rail either, the edge tab opens the sidebar. A box, so the shell can write it. */
  collapsed?: State<boolean | 'hidden'>
  /** Names main when `island`, or the region around a preview. */
  label?: string
  /** A shell inside a page (a preview, a story): main becomes a named region, as a document has one main. */
  island?: boolean
  dock?: any
  /** Dialogs, toasts and palettes: outside main, in the top layer or fixed, so nothing here takes up room. */
  overlays?: any
  children?: any
}

const sweepParts = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>
const draw = (i: NavIcon | undefined) => (typeof i === 'function' ? i({}) : i ? <Icon name={i} /> : null)
const TABS = 4

function Item({ item, current, quiet, onPick }: { item: NavItem; current?: string; quiet?: boolean; onPick: () => void }) {
  const it = untrack(() => item)
  const press = (e: MouseEvent) => {
    if (!it.href) e.preventDefault()
    it.onSelect?.()
    onPick()
  }
  return (
    <a href={it.href ?? '#'} data-part="nav-item" data-sweep="" aria-current={current === it.id ? 'page' : undefined} onClick={press}>
      <span data-part="icon">{draw(it.icon)}{sweepParts()}</span>
      <span data-part="nav-label">{it.label}</span>
      {it.count !== undefined && <span data-part="nav-count" style={quiet ? 'background:none;color:var(--warp-color-text-subtle)' : undefined}>{it.count}<span data-part="nav-count-label">{it.countLabel ?? ' new'}</span></span>}
    </a>
  )
}

function Crumbs({ items }: { items: Crumb[] }) {
  // the first and last two stay below 1000px; the ellipsis stands for the rest
  const rows = derived(() => items.flatMap((c, n) => {
    const row = { key: c.label, crumb: c, collapse: n > 0 && n < items.length - 2, last: n === items.length - 1 }
    return n === 1 && items.length > 3 ? [{ key: '…', crumb: items[items.length - 3], collapse: false, last: false, hidden: items.length - 3 }, row] : [row]
  }))
  return (
    <nav data-part="crumbs" data-scope="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {rows.value.map(r => (
          <li key={r.key} data-part={'hidden' in r ? 'ellipsis' : undefined} data-collapse={r.collapse ? '' : undefined}>
            {'hidden' in r
              ? <a href={r.crumb.href ?? '#'} aria-label={`Show ${r.hidden} more`}>…</a>
              : r.last ? <span aria-current="page">{r.crumb.label}</span> : <a href={r.crumb.href ?? '#'}>{r.crumb.label}</a>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Entry({ entry, onPick }: { entry: MenuEntry; onPick: () => void }) {
  const e = untrack(() => entry)
  if (e === 'separator') return <div data-part="separator" role="separator"></div>
  return (
    <a data-part="item" role="menuitem" tabindex="-1" style="text-decoration:none" href={e.href ?? '#'} data-tone={e.tone} aria-keyshortcuts={e.keys} onClick={(ev: MouseEvent) => { if (!e.href) ev.preventDefault(); e.onSelect?.(); onPick() }}>
      {draw(e.icon)}
      <span data-part="item-label">{e.label}</span>
      {e.shortcut && <kbd data-part="shortcut" aria-hidden="true">{e.shortcut}</kbd>}
    </a>
  )
}

/**
 * The app shell (02 §5-6; layout.html:874-906): one element tree, three presentations, chosen by the shell's own
 * width: phone a top bar and bottom tabs, tablet a rail that opens as an overlay, desktop a sidebar that collapses to
 * the rail (`[`). DOM order is the focus order: skip link, brand, back, crumbs, command, actions, account, nav items,
 * foot, main, dock. Parts are props, not children, so that order and the overlays' place outside main hold whatever
 * an app passes. The account menu is an APG menu button; the More sheet is modal on a native <dialog>.
 */
export function Shell({ variant = 'app', brand, title, crumbs, depth, back, close, step, command, actions, account, switcher, nav, foot, current, navLabel = 'Main', collapsed, label, island, dock, overlays, children }: ShellProps) {
  const base = uid('shell')
  const main = `${base}-main`, navId = `${base}-nav`, menuId = `${base}-menu`, sheetId = `${base}-sheet`
  const focus = derived(() => variant === 'focus')
  const folded = untrack(() => collapsed) ?? state<boolean | 'hidden'>(false)
  const navOpen = state(false)
  const wide = state(false)
  const menuOpen = state(false)
  const moreOpen = state(false)
  let from: HTMLElement | null = null
  let at: 'first' | 'last' = 'first'
  let root: HTMLDivElement | undefined
  let menuEl: HTMLDivElement | undefined
  let sheetEl: HTMLDialogElement | undefined

  const groups = derived(() => nav ?? [])
  const primary = derived(() => {
    const items = groups.value[0]?.items ?? []
    const marked = items.some(i => i.tab)
    return items.map((item, n) => ({ item, tab: marked ? !!item.tab : n < TABS }))
  })
  const extra = derived(() => groups.value.slice(1))
  const more = derived(() => [...primary.value.filter(p => !p.tab).map(p => p.item), ...extra.value.flatMap(g => g.items), ...(foot ?? [])])

  const workspace = derived(() => switcher?.workspaces.find(w => w.id === switcher.current))
  const entries = derived(() => (account?.items ?? []).map((entry, at) => ({ entry, at })))

  const toggle = () => {
    if (wide.value) folded.value = folded.value ? false : true
    else navOpen.value = !navOpen.value
  }
  const closeNav = () => (navOpen.value = false)
  const toggleExpanded = derived(() => (wide.value ? !folded.value : navOpen.value))
  const toggleLabel = derived(() => (wide.value ? (folded.value ? 'Expand sidebar' : 'Collapse sidebar') : navOpen.value ? 'Collapse navigation' : 'Expand navigation'))

  const openMenu = (e: Event, where: 'first' | 'last' = 'first') => {
    from = e.currentTarget as HTMLElement
    at = where
    menuOpen.value = !menuOpen.value
  }
  const menuKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    if (!menuOpen.value) openMenu(e, e.key === 'ArrowUp' ? 'last' : 'first')
  }
  const shut = () => (menuOpen.value = false)

  use(shell, () => root, () => ({
    navOpen: navOpen.value, current, onToggle: toggle, onCloseNav: closeNav,
    onWide: (w: boolean) => { wide.value = w; if (w) navOpen.value = folded.value === 'hidden' && navOpen.value },
    onCommand: command?.onOpen,
  }))
  use(menu, () => menuEl, () => ({ open: menuOpen.value, trigger: () => from, at, onClose: shut }))
  use(dialog, () => sheetEl, () => ({ open: moreOpen.value, onClose: () => (moreOpen.value = false) }))

  const button = (d: { label: string; href?: string; onClick?: () => void }, part: string | undefined, icon: IconComponent) => (
    d.href
      ? <a href={d.href} data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" data-part={part} aria-label={d.label}>{icon({})}</a>
      : <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" data-part={part} aria-label={d.label} onClick={d.onClick}>{icon({})}</button>
  )
  const page = <div data-part="page">{children}</div>
  return (
    <div ref={(n: any) => (root = n)} data-scope="shell" data-part="root" data-variant={focus.value ? 'focus' : undefined} data-depth={depth} data-collapsed={folded.value === 'hidden' ? 'hidden' : folded.value ? '' : undefined} data-nav-open={navOpen.value ? '' : undefined}>
      <a data-part="skip" href={`#${main}`}>Skip to content</a>
      {folded.value === 'hidden' && <button type="button" data-part="edge-tab" aria-controls={navId} aria-expanded={navOpen.value ? 'true' : 'false'} aria-label={navOpen.value ? 'Hide navigation' : 'Show navigation'} onClick={() => (navOpen.value = !navOpen.value)}><RightIcon /></button>}
      <div data-part="layout">
        <header data-part="header">
          {focus.value && close && button(close, undefined, XIcon)}
          {!focus.value && back && button(back, 'back', LeftIcon)}
          {!focus.value && brand && <a href={brand.href ?? '/'} data-part="brand" aria-label={`${brand.name}, home`}>{brand.mark}<span data-part="brand-name">{brand.name}</span></a>}
          {title !== undefined && <p data-part="title">{title}</p>}
          {!focus.value && crumbs && <Crumbs items={crumbs} />}
          <div data-part="actions">
            {focus.value && step !== undefined && <span style="white-space:nowrap;font-size:var(--warp-text-caption-size);color:var(--warp-color-text-subtle)">{step}</span>}
            {!focus.value && command && (
              <button type="button" data-part="command" data-sweep="" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" onClick={command.onOpen}>
                {sweepParts()}<SearchIcon />
                <span data-part="command-label">{command.label ?? 'Search'}</span>
                <span data-part="command-hint">{command.hint ?? 'Jump to, or run…'}</span>
                <kbd aria-hidden="true">{command.shortcut ?? '⌘K'}</kbd>
              </button>
            )}
            {!focus.value && actions}
            {!focus.value && account && (
              <button type="button" style="display:inline-grid;place-items:center;inline-size:var(--warp-control-md);block-size:var(--warp-control-md);border:0;background:none;padding:0;cursor:pointer;border-radius:var(--warp-radius-round)" aria-haspopup="menu" aria-expanded={menuOpen.value ? 'true' : 'false'} aria-controls={menuId} onClick={(e: Event) => openMenu(e)} onKeyDown={menuKey}>
                <span data-scope="avatar" aria-hidden="true">{account.initials}</span><span data-part="sr-only">Account: {account.name}</span>
              </button>
            )}
          </div>
        </header>
        {!focus.value && (
          <nav data-part="nav" aria-label={navLabel} id={navId} onClick={(e: MouseEvent) => { if ((e.target as Element).closest('a')) closeNav() }}>
            {groups.value[0]?.label !== undefined && <p data-part="nav-group" id={`${navId}-g`}>{groups.value[0].label}</p>}
            {switcher && (
              <button type="button" data-part="switcher" data-sweep="" aria-haspopup="menu" aria-expanded={menuOpen.value ? 'true' : 'false'} aria-controls={menuId} onClick={(e: Event) => openMenu(e)} onKeyDown={menuKey}>
                {sweepParts()}
                <span data-scope="avatar" data-shape="square" data-size="sm" aria-hidden="true">{workspace.value?.initials}</span>
                <span data-part="sr-only">Workspace: </span>
                <span data-part="org"><b>{workspace.value?.name}</b><small>{workspace.value?.meta}</small></span>
                <span data-part="sr-only">. Switch workspace</span>
                <DownIcon />
              </button>
            )}
            <ul data-part="nav-list" aria-labelledby={groups.value[0]?.label !== undefined ? `${navId}-g` : undefined}>
              {primary.value.map(p => <li key={p.item.id} data-tab={p.tab ? '' : undefined}><Item item={p.item} current={current} onPick={closeNav} /></li>)}
              {more.value.length > 0 && <li data-tab="" data-part="nav-more"><button type="button" data-part="nav-item" data-sweep="" aria-haspopup="dialog" aria-expanded={moreOpen.value ? 'true' : 'false'} onClick={() => (moreOpen.value = true)}><span data-part="icon"><MoreIcon />{sweepParts()}</span><span data-part="nav-label">More</span></button></li>}
            </ul>
            {extra.value.length > 0 && (
              <div data-part="nav-extra">
                {extra.value.map(g => (
                  <div key={g.label}>
                    <p data-part="nav-group">{g.label}</p>
                    <ul data-part="nav-list" aria-label={g.label}>{g.items.map(i => <li key={i.id}><Item item={i} current={current} quiet onPick={closeNav} /></li>)}</ul>
                  </div>
                ))}
              </div>
            )}
            <div data-part="nav-foot">
              {foot?.map(i => <Item key={i.id} item={i} current={current} onPick={closeNav} />)}
              <button type="button" data-part="nav-toggle" aria-controls={navId} aria-expanded={toggleExpanded.value ? 'true' : 'false'} aria-label={toggleLabel.value} aria-keyshortcuts="[" onClick={toggle}><PanelIcon /></button>
            </div>
          </nav>
        )}
        {island
          ? <div data-part="main" id={main} tabindex="-1" role="region" aria-label={label ?? 'Page content'}>{page}{dock !== undefined && <div data-part="dock">{dock}</div>}</div>
          : <main data-part="main" id={main} tabindex="-1">{page}{dock !== undefined && <div data-part="dock">{dock}</div>}</main>}
      </div>
      <div data-part="scrim" data-for="nav" hidden={!navOpen.value} onClick={closeNav}></div>
      {!focus.value && account && (
        <aside aria-label="Account" hidden={!menuOpen.value}>
        <div ref={(n: any) => (menuEl = n)} data-scope="menu" data-part="menu" role="menu" id={menuId} aria-label={`Account: ${account.name}${account.email ? `, ${account.email}` : ''}`} hidden={!menuOpen.value}>
          <div aria-hidden="true" style="display:flex;gap:10px;align-items:center;padding:10px">
            <span data-scope="avatar">{account.initials}</span>
            <div><b style="display:block;font-weight:600">{account.name}</b><span style="font-size:var(--warp-text-caption-size);color:var(--warp-color-text-subtle)">{account.email}</span></div>
          </div>
          {switcher && (
            <>
              <div data-part="separator" role="separator"></div>
              <div role="group" aria-label="Workspace">
                <p data-part="group-label" aria-hidden="true" style="margin:0">Workspace</p>
                {switcher.workspaces.map(w => (
                  <button key={w.id} type="button" data-part="item" role="menuitemradio" tabindex="-1" aria-checked={w.id === switcher.current ? 'true' : 'false'} style="inline-size:100%;border:0;background:none;font:inherit;text-align:start" onClick={() => { switcher.onSwitch(w.id); shut(); from?.focus() }}>
                    <span data-scope="avatar" data-shape="square" data-size="sm" aria-hidden="true">{w.initials}</span>
                    <span data-part="item-label">{w.name}</span>
                    <span data-part="indicator"><CheckIcon /></span>
                  </button>
                ))}
              </div>
            </>
          )}
          {entries.value.map(x => <Entry key={x.at} entry={x.entry} onPick={() => { shut(); from?.focus() }} />)}
        </div>
        </aside>
      )}
      {!focus.value && (
        <dialog ref={(n: any) => (sheetEl = n)} data-part="sheet" aria-labelledby={sheetId} hidden={!moreOpen.value} style="margin:0;max-inline-size:none">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <p data-part="title" id={sheetId} style="margin:0;font-weight:600">More</p>
            <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-icon-only="" aria-label="Close" data-close="" autofocus><XIcon /></button>
          </div>
          <div data-scope="menu">
            {more.value.map(i => <a key={i.id} data-part="item" style="text-decoration:none" href={i.href ?? '#'} aria-current={current === i.id ? 'page' : undefined} onClick={(e: MouseEvent) => { if (!i.href) e.preventDefault(); i.onSelect?.(); moreOpen.value = false }}>{draw(i.icon)}<span data-part="item-label">{i.label}</span>{i.count !== undefined && <span data-part="shortcut">{i.count}</span>}</a>)}
          </div>
        </dialog>
      )}
      <div data-scope="announcer" role="status" aria-live="polite"></div>
      {overlays}
    </div>
  )
}
