import { announce, arrivals, feed, filterNotes, groupByDay, indicator, installSweep, nextIndex, readOnView, uid, unreadCount, type InboxTab } from '@weft/ui-core'
import { derived, onMount, state, untrack } from 'weft'
import { Avatar, type LiveState } from '../parts'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Skeleton } from '../Skeleton'
import { toast } from '../Toast'
import { use } from '../use'
import { avatarTint, G, val, type GlyphName } from './shared'
import '../styles'
import '@weft/ui-core/styles/components/tabs.css'
import '@weft/ui-core/styles/components/link.css'
import '@weft/ui-core/styles/app/inbox.css'
import '@weft/ui-core/styles/app/notification.css'

export type NoteKind = 'mention' | 'comment' | 'assign' | 'approve' | 'system' | 'invite'
export interface NoteAction { id: string; label: string; emphasis?: 'solid' | 'outline' }
export interface Note {
  id: string
  actor: string
  kind: NoteKind
  verb: string
  object?: string
  detail?: string
  /** Already formatted: the caller owns the clock. */
  time: string
  /** "Today", "Yesterday": see `dayLabel`. */
  day?: string
  source?: string
  quote?: string
  read?: boolean
  actions?: NoteAction[]
}

const KIND: Record<NoteKind, [GlyphName, string]> = { mention: ['at', 'accent'], comment: ['comment', 'info'], assign: ['flag', 'caution'], approve: ['check', 'positive'], system: ['alert', 'critical'], invite: ['cal', 'accent'] }
const TABS: Record<InboxTab, string> = { all: 'All', unread: 'Unread', mentions: 'Mentions' }
const sentence = (n: Note) => [n.actor, n.verb, n.object, n.detail].filter(Boolean).join(' ')
const label = (n: Note) => `${sentence(n)}${n.read ? '' : ', unread'}, ${n.time}`

export interface InboxProps {
  /** Newest first. Undefined while the first load runs: skeletons, once. */
  items: Note[] | undefined | { value: Note[] | undefined } | (() => Note[] | undefined)
  live?: LiveState | (() => LiveState)
  tabs?: InboxTab[]
  title?: string
  variant?: 'popover'
  /** Is the inbox on screen? Rows are read after 2 s visible only while it is. */
  open?: boolean
  /** Updates waiting to sync (offline, reconnecting). */
  queued?: number
  viewAll?: string
  settings?: () => void
  onRead?: (id: string) => void
  onReadAll?: () => void
  onDismiss?: (id: string) => void
  /** Undo a dismiss: put the row back. */
  onRestore?: (note: Note) => void
  onAction?: (note: Note, action: string) => void
  /** The row is a link to its object. */
  onOpen?: (note: Note) => void
}

/**
 * Inbox (07 §4.1, §4.2, §4.5): tabs filter one panel; a role=feed list grouped by day, rendered by key, so a read or an
 * approval patches the row in place. New rows arrive; with the list scrolled, an "n new" pill shows instead of moving
 * it. A dismissed row slides out and Undo is in the toast. Needs a mounted Toaster for Undo and announcements.
 */
