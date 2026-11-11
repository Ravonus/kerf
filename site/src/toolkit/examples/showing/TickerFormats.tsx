import { state } from '@kerf-js/core'
import {
  Stack,
  Row,
  Text,
  Ticker,
  Button,
} from '@kerf-js/veneer'

export function TickerFormats() {
  const k = state(0)
  const roll = () => (k.value = k.value ? 0 : 1)
  return (
    <Stack
      gap="related"
      align="center"
    >
      <Row gap="section">
        <Text role="heading">
          <Ticker
            value={k.value ? 8930 : 8560}
            locale="en-US"
            format={{
              style: 'currency',
              currency: 'USD',
            }}
          />
        </Text>
        <Text role="heading">
          <Ticker
            value={k.value ? 0.9998 : 0.9942}
            locale="en-US"
            format={{
              style: 'percent',
              maximumFractionDigits: 2,
            }}
          />
        </Text>
        <Text role="heading">
          <Ticker
            value={k.value ? 86100000 : 79300000}
            locale="en-US"
            format={{ notation: 'compact' }}
          />
        </Text>
      </Row>
      <Button
        size="sm"
        emphasis="ghost"
        tone="neutral"
        onClick={roll}
      >
        Change the numbers
      </Button>
    </Stack>
  )
}
