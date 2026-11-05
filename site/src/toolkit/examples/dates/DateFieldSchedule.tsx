import { state } from '@weft-js/core'

import {
  Button,
  DateField,
  Row,
  Stack,
  Text,
  TimeField,
} from '@weft-js/warp'

import type { IsoDate, IsoTime } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export function DateFieldSchedule() {
  const date = state<IsoDate | null>('2026-11-05')
  const time = state<IsoTime | null>('14:00')
  const planned = state('')
  const plan = () =>
    (planned.value =
      `checkout goes out on ${date.value} ` +
      `at ${time.value}`)
  return (
    <Stack gap="group">
      <Text role="heading">Schedule a deploy</Text>
      <Row
        gap="related"
        wrap={false}
      >
        <DateField
          label="Date"
          today={TODAY}
          value={date}
          min={TODAY}
        />
        <TimeField
          label="Time"
          today={TODAY}
          value={time}
          step={30}
        />
      </Row>
      <Row
        gap="related"
        justify="between"
      >
        <Text
          subtle
          role="caption"
        >
          {planned.value || 'Nothing planned yet'}
        </Text>
        <Button
          aria-disabled={
            date.value && time.value ? undefined : 'true'
          }
          onClick={plan}
        >
          Schedule
        </Button>
      </Row>
    </Stack>
  )
}
