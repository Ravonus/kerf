import { Markdown } from '@weft-js/warp'
import { SNIPPET } from './markdown-data'

export const MarkdownCode = () => (
  <Markdown source={SNIPPET} />
)
