import { CodeBlock } from '@kerf/veneer'
import { CONFIG } from './code-data'

export const CodeBlockFilename = () => (
  <CodeBlock
    code={CONFIG}
    language="ts"
    filename="kerf.config.ts"
  />
)
