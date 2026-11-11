import { Text, Code } from '@kerf-js/veneer'

export const CodePlay = (p: { children: string }) => (
  <Text>
    Run <Code>{p.children}</Code> to start.
  </Text>
)
