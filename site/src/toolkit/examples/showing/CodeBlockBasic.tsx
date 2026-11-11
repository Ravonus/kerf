import { CodeBlock } from '@kerf/veneer'
import { CONFIG } from './code-data'

export const CodeBlockBasic = () => (
  <CodeBlock
    code={CONFIG}
    language="ts"
  />
)
