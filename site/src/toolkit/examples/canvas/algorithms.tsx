import { Grid, Stack, Dither, Text } from '@kerf-js/veneer'
import { SOFT } from './paint-primitives'

export const ALGORITHMS = [
  'bayer2',
  'bayer8',
  'blue',
  'halftone',
  'floyd',
  'atkinson',
] as const

export const DitherAlgorithms = () => (
  <Grid
    min="sm"
    cols={3}
    gap="related"
  >
    {ALGORITHMS.map((algorithm) => (
      <Stack
        key={algorithm}
        gap="tight"
      >
        <Dither
          gradient={SOFT}
          algorithm={algorithm}
          ratio="16 / 10"
        />
        <Text
          subtle
          role="caption"
        >
          {algorithm}
        </Text>
      </Stack>
    ))}
  </Grid>
)
