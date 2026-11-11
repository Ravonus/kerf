import { CalendarIcon } from '@kerf-js/veneer-icons'
import {
  addDays,
  daysIn,
  fmt,
  fmtRange,
  isoOf,
  pickRange,
  readDate,
  daysBetween,
  defaultPresets,
  listKey,
  weekStart,
  type ChangeReason,
  type DateRange,
  type IsoDate,
  type RangePreset,
  type SegmentPart,
} from '@kerf-js/veneer-core'
import { derived, state, untrack } from '@kerf-js/core'
import { Button } from './Button'
import { CalendarGrid } from './Calendar'
import { RangeDatePresets } from './DateField-presets'
import {
  Composite,
  Hidden,
  isSheet,
  messages,
  Panel,
  Trigger,
  bindable,
  useOpen,
  usePickerEnv,
  type Bindable,
  type Openable,
  type RichFieldProps,
} from './Picker'
import { Segments, type SegmentState } from './Segments'

/** A comparison period shown beside a date range. */
export type RangeCompare = 'previous-period' | 'previous-year' | DateRange
/** Props for DateRangeField. */
export type DateRangeFieldProps = RichFieldProps &
  Bindable<DateRange> &
  Openable & {
    presets?: RangePreset[] | 'default' | false
    /** The id of the chosen preset, such as "Last 7 days". Null when the dates were picked by hand. */
    preset?: string | null
    /** Called with the preset's id when one is picked, and null when the dates are changed by hand. */
    onPresetChange?: (id: string | null) => void
    min?: IsoDate | undefined
    max?: IsoDate | undefined
    maxDays?: number
    /** Return true for a day that can't start or end the range: it shows struck through. */
    isDateUnavailable?: (d: IsoDate) => boolean
    months?: 1 | 2 | 'auto'
    compare?: RangeCompare | null | undefined
  }

/** The comparison range of a selection, for a dashboard's "vs" (04 DateRangeField). */
export function compareRange(v: DateRange, c: RangeCompare | null | undefined): DateRange | null {
  if (!c || !v.start || !v.end) return typeof c === 'object' ? c : null
  if (typeof c === 'object') return c
  if (c === 'previous-year')
    return {
      start: `${+v.start.slice(0, 4) - 1}${v.start.slice(4)}` as IsoDate,
      end: `${+v.end.slice(0, 4) - 1}${v.end.slice(4)}` as IsoDate,
    }
  const n = daysBetween(v.start, v.end) + 1
  return { start: addDays(v.start, -n), end: addDays(v.start, -1) }
}

function rangeDateState(props: DateRangeFieldProps) {
  const env = usePickerEnv(
    () => props.locale,
    () => props.today,
  )
  const v = bindable<DateRange>(
    () => props.value,
    () => props.defaultValue,
    { start: null, end: null },
    () => props.onValueChange,
  )
  const pop = useOpen(
    () => props.open,
    () => props.defaultOpen,
    () => props.onOpenChange,
  )
  const chosen = state<string | null>(untrack(() => props.preset) ?? null)
  const jump = state<string | null>(null)
  const started = state(false)
  const narrow = state(false)
  const t = derived(() => messages(env.locale.value))
  const list = derived(() => {
    const presets = props.presets === undefined ? 'default' : props.presets
    return presets === false
      ? []
      : presets === 'default'
        ? defaultPresets(env.locale.value)
        : presets
  })
  const count = derived(() => {
    const months = props.months === undefined ? 'auto' : props.months
    return months === 'auto' ? (narrow.value ? 1 : 2) : months
  })
  const compared = derived(() => compareRange(v.value, props.compare))
  const trouble = derived(() => {
    const r = v.value
    if (r.start && r.end && r.end < r.start) return 'The end is before the start.'
    if (r.start && r.end && props.maxDays && daysBetween(r.start, r.end) + 1 > props.maxDays)
      return `Choose at most ${props.maxDays} days.`
    return undefined
  })
  const human = (d: string) => fmt(d, { dateStyle: 'medium' }, env.locale.value)
  const summary = derived(() => {
    const r = v.value
    if (!r.start) return 'Pick a start date'
    if (!r.end) return 'Pick an end date'
    const n = daysBetween(r.start, r.end) + 1
    return `${r.start > r.end ? `${human(r.start)} – ${human(r.end)}` : fmtRange(r.start, r.end, env.locale.value)} · ${new Intl.NumberFormat(env.locale.value, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(n)}`
  })
  const said = state('')
  return {
    env,
    v,
    pop,
    chosen,
    jump,
    started,
    narrow,
    t,
    list,
    count,
    compared,
    trouble,
    summary,
    said,
  }
}

