import { Stack } from '@kerf-js/veneer'
import { Box } from './shared'

export const StackTile = () => (
  <Stack gap="related">
    {['One', 'Two', 'Three'].map((n) => (
      <Box key={n}>{n}</Box>
    ))}
  </Stack>
)
