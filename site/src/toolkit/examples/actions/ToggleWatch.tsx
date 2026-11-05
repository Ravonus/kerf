import { state } from '@weft-js/core'
import { Row, Stack, Text, Toggle } from '@weft-js/warp'

export function ToggleWatch() {
  const watching = state(false)
  return (
    <Row justify="between" gap="group">
      <Stack gap="hair">
        <Text role="heading">storefront</Text>
        <Text subtle>
          {watching.value ? 'You get a note on every deploy.' : 'No notes from this project.'}
        </Text>
      </Stack>
      <Toggle
        size="sm"
        icon="bell"
        pressed={watching.value}
        onClick={() => (watching.value = !watching.value)}
      >
        Watch
      </Toggle>
    </Row>
  )
}
