import { Split, Stack } from '@weft-js/warp'
import { Box } from './shared'

export const SplitSides = () => (
  <Stack gap="related">
    <Split
      width="nav"
      gap="related"
    >
      <Box tall={72}>Side, at the start</Box>
      <Box tall={72}>Main</Box>
    </Split>
    <Split
      width="nav"
      side="end"
      gap="related"
    >
      <Box tall={72}>Main</Box>
      <Box tall={72}>Side, at the end</Box>
    </Split>
  </Stack>
)
