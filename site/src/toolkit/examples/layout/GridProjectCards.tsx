import { Badge, Card, Grid, Row, Stack, Text } from '@weft-js/warp'
import { PROJECTS, TONE_OF } from '../../world'

export const GridProjectCards = () => (
  <Grid min="sm" cols={3} gap="related">
    {PROJECTS.slice(0, 6).map((p) => (
      <Card key={p.id}>
        <Stack gap="tight">
          <Row justify="between" gap="tight">
            <Text role="heading">{p.name}</Text>
            <Badge tone={TONE_OF[p.status]} dot>
              {p.status}
            </Badge>
          </Row>
          <Text subtle>{p.owner}</Text>
          <Text role="caption" subtle>
            {p.region} · {p.deploys} deploys · {p.latency} ms
          </Text>
        </Stack>
      </Card>
    ))}
  </Grid>
)
