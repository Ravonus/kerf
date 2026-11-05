import { CodeBlock } from '@weft-js/warp'
import { SAMPLE } from './code-data'

export const CodeBlockJson = () => (
  <CodeBlock language="json" filename="deploy.json" code={SAMPLE} />
)
