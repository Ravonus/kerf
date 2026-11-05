import { Input, Stack } from '@weft-js/warp'

export const InputAffixes = () => (
  <Stack gap="group">
    <Input label="Domain" prefix="https://" suffix=".weft.dev" defaultValue="storefront" />
    <Input
      label="Monthly budget"
      prefix="€"
      suffix="per month"
      inputmode="numeric"
      defaultValue="1,240"
    />
  </Stack>
)
