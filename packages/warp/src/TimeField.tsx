import { CalendarIcon, ClockIcon } from '@weft-js/warp-icons'
import {
  daysIn,
  fmt,
  fmtTime,
  fromMinutes,
  isoOf,
  minutes,
  readDate,
  readTime,
  wallTimeIssue,
  type ChangeReason,
  type IsoDate,
  type IsoDateTime,
  type IsoTime,
  type SegmentPart,
  type TimeZoneId,
} from '@weft-js/warp-core'
import { derived, state, untrack } from '@weft-js/core'
import { CalendarGrid } from './Calendar'
import { Slots, Wheels } from './TimeField-options'
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
import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/datetime.css'

export const stepSlots = (step: number, min?: string, max?: string) => {
  const from = min ? minutes(min) : 0,
    to = max ? minutes(max) : 1439
  const out: string[] = []
  for (let m = from; m <= to; m += step) out.push(fromMinutes(m))
  return out
}

/** Props for TimeField. */
export type TimeFieldProps = RichFieldProps &
  Bindable<IsoTime | null> &
  Openable & {
    /** `h12` shows AM and PM, `h23` a 24-hour clock, `auto` the locale's. */
    hourCycle?: 'h12' | 'h23' | 'auto' | undefined
    step?: number | undefined
    /** Adds a seconds segment. */
    seconds?: boolean | undefined
    min?: IsoTime | undefined
    max?: IsoTime | undefined
    slots?: IsoTime[] | undefined
    /** Only for the DST hint. */
    date?: IsoDate | undefined
    timeZone?: TimeZoneId | undefined
  }

/**
 * TimeField (04 §2): segments in the locale's order and cycle; the trigger opens a slot list (wheels in a phone
 * sheet). With `date` and `timeZone`, a wall time that doesn't exist or happens twice gets a hint, and a missing one
 * resolves with `disambiguation: "compatible"`.
 */
export function TimeField({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  hourCycle,
  step = 15,
  seconds,
  min,
  max,
  slots,
  date,
  timeZone,
  locale,
  today,
  name,
  presentation,
  label,
  hint,
  error,
  disabled,
  readonly,
  ...rest
}: TimeFieldProps) {
  const env = usePickerEnv(
    () => locale,
    () => today,
  )
  const v = bindable<IsoTime | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const pop = useOpen(
    () => open,
    () => defaultOpen,
    () => onOpenChange,
  )
  const started = state(false)
  const sheet = state(false)
  const t = derived(() => messages(env.locale.value))
  const options = derived(() => slots ?? stepSlots(step, min, max))
  let trigger: HTMLButtonElement | undefined
  const dst = derived(() => {
    if (!v.value || !date || !timeZone) return undefined
    const issue = wallTimeIssue(date, v.value, timeZone)
    if (!issue) return undefined
    const day = fmt(date, { month: 'short', day: 'numeric' }, env.locale.value)
    const city = timeZone.split('/').pop()!.replace(/_/g, ' ')
    const at = fmtTime(v.value, env.locale.value, hourCycle)
    return issue.kind === 'gap'
      ? `${at} doesn't exist on ${day} in ${city}; using ${fmtTime(issue.resolved, env.locale.value, hourCycle)}.`
      : `${at} happens twice on ${day} in ${city}; using the first.`
  })
  const onEdit = (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty'
    if (st === 'empty') return v.set(null, 'keyboard')
    if (st === 'complete') {
      const x = readTime(parts)
      if (x) v.set(x, 'keyboard')
    }
  }
  const open_ = () => {
    sheet.value = isSheet(trigger!, presentation)
    pop.set(true)
  }
  return (
    <Composite
      {...rest}
      label={label}
      hint={dst.value ?? hint}
      error={error}
      disabled={disabled}
      readonly={readonly}
      bound={v}
      onReset={() => (started.value = false)}
      filled={v.value !== null || started.value}
      hold={pop.value}
      control={() => (
        <>
          <Segments
            required={rest.required}
            kind="time"
            options={{ hourCycle, seconds }}
            locale={env.locale.value}
            value={v.value}
            today={env.today.value}
            disabled={disabled}
            readonly={readonly}
            onEdit={onEdit}
          />
          <Trigger
            el={(n: HTMLButtonElement) => (trigger = n)}
            icon={ClockIcon}
            label={
              t.value.chooseTime +
              (v.value ? `, ${fmtTime(v.value, env.locale.value, hourCycle)}` : '')
            }
            open={pop.value}
            disabled={disabled}
            onToggle={() => (pop.value ? pop.set(false) : open_())}
          />
          <Hidden name={name} value={() => v.value ?? ''} />
        </>
      )}
      end={
        <Panel
          label={t.value.chooseTime}
          open={pop}
          trigger={() => trigger!}
          presentation={presentation}
          align="end"
        >
          {() =>
            sheet.value ? (
              <Wheels
                value={v.value}
                locale={env.locale.value}
                hourCycle={hourCycle}
                onChange={(x) => v.set(x, 'pointer')}
              />
            ) : (
              <Slots
                slots={options.value}
                selected={v.value}
                locale={env.locale.value}
                hourCycle={hourCycle}
                label={t.value.chooseTime}
                meta
                onPick={(x, r) => {
                  v.set(x as IsoTime, r)
                  pop.set(false)
                }}
              />
            )
          }
        </Panel>
      }
    />
  )
}

