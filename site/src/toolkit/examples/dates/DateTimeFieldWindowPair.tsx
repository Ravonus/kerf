import { state } from '@weft-js/core'

import { DateTimeField, Stack, Text } from '@weft-js/warp'

import type { IsoDateTime } from '@weft-js/warp'

import {
  TODAY,
  minutesBetween,
  lasting,
} from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

/** A window has a start and an end: the end is
 * checked against the start as either changes. */
export function DateTimeFieldWindowPair() {
  const from = state<IsoDateTime | null>(
    '2026-11-07T22:00',
  )
  const to = state<IsoDateTime | null>('2026-11-08T01:30')
  const span = () =>
    from.value && to.value
      ? minutesBetween(from.value, to.value)
      : null
  return (
    <Stack gap="group">
      <Text role="heading">Maintenance window</Text>
      <DateTimeField
        label="Starts"
        today={TODAY}
        value={from}
        min={TODAY}
        step={15}
      />
      <DateTimeField
        label="Ends"
        today={TODAY}
        value={to}
        min={TODAY}
        step={15}
        error={
          (span() ?? 1) <= 0
            ? 'End after it starts.'
            : undefined
        }
      />
      <Text
        subtle
        role="caption"
      >
        {span() === null
          ? 'Pick both ends.'
          : (span() ?? 0) > 0
            ? 'Checkout is read-only for ' +
              `${lasting(span()!)}.`
            : 'The window is empty.'}
      </Text>
    </Stack>
  )
}
