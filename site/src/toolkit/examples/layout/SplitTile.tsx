import { Split } from '@weft-js/warp'
import { Box } from './shared'

export const SplitTile = () => (
  <Split
    width="rail"
    gap="related"
    style="grid-template-columns:30% minmax(0,1fr)"
  >
    <Box tall={140}>Side</Box>
    <Box tall={140}>Main</Box>
  </Split>
)
