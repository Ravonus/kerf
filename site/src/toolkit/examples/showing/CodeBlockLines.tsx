import { CodeBlock } from '@weft-js/warp'
import { CONFIG } from './code-data'

export const CodeBlockLines = () => (
  <CodeBlock
    code={CONFIG}
    language="ts"
    lines
  />
)
