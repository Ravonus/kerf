import { CodeBlock } from '@kerf-js/veneer'
import { CONFIG } from './code-data'

export const CodeBlockFilename = () => (
  <CodeBlock
    code={CONFIG}
    language="ts"
    filename="kerf.config.ts"
  />
)
