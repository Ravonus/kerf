import { derived, state } from '@kerf/core'
import {
  CompactSelect,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'
import { PROJECTS } from '../../world'
import { PAGE_SIZES } from './shared'

export function CompactSelectRows() {
  const size = state<string | null>('5')
  const rows = derived(() =>
    PROJECTS.slice(0, Number(size.value)),
  )
  return (
    <Stack gap="group">
      <Stack gap="tight">
        {rows.value.map((p) => (
          <Row
            key={p.id}
            justify="between"
          >
            <Text>{p.name}</Text>
            <Text subtle>{p.owner}</Text>
          </Row>
        ))}
      </Stack>
      <Row justify="between">
        <Text subtle>
          {rows.value.length} of {PROJECTS.length}
        </Text>
        <CompactSelect
          label="Rows per page"
          options={PAGE_SIZES}
          value={size}
        />
      </Row>
    </Stack>
  )
}
