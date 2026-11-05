import { Stack, Text } from '@weft-js/warp'

/** One state in a States grid: its name, then the field. */
export const Cell = (p: { name: string; children?: unknown }) => (
  <Stack gap="tight">
    <Text role="caption" subtle>
      {p.name}
    </Text>
    {p.children}
  </Stack>
)
