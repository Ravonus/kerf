import { CalendarIcon } from '@kerf-js/veneer-icons'
import {
  daysIn,
  fmt,
  isoOf,
  isUnavailable,
  readDate,
  toIso,
  type ChangeReason,
  type IsoDate,
  type SegmentPart,
} from '@kerf-js/veneer-core'
import { derived, state, untrack } from '@kerf-js/core'
import { Button } from './Button'
import { CalendarGrid } from './Calendar'
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

/** Props for DateField. */
export type DateFieldProps = RichFieldProps &
  Bindable<IsoDate | null> &
  Openable & {
    min?: IsoDate | undefined
    max?: IsoDate | undefined
    isDateUnavailable?: ((d: IsoDate) => boolean) | undefined
    /** The day each calendar row starts on, 0 for Sunday to 6. The locale's otherwise. */
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined
    /** Shows the week number at the start of each calendar row. */
    weekNumbers?: boolean | undefined
    parse?: ((text: string, today: IsoDate) => IsoDate | null) | undefined
  }

function singleDateController(p: DateFieldProps) {
  const env = usePickerEnv(
    () => p.locale,
    () => p.today,
  )
  const v = bindable<IsoDate | null>(
    () => p.value,
    () => p.defaultValue,
    null,
    () => p.onValueChange,
  )
  const pop = useOpen(
    () => p.open,
    () => p.defaultOpen,
    () => p.onOpenChange,
  )
  const own = state<string | null>(null)
  const started = state(false)
  const clears = state(0)
  const t = derived(() => messages(env.locale.value))
  const ctx = () => ({
    mode: 'single' as const,
    value: v.value,
    today: env.today.value,
    locale: env.locale.value,
    min: p.min,
    max: p.max,
    isDateUnavailable: p.isDateUnavailable,
  })
  const onEdit = (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty'
    own.value = null
    const take = (iso: IsoDate | null) => {
      if (iso !== untrack(() => v.value)) v.set(iso, 'keyboard')
    }
    if (st !== 'complete') return take(null)
    const d = readDate(parts)
    if (d.day! > daysIn(d.year!, d.month!)) {
      own.value = `${fmt(toIso(d.year!, d.month!, 1), { month: 'long', year: 'numeric' }, env.locale.value)} has ${daysIn(d.year!, d.month!)} days.`
      return take(null)
    }
    const iso = isoOf(d)
    if (isUnavailable(iso, ctx())) {
      own.value = `${fmt(iso, { dateStyle: 'medium' }, env.locale.value)} is ${t.value.unavailable}.`
      return take(null)
    }
    take(iso)
  }
  const choose = (iso: IsoDate | null, reason: ChangeReason) => {
    own.value = null
    v.set(iso, reason)
    pop.set(false)
    if (iso === null) {
      clears.value++
      started.value = false
    }
  }
  return { env, v, pop, own, started, clears, t, onEdit, choose }
}

function SingleDatePanel({
  field,
  trigger,
  presentation,
  min,
  max,
  isDateUnavailable,
  firstDayOfWeek,
  weekNumbers,
}: {
  field: ReturnType<typeof singleDateController>
  trigger: () => HTMLElement
  presentation: DateFieldProps['presentation']
  min: DateFieldProps['min']
  max: DateFieldProps['max']
  isDateUnavailable: DateFieldProps['isDateUnavailable']
  firstDayOfWeek: DateFieldProps['firstDayOfWeek']
  weekNumbers: DateFieldProps['weekNumbers']
}) {
  const { env, v, pop, t, choose } = field
  return (
    <Panel label={t.value.choose} open={pop} trigger={trigger} presentation={presentation}>
      {() => (
        <CalendarGrid
          mode="single"
          value={() => v.value}
          locale={env.locale.value}
          today={env.today.value}
          min={min}
          max={max}
          isDateUnavailable={isDateUnavailable}
          firstDayOfWeek={firstDayOfWeek}
          weekNumbers={weekNumbers}
          autofocus
          onPick={choose}
        >
          <div data-part="foot">
            <Button
              emphasis="ghost"
              size="sm"
              onClick={() => choose(env.today.value as IsoDate, 'pointer')}
            >
              {t.value.todayBtn}
            </Button>
            <Button emphasis="ghost" size="sm" onClick={() => choose(null, 'pointer')}>
              {t.value.clear}
            </Button>
          </div>
        </CalendarGrid>
      )}
    </Panel>
  )
}

