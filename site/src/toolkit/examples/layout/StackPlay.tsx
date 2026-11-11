import { Stack } from '@kerf/veneer'
import { Box } from './shared'
import type { Gap } from './shared'

export const StackPlay = (p: {
  gap?: Gap
  align?: 'start' | 'center' | 'end'
  divided?: boolean
}) => (
  <Stack
    gap={p.gap}
    align={
      p.align === ('stretch' as string)
        ? undefined
        : p.align
    }
    divided={p.divided}
    style="inline-size:min(100%,320px)"
  >
    <Box>First</Box>
    <Box>Second</Box>
    <Box>Third</Box>
  </Stack>
)
