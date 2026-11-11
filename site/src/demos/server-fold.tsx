import { state } from '@kerf-js/core'
import { interval } from '@kerf-js/core/browser'
import { Button, Card } from '@kerf-js/veneer'

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA']
type Price = { symbol: string; price: number }
type Prices = Record<string, Price>

// Pass this as the prices fold option and start
// with an empty object for initial.
const fold = (acc: Prices, m: Price): Prices => ({
  ...acc,
  [m.symbol]: m,
})

export default function FoldDemo() {
  const running = state(true)
  const latest = state<Price | undefined>(undefined)
  const board = state<Prices>({})
  // Stands in for the server's topic, which pushes: a
  // message every 700 ms. Real page code never sets a
  // timer for this.
  interval(700, () => {
    if (!running.value) return
    const symbol =
      SYMBOLS[
        Math.floor(Math.random() * SYMBOLS.length)
      ] ?? 'AAPL'
    const m = {
      symbol,
      price:
        Math.round(10_000 + Math.random() * 5000) / 100,
    }
    latest.value = m
    board.value = fold(board.value, m)
  })
  return (
    <Card title="One stream, read two ways">
      <p>
        Without <code>fold</code>:{' '}
        {latest.value
          ? `${latest.value.symbol} ${latest.value.price}`
          : 'waiting…'}
      </p>
      <p>
        With <code>fold</code>:
      </p>
      <ul>
        {Object.values(board.value).map((p) => (
          <li key={p.symbol}>
            {p.symbol}: {p.price}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        tone="neutral"
        onClick={() => (running.value = !running.value)}
      >
        {running.value ? 'Pause the stream' : 'Resume'}
      </Button>
    </Card>
  )
}
