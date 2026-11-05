import { Stack, Snippet } from '@weft-js/warp'

export const SnippetPlay = (p: { code: string; prompt: string }) => (
  <Stack>
    <Snippet code={p.code} prompt={p.prompt} />
  </Stack>
)
