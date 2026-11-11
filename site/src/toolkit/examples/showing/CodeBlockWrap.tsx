import { CodeBlock } from '@kerf/veneer'

export const CodeBlockWrap = () => (
  <CodeBlock
    wrap
    language="sh"
    code={
      'kerf deploy --project storefront ' +
      '--region eu-west --region us-east ' +
      "--message 'Cache product images at the edge' " +
      '--wait'
    }
  />
)
