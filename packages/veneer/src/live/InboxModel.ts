import { filterNotes, groupByDay, uid, unreadCount, type InboxTab } from '@kerf/veneer-core'
import { derived, state, untrack } from '@kerf/core'
import type { LiveState } from '../parts'
import { val } from './shared'
import { inboxGestures } from './InboxGestures'
import { inboxHandlers } from './InboxHandlers'
import type { InboxProps, Note } from './Inbox'

export type InboxInputs = InboxProps

export function inboxModel(p: () => InboxInputs) {
  const id = uid('inbox')
  const tab = state<InboxTab>(
    untrack(() =>
      p().tabs === undefined ? ['all', 'unread', 'mentions'] : p().tabs!,
    )[0]! as InboxTab,
  )
  const data = derived(() => val<Note[] | undefined>(p().items))
  const all = derived(() => data.value ?? [])
  const leaving = state<string[]>([])
  const fresh = state(0)
  const focused = state<string | undefined>(undefined)
  const shown = derived(() => filterNotes(all.value, tab.value))
  const unread = derived(() => unreadCount(all.value))
  const days = derived(() => groupByDay(shown.value))
  const stop = derived(() =>
    shown.value.some((n) => n.id === focused.value) ? focused.value : shown.value[0]?.id,
  )
  const tabId = (t: InboxTab) => `${id}-tab-${t}`
  let list: HTMLDivElement | undefined
  let tablist: HTMLDivElement | undefined
  let root: HTMLElement | undefined
  const doc = () => root!.ownerDocument

  inboxGestures({ p, tab, all, fresh, tablist: () => tablist, list: () => list })

  const { pick, onTabKey, dismiss, readAll, onRowKey, pressRow, toTop, onScroll } = inboxHandlers({
    p,
    tab,
    fresh,
    leaving,
    list: () => list,
    tablist: () => tablist,
    doc,
  })
  const sync = derived(() => {
    const q = val<number>(p().queued === undefined ? 0 : p().queued!)
    if (q) return `${q} update${q > 1 ? 's' : ''} waiting to sync`
    return (val<LiveState | undefined>(p().live) ?? 'live') === 'connecting'
      ? 'Connecting…'
      : 'Up to date'
  })
  const page = derived(() => p().viewAll)

  return {
    id,
    tab,
    data,
    leaving,
    fresh,
    focused,
    shown,
    unread,
    days,
    stop,
    tabId,
    pick,
    onTabKey,
    dismiss,
    readAll,
    onRowKey,
    pressRow,
    toTop,
    onScroll,
    sync,
    page,
    setList: (n: HTMLDivElement) => (list = n),
    setTablist: (n: HTMLDivElement) => (tablist = n),
    setRoot: (n: HTMLElement) => (root = n),
  }
}
