import { Input, Stack } from '@kerf-js/veneer'

export const FieldError = () => (
  <Stack gap="group">
    <Input
      label="Project name"
      hint="Lowercase letters and dashes."
      defaultValue="storefront"
    />
    <Input
      label="Project name"
      hint="Lowercase letters and dashes."
      defaultValue="Store Front"
      error="That name has a space in it."
    />
  </Stack>
)