export function Inbox({ items, live, tabs = ['all', 'unread', 'mentions'], title = 'Notifications', variant, open = true, queued = 0, viewAll, settings, onRead, onReadAll, onDismiss, onRestore, onAction, onOpen }: InboxProps) {
  const id = uid('inbox')
  const tab = state<InboxTab>(untrack(() => tabs)[0])
  const data = derived(() => val(items as any) as Note[] | undefined)
  const all = derived(() => data.value ?? [])
  const leaving = state<string[]>([])
  const fresh = state(0)
  const focused = state<string | undefined>(undefined)
  const shown = derived(() => filterNotes(all.value, tab.value))
  const unread = derived(() => unreadCount(all.value))
  const days = derived(() => groupByDay(shown.value))
  const stop = derived(() => (shown.value.some(n => n.id === focused.value) ? focused.value : shown.value[0]?.id))
  const tabId = (t: InboxTab) => `${id}-tab-${t}`
  let list: HTMLDivElement | undefined
  let tablist: HTMLDivElement | undefined
  let root: HTMLElement | undefined
  const doc = () => root!.ownerDocument

  onMount(() => installSweep())
  use(indicator, () => tablist, () => ({ selected: '[aria-selected="true"]', x: '--_ix', w: '--_iw', at: tab.value }))
  use(feed, () => list, () => ({ items: '[data-scope="notification"]' }))
  use(readOnView, () => list, () => ({ items: '[data-scope="notification"]', active: !!open, onRead: (rid: string) => onRead?.(rid) }))
  use(arrivals, () => list, () => ({
    items: '[data-scope="notification"]',
    ids: all.value.map(n => n.id),
    onArrive: (ids: string[]) => { if (list && list.scrollTop > 0) fresh.value += ids.length },
  }))

  const pick = (t: InboxTab) => { tab.value = t; fresh.value = 0 }
  const onTabKey = (e: KeyboardEvent) => {
    const at = tabs.indexOf(tab.value)
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    const to = nextIndex(e.key, at, tabs.length, { rtl })
    if (to < 0) return
    e.preventDefault()
    pick(tabs[to])
    doc().getElementById(tabId(tabs[to]))?.focus()
  }
  const dismiss = (n: Note, row: HTMLElement) => {
    const rest = [...list!.querySelectorAll<HTMLElement>('[data-scope="notification"]')].filter(r => r !== row && r.dataset.state !== 'dismissed')
    const at = [...list!.querySelectorAll('[data-scope="notification"]')].indexOf(row)
    leaving.value = [...leaving.value, n.id]
    ;(rest[at] ?? rest[at - 1])?.focus()
    setTimeout(() => {
      onDismiss?.(n.id)
      leaving.value = leaving.value.filter(x => x !== n.id)
    }, 240)
    toast.show({ title: 'Notification dismissed', description: sentence(n), action: { label: 'Undo', onClick: () => onRestore?.(n) } })
  }
  const readAll = () => { onReadAll?.(); announce(doc(), 'All notifications marked as read') }
  const open1 = (n: Note) => { if (!n.read) onRead?.(n.id); onOpen?.(n) }
  const onRowKey = (e: KeyboardEvent, n: Note) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') { e.preventDefault(); open1(n) }
    if (e.key === 'Delete') { e.preventDefault(); dismiss(n, e.currentTarget as HTMLElement) }
  }
  const pressRow = (e: MouseEvent, n: Note) => { if (!(e.target as Element).closest('button, a')) open1(n) }
  const toTop = () => { list?.scrollTo?.({ top: 0 }); if (list) list.scrollTop = 0; fresh.value = 0 }
  const onScroll = () => { if (list!.scrollTop <= 0) fresh.value = 0 }
  const sync = derived(() => {
    const q = val(queued as any) as number
    if (q) return `${q} update${q > 1 ? 's' : ''} waiting to sync`
    return (val(live as any) ?? 'live') === 'connecting' ? 'Connecting…' : 'Up to date'
  })
  const page = derived(() => viewAll)
  const more = untrack(() => settings)

  return (
    <section ref={(n: any) => (root = n)} data-scope="inbox" data-part="root" data-variant={variant} aria-labelledby={`${id}-t`}>
      <div data-part="header">
        <h3 id={`${id}-t`}>{title}</h3>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={readAll}>Mark all as read</Button>
        {more && <Button emphasis="ghost" tone="neutral" size="sm" data-icon-only="" aria-label="Notification settings" onClick={more}><G name="more" /></Button>}
      </div>
      <div data-scope="tabs" data-part="root">
        <div ref={(n: any) => (tablist = n)} data-part="list" role="tablist" aria-label="Filter" onKeyDown={onTabKey}>
          {tabs.map(t => (
            <button key={t} data-part="trigger" role="tab" type="button" id={tabId(t)} aria-controls={`${id}-panel`} aria-selected={t === tab.value ? 'true' : 'false'} tabindex={t === tab.value ? undefined : '-1'} onClick={() => pick(t)}>
              {TABS[t]}
              {t === 'unread' && <> <Badge count>{unread.value}</Badge></>}
            </button>
          ))}
          <span data-part="indicator" aria-hidden="true" data-instant=""></span>
        </div>
      </div>
      {fresh.value > 0 && <Button size="sm" data-part="new-pill" onClick={toTop}>{fresh.value} new</Button>}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={tabId(tab.value)} data-part="panel">
        <div ref={(n: any) => (list = n)} data-part="list" role="feed" aria-label={title} aria-busy={data.value === undefined ? 'true' : 'false'} tabindex={shown.value.length ? undefined : '0'} onScroll={onScroll}>
          {data.value === undefined && <div data-part="group" aria-hidden="true"><Skeleton lines={3} /></div>}
          {days.value.map(g => (
            <div key={g.day} role="none">
              <div data-part="group" aria-hidden="true">{g.day}</div>
              {g.rows.map(n => <Row key={n.id} n={n} at={shown.value.indexOf(n) + 1} size={shown.value.length} leaving={leaving.value.includes(n.id)} stop={stop.value === n.id} onKey={onRowKey} onPress={pressRow} onFocus={() => (focused.value = n.id)} onDismiss={dismiss} onAction={(x: Note, a: string) => onAction?.(x, a)} />)}
            </div>
          ))}
        </div>
        {data.value !== undefined && shown.value.length === 0 && <div data-scope="empty-state"><p data-part="title">You're all caught up</p><p data-part="description">New mentions, invites and approvals show up here.</p></div>}
      </div>
      <div data-part="footer">
        <span>{sync.value}</span>
        {page.value && <a href={page.value} data-scope="link">View all</a>}
      </div>
    </section>
  )
}

