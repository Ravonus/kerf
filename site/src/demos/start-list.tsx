import { Card } from '@weft-js/warp'

const MENU = [
  { id: 'espresso', name: 'Espresso', price: 3, vegan: true },
  { id: 'latte', name: 'Latte', price: 4.5, vegan: false },
  { id: 'oat-latte', name: 'Oat latte', price: 5, vegan: true },
  { id: 'mocha', name: 'Mocha', price: 5, vegan: false },
]

export default function Menu() {
  return (
    <Card title="Menu">
      <ul>
        {MENU.map((item) => (
          <li
            key={item.id}
            style={{ color: item.vegan ? 'var(--warp-color-positive-text)' : undefined }}
          >
            {item.name}, ${item.price.toFixed(2)}
            {item.vegan && ' (vegan)'}
          </li>
        ))}
      </ul>
    </Card>
  )
}
