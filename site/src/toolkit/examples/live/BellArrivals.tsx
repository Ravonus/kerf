import { state } from '@kerf-js/core'
import { Bell, Button, Row } from '@kerf-js/veneer'

export function BellArrivals() {
  const count = state(3)
  return (
    <Row gap="related">
      <Bell
        count={count}
        onOpen={() => (count.value = 0)}
      />
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        onClick={() => count.value++}
      >
        A deploy failed
      </Button>
    </Row>
  )
}
