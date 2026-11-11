import { CodeBlock } from '@kerf/veneer'
import { CONFIG } from './code-data'

export const CodeBlockLines = () => (
  <CodeBlock
    code={CONFIG}
    language="ts"
    lines
  />
)
