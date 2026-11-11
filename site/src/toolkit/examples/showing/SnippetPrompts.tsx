import { Stack, Snippet } from '@kerf/veneer'

export const SnippetPrompts = () => (
  <Stack gap="related">
    <Snippet code="kerf deploy" />
    <Snippet
      prompt="#"
      code="systemctl restart kerf-agent"
    />
    <Snippet
      prompt=""
      code="https://storefront.kerf.app"
    />
  </Stack>
)
