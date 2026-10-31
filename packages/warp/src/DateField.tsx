import { addDays, daysIn, fmt, fmtRange, isoOf, isUnavailable, pickRange, readDate, toIso, daysBetween, defaultPresets, listKey, weekStart, type ChangeReason, type DateRange, type IsoDate, type RangePreset, type SegmentPart } from '@weft/ui-core'
import { derived, state, untrack } from 'weft'
import { Button } from './Button'
import { CalendarGrid } from './Calendar'
import { Composite, Hidden, isSheet, messages, Panel, Trigger, bindable, useOpen, usePickerEnv, type Bindable, type Openable, type RichFieldProps } from './Picker'
import { Segments, type SegmentState } from './Segments'

export type DateFieldProps = RichFieldProps & Bindable<IsoDate | null> & Openable & {
  min?: IsoDate
  max?: IsoDate
  isDateUnavailable?: (d: IsoDate) => boolean
  firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  weekNumbers?: boolean
  parse?: (text: string, today: IsoDate) => IsoDate | null
}

/**
 * DateField (04 §2): segments in the field shell and a calendar in the popover (a sheet on phones), Today and Clear in
 * the foot. `onValueChange` fires only with a complete, valid date or null; a half-typed date stays in the segments
 * and `error` explains it on blur. The shell's `error` prop, when given, wins.
 */
export function DateField({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, min, max, isDateUnavailable, firstDayOfWeek, weekNumbers, parse, locale, today, name, presentation, label, hint, error, disabled, readonly, ...rest }: DateFieldProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<IsoDate | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const own = state<string | null>(null)
  const started = state(false)
  const clears = state(0)
  const t = derived(() => messages(env.locale.value))
  let trigger: HTMLButtonElement | undefined
  const ctx = () => ({ mode: 'single' as const, value: v.value, today: env.today.value, locale: env.locale.value, min, max, isDateUnavailable })
  const onEdit = (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty'
    own.value = null
    const take = (iso: IsoDate | null) => { if (iso !== untrack(() => v.value)) v.set(iso, 'keyboard') }
    if (st !== 'complete') return take(null)
    const d = readDate(parts)
    if (d.day! > daysIn(d.year!, d.month!)) { own.value = `${fmt(toIso(d.year!, d.month!, 1), { month: 'long', year: 'numeric' }, env.locale.value)} has ${daysIn(d.year!, d.month!)} days.`; return take(null) }
    const iso = isoOf(d)
    if (isUnavailable(iso, ctx())) { own.value = `${fmt(iso, { dateStyle: 'medium' }, env.locale.value)} is ${t.value.unavailable}.`; return take(null) }
    take(iso)
  }
  const choose = (iso: IsoDate | null, reason: ChangeReason) => { own.value = null; v.set(iso, reason); pop.set(false); if (iso === null) { clears.value++; started.value = false } }
  return (
    <Composite
      {...rest}
      label={label}
      hint={hint}
      error={error ?? own.value ?? undefined}
      disabled={disabled}
      readonly={readonly}
      filled={v.value !== null || started.value}
      hold={pop.value}
      attrs={{ onClick: (e: MouseEvent) => { if (!disabled && isSheet(e.currentTarget as Element, presentation) && (e.target as Element).closest('[data-part="segment"]')) pop.set(true) } }}
      control={() => (
        <>
          <Segments kind="date" locale={env.locale.value} value={v.value} today={env.today.value} clears={clears.value} disabled={disabled} readonly={readonly} onEdit={onEdit} onBlurPartial={() => (own.value = 'Enter a complete date, or pick one from the calendar.')} />
          <Trigger el={(n: HTMLButtonElement) => (trigger = n)} icon="calendar" label={t.value.choose + (v.value ? `, ${fmt(v.value, { dateStyle: 'full' }, env.locale.value)}` : '')} open={pop.value} disabled={disabled} onToggle={() => pop.set(!pop.value)} />
          <Hidden name={name} value={() => v.value ?? ''} />
        </>
      )}
      end={
        <Panel label={t.value.choose} open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => (
            <CalendarGrid mode="single" value={() => v.value} locale={env.locale.value} today={env.today.value} min={min} max={max} isDateUnavailable={isDateUnavailable} firstDayOfWeek={firstDayOfWeek} weekNumbers={weekNumbers} autofocus onPick={choose}>
              <div data-part="foot">
                <Button emphasis="ghost" size="sm" onClick={() => choose(env.today.value as IsoDate, 'pointer')}>{t.value.todayBtn}</Button>
                <Button emphasis="ghost" size="sm" onClick={() => choose(null, 'pointer')}>{t.value.clear}</Button>
              </div>
            </CalendarGrid>
          )}
        </Panel>
      }
    />
  )
}

export type RangeCompare = 'previous-period' | 'previous-year' | DateRange
export type DateRangeFieldProps = RichFieldProps & Bindable<DateRange> & Openable & {
  presets?: RangePreset[] | 'default' | false
  preset?: string | null
  onPresetChange?: (id: string | null) => void
  min?: IsoDate
  max?: IsoDate
  maxDays?: number
  isDateUnavailable?: (d: IsoDate) => boolean
  months?: 1 | 2 | 'auto'
  compare?: RangeCompare | null
}

/** The comparison range of a selection, for a dashboard's "vs" (04 DateRangeField). */
export function compareRange(v: DateRange, c: RangeCompare | null | undefined): DateRange | null {
  if (!c || !v.start || !v.end) return typeof c === 'object' ? c : null
  if (typeof c === 'object') return c
  if (c === 'previous-year') return { start: `${+v.start.slice(0, 4) - 1}${v.start.slice(4)}` as IsoDate, end: `${+v.end.slice(0, 4) - 1}${v.end.slice(4)}` as IsoDate }
  const n = daysBetween(v.start, v.end) + 1
  return { start: addDays(v.start, -n), end: addDays(v.start, -1) }
}

