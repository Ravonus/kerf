import { announce, nextIndex, type InboxTab } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import { toast } from '../Toast'
import { sentence } from './InboxRow'
import type { Note } from './Inbox'
import type { InboxInputs } from './InboxModel'

export function inboxHandlers(
  p: () => InboxInputs,
  tab: State<InboxTab>,
  fresh: State<number>,
  leaving: State<string[]>,
  list: () => HTMLDivElement | undefined,
  tablist: () => HTMLDivElement | undefined,
  doc: () => Document,
) {
  const pick = (t: InboxTab) => {
    tab.value = t
    fresh.value = 0
  }
  const tabs = () =>
    p().tabs === undefined ? (['all', 'unread', 'mentions'] as InboxTab[]) : p().tabs!
  const onTabKey = (e: KeyboardEvent) => {
    const at = tabs().indexOf(tab.value)
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    const to = nextIndex(e.key, at, tabs().length, { rtl })
    if (to < 0) return
    e.preventDefault()
    pick(tabs()[to]!)
    tablist()!.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus()
  }
  const dismiss = (n: Note, row: HTMLElement) => {
    const rest = [...list()!.querySelectorAll<HTMLElement>('[data-scope="notification"]')].filter(
      (r) => r !== row && r.dataset.state !== 'dismissed',
    )
    const at = [...list()!.querySelectorAll('[data-scope="notification"]')].indexOf(row)
    leaving.value = [...leaving.value, n.id]
    ;(rest[at] ?? rest[at - 1])?.focus()
    setTimeout(() => {
      p().onDismiss?.(n.id)
      leaving.value = leaving.value.filter((x) => x !== n.id)
    }, 240)
    toast.show({
      title: 'Notification dismissed',
      description: sentence(n),
      action: { label: 'Undo', onClick: () => p().onRestore?.(n) },
    })
  }
  const readAll = () => {
    p().onReadAll?.()
    announce(doc(), 'All notifications marked as read')
  }
  const open1 = (n: Note) => {
    if (!n.read) p().onRead?.(n.id)
    p().onOpen?.(n)
  }
  const onRowKey = (e: KeyboardEvent, n: Note) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') {
      e.preventDefault()
      open1(n)
    }
    if (e.key === 'Delete') {
      e.preventDefault()
      dismiss(n, e.currentTarget as HTMLElement)
    }
  }
  const pressRow = (e: MouseEvent, n: Note) => {
    if (!(e.target as Element).closest?.('button, a')) open1(n)
  }
  const toTop = () => {
    list()?.scrollTo?.({ top: 0 })
    if (list()) list()!.scrollTop = 0
    fresh.value = 0
  }
  const onScroll = () => {
    if (list()!.scrollTop <= 0) fresh.value = 0
  }
  return { pick, onTabKey, dismiss, readAll, onRowKey, pressRow, toTop, onScroll }
}
