import { CodeBlock } from '@weft-js/warp'

export const CodeBlockWrap = () => (
  <CodeBlock
    wrap
    language="sh"
    code={
      'weft deploy --project storefront ' +
      '--region eu-west --region us-east ' +
      "--message 'Cache product images at the edge' " +
      '--wait'
    }
  />
)