function SingleDateControl({
  field,
  required,
  disabled,
  readonly,
  name,
  setTrigger,
}: {
  field: ReturnType<typeof singleDateController>
  required: DateFieldProps['required']
  disabled: DateFieldProps['disabled']
  readonly: DateFieldProps['readonly']
  name: DateFieldProps['name']
  setTrigger: (node: HTMLButtonElement) => void
}) {
  const { env, v, pop, own, clears, t, onEdit } = field
  return (
    <>
      <Segments
        required={required}
        kind="date"
        locale={env.locale.value}
        value={v.value}
        today={env.today.value}
        clears={clears.value}
        disabled={disabled}
        readonly={readonly}
        onEdit={onEdit}
        onBlurPartial={() => (own.value = 'Enter a complete date, or pick one from the calendar.')}
      />
      <Trigger
        ref={setTrigger}
        icon={CalendarIcon}
        label={
          t.value.choose +
          (v.value ? `, ${fmt(v.value, { dateStyle: 'full' }, env.locale.value)}` : '')
        }
        open={pop.value}
        disabled={disabled}
        onToggle={() => pop.set(!pop.value)}
      />
      <Hidden name={name} value={() => v.value ?? ''} />
    </>
  )
}

/**
 * DateField (04 §2): segments in the field shell and a calendar in the popover (a sheet on phones), Today and Clear in
 * the foot. `onValueChange` fires only with a complete, valid date or null; a half-typed date stays in the segments
 * and `error` explains it on blur. The shell's `error` prop, when given, wins.
 */
export function DateField(p: DateFieldProps) {
  const {
    value: _value,
    defaultValue: _defaultValue,
    onValueChange: _onValueChange,
    open: _open,
    defaultOpen: _defaultOpen,
    onOpenChange: _onOpenChange,
    min,
    max,
    isDateUnavailable,
    firstDayOfWeek,
    weekNumbers,
    parse: _parse,
    locale: _locale,
    today: _today,
    name,
    presentation,
    label,
    hint,
    error,
    disabled,
    readonly,
    ...rest
  } = p
  const field = singleDateController(untrack(() => p))
  const { v, pop, own, started } = field
  let trigger: HTMLButtonElement | undefined
  return (
    <Composite
      {...rest}
      label={label}
      hint={hint}
      error={error ?? own.value ?? undefined}
      disabled={disabled}
      readonly={readonly}
      bound={v}
      onReset={() => {
        own.value = null
        started.value = false
      }}
      filled={v.value !== null || started.value}
      hold={pop.value}
      attrs={{
        onClick: (e: MouseEvent) => {
          if (
            !disabled &&
            isSheet(e.currentTarget as Element, presentation) &&
            (e.target as Element).closest?.('[data-part="segment"]')
          )
            pop.set(true)
        },
      }}
      control={() => (
        <SingleDateControl
          field={field}
          required={rest.required}
          disabled={disabled}
          readonly={readonly}
          name={name}
          setTrigger={(n) => (trigger = n)}
        />
      )}
      end={
        <SingleDatePanel
          field={field}
          trigger={() => trigger!}
          presentation={presentation}
          min={min}
          max={max}
          isDateUnavailable={isDateUnavailable}
          firstDayOfWeek={firstDayOfWeek}
          weekNumbers={weekNumbers}
        />
      }
    />
  )
}

export {
  DateRangeField,
  compareRange,
  type DateRangeFieldProps,
  type RangeCompare,
} from './DateField-range'
