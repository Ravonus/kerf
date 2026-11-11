import { AlertIcon, PlusIcon, XIcon } from '@kerf-js/veneer-icons'
import { rangeIssues, type WeekDay } from '@kerf-js/veneer-core'
import { derived } from '@kerf-js/core'
import { Button } from '../Button'
import { Switch } from '../Choice'
import { Select } from '../Select'
import type { TimeEdit } from './AvailabilityEditor-actions'

type DayProps = {
  day: WeekDay
  id: string
  name: string
  options: { value: string; label: string }[]
  onToggle: (on: boolean) => void
  onTime: (edit: TimeEdit) => void
  onAdd: (d: number) => void
  onRemove: (d: number, at: number) => void
}

export function Day({ day, id, name, options, onToggle, onTime, onAdd, onRemove }: DayProps) {
  const rows = dayRows(() => day)
  return (
    <li data-part="day" data-day-of={day.day}>
      <Switch
        checked={day.on}
        onChange={(e: Event) => onToggle((e.currentTarget as HTMLInputElement).checked)}
      >
        {name}
      </Switch>
      <div data-part="ranges">
        {day.on ? (
          rows.value.map((x) => (
            <div
              key={x.k}
              data-part="range"
              data-invalid={x.error ? '' : undefined}
              role="group"
              aria-label={`${name}, range ${x.at + 1}`}
            >
              <Select
                label="From"
                size="sm"
                options={options}
                value={String(x.r[0])}
                aria-invalid={x.error ? 'true' : undefined}
                aria-describedby={x.error ? `${id}-${x.k}-e` : undefined}
                hold={!!x.error}
                onChange={(e: Event) => changeTime({ e, onTime, day: day.day, at: x.at, side: 0 })}
              />
              <Select
                label="To"
                size="sm"
                options={options}
                value={String(x.r[1])}
                aria-invalid={x.error ? 'true' : undefined}
                aria-describedby={x.error ? `${id}-${x.k}-e` : undefined}
                hold={!!x.error}
                onChange={(e: Event) => changeTime({ e, onTime, day: day.day, at: x.at, side: 1 })}
              />
              {day.ranges.length > 1 && (
                <Button
                  emphasis="ghost"
                  tone="neutral"
                  size="sm"
                  icon={XIcon}
                  label={`Remove ${name} range ${x.at + 1}`}
                  onClick={() => onRemove(day.day, x.at)}
                />
              )}
              {x.at === day.ranges.length - 1 && (
                <Button
                  emphasis="ghost"
                  tone="neutral"
                  size="sm"
                  label={`Add a range on ${name}`}
                  data-icon-only=""
                  data-add={day.day}
                  onClick={() => onAdd(day.day)}
                >
                  <PlusIcon />
                </Button>
              )}
              {x.error && (
                <span data-part="error" id={`${id}-${x.k}-e`}>
                  <AlertIcon /> {x.error}
                </span>
              )}
            </div>
          ))
        ) : (
          <span data-part="off">Unavailable</span>
        )}
      </div>
    </li>
  )
}

function dayRows(day: () => WeekDay) {
  const issues = derived(() => rangeIssues(day().ranges))
  return derived(() =>
    day().ranges.map((r, at) => ({ r, at, k: `${day().day}-${at}`, error: issues.value[at] })),
  )
}

function changeTime({
  e,
  onTime,
  day,
  at,
  side,
}: {
  e: Event
  onTime: DayProps['onTime']
  day: number
  at: number
  side: 0 | 1
}) {
  onTime({ day, at, side, v: +(e.currentTarget as HTMLInputElement).value })
}
