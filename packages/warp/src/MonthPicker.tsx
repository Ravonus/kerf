import { DownIcon, LeftIcon, RightIcon } from '@weft/icons'
import { addDays, dow, fmt, fmtRange, isoWeek, isoWeekStart, pad, toIso, weekOf, ymd, type ChangeReason, type IsoDate, type IsoMonth, type IsoWeek } from '@weft/warp-core'
import { derived, flush, state, untrack } from 'weft'
import { Button } from './Button'
import { CalendarGrid } from './Calendar'
import { bindable, Composite, Hidden, Panel, useOpen, usePickerEnv, type Bindable, type Openable, type RichFieldProps } from './Picker'
import '@weft/warp-core/styles/rich/monthgrid.css'
import '@weft/warp-core/styles/rich/gap-rows.css'

export type Cell = { v: string; text: string; name: string }

/**
 * The period grid (04 §2): a title with arrows over rows of cells, one tab stop. ←/→ ±1, ↑/↓ ± a row, PageUp/PageDown
 * a page, Enter/Space picks; cells are named in full.
 */
function PeriodGrid({ title, cells, columns, value, current, prev, next, onPage, onPick, wide }: { title: string; cells: Cell[]; columns: number; value: string | null; current: string; prev: string; next: string; onPage: (d: number) => void; onPick: (v: string, r: ChangeReason) => void; wide?: boolean }) {
  const at = state(untrack(() => value ?? current))
  let box: HTMLDivElement | undefined
  const rows = derived(() => Array.from({ length: Math.ceil(cells.length / columns) }, (_, r) => ({ k: `${cells[r * columns].v}`, cells: cells.slice(r * columns, r * columns + columns) })))
  const stop = derived(() => (cells.some(c => c.v === at.value) ? at.value : cells[0].v))
  const focus = () => { flush(); box?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus() }
  const onKey = (e: KeyboardEvent) => {
    const el = (e.target as Element).closest?.<HTMLElement>('[data-v]')
    if (!el) return
    const i = cells.findIndex(c => c.v === el.dataset.v)
    const d = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns } as Record<string, number>)[e.key]
    if (d) {
      e.preventDefault()
      if (i + d < 0) onPage(-1)
      else if (i + d >= cells.length) onPage(1)
      else at.value = cells[i + d].v
      focus()
    } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); onPage(e.key === 'PageUp' ? -1 : 1); focus() }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); at.value = cells[e.key === 'Home' ? 0 : cells.length - 1].v; focus() }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(cells[i].v, 'keyboard') }
  }
  return (
    <div ref={(n: any) => (box = n)} data-scope="monthgrid" onKeyDown={onKey}>
      <div data-part="head">
        <Button emphasis="ghost" size="sm" icon={LeftIcon} label={prev} data-icon="" onClick={() => onPage(-1)} />
        <b aria-live="polite">{title}</b>
        <Button emphasis="ghost" size="sm" icon={RightIcon} label={next} data-icon="" onClick={() => onPage(1)} />
      </div>
      <div role="grid" aria-label={title} class={wide ? 'pg' : undefined} style={wide ? `--c:${columns}` : undefined}>
        {rows.value.map(r => (
          <div key={r.k} role="row">
            {r.cells.map(c => <button key={c.v} type="button" role="gridcell" data-v={c.v} data-initial={c.v === stop.value ? '' : undefined} tabindex={c.v === stop.value ? '0' : '-1'} aria-selected={c.v === value ? 'true' : 'false'} aria-current={c.v === current ? 'date' : undefined} onClick={() => onPick(c.v, 'pointer')}><span aria-hidden="true">{c.text}</span><span class="sr">{c.name + (c.v === current ? ', this period' : '')}</span></button>)}
          </div>
        ))}
      </div>
    </div>
  )
}

const monthCells = (year: number, locale: string): Cell[] => Array.from({ length: 12 }, (_, i) => ({ v: `${year}-${pad(i + 1)}`, text: fmt(toIso(year, i + 1, 1), { month: 'short' }, locale), name: fmt(toIso(year, i + 1, 1), { month: 'long', year: 'numeric' }, locale) }))
const yearOf = (v: string | null, today: string) => +(v ?? today).slice(0, 4)

