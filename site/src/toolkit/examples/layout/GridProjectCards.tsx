import {
  Badge,
  Card,
  Grid,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { PROJECTS, TONE_OF } from '../../world'

export const GridProjectCards = () => (
  <Grid
    min="sm"
    cols={3}
    gap="related"
  >
    {PROJECTS.slice(0, 6).map(
      ({
        id,
        name,
        status,
        owner,
        region,
        deploys,
        latency,
      }) => (
        <Card key={id}>
          <Stack gap="tight">
            <Row
              justify="between"
              gap="tight"
            >
              <Text role="heading">{name}</Text>
              <Badge
                tone={TONE_OF[status]}
                dot
              >
                {status}
              </Badge>
            </Row>
            <Text subtle>{owner}</Text>
            <Text
              role="caption"
              subtle
            >
              {region} · {deploys} deploys · {latency} ms
            </Text>
          </Stack>
        </Card>
      ),
    )}
  </Grid>
)
