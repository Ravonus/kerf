import '@weft-js/warp-core/styles/rich/monthgrid.css'
import '@weft-js/warp-core/styles/rich/gap-rows.css'
import type { RichFieldProps, Bindable, Openable } from '../Picker'
import { fmt, toIso, addDays, dow, isoWeek, pad, ymd, weekOf } from '@weft-js/warp-core'
import type { Cell } from './shared'
import { monthCells, yearOf, PickerControl, PeriodGrid, pickerBindings } from './shared'
import { Composite, Panel } from '../Picker'
import { derived, state, untrack } from '@weft-js/core'

export type Granularity = 'year' | 'quarter' | 'month' | 'week'

/** Props for PeriodPicker. */
export type PeriodPickerProps = RichFieldProps &
  Bindable<string | null> &
  Openable & { granularity?: Granularity }

const granularityOf = (v: string | null | undefined): Granularity =>
  !v ? 'month' : /-W/.test(v) ? 'week' : /-Q/.test(v) ? 'quarter' : /-/.test(v) ? 'month' : 'year'

/** A period value in words (`Q4 2026`, `October 2026`, `Week 44, 2026`). */
function periodText(v: string, locale: string) {
  const g = granularityOf(v)
  return g === 'year'
    ? v
    : g === 'quarter'
      ? `Q${v.slice(-1)} ${v.slice(0, 4)}`
      : g === 'month'
        ? fmt(`${v}-01`, { month: 'long', year: 'numeric' }, locale)
        : `Week ${+v.slice(6)}, ${v.slice(0, 4)}`
}

function periodCells(g: Granularity, year: number, locale: string): Cell[] {
  if (g === 'year') {
    const b = Math.floor(year / 12) * 12
    return Array.from({ length: 12 }, (_, i) => ({
      v: `${b + i}`,
      text: `${b + i}`,
      name: `${b + i}`,
    }))
  }
  if (g === 'quarter')
    return [1, 2, 3, 4].map((q) => ({
      v: `${year}-Q${q}`,
      text: `Q${q}`,
      name: `Q${q} ${year}, ${fmt(toIso(year, q * 3 - 2, 1), { month: 'short' }, locale)} to ${fmt(toIso(year, q * 3, 1), { month: 'short' }, locale)}`,
    }))
  if (g === 'month') return monthCells(year, locale)
  const out: Cell[] = []
  let d = toIso(year, 1, 4) as string
  d = addDays(d, -((dow(d) + 6) % 7))
  for (let i = 0; i < 53; i++, d = addDays(d, 7)) {
    const w = isoWeek(d)
    if (w.year !== year) break
    out.push({
      v: `${w.year}-W${pad(w.week)}`,
      text: `W${w.week}`,
      name: `Week ${w.week}, ${fmt(d, { month: 'short', day: 'numeric' }, locale)} to ${fmt(addDays(d, 6), { month: 'short', day: 'numeric', year: 'numeric' }, locale)}`,
    })
  }
  return out
}

/** PeriodPicker (04 §2): one trigger, one grid whose granularity switches. Values: `2026`, `2026-Q4`, `2026-10`, `2026-W44`. */
export function PeriodPicker({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  granularity,
  locale,
  today,
  name,
  presentation,
  label,
  disabled,
  ...rest
}: PeriodPickerProps) {
  const { env, v, pop } = pickerBindings<string | null>(
    () => value,
    () => defaultValue,
    () => onValueChange,
    () => open,
    () => defaultOpen,
    () => onOpenChange,
    () => locale,
    () => today,
    null,
  )
  const g = derived(() => granularity ?? granularityOf(v.value))
  const year = state(
    yearOf(
      untrack(() => v.value),
      untrack(() => env.today.value),
    ),
  )
  const shown = derived(() => (v.value ? periodText(v.value, env.locale.value) : ''))
  const span = derived(() => {
    const b = Math.floor(year.value / 12) * 12
    return g.value === 'year' ? `${b}–${b + 11}` : String(year.value)
  })
  const current = periodCurrent(
    () => env.today.value,
    () => g.value,
  )

  let trigger: HTMLButtonElement | undefined
  return (
    <Composite
      {...rest}
      label={label}
      disabled={disabled}
      bound={v}
      filled={!!v.value}
      hold={pop.value}
      control={() => (
        <PickerControl
          el={(n) => (trigger = n)}
          value={v}
          pop={pop}
          text={shown.value}
          label={`${label}, ${shown.value || 'none'}`}
          disabled={disabled}
          name={name}
        />
      )}
      end={
        <PeriodPanel
          env={env}
          v={v}
          pop={pop}
          year={year}
          g={g}
          span={span}
          current={current}
          trigger={() => trigger!}
          presentation={presentation}
        />
      }
    />
  )
}

function periodCurrent(today: () => string, granularity: () => Granularity) {
  return derived(() => {
    const t = today()
    const [y, m] = ymd(t)
    return {
      year: `${y}`,
      quarter: `${y}-Q${Math.ceil(m / 3)}`,
      month: t.slice(0, 7),
      week: weekOf(t),
    }[granularity()]
  })
}

function PeriodPanel({
  env,
  v,
  pop,
  year,
  trigger,
  presentation,
  g,
  span,
  current,
}: ReturnType<typeof pickerBindings<string | null>> & {
  year: { value: number }
  trigger: () => HTMLButtonElement
  presentation: RichFieldProps['presentation']
  g: { readonly value: Granularity }
  span: { readonly value: string }
  current: { readonly value: string }
}) {
  return (
    <Panel label="Choose a period" open={pop} trigger={trigger} presentation={presentation}>
      {() => (
        <PeriodGrid
          wide
          title={span.value}
          cells={periodCells(g.value, year.value, env.locale.value)}
          columns={g.value === 'quarter' ? 4 : g.value === 'week' ? 7 : 3}
          value={v.value}
          current={current.value}
          prev="Previous"
          next="Next"
          onPage={(d) => (year.value += d * (g.value === 'year' ? 12 : 1))}
          onPick={(x, r) => {
            v.set(x, r)
            pop.set(false)
          }}
        />
      )}
    </Panel>
  )
}
