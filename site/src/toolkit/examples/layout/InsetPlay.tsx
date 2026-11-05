import { Inset } from '@weft-js/warp'
import { Box } from './shared'

export const InsetPlay = (p: {
  pad?: 'group' | 'section'
}) => (
  <div style="inline-size:min(100%,420px)">
    <Inset pad={p.pad}>
      <Box>The sunken area is the Inset</Box>
    </Inset>
  </div>
)
