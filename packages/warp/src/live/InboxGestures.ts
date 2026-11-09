import { arrivals, feed, indicator, readOnView, type InboxTab } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import type { Note } from './Inbox'
import type { InboxInputs } from './InboxModel'

export function inboxGestures({
  p,
  tab,
  all,
  fresh,
  tablist,
  list,
}: {
  p: () => InboxInputs
  tab: State<InboxTab>
  all: { readonly value: Note[] }
  fresh: State<number>
  tablist: () => HTMLDivElement | undefined
  list: () => HTMLDivElement | undefined
}) {
  use(indicator, tablist, () => ({
    selected: '[aria-selected="true"]',
    x: '--_ix',
    w: '--_iw',
    at: tab.value,
  }))
  use(feed, list, () => ({ items: '[data-scope="notification"]' }))
  use(readOnView, list, () => ({
    items: '[data-scope="notification"]',
    active: !!(p().open === undefined ? true : p().open),
    onRead: (rid: string) => p().onRead?.(rid),
  }))
  use(arrivals, list, () => ({
    items: '[data-scope="notification"]',
    ids: all.value.map((n) => n.id),
    onArrive: (ids: string[]) => {
      if (list() && list()!.scrollTop > 0) fresh.value += ids.length
    },
  }))
}