function rangeDateActions(
  props: DateRangeFieldProps,
  getTrigger: () => HTMLButtonElement | undefined,
  base: ReturnType<typeof rangeDateState>,
) {
  const { env, v, pop, chosen, jump, started, narrow, list, summary, said } = base
  const set = (r: DateRange, reason: ChangeReason, id: string | null = null) => {
    chosen.value = id
    props.onPresetChange?.(id)
    v.set(r, reason)
  }
  const edit = (which: 'start' | 'end') => (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty' || !!(which === 'start' ? v.value.end : v.value.start)
    if (st === 'empty') return set({ ...v.value, [which]: null }, 'keyboard')
    if (st !== 'complete') return
    const d = readDate(parts)
    if (d.day! <= daysIn(d.year!, d.month!)) set({ ...v.value, [which]: isoOf(d) }, 'keyboard')
  }
  const editStart = edit('start'),
    editEnd = edit('end')
  const applyPreset = (p: RangePreset) => {
    const r = p.range(env.today.value as IsoDate, weekStart(env.locale.value))
    set(r, 'pointer', p.id)
    jump.value = r.end
    said.value = `${p.label}: ${summary.value}`
  }
  const onRail = (e: KeyboardEvent) => {
    const opts = list.value
    const at = opts.findIndex((p) => p.id === (e.target as HTMLElement).dataset.id)
    if (at < 0) return
    const step = narrow.value
      ? (({ ArrowRight: 'ArrowDown', ArrowLeft: 'ArrowUp' } as Record<string, string>)[e.key] ??
        e.key)
      : e.key
    const m = listKey(step, at, opts.length)
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return applyPreset(opts[at]!)
    ;(e.currentTarget as HTMLElement)
      .querySelector<HTMLElement>(`[data-id="${opts[m.to]!.id}"]`)
      ?.focus()
  }
  const toggle = () => {
    narrow.value =
      isSheet(getTrigger()!, props.presentation) ||
      (getTrigger()!.ownerDocument.defaultView?.innerWidth ?? 1024) < 640
    pop.set(!pop.value)
  }
  return { set, editStart, editEnd, applyPreset, onRail, toggle }
}

function rangeDateController(
  props: DateRangeFieldProps,
  getTrigger: () => HTMLButtonElement | undefined,
) {
  const base = rangeDateState(props)
  return { ...base, ...rangeDateActions(props, getTrigger, base) }
}

function RangeDateControl({
  field,
  props,
  setTrigger,
}: {
  field: ReturnType<typeof rangeDateController>
  props: DateRangeFieldProps
  setTrigger: (node: HTMLButtonElement) => void
}) {
  const { env, v, pop, t, summary, editStart, editEnd, toggle } = field
  return (
    <>
      <Segments
        required={props.required}
        kind="date"
        label="Start"
        locale={env.locale.value}
        value={v.value.start}
        today={env.today.value}
        disabled={props.disabled}
        readonly={props.readonly}
        onEdit={editStart}
      />
      <span data-part="range-sep" aria-hidden="true">
        –
      </span>
      <Segments
        required={props.required}
        kind="date"
        label="End"
        locale={env.locale.value}
        value={v.value.end}
        today={env.today.value}
        disabled={props.disabled}
        readonly={props.readonly}
        onEdit={editEnd}
      />
      <Trigger
        ref={setTrigger}
        icon={CalendarIcon}
        label={t.value.chooseRange + (v.value.start && v.value.end ? `, ${summary.value}` : '')}
        open={pop.value}
        disabled={props.disabled}
        onToggle={toggle}
      />
      <Hidden
        name={props.name}
        value={() => (v.value.start && v.value.end ? `${v.value.start}/${v.value.end}` : '')}
      />
    </>
  )
}

