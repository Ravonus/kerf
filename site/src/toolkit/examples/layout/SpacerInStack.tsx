import { Inset, Spacer, Stack } from '@kerf/veneer'
import { Box } from './shared'

export const SpacerInStack = () => (
  <Inset>
    <Stack
      gap="tight"
      style="block-size:200px"
    >
      <Box>Top</Box>
      <Spacer />
      <Box>Pushed to the bottom</Box>
    </Stack>
  </Inset>
)
