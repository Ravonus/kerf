import { Stack, Text, Snippet } from '@weft-js/warp'

export const SnippetGetStarted = () => (
  <Stack gap="group">
    <Stack gap="tight">
      <Text role="label">1. Install the CLI</Text>
      <Snippet code="npm install -g weft" />
    </Stack>
    <Stack gap="tight">
      <Text role="label">2. Sign in</Text>
      <Snippet code="weft login" />
    </Stack>
    <Stack gap="tight">
      <Text role="label">3. Ship it</Text>
      <Snippet code="weft deploy" />
    </Stack>
  </Stack>
)
