import { state } from '@weft-js/core'
import { Prompt, Stack, Text } from '@weft-js/warp'

export function PromptBusy() {
  const busy = state(true)
  const queue = state<string[]>([])
  return (
    <Stack gap="related">
      <Text role="caption" subtle>
        {busy.value ? 'Running. Messages wait in line.' : 'Stopped.'} {queue.value.length} queued.
      </Text>
      <Prompt
        busy={busy.value}
        tools={[]}
        onStop={() => (busy.value = false)}
        onSubmit={() => (busy.value = true)}
        onQueue={(text) => (queue.value = [...queue.value, text])}
      />
    </Stack>
  )
}
