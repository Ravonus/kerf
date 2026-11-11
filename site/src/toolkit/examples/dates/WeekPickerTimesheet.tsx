import { state } from '@kerf-js/core'

import {
  Row,
  Stack,
  Text,
  WeekPicker,
} from '@kerf-js/veneer'

import type { IsoWeek } from '@kerf-js/veneer'

import {
  TODAY,
  mondayOf,
  DAYS,
  HOURS,
} from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

/** A timesheet: the week picks the dates, and each
 * day's hours sit beside them. */
export function WeekPickerTimesheet() {
  const week = state<IsoWeek | null>('2026-W44')
  const day = (i: number) =>
    new Date(
      mondayOf(week.value!).getTime() + i * 86400000,
    )
      .toISOString()
      .slice(5, 10)
  return (
    <Stack gap="group">
      <WeekPicker
        label="Timesheet week"
        today={TODAY}
        value={week}
      />
      {week.value ? (
        <Stack
          gap="tight"
          divided
        >
          {DAYS.map((d, i) => (
            <Row
              key={d}
              justify="between"
            >
              <Text>
                {d} {day(i)}
              </Text>
              <Text subtle>{HOURS[i]} h</Text>
            </Row>
          ))}
          <Row justify="between">
            <Text role="label">Total</Text>
            <Text role="label">
              {HOURS.reduce((a, b) => a + b, 0)} h
            </Text>
          </Row>
        </Stack>
      ) : (
        <Text subtle>
          Pick a week to fill in its hours.
        </Text>
      )}
    </Stack>
  )
}
