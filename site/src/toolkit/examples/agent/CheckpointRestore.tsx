import { state } from '@kerf-js/core'
import { Checkpoint, Stack, Text } from '@kerf-js/veneer'

export function CheckpointRestore() {
  const restored = state(false)
  return (
    <Stack gap="related">
      <Text>
        Lowered <code>attempts</code> to 2.
      </Text>
      <Checkpoint
        label="Before the retry change"
        onRestore={() => (restored.value = true)}
      />
      {restored.value ? (
        <Text subtle>
          Restored. The chat continues on a new branch
          from here.
        </Text>
      ) : (
        <Text>
          Redeployed <code>mobile-bff</code>.
        </Text>
      )}
    </Stack>
  )
}
