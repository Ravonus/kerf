import { CalendarIcon, ClockIcon } from '@weft-js/warp-icons'
import { daysIn, dayPeriods, fieldName, fmt, fmtTime, fromMinutes, hour12, isoOf, listKey, minutes, pad, readDate, readTime, uid, wallTimeIssue, type ChangeReason, type IsoDate, type IsoDateTime, type IsoTime, type SegmentPart, type TimeZoneId } from '@weft-js/warp-core'
import { derived, flush, onMount, state, untrack } from '@weft-js/core'
import { CalendarGrid } from './Calendar'
import { Composite, Hidden, isSheet, messages, Panel, Trigger, bindable, useOpen, usePickerEnv, type Bindable, type Openable, type RichFieldProps } from './Picker'
import { Segments, type SegmentState } from './Segments'
import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/datetime.css'

/** The slot list (04 TimeField): a listbox with an active option, not a row of tab stops. */
function Slots({ slots, selected, locale, hourCycle, label, onPick, meta }: { slots: string[]; selected: string | null; locale: string; hourCycle?: string; label: string; onPick: (t: string, r: ChangeReason) => void; meta?: boolean }) {
  const id = uid('slots')
  const near = () => Math.max(0, slots.findIndex(x => x >= (untrack(() => selected) ?? '09:00')))
  const active = state(untrack(near))
  let list: HTMLUListElement | undefined
  const show = (block: ScrollLogicalPosition) => list?.querySelector<HTMLElement>('[data-active]')?.scrollIntoView?.({ block })
  const onKey = (e: KeyboardEvent) => {
    const m = listKey(e.key, active.value, slots.length)
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return onPick(slots[active.value], 'keyboard')
    active.value = m.to
    flush()
    show('nearest')
  }
  onMount(() => show('center'))
  return (
    <ul ref={(n: any) => (list = n)} data-part="listbox" role="listbox" tabindex="0" data-initial="" aria-label={label} aria-activedescendant={`${id}-${active.value}`} onKeyDown={onKey}>
      {slots.map((x, n) => <Slot key={x} id={`${id}-${n}`} time={x} text={fmtTime(x, locale, hourCycle)} selected={x === selected} active={n === active.value} meta={meta} onPick={onPick} />)}
    </ul>
  )
}
const Slot = ({ id, time, text, selected, active, meta, onPick }: { id: string; time: string; text: string; selected: boolean; active: boolean; meta?: boolean; onPick: (t: string, r: ChangeReason) => void }) => (
  <li role="option" id={id} aria-selected={selected ? 'true' : 'false'} data-active={active ? '' : undefined} onClick={() => onPick(time, 'pointer')}>{text}{meta && <span data-part="opt-meta">{time}</span>}</li>
)

