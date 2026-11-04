import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

const FRUIT = ['apple', 'pear', 'plum']

export default function Stock() {
  const stock = state<Record<string, number>>({ apple: 3, pear: 0, plum: 7 })
  const restock = (fruit: string) =>
    stock.set((d) => {
      d[fruit] = (d[fruit] ?? 0) + 1
    })
  return (
    <Card title="Stock">
      {FRUIT.map((f) => (
        <p key={f}>
          {f}: {stock.get(f)}{' '}
          <Button size="sm" emphasis="ghost" onClick={() => restock(f)}>
            +1
          </Button>
        </p>
      ))}
    </Card>
  )
}
