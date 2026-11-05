import { Grid } from '@weft-js/warp'
import { Box, EIGHT } from './shared'
import type { Gap } from './shared'

export const GridPlay = (p: {
  min?: 'xs' | 'sm' | 'md' | 'lg'
  cols?: 'any' | 2 | 3 | 4 | 6
  gap?: Gap
}) => (
  <Grid
    min={p.min}
    cols={p.cols === 'any' ? undefined : p.cols}
    gap={p.gap}
  >
    {EIGHT.map((n) => (
      <Box
        key={n}
        tall={64}
      >
        {n}
      </Box>
    ))}
  </Grid>
)
