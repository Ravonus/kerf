import { Stack } from '@weft-js/warp'
import { Box } from './shared'

export const StackDivided = () => (
  <Stack divided gap="related">
    <div>
      <Box>One</Box>
    </div>
    <div>
      <Box>Two</Box>
    </div>
    <div>
      <Box>Three</Box>
    </div>
  </Stack>
)
