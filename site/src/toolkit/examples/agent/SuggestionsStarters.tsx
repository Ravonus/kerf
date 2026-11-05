import { state } from '@weft-js/core'
import { Stack, Suggestions, Text } from '@weft-js/warp'
import type { Suggestion } from '@weft-js/warp'
import { STARTERS } from './shared'

export function SuggestionsStarters() {
  const picked = state<Suggestion | null>(null)
  return (
    <Stack gap="related">
      <Suggestions items={STARTERS} onPick={(s) => (picked.value = s)} />
      <Text role="caption" subtle>
        {picked.value ? `Sends: ${picked.value.title}` : 'Pick one to send it.'}
      </Text>
    </Stack>
  )
}
