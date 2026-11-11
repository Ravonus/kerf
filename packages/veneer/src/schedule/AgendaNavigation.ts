import { addDays, announce, eventsOn, fmt, slide } from '@kerf-js/veneer-core'
import { flush, untrack } from '@kerf-js/core'
import type { bindable, usePickerEnv } from '../Picker'
import type { AgendaProps } from './Agenda'

export function agendaNavigation(
  p: () => AgendaProps,
  date: ReturnType<typeof bindable<string>>,
  env: ReturnType<typeof usePickerEnv>,
  root: () => HTMLDivElement | undefined,
  track: () => HTMLDivElement | undefined,
) {
  const say = (t: string) => root() && announce(root()!.ownerDocument, t)
  const settle = (d: string, focus?: boolean) => {
    date.set(d)
    if (track()) {
      track()!.style.removeProperty('--_dx')
    }
    say(
      `${fmt(d, { weekday: 'long' }, env.locale.value)}, ${eventsOn(p().events, d).length} events`,
    )
    if (focus) {
      flush()
      root()?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    }
  }
  const go = (d: string, focus?: boolean) => {
    const off = untrack(() => date.value)
    if (d === off) {
      track()?.style.setProperty('--_dx', '0px')
      return
    }
    const near = addDays(off, 1) === d || addDays(off, -1) === d
    if (!track() || !near) return settle(d, focus)
    slide(track()!, `${d > off ? -100 : 100}%`, () => settle(d, focus))
  }
  return { say, settle, go }
}
