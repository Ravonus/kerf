import { Stack, Text, Snippet } from '@kerf-js/veneer'

export const SnippetGetStarted = () => (
  <Stack gap="group">
    <Stack gap="tight">
      <Text role="label">1. Install the CLI</Text>
      <Snippet code="npm install -g kerf" />
    </Stack>
    <Stack gap="tight">
      <Text role="label">2. Sign in</Text>
      <Snippet code="kerf login" />
    </Stack>
    <Stack gap="tight">
      <Text role="label">3. Ship it</Text>
      <Snippet code="kerf deploy" />
    </Stack>
  </Stack>
)
