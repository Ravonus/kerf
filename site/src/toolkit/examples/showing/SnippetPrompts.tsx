import { Stack, Snippet } from '@weft-js/warp'

export const SnippetPrompts = () => (
  <Stack gap="related">
    <Snippet code="weft deploy" />
    <Snippet prompt="#" code="systemctl restart weft-agent" />
    <Snippet prompt="" code="https://storefront.weft.app" />
  </Stack>
)
