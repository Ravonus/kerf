import { Card, Grid, Sparkline, Stack, Text } from '@weft-js/warp'

import { PULSES } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const SparklineStats = () => (
  <Grid min="sm" cols={3} gap="related">
    {PULSES.map((p) => (
      <Card key={p.name}>
        <Stack gap="related" role="img" aria-label={`${p.name}: ${p.value}, rising over 12 months`}>
          <Text role="label" subtle>
            {p.name}
          </Text>
          <Text role="heading">{p.value}</Text>
          <Sparkline values={p.values} format={p.format} />
        </Stack>
      </Card>
    ))}
  </Grid>
)
