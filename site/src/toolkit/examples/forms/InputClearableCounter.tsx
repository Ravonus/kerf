import { Input, Stack } from '@weft-js/warp'

export const InputClearableCounter = () => (
  <Stack gap="group">
    <Input label="Branch" clearable defaultValue="ranking-v2" />
    <Input label="Commit message" counter={72} defaultValue="Rank exact matches first" />
  </Stack>
)
