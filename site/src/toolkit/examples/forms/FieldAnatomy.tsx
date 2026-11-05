import { Input, Stack } from '@weft-js/warp'

export const FieldAnatomy = () => (
  <Stack gap="group">
    <Input
      label="Domain"
      icon="globe"
      prefix="https://"
      suffix=".weft.dev"
      hint="You can add your own later."
      defaultValue="storefront"
      clearable
    />
    <Input
      label="Release name"
      hint="Shown in the deploy list."
      counter={40}
      defaultValue="Autumn sale"
    />
  </Stack>
)
