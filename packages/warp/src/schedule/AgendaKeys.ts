import type { CalEvent, IsoDate } from '@weft-js/warp-core'
import type { AgendaProps } from './Agenda'

export function agendaKeys({
  p,
  week,
  date,
  settle,
  byId,
  open,
}: {
  p: () => AgendaProps
  week: { readonly value: readonly IsoDate[] }
  date: { readonly value: string }
  settle: (d: string, focus?: boolean) => void
  byId: (id: string | undefined) => CalEvent | undefined
  open: (e: CalEvent) => unknown
}) {
  const onKey = (e: KeyboardEvent) => {
    const r = (e.target as Element).closest?.<HTMLElement>('[data-part="row"][data-id]')
    if (!r) return
    const hit = byId(r.dataset.id)
    if (!hit) return
    if (e.key === 'F10' && e.shiftKey) {
      e.preventDefault()
      open(hit)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      p().onOpen ? p().onOpen!(hit) : open(hit)
    }
  }
  const onClick = (e: MouseEvent) => {
    const hit = byId(
      (e.target as Element).closest?.<HTMLElement>('[data-part="row"][data-id]')?.dataset.id,
    )
    if (hit) p().onOpen?.(hit)
  }
  const onTabs = (e: KeyboardEvent) => {
    const to = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key]
    const days = week.value
    const i = days.indexOf(date.value as IsoDate)
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      return settle(days[e.key === 'Home' ? 0 : 6]!, true)
    }
    if (!to) return
    e.preventDefault()
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    settle(days[(i + (rtl ? -to : to) + 7) % 7]!, true)
  }
  return { onKey, onClick, onTabs }
}
