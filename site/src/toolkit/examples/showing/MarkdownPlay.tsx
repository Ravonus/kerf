import { Markdown } from '@kerf/veneer'

export const MarkdownPlay = (p: { source: string }) => (
  <Markdown source={p.source} />
)
