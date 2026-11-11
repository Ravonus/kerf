import { Grid, DitherField } from '@kerf/veneer'

export const TONES = [
  'accent',
  'neutral',
  'positive',
  'caution',
  'info',
  'highlight',
] as const

export const DitherFieldRamps = () => (
  <Grid
    min="sm"
    cols={3}
    gap="related"
  >
    {TONES.map((ramp) => (
      <DitherField
        key={ramp}
        ramp={ramp}
        ratio="16 / 10"
      />
    ))}
  </Grid>
)
