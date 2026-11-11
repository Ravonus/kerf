import { state } from '@kerf/core'

import {
  ConversationList,
  Stack,
  Text,
} from '@kerf/veneer'

import { CONVERSATIONS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function ConversationListInbox() {
  const open = state('incidents')
  const name = () =>
    CONVERSATIONS.find((c) => c.id === open.value)!.name
  return (
    <Stack gap="related">
      <ConversationList
        title={<Text role="label">Messages</Text>}
        items={CONVERSATIONS}
        value={open}
      />
      <Text subtle>Open: {name()}</Text>
    </Stack>
  )
}
