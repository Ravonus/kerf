import { Grid } from '@kerf-js/veneer'
import { Box, FOUR } from './shared'

export const GridSpan = () => (
  <Grid
    min="xs"
    cols={4}
    gap="related"
  >
    <Box data-span="full">data-span="full"</Box>
    {FOUR.map((n) => (
      <Box
        key={n}
        tall={72}
      >
        {n}
      </Box>
    ))}
    <Box data-span="full">data-span="full"</Box>
  </Grid>
)
