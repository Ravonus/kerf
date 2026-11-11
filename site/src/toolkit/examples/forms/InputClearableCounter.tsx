import { Input, Stack } from '@kerf-js/veneer'

export const InputClearableCounter = () => (
  <Stack gap="group">
    <Input
      label="Branch"
      clearable
      defaultValue="ranking-v2"
    />
    <Input
      label="Commit message"
      counter={72}
      defaultValue="Rank exact matches first"
    />
  </Stack>
)
