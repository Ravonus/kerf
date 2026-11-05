import { state } from '@weft-js/core'

import { DurationField, Stack, Text } from '@weft-js/warp'

import type { IsoDuration } from '@weft-js/warp'

import { TODAY as _Shared0 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- DurationField

export function DurationFieldTimeout() {
  const timeout = state<IsoDuration | null>('PT1H30M')
  return (
    <Stack gap="related">
      <DurationField label="Build timeout" value={timeout} />
      <Text subtle role="caption">
        Saved as {timeout.value ?? 'nothing'}
      </Text>
    </Stack>
  )
}
