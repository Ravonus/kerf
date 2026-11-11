import { Stack, Text } from '@kerf-js/veneer'

export const TextTones = () => (
  <Stack gap="tight">
    <Text tone="accent">Deployed two minutes ago.</Text>
    <Text tone="positive">Deployed two minutes ago.</Text>
    <Text tone="caution">Deployed two minutes ago.</Text>
    <Text tone="critical">Deployed two minutes ago.</Text>
  </Stack>
)
