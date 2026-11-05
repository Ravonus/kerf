import { state } from '@weft-js/core'
import { Badge, PaginationBar, Row, Stack, Text } from '@weft-js/warp'
import { PROJECTS, TONE_OF } from '../../world'

export function PaginationBarList() {
  const page = state(1)
  const size = state(4)
  const rows = () => PROJECTS.slice((page.value - 1) * size.value, page.value * size.value)
  return (
    <Stack gap="group">
      <Stack gap="related" divided>
        {rows().map((p) => (
          <Row key={p.id} justify="between" gap="group">
            <Stack gap="hair">
              <Text>{p.name}</Text>
              <Text role="caption" subtle>
                {p.owner}, {p.region}
              </Text>
            </Stack>
            <Badge tone={TONE_OF[p.status]} dot>
              {p.status}
            </Badge>
          </Row>
        ))}
      </Stack>
      <PaginationBar
        label="Projects"
        page={page}
        size={size}
        sizes={[4, 6, 10]}
        total={PROJECTS.length}
      />
    </Stack>
  )
}
