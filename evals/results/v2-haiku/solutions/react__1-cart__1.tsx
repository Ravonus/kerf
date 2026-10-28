import { useState } from 'react'

type Item = { id: string; name: string; price: number }

export function Cart({ items }: { items: Item[] }) {
  // Quantities and removals are keyed by item id so they survive the parent's
  // periodic re-fetch, even when the order of items changes.
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())

  const visible = items.filter(item => !removed.has(item.id))
  const qtyOf = (id: string) => quantities[id] ?? 1

  const increase = (id: string) =>
    setQuantities(q => ({ ...q, [id]: (q[id] ?? 1) + 1 }))

  const decrease = (id: string) => {
    const current = quantities[id] ?? 1
    if (current <= 1) {
      setRemoved(r => new Set(r).add(id))
    } else {
      setQuantities(q => ({ ...q, [id]: (q[id] ?? 1) - 1 }))
    }
  }

  const total = visible.reduce((sum, item) => sum + item.price * qtyOf(item.id), 0)

  return (
    <div>
      <ul aria-label="Cart">
        {visible.map(item => {
          const qty = qtyOf(item.id)
          return (
            <li key={item.id}>
              <span data-testid="name">{item.name}</span>{' '}
              <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => decrease(item.id)}>
                -
              </button>
              <span data-testid="qty">{qty}</span>
              <button type="button" aria-label={`Increase ${item.name}`} onClick={() => increase(item.id)}>
                +
              </button>{' '}
              <span data-testid="line">${(item.price * qty).toFixed(2)}</span>
            </li>
          )
        })}
      </ul>
      <p data-testid="total">Total: ${total.toFixed(2)}</p>
    </div>
  )
}
