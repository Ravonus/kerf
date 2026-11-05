import { state } from '@weft-js/core'
import { Badge, Row, Stack, Tabs, Text } from '@weft-js/warp'
import { PROJECTS, TONE_OF } from '../../world'
import { FILTERS } from './shared'

export function TabsFilterList() {
  const status = state('All')
  return (
    <Tabs
      label="Status"
      variant="pill"
      value={status.value}
      onChange={(v) => (status.value = v)}
      options={FILTERS}
    >
      {(v) => (
        <Stack gap="tight">
          {PROJECTS.filter((p) => v === 'All' || p.status === v)
            .slice(0, 5)
            .map((p) => (
              <Row key={p.id} justify="between">
                <Text>{p.name}</Text>
                <Badge tone={TONE_OF[p.status]} dot>
                  {p.status}
                </Badge>
              </Row>
            ))}
        </Stack>
      )}
    </Tabs>
  )
}
