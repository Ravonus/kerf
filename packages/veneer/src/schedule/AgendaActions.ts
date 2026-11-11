import { at, clock, fmt, uid, type CalEvent, type Slot } from '@kerf/veneer-core'
import type { State } from '@kerf/core'
import type { usePickerEnv } from '../Picker'
import type { AgendaProps } from './Agenda'

export function agendaCreate(
  date: { readonly value: string },
  draft: State<CalEvent | null>,
  editing: State<boolean>,
) {
  return () => {
    const d = date.value
    draft.value = { id: uid('new'), title: '', start: `${d}T13:00`, end: `${d}T14:00`, cal: 1 }
    editing.value = true
  }
}

export function agendaMoved(
  p: () => AgendaProps,
  env: ReturnType<typeof usePickerEnv>,
  go: (d: string) => void,
  say: (t: string) => unknown,
) {
  return (e: CalEvent, to: Slot) => {
    p().onMove?.(e, { start: at(to.date, to.s), end: at(to.date, to.e), resource: to.resource })
    go(to.date)
    say(
      `Moved ${e.title} to ${fmt(to.date, { weekday: 'long' }, env.locale.value)} ${clock(to.s, env.locale.value, p().hourCycle)}`,
    )
  }
}
