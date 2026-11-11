import { state } from '@kerf-js/core'
import { Stack, TagsInput, Text } from '@kerf-js/veneer'

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
