import {
  announce,
  fmt,
  hhmm,
  timeOptions,
  uid,
  type IsoDate,
  type Override,
  type Range,
  type WeekDay,
} from '@kerf-js/veneer-core'
import { derived, flush, state, untrack } from '@kerf-js/core'
import { usePickerEnv } from '../Picker'
import { weekActions, overrideActions, saveAction } from './AvailabilityEditor-actions'
import { availabilityView } from './AvailabilityEditor-view'
import '@kerf-js/veneer-core/styles/app/availability.css'

/** A person's bookable hours: the usual week and its exceptions. */
export type Availability = { week: WeekDay[]; overrides: Override[] }
/** Props for AvailabilityEditor. */
export type AvailabilityEditorProps = {
  defaultValue: Availability
  /** "New York (EDT)". */
  zoneLabel?: string | undefined
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  locale?: string | undefined
  /** Times on offer, minutes. */
  from?: number | undefined
  to?: number | undefined
  step?: number | undefined
  /** Rejecting says so and keeps the changes. */
  onSave: (v: Availability) => void | Promise<unknown>
}

const optionsOf = (from?: number, to?: number, step?: number) =>
  timeOptions(from, to, step).map((m) => ({ value: String(m), label: hhmm(m) }))

/**
 * AvailabilityEditor (07 §6.4): a Switch and From/To ranges per weekday, "Copy Monday to weekdays", date overrides. Ranges
 * validate on change; Save stays blocked with focus on the first invalid time. Saves nothing until Save.
 */
export function AvailabilityEditor(p: AvailabilityEditorProps) {
  const id = uid('avail')
  const env = usePickerEnv(
    () => p.locale,
    () => p.today,
  )
  const seed = untrack(() => p.defaultValue)
  const week = state<WeekDay[]>(
    seed.week.map((d) => ({ ...d, ranges: d.ranges.map((r) => [...r] as Range) })),
  )
  const overrides = state<Override[]>(seed.overrides.map((o) => ({ ...o })))
  const status = state('No unsaved changes')
  const busy = state(false)
  const adding = state(false)
  const newDate = state<IsoDate | null>(null)
  const newNote = state('')
  const off = state(true)
  const newFrom = state('540')
  const newTo = state('780')
  const options = derived(() => optionsOf(p.from, p.to, p.step))
  const dayName = (d: number) =>
    fmt(`2024-01-${String(7 + d).padStart(2, '0')}`, { weekday: 'long' }, env.locale.value)
  let root: HTMLDivElement | undefined
  let saveBtn: HTMLElement | undefined
  const say = (t: string, loud = false) => root && announce(root.ownerDocument, t, loud)
  const dirty = () => (status.value = 'Unsaved changes')
  const focus = (sel: string) => {
    flush()
    root?.querySelector<HTMLElement>(sel)?.focus()
  }
  const actionContext = {
    p: untrack(() => p),
    week,
    overrides,
    status,
    busy,
    adding,
    newDate,
    newNote,
    off,
    newFrom,
    newTo,
    env,
    dayName,
    say,
    dirty,
    focus,
    getRoot: () => root,
    getSaveBtn: () => saveBtn,
  }
  const { patch, setTime, addRange, removeRange, copyMonday } = weekActions(actionContext)
  const { addOverride, removeOverride } = overrideActions(actionContext)
  const save = saveAction(actionContext)
  const view = {
    ...actionContext,
    env,
    id,
    options,
    patch,
    setTime,
    addRange,
    removeRange,
    copyMonday,
    addOverride,
    removeOverride,
    save,
    setSaveBtn: (n: HTMLElement) => (saveBtn = n),
    setRoot: (n: HTMLDivElement) => (root = n),
  }
  return availabilityView(view)
}
