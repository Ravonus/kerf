import { derived, flush } from '@weft-js/core'
import {
  fmt,
  indicator,
  isoWeek,
  minuteOf,
  nextIndex,
  overflow,
  stepDate,
  toZone,
  ymd,
  type CalEvent,
  type CalView,
  type IsoDate,
} from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import { useWidth } from '../bits'

import type { CalendarProps, RecurrenceScope } from '../Calendar'
import type { Ctx } from './calendar-state'

export const LABEL: Record<CalView, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
  timeline: 'Timeline',
  year: 'Year',
}
const ALL: CalView[] = ['month', 'week', 'day', 'agenda', 'timeline', 'year']

export function useCalendarNav(p: CalendarProps, c: Ctx) {
  const views = derived(() => p.views ?? ALL)
  let root: HTMLDivElement | undefined
  let tabs: HTMLDivElement | undefined
  const width = useWidth(() => root)
  const tablet = derived(() => width.value > 0 && width.value < 1000)
  use(
    indicator,
    () => tabs,
    () => ({ selected: '[aria-selected="true"]', x: '--_ix', w: '--_iw', at: c.view.value }),
  )
  use(
    overflow,
    () => tabs,
    () => tabs?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null,
  )
  const title = derived(() => {
    const v = c.view.value,
      d = c.date.value,
      l = c.env.locale.value
    if (v === 'year') return ymd(d)[0].toString()
    if (v === 'day' || v === 'timeline')
      return fmt(d, { month: 'long', day: 'numeric', year: 'numeric' }, l)
    return fmt(d, { month: 'long', year: 'numeric' }, l)
  })
  const unit = derived(
    () =>
      ({ month: 'month', week: 'week', day: 'day', agenda: 'week', timeline: 'day', year: 'year' })[
        c.view.value
      ],
  )
  const week = derived(() => (c.view.value === 'week' ? `Week ${isoWeek(c.date.value).week}` : ''))
  const step = (d: number) => c.date.set(stepDate(c.view.value, c.date.value, d))
  const setView = (v: CalView) => {
    if (v !== c.view.value) {
      c.view.set(v)
      c.say(`${LABEL[v]} view`)
    }
  }
  const onTabKey = (e: KeyboardEvent) => {
    const list = views.value
    const to = nextIndex(e.key, list.indexOf(c.view.value), list.length, {
      rtl: getComputedStyle(e.currentTarget as Element).direction === 'rtl',
    })
    if (to < 0) return
    e.preventDefault()
    setView(list[to]!)
    flush()
    tabs?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }
  const createNow = () => {
    const d = c.date.value
    c.newEvent(`${d}T13:00`, `${d}T14:00`)
  }
  return {
    views,
    tablet,
    title,
    unit,
    week,
    step,
    setView,
    onTabKey,
    createNow,
    setRoot: (n: HTMLDivElement) => {
      root = n
      c.bindRoot(n)
    },
    setTabs: (n: HTMLDivElement) => (tabs = n),
  }
}

export function useCalendarActions(p: CalendarProps, c: Ctx) {
  const openDay = (iso: IsoDate) => {
    c.date.set(iso)
    c.view.set('day')
    return true
  }
  const openMonth = (iso: IsoDate) => {
    c.date.set(iso)
    c.view.set('month')
    return true
  }
  const toggle = (cal: number, on: boolean) => {
    c.off.value = on ? c.off.value.filter((x) => x !== cal) : [...c.off.value, cal]
  }
  const confirmDelete = () => {
    const e = c.doomed.value
    c.askDelete.value = false
    if (e) {
      c.p.onDelete?.(e)
      c.say(`Deleted ${e.title}`)
    }
  }
  const applyScope = () => {
    const a = c.pendingScope.value
    c.scopeOpen.value = false
    c.pendingScope.value = null
    a?.run(c.scope.value)
  }
  const dropScope = () => {
    const a = c.pendingScope.value
    c.scopeOpen.value = false
    c.pendingScope.value = null
    a?.undo?.()
  }
  const saved = (e: CalEvent) => {
    const d = c.draft.value
    if (d?.isNew) {
      p.onCreate?.(e)
      c.say(`Created ${e.title}`)
      return
    }
    const run = (s?: RecurrenceScope) => {
      p.onEdit?.(e, s)
      c.say(`Saved ${e.title}`)
    }
    if (d?.event.recurrence) {
      c.scope.value = 'this'
      c.pendingScope.value = { run, verb: 'Save' }
      c.scopeOpen.value = true
    } else run()
  }
  const zoneNow = (z: string) => {
    const n = c.now.value
    return n ? c.time(minuteOf(c.tz() ? toZone(n, c.tz()!, z) : n)) : ''
  }
  return { openDay, openMonth, toggle, confirmDelete, applyScope, dropScope, saved, zoneNow }
}