/** Props for DateTimeField. */
export type DateTimeFieldProps = RichFieldProps &
  Bindable<IsoDateTime | null> &
  Openable & {
    min?: IsoDate | undefined
    max?: IsoDate | undefined
    /** Return true for a day that can't be picked: it shows struck through. */
    isDateUnavailable?: ((d: IsoDate) => boolean) | undefined
    /** The day each calendar row starts on, 0 for Sunday to 6. The locale's otherwise. */
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined
    step?: number | undefined
  }

/**
 * DateTimeField (04 §2): a date group and a time group in one control and one popover, calendar beside the slot list.
 * The value is a wall time with no zone; the hint spells it out in full.
 */
export function DateTimeField({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  min,
  max,
  isDateUnavailable,
  firstDayOfWeek,
  step = 30,
  locale,
  today,
  name,
  presentation,
  label,
  hint,
  error,
  disabled,
  readonly,
  ...rest
}: DateTimeFieldProps) {
  const env = usePickerEnv(
    () => locale,
    () => today,
  )
  const v = bindable<IsoDateTime | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const pop = useOpen(
    () => open,
    () => defaultOpen,
    () => onOpenChange,
  )
  const date = state<string | null>(untrack(() => v.value?.slice(0, 10) ?? null))
  const time = state<string | null>(untrack(() => v.value?.slice(11) ?? null))
  let trigger: HTMLButtonElement | undefined
  const emit = (r: ChangeReason) =>
    v.set(date.value && time.value ? (`${date.value}T${time.value}` as IsoDateTime) : null, r)
  const said = derived(() =>
    v.value
      ? `${fmt(v.value, { dateStyle: 'full', timeStyle: 'short' }, env.locale.value)} · wall clock, no zone`
      : hint,
  )
  const onDate = (st: SegmentState, parts: SegmentPart[]) => {
    const d = readDate(parts)
    date.value = st === 'complete' && d.day! <= daysIn(d.year!, d.month!) ? isoOf(d) : null
    emit('keyboard')
  }
  const onTime = (st: SegmentState, parts: SegmentPart[]) => {
    time.value = st === 'complete' ? readTime(parts) : null
    emit('keyboard')
  }
  return (
    <Composite
      {...rest}
      label={label}
      hint={said.value}
      error={error}
      disabled={disabled}
      readonly={readonly}
      bound={v}
      onReset={() => {
        date.value = v.value?.slice(0, 10) ?? null
        time.value = v.value?.slice(11) ?? null
      }}
      filled={!!(date.value || time.value)}
      hold={pop.value}
      control={() => (
        <>
          <Segments
            required={rest.required}
            kind="date"
            label="Date"
            locale={env.locale.value}
            value={date.value}
            today={env.today.value}
            disabled={disabled}
            readonly={readonly}
            onEdit={onDate}
          />
          <span data-part="literal" class="dt-sep" aria-hidden="true">
            ·
          </span>
          <Segments
            required={rest.required}
            kind="time"
            label="Time"
            locale={env.locale.value}
            value={time.value}
            today={env.today.value}
            disabled={disabled}
            readonly={readonly}
            onEdit={onTime}
          />
          <Trigger
            el={(n: HTMLButtonElement) => (trigger = n)}
            icon={CalendarIcon}
            label="Choose date and time"
            open={pop.value}
            disabled={disabled}
            onToggle={() => pop.set(!pop.value)}
          />
          <Hidden name={name} value={() => v.value ?? ''} />
        </>
      )}
      end={
        <Panel
          label="Choose date and time"
          open={pop}
          trigger={() => trigger!}
          presentation={presentation}
        >
          {() => (
            <div class="dt-pop">
              <CalendarGrid
                mode="single"
                value={() => date.value as IsoDate | null}
                locale={env.locale.value}
                today={env.today.value}
                min={min}
                max={max}
                isDateUnavailable={isDateUnavailable}
                firstDayOfWeek={firstDayOfWeek}
                autofocus
                onPick={(iso, r) => {
                  date.value = iso
                  emit(r)
                }}
              />
              <div class="dt-side">
                <p class="dt-cap">Time</p>
                <Slots
                  slots={stepSlots(step)}
                  selected={time.value}
                  locale={env.locale.value}
                  label="Time"
                  onPick={(x, r) => {
                    time.value = x
                    emit(r)
                    pop.set(false)
                  }}
                />
              </div>
            </div>
          )}
        </Panel>
      }
    />
  )
}
