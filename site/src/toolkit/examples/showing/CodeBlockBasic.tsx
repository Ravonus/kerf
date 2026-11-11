import { CodeBlock } from '@kerf-js/veneer'
import { CONFIG } from './code-data'

export const CodeBlockBasic = () => (
  <CodeBlock
    code={CONFIG}
    language="ts"
  />
)
