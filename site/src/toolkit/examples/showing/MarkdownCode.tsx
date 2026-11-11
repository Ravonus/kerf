import { Markdown } from '@kerf-js/veneer'
import { SNIPPET } from './markdown-data'

export const MarkdownCode = () => (
  <Markdown source={SNIPPET} />
)