/** The `pick` button of a field whose whole control opens its panel. */
function PickButton({ el, text, label, open, disabled, onToggle }: { el: (b: HTMLButtonElement) => void; text: string; label: string; open: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button ref={(n: any) => el(n)} type="button" data-part="pick" aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} aria-label={label} disabled={disabled} onClick={onToggle}>
      <span>{text}</span><DownIcon />
    </button>
  )
}

export type MonthPickerProps = RichFieldProps & Bindable<IsoMonth | null> & Openable & { min?: IsoMonth; max?: IsoMonth }

/** MonthPicker (04 §2): a 3×4 grid of the locale's short month names with year arrows. */
export function MonthPicker({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, locale, today, name, presentation, label, disabled, ...rest }: MonthPickerProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<IsoMonth | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const year = state(yearOf(untrack(() => v.value), untrack(() => env.today.value)))
  const shown = derived(() => (v.value ? fmt(`${v.value}-01`, { month: 'long', year: 'numeric' }, env.locale.value) : ''))
  let trigger: HTMLButtonElement | undefined
  return (
    <Composite
      {...rest}
      label={label}
      disabled={disabled}
      bound={v}
      filled={!!v.value}
      hold={pop.value}
      control={() => <><PickButton el={n => (trigger = n)} text={shown.value} label={`${label}, ${shown.value || 'none'}`} open={pop.value} disabled={disabled} onToggle={() => pop.set(!pop.value)} /><Hidden name={name} value={() => v.value ?? ''} /></>}
      end={
        <Panel label="Choose a month" open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => <PeriodGrid title={String(year.value)} cells={monthCells(year.value, env.locale.value)} columns={3} value={v.value} current={env.today.value.slice(0, 7)} prev="Previous year" next="Next year" onPage={d => (year.value += d)} onPick={(x, r) => { v.set(x as IsoMonth, r); pop.set(false) }} />}
        </Panel>
      }
    />
  )
}

export type WeekPickerProps = RichFieldProps & Bindable<IsoWeek | null> & Openable & {
  /** The day each grid row starts on: `iso` (the default) starts on Monday, so a row is one ISO 8601 week; `locale` starts on the locale's first day of the week. The value is an ISO week either way. */
  numbering?: 'iso' | 'locale'
}

const weekName = (w: string, locale: string) => {
  const s = isoWeekStart(w)
  return `Week ${+w.slice(6)}, ${fmtRange(s, addDays(s, 6), locale, { month: 'long', day: 'numeric', year: 'numeric' })}`
}

/** WeekPicker (04 §2): the month grid with a leading week number; selection covers the whole row. */
export function WeekPicker({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, numbering = 'iso', locale, today, name, presentation, label, disabled, ...rest }: WeekPickerProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<IsoWeek | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const shown = derived(() => (v.value ? `Week ${+v.value.slice(6)}, ${v.value.slice(0, 4)}` : ''))
  let trigger: HTMLButtonElement | undefined
  return (
    <Composite
      {...rest}
      label={label}
      disabled={disabled}
      bound={v}
      filled={!!v.value}
      hold={pop.value}
      control={() => <><PickButton el={n => (trigger = n)} text={shown.value} label={v.value ? `${label}, ${shown.value}, ${weekName(v.value, env.locale.value)}` : `${label}, none`} open={pop.value} disabled={disabled} onToggle={() => pop.set(!pop.value)} /><Hidden name={name} value={() => v.value ?? ''} /></>}
      end={
        <Panel label="Choose a week" open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => <CalendarGrid mode="week" value={() => v.value} firstDayOfWeek={numbering === 'iso' ? 1 : undefined} weekNumbers locale={env.locale.value} today={env.today.value} autofocus onPick={(iso, r) => { v.set(weekOf(iso), r); pop.set(false) }} />}
        </Panel>
      }
    />
  )
}

export type Granularity = 'year' | 'quarter' | 'month' | 'week'
export type PeriodPickerProps = RichFieldProps & Bindable<string | null> & Openable & { granularity?: Granularity }

