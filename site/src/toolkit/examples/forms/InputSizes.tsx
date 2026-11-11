import { Input, Stack } from '@kerf-js/veneer'

export const InputSizes = () => (
  <Stack gap="group">
    <Input
      label="Project name"
      size="sm"
    />
    <Input label="Project name" />
    <Input
      label="Project name"
      size="lg"
    />
  </Stack>
)
