import { state } from '@kerf/core'
import type { Space } from '@kerf/core/ds'
import {
  Card,
  Heading,
  Row,
  Segmented,
  Stack,
  Tag,
  Text,
} from '@kerf/veneer'

const GAPS: { value: Space; label: string }[] = [
  { value: 'tight', label: 'tight' },
  { value: 'related', label: 'related' },
  { value: 'group', label: 'group' },
  { value: 'section', label: 'section' },
]

export default function Scale() {
  const gap = state<Space>('related')
  return (
    <Card title="Steps, not pixels">
      <Segmented
        label="Gap"
        value={gap.value}
        options={GAPS}
        onChange={(next) => (gap.value = next)}
      />
      <Stack gap={gap.value}>
        <Heading level={3}>Roasts</Heading>
        <Text subtle>
          Each role sets a size, weight and leading from
          the theme.
        </Text>
        <Row
          gap={gap.value}
          wrap
        >
          <Tag>Light</Tag>
          <Tag>Medium</Tag>
          <Tag>Dark</Tag>
        </Row>
        <Text
          role="caption"
          faint
        >
          Prices include shipping.
        </Text>
      </Stack>
    </Card>
  )
}
