import { addDays, longPress, swipePages, type CalEvent } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'

export function agendaGestures({
  view,
  track,
  date,
  go,
  byId,
  open,
}: {
  view: () => HTMLDivElement | undefined
  track: () => HTMLDivElement | undefined
  date: { readonly value: string }
  go: (d: string) => void
  byId: (id: string | undefined) => CalEvent | undefined
  open: (e: CalEvent) => unknown
}) {
  use(swipePages, view, () => ({ track, onStep: (d: 1 | -1) => go(addDays(date.value, d)) }))
  use(longPress, view, () => ({
    selector: '[data-part="row"][data-id]',
    onPress: (r: HTMLElement) => {
      const e = byId(r.dataset.id)
      if (e) open(e)
    },
  }))
}
