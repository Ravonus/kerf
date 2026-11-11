import { state } from '@kerf/core'

import { Message, Stack } from '@kerf/veneer'

import { CHAT } from '../../world'

import { FAILED } from './shared-wait'

export function MessageKinds() {
  const retried = state(false)
  return (
    <Stack gap="related">
      <Message message={CHAT[1]!} />
      <Message
        message={CHAT[5]!}
        source={CHAT[1]}
      />
      <Message message={CHAT[7]!} />
      <Message
        message={
          retried.value
            ? { ...FAILED, state: 'sent' }
            : FAILED
        }
        last
        onRetry={() => (retried.value = true)}
      />
    </Stack>
  )
}
