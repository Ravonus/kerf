import { state } from '@weft-js/core'
import { Stack, TagsInput, Text } from '@weft-js/warp'

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
