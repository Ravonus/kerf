import '@kerf-js/veneer-core/styles/rich/monthgrid.css'
import '@kerf-js/veneer-core/styles/rich/gap-rows.css'
import type { RichFieldProps, Bindable, Openable } from '../Picker'
import type { IsoMonth } from '@kerf-js/veneer-core'
import { Composite, Panel } from '../Picker'
import { state, untrack, derived } from '@kerf-js/core'
import { yearOf, PickerControl, PeriodGrid, monthCells, pickerBindings } from './shared'
import { fmt } from '@kerf-js/veneer-core'

/** Props for MonthPicker. */
export type MonthPickerProps = RichFieldProps &
  Bindable<IsoMonth | null> &
  Openable & { min?: IsoMonth | undefined; max?: IsoMonth | undefined }

/** MonthPicker (04 §2): a 3×4 grid of the locale's short month names with year arrows. */
export function MonthPicker({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  locale,
  today,
  name,
  presentation,
  label,
  disabled,
  ...rest
}: MonthPickerProps) {
  const { env, v, pop } = pickerBindings<IsoMonth | null>({
    value: () => value,
    initial: () => defaultValue,
    changed: () => onValueChange,
    open: () => open,
    defaultOpen: () => defaultOpen,
    onOpenChange: () => onOpenChange,
    locale: () => locale,
    today: () => today,
    fallback: null,
  })
  const year = state(
    yearOf(
      untrack(() => v.value),
      untrack(() => env.today.value),
    ),
  )
  const shown = derived(() =>
    v.value ? fmt(`${v.value}-01`, { month: 'long', year: 'numeric' }, env.locale.value) : '',
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
        <MonthPanel
          env={env}
          v={v}
          pop={pop}
          year={year}
          trigger={() => trigger!}
          presentation={presentation}
        />
      }
    />
  )
}

function MonthPanel({
  env,
  v,
  pop,
  year,
  trigger,
  presentation,
}: ReturnType<typeof pickerBindings<IsoMonth | null>> & {
  year: { value: number }
  trigger: () => HTMLButtonElement
  presentation: RichFieldProps['presentation']
}) {
  return (
    <Panel label="Choose a month" open={pop} trigger={trigger} presentation={presentation}>
      {() => (
        <PeriodGrid
          title={String(year.value)}
          cells={monthCells(year.value, env.locale.value)}
          columns={3}
          value={v.value}
          current={env.today.value.slice(0, 7)}
          prev="Previous year"
          next="Next year"
          onPage={(d) => (year.value += d)}
          onPick={(x, r) => {
            v.set(x as IsoMonth, r)
            pop.set(false)
          }}
        />
      )}
    </Panel>
  )
}
