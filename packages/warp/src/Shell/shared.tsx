import type { IconRef } from '../Icon'
import type { State } from '@weft-js/core'
import { Icon } from '../Icon'
import { untrack, derived } from '@weft-js/core'

/** A nav glyph: an icon, or a function that draws one. */
export type NavIcon = IconRef | (() => unknown)

/** One line of the Shell's navigation. */
export interface NavItem {
  id: string
  label: string
  icon?: NavIcon | undefined
  href?: string | undefined
  onSelect?: (() => void) | undefined
  count?: number | undefined
  /** Spoken after the count. Default " new". */
  countLabel?: string | undefined
  /** One of the phone bottom bar's tabs. Default the first group's first four. */
  tab?: boolean | undefined
}

/** A run of nav items under an optional label. */
export type NavGroup = { label?: string | undefined; items: NavItem[] }

/** One step of the breadcrumb. */
export type Crumb = { label: string; href?: string }

/** One line of the account menu. */
export type MenuEntry =
  | {
      label: string
      icon?: NavIcon | undefined
      href?: string
      onSelect?: () => void
      shortcut?: string
      keys?: string
      tone?: 'critical' | undefined
    }
  | 'separator'

/** An entry in the workspace switcher. */
export type Workspace = { id: string; name: string; initials: string; meta?: string | undefined }

/** Props for Shell. */
export interface ShellProps {
  /** app (default) · focus: a wizard or checkout, with no nav. */
  variant?: 'app' | 'focus' | undefined
  brand?: { name: string; href?: string; mark?: unknown } | undefined
  /** The phone bar's title; always shown in focus. */
  title?: unknown
  /** The tablet and desktop header's path. The last is the current page. */
  crumbs?: Crumb[]
  /** `child` puts a back button in the brand's place on a phone, for a page under another. */
  depth?: 'root' | 'child'
  /** Phone, depth child: the back button in the brand's place. */
  back?: { label: string; href?: string; onClick?: (() => void) | undefined }
  /** Focus variant: Close at the start and the step count at the end. */
  close?: { label: string; href?: string; onClick?: (() => void) | undefined }
  step?: unknown
  command?: { label?: string | undefined; hint?: string; shortcut?: string; onOpen: () => void }
  /** Header actions, between the command field and the account button. */
  actions?: unknown
  account?: { name: string; email?: string; initials: string; items?: MenuEntry[] } | undefined
  switcher?:
    | { current: string; workspaces: Workspace[]; onSwitch: (id: string) => void }
    | undefined
  /** The first group is the main list; the rest are saved views and the like (sidebar only, the More sheet below). */
  nav?: NavGroup[] | undefined
  /** The nav's pinned items, above the collapse toggle. */
  foot?: NavItem[]
  current?: string
  /** Names the navigation landmark for screen readers. */
  navLabel?: string
  /** false · true: the rail · 'hidden': no rail either, the edge tab opens the sidebar. A box, so the shell can write it. */
  collapsed?: State<boolean | 'hidden'> | undefined
  /** Names main when `island`, or the region around a preview. */
  label?: string | undefined
  /** A shell inside a page (a preview, a story): main becomes a named region, as a document has one main. */
  island?: boolean | undefined
  dock?: unknown
  /** Dialogs, toasts and palettes: outside main, in the top layer or fixed, so nothing here takes up room. */
  overlays?: unknown
  children?: unknown
}

export const sweepParts = () => (
  <>
    <span data-part="sweep-base" aria-hidden="true"></span>
    <span data-part="sweep" aria-hidden="true"></span>
  </>
)

export const draw = (i: NavIcon | undefined) =>
  typeof i === 'function' ? i({}) : i ? <Icon name={i} /> : null

export const TABS = 4

// `plain`, not `quiet`: weft's purge keeps a dial tier whose name is a word in the build, and a prop named quiet
// shipped [data-expression=quiet]'s tokens to every app with a Shell.
export function Item({
  item,
  current,
  plain,
  onPick,
}: {
  item: NavItem
  current?: string | undefined
  plain?: boolean | undefined
  onPick: () => void
}) {
  const it = untrack(() => item)
  const press = (e: MouseEvent) => {
    if (!it.href) e.preventDefault()
    it.onSelect?.()
    onPick()
  }
  return (
    <a
      href={it.href ?? '#'}
      data-part="nav-item"
      data-sweep=""
      aria-current={current === it.id ? 'page' : undefined}
      onClick={press}
    >
      <span data-part="icon">
        {draw(it.icon)}
        {sweepParts()}
      </span>
      <span data-part="nav-label">{it.label}</span>
      {it.count !== undefined && (
        <span
          data-part="nav-count"
          style={plain ? 'background:none;color:var(--warp-color-text-subtle)' : undefined}
        >
          {it.count}
          <span data-part="nav-count-label">{it.countLabel ?? ' new'}</span>
        </span>
      )}
    </a>
  )
}

export function Crumbs({ items }: { items: Crumb[] }) {
  // the first and last two stay below 1000px; the ellipsis stands for the rest
  const rows = derived(() =>
    items.flatMap((c, n) => {
      const row = {
        key: c.label,
        crumb: c,
        collapse: n > 0 && n < items.length - 2,
        last: n === items.length - 1,
      }
      return n === 1 && items.length > 3
        ? [
            {
              key: '…',
              crumb: items[items.length - 3],
              collapse: false,
              last: false,
              hidden: items.length - 3,
            },
            row,
          ]
        : [row]
    }),
  )
  return (
    <nav data-part="crumbs" data-scope="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {rows.value.map((r) => (
          <li
            key={r.key}
            data-part={'hidden' in r ? 'ellipsis' : undefined}
            data-collapse={r.collapse ? '' : undefined}
          >
            {'hidden' in r ? (
              <a href={r.crumb!.href ?? '#'} aria-label={`Show ${r.hidden} more`}>
                …
              </a>
            ) : r.last ? (
              <span aria-current="page">{r.crumb.label}</span>
            ) : (
              <a href={r.crumb.href ?? '#'}>{r.crumb.label}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Entry({ entry, onPick }: { entry: MenuEntry; onPick: () => void }) {
  const e = untrack(() => entry)
  if (e === 'separator') return <div data-part="separator" role="separator"></div>
  return (
    <a
      data-part="item"
      role="menuitem"
      tabindex="-1"
      style="text-decoration:none"
      href={e.href ?? '#'}
      data-tone={e.tone}
      aria-keyshortcuts={e.keys}
      onClick={(ev: MouseEvent) => {
        if (!e.href) ev.preventDefault()
        e.onSelect?.()
        onPick()
      }}
    >
      {draw(e.icon)}
      <span data-part="item-label">{e.label}</span>
      {e.shortcut && (
        <kbd data-part="shortcut" aria-hidden="true">
          {e.shortcut}
        </kbd>
      )}
    </a>
  )
}
