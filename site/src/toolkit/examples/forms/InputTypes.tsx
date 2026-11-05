import { Input, Stack } from '@weft-js/warp'

export const InputTypes = () => (
  <Stack gap="group">
    <Input
      label="Work email"
      type="email"
      autocomplete="email"
      icon="mail"
    />
    <Input
      label="Password"
      type="password"
      autocomplete="new-password"
      icon="lock"
    />
    <Input
      label="Repository"
      type="url"
      placeholder="https://github.com/weft/storefront"
      icon="link"
    />
  </Stack>
)
