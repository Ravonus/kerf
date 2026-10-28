import { useState } from 'react'

type Item = { id: string; name: string; price: number }

export function Cart({ items }: { items: Item[] }) {
  // Quantities keyed by id; missing = 1, 0 = removed. Items/prices come from props.
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const qtyOf = (id: string) => qtys[id] ?? 1
  const visible = items.filter(item => qtyOf(item.id) > 0)
  const total = visible.reduce((sum, item) => sum + item.price * qtyOf(item.id), 0)
  const change = (id: string, delta: number) =>
    setQtys(prev => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 1) + delta) }))
  return (
    <div>
      <ul aria-label="Cart">
        {visible.map(item => (
          <li key={item.id}>
            <span data-testid="name">{item.name}</span>{' '}
            <button aria-label={`Decrease ${item.name}`} onClick={() => change(item.id, -1)}>-</button>
            <span data-testid="qty">{qtyOf(item.id)}</span>
            <button aria-label={`Increase ${item.name}`} onClick={() => change(item.id, 1)}>+</button>{' '}
            <span data-testid="line">${(item.price * qtyOf(item.id)).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p data-testid="total">Total: ${total.toFixed(2)}</p>
    </div>
  )
}
