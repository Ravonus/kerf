import { Grid } from '@kerf-js/veneer'
import { Box, SIX } from './shared'

export const GridTile = () => (
  <Grid
    cols={3}
    min="xs"
    gap="related"
  >
    {SIX.map((n) => (
      <Box
        key={n}
        tall={64}
      >
        {n}
      </Box>
    ))}
  </Grid>
)
