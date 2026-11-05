import { Cover } from '@weft-js/warp'
import { Box, FILL } from './shared'

export const CoverFill = () => (
  <div style={FILL}>
    <Cover min="fill">
      <Box data-part="center">min="fill" takes its parent's height</Box>
    </Cover>
  </div>
)
