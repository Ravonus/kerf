import { Markdown } from '@kerf-js/veneer'

export const MarkdownPlay = (p: { source: string }) => (
  <Markdown source={p.source} />
)
