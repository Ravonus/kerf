import {
  Card,
  Frame,
  Grid,
  Stack,
  Text,
} from '@weft-js/warp'
import { DEPLOYS } from '../../world'
import { art } from './shared'

export const FramePreviews = () => (
  <Grid
    min="sm"
    cols={3}
    gap="related"
  >
    {DEPLOYS.slice(0, 3).map((d, n) => (
      <Card key={d.id}>
        <Stack gap="related">
          <Frame ratio="16:9">
            {art(String(n + 1), String(n + 4))}
          </Frame>
          <Stack gap="hair">
            <Text role="heading">{d.project}</Text>
            <Text
              role="caption"
              subtle
            >
              {d.message}
            </Text>
          </Stack>
        </Stack>
      </Card>
    ))}
  </Grid>
)
