import { state } from '@kerf/core'
import { Text } from '@kerf/core/text'
import { Button, Card } from '@kerf/veneer'
import '@kerf/veneer/skeleton'

const QUOTES = [
  'The best way to predict the future is to invent it.',
  'Simple things should be simple, ' +
    'complex things should be possible.',
  'Make it work, make it right, make it fast.',
]

export default function Quote() {
  const quote = state('')
  let n = 0
  const load = () => {
    quote.value = ''
    // Stands in for a request that answers after 900 ms.
    setTimeout(
      () =>
        (quote.value = QUOTES[n++ % QUOTES.length] ?? ''),
      900,
    )
  }
  return (
    <Card title="Text that holds its place">
      {/* While there's no text, `reserve` keeps room
          for about 60 characters so the button below
          doesn't jump. */}
      <Text reserve={60}>{quote.value}</Text>
      <Button
        size="sm"
        onClick={load}
      >
        Load a quote
      </Button>
    </Card>
  )
}
