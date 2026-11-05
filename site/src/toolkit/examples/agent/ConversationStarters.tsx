import { state } from '@weft-js/core'
import { Conversation, Prompt, Stack, Suggestions, Text, UserMessage } from '@weft-js/warp'
import { COMMANDS } from '../../world'
import { STARTERS } from './shared'

export function ConversationStarters() {
  const asked = state('')
  return (
    <div style="block-size:440px">
      <Conversation
        title="New chat"
        prompt={
          <Prompt tools={['slash']} commands={COMMANDS} onSubmit={(text) => (asked.value = text)} />
        }
      >
        {asked.value ? (
          <UserMessage text={asked.value} arrive />
        ) : (
          <Stack gap="group">
            <Text role="heading">What do you need?</Text>
            <Suggestions items={STARTERS} onPick={(s) => (asked.value = s.title)} />
          </Stack>
        )}
      </Conversation>
    </div>
  )
}
