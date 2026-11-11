import { state } from '@kerf-js/core'

import {
  Card,
  PeriodPicker,
  Stack,
  Text,
} from '@kerf-js/veneer'

import { TODAY, usd, REVENUE } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

/** A report's header: one control changes how long
 * the period is, and the figures follow. */
export function PeriodPickerRevenue() {
  const period = state<string | null>('2026-Q3')
  const total = () =>
    period.value ? REVENUE[period.value] : undefined
  return (
    <Stack gap="group">
      <PeriodPicker
        label="Revenue for"
        today={TODAY}
        value={period}
      />
      <Card>
        <Stack gap="tight">
          <Text
            role="label"
            subtle
          >
            Revenue, {period.value ?? 'no period'}
          </Text>
          <Text role="heading">
            {total() === undefined
              ? 'No figures yet'
              : usd(total()!)}
          </Text>
          <Text
            role="caption"
            subtle
          >
            Try 2026, 2026-Q1 to Q4, or September and
            October.
          </Text>
        </Stack>
      </Card>
    </Stack>
  )
}
