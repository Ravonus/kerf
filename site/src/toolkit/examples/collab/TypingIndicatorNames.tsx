import { Stack, TypingIndicator } from '@weft-js/warp'

import { wait as _Shared0 } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export const TypingIndicatorNames = () => (
  <Stack gap="related">
    <TypingIndicator text="Sam is typing…" />
    <TypingIndicator text="Sam and Jun are typing…" />
  </Stack>
)
