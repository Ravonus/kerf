import { Badge, Row, Stack, Text } from '@weft-js/warp'
import { DEPLOYS, TONE_OF } from '../../world'

export const StackDeployLog = () => (
  <Stack
    divided
    gap="related"
  >
    {DEPLOYS.slice(0, 4).map((d) => (
      <Row
        key={d.id}
        justify="between"
        gap="related"
      >
        <Stack gap="hair">
          <Text>{d.message}</Text>
          <Text
            role="caption"
            subtle
          >
            {d.project} · {d.author}
          </Text>
        </Stack>
        <Badge
          tone={TONE_OF[d.status as keyof typeof TONE_OF]}
          dot
        >
          {d.status}
        </Badge>
      </Row>
    ))}
  </Stack>
)
