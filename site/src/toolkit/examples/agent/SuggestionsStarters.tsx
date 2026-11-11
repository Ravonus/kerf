import { state } from '@kerf/core'
import { Stack, Suggestions, Text } from '@kerf/veneer'
import type { Suggestion } from '@kerf/veneer'
import { STARTERS } from './shared'

export function SuggestionsStarters() {
  const picked = state<Suggestion | null>(null)
  return (
    <Stack gap="related">
      <Suggestions
        items={STARTERS}
        onPick={(s) => (picked.value = s)}
      />
      <Text
        role="caption"
        subtle
      >
        {picked.value
          ? `Sends: ${picked.value.title}`
          : 'Pick one to send it.'}
      </Text>
    </Stack>
  )
}
