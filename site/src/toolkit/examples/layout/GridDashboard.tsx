import {
  Card,
  Grid,
  Progress,
  Stack,
  Text,
} from '@weft-js/warp'
import { REGIONS } from '../../world'
import { STATS } from './shared'

export const GridDashboard = () => (
  <Grid
    min="xs"
    cols={4}
    gap="related"
  >
    {STATS.map((s) => (
      <Card key={s.label}>
        <Stack gap="hair">
          <Text
            role="label"
            subtle
          >
            {s.label}
          </Text>
          <Text role="title">{s.value}</Text>
          <Text
            role="caption"
            tone={s.good ? 'positive' : 'caution'}
          >
            {s.delta} on September
          </Text>
        </Stack>
      </Card>
    ))}
    <Card
      data-span="full"
      title="Traffic by region"
    >
      <Grid
        min="sm"
        gap="related"
      >
        {REGIONS.map((r) => (
          <Progress
            key={r.region}
            label={r.region}
            value={r.share}
          />
        ))}
      </Grid>
    </Card>
  </Grid>
)
