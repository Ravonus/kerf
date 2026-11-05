import { Grid, DitherField } from '@weft-js/warp'

export const KINDS = ['weave', 'flow', 'rings', 'aurora', 'drift'] as const

export const stripes = (x: number, y: number, t: number) => Math.sin((x + y) * 9 + t) / 2 + 0.5

export const DitherFieldKinds = () => (
  <Grid min="sm" cols={3} gap="related">
    {KINDS.map((kind) => (
      <DitherField key={kind} kind={kind} ratio="16 / 10" />
    ))}
    <DitherField kind={stripes} ratio="16 / 10" />
  </Grid>
)
