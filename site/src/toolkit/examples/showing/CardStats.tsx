import { Grid, Card, Text } from '@weft-js/warp'

export const CardStats = () => (
  <Grid min="xs" gap="related">
    <Card eyebrow="Requests" title="86.1M">
      <Text role="caption" tone="positive">
        Up 8.6% on September
      </Text>
    </Card>
    <Card eyebrow="Errors" title="0.22%">
      <Text role="caption" tone="positive">
        Down from 0.36%
      </Text>
    </Card>
    <Card eyebrow="Deploys" title="167">
      <Text role="caption" subtle>
        About 5 a day
      </Text>
    </Card>
    <Card eyebrow="Spend" title="$8,930">
      <Text role="caption" subtle>
        Up $370
      </Text>
    </Card>
  </Grid>
)