/** The wheel sheet of a phone (04 §1.2): scroll-snap columns; arrows and presses work too. */
function Wheels({ value, locale, hourCycle, onChange }: { value: string | null; locale: string; hourCycle?: 'h12' | 'h23' | 'auto'; onChange: (t: IsoTime) => void }) {
  const h12 = untrack(() => hour12(locale, hourCycle))
  const start = untrack(() => value) ?? '09:30'
  const h0 = +start.slice(0, 2), m0 = Math.round(+start.slice(3, 5) / 5) * 5 % 60
  const periods = untrack(() => dayPeriods(locale))
  const cols = [
    { key: 'hour', name: untrack(() => fieldName('hour', locale)), vals: h12 ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i), cur: state(h12 ? h0 % 12 || 12 : h0), show: (v: number) => (h12 ? String(v) : pad(v)) },
    { key: 'minute', name: untrack(() => fieldName('minute', locale)), vals: Array.from({ length: 12 }, (_, i) => i * 5), cur: state(m0), show: (v: number) => pad(v) },
    ...(h12 ? [{ key: 'dayPeriod', name: untrack(() => fieldName('dayPeriod', locale)), vals: [0, 1], cur: state(h0 >= 12 ? 1 : 0), show: (v: number) => periods[v] }] : []),
  ]
  const commit = () => {
    let h = cols[0].cur.value
    if (h12) h = h % 12 + (cols[2].cur.value ? 12 : 0)
    onChange(`${pad(h)}:${pad(cols[1].cur.value)}` as IsoTime)
  }
  return (
    <div data-scope="wheels">
      {cols.map(c => {
        let list: HTMLUListElement | undefined
        let timer: ReturnType<typeof setTimeout> | undefined
        const row = () => (list!.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height || 40
        const select = (i: number, smooth: boolean) => {
          i = Math.max(0, Math.min(c.vals.length - 1, i))
          c.cur.value = c.vals[i]
          list?.scrollTo?.({ top: i * row(), behavior: smooth ? 'smooth' : 'instant' as ScrollBehavior })
          commit()
        }
        onMount(() => list?.scrollTo?.({ top: c.vals.indexOf(c.cur.value) * row(), behavior: 'instant' as ScrollBehavior }))
        const onScroll = () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            const i = Math.round(list!.scrollTop / row())
            if (c.vals[i] !== undefined && c.vals[i] !== c.cur.value) { c.cur.value = c.vals[i]; commit() }
          }, 90)
        }
        const onKey = (e: KeyboardEvent) => {
          const d = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
          if (!d) return
          e.preventDefault()
          select(c.vals.indexOf(c.cur.value) + d, true)
        }
        return (
          <ul key={c.key} ref={(n: any) => (list = n)} role="listbox" tabindex="0" aria-label={c.name} onScroll={onScroll} onKeyDown={onKey}>
            {c.vals.map(v => <li key={v} role="option" aria-selected={c.cur.value === v ? 'true' : 'false'} onClick={() => select(c.vals.indexOf(v), true)}>{c.show(v)}</li>)}
          </ul>
        )
      })}
    </div>
  )
}

export const stepSlots = (step: number, min?: string, max?: string) => {
  const from = min ? minutes(min) : 0, to = max ? minutes(max) : 1439
  const out: string[] = []
  for (let m = from; m <= to; m += step) out.push(fromMinutes(m))
  return out
}

export type TimeFieldProps = RichFieldProps & Bindable<IsoTime | null> & Openable & {
  hourCycle?: 'h12' | 'h23' | 'auto'
  step?: number
  seconds?: boolean
  min?: IsoTime
  max?: IsoTime
  slots?: IsoTime[]
  /** Only for the DST hint. */
  date?: IsoDate
  timeZone?: TimeZoneId
}

/**
 * TimeField (04 §2): segments in the locale's order and cycle; the trigger opens a slot list (wheels in a phone
 * sheet). With `date` and `timeZone`, a wall time that doesn't exist or happens twice gets a hint, and a missing one
 * resolves with `disambiguation: "compatible"`.
 */
export function TimeField({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, hourCycle, step = 15, seconds, min, max, slots, date, timeZone, locale, today, name, presentation, label, hint, error, disabled, readonly, ...rest }: TimeFieldProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<IsoTime | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
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
    return issue.kind === 'gap' ? `${at} doesn't exist on ${day} in ${city}; using ${fmtTime(issue.resolved, env.locale.value, hourCycle)}.` : `${at} happens twice on ${day} in ${city}; using the first.`
  })
  const onEdit = (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty'
    if (st === 'empty') return v.set(null, 'keyboard')
    if (st === 'complete') { const x = readTime(parts); if (x) v.set(x, 'keyboard') }
  }
  const open_ = () => { sheet.value = isSheet(trigger!, presentation); pop.set(true) }
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
          <Segments required={rest.required} kind="time" options={{ hourCycle, seconds }} locale={env.locale.value} value={v.value} today={env.today.value} disabled={disabled} readonly={readonly} onEdit={onEdit} />
          <Trigger el={(n: HTMLButtonElement) => (trigger = n)} icon={ClockIcon} label={t.value.chooseTime + (v.value ? `, ${fmtTime(v.value, env.locale.value, hourCycle)}` : '')} open={pop.value} disabled={disabled} onToggle={() => (pop.value ? pop.set(false) : open_())} />
          <Hidden name={name} value={() => v.value ?? ''} />
        </>
      )}
      end={
        <Panel label={t.value.chooseTime} open={pop} trigger={() => trigger!} presentation={presentation} align="end">
          {() => (sheet.value
            ? <Wheels value={v.value} locale={env.locale.value} hourCycle={hourCycle} onChange={x => v.set(x, 'pointer')} />
            : <Slots slots={options.value} selected={v.value} locale={env.locale.value} hourCycle={hourCycle} label={t.value.chooseTime} meta onPick={(x, r) => { v.set(x as IsoTime, r); pop.set(false) }} />)}
        </Panel>
      }
    />
  )
}

