import { state } from '@kerf/core'
import {
  ActivityFeed,
  Button,
  Row,
  Stack,
} from '@kerf/veneer'
import { ACTIVITY } from '../../world'

export function ActivityFeedProject() {
  const items = state(ACTIVITY)
  const add = () =>
    (items.value = [
      {
        id: `new-${items.value.length}`,
        actor: 'Jun Tanaka',
        verb: 'deployed',
        object: 'edge-cache',
        time: 'Now',
        day: 'Today',
      },
      ...items.value,
    ])
  return (
    <Stack gap="related">
      <ActivityFeed
        items={items}
        live="live"
        title="Project activity"
      />
      <Row>
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          onClick={add}
        >
          Add a deploy
        </Button>
      </Row>
    </Stack>
  )
}
