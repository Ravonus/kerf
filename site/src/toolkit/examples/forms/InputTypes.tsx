import { Input, Stack } from '@kerf/veneer'

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
      placeholder="https://github.com/kerf/storefront"
      icon="link"
    />
  </Stack>
)
