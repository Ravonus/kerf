import { Stack } from '@weft-js/warp'
import { Box } from './shared'

export const StackTile = () => (
  <Stack gap="related">
    {['One', 'Two', 'Three'].map((n) => (
      <Box key={n}>{n}</Box>
    ))}
  </Stack>
)
