import { addDays, fmt, uid, weekDates, weekStart, type CalEvent } from '@kerf-js/veneer-core'
import { derived, state, untrack } from '@kerf-js/core'
import { bindable, usePickerEnv } from '../Picker'
import { useNow } from './bits'
import { agendaNavigation } from './AgendaNavigation'
import { agendaKeys } from './AgendaKeys'
import { agendaGestures } from './AgendaGestures'
import { agendaCreate, agendaMoved } from './AgendaActions'
import type { AgendaProps } from './Agenda'

export function agendaModel(p: () => AgendaProps) {
  const id = uid('agenda')
  const env = usePickerEnv(
    () => p().locale,
    () => p().today,
  )
  const date = bindable<string>(
    () => p().date,
    () => p().defaultDate,
    untrack(() => env.today.value),
    () => p().onDateChange,
  )
  const now = useNow(
    () => p().now,
    () => p().timeZone,
  )
  const first = derived(() => p().firstDayOfWeek ?? weekStart(env.locale.value))
  const week = derived(() => weekDates(date.value, first.value))
  const pages = derived(() => [-1, 0, 1].map((d) => ({ day: addDays(date.value, d), at: d })))
  const month = derived(() => fmt(date.value, { month: 'long' }, env.locale.value))
  const moving = state<CalEvent | null>(null)
  const sheet = state(false)
  const lifted = state<string | null>(null)
  const draft = state<CalEvent | null>(null)
  const editing = state(false)
  let root: HTMLDivElement | undefined
  let view: HTMLDivElement | undefined
  let track: HTMLDivElement | undefined
  const { say, settle, go } = agendaNavigation(
    p,
    date,
    env,
    () => root,
    () => track,
  )
  const byId = (i: string | undefined) => p().events.find((e) => e.id === i)
  const open = (e: CalEvent) => {
    if (p().onLongPress) return p().onLongPress!(e)
    if (!p().onMove) return
    moving.value = e
    lifted.value = e.id
    sheet.value = true
  }
  agendaGestures({ view: () => view, track: () => track, date, go, byId, open })
  const { onKey, onClick, onTabs } = agendaKeys({ p, week, date, settle, byId, open })
  const create = agendaCreate(date, draft, editing)
  const moved = agendaMoved(p, env, go, say)
  return {
    id,
    env,
    date,
    now,
    first,
    week,
    pages,
    month,
    moving,
    sheet,
    lifted,
    draft,
    editing,
    go,
    onKey,
    onClick,
    onTabs,
    create,
    moved,
    setRoot: (el: HTMLDivElement) => (root = el),
    setView: (el: HTMLDivElement) => (view = el),
    setTrack: (el: HTMLDivElement) => (track = el),
  }
}
