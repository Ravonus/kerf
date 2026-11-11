import { state } from '@kerf/core'
import { Row, Stack, Text, Toggle } from '@kerf/veneer'

export function ToggleWatch() {
  const watching = state(false)
  return (
    <Row
      justify="between"
      gap="group"
    >
      <Stack gap="hair">
        <Text role="heading">storefront</Text>
        <Text subtle>
          {watching.value
            ? 'You get a note on every deploy.'
            : 'No notes from this project.'}
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
