import { state } from '@weft-js/core'

import { Row, Stack, Text, TimeField } from '@weft-js/warp'

import type { IsoTime } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- TimeField

export function TimeFieldQuietHours() {
  const from = state<IsoTime | null>('22:00')
  const to = state<IsoTime | null>('07:30')
  return (
    <Stack gap="related">
      <Row gap="related" wrap={false}>
        <TimeField label="Quiet from" today={TODAY} value={from} step={30} />
        <TimeField label="Until" today={TODAY} value={to} step={30} />
      </Row>
      <Text subtle role="caption">
        No alerts from {from.value ?? '…'} to {to.value ?? '…'}, except failed deploys.
      </Text>
    </Stack>
  )
}
