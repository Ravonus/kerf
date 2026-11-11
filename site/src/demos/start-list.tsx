import { Card } from '@kerf-js/veneer'

const MENU = [
  {
    id: 'espresso',
    name: 'Espresso',
    price: 3,
    vegan: true,
  },
  {
    id: 'latte',
    name: 'Latte',
    price: 4.5,
    vegan: false,
  },
  {
    id: 'oat-latte',
    name: 'Oat latte',
    price: 5,
    vegan: true,
  },
  { id: 'mocha', name: 'Mocha', price: 5, vegan: false },
]

export default function Menu() {
  return (
    <Card title="Menu">
      <ul>
        {MENU.map(({ id, name, price, vegan }) => (
          <li
            key={id}
            style={{
              color: vegan
                ? 'var(--veneer-color-positive-text)'
                : undefined,
            }}
          >
            {name}, ${price.toFixed(2)}
            {vegan && ' (vegan)'}
          </li>
        ))}
      </ul>
    </Card>
  )
}
