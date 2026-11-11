import { Center, Stack } from '@kerf/veneer'
import { Box, MAXES } from './shared'

export const CenterWidths = () => (
  <Stack gap="related">
    {MAXES.map((max) => (
      <Center
        key={max}
        max={max}
      >
        <Box>max="{max}"</Box>
      </Center>
    ))}
  </Stack>
)
