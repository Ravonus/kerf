import { state } from '@kerf/core'
import { Stack, TagsInput, Text } from '@kerf/veneer'

export function TagsInputLabels() {
  const labels = state(['production', 'eu-west'])
  return (
    <Stack gap="related">
      <TagsInput
        label="Project labels"
        value={labels}
      />
      <Text subtle>
        {labels.value.length} labels on storefront.
      </Text>
    </Stack>
  )
}
