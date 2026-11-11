import { Split } from '@kerf/veneer'
import { Box } from './shared'
import type { Gap } from './shared'

export const SplitPlay = (p: {
  width?: string
  side?: 'start' | 'end'
  gap?: Gap
  at?: 'tablet' | 'desktop'
}) => (
  <Split
    width={
      p.width === 'aside' ? undefined : (p.width as 'nav')
    }
    side={p.side}
    gap={p.gap}
    at={p.at}
  >
    <Box tall={140}>Side</Box>
    <Box tall={140}>Main</Box>
  </Split>
)
