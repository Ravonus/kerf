import { Text, Code } from '@weft-js/warp'

export const CodePlay = (p: { children: string }) => (
  <Text>
    Run <Code>{p.children}</Code> to start.
  </Text>
)
