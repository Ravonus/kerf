import { state } from '@kerf-js/core'
import { ModelPicker, Stack, Text } from '@kerf-js/veneer'
import { MODELS } from '../../world'

export function ModelPickerChoose() {
  const model = state('swift')
  return (
    <Stack
      gap="related"
      align="center"
    >
      <ModelPicker
        models={MODELS}
        value={model}
      />
      <Text
        role="caption"
        subtle
      >
        Answers will use{' '}
        {MODELS.find((m) => m.id === model.value)?.name}
      </Text>
    </Stack>
  )
}
