import { defineState, derived, state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

// One scope of shared state. Any component can import it; it is set up the first time something reads it.
const basket = defineState('learn-basket', () => {
  const items = state<string[]>([])
  const count = derived(() => items.value.length)
  return { items, count, add: (name: string) => (items.value = [...items.value, name]) }
})

function Header() {
  return (
    <p>
      Basket <Badge count>{basket.count.value}</Badge>
    </p>
  )
}

function Shelf() {
  return (
    <p>
      <Button size="sm" onClick={() => basket.add('Tea')}>
        Add tea
      </Button>
      <Button size="sm" emphasis="outline" onClick={() => basket.add('Cake')}>
        Add cake
      </Button>
    </p>
  )
}

export default function Shop() {
  return (
    <Card title="Two components, one basket">
      <Header />
      <Shelf />
      <p>{basket.items.value.join(', ') || 'Nothing yet'}</p>
    </Card>
  )
}