function RangeDatePanel({
  field,
  props,
  trigger,
}: {
  field: ReturnType<typeof rangeDateController>
  props: DateRangeFieldProps
  trigger: () => HTMLElement
}) {
  const { env, v, pop, jump, narrow, t, list, count, compared, summary, said, set } = field
  return (
    <Panel
      label={t.value.chooseRange}
      open={pop}
      trigger={trigger}
      presentation={props.presentation}
    >
      {() => (
        <div data-scope="range-panel" data-narrow={narrow.value ? '' : undefined}>
          {list.value.length > 0 && <RangeDatePresets field={field} />}
          <div>
            <CalendarGrid
              mode="range"
              months={count.value}
              value={() => v.value}
              compare={() => compared.value}
              goTo={() => jump.value}
              locale={env.locale.value}
              today={env.today.value}
              min={props.min}
              max={props.max}
              isDateUnavailable={props.isDateUnavailable}
              autofocus
              onPick={(iso, r) => set(pickRange(v.value, iso), r)}
            >
              <div data-part="foot">
                <span aria-live="polite">{summary.value}</span>
                <Button
                  emphasis="ghost"
                  size="sm"
                  onClick={() => set({ start: null, end: null }, 'pointer')}
                >
                  {t.value.clear}
                </Button>
              </div>
            </CalendarGrid>
          </div>
          <span class="sr" role="status">
            {said.value}
          </span>
        </div>
      )}
    </Panel>
  )
}

export type RangeDateModel = ReturnType<typeof rangeDateController>

/**
 * DateRangeField (04 §2): two segment groups and one trigger; the popover shows two months (one when narrow) beside a
 * preset rail. The chosen preset is kept apart from the frozen dates, so a dashboard's "Last 7 days" can roll forward.
 */
export function DateRangeField(props: DateRangeFieldProps) {
  const {
    value: _value,
    defaultValue: _defaultValue,
    onValueChange: _onValueChange,
    open: _open,
    defaultOpen: _defaultOpen,
    onOpenChange: _onOpenChange,
    presets: _presets = 'default',
    preset,
    onPresetChange: _onPresetChange,
    min: _min,
    max: _max,
    maxDays: _maxDays,
    isDateUnavailable: _isDateUnavailable,
    months: _months = 'auto',
    compare: _compare,
    locale: _locale,
    today: _today,
    name: _name,
    presentation: _presentation,
    label,
    hint,
    error,
    disabled,
    readonly,
    ...rest
  } = props
  let trigger: HTMLButtonElement | undefined
  const field = rangeDateController(
    untrack(() => props),
    () => trigger,
  )
  const { v, pop, chosen, started, trouble } = field
  return (
    <Composite
      {...rest}
      label={label}
      hint={hint}
      error={error ?? trouble.value}
      disabled={disabled}
      readonly={readonly}
      bound={v}
      onReset={() => {
        started.value = false
        chosen.value = untrack(() => preset) ?? null
      }}
      filled={!!(v.value.start || v.value.end) || started.value}
      hold={pop.value}
      control={() => (
        <RangeDateControl field={field} props={props} setTrigger={(n) => (trigger = n)} />
      )}
      end={<RangeDatePanel field={field} props={props} trigger={() => trigger!} />}
    />
  )
}