/**
 * DateRangeField (04 §2): two segment groups and one trigger; the popover shows two months (one when narrow) beside a
 * preset rail. The chosen preset is kept apart from the frozen dates, so a dashboard's "Last 7 days" can roll forward.
 */
export function DateRangeField({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, presets = 'default', preset, onPresetChange, min, max, maxDays, isDateUnavailable, months = 'auto', compare, locale, today, name, presentation, label, hint, error, disabled, readonly, ...rest }: DateRangeFieldProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<DateRange>(() => value, () => defaultValue, { start: null, end: null }, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const chosen = state<string | null>(untrack(() => preset) ?? null)
  const jump = state<string | null>(null)
  const started = state(false)
  const narrow = state(false)
  const t = derived(() => messages(env.locale.value))
  const list = derived(() => (presets === false ? [] : presets === 'default' ? defaultPresets(env.locale.value) : presets))
  const count = derived(() => (months === 'auto' ? (narrow.value ? 1 : 2) : months))
  const compared = derived(() => compareRange(v.value, compare))
  const trouble = derived(() => {
    const r = v.value
    if (r.start && r.end && r.end < r.start) return 'The end is before the start.'
    if (r.start && r.end && maxDays && daysBetween(r.start, r.end) + 1 > maxDays) return `Choose at most ${maxDays} days.`
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
  let trigger: HTMLButtonElement | undefined
  const set = (r: DateRange, reason: ChangeReason, id: string | null = null) => {
    chosen.value = id
    onPresetChange?.(id)
    v.set(r, reason)
  }
  const edit = (which: 'start' | 'end') => (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty' || !!(which === 'start' ? v.value.end : v.value.start)
    if (st === 'empty') return set({ ...v.value, [which]: null }, 'keyboard')
    if (st !== 'complete') return
    const d = readDate(parts)
    if (d.day! <= daysIn(d.year!, d.month!)) set({ ...v.value, [which]: isoOf(d) }, 'keyboard')
  }
  const editStart = edit('start'), editEnd = edit('end')
  const applyPreset = (p: RangePreset) => {
    const r = p.range(env.today.value as IsoDate, weekStart(env.locale.value))
    set(r, 'pointer', p.id)
    jump.value = r.end
    said.value = `${p.label}: ${summary.value}`
  }
  const onRail = (e: KeyboardEvent) => {
    const opts = list.value
    const at = opts.findIndex(p => p.id === (e.target as HTMLElement).dataset.id)
    if (at < 0) return
    const step = narrow.value ? ({ ArrowRight: 'ArrowDown', ArrowLeft: 'ArrowUp' } as Record<string, string>)[e.key] ?? e.key : e.key
    const m = listKey(step, at, opts.length)
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return applyPreset(opts[at])
    ;(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${opts[m.to].id}"]`)?.focus()
  }
  const toggle = () => {
    narrow.value = isSheet(trigger!, presentation) || (trigger!.ownerDocument.defaultView?.innerWidth ?? 1024) < 640
    pop.set(!pop.value)
  }
  return (
    <Composite
      {...rest}
      label={label}
      hint={hint}
      error={error ?? trouble.value}
      disabled={disabled}
      readonly={readonly}
      filled={!!(v.value.start || v.value.end) || started.value}
      hold={pop.value}
      control={() => (
        <>
          <Segments kind="date" label="Start" locale={env.locale.value} value={v.value.start} today={env.today.value} disabled={disabled} readonly={readonly} onEdit={editStart} />
          <span data-part="range-sep" aria-hidden="true">–</span>
          <Segments kind="date" label="End" locale={env.locale.value} value={v.value.end} today={env.today.value} disabled={disabled} readonly={readonly} onEdit={editEnd} />
          <Trigger el={(n: HTMLButtonElement) => (trigger = n)} icon="calendar" label={t.value.chooseRange + (v.value.start && v.value.end ? `, ${summary.value}` : '')} open={pop.value} disabled={disabled} onToggle={toggle} />
          <Hidden name={name} value={() => (v.value.start && v.value.end ? `${v.value.start}/${v.value.end}` : '')} />
        </>
      )}
      end={
        <Panel label={t.value.chooseRange} open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => (
            <div data-scope="range-panel" data-narrow={narrow.value ? '' : undefined}>
              {list.value.length > 0 && (
                <ul role="listbox" aria-label="Presets" aria-orientation={narrow.value ? 'horizontal' : 'vertical'} onKeyDown={onRail}>
                  {list.value.map(p => <li key={p.id} role="option" data-id={p.id} tabindex={p.id === (chosen.value ?? list.value[0].id) ? '0' : '-1'} aria-selected={p.id === chosen.value ? 'true' : 'false'} onClick={() => applyPreset(p)}>{p.label}</li>)}
                </ul>
              )}
              <div>
                <CalendarGrid mode="range" months={count.value} value={() => v.value} compare={() => compared.value} goTo={() => jump.value} locale={env.locale.value} today={env.today.value} min={min} max={max} isDateUnavailable={isDateUnavailable} autofocus onPick={(iso, r) => set(pickRange(v.value, iso), r)}>
                  <div data-part="foot">
                    <span aria-live="polite">{summary.value}</span>
                    <Button emphasis="ghost" size="sm" onClick={() => set({ start: null, end: null }, 'pointer')}>{t.value.clear}</Button>
                  </div>
                </CalendarGrid>
              </div>
              <span class="sr" role="status">{said.value}</span>
            </div>
          )}
        </Panel>
      }
    />
  )
}
