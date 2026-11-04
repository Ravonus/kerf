import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

export default function Replay() {
  const loaded = state(true)
  const replay = state(true)
  // What the inline capture script holds while the island's code is on its way.
  const held = state(0)
  const count = state(0)
  const lost = state(0)

  // Stands in for the island's code arriving: whatever was held runs now, in order.
  const arrive = () => {
    count.value += held.value
    held.value = 0
    loaded.value = true
  }
  const reload = () => {
    loaded.value = false
    count.value = 0
    lost.value = 0
    setTimeout(arrive, 2500)
  }
  const click = () => {
    if (loaded.value) count.value++
    else if (replay.value) held.value++
    else lost.value++
  }

  return (
    <Card title="A click before the code arrives">
      <p>
        Island code:{' '}
        <Badge tone={loaded.value ? 'positive' : 'caution'}>
          {loaded.value ? 'running' : 'still loading'}
        </Badge>
      </p>
      <Button onClick={click}>Add to cart ({count.value})</Button>
      <p>
        {held.value > 0 && `Held for replay: ${held.value}. `}
        {lost.value > 0 && `Lost: ${lost.value}.`}
      </p>
      <Button size="sm" tone="neutral" disabled={!loaded.value} onClick={reload}>
        Load the page again
      </Button>{' '}
      <Button
        size="sm"
        emphasis="ghost"
        tone="neutral"
        onClick={() => (replay.value = !replay.value)}
      >
        {replay.value ? 'Turn replay off' : 'Turn replay on'}
      </Button>
    </Card>
  )
}
