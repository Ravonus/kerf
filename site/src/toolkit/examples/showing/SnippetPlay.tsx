import { Stack, Snippet } from '@kerf-js/veneer'

export const SnippetPlay = (p: {
  code: string
  prompt: string
}) => (
  <Stack>
    <Snippet
      code={p.code}
      prompt={p.prompt}
    />
  </Stack>
)
