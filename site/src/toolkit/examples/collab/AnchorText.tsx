import { state } from '@kerf-js/core'

import { CommentAnchor, Stack, Text } from '@kerf-js/veneer'

import { wait as _Shared0 } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export function CommentAnchorText() {
  const active = state<string | null>(null)
  return (
    <Stack gap="related">
      <Text>
        The cache keeps a page for{' '}
        <CommentAnchor
          thread="c-timeouts"
          active={active}
        >
          60 seconds
        </CommentAnchor>{' '}
        after a deploy.
      </Text>
      <Text subtle>
        {active.value
          ? 'The thread is active.'
          : 'Press the highlighted words.'}
      </Text>
    </Stack>
  )
}
