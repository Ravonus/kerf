import { state } from '@weft-js/core'
import { Bell, Button, Row } from '@weft-js/warp'

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
