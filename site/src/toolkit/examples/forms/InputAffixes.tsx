import { Input, Stack } from '@kerf/veneer'

export const InputAffixes = () => (
  <Stack gap="group">
    <Input
      label="Domain"
      prefix="https://"
      suffix=".kerf.dev"
      defaultValue="storefront"
    />
    <Input
      label="Monthly budget"
      prefix="€"
      suffix="per month"
      inputmode="numeric"
      defaultValue="1,240"
    />
  </Stack>
)
