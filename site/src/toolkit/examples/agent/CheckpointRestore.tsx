import { state } from '@weft-js/core'
import { Checkpoint, Stack, Text } from '@weft-js/warp'

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
