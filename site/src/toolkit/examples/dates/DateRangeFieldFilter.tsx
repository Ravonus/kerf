import { state } from '@weft-js/core'

import {
  DateRangeField,
  Row,
  Stack,
  Text,
} from '@weft-js/warp'

import type { DateRange } from '@weft-js/warp'

import { DEPLOYS } from '../../world'

import { TODAY } from './shared-event'

export function DateRangeFieldFilter() {
  const range = state<DateRange>({
    start: '2026-10-31',
    end: '2026-10-31',
  })
  const shown = () =>
    DEPLOYS.filter(
      (d) =>
        d.at.slice(0, 10) >= (range.value.start ?? '') &&
        d.at.slice(0, 10) <= (range.value.end ?? '9999'),
    )
  return (
    <Stack gap="group">
      <DateRangeField
        label="Deploys between"
        today={TODAY}
        value={range}
        months={1}
        max={TODAY}
      />
      <Text role="label">{shown().length} deploys</Text>
      <Stack
        gap="related"
        divided
      >
        {shown().map((d) => (
          <Row
            key={d.id}
            gap="related"
            justify="between"
          >
            <Text>{d.project}</Text>
            <Text
              subtle
              role="caption"
            >
              {d.at.slice(5).replace('T', ' at ')}
            </Text>
          </Row>
        ))}
      </Stack>
    </Stack>
  )
}
