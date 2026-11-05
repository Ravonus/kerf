import { addDays, longPress, swipePages, type CalEvent } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'

export function agendaGestures(
  view: () => HTMLDivElement | undefined,
  track: () => HTMLDivElement | undefined,
  date: { readonly value: string },
  go: (d: string) => void,
  byId: (id: string | undefined) => CalEvent | undefined,
  open: (e: CalEvent) => unknown,
) {
  use(swipePages, view, () => ({ track, onStep: (d: 1 | -1) => go(addDays(date.value, d)) }))
  use(longPress, view, () => ({
    selector: '[data-part="row"][data-id]',
    onPress: (r: HTMLElement) => {
      const e = byId(r.dataset.id)
      if (e) open(e)
    },
  }))
}
