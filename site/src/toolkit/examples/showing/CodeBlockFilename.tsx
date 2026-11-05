import { CodeBlock } from '@weft-js/warp'
import { CONFIG } from './code-data'

export const CodeBlockFilename = () => (
  <CodeBlock code={CONFIG} language="ts" filename="weft.config.ts" />
)
