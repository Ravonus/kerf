import { CodeBlock } from '@weft-js/warp'
import { CONFIG } from './code-data'

export const CodeBlockPlay = (p: {
  filename: string
  lines: boolean
  wrap: boolean
  language: string
}) => (
  <CodeBlock
    code={CONFIG}
    filename={p.filename || undefined}
    lines={p.lines}
    wrap={p.wrap}
    language={p.language}
  />
)