export type DateTimeFieldProps = RichFieldProps & Bindable<IsoDateTime | null> & Openable & {
  min?: IsoDate
  max?: IsoDate
  isDateUnavailable?: (d: IsoDate) => boolean
  firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  step?: number
}

/**
 * DateTimeField (04 §2): a date group and a time group in one control and one popover, calendar beside the slot list.
 * The value is a wall time with no zone; the hint spells it out in full.
 */
export function DateTimeField({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, min, max, isDateUnavailable, firstDayOfWeek, step = 30, locale, today, name, presentation, label, hint, error, disabled, readonly, ...rest }: DateTimeFieldProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<IsoDateTime | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const date = state<string | null>(untrack(() => v.value?.slice(0, 10) ?? null))
  const time = state<string | null>(untrack(() => v.value?.slice(11) ?? null))
  let trigger: HTMLButtonElement | undefined
  const emit = (r: ChangeReason) => v.set(date.value && time.value ? `${date.value}T${time.value}` as IsoDateTime : null, r)
  const said = derived(() => (v.value ? `${fmt(v.value, { dateStyle: 'full', timeStyle: 'short' }, env.locale.value)} · wall clock, no zone` : hint))
  const onDate = (st: SegmentState, parts: SegmentPart[]) => {
    const d = readDate(parts)
    date.value = st === 'complete' && d.day! <= daysIn(d.year!, d.month!) ? isoOf(d) : null
    emit('keyboard')
  }
  const onTime = (st: SegmentState, parts: SegmentPart[]) => { time.value = st === 'complete' ? readTime(parts) : null; emit('keyboard') }
  return (
    <Composite
      {...rest}
      label={label}
      hint={said.value}
      error={error}
      disabled={disabled}
      readonly={readonly}
      bound={v}
      onReset={() => { date.value = v.value?.slice(0, 10) ?? null; time.value = v.value?.slice(11) ?? null }}
      filled={!!(date.value || time.value)}
      hold={pop.value}
      control={() => (
        <>
          <Segments required={rest.required} kind="date" label="Date" locale={env.locale.value} value={date.value} today={env.today.value} disabled={disabled} readonly={readonly} onEdit={onDate} />
          <span data-part="literal" class="dt-sep" aria-hidden="true">·</span>
          <Segments required={rest.required} kind="time" label="Time" locale={env.locale.value} value={time.value} today={env.today.value} disabled={disabled} readonly={readonly} onEdit={onTime} />
          <Trigger el={(n: HTMLButtonElement) => (trigger = n)} icon={CalendarIcon} label="Choose date and time" open={pop.value} disabled={disabled} onToggle={() => pop.set(!pop.value)} />
          <Hidden name={name} value={() => v.value ?? ''} />
        </>
      )}
      end={
        <Panel label="Choose date and time" open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => (
            <div class="dt-pop">
              <CalendarGrid mode="single" value={() => date.value as IsoDate | null} locale={env.locale.value} today={env.today.value} min={min} max={max} isDateUnavailable={isDateUnavailable} firstDayOfWeek={firstDayOfWeek} autofocus onPick={(iso, r) => { date.value = iso; emit(r) }} />
              <div class="dt-side">
                <p class="dt-cap">Time</p>
                <Slots slots={stepSlots(step)} selected={time.value} locale={env.locale.value} label="Time" onPick={(x, r) => { time.value = x; emit(r); pop.set(false) }} />
              </div>
            </div>
          )}
        </Panel>
      }
    />
  )
}

