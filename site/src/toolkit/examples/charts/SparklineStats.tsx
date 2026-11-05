import {
  Card,
  Grid,
  Sparkline,
  Stack,
  Text,
} from '@weft-js/warp'

import { PULSES } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export const SparklineStats = () => (
  <Grid
    min="sm"
    cols={3}
    gap="related"
  >
    {PULSES.map(({ name, value, values, format }) => (
      <Card key={name}>
        <Stack
          gap="related"
          role="img"
          aria-label={
            `${name}: ${value}, ` +
            'rising over 12 months'
          }
        >
          <Text
            role="label"
            subtle
          >
            {name}
          </Text>
          <Text role="heading">{value}</Text>
          <Sparkline
            values={values}
            format={format}
          />
        </Stack>
      </Card>
    ))}
  </Grid>
)
