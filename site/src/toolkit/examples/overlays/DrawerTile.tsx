import { state } from '@kerf-js/core'
import {
  Badge,
  Drawer,
  Row,
  Stack,
  Text,
} from '@kerf-js/veneer'
import {
  DEPLOYS,
  TONE_OF,
  type Status,
} from '../../world'

export function DrawerTile() {
  const open = state(true)
  const d = DEPLOYS[0]!
  return (
    <div
      style={
        'display:flex;' +
        'justify-content:flex-end;min-inline-size:0'
      }
    >
      <Drawer
        inline
        open={open}
        side="right"
        title={d.message}
        description={`${d.project}, ${d.id}`}
      >
        <Stack gap="related">
          <Row justify="between">
            <Text subtle>Status</Text>
            <Badge
              tone={TONE_OF[d.status as Status]}
              dot
            >
              {d.status}
            </Badge>
          </Row>
          <Row justify="between">
            <Text subtle>Author</Text>
            <Text>{d.author}</Text>
          </Row>
          <Row justify="between">
            <Text subtle>Branch</Text>
            <Text>{d.branch}</Text>
          </Row>
        </Stack>
      </Drawer>
    </div>
  )
}