function Row({ n, at, size, leaving, stop, onKey, onPress, onFocus, onDismiss, onAction }: any) {
  const icon = derived(() => KIND[n.kind as NoteKind] ?? KIND.system)
  const name = derived(() => label(n))
  const glyph = derived(() => icon.value[0])
  return (
    <article
      data-scope="notification"
      data-sweep=""
      data-phase="idle"
      data-id={n.id}
      data-read={n.read ? '' : undefined}
      data-state={leaving ? 'dismissed' : undefined}
      tabindex={stop ? '0' : '-1'}
      data-initial={stop ? '' : undefined}
      aria-label={name.value}
      aria-posinset={at}
      aria-setsize={size}
      onKeyDown={(e: KeyboardEvent) => onKey(e, n)}
      onClick={(e: MouseEvent) => onPress(e, n)}
      onFocusIn={onFocus}
    >
      <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
      <span data-part="icon">
        <Avatar name={n.actor} style={avatarTint(n.actor)} />
        <span data-part="kind" data-tone={icon.value[1]}><G name={glyph.value} /></span>
      </span>
      <p data-part="text"><b>{n.actor}</b> {n.verb}{n.object ? ' ' : ''}{n.object && <b>{n.object}</b>}{n.detail ? ` ${n.detail}` : ''}</p>
      <span data-part="unread" aria-hidden="true"></span>
      {n.quote && <div data-part="quote">{n.quote}</div>}
      <span data-part="meta">{n.time}{n.source ? ` · ${n.source}` : ''}</span>
      <Button emphasis="ghost" tone="neutral" size="sm" data-icon-only="" data-part="dismiss" aria-label={`Dismiss: ${n.actor} ${n.verb}`} tabindex="-1" onClick={(e: MouseEvent) => { e.stopPropagation(); onDismiss(n, (e.currentTarget as HTMLElement).closest('article')) }}><G name="x" /></Button>
      {n.actions?.length ? (
        <div data-part="actions">
          {n.actions.map((a: NoteAction) => <Button key={a.id} size="sm" emphasis={a.emphasis ?? 'solid'} tone={a.emphasis === 'outline' ? 'neutral' : undefined} onClick={() => onAction(n, a.id)}>{a.label}</Button>)}
        </div>
      ) : null}
    </article>
  )
}
