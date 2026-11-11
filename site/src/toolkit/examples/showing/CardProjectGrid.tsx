import {
  Grid,
  Card,
  Row,
  Text,
  Badge,
} from '@kerf-js/veneer'
import { PROJECTS, TONE_OF } from '../../world'

export const CardProjectGrid = () => (
  <Grid
    min="md"
    gap="related"
  >
    {PROJECTS.slice(0, 6).map((p) => (
      <Card
        key={p.id}
        href="/toolkit/card"
        eyebrow={p.region}
        title={p.name}
      >
        <Row justify="between">
          <Text
            role="caption"
            subtle
          >
            {p.deploys} deploys
          </Text>
          <Badge
            tone={TONE_OF[p.status]}
            dot
          >
            {p.status}
          </Badge>
        </Row>
      </Card>
    ))}
  </Grid>
)
