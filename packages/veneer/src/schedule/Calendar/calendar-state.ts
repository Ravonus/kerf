import { clock, clockRange, eventName, type CalEvent } from '@kerf/veneer-core'
import type { CalendarProps } from '../Calendar'
import { useBase, useEvents, useFocus, useDialogs } from './state-base'
import { useChange, useEditing, useDrag } from './state-actions'
import { useKeys } from './state-keys'

export function useCalendar(p: CalendarProps) {
  const base = useBase(p)
  const events = useEvents(base)
  const focus = useFocus({ ...base, ...events })
  const dialogs = useDialogs()
  const context = { ...base, ...events, ...focus, ...dialogs }
  const actions = useChange(context)
  const editing = useEditing(context)
  const dragOpts = useDrag(context, actions, editing)
  const eventKeys = useKeys(context, actions, editing)
  const { env } = base
  return {
    ...context,
    ...actions,
    ...editing,
    dragOpts,
    eventKeys,
    time: (m: number) => clock(m, env.locale.value, p.hourCycle),
    span: (a: number, b: number) => clockRange(a, b, env.locale.value, p.hourCycle),
    name: (e: CalEvent) => eventName(e, env.locale.value, p.hourCycle),
  }
}

export type Ctx = ReturnType<typeof useCalendar>
