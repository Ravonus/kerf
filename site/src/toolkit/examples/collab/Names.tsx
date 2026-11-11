import { Stack, TypingIndicator } from '@kerf/veneer'

import { wait as _Shared0 } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export const TypingIndicatorNames = () => (
  <Stack gap="related">
    <TypingIndicator text="Sam is typing…" />
    <TypingIndicator text="Sam and Jun are typing…" />
  </Stack>
)
