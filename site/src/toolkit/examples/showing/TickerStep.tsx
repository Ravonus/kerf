import { state } from '@kerf-js/core'
import {
  Row,
  Text,
  Ticker,
  Button,
} from '@kerf-js/veneer'

export function TickerStep() {
  const n = state(412)
  return (
    <Row gap="related">
      <Text role="title">
        <Ticker
          value={n.value}
          locale="en-US"
        />
      </Text>
      <Button
        size="sm"
        emphasis="outline"
        tone="neutral"
        onClick={() => (n.value += 1)}
      >
        Deploy
      </Button>
      <Button
        size="sm"
        emphasis="outline"
        tone="neutral"
        onClick={() => (n.value += 88)}
      >
        Add 88
      </Button>
    </Row>
  )
}
