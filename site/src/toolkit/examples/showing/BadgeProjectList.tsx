import { Stack, Row, Text, Badge } from '@weft-js/warp'
import { PROJECTS, TONE_OF } from '../../world'

export const BadgeProjectList = () => (
  <Stack gap="related" divided>
    {PROJECTS.slice(2, 7).map((p) => (
      <Row key={p.id} justify="between" gap="group">
        <Stack gap="hair">
          <Text>{p.name}</Text>
          <Text role="caption" subtle>
            {p.owner}
          </Text>
        </Stack>
        <Badge tone={TONE_OF[p.status]} dot>
          {p.status}
        </Badge>
      </Row>
    ))}
  </Stack>
)
