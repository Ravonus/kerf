import '@weft-js/warp-core/styles/rich/monthgrid.css'
import '@weft-js/warp-core/styles/rich/gap-rows.css'
import type { RichFieldProps, Bindable, Openable } from '../Picker'
import type { IsoWeek } from '@weft-js/warp-core'
import { isoWeekStart, fmtRange, addDays, weekOf } from '@weft-js/warp-core'
import { Composite, Panel } from '../Picker'
import { derived } from '@weft-js/core'
import { PickerControl, pickerBindings } from './shared'
import { CalendarGrid } from '../Calendar'

/** WeekPicker's props: a field whose value is an ISO week, or null. */
export type WeekPickerProps = RichFieldProps &
  Bindable<IsoWeek | null> &
  Openable & {
    /** The day each grid row starts on: `iso` (the default) starts on Monday, so a row is one ISO 8601 week; `locale` starts on the locale's first day of the week. The value is an ISO week either way. */
    numbering?: 'iso' | 'locale'
  }

const weekName = (w: string, locale: string) => {
  const s = isoWeekStart(w)
  return `Week ${+w.slice(6)}, ${fmtRange(s, addDays(s, 6), locale, { month: 'long', day: 'numeric', year: 'numeric' })}`
}

/** WeekPicker (04 §2): the month grid with a leading week number; selection covers the whole row. */
export function WeekPicker({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  numbering = 'iso',
  locale,
  today,
  name,
  presentation,
  label,
  disabled,
  ...rest
}: WeekPickerProps) {
  const { env, v, pop } = pickerBindings<IsoWeek | null>(
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
      control={() => (
        <PickerControl
          el={(n) => (trigger = n)}
          value={v}
          pop={pop}
          text={shown.value}
          label={
            v.value
              ? `${label}, ${shown.value}, ${weekName(v.value, env.locale.value)}`
              : `${label}, none`
          }
          disabled={disabled}
          name={name}
        />
      )}
      end={
        <Panel
          label="Choose a week"
          open={pop}
          trigger={() => trigger!}
          presentation={presentation}
        >
          {() => (
            <CalendarGrid
              mode="week"
              value={() => v.value}
              firstDayOfWeek={numbering === 'iso' ? 1 : undefined}
              weekNumbers
              locale={env.locale.value}
              today={env.today.value}
              autofocus
              onPick={(iso, r) => {
                v.set(weekOf(iso), r)
                pop.set(false)
              }}
            />
          )}
        </Panel>
      }
    />
  )
}
