import { derived, flush, state, untrack, watch } from '@kerf/core'
import {
  announce,
  countByDay,
  shownIn,
  slotTimes,
  weekStart,
  zoneCity,
  type CalEvent,
  type CalView,
  type DragPreview,
  type Slot,
} from '@kerf/veneer-core'
import { bindable, usePickerEnv } from '../../Picker'
import { useNow } from '../bits'

import type { CalendarProps, RecurrenceScope } from '../Calendar'

export function useBase(p: CalendarProps) {
  const env = usePickerEnv(
    () => p.locale,
    () => p.today,
  )
  const view = bindable<CalView>(
    () => p.view,
    () => p.defaultView,
    'week',
    () => p.onViewChange,
  )
  const date = bindable<string>(
    () => p.date,
    () => p.defaultDate,
    untrack(() => env.today.value),
    () => p.onDateChange,
  )
  const zone = bindable<string | null>(
    () => p.timeZone,
    () => null,
    null,
    () => p.onTimeZoneChange,
  )
  const tz = () => zone.value ?? undefined
  const now = useNow(() => p.now, tz)
  const first = derived(() => p.firstDayOfWeek ?? weekStart(env.locale.value))
  return { p, env, view, date, zone, tz, now, first }
}

export function useEvents({ p, tz }: ReturnType<typeof useBase>) {
  const off = state<number[]>([])
  const overlay = state<Record<string, Slot>>({})
  const waiting = new Set<string>()
  const drag = state<DragPreview | null>(null)
  const moving = state<{ id: string; origin: Slot; slot: Slot } | null>(null)
  const stop = state<string | null>(null)
  watch(
    () => p.events,
    () => {
      const keep: Record<string, Slot> = {}
      for (const id of waiting) if (overlay.value[id]) keep[id] = overlay.value[id]
      overlay.value = keep
    },
  )
  const all = derived(() =>
    p.events.map((e) => {
      const v = shownIn(e, tz()),
        o = overlay.value[e.id]
      return o ? { ...v, ...slotTimes(o), resource: o.resource ?? v.resource } : v
    }),
  )
  const visible = derived(() => all.value.filter((e) => !off.value.includes(e.cal ?? 1)))
  const preview = derived<DragPreview | null>(() => {
    const m = moving.value
    return m ? { ...m.slot, mode: 'move', id: m.id, origin: m.origin } : drag.value
  })
  const counts = derived(() => p.counts ?? countByDay(all.value))
  const raw = (id: string) => p.events.find((e) => e.id === id)
  const shown = (id: string) => all.value.find((e) => e.id === id)
  return { off, overlay, waiting, drag, moving, stop, all, visible, preview, counts, raw, shown }
}

export function useFocus({
  stop,
  zone,
  env,
  date,
}: ReturnType<typeof useBase> & ReturnType<typeof useEvents>) {
  let root: HTMLElement | undefined
  const say = (t: string, loud = false) => root && announce(root.ownerDocument, t, loud)
  const zoneLabel = derived(() => {
    const z = zone.value
    if (!z) return undefined
    const short = new Intl.DateTimeFormat(env.locale.value, { timeZone: z, timeZoneName: 'short' })
      .formatToParts(new Date(`${date.value}T12:00:00Z`))
      .find((x) => x.type === 'timeZoneName')?.value
    return `${zoneCity(z)} · ${short}`
  })
  const nodeOf = (id: string) => root?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
  const focusEvent = (id: string) => {
    stop.value = id
    flush()
    nodeOf(id)?.focus({ preventScroll: false })
  }
  return { say, zoneLabel, nodeOf, focusEvent, bindRoot: (n: HTMLElement) => (root = n) }
}

export function useDialogs() {
  const anchor = state<HTMLElement | undefined>(undefined)
  const popped = state<string | null>(null)
  const popOpen = state(false)
  const editing = state(false)
  const draft = state<{ event: CalEvent; isNew: boolean } | null>(null)
  const sheet = state(false)
  const sheetFor = state<CalEvent | null>(null)
  const doomed = state<CalEvent | null>(null)
  const askDelete = state(false)
  const scopeOpen = state(false)
  const scope = state<RecurrenceScope>('this')
  const pendingScope = state<{
    run: (s: RecurrenceScope) => void
    undo?: (() => void) | undefined
    verb: string
  } | null>(null)
  const askScope = (verb: string, run: (s: RecurrenceScope) => void, undo?: () => void) => {
    pendingScope.value = { run, undo, verb }
    scope.value = 'this'
    scopeOpen.value = true
  }
  return {
    anchor,
    popped,
    popOpen,
    editing,
    draft,
    sheet,
    sheetFor,
    doomed,
    askDelete,
    scopeOpen,
    scope,
    pendingScope,
    askScope,
  }
}