const granularityOf = (v: string | null | undefined): Granularity => (!v ? 'month' : /-W/.test(v) ? 'week' : /-Q/.test(v) ? 'quarter' : /-/.test(v) ? 'month' : 'year')

/** A period value in words (`Q4 2026`, `October 2026`, `Week 44, 2026`). */
function periodText(v: string, locale: string) {
  const g = granularityOf(v)
  return g === 'year' ? v : g === 'quarter' ? `Q${v.slice(-1)} ${v.slice(0, 4)}` : g === 'month' ? fmt(`${v}-01`, { month: 'long', year: 'numeric' }, locale) : `Week ${+v.slice(6)}, ${v.slice(0, 4)}`
}

function periodCells(g: Granularity, year: number, locale: string): Cell[] {
  if (g === 'year') { const b = Math.floor(year / 12) * 12; return Array.from({ length: 12 }, (_, i) => ({ v: `${b + i}`, text: `${b + i}`, name: `${b + i}` })) }
  if (g === 'quarter') return [1, 2, 3, 4].map(q => ({ v: `${year}-Q${q}`, text: `Q${q}`, name: `Q${q} ${year}, ${fmt(toIso(year, q * 3 - 2, 1), { month: 'short' }, locale)} to ${fmt(toIso(year, q * 3, 1), { month: 'short' }, locale)}` }))
  if (g === 'month') return monthCells(year, locale)
  const out: Cell[] = []
  let d = toIso(year, 1, 4) as string
  d = addDays(d, -((dow(d) + 6) % 7))
  for (let i = 0; i < 53; i++, d = addDays(d, 7)) {
    const w = isoWeek(d)
    if (w.year !== year) break
    out.push({ v: `${w.year}-W${pad(w.week)}`, text: `W${w.week}`, name: `Week ${w.week}, ${fmt(d, { month: 'short', day: 'numeric' }, locale)} to ${fmt(addDays(d, 6), { month: 'short', day: 'numeric', year: 'numeric' }, locale)}` })
  }
  return out
}

/** PeriodPicker (04 §2): one trigger, one grid whose granularity switches. Values: `2026`, `2026-Q4`, `2026-10`, `2026-W44`. */
export function PeriodPicker({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, granularity, locale, today, name, presentation, label, disabled, ...rest }: PeriodPickerProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<string | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const g = derived(() => granularity ?? granularityOf(v.value))
  const year = state(yearOf(untrack(() => v.value), untrack(() => env.today.value)))
  const shown = derived(() => (v.value ? periodText(v.value, env.locale.value) : ''))
  const span = derived(() => { const b = Math.floor(year.value / 12) * 12; return g.value === 'year' ? `${b}–${b + 11}` : String(year.value) })
  const current = derived(() => {
    const t = env.today.value
    const [y, m] = ymd(t)
    return { year: `${y}`, quarter: `${y}-Q${Math.ceil(m / 3)}`, month: t.slice(0, 7), week: weekOf(t as IsoDate) }[g.value]
  })
  let trigger: HTMLButtonElement | undefined
  return (
    <Composite
      {...rest}
      label={label}
      disabled={disabled}
      bound={v}
      filled={!!v.value}
      hold={pop.value}
      control={() => <><PickButton el={n => (trigger = n)} text={shown.value} label={`${label}, ${shown.value || 'none'}`} open={pop.value} disabled={disabled} onToggle={() => pop.set(!pop.value)} /><Hidden name={name} value={() => v.value ?? ''} /></>}
      end={
        <Panel label="Choose a period" open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => <PeriodGrid wide title={span.value} cells={periodCells(g.value, year.value, env.locale.value)} columns={g.value === 'quarter' ? 4 : g.value === 'week' ? 7 : 3} value={v.value} current={current.value} prev="Previous" next="Next" onPage={d => (year.value += d * (g.value === 'year' ? 12 : 1))} onPick={(x, r) => { v.set(x, r); pop.set(false) }} />}
        </Panel>
      }
    />
  )
}
