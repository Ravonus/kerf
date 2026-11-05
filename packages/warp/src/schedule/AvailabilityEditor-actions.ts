import {
  fmt,
  nextRange,
  rangeIssues,
  uid,
  weekValid,
  type IsoDate,
  type Override,
  type Range,
  type WeekDay,
} from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import type { AvailabilityEditorProps } from './AvailabilityEditor'
import { confirmSweep } from './bits'

export type AvailabilityActionsContext = {
  p: AvailabilityEditorProps
  week: State<WeekDay[]>
  overrides: State<Override[]>
  status: State<string>
  busy: State<boolean>
  adding: State<boolean>
  newDate: State<IsoDate | null>
  newNote: State<string>
  off: State<boolean>
  newFrom: State<string>
  newTo: State<string>
  env: { locale: State<string> }
  dayName: (day: number) => string
  say: (text: string, loud?: boolean) => unknown
  dirty: () => unknown
  focus: (selector: string) => void
  getRoot: () => HTMLDivElement | undefined
  getSaveBtn: () => HTMLElement | undefined
}

export function weekActions({ week, p, say, dayName, focus, dirty }: AvailabilityActionsContext) {
  const patch = (day: number, f: (d: WeekDay) => WeekDay) => {
    week.value = week.value.map((d) => (d.day === day ? f(d) : d))
    dirty()
  }
  const setTime = (day: number, at: number, side: 0 | 1, v: number) => {
    patch(day, (d) => ({
      ...d,
      ranges: d.ranges.map((r, i) => (i === at ? (side ? [r[0], v] : [v, r[1]]) : r)),
    }))
    const err = rangeIssues(week.value.find((d) => d.day === day)!.ranges)[at]
    if (err) say(`${dayName(day)}: ${err}`, true)
  }
  const addRange = (day: number) => {
    patch(day, (d) => ({ ...d, ranges: [...d.ranges, nextRange(d.ranges, p.to)] }))
    say(`Range added on ${dayName(day)}`)
    focus(`[data-day-of="${day}"] [data-part="range"]:last-child button[data-part="input"]`)
  }
  const removeRange = (day: number, at: number) => {
    patch(day, (d) => ({ ...d, ranges: d.ranges.filter((_, i) => i !== at) }))
    say(`Range removed from ${dayName(day)}`)
    focus(`[data-add="${day}"]`)
  }
  const copyMonday = () => {
    const mon = week.value.find((d) => d.day === 1)
    if (!mon) return
    week.value = week.value.map((d) =>
      d.day >= 2 && d.day <= 5
        ? { ...d, on: mon.on, ranges: mon.ranges.map((r) => [...r] as Range) }
        : d,
    )
    dirty()
    say(`${dayName(1)}'s hours copied to ${dayName(2)} through ${dayName(5)}`)
  }
  return { patch, setTime, addRange, removeRange, copyMonday }
}

export function overrideActions({
  newDate,
  newNote,
  off,
  newFrom,
  newTo,
  overrides,
  adding,
  dirty,
  say,
  env,
  focus,
}: AvailabilityActionsContext) {
  const addOverride = () => {
    if (!newDate.value) return
    const o: Override = {
      id: uid('ov'),
      date: newDate.value,
      ranges: off.value ? null : [[+newFrom.value, +newTo.value]],
      note: newNote.value || undefined,
    }
    overrides.value = [...overrides.value, o]
    adding.value = false
    newDate.value = null
    newNote.value = ''
    dirty()
    say(`Override added for ${fmt(o.date, { dateStyle: 'long' }, env.locale.value)}`)
    focus(`[data-rov="${o.id}"]`)
  }
  const removeOverride = (o: Override) => {
    overrides.value = overrides.value.filter((x) => x.id !== o.id)
    dirty()
    say(`Override for ${fmt(o.date, { dateStyle: 'long' }, env.locale.value)} removed`)
    focus('[data-add-ov]')
  }
  return { addOverride, removeOverride }
}

export function saveAction({
  p,
  week,
  overrides,
  status,
  busy,
  say,
  getRoot,
  getSaveBtn,
}: AvailabilityActionsContext) {
  const save = async () => {
    if (!weekValid(week.value)) {
      say('Fix the highlighted ranges before saving.', true)
      getRoot()
        ?.querySelector<HTMLElement>('[data-part="range"][data-invalid] button[data-part="input"]')
        ?.focus()
      return
    }
    busy.value = true
    try {
      await p.onSave({ week: week.value, overrides: overrides.value })
      status.value = 'Saved · booking pages updated'
      confirmSweep(getSaveBtn())
      say('Availability saved')
    } catch (err) {
      status.value = `Couldn't save: ${(err as Error | undefined)?.message ?? 'try again'}`
      say(status.value, true)
    } finally {
      busy.value = false
    }
  }
  return save
}
